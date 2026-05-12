/**
 * seed_salt.js — 소금 산지 데이터
 *
 * 동아시아 역사상 주요 소금 생산지
 * salt_type: sea(해염) / lake(호수염/池鹽) / well(井鹽/암염) / land(토염)
 * annual_ton: 역사적 추정 연간 생산량(톤 기준 상대값)
 *
 * 실행: node seed_salt.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'realhistory';

const SALT_DATA = [

  // ── 해염 (동중국해 · 황해 · 발해) ──────────────────────
  { name: '창저우(滄州) 해염',        lat: 38.30, lng: 116.84, salt_type: 'sea',  annual_ton: 800000,  major: true,  desc: '황해 연안 최대 해염 산지. 한대부터 국가 전매제 운영' },
  { name: '산둥 해염 (莱州·濰坊)',     lat: 37.16, lng: 119.20, salt_type: 'sea',  annual_ton: 700000,  major: true,  desc: '래주만 해염. 춘추전국~현대까지 지속된 핵심 산지' },
  { name: '톈진 해염 (長蘆鹽)',        lat: 39.20, lng: 117.50, salt_type: 'sea',  annual_ton: 900000,  major: true,  desc: '장로염(長蘆鹽) — 명·청 최대 해염. 운하로 화북 전역 공급' },
  { name: '화이안 해염 (淮鹽)',        lat: 33.55, lng: 120.20, salt_type: 'sea',  annual_ton: 1200000, major: true,  desc: '회염(淮鹽) — 역대 최대 생산·유통량. 양저우 염상 부의 원천' },
  { name: '양저우 염창(揚州)',         lat: 32.40, lng: 119.80, salt_type: 'sea',  annual_ton: 600000,  major: false, desc: '회염 집산지·유통 거점. 염상이 청대 최대 상인 집단 형성' },
  { name: '저장 해염 (寧波·舟山)',     lat: 29.90, lng: 122.00, salt_type: 'sea',  annual_ton: 500000,  major: false, desc: '절강 연해 해염. 강남 공급 거점' },
  { name: '푸젠 해염 (福州·泉州)',     lat: 25.90, lng: 119.50, salt_type: 'sea',  annual_ton: 400000,  major: false, desc: '민염(閩鹽). 해상 무역로와 연계된 산지' },
  { name: '광둥 해염 (廣州)',          lat: 22.80, lng: 113.60, salt_type: 'sea',  annual_ton: 450000,  major: false, desc: '월염(粵鹽). 남중국 해염 핵심' },
  { name: '하이난 해염',               lat: 19.90, lng: 110.40, salt_type: 'sea',  annual_ton: 200000,  major: false, desc: '열대 기후 활용 천일염' },
  { name: '랴오닝 해염 (遼東)',        lat: 40.90, lng: 121.60, salt_type: 'sea',  annual_ton: 350000,  major: false, desc: '요동만 해염. 고구려·발해·요 시대 동북 공급원' },
  { name: '교동 해염 (膠東)',          lat: 36.50, lng: 120.50, salt_type: 'sea',  annual_ton: 400000,  major: false, desc: '산둥반도 동부 해염' },

  // ── 호수염 / 池鹽 ──────────────────────────────────────
  { name: '해지(解池) · 운성(運城)',   lat: 35.03, lng: 110.99, salt_type: 'lake', annual_ton: 600000,  major: true,  desc: '중국 최고(最古) 소금호수. 황제(黃帝) 치우 전쟁 원인지. 주·진·한~현대 운영' },
  { name: '차카 염호 (察卡)',          lat: 36.75, lng: 99.08,  salt_type: 'lake', annual_ton: 250000,  major: false, desc: '청해성 대형 염호. 티베트 고원 공급원' },
  { name: '챠이담 염호',               lat: 37.00, lng: 96.00,  salt_type: 'lake', annual_ton: 300000,  major: false, desc: '차이담분지 복수 염호군. 실크로드 서역 공급' },
  { name: '로프노르(羅布泊)',          lat: 40.50, lng: 90.50,  salt_type: 'lake', annual_ton: 150000,  major: false, desc: '타림분지 염호. 누란(樓蘭)과 연계된 고대 염 산지' },
  { name: '내몽골 염호 (어얼둬쓰)',    lat: 40.00, lng: 109.50, salt_type: 'lake', annual_ton: 200000,  major: false, desc: '내몽골 고원 염호군. 유목민 소금 공급원' },
  { name: '몽골 옵스 염호',            lat: 49.50, lng: 93.00,  salt_type: 'lake', annual_ton: 80000,   major: false, desc: '몽골 서부 대형 염호. 유목 제국 공급' },
  { name: '닝샤 염지 (寧夏)',          lat: 38.80, lng: 106.60, salt_type: 'lake', annual_pop: 180000,  annual_ton: 180000,  major: false, desc: '서하(西夏) 영역 내 염호. 당항족 세입원' },
  { name: '윈난 염호 (黑鹽井)',        lat: 25.50, lng: 101.50, salt_type: 'lake', annual_ton: 100000,  major: false, desc: '운남 고원 염호. 남조·대리국 운영' },

  // ── 정염 / 井鹽 (사천 지하 염수) ─────────────────────
  { name: '쯔궁(自貢) 정염',          lat: 29.33, lng: 104.78, salt_type: 'well', annual_ton: 500000,  major: true,  desc: '세계 최초 심굴착 염정. 한대 시작, 청대 전성기. 공룡화석 산지와 동일' },
  { name: '쓰촨 룽정(榮井)',           lat: 29.70, lng: 104.50, salt_type: 'well', annual_ton: 300000,  major: false, desc: '자공 인근 염정군. 사천분지 주요 공급원' },
  { name: '푸순(富順) 염정',           lat: 28.80, lng: 105.00, salt_type: 'well', annual_ton: 200000,  major: false, desc: '사천 내륙 정염. 삼국시대 촉한 세수원' },
  { name: '윈난 흑정(黑井)',           lat: 25.55, lng: 101.58, salt_type: 'well', annual_ton: 120000,  major: false, desc: '윈난 최대 염정. 남조~명·청 운영' },
  { name: '구이저우 정염',             lat: 26.60, lng: 107.00, salt_type: 'well', annual_ton: 80000,   major: false, desc: '귀주 내륙 정염. 소수민족 거주지 공급' },

  // ── 암염 / 토염 (서역·북방) ──────────────────────────
  { name: '투루판 암염',               lat: 42.90, lng: 89.20,  salt_type: 'land', annual_ton: 100000,  major: false, desc: '투루판 분지 지표 암염. 실크로드 오아시스 공급' },
  { name: '타클라마칸 서부 암염',      lat: 39.50, lng: 77.00,  salt_type: 'land', annual_ton: 80000,   major: false, desc: '카스 인근 암염층. 서역 남로 공급' },
  { name: '티베트 서부 염호군',        lat: 32.00, lng: 83.00,  salt_type: 'lake', annual_ton: 60000,   major: false, desc: '티베트 고원 고지 염호. 차마고도 교역품' },

  // ── 한반도 ──────────────────────────────────────────
  { name: '서해 해염 (강화·옹진)',     lat: 37.60, lng: 126.40, salt_type: 'sea',  annual_ton: 150000,  major: true,  desc: '한반도 서해안 최대 해염. 고려~조선 국가 관리' },
  { name: '전라 해염 (영광·무안)',     lat: 35.30, lng: 126.50, salt_type: 'sea',  annual_ton: 120000,  major: false, desc: '서남해안 천일염. 신안 갯벌 연계' },
  { name: '동해안 해염 (삼척·울진)',   lat: 37.40, lng: 129.20, salt_type: 'sea',  annual_ton: 60000,   major: false, desc: '동해안 자염(煮鹽). 솥에 끓여 생산' },
  { name: '평안도 해염 (서한만)',      lat: 39.50, lng: 124.80, salt_type: 'sea',  annual_ton: 80000,   major: false, desc: '고구려~조선 서북 해염 산지' },

  // ── 베트남 / 동남아 ──────────────────────────────────
  { name: '하노이 인근 해염',          lat: 20.50, lng: 106.80, salt_type: 'sea',  annual_ton: 200000,  major: false, desc: '교지(交趾) 해염. 남중국해 연안 산지' },
  { name: '베트남 중부 해염 (다낭)',   lat: 16.00, lng: 108.20, salt_type: 'sea',  annual_ton: 150000,  major: false, desc: '참파 왕국 해염 산지' },
];

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log('✅ MongoDB 연결');

  const db  = client.db(DB_NAME);
  const col = db.collection('resources');

  const del = await col.deleteMany({ resource_type: 'salt' });
  console.log(`🗑️  기존 소금 ${del.deletedCount}개 삭제`);

  const docs = SALT_DATA.map(s => ({
    name:         s.name,
    resource_type:'salt',
    salt_type:    s.salt_type,
    annual_ton:   s.annual_ton,
    major:        s.major || false,
    description:  s.desc,
    location: {
      type:        'Point',
      coordinates: [s.lng, s.lat],
    },
  }));

  const ins = await col.insertMany(docs);
  console.log(`✅ 소금 산지 ${ins.insertedCount}개 삽입`);

  // 타입별 요약
  const summary = {};
  docs.forEach(d => { summary[d.salt_type] = (summary[d.salt_type]||0)+1; });
  console.log('타입별:', summary);

  await client.close();
  console.log('🎉 완료');
}

main().catch(err => { console.error(err); process.exit(1); });
