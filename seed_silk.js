/**
 * seed_silk.js — 비단(絲綢) 산지 데이터
 *
 * 동아시아 역사상 주요 비단 생산지 · 직조 거점
 * silk_type: sericulture(양잠·養蠶) / weaving(직조·織造) / trade(교역거점)
 * annual_bolt: 역사적 추정 연간 생산량(필 단위 상대값)
 *
 * 실행: node seed_silk.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'realhistory';

const SILK_DATA = [

  // ── 강남 · 절강 (최대 산지) ─────────────────────────
  { name: '쑤저우(蘇州) 비단',         lat: 31.30, lng: 120.62, silk_type: 'weaving',      annual_bolt: 1200000, major: true,  desc: '송·명·청 최대 직조 도시. 소주자수(蘇繡) 명산지. 황실 직조국 소재지' },
  { name: '항저우(杭州) 비단',         lat: 30.25, lng: 120.16, silk_type: 'weaving',      annual_bolt: 1000000, major: true,  desc: '남송 수도. 항주 직금(織錦) 명산지. 서호 주변 뽕밭 광활' },
  { name: '후저우(湖州) 양잠',         lat: 30.86, lng: 120.09, silk_type: 'sericulture',  annual_bolt: 800000,  major: true,  desc: '태호 연안 최대 양잠지. 한대부터 현재까지 지속. 호주사(湖州絲) 명성' },
  { name: '자싱(嘉興) 양잠',           lat: 30.75, lng: 120.75, silk_type: 'sericulture',  annual_bolt: 600000,  major: false, desc: '절강 평야 양잠 밀집지. 강남 비단 원료 주공급' },
  { name: '저우산(紹興) 비단',         lat: 30.00, lng: 120.58, silk_type: 'weaving',      annual_bolt: 400000,  major: false, desc: '월(越)나라 고도. 월라(越羅) 비단 산지' },
  { name: '난징(南京) 운금',           lat: 32.06, lng: 118.76, silk_type: 'weaving',      annual_bolt: 700000,  major: true,  desc: '명대 도성 운금(雲錦). 황실 전용 최고급 직물. 현재 유네스코 무형유산' },

  // ── 사천 (촉금 蜀錦) ────────────────────────────────
  { name: '청두(成都) 촉금',           lat: 30.66, lng: 104.07, silk_type: 'weaving',      annual_bolt: 900000,  major: true,  desc: '촉금(蜀錦) — 중국 4대 명금 중 하나. 한~삼국 촉한 핵심 수출품. 비단길 기원지' },
  { name: '쓰촨 면양(綿陽)',           lat: 31.47, lng: 104.68, silk_type: 'sericulture',  annual_bolt: 500000,  major: false, desc: '사천 북부 양잠지. 청두 촉금 원료 공급' },

  // ── 화북 · 산둥 ─────────────────────────────────────
  { name: '정저우(鄭州) 비단',         lat: 34.75, lng: 113.66, silk_type: 'sericulture',  annual_bolt: 600000,  major: true,  desc: '황하 유역 최고(最古) 양잠지. 신석기 앙소문화 유적에서 비단 발견' },
  { name: '산둥 쯔보(淄博)',           lat: 36.80, lng: 118.05, silk_type: 'weaving',      annual_bolt: 500000,  major: false, desc: '제(齊)나라 고도. 춘추전국 최대 비단 생산국. 제사(齊紗) 명산지' },
  { name: '취푸(曲阜) 비단',           lat: 35.60, lng: 116.99, silk_type: 'sericulture',  annual_bolt: 300000,  major: false, desc: '공자 고향. 노(魯)나라 비단 직조지' },
  { name: '허베이 바오딩(保定)',        lat: 38.87, lng: 115.49, silk_type: 'sericulture',  annual_bolt: 400000,  major: false, desc: '화북 평원 양잠. 당·송 화북 비단 주공급지' },
  { name: '허난 안양(安陽)',           lat: 36.10, lng: 114.39, silk_type: 'sericulture',  annual_bolt: 350000,  major: false, desc: '상(商)나라 수도 은허. 청동기 시대 비단 직조 유적 발굴' },

  // ── 광동 · 광서 (광사 廣紗) ────────────────────────
  { name: '광저우(廣州) 광사',         lat: 23.12, lng: 113.26, silk_type: 'weaving',      annual_bolt: 600000,  major: true,  desc: '광사(廣紗) — 해상 실크로드 수출 거점. 명·청 해외 무역 최대 품목' },
  { name: '포산(佛山) 비단',           lat: 23.02, lng: 113.12, silk_type: 'weaving',      annual_bolt: 450000,  major: false, desc: '광동 최대 직조 도시. 이중직 광사(廣紗) 전문 생산' },
  { name: '순더(順德) 양잠',           lat: 22.80, lng: 113.25, silk_type: 'sericulture',  annual_bolt: 500000,  major: false, desc: '주강 삼각주 양잠. 광동 비단 원료 핵심 공급지' },

  // ── 실크로드 교역 거점 ──────────────────────────────
  { name: '뤄양(洛陽) 교역',           lat: 34.62, lng: 112.45, silk_type: 'trade',        annual_bolt: 800000,  major: true,  desc: '실크로드 동쪽 기점. 한~당 수도. 비단 집산지·서역 상인 집결' },
  { name: '장안(長安/西安)',           lat: 34.27, lng: 108.93, silk_type: 'trade',        annual_bolt: 1000000, major: true,  desc: '실크로드 출발점. 한·당 수도. 서역 비단 교역 중심' },
  { name: '둔황(敦煌)',                lat: 40.14, lng: 94.66,  silk_type: 'trade',        annual_bolt: 200000,  major: true,  desc: '실크로드 관문. 막고굴 벽화에 비단 직조 장면 묘사' },
  { name: '투루판(吐魯番)',            lat: 42.95, lng: 89.19,  silk_type: 'trade',        annual_bolt: 150000,  major: false, desc: '서역 비단 중계. 아스타나 고분에서 당대 비단 다수 출토' },
  { name: '사마르칸트(康國)',          lat: 39.65, lng: 66.97,  silk_type: 'trade',        annual_bolt: 300000,  major: true,  desc: '소그디아나 핵심 교역 도시. 비단 서방 전달의 핵심 중계지' },

  // ── 한반도 ──────────────────────────────────────────
  { name: '한반도 중부 양잠 (개성)',   lat: 37.98, lng: 126.56, silk_type: 'sericulture',  annual_bolt: 150000,  major: true,  desc: '고려 수도 개성. 조선 비단 생산 거점. 견직물 국가 관리' },
  { name: '경기 북부 양잠 (파주)',     lat: 37.76, lng: 126.77, silk_type: 'sericulture',  annual_bolt: 100000,  major: false, desc: '조선 궁중 비단 원료 생산지. 사옹원 관할 잠실' },
  { name: '잠실(蠶室/서울)',           lat: 37.51, lng: 127.08, silk_type: 'sericulture',  annual_bolt: 120000,  major: false, desc: '조선 잠실도회(蠶室都會) 소재지. 현 서울 잠실동 지명 유래' },
  { name: '전주 비단',                 lat: 35.82, lng: 127.15, silk_type: 'weaving',      annual_bolt: 80000,   major: false, desc: '전라도 직조 거점. 조선 공납 비단 생산' },

  // ── 일본 ────────────────────────────────────────────
  { name: '교토(京都) 니시진',         lat: 35.03, lng: 135.75, silk_type: 'weaving',      annual_bolt: 500000,  major: true,  desc: '니시진오리(西陣織) — 일본 최고급 비단. 헤이안~에도 황실·귀족 수요' },
  { name: '나라(奈良) 비단',           lat: 34.68, lng: 135.83, silk_type: 'sericulture',  annual_bolt: 200000,  major: false, desc: '나라시대 조선·중국 견직 기술 전수 거점' },

  // ── 베트남 ──────────────────────────────────────────
  { name: '하노이(昇龍) 비단',         lat: 21.03, lng: 105.85, silk_type: 'weaving',      annual_bolt: 200000,  major: false, desc: '베트남 북부 직조 거점. 중국 영향 하에 비단 생산' },

];

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db  = client.db(DB_NAME);
  const col = db.collection('resources');

  // 기존 비단 데이터 삭제 후 재삽입
  const del = await col.deleteMany({ resource_type: 'silk' });
  console.log(`기존 silk 데이터 삭제: ${del.deletedCount}건`);

  const docs = SILK_DATA.map(d => ({
    resource_type: 'silk',
    name:          d.name,
    location:      { type: 'Point', coordinates: [d.lng, d.lat] },
    silk_type:     d.silk_type,
    annual_bolt:   d.annual_bolt,
    major:         d.major || false,
    description:   d.desc || '',
  }));

  const res = await col.insertMany(docs);
  console.log(`비단 산지 ${res.insertedCount}개 삽입 완료`);
  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
