// korea-provinces.json GeoJSON 데이터를 territories 컬렉션으로 import
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');

const MONGO_URI = process.env.MONGO_URI;

async function importKoreaProvinces() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        await client.connect();
        console.log("✅ MongoDB 연결 성공");
        
        const db = client.db("realhistory");
        const territoriesCollection = db.collection("territories");
        
        // korea-provinces.json 파일 읽기
        console.log("📖 korea-provinces.json 파일 읽는 중...");
        const geojson = JSON.parse(fs.readFileSync('./korea-provinces.json', 'utf8'));
        
        if (!geojson.features || !Array.isArray(geojson.features)) {
            throw new Error("Invalid GeoJSON format: features array not found");
        }
        
        console.log(`📊 총 ${geojson.features.length}개의 Feature 발견`);
        
        // Feature를 territory 문서로 변환
        const territories = geojson.features.map((feature, index) => {
            // 바운딩 박스 계산
            const bbox = calculateBBox(feature.geometry.coordinates);
            
            return {
                name: feature.properties.name || `Territory_${index}`,
                name_eng: feature.properties.name_eng,
                code: feature.properties.code,
                base_year: feature.properties.base_year || "2018",
                type: feature.geometry.type,
                coordinates: feature.geometry.coordinates,
                bbox: bbox,
                // 한국 전체 시대에 표시 (예시)
                country_id: "한국",
                start_year: 1948,  // 대한민국 건국
                start_month: 1,
                end_year: null,    // 현재까지
                end_month: null
            };
        });
        
        // 기존 데이터 삭제 (선택사항)
        console.log("🗑️ 기존 territories 데이터 삭제 중...");
        const deleteResult = await territoriesCollection.deleteMany({});
        console.log(`   삭제된 문서: ${deleteResult.deletedCount}개`);
        
        // 새 데이터 삽입
        console.log("💾 새 territories 데이터 삽입 중...");
        const insertResult = await territoriesCollection.insertMany(territories);
        console.log(`✅ ${Object.keys(insertResult.insertedIds).length}개의 영토 데이터 import 완료`);
        
        // 샘플 출력
        console.log("\n📋 샘플 데이터:");
        territories.slice(0, 3).forEach((t, i) => {
            console.log(`   ${i + 1}. ${t.name} (${t.name_eng})`);
            console.log(`      - Type: ${t.type}`);
            console.log(`      - BBox: [${t.bbox.minLat.toFixed(2)}, ${t.bbox.minLng.toFixed(2)}] → [${t.bbox.maxLat.toFixed(2)}, ${t.bbox.maxLng.toFixed(2)}]`);
            console.log(`      - Coordinates: ${JSON.stringify(t.coordinates).length} bytes`);
        });
        
        // 인덱스 생성
        console.log("\n🔍 인덱스 생성 중...");
        await territoriesCollection.createIndex({ "bbox.minLat": 1, "bbox.maxLat": 1, "bbox.minLng": 1, "bbox.maxLng": 1 });
        await territoriesCollection.createIndex({ "name": 1 });
        await territoriesCollection.createIndex({ "start_year": 1, "end_year": 1 });
        console.log("✅ 인덱스 생성 완료");
        
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

importKoreaProvinces();
