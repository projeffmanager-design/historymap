/**
 * 아바르 칸국 역대 군주 입력/갱신
 * 실행: node seed_avar_khaganate_kings.js
 */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const COUNTRY_ID = new ObjectId('694e110ce5945be288123db8');
const COUNTRY_NAME = '아바르 칸국 (Avar Khaganate) - 유연(柔然)';
const COUNTRY_COLOR = '#56c8b1';

const rulers = [
  { name: '칸다이크 (Kandik)', start: 552, end: 562, description: '사산조 페르시아 및 비잔티움 제국과 첫 외교 관계를 맺으며 아바르족을 유럽 무대로 이끈 초기 지도자.' },
  { name: '바얀 1세 (Bayan I)', start: 562, end: 602, description: '아바르 칸국의 위대한 창건자이자 최전성기 군주; 게피다이족을 멸망시키고 판노니아 분지에 제국의 영구적 거점을 확보한 정복자.' },
  { name: '바얀 2세 (Bayan II)', start: 602, end: 617, description: '아버지를 이어 비잔티움 제국의 발칸반도 영토를 전방위로 압박하며 유목 제국의 위세를 유지한 군주.' },
  { name: '오르가나 (Organa)', start: 617, end: 630, description: '슬라브족의 대규모 반란과 626년 콘스탄티노폴리스 공성전 패배로 인한 제국의 세력 약화를 방어하려 고군분투한 군주.' },
  { name: '쿠브라트 (Kubrat)', start: 630, end: 635, description: "아바르의 지배에서 벗어나 '대불가리아'를 건국하기 직전까지 내부 권력 투쟁과 분열을 겪었던 침체기 군주." },
  { name: '카잔 (Kazan)', start: 635, end: 670, description: '서부 슬라브족과 불가르족의 독립으로 축소된 판노니아 내 영토를 재편하고 내부 결속에 집중한 군주.' },
  { name: '보쿠트 (Bokut)', start: 670, end: 710, description: "이른바 '제2아바르 시대'의 고고학적 유물 격변기를 이끌며 그리핀 문양 등 고유의 유목 문화를 안착시킨 통치자." },
  { name: '체간 (Chegan)', start: 710, end: 740, description: '서방 카롤링거 왕조 및 슬라브 부족들과 서부 국경선을 두고 소규모 국지전을 벌이며 대치했던 군주.' },
  { name: '카우칸 (Kaukhan)', start: 740, end: 770, description: '프랑크 왕국의 세력 팽창에 맞서 외교적 방어선을 구축하려 애쓴 과도기적 군주.' },
  { name: '유구루스 (Yugurus)', start: 770, end: 795, description: '프랑크 왕국 샤를마뉴의 대공세 직전, 항복을 주장하는 파와 항전을 주장하는 파 사이의 내분으로 살해당한 비운의 군주.' },
  { name: '투둔 (Tudun)', start: 795, end: 803, description: '샤를마뉴에게 항복하고 기독교로 개종하여 자치권을 얻었으나, 이후 프랑크 왕국에 반란을 일으켰다 진압당한 통치자.' },
  { name: '조단 (Zodan)', start: 803, end: 805, description: '프랑크 왕국의 분봉 영주로 전락한 상태에서 불가르족 크룸 칸의 대대적인 동방 침공을 막지 못한 패망기의 칸.' },
  { name: '테오도루스 (Theodorus)', start: 805, end: 811, description: '프랑크 왕국 측에 자비란(Savaria) 인근의 정착지를 구걸하며 연명했던, 사실상 제국의 경계가 지워진 마지막 칸.' },
  { name: '아브라함 (Abraham)', start: 811, end: 825, description: '세례를 받고 프랑크 왕국의 철저한 봉신으로 임명되어 아바르라는 정체의 마지막 명맥만 유지했던 종말기 군주.' },
  { name: '이삭 (Isaac)', start: 825, end: 835, description: '불가르족과 프랑크 왕국에 의해 영토와 민족이 완전히 흡수·해체되기 직전 기록에 등장하는 아바르족의 최후의 영주.' },
];

function makeRecord(ruler, existing = {}) {
  return {
    ...existing,
    _id: existing._id || new ObjectId(),
    name: ruler.name,
    name_ko: ruler.name,
    name_zh: '',
    title: '카간',
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
    if (!country || country.name !== COUNTRY_NAME) throw new Error('아바르 칸국을 확인할 수 없습니다.');

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
    console.log(`아바르 칸국 군주 입력 완료: 추가 ${added}명, 갱신 ${updated}명, 검증 ${saved.length}명`);
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
