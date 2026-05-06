// 범용 territory geometry 단순화 스크립트
// Usage: node simplify_territory.js <territory_id> [target_vertices]

const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: './env' });

const TERRITORY_ID = process.argv[2];
const TARGET = parseInt(process.argv[3] || '400');

if (!TERRITORY_ID) {
  console.error('Usage: node simplify_territory.js <territory_id> [target_vertices]');
  process.exit(1);
}

function dpSimplify(pts, tol) {
  if (pts.length <= 2) return pts;
  let maxD = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.sqrt(dx*dx + dy*dy);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len === 0
      ? Math.sqrt((pts[i][0]-ax)**2 + (pts[i][1]-ay)**2)
      : Math.abs(dy*pts[i][0] - dx*pts[i][1] + bx*ay - by*ax) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > tol) {
    return [
      ...dpSimplify(pts.slice(0, idx + 1), tol).slice(0, -1),
      ...dpSimplify(pts.slice(idx), tol)
    ];
  }
  return [pts[0], pts[pts.length - 1]];
}

function simplifyRing(ring, tol) {
  const s = dpSimplify(ring, tol);
  if (s[0][0] !== s[s.length-1][0] || s[0][1] !== s[s.length-1][1]) s.push(s[0]);
  return s;
}

function simplifyGeometry(geom, tol) {
  if (geom.type === 'Polygon') {
    const coords = geom.coordinates.map(ring => {
      const s = simplifyRing(ring, tol);
      return s.length >= 4 ? s : ring;
    });
    return { ...geom, coordinates: coords };
  }
  if (geom.type === 'MultiPolygon') {
    const coords = geom.coordinates.map(poly =>
      poly.map(ring => {
        const s = simplifyRing(ring, tol);
        return s.length >= 4 ? s : ring;
      })
    );
    return { ...geom, coordinates: coords };
  }
  return geom;
}

function countVertices(geom) {
  let n = 0;
  const walk = c => Array.isArray(c[0]) ? c.forEach(walk) : n++;
  walk(geom.coordinates);
  return n;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += (ring[i][0] * ring[i+1][1]) - (ring[i+1][0] * ring[i][1]);
  }
  return Math.abs(area / 2);
}

function filterSmallPolygons(geom, minArea) {
  if (geom.type !== 'MultiPolygon') return geom;
  const filtered = geom.coordinates.filter(poly => ringArea(poly[0]) >= minArea);
  if (filtered.length === 0) return geom;
  if (filtered.length === 1) return { type: 'Polygon', coordinates: filtered[0] };
  return { ...geom, coordinates: filtered };
}

function computeBBox(geom) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  const walk = c => {
    if (typeof c[0] === 'number') {
      if (c[1] < minLat) minLat = c[1];
      if (c[1] > maxLat) maxLat = c[1];
      if (c[0] < minLng) minLng = c[0];
      if (c[0] > maxLng) maxLng = c[0];
    } else c.forEach(walk);
  };
  walk(geom.coordinates);
  return { minLat, maxLat, minLng, maxLng };
}

async function main() {
  const uri = process.env.MONGO_URI;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('realhistory');
  const col = db.collection('territories');

  const doc = await col.findOne({ _id: new ObjectId(TERRITORY_ID) });
  if (!doc) { console.error('문서를 찾을 수 없습니다:', TERRITORY_ID); process.exit(1); }
  console.log(`대상: ${doc.name_ko || doc.name} (${doc._id})`);

  const original = doc.geometry;
  const before = countVertices(original);
  console.log(`원본 꼭지점: ${before}개`);

  // 1단계: 작은 섬 제거 (전체 면적의 0.1% 미만)
  let working = original;
  if (original.type === 'MultiPolygon') {
    const areas = original.coordinates.map(poly => ringArea(poly[0]));
    const maxArea = Math.max(...areas);
    const minArea = maxArea * 0.001; // 최대 폴리곤의 0.1% 미만 제거
    working = filterSmallPolygons(original, minArea);
    const afterFilter = countVertices(working);
    const polyCount = working.type === 'MultiPolygon' ? working.coordinates.length : 1;
    console.log(`작은 섬 제거 후: ${afterFilter}개 꼭지점 (폴리곤 ${polyCount}개)`);
  }

  // 2단계: Douglas-Peucker 단순화
  let tol = 0.0001;
  let result = working;
  let bestResult = working;
  let bestCount = countVertices(working);
  for (let i = 0; i < 20; i++) {
    const s = simplifyGeometry(working, tol);
    const cnt = countVertices(s);
    console.log(`  tol=${tol.toFixed(6)} → ${cnt}개`);
    // 목표 이하면 바로 선택
    if (cnt <= TARGET) { result = s; bestResult = s; bestCount = cnt; break; }
    // 목표 초과지만 지금까지 본 것 중 가장 적은 꼭지점이면 기억
    if (cnt < bestCount) { bestResult = s; bestCount = cnt; }
    result = s;
    tol *= 1.6;
  }
  // 목표를 달성 못했으면 가장 적었던 결과 사용
  if (countVertices(result) > TARGET) {
    result = bestResult;
    console.log(`⚠️  목표(${TARGET}) 달성 불가 → 최소 꼭지점 결과(${bestCount}개) 사용`);
  }

  const after = countVertices(result);
  console.log(`\n단순화 완료: ${before} → ${after}개`);

  const bbox = computeBBox(result);
  await col.updateOne(
    { _id: new ObjectId(TERRITORY_ID) },
    { $set: { geometry: result, bbox } }
  );
  console.log('✅ DB 업데이트 완료');
  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
