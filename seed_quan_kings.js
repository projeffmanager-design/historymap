/** 견국(畎國, 견융) 역대 통치자 입력/갱신 — 실행: node seed_quan_kings.js */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const COUNTRY_ID = new ObjectId('699c80e4a7d3b7a1cb02de1d');
const COUNTRY_NAME = '견국(畎國)';
const COUNTRY_COLOR = '#6f2f2f';

const rulers = [
  { name: '무을 (巫乙)', start: -1120, end: -1090, title: '왕', description: '상(商)나라 말기, 서백 창(훗날의 주 문왕)의 팽창에 맞서 주나라의 서방 영토를 대대적으로 압박하며 지리적 연맹을 주도한 초기 왕.' },
  { name: '백달 (伯達)', start: -1090, end: -1050, title: '수장', description: '주 문왕과 무왕 세력의 동진을 견제하기 위해 상나라와 연대하였으나, 주나라의 서진 공격으로 거점을 일시적으로 북방으로 이동시킨 가한 격의 수장.' },
  { name: '황지 (荒炙)', start: -1020, end: -990, title: '왕', description: '주 성왕·강왕 시기, 서주의 안정기에 맞서 국경 분쟁을 지속하며 견국 고유의 기마 전술을 정비하고 세력을 다시 키운 명왕.' },
  { name: '독로 (獨虜)', start: -990, end: -960, title: '왕', description: '주 소왕 시기, 주나라가 남방 초나라 원정에 집중하는 틈을 타 서쪽 국경지대의 방어벽을 무력화하고 영토를 크게 확장한 군주.' },
  { name: '비가 (卑駕)', start: -960, end: -930, title: '왕', description: '주 목왕(穆王)의 대대적인 서정(서방 원정)을 맞아 격렬히 저항한 왕. 목왕의 서역 교역로 확보 공세에 맞서 견국의 독자적인 서역 세력권을 수호하려 애쓴 지도자.' },
  { name: '적리 (赤利)', start: -930, end: -890, title: '왕', description: '주 목왕의 거듭된 압박 이후 세력을 수습하여 주 공왕·의왕 시기 서주의 서부 요충지들을 끊임없이 역습하며 주나라의 쇠퇴를 유도한 강인한 군주.' },
  { name: '질부 (質父)', start: -840, end: -810, title: '왕', description: '주 여왕의 폭정과 국인 폭동으로 주나라가 대내외적으로 혼란해진 틈을 타, 주나라 서쪽 국경의 요새들을 파하고 대대적인 영토 점령을 감행한 왕.' },
  { name: '백화 (伯和)', start: -810, end: -780, title: '왕', description: '주 선왕(宣王)의 견융 태원 원정에 맞서 지리적 이점을 이용해 주나라 군대를 대패시키고, 서주 왕조의 군사적 몰락을 결정짓게 만든 군주.' },
  { name: '구견 (駒犬)', start: -780, end: -750, title: '왕', description: '견국 제국의 정점. 기원전 771년, 주 유왕(幽王)의 실정을 틈타 신후(申侯) 세력과 연대하여 서주의 수도 호경(鎬京)을 완벽히 함락시키고 유왕을 살해하여 서주를 멸망시키고 동주(낙읍) 시대를 강제한 천하의 명왕.' },
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
    if (!country || country.name !== COUNTRY_NAME) throw new Error('견국(畎國)을 확인할 수 없습니다.');

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
    console.log(`견국 통치자 입력 완료: 추가 ${added}명, 갱신 ${updated}명, 검증 ${saved.length}명`);
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
