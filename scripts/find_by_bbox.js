#!/usr/bin/env node
// Usage:
// node scripts/find_by_bbox.js --osm 3226004
// or
// node scripts/find_by_bbox.js --bbox minLat minLng maxLat maxLng

const { MongoClient } = require('mongodb');
const https = require('https');
const fs = require('fs');

function fetchNominatimGeo(osmId) {
  return new Promise((resolve, reject) => {
    const url = `/lookup?osm_ids=R${osmId}&format=geojson&polygon_geojson=1`;
    const options = {
      hostname: 'nominatim.openstreetmap.org',
      path: url,
      method: 'GET',
      headers: { 'User-Agent': 'KoreaHistoryMap/1.0' }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function calculateBBox(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  let minLat=Infinity, maxLat=-Infinity, minLng=Infinity, maxLng=-Infinity;
  function process(coords) {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    } else coords.forEach(process);
  }
  process(geometry.coordinates);
  if (minLat===Infinity) return null;
  return { minLat, maxLat, minLng, maxLng };
}

async function main() {
  const args = process.argv.slice(2);
  let osm = null; let bbox = null;
  if (args[0] === '--osm' && args[1]) osm = args[1];
  else if (args[0] === '--bbox' && args.length >= 5) {
    const minLat = parseFloat(args[1]); const minLng = parseFloat(args[2]); const maxLat = parseFloat(args[3]); const maxLng = parseFloat(args[4]);
    bbox = { minLat, minLng, maxLat, maxLng };
  } else {
    console.error('Usage: --osm <id> OR --bbox minLat minLng maxLat maxLng'); process.exit(1);
  }

  try {
    if (osm) {
      console.log('Fetching GeoJSON from Nominatim for relation', osm);
      const geo = await fetchNominatimGeo(osm);
      if (!geo.features || geo.features.length===0) { console.log('No geo found'); process.exit(0); }
      const feature = geo.features[0];
      bbox = calculateBBox(feature.geometry || feature);
      console.log('Computed bbox:', bbox);
    }

    const env = fs.readFileSync('.env','utf8');
    const m = env.match(/MONGO_URI\s*=\s*\"(.+?)\"/);
    const uri = process.env.MONGO_URI || (m && m[1]);
    if (!uri) throw new Error('MONGO_URI not found');
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('realhistory');
    const col = db.collection('territories');

    const query = {
      $and: [
        { 'bbox.maxLat': { $gte: bbox.minLat } },
        { 'bbox.minLat': { $lte: bbox.maxLat } },
        { 'bbox.maxLng': { $gte: bbox.minLng } },
        { 'bbox.minLng': { $lte: bbox.maxLng } }
      ]
    };

    const docs = await col.find(query).project({ _id:1, name:1, name_ko:1, osm_id:1, bbox:1 }).toArray();
    console.log('Found', docs.length, 'territories overlapping bbox');
    docs.forEach(d => console.log(d._id.toString(), d.name, d.name_ko || '-', d.osm_id || '-', JSON.stringify(d.bbox)));
    await client.close();
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  }
}

main();
