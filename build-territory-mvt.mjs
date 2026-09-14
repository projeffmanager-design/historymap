import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { GeoJSONVT } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';
import { zxyToTileId } from 'pmtiles';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const inputDir = path.join(rootDir, 'public', 'tiles');
const outputDir = path.join(rootDir, 'public', 'mvt', 'territories');
const archivePath = path.join(rootDir, 'public', 'mvt', 'territories.pmtiles');
const maxZoom = Number(process.env.TERRITORY_MVT_MAX_ZOOM || 7);

const index = JSON.parse(await fs.readFile(path.join(inputDir, 'index.json'), 'utf8'));
const uniqueFeatures = new Map();
let mergedGeometryCount = 0;

function appendGeometry(baseGeometry, extraGeometry) {
  const polygonParts = geometry => {
    if (!geometry) return [];
    if (geometry.type === 'Polygon') return [geometry.coordinates];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates || [];
    return [];
  };
  const parts = [...polygonParts(baseGeometry), ...polygonParts(extraGeometry)];
  if (!parts.length) return baseGeometry || extraGeometry;
  return parts.length === 1
    ? { type: 'Polygon', coordinates: parts[0] }
    : { type: 'MultiPolygon', coordinates: parts };
}

for (const tile of index.tiles || []) {
  const collection = JSON.parse(await fs.readFile(path.join(inputDir, tile.filename), 'utf8'));
  for (const feature of collection.features || []) {
    const properties = feature.properties || {};
    const key = String(properties._id || feature.id || `${properties.name || ''}:${properties.level || ''}`);
    if (!uniqueFeatures.has(key)) {
      uniqueFeatures.set(key, {
        ...feature,
        properties: { ...properties, _id: key },
        _geometryKeys: new Set([JSON.stringify(feature.geometry || null)])
      });
    } else {
      const stored = uniqueFeatures.get(key);
      const geometryKey = JSON.stringify(feature.geometry || null);
      // 같은 영토 ID에 별도로 추가된 보완 폴리곤은 중복 타일 피처가 아니다.
      // 첫 도형만 남기지 않고 하나의 MultiPolygon 피처로 결합한다.
      if (!stored._geometryKeys.has(geometryKey)) {
        stored.geometry = appendGeometry(stored.geometry, feature.geometry);
        stored._geometryKeys.add(geometryKey);
        mergedGeometryCount += 1;
      }
    }
  }
}

const geojson = {
  type: 'FeatureCollection',
  features: [...uniqueFeatures.values()].map(({ _geometryKeys, ...feature }) => feature)
};
const tileIndex = new GeoJSONVT(geojson, {
  maxZoom,
  indexMaxZoom: maxZoom,
  indexMaxPoints: 0,
  tolerance: 3,
  extent: 4096,
  buffer: 64,
  lineMetrics: false
});

let tileCount = 0;
let totalBytes = 0;
const generatedTileCoords = tileIndex.tileCoords || tileIndex.tileIndex?.tileCoords || [];
const archiveTiles = [];

for (const { z, x, y } of generatedTileCoords) {
  const tile = tileIndex.getTile(z, x, y);
  if (!tile?.features?.length) continue;
  // MapLibre가 사후 호환 보정을 하지 않도록 MVT specification v2로 기록한다.
  const pbf = Buffer.from(fromGeojsonVt({ territories: tile }, { version: 2, extent: 4096 }));
  archiveTiles.push({ tileId: zxyToTileId(z, x, y), z, x, y, data: pbf });
  tileCount += 1;
  totalBytes += pbf.length;
}

archiveTiles.sort((a, b) => a.tileId - b.tileId);

