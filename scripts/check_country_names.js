// countries 컬렉션에서 한국/중국/러시아/몽골 국가명 확인
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkCountryNames() {
    const client = new MongoClient(process.env.MONGO_URI);
    
    try {
        await client.connect();
        const db = client.db('realhistory');
        
        console.log('🔍 영토에서 사용하는 country_id 확인:\n');
        const territories = await db.collection('territories').find({}).limit(5).toArray();
        territories.forEach(t => {
            console.log(`  ${t.name}: country_id="${t.country_id}"`);
        });
        
        console.log('\n📊 countries 컬렉션에서 매칭되는 국가 찾기:\n');
        const searchNames = ['한국', '중국', '러시아', '몽골', 'Korea', 'China', 'Russia', 'Mongolia'];
        
        for (const name of searchNames) {
            const country = await db.collection('countries').findOne({
                $or: [
                    { name: name },
                    { name_kor: name },
                    { name_eng: name },
                    { name_chi: name }
                ]
            });
            
            if (country) {
                console.log(`✅ "${name}" → ${country.name} (color: ${country.color})`);
            } else {
                console.log(`❌ "${name}" → 매칭 없음`);
            }
        }
        
        console.log('\n💡 해결책:');
        console.log('   1. 영토 데이터의 country_id를 countries._id로 매핑');
        console.log('   2. 또는 countries 컬렉션에 "한국", "중국" 등의 국가 추가');
        
    } catch (error) {
        console.error('오류:', error);
    } finally {
        await client.close();
    }
}

checkCountryNames();
