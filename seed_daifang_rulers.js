/** 대방국(帶方國) 역대 최고 통치자 입력/갱신 — 실행: node seed_daifang_rulers.js */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const COUNTRY_ID = new ObjectId('696b6bc25e5d12a80245390b');
const COUNTRY_NAME = '대방국(帶方國)';
const COUNTRY_COLOR = '#ffffff';

const rulers = [
  { name: '공손모 (公孫模)', start: 204, end: 215, title: '초대 통치자', description: '요동의 태수 공손강의 명을 받아 낙랑 남부의 한(韓)·예(濊) 부족 접경 지대에 대방을 처음 개척하고 성곽을 쌓아 기초를 닦은 초대 통치자.' },
  { name: '장시 (張時)', start: 215, end: 225, title: '태수', description: '부족 간의 갈등을 조율하며 대방의 지리적 영토를 안정시키려 했으나, 한인(韓人) 부족들의 기습 공격을 받아 전사한 비운의 태수.' },
  { name: '유흔 (劉昕)', start: 238, end: 244, title: '태수', description: '조위(魏)나라 사마의의 요동 정벌에 발맞추어 대방에 파견되어, 공손씨 계열의 잔당을 숙청하고 위나라 직할령으로서의 대방을 재편한 인물.' },
  { name: '궁준 (弓遵)', start: 244, end: 246, title: '태수', description: '조위(魏)의 태수로 백제 고이왕 계열의 대대적인 공세를 막아내다 기리영 전투에서 전사한 인물.' },
  { name: '서치 (西稺)', start: 280, end: 298, title: '대방왕', description: '사서에 명시된 독자적인 대방왕(帶方王). 딸 보과(寶菓)를 백제 책계왕에게 시집보내 혼인 동맹을 맺었으며, 고구려의 남하 공격에 맞서 백제군의 구원을 받아 영토를 수호한 명왕.' },
  { name: '장통 (張統)', start: 298, end: 314, title: '최고 통치자', description: '고구려 미천왕의 대공세로 대방국의 지리적 기반이 와해되자, 남은 주민들을 이끌고 모용선비 세력(요동)으로 망명하며 대방 정체의 종말을 고한 최후의 군주.' },
];

function makeRecord(ruler, existing = {}) {
  return {
    ...existing,
    _id: existing._id || new ObjectId(),
    name: ruler.name,
    name_ko: ruler.name,
    name_zh: '',
    title: ruler.title,
    start: ruler.start,
    start_month: 1,
    end: ruler.end,
    end_month: 12,
    hero_type: 'king',
    type: 'king',
    summary: ruler.description,
    description: ruler.description,
    faction: COUNTRY_NAME,
    faction_color: COUNTRY_COLOR,
    avatar_url: existing.avatar_url || '',
    illustration_url: existing.illustration_url || '',
    vote_count: existing.vote_count || 0,
    updatedAt: new Date(),
  };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI가 없습니다.');
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  try {
    const db = client.db('realhistory');
    const country = await db.collection('countries').findOne({ _id: COUNTRY_ID });
    if (!country || country.name !== COUNTRY_NAME) throw new Error('대방국(帶方國)을 확인할 수 없습니다.');

    const kings = db.collection('kings');
    const doc = await kings.findOne({ country_id: COUNTRY_ID });
    const records = Array.isArray(doc?.kings) ? [...doc.kings] : [];
    let added = 0;
    let updated = 0;
    for (const ruler of rulers) {
      const index = records.findIndex(item => item.name === ruler.name || item.name_ko === ruler.name);
      if (index >= 0) {
        records[index] = makeRecord(ruler, records[index]);
        updated += 1;
      } else {
        records.push(makeRecord(ruler));
        added += 1;
      }
    }
    records.sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
    await kings.updateOne(
      { country_id: COUNTRY_ID },
      { $set: { kings: records, updatedAt: new Date() } },
      { upsert: true },
    );

    const verified = await kings.findOne({ country_id: COUNTRY_ID });
    const names = new Set(rulers.map(ruler => ruler.name));
    const saved = (verified?.kings || []).filter(king => names.has(king.name));
    if (saved.length !== rulers.length) throw new Error(`검증 실패: ${saved.length}/${rulers.length}명 저장됨`);
    console.log(`대방국 통치자 입력 완료: 추가 ${added}명, 갱신 ${updated}명, 검증 ${saved.length}명`);
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
