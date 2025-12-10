// 기존 고구려 데이터 삭제 스크립트

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: './.env' });

const uri = process.env.MONGO_URI;

async function deleteGoguryeoRecords() {
    const client = new MongoClient(uri);
    
    try {
        await client.connect();
        console.log('MongoDB 연결 성공');
        
        const db = client.db('realhistory');
        const historyCollection = db.collection('history');
        
        // country가 '고구려'인 데이터 삭제
        const result = await historyCollection.deleteMany({
            country: '고구려'
        });
        
        console.log(`삭제된 기록: ${result.deletedCount}개`);
        
        // event 필드로 저장된 고구려 데이터도 확인 및 삭제
        const result2 = await historyCollection.deleteMany({
            event: { $exists: true },
            source: /삼국사기.*고구려본기/
        });
        
        console.log(`추가로 삭제된 기록: ${result2.deletedCount}개`);
        console.log(`총 삭제: ${result.deletedCount + result2.deletedCount}개`);
        
    } catch (error) {
        console.error('오류 발생:', error);
    } finally {
        await client.close();
    }
}

deleteGoguryeoRecords();
