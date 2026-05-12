/**
 * 고려만리지도 — 역사적 말 산지 (馬産地) 시드
 *
 * 출처: 삼국사기·고려사·조선왕조실록, 원사(元史), 사기(史記),
 *       한서(漢書) 서역전, 몽골 연대기, 투르크·거란 사료
 *
 * 필드:
 *   resource_type: 'horse'
 *   name / name_ko: 지명
 *   lat / lng
 *   region: 지역명
 *   major: 대형 산지 여부
 *   quality: 1~10 (말의 품질·명성)
 *   annual_horses: 연간 공급 두수 추정
 *   breed: 대표 품종명
 *   hist: 역사 기록
 *   strat: 전략적 가치
 *
 * 실행: node seed_horses.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'realhistory';

const HORSE_DATA = [

  // ══════════════════════════════════════════
  // 몽골 고원 — 세계 최대 군마 공급지
  // ══════════════════════════════════════════
  { name: 'Karakorum',      name_ko: '카라코룸 (哈剌和林)', region: '몽골',
    lat: 47.19, lng: 102.84, major: true, quality: 10, annual_horses: 200000,
    breed: '몽골마',
    hist:  '원(元) 제국의 수도. 몽골 고원 최대 군마 집산지. 칭기즈칸·오고타이칸의 원정 출발지.',
    strat: '세계 정복의 원동력. 연간 수십만 두 군마 공급. 역참(驛站)망의 핵심.' },
  { name: 'Övörkhangai',    name_ko: '오르혼 강 유역',      region: '몽골',
    lat: 46.85, lng: 102.50, major: true, quality: 10, annual_horses: 150000,
    breed: '몽골마',
    hist:  '흉노·유연·돌궐·위구르·몽골 역대 유목 제국의 심장부. 오르혼 비문 유적.',
    strat: '역대 북방 제국의 핵심 마산지. 기마 전투력의 원천.' },
  { name: 'Khövsgöl',       name_ko: '홉스골',              region: '몽골 북부',
    lat: 51.02, lng: 100.43, major: false, quality: 9, annual_horses: 50000,
    breed: '몽골마',
    hist:  '바이칼 인근 유목 지대. 몽골 북방 마산지.',
    strat: '시베리아 방면 원정 군마 공급.' },
  { name: 'Choibalsan',     name_ko: '초이발산',             region: '몽골 동부',
    lat: 48.07, lng: 114.54, major: true, quality: 9, annual_horses: 80000,
    breed: '몽골마',
    hist:  '동몽골 초원. 거란·몽골 동방 군마 집산지.',
    strat: '만주·고려 방면 원정 군마 공급. 거란 기병의 기반.' },

  // ══════════════════════════════════════════
  // 만주·요동
  // ══════════════════════════════════════════
  { name: '遼河平原',        name_ko: '요하 평원',           region: '遼寧省',
    lat: 41.80, lng: 122.10, major: true, quality: 8, annual_horses: 60000,
    breed: '요동마',
    hist:  '고구려·거란·여진·청 모두 이 일대에서 군마 조달. 거란 요(遼)의 핵심 마산지.',
    strat: '중원 침공의 발판. 만주 군사력의 기반.' },
  { name: '松花江流域',      name_ko: '송화강 유역',         region: '吉林省',
    lat: 43.90, lng: 126.55, major: true, quality: 8, annual_horses: 50000,
    breed: '여진마',
    hist:  '여진(女眞)족의 근거지. 금(金)·청(淸) 건국 기반. 말 사육 핵심 지역.',
    strat: '금 왕조 기병대의 원천. 청 팔기군 군마 기반.' },
  { name: '嫩江流域',        name_ko: '눈강 유역',           region: '黑龍江省',
    lat: 46.60, lng: 124.86, major: false, quality: 7, annual_horses: 30000,
    breed: '여진마',
    hist:  '흑룡강 서부 초원. 여진·몽골 마산지.',
    strat: '동북 방어선 군마 공급.' },
  { name: '興安嶺東側',      name_ko: '흥안령 동쪽',        region: '內蒙古 東部',
    lat: 47.33, lng: 119.76, major: true, quality: 9, annual_horses: 70000,
    breed: '몽골마',
    hist:  '대흥안령 동쪽 초원. 선비·거란·몽골의 발흥지.',
    strat: '동북아 최대 기마 민족 발원지. 중원 침입의 관문.' },

  // ══════════════════════════════════════════
  // 한반도
  // ══════════════════════════════════════════
  { name: '濟州',             name_ko: '제주 (濟州)',         region: '山東省',
    lat: 35.41, lng: 116.59, major: true, quality: 8, annual_horses: 20000,
    breed: '제주마 (과하마)',
    hist:  '고려 원종 때 원(元)이 목마장(牧馬場) 설치. 조선 시대까지 국가 군마 핵심 공급지. 몽골마 직계.',
    strat: '삼별초 항쟁 후 원의 직할 목마장.' },
  { name: '耽羅 (濟州島)',   name_ko: '탐라 (제주도)',       region: '제주',
    lat: 33.49, lng: 126.53, major: true, quality: 8, annual_horses: 10000,
    breed: '제주마 (과하마)',
    hist:  '고려 원종 때 원(元)이 설치한 탐라 목마장. 한라산 기슭 대규모 국영 목장. 몽골마 직계 품종.',
    strat: '조선 최대 국마(國馬) 산지. 최대 1만여 필 공급. 삼별초 항쟁 후 원의 직할 목마장.' },
  { name: '平壤 牧場',       name_ko: '평양 목장',           region: '평안도',
    lat: 39.03, lng: 125.75, major: true, quality: 7, annual_horses: 10000,
    breed: '한국 재래마',
    hist:  '고려·조선 평안도 국영 목장. 북방 방어 군마 조달지.',
    strat: '의주·강계 방어선 군마 공급.' },
  { name: '咸鏡道 牧場',     name_ko: '함경도 목장',         region: '함경도',
    lat: 40.10, lng: 127.73, major: true, quality: 8, annual_horses: 12000,
    breed: '한국 재래마 (여진마 혼혈)',
    hist:  '조선 육진(六鎭) 개척과 함께 북방 군마 공급. 여진마 혼혈로 체격 우수.',
    strat: '북방 여진 방어 기병 군마 핵심 공급지.' },
  { name: '江華島 牧場',     name_ko: '강화도 목장',         region: '경기',
    lat: 37.74, lng: 126.48, major: false, quality: 6, annual_horses: 3000,
    breed: '한국 재래마',
    hist:  '고려 강도(江都) 시기 및 조선 후기 국영 목장.',
    strat: '수도권 방어 기병 군마 공급.' },
  { name: '全羅道 海島 牧場', name_ko: '전라도 해도 목장',  region: '전라도',
    lat: 34.83, lng: 126.46, major: false, quality: 6, annual_horses: 5000,
    breed: '한국 재래마',
    hist:  '조선 시대 전라도 도서 지역 목장. 진도·완도·고금도 등.',
    strat: '수군 보급 및 남방 방어 군마.' },

  // ══════════════════════════════════════════
  // 중국 북방 — 역대 왕조 군마 전쟁의 핵심
  // ══════════════════════════════════════════
  { name: '河套',            name_ko: '하투 (河套)',         region: '內蒙古·寧夏',
    lat: 40.30, lng: 107.50, major: true, quality: 9, annual_horses: 100000,
    breed: '하투마',
    hist:  '황하 대곡(大曲) 안 초원. 흉노·한(漢) 격쟁의 무대. 漢 무제가 탈환 후 대규모 목마장 설치.',
    strat: '중원 왕조의 생존이 걸린 전략 마산지. "河套 없으면 기병 없다".' },
  { name: '陰山 南麓',       name_ko: '음산 남쪽',          region: '內蒙古',
    lat: 41.20, lng: 111.60, major: true, quality: 9, annual_horses: 80000,
    breed: '흉노마',
    hist:  '흉노 최대 거점. 진시황의 장성 건설 이유. 한 왕조와 수백 년 쟁탈전.',
    strat: '장성 방어선의 핵심. 이 지역 확보가 곧 기병력.' },
  { name: '關中 牧場',       name_ko: '관중 목장',          region: '陝西省',
    lat: 34.60, lng: 108.80, major: true, quality: 8, annual_horses: 40000,
    breed: '관중마',
    hist:  '秦·漢·唐 왕조의 국영 목마장. 漢 문제·경제 시기 대규모 양마 정책.',
    strat: '장안(長安) 방어 및 북벌 군마 공급.' },
  { name: '涼州 (武威)',     name_ko: '양주 (무위)',         region: '甘肅省',
    lat: 37.93, lng: 102.64, major: true, quality: 10, annual_horses: 90000,
    breed: '한혈마 혼혈',
    hist:  '漢 무제 서역 원정 이후 최대 군마 기지. 한혈마(汗血馬) 유입 창구. 당(唐) 최대 마정(馬政) 중심지.',
    strat: '실크로드 군사 요충. 서역마 도입의 관문. 당 10만 기병의 기반.' },
  { name: '朔方 (靈州)',     name_ko: '삭방 (영주)',         region: '寧夏',
    lat: 38.10, lng: 106.30, major: true, quality: 8, annual_horses: 50000,
    breed: '몽골마 혼혈',
    hist:  '당·송·서하 삼자 쟁탈의 요충. 당 삭방절도사 군마 기지.',
    strat: '황하 상류 군사 요충. 북방 방어 기병 공급.' },
  { name: '幽州 (燕京)',     name_ko: '유주 (연경)',         region: '河北省',
    lat: 39.90, lng: 116.40, major: true, quality: 8, annual_horses: 60000,
    breed: '연마 (燕馬)',
    hist:  '연(燕)·거란·금·원·명 모두 이 일대에서 군마 조달. 거란 16주의 핵심.',
    strat: '중원-북방 접경 최대 군마 집산지. 연운16주 전략 가치의 핵심.' },
  { name: '代州 雁門',       name_ko: '대주 안문관',         region: '山西省',
    lat: 39.07, lng: 113.30, major: false, quality: 7, annual_horses: 20000,
    breed: '대마 (代馬)',
    hist:  '안문관 너머 북방 초원과의 접경. 漢·唐 시대 대마(代馬) 산지.',
    strat: '산서 북방 방어선 군마 공급.' },
  { name: '燕山 牧場',       name_ko: '연산 목장',           region: '遼寧·河北',
    lat: 41.00, lng: 119.50, major: false, quality: 7, annual_horses: 25000,
    breed: '거란마',
    hist:  '거란(요) 왕조의 배후 마산지. 만리장성 밖 초원.',
    strat: '요 왕조 기병력의 예비 공급지.' },

  // ══════════════════════════════════════════
  // 서역 — 명마의 고향
  // ══════════════════════════════════════════
  { name: '費爾干納 (大宛)', name_ko: '페르가나 (대완)',     region: '우즈베키스탄',
    lat: 40.38, lng: 71.78, major: true, quality: 10, annual_horses: 30000,
    breed: '한혈마 (汗血馬)',
    hist:  '漢 무제가 이소경(貳師將軍) 이광리를 두 차례 원정 파견(BC 104·101)해 탈취. 하루 천 리 달리는 "천마(天馬)".',
    strat: '실크로드 최고의 군마. 흉노 견제용. 한 제국 기병 혁명의 시작.' },
  { name: '粟特 (소그드)',   name_ko: '소그디아나',          region: '타지키스탄·우즈베키스탄',
    lat: 39.65, lng: 66.97, major: true, quality: 9, annual_horses: 20000,
    breed: '아라비아·박트리아 혼혈마',
    hist:  '실크로드 교역 민족. 당(唐) 궁정에 명마 지속 헌납. 소그드 기마병.',
    strat: '당 황실 어마(御馬) 공급. 서역 교역 군마 통로.' },
  { name: '박트리아',        name_ko: '박트리아',            region: '아프가니스탄',
    lat: 36.72, lng: 67.11, major: true, quality: 9, annual_horses: 25000,
    breed: '박트리아 전마',
    hist:  '알렉산더 대왕 원정 이후 동서 혼혈 명마 산지. 쿠샨 제국 기마 전력의 기반.',
    strat: '인도·파르티아·중앙아시아 연결 전략 마산지.' },
  { name: '파르티아',        name_ko: '파르티아',            region: '이란',
    lat: 37.10, lng: 55.10, major: true, quality: 10, annual_horses: 40000,
    breed: '니사 전마 (아르사케스마)',
    hist:  '카레 전투(BC 53)에서 로마 크라수스를 격파. 파르티안 샷(Parthian Shot) 전법.',
    strat: '고대 중동 최강 기마 전력. 니사(Nisa) 왕실 목마장.' },
  { name: '天山 北麓',       name_ko: '천산 북쪽',           region: '新疆',
    lat: 43.80, lng: 87.60, major: true, quality: 9, annual_horses: 35000,
    breed: '천마 (天馬)',
    hist:  '돌궐·위구르·카를룩의 유목 근거지. 당 왕조가 천산 목장을 직접 경영.',
    strat: '당 기미부주(羈縻府州) 군마 공급. 서역 지배의 기반.' },
  { name: '伊犁河 유역',     name_ko: '이리강 유역',         region: '新疆',
    lat: 43.92, lng: 81.34, major: true, quality: 10, annual_horses: 50000,
    breed: '이리마 (伊犁馬)',
    hist:  '천산 서측 최대 목마 지대. 돌궐·서요·차가타이 칸국 군마 기지.',
    strat: '중앙아시아 서방 원정의 군마 기반. 현재도 중국 최대 마산지.' },

  // ══════════════════════════════════════════
  // 티베트·서남
  // ══════════════════════════════════════════
  { name: '吐蕃 高原',       name_ko: '토번 고원',           region: '西藏',
    lat: 31.10, lng: 88.80, major: true, quality: 8, annual_horses: 40000,
    breed: '장족마 (藏馬)',
    hist:  '토번(吐蕃) 왕조의 강대함은 티베트 고원 군마에서 기원. 당과 백년 전쟁.',
    strat: '고원 적응 지구력 최강 군마. 당·송의 최대 위협.' },
  { name: '大理 (南詔)',     name_ko: '대리 (남조)',          region: '雲南省',
    lat: 25.59, lng: 100.27, major: true, quality: 7, annual_horses: 15000,
    breed: '전마 (滇馬)',
    hist:  '남조(南詔)·대리국(大理國)의 군마. 송(宋)이 북방 마산지 상실 후 차선으로 조달.',
    strat: '남방 실크로드 군마. 송의 북방 말 부족을 일부 보완.' },

  // ══════════════════════════════════════════
  // 중국 동북 — 삼국시대 말 산지
  // ══════════════════════════════════════════
  { name: '烏桓·鮮卑 東部',  name_ko: '오환·선비 동부',      region: '遼寧·吉林',
    lat: 42.50, lng: 121.00, major: true, quality: 8, annual_horses: 45000,
    breed: '오환마·선비마',
    hist:  '오환(烏桓)·선비(鮮卑) 부족의 마산지. 조조가 오환 원정(207)으로 확보. 위진남북조 군마 기반.',
    strat: '삼국시대 위(魏)·조조의 북방 기병 원천.' },
  { name: '高句麗 牧場',     name_ko: '고구려 목장',         region: '吉林省 集安',
    lat: 41.12, lng: 126.18, major: true, quality: 8, annual_horses: 20000,
    breed: '고구려 과하마',
    hist:  '고구려의 명마 과하마(果下馬)는 키가 작지만 산악 지형에 최적. 삼국지 위지 동이전 기록.',
    strat: '고구려 기마전사의 기반. 산악 기동전 특화.' },
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

  // 기존 horse 데이터 삭제
  const del = await col.deleteMany({ resource_type: 'horse' });
  console.log(`🗑️  기존 horse 삭제: ${del.deletedCount}건`);

  const now = new Date();
  const docs = HORSE_DATA.map(d => ({
    resource_type:  'horse',
    region:         d.region,
    name:           d.name,
    name_ko:        d.name_ko,
    lat:            d.lat,
    lng:            d.lng,
    location:       { type: 'Point', coordinates: [d.lng, d.lat] },
    major:          d.major || false,
    quality:        d.quality || 5,
    annual_horses:  d.annual_horses || 0,
    breed:          d.breed || '',
    hist:           d.hist  || '',
    strat:          d.strat || '',
    created_at:     now,
    updated_at:     now,
  }));

  const r = await col.insertMany(docs, { ordered: false });
  console.log(`✅ 말 산지 삽입: ${r.insertedCount}건`);

  console.log('\n📊 전체 현황:');
  console.log('  horse 전체:', await col.countDocuments({ resource_type: 'horse' }));

  // 지역별 요약
  const byRegion = await col.aggregate([
    { $match: { resource_type: 'horse' } },
    { $group: { _id: '$region', count: { $sum: 1 }, totalHorses: { $sum: '$annual_horses' } } },
    { $sort: { totalHorses: -1 } }
  ]).toArray();
  byRegion.forEach(r => console.log(`  ${r._id}: ${r.count}곳, 연간 ${r.totalHorses.toLocaleString()}두`));

  await client.close();
  console.log('\n🔌 완료');
}

main().catch(console.error);
