const { connectToDatabase, collections } = require('./db');
connectToDatabase().then(async () => {
  const territories = await collections.territories.find({}, { projection: { name: 1, level: 1, bbox: 1 } }).toArray();
  
  function getBboxArea(t) {
    if (!t.bbox) return 0;
    if (Array.isArray(t.bbox) && t.bbox.length >= 4) {
      return (t.bbox[2] - t.bbox[0]) * (t.bbox[3] - t.bbox[1]);
    } else if (typeof t.bbox === 'object') {
      const { minLng, maxLng, minLat, maxLat } = t.bbox;
      if (minLng != null && maxLng != null && minLat != null && maxLat != null) {
        return (maxLng - minLng) * (maxLat - minLat);
      }
    }
    return 0;
  }
  
  const sorted = territories.map(t => ({ name: t.name, level: t.level, area: getBboxArea(t) }))
    .sort((a,b) => b.area - a.area);
  
  // 상위 40개 출력
  sorted.slice(0, 40).forEach((t, i) => console.log(i+1, JSON.stringify({name: t.name, level: t.level, area: t.area.toFixed(2)})));
  
  // 면적 분포
  console.log('\n--- 면적 분포 ---');
  const thresholds = [0.01, 0.1, 0.5, 1, 2, 5, 10, 20, 50];
  for (const th of thresholds) {
    console.log('area >', th, ':', sorted.filter(t => t.area > th).length);
  }
  process.exit(0);
});
