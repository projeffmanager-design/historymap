/**
 * optimize_indexes.js
 * - 불필요한 인덱스 제거
 * - 쿼리 패턴에 맞는 복합 인덱스 추가
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db('realhistory');

  // ─────────────────────────────────────────
  // 1. resources 컬렉션
  // ─────────────────────────────────────────
  const res = db.collection('resources');
  console.log('\n[resources]');

  // 불필요한 단일 인덱스 제거
  for (const name of ['name_1', 'major_1', 'density_-1']) {
    try {
      await res.dropIndex(name);
      console.log('  삭제:', name);
    } catch(e) { console.log('  없음(skip):', name); }
  }

  // 필요한 인덱스 추가
  // API 쿼리: resource_type으로 필터 + lat/lng 존재 여부
  await res.createIndex({ resource_type: 1, lat: 1 }, { name: 'idx_type_lat', background: true });
  console.log('  추가: idx_type_lat {resource_type, lat}');

  // major 필터를 resource_type과 함께 쓸 때
  await res.createIndex({ resource_type: 1, major: -1 }, { name: 'idx_type_major', background: true });
  console.log('  추가: idx_type_major {resource_type, major}');

  // ─────────────────────────────────────────
  // 2. crops 컬렉션
  // ─────────────────────────────────────────
  const crops = db.collection('crops');
  console.log('\n[crops]');

  // 불필요한 단일 인덱스 제거 (sort 전용 인덱스, 쿼리 없음)
  for (const name of ['productivity_-1', 'annual_yield_ton_-1']) {
    try {
      await crops.dropIndex(name);
      console.log('  삭제:', name);
    } catch(e) { console.log('  없음(skip):', name); }
  }

  // 복합 인덱스 추가
  await crops.createIndex({ crop_type: 1, lat: 1 }, { name: 'idx_crop_type_lat', background: true });
  console.log('  추가: idx_crop_type_lat {crop_type, lat}');

  // ─────────────────────────────────────────
  // 3. natural_features 컬렉션
  // ─────────────────────────────────────────
  const nf = db.collection('natural_features');
  console.log('\n[natural_features]');

  // name_1 + name_en_1 을 복합 text 인덱스로 통합
  try {
    await nf.dropIndex('name_1');
    console.log('  삭제: name_1');
  } catch(e) { console.log('  없음(skip): name_1'); }
  try {
    await nf.dropIndex('name_en_1');
    console.log('  삭제: name_en_1');
  } catch(e) { console.log('  없음(skip): name_en_1'); }

  // type 필터 + name 검색 복합
  await nf.createIndex({ type: 1, name: 1 }, { name: 'idx_type_name', background: true });
  console.log('  추가: idx_type_name {type, name}');

  // wikidata_id는 유니크 값이므로 sparse unique로 업그레이드
  try {
    await nf.dropIndex('wikidata_id_1');
    console.log('  삭제: wikidata_id_1');
  } catch(e) {}
  await nf.createIndex({ wikidata_id: 1 }, { name: 'idx_wikidata_id', unique: true, sparse: true, background: true });
  console.log('  추가: idx_wikidata_id (unique+sparse)');

  // ─────────────────────────────────────────
  // 4. contributions 컬렉션 — 복합 인덱스 보강
  // ─────────────────────────────────────────
  const contrib = db.collection('contributions');
  console.log('\n[contributions]');

  // status + createdAt 복합 (목록 조회 패턴: status 필터 + 최신순 정렬)
  await contrib.createIndex({ status: 1, createdAt: -1 }, { name: 'idx_status_created', background: true });
  console.log('  추가: idx_status_created {status, createdAt}');

  // ─────────────────────────────────────────
  // 최종 결과 출력
  // ─────────────────────────────────────────
  console.log('\n── 최종 인덱스 현황 ──');
  for (const cname of ['resources', 'crops', 'natural_features', 'contributions']) {
    const idxs = await db.collection(cname).indexes();
    console.log('\n[' + cname + ']');
    idxs.forEach(i => console.log('  ', JSON.stringify(i.key), '-', i.name,
      (i.unique ? 'UNIQUE' : ''), (i.sparse ? 'SPARSE' : '')));
  }

  await client.close();
  console.log('\n✅ 인덱스 최적화 완료');
}

main().catch(e => { console.error(e); process.exit(1); });
