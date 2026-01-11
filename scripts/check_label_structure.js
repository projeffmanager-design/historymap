require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkLabelStructure() {
    const client = new MongoClient(process.env.MONGO_URI);
    
    try {
        await client.connect();
        const db = client.db('realhistory');
        const castles = db.collection('castles');
        const countries = db.collection('countries');
        
        // countries 컬렉션 확인
        const allCountries = await countries.find({}).limit(5).toArray();
        
        console.log('📋 국가 데이터 샘플:\n');
        allCountries.forEach(country => {
            console.log(`  이름: ${country.name}`);
            console.log(`  라벨 필드들:`);
            console.log(`    - label_lat: ${country.label_lat || '❌ 없음'}`);
            console.log(`    - label_lng: ${country.label_lng || '❌ 없음'}`);
            console.log(`    - label_name: ${country.label_name || '❌ 없음'}`);
            console.log(`    - label_size: ${country.label_size || '❌ 없음'}`);
            console.log(`    - label_color: ${country.label_color || '❌ 없음'}`);
            console.log(`  start_year: ${country.start_year}`);
            console.log(`  end_year: ${country.end_year}`);
            console.log(`  전체 필드: ${Object.keys(country).join(', ')}`);
            console.log('  ---');
        });
        
        console.log(`\n총 국가 수: ${await countries.countDocuments()}개`);
        
    } finally {
        await client.close();
    }
}

checkLabelStructure();
