// scripts/check_korea_coordinates.js
// 한국 시도 좌표 범위 확인

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

async function checkKoreaCoordinates() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        
        // 서울, 부산, 경기 샘플 확인
        const samples = await territoriesCollection.find({
            name: { $in: ['서울특별시', '부산광역시', '경기도'] }
        }).toArray();
        
        console.log('📍 샘플 시도 좌표 확인:\n');
        
        samples.forEach(region => {
            console.log(`🏙️  ${region.name}`);
            console.log(`   타입: ${region.geojson.geometry.type}`);
            
            const coords = region.geojson.geometry.coordinates[0];
            if (coords && coords.length > 0) {
                console.log(`   좌표 개수: ${coords.length}개`);
                console.log(`   첫 좌표: [${coords[0][0].toFixed(4)}, ${coords[0][1].toFixed(4)}]`);
                
                const lngs = coords.map(c => c[0]);
                const lats = coords.map(c => c[1]);
                
                console.log(`   경도 범위: ${Math.min(...lngs).toFixed(4)} ~ ${Math.max(...lngs).toFixed(4)}`);
                console.log(`   위도 범위: ${Math.min(...lats).toFixed(4)} ~ ${Math.max(...lats).toFixed(4)}`);
            } else {
                console.log('   ⚠️  좌표 없음!');
            }
            console.log('');
        });
        
        // 전체 남한 범위 계산
        const allProvinces = await territoriesCollection.find({
            name: { $regex: '서울|부산|경기|강원|충청|전라|경상|제주|대구|인천|광주|대전|울산|세종' }
        }).toArray();
        
        let allLngs = [];
        let allLats = [];
        
        allProvinces.forEach(p => {
            const coords = p.geojson.geometry.coordinates[0];
            if (coords) {
                coords.forEach(c => {
                    allLngs.push(c[0]);
                    allLats.push(c[1]);
                });
            }
        });
        
        console.log('📊 남한 전체 좌표 범위:');
        console.log(`   경도: ${Math.min(...allLngs).toFixed(4)} ~ ${Math.max(...allLngs).toFixed(4)}`);
        console.log(`   위도: ${Math.min(...allLats).toFixed(4)} ~ ${Math.max(...allLats).toFixed(4)}`);
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

checkKoreaCoordinates();
