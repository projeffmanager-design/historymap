require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkCountries() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db('realhistory');
        
        // 한국 관련 국가들
        console.log('🇰🇷 한국 관련 국가:');
        const koreaCountries = await db.collection('countries')
            .find({
                $or: [
                    {name: /한국|조선|고려|신라|백제|고구려/},
                    {name_en: /Korea|Joseon|Goryeo|Silla|Baekje|Goguryeo/i}
                ]
            })
            .project({name: 1, name_en: 1, color: 1})
            .toArray();
        
        koreaCountries.forEach(c => {
            console.log(`  ${c.name || c.name_en}: ${c.color || '색상 없음'}`);
        });
        
        // 중국 관련 국가들
        console.log('\n🇨🇳 중국 관련 국가:');
        const chinaCountries = await db.collection('countries')
            .find({
                $or: [
                    {name: /중국|청|명|원|송|당/},
                    {name_en: /China|Qing|Ming|Yuan|Song|Tang/i}
                ]
            })
            .project({name: 1, name_en: 1, color: 1})
            .limit(10)
            .toArray();
        
        chinaCountries.forEach(c => {
            console.log(`  ${c.name || c.name_en}: ${c.color || '색상 없음'}`);
        });
        
        // South Korea 정확한 이름 검색
        console.log('\n🔍 "South Korea" 검색:');
        const southKorea = await db.collection('countries')
            .find({
                $or: [
                    {name: 'South Korea'},
                    {name_en: 'South Korea'},
                    {name: '대한민국'},
                    {name: /^한국$/}
                ]
            })
            .project({name: 1, name_en: 1, color: 1})
            .toArray();
        
        if (southKorea.length > 0) {
            southKorea.forEach(c => {
                console.log(`  ${c.name || c.name_en}: ${c.color || '색상 없음'}`);
            });
        } else {
            console.log('  ⚠️ South Korea 또는 대한민국을 찾을 수 없음');
        }
        
        // China 정확한 이름 검색
        console.log('\n🔍 "China" 검색:');
        const china = await db.collection('countries')
            .find({
                $or: [
                    {name: 'China'},
                    {name_en: 'China'},
                    {name: '중국'},
                    {name: /^중화/}
                ]
            })
            .project({name: 1, name_en: 1, color: 1})
            .toArray();
        
        if (china.length > 0) {
            china.forEach(c => {
                console.log(`  ${c.name || c.name_en}: ${c.color || '색상 없음'}`);
            });
        } else {
            console.log('  ⚠️ China 또는 중국을 찾을 수 없음');
        }
        
    } finally {
        await client.close();
    }
}

checkCountries();
