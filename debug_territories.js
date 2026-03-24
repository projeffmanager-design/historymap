require('dotenv').config();
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.MONGO_URI);

(async () => {
  await client.connect();
  const db = client.db('realhistory');
  const col = db.collection('territories');
  
  console.time('query');
  const territories = await col.find({}).toArray();
  console.timeEnd('query');
  console.log('총 영토:', territories.length);
  
  function truncCoords(coords) {
    if (!Array.isArray(coords)) return coords;
    if (typeof coords[0] === 'number') {
      return [Math.round(coords[0] * 100000) / 100000, Math.round(coords[1] * 100000) / 100000];
    }
    return coords.map(truncCoords);
  }
  
  let totalSize = 0;
  let bigDocs = [];
  let errorDocs = [];
  
  for (let i = 0; i < territories.length; i++) {
    const t = territories[i];
    const name = t.properties?.country || t.properties?.name || t.name || String(t._id);
    try {
      // truncCoords 테스트
      if (t.geometry && t.geometry.coordinates) {
        truncCoords(t.geometry.coordinates);
      }
      const s = JSON.stringify(t).length;
      totalSize += s;
      if (s > 2000000) {
        bigDocs.push({ idx: i, id: String(t._id), name, sizeMB: (s/1024/1024).toFixed(2), geoType: t.geometry?.type });
      }
    } catch(e) {
      errorDocs.push({ idx: i, id: String(t._id), name, error: e.message });
    }
  }
  
  console.log('전체 JSON 크기:', (totalSize/1024/1024).toFixed(2), 'MB');
  console.log('2MB 이상 큰 문서:', bigDocs.length, '개');
  bigDocs.forEach(d => console.log('  ', d.name, d.sizeMB, 'MB', d.geoType));
  
  if (errorDocs.length) {
    console.log('❌ 오류 발생 문서:', errorDocs.length, '개');
    errorDocs.forEach(d => console.log('  ', d.name, d.error));
  }
  
  // JSON.stringify 전체 테스트
  console.time('stringify');
  try {
    const json = JSON.stringify(territories);
    console.log('stringify 성공, 크기:', (json.length/1024/1024).toFixed(2), 'MB');
  } catch(e) {
    console.log('❌ stringify 실패:', e.message);
  }
  console.timeEnd('stringify');
  
  await client.close();
})();
