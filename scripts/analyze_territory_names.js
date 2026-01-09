// 영토(territories) 컬렉션의 모든 name 패턴 분석
require('dotenv').config();
const { connectToDatabase } = require('../db');

async function analyzeTerritoryNames() {
    const { collections } = await connectToDatabase();
    
    try {
        console.log('🔍 모든 영토 이름 분석 중...\n');
        
        const territories = await collections.territories.find({}).toArray();
        
        console.log(`📋 총 ${territories.length}개 영토\n`);
        
        // 한글이 포함된 이름
        const koreanNames = territories.filter(t => /[가-힣]/.test(t.name));
        console.log(`🇰🇷 한글 포함: ${koreanNames.length}개`);
        if (koreanNames.length > 0) {
            console.log('샘플:');
            koreanNames.slice(0, 10).forEach(t => console.log(`  - "${t.name}"`));
        }
        
        // 중국어 문자가 포함된 이름
        const chineseNames = territories.filter(t => /[\u4e00-\u9fff]/.test(t.name));
        console.log(`\n🇨🇳 중국어 포함: ${chineseNames.length}개`);
        if (chineseNames.length > 0) {
            console.log('샘플:');
            chineseNames.slice(0, 10).forEach(t => console.log(`  - "${t.name}"`));
        }
        
        // 영문자가 포함된 이름
        const englishNames = territories.filter(t => /[a-zA-Z]/.test(t.name));
        console.log(`\n🇺🇸 영문 포함: ${englishNames.length}개`);
        if (englishNames.length > 0) {
            console.log('샘플:');
            englishNames.slice(0, 10).forEach(t => console.log(`  - "${t.name}"`));
        }
        
        // 특정 패턴 검색
        const patterns = [
            { name: '"중국 "으로 시작', regex: /^중국 / },
            { name: '"중국" 포함', regex: /중국/ },
            { name: '"China" 포함', regex: /China/i },
            { name: '공백 포함', regex: / / }
        ];
        
        console.log('\n🔍 패턴별 분석:');
        patterns.forEach(({ name, regex }) => {
            const matched = territories.filter(t => regex.test(t.name));
            console.log(`  ${name}: ${matched.length}개`);
            if (matched.length > 0 && matched.length <= 5) {
                matched.forEach(t => console.log(`    - "${t.name}"`));
            }
        });
        
    } catch (error) {
        console.error('❌ 오류 발생:', error);
    } finally {
        process.exit(0);
    }
}

analyzeTerritoryNames();
