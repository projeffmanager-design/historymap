require('dotenv').config({ path: './env' });
const { connectToDatabase, collections } = require('./db');
const fs = require('fs');

async function main() {
  await connectToDatabase();

  const raw = fs.readFileSync('./mongolia-aimags.json', 'utf8');
  const geojson = JSON.parse(raw);

  // 없는 6개
  const missing = ['Bayankhongor', 'Khövsgöl', 'Darkhan-Uul', 'Orkhon', 'Govisümber', 'Ulaanbaatar'];

  // nameMap: GeoJSON name → { ko, en }
  const infoMap = {
    'Bayankhongor': { ko: '바얀홍고르주', en: 'Bayankhongor' },
    'Khövsgöl': { ko: '흡스굴주', en: 'Khövsgöl' },
    'Darkhan-Uul': { ko: '다르항올주', en: 'Darkhan-Uul' },
    'Orkhon': { ko: '오르홍주', en: 'Orkhon' },
    'Govisümber': { ko: '고비숨베르주', en: 'Govisümber' },
    'Ulaanbaatar': { ko: '울란바토르', en: 'Ulaanbaatar' },
  };

  // OSM relation IDs for reference (approximate)
  const osmMap = {
    'Bayankhongor': 'r270090',
    'Khövsgöl': 'r270093',
    'Darkhan-Uul': 'r1502115',
    'Orkhon': 'r1516822',
    'Govisümber': 'r1649918',
    'Ulaanbaatar': 'r161033',
  };

  let inserted = 0;

  for (const targetName of missing) {
    // find in geojson
    const feature = geojson.features.find(f => {
      const n = f.properties && f.properties.name;
      return n === targetName ||
        (n && n.includes(targetName.split('-')[0])) ||
        (f.properties && f.properties.name_en === targetName);
    });

    if (!feature) {
      console.log(`❌ GeoJSON에서도 못 찾음: ${targetName}`);
      continue;
    }

    const info = infoMap[targetName];
    const osmId = osmMap[targetName];

    // Check if already exists (double check)
    const existing = await collections.territories.findOne({
      $or: [
        { name: targetName },
        { name_en: targetName },
        { name_ko: info.ko },
      ]
    });

    if (existing) {
      console.log(`⚠️ 이미 존재함: ${targetName} → ${existing.name}`);
      continue;
    }

    const doc = {
      osm_id: osmId,
      name: targetName,
      name_en: info.en,
      name_ko: info.ko,
      level: 'province',
      properties: {
        country: 'Mongolia',
        name: targetName,
        name_ko: info.ko,
      },
      geometry: feature.geometry,
      bbox: {
        minLat: null, maxLat: null, minLng: null, maxLng: null
      },
      start_year: -5000,
      end_year: 3000,
      start: -5000,
      end: 3000,
    };

    // compute bbox
    try {
      const coords = [];
      const collectCoords = (geom) => {
        if (!geom) return;
        if (geom.type === 'Polygon') geom.coordinates.forEach(ring => ring.forEach(c => coords.push(c)));
        else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(c => coords.push(c))));
      };
      collectCoords(feature.geometry);
      if (coords.length > 0) {
        doc.bbox.minLng = Math.min(...coords.map(c => c[0]));
        doc.bbox.maxLng = Math.max(...coords.map(c => c[0]));
        doc.bbox.minLat = Math.min(...coords.map(c => c[1]));
        doc.bbox.maxLat = Math.max(...coords.map(c => c[1]));
      }
    } catch(e) {}

    const result = await collections.territories.insertOne(doc);
    console.log(`✅ 삽입: ${targetName} (${info.ko}) → _id: ${result.insertedId}`);
    inserted++;
  }

  console.log(`\n=== 삽입 완료: ${inserted}개 ===`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
