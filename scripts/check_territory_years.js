require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkTerritoryYears() {
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
        const territories = await db.collection('territories').find({}).toArray();
        
        console.log(`\n총 ${territories.length}개의 영토 데이터:`);
        territories.forEach((t, idx) => {
            console.log(`${idx+1}. ${t.name}: start_year=${t.start_year || 'null'}, end_year=${t.end_year || 'null'}`);
        });
        
        console.log('\n현재 앱의 타임라인 범위는 -2500년 ~ 2024년입니다.');
        console.log('초기 연도: -2333년');
        
    } catch (error) {
        console.error('오류:', error);
    } finally {
        await client.close();
    }
}

checkTerritoryYears();
