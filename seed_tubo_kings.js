/**
 * 토번(吐蕃) 제29대~제41대 군주 입력/갱신
 *
 * 실행: node seed_tubo_kings.js
 */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const COUNTRY_ID = new ObjectId('68dc7f9ade5169a850293fdc');
const COUNTRY_NAME = '토번(吐蕃)';
const COUNTRY_COLOR = '#003d2b';

const rulers = [
  { order: 29, name: '트리냔중찬', start: 535, end: 555, description: '가문의 영지를 대폭 확대하고 독자적인 관료제의 기틀을 닦은 군주.' },
  { order: 30, name: '드롱냔우루', start: 555, end: 581, description: '사방의 토착 부족들과 치열한 영토 전쟁을 벌이며 군사력을 축적한 왕.' },
  { order: 31, name: '달부조와 (달부뉴사)', start: 581, end: 600, description: '강력한 부족장들을 회유·포섭하여 고원 통일의 지리적 발판을 마련한 인물.' },
  { order: 32, name: '낭리론찬', start: 600, end: 618, description: '티베트 중앙 고원을 최초로 정복하고 중원 수나라 및 당나라에 사신을 파견한 제국의 설계자.', aliases: ['남리론찬 (南日論贊)'] },
  { order: 33, name: '송센감포 (송찬간부)', start: 618, end: 650, description: '토번 제국의 위대한 창건자; 문자를 제정하고 당나라·네팔과 국혼을 맺어 제국의 기틀을 완성한 성군.', aliases: ['송첸 감포 (松贊干布)'] },
  { order: 34, name: '망송망찬 (망송망찬)', start: 650, end: 676, description: '명재상 가르 가문의 보좌를 받아 토욕혼을 병합하고 실크로드 안서 4진을 장악한 대외 확장 군주.' },
  { order: 35, name: '두송망보제 (두송망보제)', start: 676, end: 704, description: '왕권을 위협하던 권신 가르 가문을 전격 숙청하여 군주 독재권을 확립했으나 대외 원정 중 급사한 군주.' },
  { order: 36, name: '메악좀 (계례속찬)', start: 704, end: 755, description: '당나라 금성공주와의 국혼을 통해 서부 실크로드 교역 이권을 챙기는 실리 외교를 폈으나 암살당한 비운의 왕.', aliases: ['치데 죽첸 (赤德祖贊)'] },
  { order: 37, name: '티송데찬 (적송덕찬)', start: 755, end: 797, description: '토번 제국의 최전성기를 이끈 정복 군주; 당나라 수도 장안을 함락하고 불교를 국교로 선포한 성왕.', aliases: ['치송 데첸 (赤松德贊)'] },
  { order: 38, name: '무네찬포 (무니찬포)', start: 797, end: 798, description: '빈부격차 해소를 위해 토지 균등 분배를 시도했으나 보수 귀족과 어머니에 의해 독살당한 이상주의 통치자.' },
  { order: 39, name: '티데송찬 (적덕송찬)', start: 798, end: 815, description: '당나라 및 서방 이슬람 세력과의 다면 전쟁을 통제하고 불교 경전 번역 표준화를 완수한 내치의 명군.' },
  { order: 40, name: '랄파찬 (가뢰가족)', start: 815, end: 838, description: "당나라와 대등한 위치에서 국경을 확정 짓는 '장경회맹(822년)'을 체결했으나 과도한 친불교 정책으로 암살당한 왕." },
  { order: 41, name: '랑다마 (달마)', start: 838, end: 842, description: '즉위 후 가혹한 폐불 정책을 펴다 승려에게 암살당했으며, 사후 대분열을 야기해 제국의 종말을 이끈 최후의 왕.', aliases: ['랄룽 팰도르 (朗達瑪)'] },
];

function makeRecord(ruler, existingId) {
  return {
    _id: existingId || new ObjectId(),
    name: ruler.name,
    name_ko: ruler.name,
    name_zh: '',
    title: `제${ruler.order}대 군주`,
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
    avatar_url: '',
    illustration_url: '',
    vote_count: 0,
    updatedAt: new Date(),
  };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI가 없습니다.');
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();

  try {
    const db = client.db('realhistory');
    const countries = db.collection('countries');
    const kings = db.collection('kings');
    const country = await countries.findOne({ _id: COUNTRY_ID });
    if (!country || country.name !== COUNTRY_NAME) throw new Error('토번 국가를 확인할 수 없습니다.');

    const doc = await kings.findOne({ country_id: COUNTRY_ID });
    const existing = Array.isArray(doc?.kings) ? doc.kings : [];
    const retained = [...existing];
    let added = 0;
    let updated = 0;

    for (const ruler of rulers) {
      const names = new Set([ruler.name, ...(ruler.aliases || [])]);
      const index = retained.findIndex(item => names.has(item.name) || names.has(item.name_ko));
      if (index >= 0) {
        retained[index] = makeRecord(ruler, retained[index]._id);
        updated += 1;
      } else {
        retained.push(makeRecord(ruler));
        added += 1;
      }
    }

    retained.sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
    await kings.updateOne(
      { country_id: COUNTRY_ID },
      { $set: { kings: retained, updatedAt: new Date() } },
      { upsert: true },
    );

    const verified = await kings.findOne({ country_id: COUNTRY_ID });
    const targetNames = new Set(rulers.map(ruler => ruler.name));
    const saved = (verified?.kings || []).filter(king => targetNames.has(king.name));
    if (saved.length !== rulers.length) throw new Error(`검증 실패: ${saved.length}/${rulers.length}명 저장됨`);
    console.log(`토번 군주 입력 완료: 추가 ${added}명, 갱신 ${updated}명, 검증 ${saved.length}명`);
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
