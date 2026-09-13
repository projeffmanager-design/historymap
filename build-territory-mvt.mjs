import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeoJSONVT } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const inputDir = path.join(rootDir, 'public', 'tiles');
const outputDir = path.join(rootDir, 'public', 'mvt', 'territories');
const maxZoom = Number(process.env.TERRITORY_MVT_MAX_ZOOM || 7);

const index = JSON.parse(await fs.readFile(path.join(inputDir, 'index.json'), 'utf8'));
const uniqueFeatures = new Map();

for (const tile of index.tiles || []) {
  const collection = JSON.parse(await fs.readFile(path.join(inputDir, tile.filename), 'utf8'));
  for (const feature of collection.features || []) {
    const properties = feature.properties || {};
    const key = String(properties._id || feature.id || `${properties.name || ''}:${properties.level || ''}`);
    if (!uniqueFeatures.has(key)) {
      uniqueFeatures.set(key, { ...feature, properties: { ...properties, _id: key } });
    }
  }
}

const geojson = { type: 'FeatureCollection', features: [...uniqueFeatures.values()] };
const tileIndex = new GeoJSONVT(geojson, {
  maxZoom,
  indexMaxZoom: maxZoom,
  indexMaxPoints: 0,
  tolerance: 3,
  extent: 4096,
  buffer: 64,
  lineMetrics: false
});

await fs.rm(outputDir, { recursive: true, force: true });
let tileCount = 0;
let totalBytes = 0;
const generatedTileCoords = tileIndex.tileCoords || tileIndex.tileIndex?.tileCoords || [];

for (const { z, x, y } of generatedTileCoords) {
  const tile = tileIndex.getTile(z, x, y);
  if (!tile?.features?.length) continue;
  const pbf = Buffer.from(fromGeojsonVt({ territories: tile }));
  const dir = path.join(outputDir, String(z), String(x));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${y}.pbf`), pbf);
  tileCount += 1;
  totalBytes += pbf.length;
}

const manifest = {
  tilejson: '3.0.0',
  name: 'KoreaHistory territories MVT test',
  scheme: 'xyz',
  tiles: ['/public/mvt/territories/{z}/{x}/{y}.pbf'],
  minzoom: 0,
  maxzoom: maxZoom,
  vector_layers: [{
    id: 'territories', minzoom: 0, maxzoom: maxZoom,
    fields: {
      _id: 'String', name: 'String', level: 'String', country_id: 'String',
      start_year: 'Number', end_year: 'Number'
    }
  }],
  generated_at: new Date().toISOString(),
  source_features: geojson.features.length,
  pbf_tiles: tileCount,
  bytes: totalBytes
};

await fs.mkdir(path.dirname(outputDir), { recursive: true });
await fs.writeFile(path.join(rootDir, 'public', 'mvt', 'territories.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[MVT] ${geojson.features.length} unique features -> ${tileCount} PBF tiles (${(totalBytes / 1024 / 1024).toFixed(2)} MiB), z0-${maxZoom}`);
