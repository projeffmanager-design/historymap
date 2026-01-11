require('dotenv').config();
const { MongoClient } = require('mongodb');

async function updateTerritoryYears() {
    const MONGODB_URI = process.env.MONGO_URI;
    if (!MONGODB_URI) {
        console.error('MONGO_URI 환경 변수가 설정되지 않았습니다.');
        return;
    }
    
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log('MongoDB에 연결되었습니다.');
        
        const db = client.db('realhistory');
        
        // 모든 한국 행정구역 영토를 고대부터 현재까지로 변경
        const result = await db.collection('territories').updateMany(
            {},
            { $set: { start_year: -2500, end_year: null } }
        );
        
        console.log(`✅ ${result.modifiedCount}개 영토 데이터 업데이트 완료`);
        console.log('   start_year: 1948 → -2500 (고대부터 표시)');
        console.log('   end_year: null (현재까지 유효)');
        
        // 확인
        const updated = await db.collection('territories').find({}).limit(3).toArray();
        console.log('\n업데이트 확인 (첫 3개):');
        updated.forEach(t => {
            console.log(`  - ${t.name}: start_year=${t.start_year}, end_year=${t.end_year}`);
        });
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
    }
}

updateTerritoryYears();
