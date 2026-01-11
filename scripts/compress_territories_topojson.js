// 영토 데이터를 Topojson 형식으로 압축하여 새 컬렉션에 저장
require('dotenv').config();
const { MongoClient } = require('mongodb');
const topojson = require('topojson-server');

const MONGODB_URI = process.env.MONGO_URI;

async function compressAndTileTerritoriesData() {
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log("✅ MongoDB 연결 성공");
        
        const db = client.db("history");
        const territoriesCollection = db.collection("territories");
        const tilesCollection = db.collection("territory_tiles");
        
        // 기존 타일 컬렉션 초기화
        await tilesCollection.deleteMany({});
        console.log("🗑️ 기존 territory_tiles 컬렉션 초기화");
        
        // 모든 영토 데이터 가져오기
        const territories = await territoriesCollection.find({}).toArray();
        console.log(`📊 총 ${territories.length}개의 영토 데이터 로드`);
        
        // 타일 그리드 설정 (아시아 전체 기준)
        const TILE_SIZE = 10; // 10도 x 10도 타일 (메모리 절약)
        const MIN_LAT = -10;  // 인도네시아
        const MAX_LAT = 80;   // 러시아 북부
        const MIN_LNG = 60;   // 중동
        const MAX_LNG = 150;  // 극동
        
        const tiles = {};
        let totalOriginalSize = 0;
        let totalCompressedSize = 0;
        
        // 각 영토를 타일로 분류
        for (const territory of territories) {
            if (!territory.coordinates || !territory.coordinates.length) continue;
            
            // 바운딩 박스 계산 (없으면)
            let bbox = territory.bbox;
            if (!bbox) {
                bbox = calculateBBox(territory.coordinates);
            }
            
            // 원본 크기 측정
            const originalSize = JSON.stringify(territory).length;
            totalOriginalSize += originalSize;
            
            // 영토가 겹치는 타일 찾기
            const tileKeys = findOverlappingTiles(bbox, TILE_SIZE, MIN_LAT, MAX_LAT, MIN_LNG, MAX_LNG);
            
            for (const tileKey of tileKeys) {
                if (!tiles[tileKey]) {
                    tiles[tileKey] = {
                        features: [],
                        bounds: parseTileKey(tileKey, TILE_SIZE)
                    };
                }
                
                // GeoJSON Feature 형식으로 변환
                tiles[tileKey].features.push({
                    type: "Feature",
                    properties: {
                        _id: territory._id.toString(),
                        name: territory.name,
                        country_id: territory.country_id,
                        start_year: territory.start_year,
                        start_month: territory.start_month,
                        end_year: territory.end_year,
                        end_month: territory.end_month
                    },
                    geometry: {
                        type: territory.type || "Polygon",
                        coordinates: territory.coordinates
                    }
                });
            }
        }
        
        console.log(`🗺️ 총 ${Object.keys(tiles).length}개의 타일 생성`);
        
        // 각 타일을 Topojson으로 압축하여 저장
        const tileDocs = [];
        for (const [tileKey, tileData] of Object.entries(tiles)) {
            const geojson = {
                type: "FeatureCollection",
                features: tileData.features
            };
            
            // Topojson으로 압축 (양자화 + 아크 공유)
            const topology = topojson.topology({ territories: geojson }, {
                "property-transform": function(feature) {
                    return feature.properties;
                },
                "quantization": 1e5 // 높을수록 정밀도 높음
            });
            
            const compressedSize = JSON.stringify(topology).length;
            totalCompressedSize += compressedSize;
            
            tileDocs.push({
                tile_key: tileKey,
                bounds: tileData.bounds,
                topology: topology,
                feature_count: tileData.features.length,
                original_size: JSON.stringify(geojson).length,
                compressed_size: compressedSize,
                compression_ratio: Math.round((1 - compressedSize / JSON.stringify(geojson).length) * 100)
            });
        }
        
        // MongoDB에 저장
        if (tileDocs.length > 0) {
            await tilesCollection.insertMany(tileDocs);
            console.log(`✅ ${tileDocs.length}개 타일 저장 완료`);
        }
        
        // 통계 출력
        console.log("\n📊 압축 통계:");
        console.log(`   원본 전체 크기: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   압축 전체 크기: ${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   압축률: ${Math.round((1 - totalCompressedSize / totalOriginalSize) * 100)}%`);
        console.log(`   타일당 평균 크기: ${(totalCompressedSize / tileDocs.length / 1024).toFixed(2)} KB`);
        
        // 인덱스 생성
        await tilesCollection.createIndex({ "bounds.minLat": 1, "bounds.maxLat": 1, "bounds.minLng": 1, "bounds.maxLng": 1 });
        console.log("✅ 타일 바운딩 박스 인덱스 생성 완료");
        
    } catch (error) {
        console.error("❌ 오류 발생:", error);
    } finally {
        await client.close();
        console.log("🔌 MongoDB 연결 종료");
    }
}

function calculateBBox(coordinates) {
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    
    function processCoords(coords) {
        if (typeof coords[0] === 'number') {
            // [lng, lat] 형식
            minLng = Math.min(minLng, coords[0]);
            maxLng = Math.max(maxLng, coords[0]);
            minLat = Math.min(minLat, coords[1]);
            maxLat = Math.max(maxLat, coords[1]);
        } else {
            coords.forEach(processCoords);
        }
    }
    
    processCoords(coordinates);
    
    return { minLat, maxLat, minLng, maxLng };
}

function findOverlappingTiles(bbox, tileSize, minLat, maxLat, minLng, maxLng) {
    const tiles = [];
    
    const startLat = Math.floor((bbox.minLat - minLat) / tileSize) * tileSize + minLat;
    const endLat = Math.floor((bbox.maxLat - minLat) / tileSize) * tileSize + minLat;
    const startLng = Math.floor((bbox.minLng - minLng) / tileSize) * tileSize + minLng;
    const endLng = Math.floor((bbox.maxLng - minLng) / tileSize) * tileSize + minLng;
    
    for (let lat = startLat; lat <= endLat; lat += tileSize) {
        for (let lng = startLng; lng <= endLng; lng += tileSize) {
            tiles.push(`${lat}_${lng}`);
        }
    }
    
    return tiles;
}

function parseTileKey(tileKey, tileSize) {
    const [latStr, lngStr] = tileKey.split('_');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    
    return {
        minLat: lat,
        maxLat: lat + tileSize,
        minLng: lng,
        maxLng: lng + tileSize
    };
}

compressAndTileTerritoriesData();
