require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function check() {
  try {
    await client.connect();
    console.log('MongoDB 연결 성공\n');
    
    const db = client.db();
    console.log('현재 DB 이름:', db.databaseName);
    
    const collections = await db.listCollections().toArray();
    console.log('\n📋 전체 컬렉션 목록:');
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`  - ${col.name}: ${count}개 문서`);
    }
    
  } finally {
    await client.close();
  }
}

check().catch(console.error);
