// migrate_duplicate_castles_to_history.js
// 도시(마커) 이름 기준으로 중복된 마커를 찾아, 가장 오래된 마커의 history 배열에 통합 제안
// 필드: 이름, 국가, 시작/종료 연월, 수도여부
// 1. 이름으로 그룹화, 2. 각 그룹의 마커 정보 나열, 3. 사용자 입력으로 통합/삭제 여부 결정

const readline = require('readline');
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URL = MONGO_URI="mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/";
const DB_NAME = 'realhistory';
const COLLECTION = 'castle';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

(async () => {
  const client = new MongoClient(MONGO_URL);
  await client.connect();

  const db = client.db(DB_NAME);
  const castles = await db.collection(COLLECTION).find({}).toArray();
  // 국가 정보 미리 불러오기 (id, name, 기간 등)
  const countriesArr = await db.collection('countries').find({}).toArray();
  const countriesById = {};
  const countriesByName = {};
  for (const c of countriesArr) {
    countriesById[c._id?.toString()] = c;
    countriesByName[c.name] = c;
  }

  // 1. 이름으로 그룹화 (좌표는 무시, 단 이름이 완전히 같아야 함)
  const groups = {};
  for (const c of castles) {
    if (!groups[c.name]) groups[c.name] = [];
    groups[c.name].push(c);
  }

  for (const [name, group] of Object.entries(groups)) {
    if (group.length < 2) continue; // 중복 아님
    // 2. 시작연도가 가장 빠른 마커 찾기
    const sorted = group.slice().sort((a, b) => {
      const ay = a.built_year ?? a.built ?? 9999;
      const by = b.built_year ?? b.built ?? 9999;
      return ay - by;
    });
    const main = sorted[0];
    const others = sorted.slice(1);
    console.log(`\n[중복: ${name}]`);
    group.forEach((c, i) => {
      // country_id 우선, 없으면 country명으로 id 추정
      let countryId = c.country_id ? c.country_id.toString() : null;
      let countryName = c.country;
      if (!countryId && countryName && countriesByName[countryName]) {
        countryId = countriesByName[countryName]._id?.toString();
      }
      const countryInfo = countryId ? countriesById[countryId] : (countryName ? countriesByName[countryName] : null);
      const countryLabel = countryInfo ? `${countryInfo.name} (${countryId})` : (countryName || '');
      console.log(`  [${i+1}] _id: ${c._id}, 국가: ${countryLabel}, 시작: ${c.built_year||c.built}년${c.built_month?` ${c.built_month}월`:''}, 종료: ${c.destroyed_year||c.destroyed||''}${c.destroyed_month?` ${c.destroyed_month}월`:''}, 수도: ${c.is_capital?'O':'X'}`);
    });
    const merge = await ask('이 마커들을 통합할까요? (y/n): ');
    if (merge.toLowerCase() !== 'y') continue;
    // 3. history 배열로 통합
    const history = main.history || [];
    let anyCapital = main.is_capital || false;
    for (const c of others) {
      // country_id 우선, 없으면 country명으로 id 추정
      let countryId = c.country_id ? c.country_id.toString() : null;
      let countryName = c.country;
      if (!countryId && countryName && countriesByName[countryName]) {
        countryId = countriesByName[countryName]._id?.toString();
      }
      const countryInfo = countryId ? countriesById[countryId] : (countryName ? countriesByName[countryName] : null);
      if (c.is_capital) anyCapital = true;
      history.push({
        name: c.name,
        country_id: countryId,
        country: countryInfo ? countryInfo.name : (countryName || ''),
        start_year: c.built_year ?? c.built,
        start_month: c.built_month ?? 1,
        end_year: c.destroyed_year ?? c.destroyed,
        end_month: c.destroyed_month ?? 12,
        is_capital: c.is_capital || false
      });
    }
    // 만약 통합된 마커 중 하나라도 수도라면 main 마커도 수도로 업데이트
    if (anyCapital && !main.is_capital) {
      await db.collection(COLLECTION).updateOne(
        { _id: main._id },
        { $set: { is_capital: true } }
      );
    }
    await db.collection(COLLECTION).updateOne(
      { _id: main._id },
      { $set: { history } }
    );
    const del = await ask('통합 후 나머지 마커를 삭제할까요? (y/n): ');
    if (del.toLowerCase() === 'y') {
      await db.collection(COLLECTION).deleteMany({ _id: { $in: others.map(c => c._id) } });
      console.log('삭제 완료.');
    } else {
      console.log('삭제하지 않음.');
    }
    console.log('통합 완료.');
  }
  rl.close();
  await client.close();
})();
