// 마커(castle)가 있는 행정구역만 선택적으로 임포트
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');

// Point in Polygon 알고리즘 (Ray Casting)
function pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        
        const intersect = ((yi > y) !== (yj > y)) && 
                         (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
}

// 좌표가 geometry 내에 있는지 확인 (Polygon, MultiPolygon 지원)
function isPointInGeometry(lng, lat, geometry) {
    const point = [lng, lat];
    
    if (geometry.type === 'Polygon') {
        // Polygon: coordinates[0]이 외곽선
        return pointInPolygon(point, geometry.coordinates[0]);
    } else if (geometry.type === 'MultiPolygon') {
        // MultiPolygon: 각 polygon의 첫 번째 ring 확인
        return geometry.coordinates.some(polygon => pointInPolygon(point, polygon[0]));
    }
    
    return false;
}

async function importTerritoriesWithMarkers() {
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) {
        console.error('MONGO_URI 환경 변수가 설정되지 않았습니다.');
        return;
    }
    
    const client = new MongoClient(MONGO_URI);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        const castlesCollection = db.collection('castle');
        
        // 1. 모든 마커(castle) 가져오기
        console.log('📍 마커 데이터 로딩 중...');
        const castles = await castlesCollection.find({}).toArray();
        console.log(`   총 ${castles.length}개 마커 발견\n`);
        
        // 2. 각 GeoJSON 파일 처리
        const files = [
            { name: 'korea-provinces.json', label: '한국', startYear: -2500 },
            { name: 'china-provinces.json', label: '중국', startYear: -2500 },
            { name: 'russia-regions.json', label: '러시아', startYear: -2500 },
            { name: 'mongolia-only.json', label: '몽골', startYear: -2500 }
        ];
        
        const territoriesToImport = [];
        
        for (const file of files) {
            try {
                console.log(`📂 ${file.name} 분석 중...`);
                const geojson = JSON.parse(fs.readFileSync(file.name, 'utf8'));
                
                if (!geojson.features || geojson.features.length === 0) {
                    console.log(`   ⚠️  features가 없습니다.\n`);
                    continue;
                }
                
                let matchedCount = 0;
                
                // 각 행정구역(feature)에 대해 마커가 있는지 확인
                for (const feature of geojson.features) {
                    const regionName = feature.properties.NAME || feature.properties.name || 'Unknown';
                    
                    // 이 행정구역 내에 마커가 있는지 확인
                    const hasMarker = castles.some(castle => {
                        try {
                            return isPointInGeometry(castle.lng, castle.lat, feature.geometry);
                        } catch (e) {
                            return false;
                        }
                    });
                    
                    if (hasMarker) {
                        matchedCount++;
                        territoriesToImport.push({
                            name: regionName,
                            country_id: file.label,
                            start_year: file.startYear,
                            start_month: 1,
                            end_year: null,
                            end_month: null,
                            type: feature.geometry.type,
                            coordinates: feature.geometry.coordinates
                        });
                    }
                }
                
                console.log(`   ✅ ${matchedCount}/${geojson.features.length}개 행정구역에 마커 발견\n`);
                
            } catch (error) {
                console.error(`   ❌ ${file.name} 처리 실패:`, error.message);
            }
        }
        
        // 3. 임포트 실행
        if (territoriesToImport.length > 0) {
            console.log(`\n🗑️  기존 데이터 삭제 중...`);
            await territoriesCollection.deleteMany({});
            
            console.log(`📥 ${territoriesToImport.length}개 영토 임포트 중...`);
            const result = await territoriesCollection.insertMany(territoriesToImport);
            console.log(`✅ ${result.insertedCount}개 임포트 완료!`);
            
            // 국가별 통계
            console.log('\n📊 국가별 통계:');
            const stats = {};
            territoriesToImport.forEach(t => {
                stats[t.country_id] = (stats[t.country_id] || 0) + 1;
            });
            Object.entries(stats).forEach(([country, count]) => {
                console.log(`   ${country}: ${count}개`);
            });
        } else {
            console.log('\n⚠️  임포트할 영토가 없습니다.');
        }
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
    }
}

importTerritoriesWithMarkers();
