// scripts/add_bbox_to_territories.js
// 모든 territories 문서에 bbox(bounding box) 필드를 추가하는 스크립트

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error("MONGO_URI 환경 변수가 설정되지 않았습니다.");
}

// GeoJSON 폴리곤의 바운딩 박스 계산
function calculateBoundingBox(geojson) {
    if (!geojson || !geojson.geometry || !geojson.geometry.coordinates) {
        return null;
    }
    
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    
    const coords = geojson.geometry.coordinates;
    
    // Polygon 타입: [[[lng, lat], ...]]
    // MultiPolygon 타입: [[[[lng, lat], ...]], ...]
    const rings = geojson.geometry.type === 'MultiPolygon' ? coords.flat() : coords;
    
    rings.forEach(ring => {
        ring.forEach(([lng, lat]) => {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        });
    });
    
    return { minLat, maxLat, minLng, maxLng };
}

async function addBboxToTerritories() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log("MongoDB 연결 성공");
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        
        const territories = await territoriesCollection.find({}).toArray();
        console.log(`총 ${territories.length}개 territories 문서 발견`);
        
        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        for (const territory of territories) {
            try {
                // 이미 bbox가 있으면 스킵 (재실행 시)
                if (territory.bbox) {
                    skippedCount++;
                    continue;
                }
                
                const bbox = calculateBoundingBox(territory.geojson);
                
                if (!bbox) {
                    console.warn(`⚠️  bbox 계산 실패: ${territory.name || territory._id}`);
                    errorCount++;
                    continue;
                }
                
                await territoriesCollection.updateOne(
                    { _id: territory._id },
                    { $set: { bbox } }
                );
                
                updatedCount++;
                if (updatedCount % 50 === 0) {
                    console.log(`진행 중: ${updatedCount}/${territories.length}`);
                }
                
            } catch (error) {
                console.error(`❌ 업데이트 실패 (${territory.name || territory._id}):`, error.message);
                errorCount++;
            }
        }
        
        console.log(`\n✅ 완료!`);
        console.log(`   - 업데이트: ${updatedCount}개`);
        console.log(`   - 스킵 (기존 bbox): ${skippedCount}개`);
        console.log(`   - 오류: ${errorCount}개`);
        
    } catch (error) {
        console.error("스크립트 실행 중 오류:", error);
        process.exit(1);
    } finally {
        await client.close();
        console.log("MongoDB 연결 종료");
    }
}

addBboxToTerritories();
