/**
 * add_animals2.js — 동물 서식지 보강
 * - 원숭이: 중국 동남부 산악지대 (황산, 무이산, 절강, 복건, 대만 등)
 * - 물소: 장강 중하류 추가
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function main() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db  = client.db('realhistory');
  const col = db.collection('resources');

  const newData = [
    // ─────────── 원숭이 ───────────
    {
      resource_type: 'monkey',
      name: 'Huangshan-Tianmu',
      name_ko: '황산·천목산 (安徽·浙江)',
      region: '중국 안휘·절강',
      lat: 29.7, lng: 118.3,
      location: { type: 'Point', coordinates: [118.3, 29.7] },
      major: true, annual_count: 0,
      description: '황산(黃山) 마카크 원숭이 명산. 당·송·명 시인들이 원숭이 울음 묘사. 현재도 황산마카크 대규모 서식'
    },
    {
      resource_type: 'monkey',
      name: 'Wuyi Mountains',
      name_ko: '무이산 (福建·江西)',
      region: '중국 복건·강서',
      lat: 27.8, lng: 117.7,
      location: { type: 'Point', coordinates: [117.7, 27.8] },
      major: true, annual_count: 0,
      description: '무이산(武夷山) — 세계자연유산. 붉은얼굴마카크 밀집 서식. 복건성 역대 지방지에 원숭이 기록'
    },
    {
      resource_type: 'monkey',
      name: 'Nanling Mountains',
      name_ko: '남령산맥 (廣東·廣西 경계)',
      region: '중국 광동·광서',
      lat: 24.9, lng: 112.0,
      location: { type: 'Point', coordinates: [112.0, 24.9] },
      major: true, annual_count: 0,
      description: '남령(南嶺) 산맥 — 화남 원숭이 최대 분포지. 마카크·긴팔원숭이 공존. 광동 고대 문헌에 원숭이 가죽 교역 기록'
    },
    {
      resource_type: 'monkey',
      name: 'Taiwan Mountains',
      name_ko: '대만 중앙산맥',
      region: '대만',
      lat: 23.5, lng: 121.0,
      location: { type: 'Point', coordinates: [121.0, 23.5] },
      major: true, annual_count: 0,
      description: '대만마카크(臺灣獼猴, Macaca cyclopis) — 대만 고유종. 중앙산맥 전역 서식. 원주민 문화에서 중요한 동물'
    },
    {
      resource_type: 'monkey',
      name: 'Zhejiang Coast Hills',
      name_ko: '절강 연안 구릉 (天台·雁蕩)',
      region: '중국 절강',
      lat: 28.9, lng: 121.0,
      location: { type: 'Point', coordinates: [121.0, 28.9] },
      major: false, annual_count: 0,
      description: '천태산(天台山)·안탕산(雁蕩山) 마카크 서식. 불교 사찰과 원숭이 공생 기록 다수'
    },
    {
      resource_type: 'monkey',
      name: 'Guangdong Coast',
      name_ko: '광동 해안 산지',
      region: '중국 광동',
      lat: 23.1, lng: 114.5,
      location: { type: 'Point', coordinates: [114.5, 23.1] },
      major: false, annual_count: 0,
      description: '광동 해안 산지 및 해남도 북부. 붉은얼굴마카크·돼지꼬리마카크. 당대 남방 물산지에 원숭이 기록'
    },

    // ─────────── 물소 ───────────
    {
      resource_type: 'buffalo',
      name: 'Middle Yangtze — Hubei Plain',
      name_ko: '장강 중류 호북 평원',
      region: '중국 호북',
      lat: 30.5, lng: 113.0,
      location: { type: 'Point', coordinates: [113.0, 30.5] },
      major: true, annual_count: 0,
      description: '동정호(洞庭湖) 주변 습지 — 수전(水田) 농경의 중심. 물소 경작·운반 핵심지. 초(楚) 이래 강남 농업의 상징'
    },
    {
      resource_type: 'buffalo',
      name: 'Poyang Lake Basin',
      name_ko: '파양호 유역 (江西)',
      region: '중국 강서',
      lat: 29.1, lng: 116.2,
      location: { type: 'Point', coordinates: [116.2, 29.1] },
      major: true, annual_count: 0,
      description: '파양호(鄱陽湖) — 중국 최대 담수호. 호수 주변 논농사에 물소 필수. 당~명 강서 물소 교역 기록'
    },
    {
      resource_type: 'buffalo',
      name: 'Hunan Lake District',
      name_ko: '동정호 호남 습지',
      region: '중국 호남',
      lat: 29.0, lng: 112.5,
      location: { type: 'Point', coordinates: [112.5, 29.0] },
      major: true, annual_count: 0,
      description: '동정호(洞庭湖) 호남 측 — 광대한 습지·수전 지대. 물소가 주요 농경 노동력. 송·원 농서에 다수 기록'
    },
    {
      resource_type: 'buffalo',
      name: 'Anhui-Jiangsu Lowlands',
      name_ko: '안휘·강소 저지대',
      region: '중국 안휘·강소',
      lat: 31.5, lng: 117.5,
      location: { type: 'Point', coordinates: [117.5, 31.5] },
      major: false, annual_count: 0,
      description: '소주·항주 수전 지대. 강남(江南) 농경 물소 대량 사육. 명·청 대 강남 물소가 북방으로 수출'
    },
  ];

  const res = await col.insertMany(newData);
  console.log('추가 완료:', res.insertedCount, '개');

  const counts = await col.aggregate([
    { $match: { resource_type: { $in: ['buffalo','monkey'] } } },
    { $group: { _id: '$resource_type', count: { $sum: 1 } } }
  ]).toArray();
  counts.forEach(c => console.log(c._id, ':', c.count, '개'));

  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
