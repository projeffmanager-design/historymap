// 모든 영토를 타일로 변환 (처음부터)
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function regenerateAllTiles() {
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
        
        // 🔍 모든 영토 조회
        const allTerritories = await territoriesCollection.find({}).toArray();
        console.log(`📍 전체 영토: ${allTerritories.length}개\n`);
        
        // 타일 크기 설정 (10도 x 10도)
        const TILE_SIZE = 10;
        const tiles = new Map(); // key: "lat_lng", value: tile data
        
        let processedCount = 0;
        let skippedCount = 0;
        
        // 각 영토를 타일로 분할
        for (const territory of allTerritories) {
            console.log(`🗺️  [${processedCount + 1}/${allTerritories.length}] ${territory.name_ko || territory.name}`);
            
            let geometry;
            
            // 🔹 geometry 필드 직접 있는 경우 (기존 영토)
            if (territory.geometry) {
                geometry = territory.geometry;
            }
            // 🔹 geojson.geometry 형식 (새로 추가한 영토)
            else if (territory.geojson && territory.geojson.geometry) {
                geometry = territory.geojson.geometry;
            }
            // 🔹 type/coordinates 형식
            else if (territory.type && territory.coordinates) {
                geometry = { type: territory.type, coordinates: territory.coordinates };
            }
            else {
                console.log(`  ⚠️ geometry 없음, 건너뜀`);
                skippedCount++;
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
                    
                    if (!tiles.has(tileKey)) {
                        tiles.set(tileKey, {
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
                    
                    const tile = tiles.get(tileKey);
                    
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
                        geometry: geometry // GeoJSON geometry 직접 저장
                    });
                    
                    tile.feature_count++;
                }
            }
            
            processedCount++;
            console.log(`  ✅ 완료`);
        }
        
        console.log(`\n📦 생성된 타일: ${tiles.size}개\n`);
        console.log(`📊 처리 결과:`);
        console.log(`  ✅ 처리: ${processedCount}개`);
        console.log(`  ⚠️ 건너뜀: ${skippedCount}개\n`);
        
        // DB에 타일 저장
        console.log('💾 타일을 DB에 저장 중...\n');
        let savedCount = 0;
        
        for (const [tileKey, tileData] of tiles.entries()) {
            await tilesCollection.insertOne(tileData);
            savedCount++;
            
            if (savedCount % 50 === 0) {
                console.log(`  💾 ${savedCount}/${tiles.size} 저장됨...`);
            }
        }
        
        console.log(`\n✅ 모든 타일 저장 완료!`);
        console.log(`📦 총 타일 수: ${tiles.size}개`);
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

regenerateAllTiles();
