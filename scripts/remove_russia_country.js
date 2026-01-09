// scripts/remove_russia_country.js
// 큰 러시아 국가 폴리곤 삭제

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

async function removeRussiaCountry() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        
        // 현재 상태
        const totalCount = await territoriesCollection.countDocuments();
        console.log(`📊 현재 영토 개수: ${totalCount}개\n`);
        
        // 러시아 데이터 확인
        const russiaAll = await territoriesCollection.find({
            name: { $regex: 'Russia|러시아' }
        }).toArray();
        
        console.log(`🇷🇺 러시아 관련 데이터: ${russiaAll.length}개`);
        russiaAll.forEach((r, i) => {
            console.log(`   ${i + 1}. ${r.name}`);
        });
        
        // "Russia" 국가 단위만 삭제 (접두사 없는 것)
        console.log('\n🗑️  삭제 대상: Russia (국가 단위)\n');
        
        const deleteResult = await territoriesCollection.deleteMany({
            name: 'Russia'
        });
        
        console.log(`✅ ${deleteResult.deletedCount}개 삭제됨`);
        
        // 최종 확인
        const remaining = await territoriesCollection.countDocuments();
        console.log(`\n📋 남은 영토: ${remaining}개`);
        
        const russiaRegions = await territoriesCollection.countDocuments({
            name: { $regex: '^러시아' }
        });
        console.log(`   🇷🇺 러시아 행정구역: ${russiaRegions}개`);
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

removeRussiaCountry();
