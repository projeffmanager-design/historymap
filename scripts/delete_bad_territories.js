/**
 * delete_bad_territories.js - 비정상 영토 삭제 (대한민국, 청주시)
 */
const { MongoClient, ObjectId } = require('mongodb');

const LOCAL_URI = 'mongodb://localhost:27017';
const ATLAS_URI = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';

const BAD_NAMES = ['대한민국', '청주시'];

async function deleteFrom(uri, dbName) {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    
    for (const name of BAD_NAMES) {
        const t = await db.collection('territories').findOne({ name });
        if (t) {
            await db.collection('territories').deleteOne({ _id: t._id });
            console.log(`  ✅ ${dbName}: ${name} (${t._id}) 삭제`);
        } else {
            console.log(`  ⏭️ ${dbName}: ${name} 없음`);
        }
    }
    
    const count = await db.collection('territories').countDocuments();
    console.log(`  📊 ${dbName} 남은 영토: ${count}개\n`);
    
    await client.close();
}

async function main() {
    console.log('=== 로컬 DB ===');
    await deleteFrom(LOCAL_URI, 'koreahistory');
    
    console.log('=== Atlas DB ===');
    await deleteFrom(ATLAS_URI, 'realhistory');
}

main().catch(console.error);
