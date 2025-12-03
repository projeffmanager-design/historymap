// 탄금대 데이터 확인
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function checkTangeumDae() {
    try {
        await client.connect();
        console.log('MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const castlesCollection = db.collection('castle');
        
        // 탄금대 찾기
        const tangeumDae = await castlesCollection.findOne({ _id: new ObjectId("68dc8697d3097eac5873f9c2") });
        
        if (!tangeumDae) {
            console.log('탄금대를 찾을 수 없습니다.');
            return;
        }
        
        console.log('=== 탄금대 전체 데이터 ===\n');
        console.log(JSON.stringify(tangeumDae, null, 2));
        
        console.log('\n\n=== history 배열 상세 ===\n');
        if (tangeumDae.history && tangeumDae.history.length > 0) {
            tangeumDae.history.forEach((record, index) => {
                console.log(`기록 ${index + 1}:`);
                console.log(`  name: ${record.name}`);
                console.log(`  country_id: ${record.country_id}`);
                console.log(`  start_year: ${record.start_year}, start_month: ${record.start_month}`);
                console.log(`  end_year: ${record.end_year}, end_month: ${record.end_month}`);
                console.log(`  is_capital: ${record.is_capital}`);
                console.log(`  is_battle: ${record.is_battle}`);
                console.log('');
            });
        } else {
            console.log('history 배열이 비어있거나 없습니다.');
        }
        
    } catch (error) {
        console.error('오류 발생:', error);
    } finally {
        await client.close();
        console.log('MongoDB 연결 종료');
    }
}

checkTangeumDae();
