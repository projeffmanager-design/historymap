/** 유연(柔然) 역대 군주 입력/갱신 — 실행: node seed_rouran_kings.js */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const COUNTRY_ID = new ObjectId('6959ff141777bbfe03bd0f0e');
const COUNTRY_NAME = '유연(柔然)';
const COUNTRY_COLOR = '#ea76e0';

const rulers = [
  { name: '욱구려 목골려', start: 305, end: 330, title: '부족장', description: '선비족 탁발부에서 탈출하여 유연 부족의 씨앗을 뿌린 시조.' },
  { name: '욱구려 거록회', start: 330, end: 370, title: '부족장', description: "부족을 규합하고 최초로 '유연'이라는 부족 명칭을 대내외에 천명한 수장." },
  { name: '욱구려 벽해승', start: 370, end: 385, title: '부족장', description: '주변 강대국인 대국(代國) 등에 조공을 바치며 세력을 보존한 과도기 지도자.' },
  { name: '욱구려 온흘제', start: 385, end: 391, title: '부족장', description: '북위 탁발귀의 대공세를 맞아 격렬히 저항하다 패배하여 일시 멸망을 겪은 군주.' },
  { name: '욱구려 사륜', start: 394, end: 410, title: '가한', description: "유연 제국의 창건자; 몽골 고원을 통일하고 최초로 '가한(可汗)' 체제를 확립한 명군." },
  { name: '욱구려 곡률', start: 410, end: 414, title: '가한', description: '북연(北燕)과의 동맹 등 외교 다변화를 꾀했으나 친위 정변으로 축출된 가한.' },
  { name: '욱구려 보록진', start: 414, end: 414, title: '가한', description: '정변을 통해 왕위를 찬탈했으나 귀족들의 반발로 단 몇 달 만에 살해당한 군주.' },
  { name: '욱구려 대단', start: 414, end: 429, title: '가한', description: '북위의 파상 공세에 정면으로 맞서며 유연의 군사적 전성기를 수호한 강인한 군주.' },
  { name: '욱구려 오디', start: 429, end: 444, title: '가한', description: '남조(송나라) 및 북연과 지리적 연대를 형성해 북위의 서진을 견제한 정략가.' },
  { name: '욱구려 토하진', start: 444, end: 464, title: '가한', description: '실크로드 서역 무역로의 주도권을 장악하기 위해 북위와 치열한 영토전을 벌인 가한.' },
  { name: '욱구려 여체', start: 464, end: 485, title: '가한', description: '독자 연호(영강)를 반포하고 서역 전역을 포섭하며 내치와 외교의 균형을 이룬 군주.' },
  { name: '욱구려 두론', start: 485, end: 492, title: '가한', description: '가혹한 세금과 통치로 핵심 속민이던 고거 부족의 대규모 이탈과 독립을 초래한 실책의 군주.' },
  { name: '욱구려 나개', start: 492, end: 506, title: '가한', description: '고거 부족과의 전쟁을 승리로 이끌며 흔들리던 제국의 통치력을 재확립한 군주.' },
  { name: '욱구려 복도', start: 506, end: 508, title: '가한', description: '고거 세력을 완전히 병합하기 위해 친정에 나섰다가 전사한 비운의 가한.' },
  { name: '욱구려 추누', start: 508, end: 520, title: '가한', description: '중앙아시아 서역을 재장악하고 고구려와 통교했으나 모후의 정치 간섭으로 살해당한 왕.' },
  { name: '욱구려 아나괴', start: 520, end: 552, title: '가한', description: '북위의 군사 지원을 받아 제국을 재건했으나, 신흥 세력인 돌궐의 부민 가한에게 패해 자살한 군주.' },
  { name: '욱구려 파라', start: 520, end: 521, title: '가한', description: '아나괴를 축출하고 일시적으로 정권을 잡았으나 정통성 부재로 순식간에 몰락한 가한.' },
  { name: '욱구려 등숙자', start: 552, end: 555, title: '가한', description: '돌궐의 압박 속에 서위(西魏)로 망명했으나 돌궐의 강요로 결국 포로가 되어 처형당한 유연 제국의 최후의 가한.' },
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
    hero_type: 'khan',
    type: 'khan',
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
    if (!country || country.name !== COUNTRY_NAME) throw new Error('유연(柔然) 국가를 확인할 수 없습니다.');

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
    console.log(`유연 군주 입력 완료: 추가 ${added}명, 갱신 ${updated}명, 검증 ${saved.length}명`);
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
