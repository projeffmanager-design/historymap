require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function checkSize() {
  try {
    await client.connect();
    console.log('✅ MongoDB 연결\n');
    
    const db = client.db('realhistory');
    const territories = db.collection('territories');
    
    // 1개 샘플 가져오기
    const sample = await territories.findOne({});
    
    if (sample) {
      const json = JSON.stringify(sample);
      const sizeKB = (json.length / 1024).toFixed(2);
      const coordCount = sample.geometry?.coordinates?.[0]?.length || 0;
      
      console.log('📊 Territory 데이터 크기:');
      console.log(`  - 샘플: ${sample.name}`);
      console.log(`  - JSON 크기: ${sizeKB} KB`);
      console.log(`  - 좌표 개수: ${coordCount}개`);
    }
    
    // 전체 데이터 크기 추정
    const count = await territories.countDocuments();
    const stats = await db.command({ collStats: 'territories' });
    const totalSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(`\n📦 전체 컬렉션:`);
    console.log(`  - 문서 수: ${count}개`);
    console.log(`  - 총 크기: ${totalSizeMB} MB`);
    console.log(`  - 평균: ${(totalSizeMB / count * 1024).toFixed(2)} KB/문서`);
    
    console.log(`\n⚠️  ${totalSizeMB}MB 전송 → 네트워크 병목 가능성`);
    
  } finally {
    await client.close();
  }
}

checkSize().catch(console.error);
