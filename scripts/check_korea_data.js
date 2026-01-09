// scripts/check_korea_data.js
// 한국 영토 데이터 확인 스크립트

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

async function checkKoreaData() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        
        // 전체 개수 확인
        const totalCount = await territoriesCollection.countDocuments();
        console.log(`📊 전체 영토 개수: ${totalCount}개\n`);
        
        // 한국 지역 찾기
        const koreaRegions = await territoriesCollection.find({
            name: { $regex: '서울|부산|경기|강원|충청|전라|경상|제주|대구|인천|광주|대전|울산|세종' }
        }).toArray();
        
        console.log(`🇰🇷 한국 지역 개수: ${koreaRegions.length}개\n`);
        
        if (koreaRegions.length > 0) {
            const sample = koreaRegions[0];
            console.log('📍 샘플 데이터 (첫 번째):');
            console.log('   이름:', sample.name);
            console.log('   시작 연도:', sample.start_year);
            console.log('   종료 연도:', sample.end_year);
            console.log('   타입:', sample.geojson.geometry.type);
            
            const coords = sample.geojson.geometry.coordinates[0];
            if (coords && coords.length > 0) {
                console.log('   좌표 개수:', coords.length);
                console.log('   첫 좌표:', coords[0]);
                console.log('   마지막 좌표:', coords[coords.length - 1]);
                
                // 좌표 범위 계산
                const lngs = coords.map(c => c[0]);
                const lats = coords.map(c => c[1]);
                console.log('\n   경도 범위:', Math.min(...lngs).toFixed(4), '~', Math.max(...lngs).toFixed(4));
                console.log('   위도 범위:', Math.min(...lats).toFixed(4), '~', Math.max(...lats).toFixed(4));
            }
            
            console.log('\n📋 모든 한국 지역:');
            koreaRegions.forEach((region, index) => {
                console.log(`   ${index + 1}. ${region.name} (${region.start_year}년부터)`);
            });
        } else {
            console.log('❌ 한국 지역 데이터를 찾을 수 없습니다!');
        }
        
        // 중국 지역도 확인
        const chinaRegions = await territoriesCollection.find({
            name: { $regex: '^중국' }
        }).toArray();
        
        console.log(`\n🇨🇳 중국 지역 개수: ${chinaRegions.length}개`);
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

checkKoreaData();
