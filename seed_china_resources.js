/**
 * 중국 대륙 금·철광 산지 보강 시드
 * 기존 데이터에 없는 지역을 중심으로 추가
 *
 * 실행: node seed_china_resources.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'realhistory';

// ════════════════════════════════════════════════════════
// 추가할 중국 금 산지
// ════════════════════════════════════════════════════════
const CHINA_GOLD_ADD = [
  // ── 吉林·黑龍江 (동북 보강) ──
  { name: '吉林夾皮溝',   lat: 42.72, lng: 127.03, region: '吉林省',  major: true,
    hist:  '청대 최대 금광 중 하나. 光緖 연간 관영·민간 채굴 폭발적 성장.',
    strat: '만주 금 공급의 핵심. 청 황실 내탕금 산지.' },
  { name: '吉林樺甸',     lat: 42.98, lng: 126.74, region: '吉林省',  major: false,
    hist:  '청대 사금 채취 기록.' },
  { name: '黑龍江鶴崗',   lat: 47.35, lng: 130.28, region: '黑龍江省', major: false,
    hist:  '흑룡강 중류 사금지.' },
  { name: '黑龍江嘉蔭',   lat: 48.87, lng: 130.38, region: '黑龍江省', major: false,
    hist:  '흑룡강 북안 러시아 국경 인근 사금지.' },

  // ── 江西省 (중국 역사상 최대 금산지 중 하나) ──
  { name: '江西德興',     lat: 28.95, lng: 117.58, region: '江西省',  major: true,
    hist:  '중국 최대 구리·금 복합 광산. 宋代부터 대규모 채굴. 현재도 중국 최대 금동 산지.',
    strat: '장강 남쪽 금 공급의 핵심. 송·원·명·청 전 시대 재정 기반.' },
  { name: '江西上饒',     lat: 28.46, lng: 117.97, region: '江西省',  major: false,
    hist:  '宋代 금은 산지. 덕흥과 함께 강서 양대 금산지.' },
  { name: '江西瑞金',     lat: 25.88, lng: 116.03, region: '江西省',  major: false,
    hist:  '명대 채굴 기록. 강서 남부 금산지.' },
  { name: '江西萬載',     lat: 28.10, lng: 114.44, region: '江西省',  major: false,
    hist:  '청대 사금 채취 기록.' },

  // ── 湖南省 ──
  { name: '湖南沅陵',     lat: 28.46, lng: 110.39, region: '湖南省',  major: true,
    hist:  '漢代부터 金所. 원릉은 중국 남방 최대 역사 금산지 중 하나.',
    strat: '원강(沅江) 유역 금 공급지. 남조·당·송 조정 금 조달.' },
  { name: '湖南郴州',     lat: 25.79, lng: 113.02, region: '湖南省',  major: false,
    hist:  '漢~唐代 금은 산지. 남령(南嶺) 북쪽 광산 지대.' },
  { name: '湖南炎陵',     lat: 26.49, lng: 113.77, region: '湖南省',  major: false,
    hist:  '송대 이후 채굴 기록.' },

  // ── 貴州省 ──
  { name: '貴州貴陽北',   lat: 27.08, lng: 106.71, region: '貴州省',  major: true,
    hist:  '명대부터 대규모 채굴. 귀주는 중국 3대 금산지 중 하나.',
    strat: '서남 금 공급의 핵심. 명·청 귀주 개발 재원.' },
  { name: '貴州黔西南',   lat: 25.09, lng: 105.61, region: '貴州省',  major: true,
    hist:  '현 중국 최대 금광 중 하나(烂泥沟). 역사적으로도 채굴 기록.',
    strat: '귀주 남서부 최대 금산지.' },
  { name: '貴州銅仁',     lat: 27.72, lng: 109.18, region: '貴州省',  major: false,
    hist:  '명·청대 금동 복합 산지.' },
  { name: '貴州遵義',     lat: 27.73, lng: 106.93, region: '貴州省',  major: false,
    hist:  '청대 채굴 기록.' },

  // ── 福建·廣東 ──
  { name: '福建紫金山',   lat: 23.71, lng: 115.73, region: '廣東省',  major: true,
    hist:  '紫金山 금광. 명대부터 채굴, 현재 중국 최대 단일 금광 중 하나.',
    strat: '화남 최대 금산지. 복건·광동 접경 핵심 금광.' },
  { name: '福建上杭',     lat: 25.05, lng: 116.42, region: '福建省',  major: false,
    hist:  '명·청대 채굴 기록. 자금산 인근 위성 산지.' },
  { name: '廣東廉江',     lat: 21.61, lng: 110.29, region: '廣東省',  major: false,
    hist:  '廣東 남서부 사금 채취 지역.' },

  // ── 浙江省 ──
  { name: '浙江遂昌',     lat: 28.59, lng: 119.28, region: '浙江省',  major: true,
    hist:  '漢代부터 채굴. 명대 湯顯祖가 현령 재직 시 금광 기록 다수.',
    strat: '절강 최대 금산지. 동남 해안 금 공급.' },
  { name: '浙江龍泉',     lat: 28.07, lng: 119.14, region: '浙江省',  major: false,
    hist:  '용천검 산지이자 금은 산지. 송·원대 기록.' },

  // ── 陝西·甘肅 보강 ──
  { name: '陝西潼關',     lat: 34.55, lng: 110.28, region: '陝西省',  major: true,
    hist:  '潼關 사금은 漢代부터 유명. 황하 삼문협 인근 최대 사금지.',
    strat: '관중(關中) 금 공급. 秦·漢·唐 왕조 재정 기반.' },
  { name: '甘肅靖遠',     lat: 36.57, lng: 104.69, region: '甘肅省',  major: false,
    hist:  '황하 상류 사금 채취 지역. 청대 기록.' },

  // ── 西藏 ──
  { name: '西藏曲松',     lat: 29.06, lng: 93.78, region: '西藏',    major: true,
    hist:  '티베트 고원 최대 금산지. 당·번(唐蕃) 화친 시 금 공납지.',
    strat: '토번(吐蕃) 왕조 금 재정의 핵심. 실크로드 금 공급.' },
  { name: '西藏那曲',     lat: 31.48, lng: 92.07, region: '西藏',    major: false,
    hist:  '청대 이후 채굴 기록. 티베트 북부 사금지.' },

  // ── 寧夏·靑海 보강 ──
  { name: '靑海果洛',     lat: 34.47, lng: 100.24, region: '靑海省',  major: true,
    hist:  '황하 발원지 인근 금산지. 당·송 시대 금 공납지.',
    strat: '황하 상류 금 공급. 토번·서하·원 왕조 재원.' },
  { name: '靑海海西',     lat: 37.37, lng: 95.31,  region: '靑海省',  major: false,
    hist:  '청대 채굴 기록. 실크로드 금산지.' },

  // ── 四川 보강 ──
  { name: '四川馬爾康',   lat: 31.91, lng: 102.21, region: '四川省',  major: false,
    hist:  '청대 사금 채취 기록. 대도하(大渡河) 상류.' },
  { name: '四川道孚',     lat: 30.99, lng: 101.13, region: '四川省',  major: false,
    hist:  '감자(甘孜) 지역 금산지. 당·송대 서번(西蕃) 금 공납지.' },

  // ── 安徽·江蘇 ──
  { name: '安徽金寨',     lat: 31.73, lng: 115.93, region: '安徽省',  major: false,
    hist:  '금채(金寨)라는 지명이 금에서 유래. 宋代 산금 기록.' },
  { name: '安徽黟縣',     lat: 29.93, lng: 117.94, region: '安徽省',  major: false,
    hist:  '徽州 금은 산지. 徽商 자본 축적 기반.' },
];

// ════════════════════════════════════════════════════════
// 추가할 중국 철광 산지
// ════════════════════════════════════════════════════════
const CHINA_IRON_ADD = [
  // ── 吉林·黑龍江 (동북 보강) ──
  { name: '吉林通化',     lat: 41.73, lng: 125.94, region: '吉林省',  major: true,
    hist:  '통화 철광은 동북 3성 주요 철광 중 하나. 청대부터 채굴.',
    strat: '고구려 수도(국내성) 인근 철 산지. 만주 병기 생산 기반.' },
  { name: '黑龍江伊春',   lat: 47.73, lng: 128.90, region: '黑龍江省', major: false,
    hist:  '흑룡강 동북부 철광. 청대 기록.' },
  { name: '黑龍江齊齊哈爾', lat: 47.35, lng: 123.92, region: '黑龍江省', major: false,
    hist:  '눈강(嫩江) 유역 철광. 청대 개발.' },

  // ── 江西省 ──
  { name: '江西新余',     lat: 27.82, lng: 114.92, region: '江西省',  major: true,
    hist:  '강서 최대 철강 도시의 기원. 漢代부터 철 채굴. 현재도 신강철(新鋼) 소재지.',
    strat: '장강 남쪽 최대 철 공급지. 송·명대 병기·농기구 원료.' },
  { name: '江西豐城',     lat: 28.19, lng: 115.77, region: '江西省',  major: false,
    hist:  '唐·宋代 철소(鐵所) 기록. 강서 중부 철 산지.' },

  // ── 湖南省 ──
  { name: '湖南湘潭',     lat: 27.83, lng: 112.94, region: '湖南省',  major: true,
    hist:  '湘江 유역 철광. 漢冶萍(한야평) 철강 원료 산지 중 하나.',
    strat: '한야평 철강 복합체 원료 공급. 근대 중국 철강의 요람.' },
  { name: '湖南桂陽',     lat: 25.75, lng: 112.72, region: '湖南省',  major: false,
    hist:  '남령 북쪽 철광. 宋~明代 채굴 기록.' },
  { name: '湖南新化',     lat: 27.73, lng: 111.31, region: '湖南省',  major: false,
    hist:  '청대 철 채굴 기록.' },

  // ── 陝西省 ──
  { name: '陝西韓城',     lat: 35.48, lng: 110.45, region: '陝西省',  major: true,
    hist:  '황하 서안 대규모 철광. 秦·漢 시대 제철 중심지.',
    strat: '관중 병기 생산 핵심 원료. 진(秦) 제국 철기 군대의 기반.' },
  { name: '陝西寶鷄',     lat: 34.36, lng: 107.24, region: '陝西省',  major: false,
    hist:  '渭水 상류 철광. 주(周)·진(秦)대 병기 원료 산지.' },
  { name: '陝西商洛',     lat: 33.87, lng: 109.92, region: '陝西省',  major: false,
    hist:  '진령(秦嶺) 남쪽 철광. 명대 채굴 기록.' },

  // ── 河南省 보강 ──
  { name: '河南舞陽',     lat: 33.43, lng: 113.59, region: '河南省',  major: true,
    hist:  '중국 중원 최대 철광 중 하나. 신석기~상(商)대부터 철 이용 흔적.',
    strat: '중원 병기 생산 핵심. 상·주·진·한 모든 왕조의 철 공급지.' },
  { name: '河南安陽',     lat: 36.10, lng: 114.39, region: '河南省',  major: false,
    hist:  '상(商) 수도 인근 철 산지. 은허 출토 철기 원료.' },

  // ── 貴州省 ──
  { name: '貴州水城',     lat: 26.55, lng: 104.95, region: '貴州省',  major: true,
    hist:  '귀주 최대 철광. 명대부터 채굴. 현 수강(水鋼) 제철소 소재지.',
    strat: '서남 철 공급 핵심. 명·청 서남 개발 군비 원료.' },
  { name: '貴州都勻',     lat: 26.26, lng: 107.53, region: '貴州省',  major: false,
    hist:  '청대 철 채굴 기록.' },

  // ── 四川 보강 ──
  { name: '四川江油',     lat: 31.78, lng: 104.75, region: '四川省',  major: true,
    hist:  '촉한(蜀漢) 시대부터 철 채굴. 제갈량 북벌 병기 원료 산지.',
    strat: '촉 병기 생산 핵심 원료. 삼국시대 촉한 군비 기반.' },
  { name: '四川峨眉山',   lat: 29.60, lng: 103.48, region: '四川省',  major: false,
    hist:  '아미산 인근 철광. 宋代 기록.' },

  // ── 雲南省 보강 ──
  { name: '雲南楚雄',     lat: 25.05, lng: 101.55, region: '雲南省',  major: true,
    hist:  '운남 최대 철광 지역. 滇王國(전국)부터 철 이용 기록.',
    strat: '서남 철 공급 핵심. 당·남조·원·명·청 서남 통치 기반.' },
  { name: '雲南紅河',     lat: 23.37, lng: 102.42, region: '雲南省',  major: false,
    hist:  '홍하 유역 철광. 명대 채굴 기록.' },

  // ── 廣東·廣西 보강 ──
  { name: '廣東韶關',     lat: 24.81, lng: 113.60, region: '廣東省',  major: true,
    hist:  '南嶺 남쪽 최대 철광. 漢代부터 채굴. 현 韶鋼(소강) 소재지.',
    strat: '화남 병기·농기구 철 핵심 공급지. 해상실크로드 철 수출 기반.' },
  { name: '廣西百色',     lat: 23.90, lng: 106.62, region: '廣西省',  major: false,
    hist:  '명·청대 광서 철광. 남방 철 산지.' },

  // ── 福建省 ──
  { name: '福建三明',     lat: 26.26, lng: 117.64, region: '福建省',  major: true,
    hist:  '복건 최대 철광. 宋代부터 채굴. 현 三鋼(삼강) 소재지.',
    strat: '복건 병기·농기구 원료. 해안 수군 기반.' },
  { name: '福建漳平',     lat: 25.29, lng: 117.41, region: '福建省',  major: false,
    hist:  '明代 채굴 기록. 복건 내륙 철광.' },

  // ── 安徽省 보강 ──
  { name: '安徽繁昌',     lat: 31.10, lng: 118.20, region: '安徽省',  major: true,
    hist:  '장강 남안 철광. 宋代 번창요(繁昌窯) 인근 철 산지.',
    strat: '마안산(馬鞍山)과 함께 장강 중하류 철 공급지.' },

  // ── 甘肅·寧夏 보강 ──
  { name: '甘肅酒泉',     lat: 39.73, lng: 98.49,  region: '甘肅省',  major: false,
    hist:  '하서회랑(河西回廊) 철광. 漢代 군비 조달지.',
    strat: '실크로드 요충지 병기 원료 공급.' },
  { name: '寧夏石嘴山',   lat: 39.02, lng: 106.37, region: '寧夏',    major: true,
    hist:  '황하 상류 최대 탄철 복합 산지. 西夏 병기 생산 기반.',
    strat: '서하(西夏) 왕조 철 병기 생산 핵심 원료지.' },
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

  const now = new Date();

  function toDoc(d, type) {
    return {
      resource_type: type,
      region:        d.region,
      name:          d.name,
      lat:           d.lat,
      lng:           d.lng,
      location:      { type: 'Point', coordinates: [d.lng, d.lat] },
      major:         d.major || false,
      hist:          d.hist  || '',
      strat:         d.strat || '',
      created_at:    now,
      updated_at:    now,
    };
  }

  const goldDocs = CHINA_GOLD_ADD.map(d => toDoc(d, 'gold'));
  const ironDocs = CHINA_IRON_ADD.map(d => toDoc(d, 'iron'));

  const r1 = await col.insertMany(goldDocs, { ordered: false });
  const r2 = await col.insertMany(ironDocs, { ordered: false });

  console.log(`✅ 금 산지 추가 삽입: ${r1.insertedCount}건`);
  console.log(`✅ 철광 산지 추가 삽입: ${r2.insertedCount}건`);

  console.log('\n📊 전체 현황:');
  console.log('  gold 전체:', await col.countDocuments({ resource_type: 'gold' }));
  console.log('  iron 전체:', await col.countDocuments({ resource_type: 'iron' }));

  await client.close();
  console.log('\n🔌 완료');
}

main().catch(console.error);
