// scripts/check_korea_overlap.js
// 한국 행정구역 데이터 중복 확인

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

async function checkKoreaOverlap() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        
        // 한국 관련 모든 데이터 찾기
        const koreaAll = await territoriesCollection.find({
            $or: [
                { name: { $regex: '서울|부산|경기|강원|충청|전라|경상|제주|대구|인천|광주|대전|울산|세종' } },
                { name: 'South Korea' },
                { name: 'North Korea' },
                { name: '남한' },
                { name: '북한' }
            ]
        }).toArray();
        
        console.log(`🇰🇷 한국 관련 영토: ${koreaAll.length}개\n`);
        
        // 분류
        const provinces = koreaAll.filter(k => 
            k.name.includes('서울') || k.name.includes('부산') || 
            k.name.includes('경기') || k.name.includes('강원') ||
            k.name.includes('충청') || k.name.includes('전라') ||
            k.name.includes('경상') || k.name.includes('제주') ||
            k.name.includes('대구') || k.name.includes('인천') ||
            k.name.includes('광주') || k.name.includes('대전') ||
            k.name.includes('울산') || k.name.includes('세종')
        );
        
        const countries = koreaAll.filter(k => 
            k.name === 'South Korea' || k.name === 'North Korea' ||
            k.name === '남한' || k.name === '북한'
        );
        
        console.log('📋 시도 행정구역 (17개):');
        provinces.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.name} (${p.start_year}년부터)`);
        });
        
        console.log(`\n📋 국가 단위 (${countries.length}개):`);
        countries.forEach((c, i) => {
            console.log(`   ${i + 1}. ${c.name} (${c.start_year}년부터)`);
        });
        
        if (countries.length > 0) {
            console.log('\n⚠️  경고: 국가 단위와 시도가 겹칠 수 있습니다!');
            console.log('   해결: South Korea, 남한을 삭제하고 시도만 유지');
        }
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

checkKoreaOverlap();
