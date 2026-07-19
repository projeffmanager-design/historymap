/** 위·촉·오 황제와 주요 인물 입력/갱신 — 실행: node seed_three_kingdoms_figures.js */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const realms = [
  {
    countryId: new ObjectId('68dc7f9ade5169a850293fc5'), countryName: '위(魏)', color: '#ff7575', figures: [
      { name: '위 무제 조조 (曹操)', aliases: ['무제 (武帝) / 조조 (실질적 창건자)'], start: 196, end: 220, type: 'emperor', title: '위 무제·실질적 창건자', description: '둔전제(屯田制)로 제국의 경제 기반을 다지고, 북방의 오환족을 정벌하며 중원의 거대한 지리적 판도를 완성한 정점의 정략가.' },
      { name: '위 문제 조비 (曹丕)', aliases: ['문제 (文帝) / 조비 (초대 황제)'], start: 220, end: 226, type: 'emperor', title: '위 문제·초대 황제', description: '한나라의 헌제로부터 선양을 받아 위 왕조를 공식 개창하고, 구품관인법을 시행하여 체제를 정비한 초대 황제.' },
      { name: '위 명제 조예 (曹叡)', aliases: ['명제 (明帝) / 조예'], start: 226, end: 239, type: 'emperor', title: '위 명제', description: '사마의를 기용해 제국의 서방 방어선을 수호하고, 대월지(쿠샨) 및 왜국과 통교하며 대외 정통성을 과시한 군주.' },
      { name: '하후돈 (夏侯惇)', start: 190, end: 220, type: 'general', title: '대장군', description: '조조가 거병할 때부터 종군하여 후방의 군수·농경(치수 공사)을 책임진 조위 왕실의 가장 굳건한 중추.' },
      { name: '조인 (曹仁)', start: 190, end: 223, type: 'general', title: '대장군', description: '형주 번성 전투에서 관우의 대공세를 옥쇄로 막아내며 제국의 남방 요충지 레이어를 수호해 낸 위나라 최고의 방어 명장.' },
      { name: '장료 (張遼)', start: 200, end: 222, type: 'general', title: '장군', description: '합비 전투(215년)에서 단 800명의 정예 기마병으로 손권의 10만 대군을 격파하여 오나라의 북진을 영구히 좌절시킨 명장.' },
      { name: '순욱 (荀彧)', start: 191, end: 212, type: 'civilian', title: '문관·정략가', description: '협천자(挾天子)의 지리적 대전략을 기획하고 중원의 인재들을 대거 천거하여 조조 정권의 조정을 구축한 최고의 기획자.' },
      { name: '곽가 (郭嘉)', start: 196, end: 207, type: 'civilian', title: '참모', description: '여포 토벌 및 원소 사후 북방 정벌 과정에서 천문·지리적 과단성을 발휘해 기습 전략을 성공시킨 천재 참모.' },
      { name: '가후 (賈詡)', start: 199, end: 223, type: 'civilian', title: '참모', description: '장수, 조조, 조비에 이르기까지 철저한 정세 판단과 탁월한 생존 역량으로 황제 계승 구도까지 결정지은 냉혹한 지략가.' },
      { name: '사마의 (司馬懿)', start: 220, end: 251, type: 'civilian', title: '대도독·집권자', description: '고구려와 통교하던 요동의 공손연 정권을 전멸시키고(238년), 훗날 사마씨 서진(西晉) 제국의 실질적 토대를 닦은 인물.' },
    ]
  },
  {
    countryId: new ObjectId('68dc7f9ade5169a850293fc6'), countryName: '촉(蜀)', color: '#008000', figures: [
      { name: '촉 소열제 유비 (劉備)', aliases: ['소열제 (昭烈帝) / 유비'], start: 221, end: 223, type: 'emperor', title: '촉 소열제·창건자', description: '사서에서 돋보이는 결단력과 용인술로 서남방 익주(蜀)의 험준한 지형을 확보하여 정통성 있는 제국을 선포한 창건자.' },
      { name: '촉 후제 유선 (劉禪)', aliases: ['효회제 (孝懷帝) / 유선'], start: 223, end: 263, type: 'emperor', title: '촉 후제·최후의 황제', description: '제갈량 사후에도 30년간 왕위를 유지했으나, 국력의 한계를 극복하지 못하고 조위 제국에 투항한 촉한의 최후의 황제.' },
      { name: '제갈량 (諸葛亮)', start: 221, end: 234, type: 'civilian', title: '승상·집권자', description: '천하삼분지계를 완성하고, 진릉(성도) 평야의 치수와 비단 무역을 정비했으며, 북벌을 통해 천하의 세력 균형을 주도한 최고의 승상.' },
      { name: '관우 (關羽)', start: 184, end: 219, type: 'general', title: '장군', description: '화북과 강남을 잇는 지리적 중심축인 형주(荊州)를 진수하며, 219년 한수를 범람시켜 조위의 번성을 수몰 직전까지 몰고 간 당대 최고의 용장.' },
      { name: '장비 (張飛)', start: 184, end: 221, type: 'general', title: '장군', description: '유비의 거병 동반자이자 파서(巴西) 전투에서 조위의 명장 장합을 격파하고 익주 북부 방어선을 확고히 수호한 맹장.' },
      { name: '조운 (趙雲)', start: 200, end: 229, type: 'general', title: '장군', description: '당양 장판 전투에서 유비의 후계를 구출하고, 익주 평정 및 1차 북벌 시 후방 방어선을 안정적으로 철수시킨 우직한 명장.' },
      { name: '황충 (黃忠)', start: 209, end: 220, type: 'general', title: '장군', description: '한중 쟁탈전(219년)의 정점인 정군산 전투에서 조위의 서방 총사령관 하후연을 직접 전사시켜 촉한의 한중 지배권을 확정 지은 장수.' },
      { name: '마초 (馬超)', start: 215, end: 222, type: 'general', title: '장군', description: '서북방 량주(涼州)의 이민족(강족·저족) 세력에게 절대적인 군사적 위망을 가져, 촉한의 서북방 방어 레이어를 공고히 한 거물급 장수.' },
      { name: '위연 (魏延)', start: 211, end: 234, type: 'general', title: '야전 사령관', description: "한중(漢中)의 철벽 방어 시스템인 '중문(重門) 전략'을 창안하여 수십 년간 북방의 침공을 완벽히 방어해 낸 야전 사령관." },
      { name: '강유 (姜維)', start: 228, end: 264, type: 'general', title: '대장군', description: '제갈량의 유지인 북벌을 이어받아 서북방 경계에서 조위 제국과 총 11차례 격돌하며 촉한의 마지막 불꽃을 태운 장수.' },
    ]
  },
  {
    countryId: new ObjectId('68dc7f9ade5169a850293fc7'), countryName: '오(吳)', color: '#277c57', figures: [
      { name: '오 대제 손권 (孫權)', aliases: ['태조대제 (太祖大帝) / 손권'], start: 229, end: 252, type: 'emperor', title: '오 대제', description: '양쯔강(장강)의 천혜의 수로 지형과 강력한 수군을 바탕으로 강남을 본격 개척하고, 독자적인 제국을 선포한 동남방의 주권자.' },
      { name: '손견 (孫堅)', start: 184, end: 191, type: 'general', title: '무열황제·시조', description: '반동탁 연합군의 실질적인 최전방 격퇴 영웅으로, 낙양을 점령하고 한나라 왕실의 종묘를 재정비했던 오나라의 시조(무열황제).' },
      { name: '손책 (孫策)', start: 194, end: 200, type: 'general', title: '장군·패왕', description: '단 수천의 병력으로 양쯔강 이남의 6개 군(강동육군)을 순식간에 평정하여 손오 제국의 지리적 영토 기반을 완벽히 구축한 패왕.' },
      { name: '주유 (周瑜)', start: 198, end: 210, type: 'general', title: '대도독', description: '적벽 대전(208년)의 실질적 총사령관; 조조의 대군을 화공으로 격파하여 천하삼분의 지리적 구도를 현실로 만든 제국 최고의 공신.' },
      { name: '노숙 (魯肅)', start: 210, end: 217, type: 'civilian', title: '정치가·도독', description: '손권에게 천하이분지계를 건의하고, 촉한의 제갈량과 연대하여 [오 ── 촉] 동맹 링크를 유지시킨 정략적 혜안의 정치가.' },
      { name: '여몽 (呂蒙)', start: 200, end: 219, type: 'general', title: '대도독', description: '철저한 첩보망과 위장 전술로 관우의 형주를 기습 점령(백의도강)하여, 오나라 역사상 최대의 영토 확장을 이뤄낸 지장.' },
      { name: '육손 (陸遜)', start: 219, end: 245, type: 'general', title: '대도독·승상', description: '이릉 대전(222년)에서 유비의 촉한 대군을 화공으로 전멸시키고, 석정 전투에서 위나라를 격파하여 오나라의 군사적 독립성을 확정 지은 명승상.' },
      { name: '태사자 (太史慈)', start: 198, end: 206, type: 'general', title: '장군', description: '청주 유역에서 손책과 겨룬 후 귀순하여, 오나라의 북동부 국경지대에서 유요 잔당 및 이민족의 침공을 억제한 무장.' },
      { name: '감녕 (甘寧)', start: 208, end: 215, type: 'general', title: '장군', description: '강적 출신의 야전 장수로, 조조의 유수구 본진을 단 100명의 결사대로 기습하여 적진을 뒤흔든 오나라 최고의 돌격 대장.' },
      { name: '육항 (陸抗)', start: 245, end: 274, type: 'general', title: '대도독', description: '서진(西晉)의 명장 양호와 대치하며 국경지대인 서릉을 사수, 삼국지 정사 최후반부 오나라의 몰락을 온몸으로 막아낸 마지막 대들보.' },
    ]
  }
];

