require('dotenv').config();
const { MongoClient } = require('mongodb');

async function addModernCountries() {
    const client = new MongoClient(process.env.MONGO_URI);
    
    try {
        await client.connect();
        const db = client.db('realhistory');
        const countriesCollection = db.collection('countries');
        
        // 현대 국가 데이터 (역사 국가의 색상을 계승)
        const modernCountries = [
            {
                name: 'South Korea',
                name_en: 'South Korea',
                color: '#ffffff', // 조선의 색상
                ethnicity: ['한국'],
                start_year: 1948,
                end_year: 9999
            },
            {
                name: 'North Korea',
                name_en: 'North Korea', 
                color: '#c70000', // 조선민주주의인민공화국의 색상
                ethnicity: ['한국'],
                start_year: 1948,
                end_year: 9999
            },
            {
                name: 'China',
                name_en: 'China',
                color: '#ff6666', // 중화인민공화국의 색상
                ethnicity: ['한족'],
                start_year: 1949,
                end_year: 9999
            },
            {
                name: 'Mongolia',
                name_en: 'Mongolia',
                color: '#4d6b94', // 몽골 색상
                ethnicity: ['몽골'],
                start_year: 1911,
                end_year: 9999
            },
            {
                name: 'Russia',
                name_en: 'Russia',
                color: '#6495ED', // 러시아 색상 (CornflowerBlue)
                ethnicity: ['슬라브'],
                start_year: 1991,
                end_year: 9999
            },
            {
                name: 'Japan',
                name_en: 'Japan',
                color: '#FF1744', // 일본 색상 (빨간색 계열)
                ethnicity: ['일본'],
                start_year: 1868,
                end_year: 9999
            }
        ];
        
        console.log('📝 현대 국가 추가 중...\n');
        
        for (const country of modernCountries) {
            // 이미 존재하는지 확인
            const existing = await countriesCollection.findOne({
                $or: [
                    { name: country.name },
                    { name_en: country.name_en }
                ]
            });
            
            if (existing) {
                console.log(`⏭️  ${country.name}: 이미 존재함 (건너뛰기)`);
            } else {
                await countriesCollection.insertOne(country);
                console.log(`✅ ${country.name}: 추가됨 (색상: ${country.color})`);
            }
        }
        
        console.log('\n🎉 완료!');
        
        // 확인
        console.log('\n📊 추가된 국가 확인:');
        const addedCountries = await countriesCollection.find({
            name_en: { $in: modernCountries.map(c => c.name_en) }
        }).project({ name: 1, name_en: 1, color: 1 }).toArray();
        
        addedCountries.forEach(c => {
            console.log(`  ${c.name_en}: ${c.color}`);
        });
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
    }
}

addModernCountries();
