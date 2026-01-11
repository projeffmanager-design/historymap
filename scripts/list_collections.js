require('dotenv').config();
const { MongoClient } = require('mongodb');

async function listCollections() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db('realhistory');
        
        const collections = await db.listCollections().toArray();
        console.log('📚 컬렉션 목록:\n');
        for (const coll of collections) {
            const count = await db.collection(coll.name).countDocuments({});
            console.log(`  ${coll.name}: ${count}개`);
        }
        
        // history 컬렉션의 샘플 확인
        console.log('\n📍 history 컬렉션 샘플:');
        const historySample = await db.collection('history').findOne({location: {$exists: true}});
        if (historySample) {
            console.log(`  이름: ${historySample.name}`);
            console.log(`  좌표: ${historySample.location?.coordinates}`);
        }
        
    } finally {
        await client.close();
    }
}

listCollections();
