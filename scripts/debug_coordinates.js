// scripts/debug_coordinates.js
// 좌표 변환 디버깅

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

async function debugCoordinates() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        const castleCollection = db.collection('castle');
        
        // 부산 영토와 마커 확인
        console.log('🗺️  부산광역시 좌표 분석:\n');
        
        const busan = await territoriesCollection.findOne({ name: '부산광역시' });
        const busanMarkers = await castleCollection.find({
            name: { $regex: '부산|동래' }
        }).toArray();
        
        if (busan) {
            let coords;
            if (busan.geojson.geometry.type === 'MultiPolygon') {
                coords = busan.geojson.geometry.coordinates[0][0];
                console.log('타입: MultiPolygon');
            } else {
                coords = busan.geojson.geometry.coordinates[0];
                console.log('타입: Polygon');
            }
            
            console.log('영토 폴리곤 (GeoJSON 원본, [lng, lat]):');
            console.log(`  첫 좌표: [${coords[0][0].toFixed(4)}, ${coords[0][1].toFixed(4)}]`);
            console.log(`  총 ${coords.length}개 좌표`);
            
            // 범위 계산
            const lngs = coords.map(c => c[0]);
            const lats = coords.map(c => c[1]);
            console.log(`\n  경도 범위: ${Math.min(...lngs).toFixed(4)} ~ ${Math.max(...lngs).toFixed(4)}`);
            console.log(`  위도 범위: ${Math.min(...lats).toFixed(4)} ~ ${Math.max(...lats).toFixed(4)}`);
        }
        
        console.log('\n마커 좌표:');
        busanMarkers.forEach(m => {
            console.log(`  ${m.name}: [lat=${m.lat}, lng=${m.lng}]`);
            
            if (busan) {
                let coords;
                if (busan.geojson.geometry.type === 'MultiPolygon') {
                    coords = busan.geojson.geometry.coordinates[0][0];
                } else {
                    coords = busan.geojson.geometry.coordinates[0];
                }
                
                const lngs = coords.map(c => c[0]);
                const lats = coords.map(c => c[1]);
                
                const inLngRange = m.lng >= Math.min(...lngs) && m.lng <= Math.max(...lngs);
                const inLatRange = m.lat >= Math.min(...lats) && m.lat <= Math.max(...lats);
                
                console.log(`    경도 범위 내: ${inLngRange ? 'O' : 'X'}`);
                console.log(`    위도 범위 내: ${inLatRange ? 'O' : 'X'}`);
            }
        });
        
        // 서울 비교 (잘 작동하는 것)
        console.log('\n\n🗺️  서울특별시 좌표 분석 (비교용):\n');
        
        const seoul = await territoriesCollection.findOne({ name: '서울특별시' });
        const seoulMarkers = await castleCollection.find({
            name: { $regex: '서울|한성' }
        }).limit(3).toArray();
        
        if (seoul) {
            const coords = seoul.geojson.geometry.coordinates[0];
            console.log('영토 폴리곤 (GeoJSON 원본, [lng, lat]):');
            console.log(`  첫 좌표: [${coords[0][0].toFixed(4)}, ${coords[0][1].toFixed(4)}]`);
            
            const lngs = coords.map(c => c[0]);
            const lats = coords.map(c => c[1]);
            console.log(`\n  경도 범위: ${Math.min(...lngs).toFixed(4)} ~ ${Math.max(...lngs).toFixed(4)}`);
            console.log(`  위도 범위: ${Math.min(...lats).toFixed(4)} ~ ${Math.max(...lats).toFixed(4)}`);
        }
        
        console.log('\n마커 좌표:');
        seoulMarkers.forEach(m => {
            console.log(`  ${m.name}: [lat=${m.lat}, lng=${m.lng}]`);
            
            if (seoul) {
                let coords;
                if (seoul.geojson.geometry.type === 'MultiPolygon') {
                    coords = seoul.geojson.geometry.coordinates[0][0];
                } else {
                    coords = seoul.geojson.geometry.coordinates[0];
                }
                
                const lngs = coords.map(c => c[0]);
                const lats = coords.map(c => c[1]);
                
                const inLngRange = m.lng >= Math.min(...lngs) && m.lng <= Math.max(...lngs);
                const inLatRange = m.lat >= Math.min(...lats) && m.lat <= Math.max(...lats);
                
                console.log(`    경도 범위 내: ${inLngRange ? 'O' : 'X'}`);
                console.log(`    위도 범위 내: ${inLatRange ? 'O' : 'X'}`);
            }
        });
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n\n✅ MongoDB 연결 종료');
    }
}

debugCoordinates();
