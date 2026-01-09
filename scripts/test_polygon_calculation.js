// scripts/test_polygon_calculation.js
// 특정 마커가 어느 시도에 속하는지 테스트

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

// Ray Casting 알고리즘 (index.html과 동일)
function isPointInPolygon(point, polygon) {
    const [lat, lng] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [latI, lngI] = polygon[i];
        const [latJ, lngJ] = polygon[j];
        
        const intersect = ((lngI > lng) !== (lngJ > lng)) &&
            (lat < (latJ - latI) * (lng - lngI) / (lngJ - lngI) + latI);
        
        if (intersect) inside = !inside;
    }
    
    return inside;
}

function extractPolygonCoords(geojson) {
    if (geojson.type === 'Feature') {
        geojson = geojson.geometry;
    }
    
    if (geojson.type === 'Polygon') {
        // GeoJSON은 [lng, lat]이므로 [lat, lng]로 변환
        return geojson.coordinates[0].map(coord => [coord[1], coord[0]]);
    } else if (geojson.type === 'MultiPolygon') {
        // 첫 번째 폴리곤만 사용
        return geojson.coordinates[0][0].map(coord => [coord[1], coord[0]]);
    }
    
    return null;
}

async function testPolygonCalculation() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        const castleCollection = db.collection('castle');
        
        // 테스트할 시도들
        const testProvinces = ['부산광역시', '강원도', '제주특별자치도', '경상남도', '전라북도'];
        
        for (const provinceName of testProvinces) {
            console.log(`\n🗺️  ${provinceName} 테스트:`);
            console.log('='.repeat(50));
            
            const territory = await territoriesCollection.findOne({ name: provinceName });
            
            if (!territory) {
                console.log('❌ 영토 데이터 없음');
                continue;
            }
            
            const polygonCoords = extractPolygonCoords(territory.geojson);
            
            if (!polygonCoords) {
                console.log('❌ 폴리곤 좌표 추출 실패');
                continue;
            }
            
            console.log(`✅ 폴리곤 좌표: ${polygonCoords.length}개`);
            console.log(`   샘플: [${polygonCoords[0][0].toFixed(2)}, ${polygonCoords[0][1].toFixed(2)}]`);
            
            // 해당 지역 내 모든 마커 찾기
            const allMarkers = await castleCollection.find({}).toArray();
            const markersInside = [];
            
            allMarkers.forEach(marker => {
                if (typeof marker.lat === 'number' && typeof marker.lng === 'number') {
                    if (isPointInPolygon([marker.lat, marker.lng], polygonCoords)) {
                        markersInside.push(marker);
                    }
                }
            });
            
            console.log(`\n📍 영토 내부 마커: ${markersInside.length}개`);
            
            if (markersInside.length > 0) {
                console.log('\n   마커 목록:');
                markersInside.forEach((m, i) => {
                    const historyCount = m.history ? m.history.length : 0;
                    const hasActiveHistory = historyCount > 0 && m.history.some(h => h.country_id);
                    console.log(`   ${i + 1}. ${m.name} [${m.lat.toFixed(2)}, ${m.lng.toFixed(2)}]`);
                    console.log(`      역사: ${historyCount}개, 국가 있음: ${hasActiveHistory ? 'O' : 'X'}`);
                    
                    if (hasActiveHistory && m.history) {
                        const sample = m.history.find(h => h.country_id);
                        if (sample) {
                            console.log(`      샘플: ${sample.start_year || '?'}년~${sample.end_year || '?'}년, 국가 ID: ${sample.country_id}`);
                        }
                    }
                });
                
                const withValidHistory = markersInside.filter(m => 
                    m.history && m.history.length > 0 && m.history.some(h => h.country_id)
                ).length;
                
                console.log(`\n   ✅ 유효한 역사가 있는 마커: ${withValidHistory}개`);
                
                if (withValidHistory === 0) {
                    console.log('   ⚠️  이 시도는 표시되지 않을 것입니다 (유효한 역사 없음)');
                }
            } else {
                console.log('   ❌ 마커가 하나도 없어서 표시되지 않습니다');
            }
        }
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
        console.error(error.stack);
    } finally {
        await client.close();
        console.log('\n\n✅ MongoDB 연결 종료');
    }
}

testPolygonCalculation();
