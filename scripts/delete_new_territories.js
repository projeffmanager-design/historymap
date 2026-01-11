// 새로 추가된 7개 영토를 DB에서 삭제
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function deleteNewTerritories() {
    const MONGODB_URI = process.env.MONGO_URI;
    if (!MONGODB_URI) {
        console.error('❌ MONGO_URI 환경 변수가 설정되지 않았습니다.');
        return;
    }
    
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const collection = db.collection('territories');
        
        // 삭제할 영토 이름 목록
        const territoriesToDelete = [
            'Taklamakan Desert',
            'Tibet',
            'India',
            'Chita Oblast',
            'Sakha Republic (Yakutia)',
            'Irkutsk Oblast',
            'Magadan Oblast'
        ];
        
        console.log(`🗑️  삭제할 영토: ${territoriesToDelete.length}개\n`);
        
        for (const name of territoriesToDelete) {
            const result = await collection.deleteOne({ name_type: name });
            
            if (result.deletedCount > 0) {
                console.log(`✅ 삭제됨: ${name}`);
            } else {
                console.log(`⚠️  찾을 수 없음: ${name}`);
            }
        }
        
        console.log('\n✅ 삭제 완료');
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
        console.log('✅ MongoDB 연결 종료');
    }
}

deleteNewTerritories();
