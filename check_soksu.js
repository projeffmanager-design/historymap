const {connectToDatabase} = require('./db');
connectToDatabase().then(async ({collections: c}) => {
  // castles에서 속수 검색
  const castleRiver = await c.castles.find({name: {$regex: '속수', $options: 'i'}}).toArray();
  console.log('castles에서 속수:', JSON.stringify(castleRiver.map(d => ({name: d.name, type: d.type, lat: d.lat, lng: d.lng}))));
  
  // naturalFeatures에서 속수 검색
  const natRiver = await c.naturalFeatures.find({name: {$regex: '속수', $options: 'i'}}).toArray();
  console.log('naturalFeatures에서 속수:', JSON.stringify(natRiver.map(d => ({name: d.name, type: d.type, hasGeom: !!d.geometry, geomType: d.geometry && d.geometry.type}))));
  
  // 최근 추가된 naturalFeatures (최근 10개)
  const recent = await c.naturalFeatures.find({}).sort({_id: -1}).limit(10).toArray();
  console.log('\n최근 10개 naturalFeatures:');
  recent.forEach(d => console.log(' -', d.name, '| type:', d.type, '| geometry:', d.geometry ? d.geometry.type : 'NONE'));
  
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
