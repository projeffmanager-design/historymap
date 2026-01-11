require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function check() {
  try {
    await client.connect();
    console.log('MongoDB 연결 성공\n');
    
    const db = client.db('realhistory');
    const territories = db.collection('territories');
    
    // 1. 기존 인덱스 확인
    const indexes = await territories.indexes();
    console.log('📋 현재 인덱스:');
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    
    // 2. 잘못된 인덱스 삭제 (bbox.minLat 대신 bbox 자체에 인덱스)
    try {
      await territories.dropIndex('bbox_spatial');
      console.log('\n✅ bbox_spatial 인덱스 삭제');
    } catch (e) {
      console.log('\n⚠️  bbox_spatial 인덱스 없음:', e.message);
    }
    
    // 3. 올바른 개별 필드 인덱스 생성
    console.log('\n📝 새 인덱스 생성 중...');
    
    await territories.createIndex(
      { 
        'bbox.minLat': 1,
        'bbox.maxLat': 1,
        'bbox.minLng': 1,
        'bbox.maxLng': 1
      },
      { name: 'bbox_range' }
    );
    console.log('✅ bbox_range 인덱스 추가 완료');
    
    // 4. 쿼리 성능 테스트
    const bounds = {
      minLat: 35.0,
      maxLat: 38.0,
      minLng: 126.0,
      maxLng: 129.0
    };
    
    console.log('\n⏱️  쿼리 성능 테스트...');
    const start = Date.now();
    const results = await territories.find({
      'bbox.minLat': { $lte: bounds.maxLat },
      'bbox.maxLat': { $gte: bounds.minLat },
      'bbox.minLng': { $lte: bounds.maxLng },
      'bbox.maxLng': { $gte: bounds.minLng }
    }).toArray();
    const elapsed = Date.now() - start;
    
    console.log(`  - 결과: ${results.length}개, 시간: ${elapsed}ms`);
    
    // 5. Explain plan 확인
    const explain = await territories.find({
      'bbox.minLat': { $lte: bounds.maxLat },
      'bbox.maxLat': { $gte: bounds.minLat },
      'bbox.minLng': { $lte: bounds.maxLng },
      'bbox.maxLng': { $gte: bounds.minLng }
    }).explain('executionStats');
    
    console.log('\n📊 Query Execution:');
    console.log(`  - Stage: ${explain.executionStats.executionStages.stage}`);
    console.log(`  - Index Used: ${explain.executionStats.executionStages.indexName || 'NONE (COLLSCAN)'}`);
    console.log(`  - Docs Examined: ${explain.executionStats.totalDocsExamined}`);
    console.log(`  - Docs Returned: ${explain.executionStats.nReturned}`);
    
  } finally {
    await client.close();
  }
}

check().catch(console.error);
