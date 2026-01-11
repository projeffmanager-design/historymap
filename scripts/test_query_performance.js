require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function test() {
  try {
    await client.connect();
    const db = client.db('realhistory');
    const territories = db.collection('territories');
    
    const bounds = {
      minLat: 35.0,
      maxLat: 38.0,
      minLng: 126.0,
      maxLng: 129.0
    };
    
    console.log('⏱️  쿼리 성능 테스트...\n');
    
    // 여러 번 테스트
    for (let i = 1; i <= 3; i++) {
      const start = Date.now();
      const results = await territories.find({
        'bbox.minLat': { $lte: bounds.maxLat },
        'bbox.maxLat': { $gte: bounds.minLat },
        'bbox.minLng': { $lte: bounds.maxLng },
        'bbox.maxLng': { $gte: bounds.minLng }
      }).toArray();
      const elapsed = Date.now() - start;
      
      console.log(`${i}회: ${results.length}개 결과, ${elapsed}ms`);
    }
    
    // Explain 확인
    console.log('\n📊 Query Plan:');
    const explain = await territories.find({
      'bbox.minLat': { $lte: bounds.maxLat },
      'bbox.maxLat': { $gte: bounds.minLat },
      'bbox.minLng': { $lte: bounds.maxLng },
      'bbox.maxLng': { $gte: bounds.minLng }
    }).explain('executionStats');
    
    const stage = explain.executionStats.executionStages;
    console.log(`  - Stage: ${stage.stage}`);
    console.log(`  - Index: ${stage.indexName || 'NONE (Full scan)'}`);
    console.log(`  - Keys Examined: ${explain.executionStats.totalKeysExamined}`);
    console.log(`  - Docs Examined: ${explain.executionStats.totalDocsExamined}`);
    console.log(`  - Docs Returned: ${explain.executionStats.nReturned}`);
    console.log(`  - Execution Time: ${explain.executionStats.executionTimeMillis}ms`);
    
  } finally {
    await client.close();
  }
}

test().catch(console.error);
