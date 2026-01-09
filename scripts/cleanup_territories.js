// scripts/cleanup_territories.js
// 큰 국가 단위 폴리곤 삭제하고 상세 행정구역만 유지

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

async function cleanupTerritories() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        
        // 현재 상태 확인
        const allTerritories = await territoriesCollection.find({}).toArray();
        console.log(`📊 현재 영토 개수: ${allTerritories.length}개\n`);
        
        // 삭제할 대상: South Korea, North Korea, Mongolia, China (국가 단위)
        const toDelete = [
            'South Korea',
            'North Korea', 
            'Mongolia',
            'China',
            '남한',
            '북한'
        ];
        
        console.log('🗑️  삭제할 대상:');
        toDelete.forEach(name => console.log(`   - ${name}`));
        console.log('');
        
        const deleteResult = await territoriesCollection.deleteMany({
            name: { $in: toDelete }
        });
        
        console.log(`✅ ${deleteResult.deletedCount}개 삭제됨\n`);
        
        // 남은 데이터 확인
        const remaining = await territoriesCollection.countDocuments();
        console.log(`📋 남은 영토: ${remaining}개`);
        
        // 한국 행정구역 확인
        const koreaRegions = await territoriesCollection.find({
            name: { $regex: '서울|부산|경기|강원|충청|전라|경상|제주|대구|인천|광주|대전|울산|세종' }
        }).toArray();
        
        console.log(`   🇰🇷 한국 시도: ${koreaRegions.length}개`);
        koreaRegions.forEach((r, i) => {
            console.log(`      ${i + 1}. ${r.name}`);
        });
        
        // 중국 행정구역 확인
        const chinaProvinces = await territoriesCollection.find({
            name: { $regex: '^중국' }
        }).toArray();
        
        console.log(`\n   🇨🇳 중국 성: ${chinaProvinces.length}개`);
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

cleanupTerritories();
