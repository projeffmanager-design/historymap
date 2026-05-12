/**
 * 고려만리지도 — 한반도 금·철광 산지 데이터 시드
 *
 * 출처: 한국지질자원연구원, 조선왕조실록 광산 기록,
 *       삼국사기·고려사 철소·금소 기록 기반
 *
 * 실행: node seed_korea_resources.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'realhistory';

// ════════════════════════════════════════════════════════
// 한반도 금 산지 (역사적 주요 산금지)
// ════════════════════════════════════════════════════════
const KOREA_GOLD = [
  // ── 평안도 ──
  { name: '운산금광 (雲山金鑛)',    lat: 40.056, lng: 125.946, major: true,
    hist:  '1895년 미국인에게 채굴권 양도. 조선 최대 금광. 고려~조선 시대 산금 기록.',
    strat: '평안북도 핵심 금 공급지. 연간 수만 냥 산출.' },
  { name: '창성금광 (昌城金鑛)',    lat: 40.392, lng: 125.697, major: true,
    hist:  '조선 세종~세조 연간 활발히 채굴. 의주 북방 산금지.',
    strat: '압록강 상류 금 생산지.' },
  { name: '벽동금광 (碧潼金鑛)',    lat: 40.648, lng: 125.479, major: false,
    hist:  '고려 말~조선 초 채굴 기록. 여진과 교역 시 금 조달지.' },
  { name: '희천금광 (熙川金鑛)',    lat: 40.099, lng: 126.246, major: false,
    hist:  '조선 후기 사금(砂金) 채취 기록.' },
  { name: '강계금광 (江界金鑛)',    lat: 40.972, lng: 126.597, major: true,
    hist:  '조선 최북단 내륙 금광. 청천강 상류 산금지.',
    strat: '북방 방어 군비 조달용 금 산지.' },

  // ── 함경도 ──
  { name: '단천금광 (端川金鑛)',    lat: 40.995, lng: 128.923, major: true,
    hist:  '고려~조선 최대 산금지 중 하나. 단천은 금·은·철 삼위일체 산지.',
    strat: '함경도 재정의 핵심. 북방 군사비 조달.' },
  { name: '갑산금광 (甲山金鑛)',    lat: 41.417, lng: 128.176, major: false,
    hist:  '조선 중기 채굴 기록. 두만강 상류 내륙 산지.' },
  { name: '이원금광 (利原金鑛)',    lat: 40.687, lng: 129.412, major: false,
    hist:  '함경남도 해안 근방 사금 채취 지역.' },
  { name: '북청금광 (北靑金鑛)',    lat: 40.700, lng: 128.989, major: false,
    hist:  '조선 후기 사금 채취 기록.' },

  // ── 황해도 ──
  { name: '수안금광 (遂安金鑛)',    lat: 38.519, lng: 126.504, major: true,
    hist:  '1900년대 일제 최대 금광 개발지. 고려시대부터 산금 기록.',
    strat: '황해도 최대 금 생산지. 연간 수십만 냥 수준.' },
  { name: '곡산금광 (谷山金鑛)',    lat: 38.657, lng: 126.915, major: false,
    hist:  '조선 후기 채굴 기록. 수안과 함께 황해도 양대 금산지.' },
  { name: '평산금광 (平山金鑛)',    lat: 38.327, lng: 126.390, major: false,
    hist:  '고려 개경 인근 산금지. 왕실 공납 금 산지.' },

  // ── 강원도 ──
  { name: '금성금광 (金城金鑛)',    lat: 38.382, lng: 127.298, major: true,
    hist:  '강원도 최대 금산지. 금성(金城)이라는 지명 자체가 금에서 유래.',
    strat: '한강 상류 금 공급지.' },
  { name: '통천금광 (通川金鑛)',    lat: 38.946, lng: 127.508, major: false,
    hist:  '동해안 사금 채취 지역. 고려 시대 기록.' },
  { name: '정선금광 (旌善金鑛)',    lat: 37.378, lng: 128.660, major: false,
    hist:  '조선 후기 태백산 일대 사금 채취.' },
  { name: '인제금광 (麟蹄金鑛)',    lat: 38.067, lng: 128.171, major: false,
    hist:  '강원도 내륙 산금지. 조선 영조 연간 기록.' },

  // ── 경상도 ──
  { name: '의성금광 (義城金鑛)',    lat: 36.352, lng: 128.696, major: false,
    hist:  '신라 시대 산금 기록. 영천·의성 일대 금 출토.' },
  { name: '영천금광 (永川金鑛)',    lat: 35.975, lng: 128.940, major: false,
    hist:  '신라 왕경 인근 산금지. 삼국사기 기록.' },
  { name: '울주금광 (蔚州金鑛)',    lat: 35.553, lng: 129.240, major: false,
    hist:  '신라 말~고려 초 채굴. 동해안 사금 채취지.' },

  // ── 전라도 ──
  { name: '장흥금광 (長興金鑛)',    lat: 34.681, lng: 126.911, major: false,
    hist:  '고려~조선 전라도 산금지.' },
  { name: '보성금광 (寶城金鑛)',    lat: 34.773, lng: 127.081, major: false,
    hist:  '조선 후기 채굴 기록.' },
];

// ════════════════════════════════════════════════════════
// 한반도 철광 산지 (역사적 주요 산철지)
// ════════════════════════════════════════════════════════
const KOREA_IRON = [
  // ── 함경도 (한반도 최대 철광 지대) ──
  { name: '무산철광 (茂山鐵鑛)',    lat: 42.103, lng: 129.197, major: true,
    hist:  '한반도 최대 철광석 매장지. 일제강점기 대규모 개발. 고려~조선 철 공급 핵심지.',
    strat: '북방 최대 철 생산지. 병기·농기구 원료.' },
  { name: '길주철광 (吉州鐵鑛)',    lat: 40.869, lng: 129.359, major: true,
    hist:  '함경도 동해안 철광. 조선 군비 조달용 철 산지.',
    strat: '함경도 방어 병기 생산 기반.' },
  { name: '단천철광 (端川鐵鑛)',    lat: 40.999, lng: 128.913, major: true,
    hist:  '금·은과 함께 철도 산출. 단천은 고려 최대 복합 광산 지역.',
    strat: '함경도 병기·농기구 철 핵심 공급지.' },
  { name: '이원철광 (利原鐵鑛)',    lat: 40.690, lng: 129.441, major: false,
    hist:  '조선 중기 철 채굴 기록.' },
  { name: '성진철광 (城津鐵鑛)',    lat: 40.669, lng: 129.195, major: false,
    hist:  '함경도 해안 철광. 조선 후기 기록.' },

  // ── 평안도 ──
  { name: '자성철광 (慈城鐵鑛)',    lat: 41.635, lng: 126.847, major: true,
    hist:  '압록강 상류 철광. 고려 북방 방어선 병기 원료.',
    strat: '북방 방어 병기 생산의 핵심 철 산지.' },
  { name: '강계철광 (江界鐵鑛)',    lat: 40.968, lng: 126.588, major: false,
    hist:  '조선 후기 채굴 기록. 강계부 방어군 병기 조달.' },
  { name: '희천철광 (熙川鐵鑛)',    lat: 40.101, lng: 126.250, major: false,
    hist:  '청천강 상류 철광 지대. 조선 전기 기록.' },
  { name: '양덕철광 (陽德鐵鑛)',    lat: 39.219, lng: 126.612, major: false,
    hist:  '황해도·평안도 경계 철광. 고려~조선 산철지.' },

  // ── 황해도 ──
  { name: '재령철광 (載寧鐵鑛)',    lat: 38.238, lng: 125.738, major: true,
    hist:  '황해도 최대 철광. 고려 수도 개경에 철 공급. 삼국~조선 연속 채굴.',
    strat: '개경·한양 병기 공방 철 핵심 공급지.' },
  { name: '은율철광 (殷栗鐵鑛)',    lat: 38.623, lng: 125.687, major: false,
    hist:  '황해도 서부 철광. 고려 후기 기록.' },
  { name: '봉산철광 (鳳山鐵鑛)',    lat: 38.531, lng: 125.979, major: false,
    hist:  '고려~조선 황해도 철소(鐵所) 소재지.' },

  // ── 강원도 ──
  { name: '철원철광 (鐵原鐵鑛)',    lat: 38.147, lng: 127.313, major: true,
    hist:  '철원(鐵原)이라는 지명 자체가 철에서 유래. 삼국시대~고려 핵심 철 산지.',
    strat: '한강·임진강 상류 병기 생산 기반. 후고구려 수도 인근.' },
  { name: '양구철광 (楊口鐵鑛)',    lat: 38.106, lng: 127.989, major: false,
    hist:  '강원도 중부 철광. 조선 중기 채굴 기록.' },
  { name: '삼척철광 (三陟鐵鑛)',    lat: 37.449, lng: 129.167, major: false,
    hist:  '동해안 철광. 조선 후기 병기 원료 공급.' },

  // ── 충청도 ──
  { name: '충주철광 (忠州鐵鑛)',    lat: 36.991, lng: 127.926, major: true,
    hist:  '신라~고려~조선 한강 중류 최대 철산지. 다인철소(多仁鐵所) 소재지.',
    strat: '한반도 중부 병기 생산 핵심. 다인철소는 고려 최대 관영 철 생산지.' },
  { name: '음성철광 (陰城鐵鑛)',    lat: 36.937, lng: 127.691, major: false,
    hist:  '충청도 내륙 철광. 조선 전기 채굴.' },

  // ── 경상도 ──
  { name: '밀양철광 (密陽鐵鑛)',    lat: 35.504, lng: 128.746, major: true,
    hist:  '신라 시대부터 채굴. 밀양·김해 일대 가야·신라 철기 문명의 근원지.',
    strat: '낙동강 유역 최대 철 생산지. 가야 철기 수출의 기반.' },
  { name: '김해철광 (金海鐵鑛)',    lat: 35.228, lng: 128.889, major: true,
    hist:  '가야 철기 문명의 중심지. 변한·가야의 철 수출 거점.',
    strat: '고대 동아시아 최대 철 수출지. 왜·낙랑 교역 핵심.' },
  { name: '양산철광 (梁山鐵鑛)',    lat: 35.335, lng: 129.037, major: false,
    hist:  '가야~신라 철광. 낙동강 하류 철 생산.' },
  { name: '경주철광 (慶州鐵鑛)',    lat: 35.835, lng: 129.211, major: false,
    hist:  '신라 왕경 인근 철광. 신라 병기 생산 기반.' },

  // ── 전라도 ──
  { name: '광양철광 (光陽鐵鑛)',    lat: 34.943, lng: 127.696, major: true,
    hist:  '전라도 최대 철광. 현재도 포스코 제철소 소재지. 삼국시대부터 채굴.',
    strat: '남해안 최대 철 생산지. 수군 병기 공급.' },
  { name: '순천철광 (順天鐵鑛)',    lat: 34.949, lng: 127.488, major: false,
    hist:  '전라도 철광. 고려~조선 채굴 기록.' },
];

// ════════════════════════════════════════════════════════
// 메인
// ════════════════════════════════════════════════════════
async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log('✅ MongoDB 연결');

  const db  = client.db(DB_NAME);
  const col = db.collection('resources');

  // 기존 한반도 범위 금·철광 삭제 (위도 34~43, 경도 124~132)
  const korBounds = { lat: { $gte: 34, $lte: 43 }, lng: { $gte: 124, $lte: 132 } };
  const delGold = await col.deleteMany({ resource_type: 'gold', ...korBounds });
  const delIron = await col.deleteMany({ resource_type: 'iron', ...korBounds });
  console.log(`🗑️  기존 한반도 금 삭제: ${delGold.deletedCount}건 / 철 삭제: ${delIron.deletedCount}건`);

  const now = new Date();

  const goldDocs = KOREA_GOLD.map(d => ({
    resource_type: 'gold',
    region:        'korea',
    name:          d.name,
    lat:           d.lat,
    lng:           d.lng,
    location:      { type: 'Point', coordinates: [d.lng, d.lat] },
    major:         d.major || false,
    hist:          d.hist  || '',
    strat:         d.strat || '',
    created_at:    now,
    updated_at:    now,
  }));

  const ironDocs = KOREA_IRON.map(d => ({
    resource_type: 'iron',
    region:        'korea',
    name:          d.name,
    lat:           d.lat,
    lng:           d.lng,
    location:      { type: 'Point', coordinates: [d.lng, d.lat] },
    major:         d.major || false,
    hist:          d.hist  || '',
    strat:         d.strat || '',
    created_at:    now,
    updated_at:    now,
  }));

  const r1 = await col.insertMany(goldDocs, { ordered: false });
  const r2 = await col.insertMany(ironDocs, { ordered: false });

  console.log(`✅ 금 산지 삽입: ${r1.insertedCount}건`);
  console.log(`✅ 철광 산지 삽입: ${r2.insertedCount}건`);

  // 결과 요약
  console.log('\n📊 전체 현황:');
  console.log('  gold 전체:', await col.countDocuments({ resource_type: 'gold' }));
  console.log('  iron 전체:', await col.countDocuments({ resource_type: 'iron' }));
  console.log('  gold 한반도:', await col.countDocuments({ resource_type: 'gold', ...korBounds }));
  console.log('  iron 한반도:', await col.countDocuments({ resource_type: 'iron', ...korBounds }));

  await client.close();
  console.log('\n🔌 완료');
}

main().catch(console.error);
