const fs = require('fs');
const path = require('path');
const { connectToDatabase, collections } = require('./db');

// JSON 파일들에서 territory name 수집
const jsonFiles = [
  'china-provinces.json','china.json','korea-provinces.json',
  'korea-whole-detailed.json','korea-whole.json','mongolia-aimags.json',
  'mongolia-only.json','north-korea-only.json','north-korea.json',
  'russia-federal-subjects.json','russia-regions.json',
  'south-korea-outline.json','world-countries.json'
];

const fileEntries = [];
for (const fname of jsonFiles) {
  const fpath = path.join(__dirname, fname);
  if (!fs.existsSync(fpath)) continue;
  try {
    const data = JSON.parse(fs.readFileSync(fpath, 'utf8'));
    const features = data.features || (data.type === 'Feature' ? [data] : []);
    for (const f of features) {
      const p = f.properties || {};
      const name = p.name || p.NAME || p.name_en || p.admin || p.ADMIN || '';
      const name_ko = p.name_ko || p['name:ko'] || '';
      fileEntries.push({ file: fname, name, name_ko });
    }
  } catch(e) {}
}

connectToDatabase().then(async () => {
  const dbTerritories = await collections.territories.find({}, { projection: { name: 1, name_ko: 1, osm_id: 1 } }).toArray();
  const dbNames = new Set(dbTerritories.map(t => t.name?.trim()).filter(Boolean));
  const fileNames = new Set(fileEntries.map(e => e.name?.trim()).filter(Boolean));

  console.log('\n=== DB에만 있고 JSON 파일에 없는 territories ===');
  for (const t of dbTerritories) {
    if (t.name && !fileNames.has(t.name.trim())) {
      console.log(`  DB전용: ${t.name} (${t.name_ko || ''})`);
    }
  }

  console.log('\n=== JSON 파일에만 있고 DB에 없는 features ===');
  for (const e of fileEntries) {
    if (e.name && !dbNames.has(e.name.trim())) {
      console.log(`  파일전용 [${e.file}]: ${e.name} (${e.name_ko || ''})`);
    }
  }

  console.log('\n=== JSON 파일별 요약 ===');
  for (const fname of jsonFiles) {
    const entries = fileEntries.filter(e => e.file === fname);
    const inDB = entries.filter(e => e.name && dbNames.has(e.name.trim()));
    console.log(`  ${fname}: ${entries.length}개 features, DB매칭: ${inDB.length}개`);
  }

  process.exit(0);
});
