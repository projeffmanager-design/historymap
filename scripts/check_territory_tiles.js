require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function check() {
  try {
    await client.connect();
    console.log('MongoDB 연결 성공\n');
    
    const db = client.db('realhistory');
    
    // 1. territory_tiles 컬렉션 확인
    const territoryTiles = db.collection('territory_tiles');
    const tilesCount = await territoryTiles.countDocuments();
    console.log(`📊 territory_tiles 컬렉션: ${tilesCount}개 문서`);
    
    if (tilesCount > 0) {
      const tileSample = await territoryTiles.findOne({});
      console.log('\n📋 territory_tiles 샘플:');
      console.log('  - _id:', tileSample._id);
      console.log('  - name:', tileSample.name);
      console.log('  - geometry type:', tileSample.geometry?.type);
      console.log('  - coordinates 길이:', tileSample.geometry?.coordinates?.length);
      console.log('  - bbox 존재:', !!tileSample.bbox);
      console.log('  - 전체 키:', Object.keys(tileSample));
      
      if (tileSample.geometry?.coordinates) {
        const coords = tileSample.geometry.coordinates[0];
        if (coords?.length > 0) {
          console.log('\n  첫 좌표 샘플:', coords.slice(0, 2));
        }
      }
    }
    
    // 2. territories 컬렉션도 확인
    const territories = db.collection('territories');
    const terrCount = await territories.countDocuments();
    console.log(`\n📊 territories 컬렉션: ${terrCount}개 문서`);
    
    if (terrCount > 0) {
      const terrSample = await territories.findOne({});
      console.log('\n📋 territories 샘플:');
      console.log('  - _id:', terrSample._id);
      console.log('  - name:', terrSample.name);
      console.log('  - geometry type:', terrSample.geometry?.type);
      console.log('  - bbox 존재:', !!terrSample.bbox);
      console.log('  - 전체 키:', Object.keys(terrSample));
    }
    
  } finally {
    await client.close();
  }
}

check().catch(console.error);