function makeRecord(realm, figure, existing = {}) {
  return {
    ...existing,
    _id: existing._id || new ObjectId(), name: figure.name, name_ko: figure.name, name_zh: '',
    title: figure.title, start: figure.start, start_month: 1, end: figure.end, end_month: 12,
    hero_type: figure.type, type: figure.type, summary: figure.description, description: figure.description,
    faction: realm.countryName, faction_color: realm.color,
    avatar_url: existing.avatar_url || '', illustration_url: existing.illustration_url || '',
    vote_count: existing.vote_count || 0, updatedAt: new Date(),
  };
}

async function upsertRealm(db, realm) {
  const country = await db.collection('countries').findOne({ _id: realm.countryId });
  if (!country || country.name !== realm.countryName) throw new Error(`${realm.countryName} 국가를 확인할 수 없습니다.`);
  const kings = db.collection('kings');
  const doc = await kings.findOne({ country_id: realm.countryId });
  const records = Array.isArray(doc?.kings) ? [...doc.kings] : [];
  let added = 0, updated = 0;
  for (const figure of realm.figures) {
    const names = new Set([figure.name, ...(figure.aliases || [])]);
    const index = records.findIndex(item => names.has(item.name) || names.has(item.name_ko));
    if (index >= 0) { records[index] = makeRecord(realm, figure, records[index]); updated += 1; }
    else { records.push(makeRecord(realm, figure)); added += 1; }
  }
  records.sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
  await kings.updateOne({ country_id: realm.countryId }, { $set: { kings: records, updatedAt: new Date() } }, { upsert: true });
  const verified = await kings.findOne({ country_id: realm.countryId });
  const names = new Set(realm.figures.map(figure => figure.name));
  const saved = (verified?.kings || []).filter(figure => names.has(figure.name));
  if (saved.length !== realm.figures.length) throw new Error(`${realm.countryName} 검증 실패: ${saved.length}/${realm.figures.length}명`);
  return { name: realm.countryName, added, updated, verified: saved.length };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI가 없습니다.');
  const client = new MongoClient(process.env.MONGO_URI); await client.connect();
  try {
    const db = client.db('realhistory');
    for (const realm of realms) {
      const result = await upsertRealm(db, realm);
      console.log(`${result.name}: 추가 ${result.added}명, 갱신 ${result.updated}명, 검증 ${result.verified}명`);
    }
  } finally { await client.close(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
