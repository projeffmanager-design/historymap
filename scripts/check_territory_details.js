require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkDetails() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db('realhistory');
        
        console.log('🇰🇷 한국 행정구역:');
        const koreaProvinces = await db.collection('territories')
            .find({country: 'South Korea'})
            .project({name: 1, name_en: 1})
            .sort({name: 1})
            .toArray();
        koreaProvinces.forEach(p => {
            console.log(`  - ${p.name} (${p.name_en})`);
        });
        
        console.log('\n🇨🇳 중국 행정구역:');
        const chinaProvinces = await db.collection('territories')
            .find({country: 'China'})
            .project({name: 1, name_en: 1})
            .sort({name: 1})
            .toArray();
        chinaProvinces.forEach(p => {
            console.log(`  - ${p.name || p.name_en}`);
        });
        
        console.log('\n🇷🇺 러시아 행정구역:');
        const russiaProvinces = await db.collection('territories')
            .find({country: 'Russia'})
            .project({name: 1, name_en: 1})
            .sort({name: 1})
            .toArray();
        russiaProvinces.forEach(p => {
            console.log(`  - ${p.name || p.name_en}`);
        });
        
        console.log('\n🌍 기타 국가 (일부):');
        const otherCountries = await db.collection('territories')
            .find({type: 'country'})
            .project({name: 1, name_en: 1})
            .sort({name: 1})
            .limit(20)
            .toArray();
        otherCountries.forEach(c => {
            console.log(`  - ${c.name || c.name_en}`);
        });
        
    } finally {
        await client.close();
    }
}

checkDetails();
