// scripts/check_all_territories.js
// 현재 영토 데이터 상세 확인

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

async function checkAllTerritories() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        
        // 전체 개수
        const totalCount = await territoriesCollection.countDocuments();
        console.log(`📊 전체 영토 개수: ${totalCount}개\n`);
        
        // 한국 행정구역
        const koreaRegions = await territoriesCollection.find({
            name: { $regex: '서울|부산|경기|강원|충청|전라|경상|제주|대구|인천|광주|대전|울산|세종' }
        }).toArray();
        
        console.log(`🇰🇷 한국 행정구역: ${koreaRegions.length}개`);
        koreaRegions.forEach((r, i) => {
            console.log(`   ${i + 1}. ${r.name}`);
        });
        
        // 몽골
        const mongolia = await territoriesCollection.find({
            name: { $regex: 'Mongolia|몽골|蒙古' }
        }).toArray();
        
        console.log(`\n🇲🇳 몽골: ${mongolia.length}개`);
        mongolia.forEach(m => console.log(`   - ${m.name}`));
        
        // 일본
        const japan = await territoriesCollection.find({
            name: { $regex: 'Japan|일본|日本' }
        }).toArray();
        
        console.log(`\n🇯🇵 일본: ${japan.length}개`);
        japan.forEach(j => console.log(`   - ${j.name}`));
        
        // 베트남
        const vietnam = await territoriesCollection.find({
            name: { $regex: 'Vietnam|베트남' }
        }).toArray();
        
        console.log(`\n🇻🇳 베트남: ${vietnam.length}개`);
        vietnam.forEach(v => console.log(`   - ${v.name}`));
        
        // 중국
        const chinaCount = await territoriesCollection.countDocuments({
            name: { $regex: '^중국|^China' }
        });
        
        console.log(`\n🇨🇳 중국: ${chinaCount}개 (성 단위)`);
        
        // 유럽 샘플
        const europeSample = await territoriesCollection.find({
            name: { $regex: 'France|Germany|United Kingdom|Italy|Spain' }
        }).toArray();
        
        console.log(`\n🇪🇺 유럽 샘플: ${europeSample.length}개`);
        europeSample.forEach(e => console.log(`   - ${e.name}`));
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

checkAllTerritories();
