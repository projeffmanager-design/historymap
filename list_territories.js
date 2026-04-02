const { connectToDatabase, collections } = require('./db');
connectToDatabase().then(async () => {
  const territories = await collections.territories.find({}, { projection: { name: 1, name_ko: 1, level: 1, osm_id: 1 } }).toArray();
  console.log('=== DB territories (' + territories.length + '개) ===');
  territories.forEach(t => {
    console.log(JSON.stringify({ name: t.name, name_ko: t.name_ko || '', level: t.level || 'null', osm_id: t.osm_id || '' }));
  });
  process.exit(0);
});
