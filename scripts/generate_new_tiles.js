// 새로 추가된 영토만 타일로 변환 (기존 타일 유지)
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function generateNewTiles() {
    const MONGODB_URI = process.env.MONGO_URI;
    if (!MONGODB_URI) {
        console.error('❌ MONGO_URI 환경 변수가 설정되지 않았습니다.');
        return;
    }
    
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        const tilesCollection = db.collection('territory_tiles');
        
        // 🔍 새로 추가된 영토만 조회
        const newTerritoryNames = [
            'Taklamakan Desert',
            'Tibet',
            'India',
            'Chita Oblast',
            'Sakha Republic (Yakutia)',
            'Irkutsk Oblast',
            'Magadan Oblast'
        ];
        
        const newTerritories = await territoriesCollection.find({
            name_type: { $in: newTerritoryNames }
        }).toArray();
        
        console.log(`📍 새로운 영토: ${newTerritories.length}개\n`);
        
        if (newTerritories.length === 0) {
            console.log('⚠️ 추가할 영토가 없습니다.');
            return;
        }
        
        // 타일 크기 설정 (10도 x 10도)
        const TILE_SIZE = 10;
        const newTiles = new Map(); // key: "lat_lng", value: tile data
        
        // 각 영토를 타일로 분할
        for (const territory of newTerritories) {
            console.log(`🗺️  처리 중: ${territory.name_ko} (${territory.name})`);
            
            let geometry;
            if (territory.geojson && territory.geojson.geometry) {
                geometry = territory.geojson.geometry;
            } else if (territory.type && territory.coordinates) {
                geometry = { type: territory.type, coordinates: territory.coordinates };
            } else {
                console.log(`  ⚠️ geometry 없음, 건너뜀`);
                continue;
            }
            
            // Bounding box 계산
            let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
            
            const processCoordinates = (coords) => {
                coords.forEach(coord => {
                    if (Array.isArray(coord[0])) {
                        processCoordinates(coord);
                    } else {
                        const [lng, lat] = coord;
                        if (lat < minLat) minLat = lat;
                        if (lat > maxLat) maxLat = lat;
                        if (lng < minLng) minLng = lng;
                        if (lng > maxLng) maxLng = lng;
                    }
                });
            };
            
            processCoordinates(geometry.coordinates);
            
            // 영토가 걸치는 타일 범위 계산
            const startLat = Math.floor(minLat / TILE_SIZE) * TILE_SIZE;
            const endLat = Math.ceil(maxLat / TILE_SIZE) * TILE_SIZE;
            const startLng = Math.floor(minLng / TILE_SIZE) * TILE_SIZE;
            const endLng = Math.ceil(maxLng / TILE_SIZE) * TILE_SIZE;
            
            // 각 타일에 영토 데이터 추가
            for (let lat = startLat; lat < endLat; lat += TILE_SIZE) {
                for (let lng = startLng; lng < endLng; lng += TILE_SIZE) {
                    const tileKey = `${lat}_${lng}`;
                    
                    if (!newTiles.has(tileKey)) {
                        newTiles.set(tileKey, {
                            tile_lat: lat,
                            tile_lng: lng,
                            bounds: {
                                north: lat + TILE_SIZE,
                                south: lat,
                                west: lng,
                                east: lng + TILE_SIZE
                            },
                            data: [],
                            feature_count: 0
                        });
                    }
                    
                    const tile = newTiles.get(tileKey);
                    
                    // 영토 데이터를 타일에 추가
                    tile.data.push({
                        _id: territory._id,
                        name: territory.name,
                        name_ko: territory.name_ko,
                        name_type: territory.name_type,
                        type: territory.type,
                        level: territory.level,
                        start: territory.start,
                        end: territory.end,
                        geojson: territory.geojson
                    });
                    
                    tile.feature_count++;
                }
            }
            
            console.log(`  ✅ 완료`);
        }
        
        console.log(`\n📦 생성된 새 타일: ${newTiles.size}개\n`);
        
        // 기존 타일과 병합
        let addedCount = 0;
        let updatedCount = 0;
        
        for (const [tileKey, tileData] of newTiles.entries()) {
            const existingTile = await tilesCollection.findOne({
                tile_lat: tileData.tile_lat,
                tile_lng: tileData.tile_lng
            });
            
            if (existingTile) {
                // 기존 타일에 새 영토 추가
                const existingData = Array.isArray(existingTile.data) ? existingTile.data : [];
                const updatedData = [...existingData, ...tileData.data];
                const updatedCount_inner = updatedData.length;
                
                await tilesCollection.updateOne(
                    { _id: existingTile._id },
                    {
                        $set: {
                            data: updatedData,
                            feature_count: updatedCount_inner
                        }
                    }
                );
                
                console.log(`🔄 업데이트: 타일 [${tileData.tile_lat}, ${tileData.tile_lng}] - 기존 ${existingTile.feature_count || existingData.length}개 → ${updatedCount_inner}개`);
                updatedCount++;
            } else {
                // 새 타일 추가
                await tilesCollection.insertOne(tileData);
                console.log(`➕ 추가: 타일 [${tileData.tile_lat}, ${tileData.tile_lng}] - ${tileData.feature_count}개 영토`);
                addedCount++;
            }
        }
        
        console.log(`\n📊 결과:`);
        console.log(`  ➕ 새 타일 추가: ${addedCount}개`);
        console.log(`  🔄 기존 타일 업데이트: ${updatedCount}개`);
        console.log(`  📦 총 처리: ${addedCount + updatedCount}개 타일`);
        
        // 전체 타일 수 확인
        const totalTiles = await tilesCollection.countDocuments();
        console.log(`\n✅ 전체 타일 수: ${totalTiles}개`);
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

generateNewTiles();
