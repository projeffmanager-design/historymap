const uri = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';
const { MongoClient } = require('mongodb');
async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('realhistory');
  
  const all = await db.collection('territories').find({}).project({
    name: 1, osm_id: 1, bbox: 1, properties: 1
  }).toArray();
  
  // 각 영토의 bbox 면적 계산
  const withArea = all.map(t => {
    let area = 0;
    if (t.bbox && t.bbox.maxLng != null) {
      area = (t.bbox.maxLng - t.bbox.minLng) * (t.bbox.maxLat - t.bbox.minLat);
    }
    return { ...t, area };
  });
  
  // OSM Import 영토만 따로
  const osmTerrs = withArea.filter(t => t.properties && t.properties.source === 'OSM Import');
  
  // 면적 히스토그램
  const buckets = { '<1': 0, '1-5': 0, '5-20': 0, '20-100': 0, '>100': 0 };
  osmTerrs.forEach(t => {
    if (t.area < 1) buckets['<1']++;
    else if (t.area < 5) buckets['1-5']++;
    else if (t.area < 20) buckets['5-20']++;
    else if (t.area < 100) buckets['20-100']++;
    else buckets['>100']++;
  });
  console.log('OSM 영토 면적 분포:', buckets);
  
  // 5도² 기준으로 province 후보 vs city 후보
  const provinceLevel = osmTerrs.filter(t => t.area >= 5);
  const cityLevel = osmTerrs.filter(t => t.area < 5);
  console.log('\nprovince급 (면적 >= 5도²):', provinceLevel.length, '개');
  provinceLevel.forEach(t => console.log(' ', t.area.toFixed(1), t.name, t.osm_id || ''));
  console.log('\ncity급 (면적 < 5도²):', cityLevel.length, '개');
  cityLevel.slice(0, 20).forEach(t => console.log(' ', t.area.toFixed(2), t.name, t.osm_id || ''));
  
  // 같은 이름/지역이 province + city 두 레벨로 중복 존재하는지 확인
  // (province 안에 city가 포함되는지 bbox 겹침으로 확인)
  console.log('\n=== 겹침 관계 분석 (province 안에 있는 city 찾기) ===');
  let overlapCount = 0;
  provinceLevel.forEach(prov => {
    const cities = cityLevel.filter(city => {
      if (!city.bbox || !prov.bbox) return false;
      const cityLat = (city.bbox.minLat + city.bbox.maxLat) / 2;
      const cityLng = (city.bbox.minLng + city.bbox.maxLng) / 2;
      return cityLat >= prov.bbox.minLat && cityLat <= prov.bbox.maxLat &&
             cityLng >= prov.bbox.minLng && cityLng <= prov.bbox.maxLng;
    });
    if (cities.length > 0) {
      console.log(`  Province: ${prov.name} → 내부 cities: ${cities.map(c => c.name).join(', ')}`);
      overlapCount += cities.length;
    }
  });
  console.log('총 겹침 쌍:', overlapCount);

  await client.close();
}
main().catch(console.error);
