// merge_two_castles_by_name.js
// 두 개의 마커 이름을 입력받아, 두 마커를 하나의 history로 통합하는 스크립트

const readline = require('readline');
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';
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

  // 국가 정보 미리 불러오기
  const countriesArr = await db.collection('countries').find({}).toArray();
  const countriesById = {};
  const countriesByName = {};
  for (const c of countriesArr) {
    countriesById[c._id?.toString()] = c;
    countriesByName[c.name] = c;
  }

  const name1 = await ask('첫 번째 마커 이름을 입력하세요: ');
  const name2 = await ask('두 번째 마커 이름을 입력하세요: ');

  const marker1 = await db.collection(COLLECTION).findOne({ name: name1 });
  const marker2 = await db.collection(COLLECTION).findOne({ name: name2 });

  if (!marker1 || !marker2) {
    console.log('두 마커 중 하나 이상을 찾을 수 없습니다.');
    rl.close();
    await client.close();
    return;
  }

  // 어떤 마커를 기준(main)으로 할지 선택
  console.log(`\n[1] ${marker1.name} (_id: ${marker1._id})`);
  console.log(`[2] ${marker2.name} (_id: ${marker2._id})`);
  const mainIdx = await ask('어느 마커를 기준(main)으로 history를 합칠까요? (1/2): ');
  const main = mainIdx === '2' ? marker2 : marker1;
  const other = mainIdx === '2' ? marker1 : marker2;

  // history 통합
  const history = main.history || [];
  let countryId = other.country_id ? other.country_id.toString() : null;
  let countryName = other.country;
  if (!countryId && countryName && countriesByName[countryName]) {
    countryId = countriesByName[countryName]._id?.toString();
  }
  const countryInfo = countryId ? countriesById[countryId] : (countryName ? countriesByName[countryName] : null);
  history.push({
    name: other.name,
    country_id: countryId,
    country: countryInfo ? countryInfo.name : (countryName || ''),
    start_year: other.built_year ?? other.built,
    start_month: other.built_month ?? 1,
    end_year: other.destroyed_year ?? other.destroyed,
    end_month: other.destroyed_month ?? 12,
    is_capital: other.is_capital || false
  });
  // 수도여부 통합
  const anyCapital = (main.is_capital || other.is_capital) ? true : false;
  await db.collection(COLLECTION).updateOne(
    { _id: main._id },
    { $set: { history, is_capital: anyCapital } }
  );

  // 삭제 여부
  const del = await ask('통합 후 나머지 마커를 삭제할까요? (y/n): ');
  if (del.toLowerCase() === 'y') {
    await db.collection(COLLECTION).deleteOne({ _id: other._id });
    console.log('삭제 완료.');
  } else {
    console.log('삭제하지 않음.');
  }
  console.log('통합 완료.');
  rl.close();
  await client.close();
})();
