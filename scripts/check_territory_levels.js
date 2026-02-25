const uri = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';
const { MongoClient } = require('mongodb');
async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('realhistory');
  
  const all = await db.collection('territories').find({}).project({
    name: 1, osm_id: 1, bbox: 1, properties: 1, start: 1, end: 1, level: 1
  }).toArray();
  
  // bbox 면적으로 크기 분포 확인
  const sizes = all.map(t => {
    if (!t.bbox) return { name: t.name, area: 0, osm: t.osm_id };
    const w = (t.bbox.maxLng - t.bbox.minLng);
    const h = (t.bbox.maxLat - t.bbox.minLat);
    return { name: t.name, area: parseFloat((w * h).toFixed(4)), osm: t.osm_id };
  }).sort((a, b) => b.area - a.area);
  
  console.log('큰 영토 TOP 15:');
  sizes.slice(0, 15).forEach(s => console.log(String(s.area).padStart(10), s.name, s.osm || ''));
  console.log('\n작은 영토 TOP 15:');
  sizes.slice(-15).forEach(s => console.log(String(s.area).padStart(10), s.name, s.osm || ''));
  
  // properties 필드 확인
  const withProps = all.filter(t => t.properties && Object.keys(t.properties).length > 0);
  console.log('\nproperties 있는 영토 수:', withProps.length);
  if (withProps.length > 0) {
    withProps.slice(0, 3).forEach(t => console.log(' ', t.name, JSON.stringify(t.properties)));
  }
  
  // OSM import된 것들 확인 (중국 省 단위 등)
  const osmImported = all.filter(t => t.properties && t.properties.source === 'OSM Import');
  console.log('\nOSM Import 영토:', osmImported.length, '개');
  osmImported.slice(0, 10).forEach(t => {
    const area = t.bbox ? parseFloat(((t.bbox.maxLng-t.bbox.minLng)*(t.bbox.maxLat-t.bbox.minLat)).toFixed(2)) : 0;
    console.log(' area:', area, t.name, t.osm_id || '');
  });

  await client.close();
}
main().catch(console.error);
