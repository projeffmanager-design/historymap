const {connectToDatabase} = require('./db');
connectToDatabase().then(async ({collections: c}) => {
  const rivers = await c.naturalFeatures.find({type:'river'}).toArray();
  console.log('총 강 document 수:', rivers.length);
  const badIds = [];
  rivers.forEach(r => {
    let firstCoord = null;
    if (r.geometry.type === 'LineString') firstCoord = r.geometry.coordinates[0];
    else if (r.geometry.type === 'MultiLineString') firstCoord = r.geometry.coordinates[0] && r.geometry.coordinates[0][0];
    if (!firstCoord) return;
    const lng = firstCoord[0], lat = firstCoord[1];
    // 아시아 범위 밖이면 잘못된 데이터 (경도 -200~50 또는 180 이상, 위도 -10~80 범위만 허용)
    const isAsiaRange = lng >= 60 && lng <= 160 && lat >= -10 && lat <= 75;
    if (!isAsiaRange) {
      console.log('BAD:', r.name, r._id, '| lng:', lng, 'lat:', lat);
      badIds.push(r._id);
    } else {
      console.log('OK :', r.name, r._id, '| lng:', lng, 'lat:', lat);
    }
  });
  console.log('\n잘못된 좌표 document 수:', badIds.length);
  if (badIds.length > 0) {
    const result = await c.naturalFeatures.deleteMany({_id: {$in: badIds}});
    console.log('삭제 완료:', result.deletedCount, '개');
  }
  const remaining = await c.naturalFeatures.countDocuments({type:'river'});
  console.log('남은 강 document 수:', remaining);
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
