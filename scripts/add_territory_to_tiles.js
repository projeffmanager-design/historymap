// 🚀 새로운 영토만 기존 타일에 추가하는 스크립트 (전체 재생성 없이)
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// 타일 설정
const TILE_SIZE = 10;
const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;

// Bounding box 계산
function calculateBBox(coordinates) {
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    function processCoords(coords) {
        if (Array.isArray(coords[0])) {
            coords.forEach(processCoords);
        } else {
            const [lng, lat] = coords;
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
        }
    }

    processCoords(coordinates);
    return { minLat, maxLat, minLng, maxLng };
}

// 영토가 겹치는 타일 찾기
function findOverlappingTiles(bbox) {
    const tiles = [];
    
    const startLat = Math.floor((bbox.minLat - MIN_LAT) / TILE_SIZE) * TILE_SIZE + MIN_LAT;
    const endLat = Math.floor((bbox.maxLat - MIN_LAT) / TILE_SIZE) * TILE_SIZE + MIN_LAT;
    const startLng = Math.floor((bbox.minLng - MIN_LNG) / TILE_SIZE) * TILE_SIZE + MIN_LNG;
    const endLng = Math.floor((bbox.maxLng - MIN_LNG) / TILE_SIZE) * TILE_SIZE + MIN_LNG;

    for (let lat = startLat; lat <= endLat; lat += TILE_SIZE) {
        for (let lng = startLng; lng <= endLng; lng += TILE_SIZE) {
            const tileKey = `tile_${lat}_${lng}`;
            tiles.push({
                key: tileKey,
                bounds: {
                    minLat: lat,
                    maxLat: lat + TILE_SIZE,
                    minLng: lng,
                    maxLng: lng + TILE_SIZE
                }
            });
        }
    }

    return tiles;
}

async function addTerritoryToTiles(territoryNames) {
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

        // 추가할 영토 조회
        const territories = await territoriesCollection.find({
            $or: territoryNames.map(name => ({ name_type: name }))
        }).toArray();

        if (territories.length === 0) {
            console.error('❌ 지정된 영토를 찾을 수 없습니다.');
            return;
        }

        console.log(`📍 추가할 영토: ${territories.length}개\n`);

        let updatedTiles = 0;

        for (const territory of territories) {
            console.log(`🗺️  처리 중: ${territory.name || territory.name_type}`);

            // GeoJSON에서 geometry 추출
            let geometry;
            if (territory.geojson && territory.geojson.geometry) {
                geometry = territory.geojson.geometry;
            } else if (territory.geometry) {
                geometry = territory.geometry;
            } else {
                console.log(`  ⚠️ geometry 없음, 건너뜀`);
                continue;
            }

            // Bounding box 계산
            const bbox = calculateBBox(geometry.coordinates);
            
            // 겹치는 타일 찾기
            const overlappingTiles = findOverlappingTiles(bbox);
            console.log(`  📦 겹치는 타일: ${overlappingTiles.length}개`);

            // 각 타일에 영토 추가
            for (const tile of overlappingTiles) {
                // 타일 조회 또는 생성
                let tileDoc = await tilesCollection.findOne({ tile_key: tile.key });
                
                if (!tileDoc) {
                    // 타일이 없으면 생성
                    tileDoc = {
                        tile_key: tile.key,
                        bounds: tile.bounds,
                        data: []
                    };
                }

                // 이미 있는지 확인
                const existingIndex = tileDoc.data.findIndex(t => 
                    t._id?.toString() === territory._id?.toString() || 
                    t.name_type === territory.name_type
                );

                const territoryData = {
                    _id: territory._id,
                    name: territory.name,
                    name_ko: territory.name_ko,
                    name_type: territory.name_type,
                    geometry: geometry,
                    level: territory.level,
                    type: territory.type,
                    start: territory.start,
                    end: territory.end
                };

                if (existingIndex >= 0) {
                    // 업데이트
                    tileDoc.data[existingIndex] = territoryData;
                } else {
                    // 추가
                    tileDoc.data.push(territoryData);
                }

                // DB에 저장
                await tilesCollection.updateOne(
                    { tile_key: tile.key },
                    { $set: { bounds: tile.bounds, data: tileDoc.data } },
                    { upsert: true }
                );
            }

            updatedTiles += overlappingTiles.length;
            console.log(`  ✅ ${overlappingTiles.length}개 타일 업데이트됨`);
        }

        console.log(`\n✅ 완료!`);
        console.log(`📊 업데이트된 타일: ${updatedTiles}개`);
        console.log('\n💡 다음 단계: node scripts/export_tiles_batch.js 실행');

    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

// 사용 예시
const territoryNamesToAdd = process.argv.slice(2);

if (territoryNamesToAdd.length === 0) {
    console.log('사용법: node scripts/add_territory_to_tiles.js <영토이름1> <영토이름2> ...');
    console.log('예시: node scripts/add_territory_to_tiles.js "Taklamakan Desert" "Tibet"');
    process.exit(1);
}

addTerritoryToTiles(territoryNamesToAdd);
