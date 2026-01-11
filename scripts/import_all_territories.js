// 모든 GeoJSON 영토 데이터를 territories 컬렉션으로 import
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI;

// Import할 파일 목록 (파일명, 국가/지역명, 시작년도, 종료년도)
const FILES_TO_IMPORT = [
    { file: 'korea-provinces.json', country: '한국', startYear: 1948, endYear: null },
    { file: 'china.json', country: '중국', startYear: -2070, endYear: null },
    { file: 'china-provinces.json', country: '중국_성', startYear: 1949, endYear: null },
    { file: 'russia-regions.json', country: '러시아', startYear: 1991, endYear: null },
    { file: 'mongolia-only.json', country: '몽골', startYear: 1924, endYear: null },
    { file: 'data/asia.json', country: '아시아', startYear: -3000, endYear: null }
];

async function importAllTerritories() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        await client.connect();
        console.log("✅ MongoDB 연결 성공\n");
        
        const db = client.db("history");
        const territoriesCollection = db.collection("territories");
        
        // 기존 데이터 삭제
        console.log("🗑️ 기존 territories 데이터 삭제 중...");
        const deleteResult = await territoriesCollection.deleteMany({});
        console.log(`   삭제된 문서: ${deleteResult.deletedCount}개\n`);
        
        let totalImported = 0;
        let totalSize = 0;
        
        // 각 파일을 순차적으로 처리
        for (const config of FILES_TO_IMPORT) {
            try {
                const filePath = path.join(process.cwd(), config.file);
                
                if (!fs.existsSync(filePath)) {
                    console.log(`⚠️ 파일 없음: ${config.file} (건너뜀)`);
                    continue;
                }
                
                const fileStats = fs.statSync(filePath);
                const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(2);
                
                console.log(`📖 ${config.file} 읽는 중... (${fileSizeMB} MB)`);
                
                const fileContent = fs.readFileSync(filePath, 'utf8');
                
                // 404나 빈 파일 체크
                if (fileContent === '404: Not Found' || fileContent.trim().length < 50) {
                    console.log(`   ⚠️ 빈 파일 또는 404 (건너뜀)\n`);
                    continue;
                }
                
                const geojson = JSON.parse(fileContent);
                
                if (!geojson.features || !Array.isArray(geojson.features)) {
                    console.log(`   ⚠️ Invalid GeoJSON format (건너뜀)\n`);
                    continue;
                }
                
                console.log(`   📊 Feature 수: ${geojson.features.length}개`);
                
                // Feature를 territory 문서로 변환
                const territories = geojson.features.map((feature, index) => {
                    const bbox = calculateBBox(feature.geometry.coordinates);
                    
                    return {
                        name: feature.properties.name || feature.properties.NAME || `${config.country}_${index}`,
                        name_eng: feature.properties.name_eng || feature.properties.NAME_EN || feature.properties.name,
                        code: feature.properties.code || feature.properties.ISO_A2 || feature.properties.iso_a2,
                        base_year: feature.properties.base_year,
                        country_id: config.country,
                        type: feature.geometry.type,
                        coordinates: feature.geometry.coordinates,
                        bbox: bbox,
                        start_year: config.startYear,
                        start_month: 1,
                        end_year: config.endYear,
                        end_month: null,
                        properties: feature.properties // 원본 속성 보존
                    };
                });
                
                // 데이터 삽입
                if (territories.length > 0) {
                    const insertResult = await territoriesCollection.insertMany(territories);
                    const inserted = Object.keys(insertResult.insertedIds).length;
                    totalImported += inserted;
                    totalSize += fileStats.size;
                    
                    console.log(`   ✅ ${inserted}개 import 완료`);
                    
                    // 샘플 출력
                    if (territories.length > 0) {
                        const sample = territories[0];
                        console.log(`   📋 샘플: ${sample.name} (BBox: [${sample.bbox.minLat.toFixed(2)}, ${sample.bbox.minLng.toFixed(2)}])`);
                    }
                }
                
                console.log();
                
            } catch (error) {
                console.error(`   ❌ ${config.file} 처리 중 오류:`, error.message);
                console.log();
            }
        }
        
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`✅ 전체 Import 완료`);
        console.log(`   총 문서 수: ${totalImported}개`);
        console.log(`   총 파일 크기: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        
        // 인덱스 생성
        console.log("🔍 인덱스 생성 중...");
        await territoriesCollection.createIndex({ "bbox.minLat": 1, "bbox.maxLat": 1, "bbox.minLng": 1, "bbox.maxLng": 1 });
        await territoriesCollection.createIndex({ "name": 1 });
        await territoriesCollection.createIndex({ "country_id": 1 });
        await territoriesCollection.createIndex({ "start_year": 1, "end_year": 1 });
        console.log("✅ 인덱스 생성 완료");
        
        // 최종 통계
        const finalCount = await territoriesCollection.countDocuments();
        console.log(`\n📊 최종 territories 컬렉션: ${finalCount}개 문서`);
        
        // 국가별 통계
        const countryStats = await territoriesCollection.aggregate([
            { $group: { _id: "$country_id", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray();
        
        console.log("\n📈 국가별 분포:");
        countryStats.forEach(stat => {
            console.log(`   ${stat._id}: ${stat.count}개`);
        });
        
    } catch (error) {
        console.error("❌ 전체 오류:", error);
    } finally {
        await client.close();
        console.log("\n🔌 MongoDB 연결 종료");
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

importAllTerritories();