function writeVarint(value, bytes) {
  let remaining = value;
  while (remaining > 0x7f) {
    bytes.push((remaining % 128) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  bytes.push(remaining);
}

function serializeDirectory(entries) {
  const bytes = [];
  writeVarint(entries.length, bytes);
  let previousId = 0;
  for (const entry of entries) {
    writeVarint(entry.tileId - previousId, bytes);
    previousId = entry.tileId;
  }
  for (const entry of entries) writeVarint(1, bytes);
  for (const entry of entries) writeVarint(entry.data.length, bytes);
  let previousEnd = 0;
  entries.forEach((entry, index) => {
    writeVarint(index > 0 && entry.offset === previousEnd ? 0 : entry.offset + 1, bytes);
    previousEnd = entry.offset + entry.data.length;
  });
  return Buffer.from(bytes);
}

let tileOffset = 0;
for (const entry of archiveTiles) {
  entry.offset = tileOffset;
  tileOffset += entry.data.length;
}

const metadata = {
  name: 'KoreaHistory territories',
  description: 'Static territory geometry with runtime historical ownership styling',
  version: '1',
  vector_layers: [{
    id: 'territories', minzoom: 0, maxzoom: maxZoom,
    fields: { _id: 'String', name: 'String', level: 'String', country_id: 'String', start_year: 'Number', end_year: 'Number' }
  }]
};
const rootDirectory = gzipSync(serializeDirectory(archiveTiles));
const metadataBytes = gzipSync(Buffer.from(JSON.stringify(metadata)));
const tileData = Buffer.concat(archiveTiles.map(entry => entry.data));
const header = Buffer.alloc(127);
header.write('PMTiles', 0, 'ascii');
header.writeUInt8(3, 7);
const writeUint64 = (offset, value) => {
  header.writeUInt32LE(value >>> 0, offset);
  header.writeUInt32LE(Math.floor(value / 2 ** 32), offset + 4);
};
const rootOffset = 127;
const metadataOffset = rootOffset + rootDirectory.length;
const leafOffset = metadataOffset + metadataBytes.length;
const tileDataOffset = leafOffset;
writeUint64(8, rootOffset);
writeUint64(16, rootDirectory.length);
writeUint64(24, metadataOffset);
writeUint64(32, metadataBytes.length);
writeUint64(40, leafOffset);
writeUint64(48, 0);
writeUint64(56, tileDataOffset);
writeUint64(64, tileData.length);
writeUint64(72, archiveTiles.length);
writeUint64(80, archiveTiles.length);
writeUint64(88, archiveTiles.length);
header.writeUInt8(1, 96); // clustered
header.writeUInt8(2, 97); // internal directory/metadata gzip
header.writeUInt8(1, 98); // tile data uncompressed
header.writeUInt8(1, 99); // MVT
header.writeUInt8(0, 100);
header.writeUInt8(maxZoom, 101);
header.writeInt32LE(-1800000000, 102);
header.writeInt32LE(-850511287, 106);
header.writeInt32LE(1800000000, 110);
header.writeInt32LE(850511287, 114);
header.writeUInt8(4, 118);
header.writeInt32LE(1100000000, 119);
header.writeInt32LE(350000000, 123);

await fs.mkdir(path.dirname(archivePath), { recursive: true });
await fs.writeFile(archivePath, Buffer.concat([header, rootDirectory, metadataBytes, tileData]));
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(path.join(rootDir, 'public', 'assets', 'vendor'), { recursive: true });
await fs.copyFile(path.join(rootDir, 'node_modules', 'pmtiles', 'dist', 'pmtiles.js'), path.join(rootDir, 'public', 'assets', 'vendor', 'pmtiles.js'));

const manifest = {
  tilejson: '3.0.0',
  name: 'KoreaHistory territories MVT test',
  scheme: 'xyz',
  tiles: ['/public/mvt/territories.pmtiles'],
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
console.log(`[MVT] same-ID supplemental geometries merged: ${mergedGeometryCount}`);
console.log(`[PMTiles] single archive: ${(Buffer.byteLength(await fs.readFile(archivePath)) / 1024 / 1024).toFixed(2)} MiB`);
