// 조선민주주의인민공화국 geometry 꼭지점 단순화
// Douglas-Peucker 알고리즘

const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: './env' });

const NK_ID = '69cd18e8a0643be3b024ba92';
const TARGET = 500; // 목표 꼭지점 수
const BACKUP_FILE = './north-korea-only.json';

// 폴리곤 면적 계산 (Shoelace, 경위도 근사)
function ringArea(ring) {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    area += (ring[i][0] * ring[i+1][1]) - (ring[i+1][0] * ring[i][1]);
  }
  return Math.abs(area / 2);
}

// 작은 폴리곤 필터링 (MultiPolygon에서 면적이 작은 섬 제거)
function filterSmallPolygons(geom, minArea) {
  if (geom.type !== 'MultiPolygon') return geom;
  const filtered = geom.coordinates.filter(poly => ringArea(poly[0]) >= minArea);
  if (filtered.length === 0) return geom; // 모두 제거되면 원본 유지
  if (filtered.length === 1) return { type: 'Polygon', coordinates: filtered[0] };
  return { ...geom, coordinates: filtered };
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
  // 폐합 보장
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

  const doc = await col.findOne({ _id: new ObjectId(NK_ID) });
  if (!doc) { console.error('문서를 찾을 수 없습니다'); process.exit(1); }

  // 백업 파일에서 원본 geometry 읽기
  const fs = require('fs');
  const backupRaw = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
  let original;
  if (backupRaw.type === 'FeatureCollection') {
    original = backupRaw.features[0].geometry;
  } else if (backupRaw.type === 'Feature') {
    original = backupRaw.geometry;
  } else {
    original = backupRaw;
  }
  const before = countVertices(original);
  console.log(`백업 파일 꼭지점: ${before}개`);

  // 1단계: 작은 섬 폴리곤 제거 (면적 < 0.01 도^2 ≈ 약 100km² 이하)
  let working = original;
  if (original.type === 'MultiPolygon') {
    const areas = original.coordinates.map(poly => ({ poly, area: ringArea(poly[0]) }));
    areas.sort((a, b) => b.area - a.area);
    console.log(`폴리곤 수: ${areas.length}개, 면적 상위 5:`);
    areas.slice(0, 5).forEach((x, i) => console.log(`  [${i}] area=${x.area.toFixed(6)}`));
    working = filterSmallPolygons(original, 0.01);
    console.log(`작은 섬 제거 후: ${countVertices(working)}개 꼭지점 (폴리곤 ${working.type === 'MultiPolygon' ? working.coordinates.length : 1}개)`);
  }

  // 2단계: Douglas-Peucker 단순화
  let tol = 0.001;
  let result = working;
  for (let i = 0; i < 15; i++) {
    const s = simplifyGeometry(working, tol);
    const cnt = countVertices(s);
    console.log(`  tol=${tol.toFixed(6)} → ${cnt}개`);
    if (cnt <= TARGET) { result = s; break; }
    result = s;
    tol *= 1.6;
  }

  const after = countVertices(result);
  console.log(`\n단순화 완료: ${before} → ${after}개 (tol=${tol.toFixed(6)})`);

  const bbox = computeBBox(result);
  console.log('bbox:', bbox);

  await col.updateOne(
    { _id: new ObjectId(NK_ID) },
    { $set: { geometry: result, bbox } }
  );
  console.log('✅ DB 업데이트 완료');

  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
