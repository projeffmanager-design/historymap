const { connectToDatabase, collections } = require('./db');
connectToDatabase().then(async () => {
  const territories = await collections.territories.find({}, { projection: { name: 1, level: 1, bbox: 1 } }).toArray();

  function getBboxArea(t) {
    if (!t.bbox || typeof t.bbox !== 'object' || Array.isArray(t.bbox)) return 0;
    const { minLng, maxLng, minLat, maxLat } = t.bbox;
    if (minLng == null || maxLng == null || minLat == null || maxLat == null) return 0;
    return (maxLng - minLng) * (maxLat - minLat);
  }

  const THRESHOLD = 2;
  let count = 0;
  for (const t of territories) {
    const area = getBboxArea(t);
    if (area > THRESHOLD) {
      await collections.territories.updateOne(
        { _id: t._id },
        { $set: { level: 'province' } }
      );
      count++;
      console.log(`province: ${t.name} (area: ${area.toFixed(2)}, was: ${t.level})`);
    }
  }
  console.log(`\n총 ${count}개 province로 업데이트 완료`);
  process.exit(0);
});
