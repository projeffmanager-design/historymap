/**
 * seed_animals.js — 물소·원숭이·낙타 서식지/산지 데이터
 * resource_type: 'buffalo' | 'monkey' | 'camel'
 * 실행: node seed_animals.js
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const DB_NAME = 'realhistory';

const ANIMAL_DATA = [

  // ══════════════════════════════════════════
  // 🐃 물소 (Water Buffalo)  resource_type: 'buffalo'
  // ══════════════════════════════════════════
  { resource_type:'buffalo', name:'Irrawaddy Delta', name_ko:'이라와디 삼각주', region:'미얀마', lat:17.0, lng:95.5, major:true, annual_count:500000, desc:'동남아시아 최대 수전 경작 물소. 논갈이·운반 핵심' },
  { resource_type:'buffalo', name:'Chao Phraya Basin', name_ko:'짜오프라야 평원', region:'태국', lat:14.5, lng:100.5, major:true, annual_count:400000, desc:'태국 중부 수전 지대. 수코타이~아유타야 왕조의 농업 기반' },
  { resource_type:'buffalo', name:'Mekong Delta', name_ko:'메콩 삼각주', region:'베트남', lat:10.3, lng:105.8, major:true, annual_count:350000, desc:'남베트남 대규모 벼농사. 참파·진랍·크메르 이후 지속 이용' },
  { resource_type:'buffalo', name:'Java Plains', name_ko:'자바 평야', region:'인도네시아 자바', lat:-7.5, lng:110.5, major:true, annual_count:300000, desc:'자바섬 수전 경작. 마자파힛 왕국 농업 기반' },
  { resource_type:'buffalo', name:'Yangtze Delta', name_ko:'양쯔강 하류 (蘇·浙·皖)', region:'중국 강남', lat:31.0, lng:120.0, major:true, annual_count:600000, desc:'강남 수전 농업 핵심. 한~청 대규모 쌀 생산 견인' },
  { resource_type:'buffalo', name:'Pearl River Delta', name_ko:'주강 삼각주 (廣東)', region:'중국 광동', lat:23.0, lng:113.5, major:false, annual_count:250000, desc:'광동·광서 수전 경작. 한족 이주 이후 확산' },
  { resource_type:'buffalo', name:'Sichuan Basin', name_ko:'사천 분지', region:'중국 사천', lat:30.5, lng:104.5, major:false, annual_count:200000, desc:'촉(蜀) 지역 대규모 수전. 도강언 수리시설과 연계' },
  { resource_type:'buffalo', name:'Red River Delta', name_ko:'홍하 삼각주', region:'베트남 북부', lat:20.8, lng:106.0, major:true, annual_count:280000, desc:'대월(大越) 핵심 농경지. 물소 이용 집약 농업' },
  { resource_type:'buffalo', name:'Luzon Lowlands', name_ko:'루손 저지대', region:'필리핀', lat:15.5, lng:121.0, major:false, annual_count:150000, desc:'필리핀 최대 물소(카라바오) 서식지. 이고로트족 농경 기반' },
  { resource_type:'buffalo', name:'Deccan Plateau', name_ko:'데칸 고원', region:'인도 중부', lat:17.5, lng:76.5, major:false, annual_count:300000, desc:'인도 중부 건조 농경 지대. 물소 역축 이용' },
  { resource_type:'buffalo', name:'Ganges Plain', name_ko:'갠지스 평원', region:'인도 북부', lat:26.0, lng:82.0, major:true, annual_count:700000, desc:'인도 아대륙 최대 물소 분포지. 젖소·역축 겸용' },
  { resource_type:'buffalo', name:'Korean Peninsula S.', name_ko:'한반도 남부', region:'한국', lat:36.0, lng:127.5, major:false, annual_count:80000, desc:'고려~조선 수전 경작 물소. 제주 흑우와 함께 농경 기반' },

  // ══════════════════════════════════════════
  // 🐒 원숭이 (Macaque / Monkey)  resource_type: 'monkey'
  // ══════════════════════════════════════════
  { resource_type:'monkey', name:'Yunnan Forests', name_ko:'윈난 밀림', region:'중국 운남', lat:24.5, lng:100.5, major:true, annual_count:0, desc:'검은 들창코원숭이(금사후) 서식. 남조·대리국 신성시. 실크로드 교역품' },
  { resource_type:'monkey', name:'Hainan Island', name_ko:'하이난 섬', region:'중국 해남', lat:19.5, lng:109.5, major:false, annual_count:0, desc:'긴팔원숭이(장비원) 서식. 당~송 유배지 문인 시에 자주 등장' },
  { resource_type:'monkey', name:'South China Hills', name_ko:'화남 구릉지대', region:'중국 남부', lat:24.0, lng:112.0, major:true, annual_count:0, desc:'원숭이 서식 밀집. 사서(史書)에 "猿聲" 기록 다수. 광동·광서 산지' },
  { resource_type:'monkey', name:'Sichuan Min Mts', name_ko:'사천 민산(岷山)', region:'중국 사천', lat:32.5, lng:104.0, major:false, annual_count:0, desc:'촉산 원숭이 서식지. 이백(李白) 시 "兩岸猿聲啼不住" 배경' },
  { resource_type:'monkey', name:'Borneo Rainforest', name_ko:'보르네오 밀림', region:'말레이시아/인도네시아', lat:1.0, lng:114.0, major:true, annual_count:0, desc:'오랑우탄·코주부원숭이 서식. 브루나이 술탄국 산림 거점' },
  { resource_type:'monkey', name:'Sumatra Highlands', name_ko:'수마트라 고원', region:'인도네시아', lat:2.0, lng:99.0, major:false, annual_count:0, desc:'수마트라오랑우탄 서식. 스리비자야 왕국 산림 영역' },
  { resource_type:'monkey', name:'Ganges-Brahmaputra', name_ko:'갠지스·브라마푸트라 유역', region:'인도·방글라데시', lat:24.0, lng:89.5, major:true, annual_count:0, desc:'레서스원숭이(붉은원숭이) 대규모 서식. 힌두교 숭배 대상 하누만' },
  { resource_type:'monkey', name:'Western Ghats', name_ko:'서가츠 산맥', region:'인도 남서부', lat:11.0, lng:76.5, major:true, annual_count:0, desc:'라이온테일원숭이 서식. 촐라 왕국 신성 동물' },
  { resource_type:'monkey', name:'Japan Alps', name_ko:'일본 알프스 (長野)', region:'일본', lat:36.5, lng:137.5, major:true, annual_count:0, desc:'일본원숭이(눈원숭이) 서식. 헤이안~에도 문화 속 신성 상징' },
  { resource_type:'monkey', name:'Korea Jeju (historic)', name_ko:'제주 (역사적 기록)', region:'한국 제주', lat:33.4, lng:126.5, major:false, annual_count:0, desc:'고려·조선 사서에 제주 원숭이 진상 기록. 현재는 절멸' },
  { resource_type:'monkey', name:'Indochina Peninsula', name_ko:'인도차이나 반도 산지', region:'라오스·캄보디아', lat:16.0, lng:103.0, major:false, annual_count:0, desc:'크메르 제국 영역 내 원숭이 서식. 앙코르와트 부조에 묘사' },

  // ══════════════════════════════════════════
  // 🐪 낙타 (Camel)  resource_type: 'camel'
  // ══════════════════════════════════════════
  { resource_type:'camel', name:'Gobi Desert', name_ko:'고비 사막', region:'몽골·중국 내몽골', lat:43.5, lng:106.0, major:true, annual_count:200000, desc:'쌍봉낙타 최대 서식지. 실크로드 동방 교역 핵심 운반 수단' },
  { resource_type:'camel', name:'Tarim Basin', name_ko:'타림 분지 (타클라마칸)', region:'중국 신장', lat:39.0, lng:83.0, major:true, annual_count:150000, desc:'실크로드 서역 남로. 누란·호탄·쿠차 연결 낙타 대상(隊商) 거점' },
  { resource_type:'camel', name:'Dzungaria', name_ko:'준가르 분지', region:'중국 신장 북부', lat:45.5, lng:86.0, major:true, annual_count:120000, desc:'준가르 오이라트 제국 낙타 목축 거점. 청 제국과의 전쟁 보급선' },
  { resource_type:'camel', name:'Ordos Plateau', name_ko:'오르도스 고원', region:'중국 내몽골', lat:39.5, lng:108.5, major:true, annual_count:100000, desc:'흉노·선비·탁발위 낙타 서식지. 만리장성 이북 유목 핵심' },
  { resource_type:'camel', name:'Bactria (Balkh)', name_ko:'박트리아 (발흐)', region:'아프가니스탄', lat:36.8, lng:66.9, major:true, annual_count:180000, desc:'쌍봉낙타 원산지 추정지. 알렉산더~쿠샨~사산 제국 교역 기반' },
  { resource_type:'camel', name:'Sogdiana', name_ko:'소그디아나 (사마르칸트)', region:'우즈베키스탄', lat:39.5, lng:66.5, major:true, annual_count:160000, desc:'소그드 상인 낙타 대상 교역 핵심 거점. 실크로드 서중앙 허브' },
  { resource_type:'camel', name:'Arabian Peninsula', name_ko:'아라비아 반도', region:'아라비아', lat:24.0, lng:45.0, major:true, annual_count:300000, desc:'단봉낙타 최대 산지. 아랍 교역·군사 기반. 이슬람 팽창 운반 수단' },
  { resource_type:'camel', name:'Persian Plateau', name_ko:'이란 고원', region:'이란', lat:32.0, lng:54.0, major:true, annual_count:200000, desc:'아케메네스·파르티아·사산 제국 낙타 운용. 동서 교역 중계' },
  { resource_type:'camel', name:'Tibetan Plateau W.', name_ko:'티베트 고원 서부', region:'티베트', lat:32.0, lng:84.0, major:false, annual_count:50000, desc:'티베트 서부 쌍봉낙타 서식. 차마고도 보조 운반 수단' },
  { resource_type:'camel', name:'Mongolian Steppe', name_ko:'몽골 스텝', region:'몽골', lat:47.0, lng:101.0, major:true, annual_count:250000, desc:'몽골 제국 원정 보급 낙타. 원나라 역참망 유지 핵심 동물' },
  { resource_type:'camel', name:'Dunhuang Oasis', name_ko:'둔황 오아시스', region:'중국 감숙', lat:40.1, lng:94.7, major:true, annual_count:80000, desc:'실크로드 동서 분기점. 낙타 대상 집결·출발지. 막고굴 벽화에 다수 묘사' },
];

async function main() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db  = client.db(DB_NAME);
  const col = db.collection('resources');

  for (const type of ['buffalo','monkey','camel']) {
    const del = await col.deleteMany({ resource_type: type });
    console.log(`기존 ${type} 삭제: ${del.deletedCount}건`);
  }

  const docs = ANIMAL_DATA.map(d => ({
    resource_type: d.resource_type,
    name:          d.name,
    name_ko:       d.name_ko,
    region:        d.region,
    lat:           d.lat,
    lng:           d.lng,
    location:      { type: 'Point', coordinates: [d.lng, d.lat] },
    major:         d.major,
    annual_count:  d.annual_count,
    description:   d.desc,
  }));

  const res = await col.insertMany(docs);
  console.log(`✅ 동물 서식지 ${res.insertedCount}개 삽입 완료`);
  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
