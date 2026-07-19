/** 파르티아(안식국) 역대 군주 입력/갱신 — 실행: node seed_parthian_kings.js */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const COUNTRY_ID = new ObjectId('694d3d9b07f1d71fd5845414');
const COUNTRY_NAME = '파르티아(Parthia, 안식국 (安息國))';
const COUNTRY_COLOR = '#ff0001';

const rulers = [
  { name: '아르사케스 1세', start: -247, end: -211, description: '파르티아의 창건자; 셀레우코스 왕조의 혼란을 틈타 파르티아 지방을 점령하고 제국의 씨앗을 뿌린 시조.' },
  { name: '아르사케스 2세', start: -211, end: -191, description: '셀레우코스 안티오코스 3세의 대공세에 맞서 격렬히 저항하며 세력을 보존한 과도기 군주.' },
  { name: '프리아파티우스', start: -191, end: -176, description: '내치를 다지고 인근 유목 부족들을 포섭하여 향후 영토 확장의 지리적 발판을 마련한 인물.' },
  { name: '프라아테스 1세', start: -176, end: -171, description: '엘부르즈산맥 일대의 부족들을 복속시키고 서방 진출의 교두보를 확보한 군주.' },
  { name: '미트리다테스 1세', start: -171, end: -132, description: '파르티아의 위대한 정복 군주; 미디아와 메소포타미아(바빌로니아)를 완벽히 병합하여 대제국으로 도약시킨 군주.' },
  { name: '프라아테스 2세', start: -132, end: -127, description: '동방에서 밀려오는 유목민(대월지·사카족)의 대이동 공세를 방어하다 전사한 비운의 왕.' },
  { name: '아르타바누스 1세', start: -127, end: -124, description: '동부 국경의 토화라(대월지) 세력을 견제하기 위해 친정에 나섰다가 전투 중 전사한 강인한 군주.' },
  { name: '미트리다테스 2세', start: -124, end: -91, title: '샤한샤', description: '파르티아의 정점(샤한샤, 왕중왕); 동방 유목민을 제압하고 한나라 장건의 사신을 접견(안식국 통교)하여 실크로드 교역망을 완성한 성군.' },
  { name: '고타르제스 1세', start: -91, end: -80, description: '미트리다테스 2세 사후 일어난 대규모 내분기(파르티아의 암흑기) 속에서 바빌로니아 일대를 장악했던 분령 군주.' },
  { name: '오로데스 1세', start: -80, end: -75, description: '내란의 소용돌이 속에서 화폐를 주조하며 정통성을 주장했으나 순식간에 축출된 군주.' },
  { name: '시나트루케스', start: -75, end: -70, description: '동방 사카족 유목민의 군사적 지원을 받아 입성하여 혼란했던 제국의 왕권을 다시 하나로 수습한 노왕.' },
  { name: '프라아테스 3세', start: -70, end: -57, description: '로마의 폼페이우스와 대치하며 아르메니아 영유권을 두고 치열한 외교·지리적 탐색전을 벌인 군주.' },
  { name: '미트리다테스 3세', start: -57, end: -54, description: '아버지를 살해하고 즉위했으나 형제간의 내전 끝에 오로데스 2세에게 패해 처형당한 찬탈자.' },
  { name: '오로데스 2세', start: -54, end: -37, description: '카르하이 전투(기원전 53년)에서 로마의 크라수스를 대패시켜 서방 진출을 저지하고 제국의 위세를 떨친 명왕.' },
  { name: '프라아테스 4세', start: -37, end: -2, description: '로마 안토니우스의 대공세를 격퇴하고, 로마 초대 황제 아우구스투스와 평화 협정을 맺어 군기를 반환한 실리 외교의 군주.' },
  { name: '프라아테스 5세', start: -2, end: 4, description: '이탈리아 출신 모후(무사)와 공동 통치하며 로마와의 평화를 유지하려 했으나 귀족들의 반발로 축출된 군주.' },
  { name: '오로데스 3세', start: 4, end: 6, description: '잔혹한 통치로 인해 귀족들에게 옹립된 지 불과 2년 만에 암살당한 군주.' },
  { name: '보노네스 1세', start: 6, end: 12, description: '로마에서 인질로 자라 친로마 성향을 보이다가 파르티아 고유 전통을 중시하는 귀족들에게 배척당해 축출된 군주.' },
  { name: '아르타바누스 2세', start: 12, end: 38, description: '방계 가문 출신으로 왕권을 다잡고 후한(한나라)과의 교역을 활성화했으나 내부 귀족 반란이 끊이지 않았던 군주.' },
  { name: '바르다네스 1세', start: 38, end: 47, description: '형제 고타르제스 2세와의 치열한 내전 끝에 수도 크테시폰을 사수했으나 암살당한 군주.' },
  { name: '고타르제스 2세', start: 47, end: 51, description: '형제를 제거하고 왕위를 독점했으나 가혹한 숙청으로 인해 제국의 결속을 약화시킨 군주.' },
  { name: '폰노네스 2세', start: 51, end: 51, description: '미디아의 통치자였다가 국왕으로 즉위했으나 불과 몇 달 만에 급사한 단명 군주.' },
  { name: '볼로가세스 1세', start: 51, end: 78, description: '동생을 아르메니아 왕위(아르사케스 왕조)에 앉혀 로마와의 대규모 전쟁을 주도하고, 파르티아 문화 부흥을 이끈 명군.' },
  { name: '파코루스 2세', start: 78, end: 105, description: '후한의 반초가 보낸 사신 감영(기원후 97년)을 접견하여 안식국의 영토를 통과하게 해 준 대외 교섭기 군주.' },
  { name: '볼로가세스 2세', start: 105, end: 147, description: '제국 서부(메소포타미아)를 장악하고 로마 트라야누스 황제의 대공세를 견뎌내며 영토를 수호한 군주.' },
  { name: '오스로에스 1세', start: 109, end: 129, description: '볼로가세스 2세와 대립하며 제국 서방을 분점했으나 로마군에게 수도 크테시폰을 함락당했던 비운의 분령 국왕.' },
  { name: '미트리다테스 4세', start: 129, end: 140, description: '오스로에스 1세의 뒤를 이어 동방의 볼로가세스 2세에 맞서 내전을 지속한 군주.' },
  { name: '볼로가세스 3세', start: 147, end: 191, description: '분열된 파르티아를 다시 하나로 통합하고 로마 마르쿠스 아우렐리우스 황제의 대대적인 반격을 방어해 낸 군주.' },
  { name: '볼로가세스 4세', start: 191, end: 208, description: '로마 세프티미우스 세베루스 황제에게 수도 크테시폰을 다시 빼앗기며 제국의 중추적 경제 기반을 상실한 쇠퇴기 군주.' },
  { name: '볼로가세스 5세', start: 208, end: 213, description: '동생 아르타바누스 4세와의 치열한 왕위 계승 내전으로 제국의 국력을 완전히 소진시킨 군주.' },
  { name: '아르타바누스 3세 (또는 4세)', start: 213, end: 224, description: '로마의 카라칼라 공세를 막아냈으나, 내부에서 발흥한 사산조 페르시아의 아르다시르 1세에게 호르모즈간 전투에서 패해 전사한 파르티아 제국의 최후의 왕.' },
];

function makeRecord(ruler, existing = {}) {
  return {
    ...existing,
    _id: existing._id || new ObjectId(),
    name: ruler.name,
    name_ko: ruler.name,
    name_zh: '',
    title: ruler.title || '왕',
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
    if (!country || country.name !== COUNTRY_NAME) throw new Error('파르티아 국가를 확인할 수 없습니다.');
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
    console.log(`파르티아 군주 입력 완료: 추가 ${added}명, 갱신 ${updated}명, 검증 ${saved.length}명`);
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
