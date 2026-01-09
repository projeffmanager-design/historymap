// scripts/delete_all_natural_features.js
// MongoDB의 natural_features 컬렉션에서 모든 데이터를 삭제하는 스크립트

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    console.error('❌ MONGO_URI 환경 변수가 설정되지 않았습니다.');
    process.exit(1);
}

async function deleteAllNaturalFeatures() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('MongoDB에 연결되었습니다!');
        
        const db = client.db('realhistory');
        const collection = db.collection('natural_features');
        
        // 삭제 전 카운트 확인
        const countBefore = await collection.countDocuments();
        console.log(`\n📊 현재 저장된 자연 지형지물: ${countBefore}개`);
        
        if (countBefore === 0) {
            console.log('✅ 삭제할 데이터가 없습니다.');
            return;
        }
        
        // 사용자 확인
        console.log('\n⚠️  모든 자연 지형지물 데이터를 삭제하시겠습니까?');
        console.log('   (5초 후 자동으로 삭제됩니다. Ctrl+C로 취소 가능)');
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 모든 데이터 삭제
        const result = await collection.deleteMany({});
        
        console.log(`\n✅ ${result.deletedCount}개의 자연 지형지물을 삭제했습니다!`);
        
        // 삭제 후 카운트 확인
        const countAfter = await collection.countDocuments();
        console.log(`📊 삭제 후 남은 데이터: ${countAfter}개`);
        
    } catch (error) {
        console.error('❌ 오류 발생:', error);
        process.exit(1);
    } finally {
        await client.close();
        console.log('\nMongoDB 연결이 종료되었습니다.');
    }
}

deleteAllNaturalFeatures();
