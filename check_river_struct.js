const {connectToDatabase} = require('./db');
connectToDatabase().then(async ({collections: c}) => {
  const doc = await c.naturalFeatures.findOne({});
  if (!doc) { console.log('No documents'); process.exit(0); }
  console.log('fields:', Object.keys(doc));
  console.log('type:', doc.type);
  console.log('has geometry:', !!doc.geometry);
  console.log('geometry.type:', doc.geometry && doc.geometry.type);
  console.log('has coordinates:', !!doc.coordinates);
  
  // 속수 추가된 최근 데이터 확인
  const recentDocs = await c.naturalFeatures.find({type:'river'}).sort({_id:-1}).limit(5).toArray();
  console.log('\n최근 5개 강 데이터:');
  recentDocs.forEach(d => {
    console.log(' -', d.name, '| geometry:', d.geometry ? d.geometry.type : 'MISSING', '| start_year:', d.start_year);
  });
  
  // geometry 없는 문서 수
  const noGeom = await c.naturalFeatures.countDocuments({type:'river', geometry: {$exists: false}});
  console.log('\ngeometry 없는 강 문서 수:', noGeom);
  
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
