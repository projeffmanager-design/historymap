/** 월지와 쿠샨 제국 역대 군주 입력/갱신 — 실행: node seed_yuezhi_kushan_kings.js */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const realms = [
  {
    countryId: new ObjectId('6957bcc182ae96ab7a2d6792'),
    countryName: '월지(月氏)',
    color: '#00b31e',
    rulers: [
      { name: '월지씨 가한 (Name Unknown)', start: -210, end: -174, title: '가한', description: '흉노가 발흥하기 전 몽골 서부와 가속(간쑤) 주랑 일대의 패권을 쥐고 흉노(두만 가한 시절)를 인질로 부렸던 전성기 가한.' },
      { name: '사왕 (舍王 / 대월지 여왕)', start: -174, end: -160, title: '여왕', description: '흉노 노상 가한에게 가한이 전사하여 두개골로 술잔(두주잔)을 만들어지는 비극을 겪은 후, 부족을 이끌고 서쪽으로의 대이동(서천)을 완수한 여걸.' },
      { name: '남왕 (藍王 / 가한의 아들)', start: -160, end: -130, title: '왕', description: '일리강 유역에서 오손(烏孫)의 공격을 받아 다시 남하, 아무다리야강 북안에 정착하여 박트리아를 복속시키고 대월지국의 기반을 재구축한 왕. 한나라 장건이 기원전 129년경 만난 군주가 바로 이 대월지 왕실입니다.' },
    ]
  },
  {
    countryId: new ObjectId('6957ff1794659cc7801b4e6a'),
    countryName: '쿠샨 제국 (貴霜)',
    color: '#02b31d',
    rulers: [
      { name: '헤라오스 (Heraos)', start: -1, end: 30, title: '왕', description: '파르티아의 압박 속에서 쿠샨 부족의 독자적인 군사력을 키우고 최초로 자신의 명문이 새겨진 그리스식 화폐를 발행한 거점 군주.' },
      { name: '쿠줄라 카드피세스 (구취각, 丘就卻)', start: 30, end: 80, title: '왕', description: '쿠샨 제국의 실질적 창건자. 대월지 5흡후를 완전히 통일하고 안식(파르티아)과 계빈(카불), 고부(가즈니)를 차례로 정복하여 제국의 기틀을 세운 군주.' },
      { name: '비마 타크토 (염고, 閻膏珍 / 소테르 메가스)', start: 80, end: 95, title: '왕', description: '천축(북인도)을 대대적으로 정복하여 총독을 두고 통치했으며, 동서 교역로의 중심인 펀자브 일대를 제국의 핵심 지리적 레이어로 편입시킨 군주.' },
      { name: '비마 카드피세스 (Vima Kadphises)', start: 95, end: 127, title: '왕', description: '대륙의 후한(한나라) 서역도호 반초와 파미르고원 통제권을 두고 충돌(기원후 90년경, 7만 대군 파견)하기도 했던 인물로, 로마 제국과의 교역을 위해 대규모 금화를 주조한 명왕.' },
      { name: '카니시카 1세 (迦膩色伽)', start: 127, end: 150, title: '왕', description: '쿠샨-대월지 제국의 최고 전성기 성군. 수도를 푸루샤푸라(페샤와르)로 천도하고 중앙아시아에서 북인도 전체를 아우르는 대제국을 완성했으며, 제4차 불전 결집을 주도하여 대승불교의 파급을 이끈 인물.' },
      { name: '후비시카 (Huvishka)', start: 150, end: 180, title: '왕', description: '마투라를 제2의 수도로 삼아 인도 내 지배력을 공고히 하고, 다양한 문명의 신(그리스, 이란, 인도)들을 화폐에 도안하여 다민족 융합 정책을 편 군주.' },
      { name: '바수데바 1세 (파조, 波調)', start: 180, end: 232, title: '왕', description: "기원후 229년 위나라 조예(명제)에게 사신을 보내 '친위대월지왕'의 책봉을 받았으나, 사산조 페르시아의 부흥과 동방 팽창으로 인해 제국의 서방 영토(박트리아)를 상실하기 시작한 쇠퇴기 군주." },
    ]
  }
];

function makeRecord(realm, ruler, existing = {}) {
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
    hero_type: ruler.title === '가한' ? 'khan' : 'king',
    type: ruler.title === '가한' ? 'khan' : 'king',
    summary: ruler.description,
    description: ruler.description,
    faction: realm.countryName,
    faction_color: realm.color,
    avatar_url: existing.avatar_url || '',
    illustration_url: existing.illustration_url || '',
    vote_count: existing.vote_count || 0,
    updatedAt: new Date(),
  };
}

async function upsertRealm(db, realm) {
  const country = await db.collection('countries').findOne({ _id: realm.countryId });
  if (!country || country.name !== realm.countryName) throw new Error(`${realm.countryName} 국가를 확인할 수 없습니다.`);
  const kings = db.collection('kings');
  const doc = await kings.findOne({ country_id: realm.countryId });
  const records = Array.isArray(doc?.kings) ? [...doc.kings] : [];
  let added = 0;
  let updated = 0;
  for (const ruler of realm.rulers) {
    const index = records.findIndex(item => item.name === ruler.name || item.name_ko === ruler.name);
    if (index >= 0) {
      records[index] = makeRecord(realm, ruler, records[index]);
      updated += 1;
    } else {
      records.push(makeRecord(realm, ruler));
      added += 1;
    }
  }
  records.sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
  await kings.updateOne(
    { country_id: realm.countryId },
    { $set: { kings: records, updatedAt: new Date() } },
    { upsert: true },
  );
  const verified = await kings.findOne({ country_id: realm.countryId });
  const names = new Set(realm.rulers.map(ruler => ruler.name));
  const saved = (verified?.kings || []).filter(king => names.has(king.name));
  if (saved.length !== realm.rulers.length) throw new Error(`${realm.countryName} 검증 실패: ${saved.length}/${realm.rulers.length}명`);
  return { name: realm.countryName, added, updated, verified: saved.length };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI가 없습니다.');
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  try {
    const db = client.db('realhistory');
    for (const realm of realms) {
      const result = await upsertRealm(db, realm);
      console.log(`${result.name}: 추가 ${result.added}명, 갱신 ${result.updated}명, 검증 ${result.verified}명`);
    }
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
