// scripts/remove_large_duplicates.js
// 상세 행정구역이 있는 국가의 큰 폴리곤 제거

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

async function removeLargeDuplicates() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        
        // 현재 상태 확인
        const totalCount = await territoriesCollection.countDocuments();
        console.log(`📊 현재 영토 개수: ${totalCount}개\n`);
        
        // 삭제할 큰 국가 폴리곤 (상세 행정구역이 있는 경우)
        const toDelete = [
            'China',           // 중국 34개 성이 있음
            'South Korea',     // 한국 17개 시도가 있음
            'North Korea',     // 북한은 상세 데이터 없지만 남한이랑 겹침
            'Mongolia'         // 몽골은 상세 데이터 없음 - 유지할지 고민
        ];
        
        console.log('🗑️  삭제할 큰 국가 폴리곤:');
        toDelete.forEach(name => console.log(`   - ${name}`));
        console.log('');
        
        const deleteResult = await territoriesCollection.deleteMany({
            name: { $in: toDelete }
        });
        
        console.log(`✅ ${deleteResult.deletedCount}개 삭제됨\n`);
        
        // 남은 데이터 확인
        const remaining = await territoriesCollection.countDocuments();
        console.log(`📋 남은 영토: ${remaining}개`);
        
        // 한국 상세 행정구역
        const koreaCount = await territoriesCollection.countDocuments({
            name: { $regex: '서울|부산|경기|강원|충청|전라|경상|제주|대구|인천|광주|대전|울산|세종' }
        });
        console.log(`   🇰🇷 한국 시도: ${koreaCount}개`);
        
        // 중국 상세 행정구역  
        const chinaCount = await territoriesCollection.countDocuments({
            name: { $regex: '^중국' }
        });
        console.log(`   🇨🇳 중국 성: ${chinaCount}개`);
        
        // 나머지 국가들
        const otherCount = remaining - koreaCount - chinaCount;
        console.log(`   🌍 기타 국가: ${otherCount}개`);
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

removeLargeDuplicates();
