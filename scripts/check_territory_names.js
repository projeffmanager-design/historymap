// 영토(territories) 컬렉션의 name 패턴 확인
require('dotenv').config();
const { connectToDatabase } = require('../db');

async function checkTerritoryNames() {
    const { collections } = await connectToDatabase();
    
    try {
        console.log('🔍 영토 이름 패턴 확인 중...\n');
        
        // 모든 영토의 이름 샘플 가져오기 (처음 20개)
        const territories = await collections.territories.find({})
            .limit(20)
            .toArray();
        
        console.log(`📋 총 ${territories.length}개 샘플:\n`);
        
        territories.forEach((territory, index) => {
            console.log(`${index + 1}. "${territory.name}"`);
        });
        
        // "중국" 포함된 영토 찾기
        console.log('\n🔍 "중국" 키워드가 포함된 영토 검색...\n');
        const chinaRelated = await collections.territories.find({
            name: /중국/
        }).toArray();
        
        console.log(`📋 발견: ${chinaRelated.length}개\n`);
        chinaRelated.slice(0, 10).forEach((territory, index) => {
            console.log(`${index + 1}. "${territory.name}"`);
        });
        
    } catch (error) {
        console.error('❌ 오류 발생:', error);
    } finally {
        process.exit(0);
    }
}

checkTerritoryNames();
