// 모든 영토를 타일로 변환 (처음부터 새로 생성)
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function generateAllTiles() {
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
        
        if (allTerritories.length === 0) {
            console.log('⚠️ 영토가 없습니다.');
            return;
        }
        
        // 타일 크기 설정 (10도 x 10도)
        const TILE_SIZE = 10;
        const tiles = new Map(); // key: "lat_lng", value: tile data
        
        // 각 영토를 타일로 분할
        let processedCount = 0;
        for (const territory of allTerritories) {
            processedCount++;
            if (processedCount % 10 === 0) {
                console.log(`🗺️  처리 중: ${processedCount}/${allTerritories.length}...`);
            }
            
            let geometry;
            if (territory.geojson && territory.geojson.geometry) {
                // 새로운 형식: geojson.geometry
                geometry = territory.geojson.geometry;
            } else if (territory.geometry) {
                // 기존 형식: geometry 직접
                geometry = territory.geometry;
            } else if (territory.type && territory.coordinates) {
                geometry = { type: territory.type, coordinates: territory.coordinates };
            } else {
                console.log(`  ⚠️ ${territory.name_ko || territory.name} - geometry 없음, 건너뜀`);
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
                        // 두 가지 형식 모두 지원
                        geojson: territory.geojson || {
                            type: 'Feature',
                            geometry: geometry,
                            properties: {
                                name: territory.name,
                                name_ko: territory.name_ko
                            }
                        }
                    });
                    
                    tile.feature_count++;
                }
            }
        }
        
        console.log(`\n📦 생성된 타일: ${tiles.size}개\n`);
        
        // MongoDB에 저장
        let savedCount = 0;
        for (const [tileKey, tileData] of tiles.entries()) {
            await tilesCollection.insertOne(tileData);
            savedCount++;
            
            if (savedCount % 20 === 0) {
                console.log(`💾 저장 중: ${savedCount}/${tiles.size}...`);
            }
        }
        
        console.log(`\n📊 결과:`);
        console.log(`  📦 총 타일 수: ${tiles.size}개`);
        console.log(`  🗺️  총 영토 수: ${allTerritories.length}개`);
        
        // 통계
        const stats = {
            totalFeatures: 0,
            minFeatures: Infinity,
            maxFeatures: 0
        };
        
        for (const tile of tiles.values()) {
            stats.totalFeatures += tile.feature_count;
            if (tile.feature_count < stats.minFeatures) stats.minFeatures = tile.feature_count;
            if (tile.feature_count > stats.maxFeatures) stats.maxFeatures = tile.feature_count;
        }
        
        console.log(`  📊 평균 영토/타일: ${(stats.totalFeatures / tiles.size).toFixed(1)}개`);
        console.log(`  📊 최소 영토/타일: ${stats.minFeatures}개`);
        console.log(`  📊 최대 영토/타일: ${stats.maxFeatures}개`);
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

generateAllTiles();
