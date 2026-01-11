require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkMarkers() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db('realhistory');
        
        const count = await db.collection('castle').countDocuments({location: {$exists: true}});
        console.log(`총 ${count}개 마커 (location 있음)`);
        
        const totalCount = await db.collection('castle').countDocuments({});
        console.log(`총 ${totalCount}개 castle 문서`);
        
        const sample = await db.collection('castle').findOne({});
        console.log('\n샘플 castle 문서:');
        if (sample) {
            console.log(JSON.stringify(sample, null, 2).substring(0, 800));
        }
        
    } finally {
        await client.close();
    }
}

checkMarkers();
