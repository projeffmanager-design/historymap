// 하(夏)나라 왕 계보 추가 스크립트
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { connectToDatabase } = require('../db');
const { ObjectId } = require('mongodb');

const XIA_KINGS = [
    { name: '우(禹)',   hanja: '禹',   start: -2070, end: -2025, note: '양족(백익)에게 선양하려 했으나 아들 계에게 권력을 빼앗긴 비운의 성군.' },
    { name: '계(啓)',   hanja: '啓',   start: -2025, end: -1996, note: '백익을 살해하고 동이족의 공유제(양급제)를 파괴한 세습제의 창시자.' },
    { name: '태강(太康)', hanja: '太康', start: -1996, end: -1988, note: '정치를 버리고 사냥에 빠졌다가 양족 유예(후예)에게 쫓겨난 실국(失國)의 왕.' },
    { name: '유예·한착(공백)', hanja: '(공백)',  start: -1988, end: -1920, note: '양족 인방(석가장) 세력이 중원을 탈환하여 다스린 \'양족 복권기\'. (왕위 공백)', isInterregnum: true },
    { name: '중강(仲康)', hanja: '仲康', start: -1920, end: -1907, note: '유예의 꼭두각시로 즉위했으나 웅족 재건의 불씨를 지핀 인물.' },
    { name: '상(相)',   hanja: '相',   start: -1907, end: -1880, note: '유예의 후계자 한착에게 살해당하며 하 왕조 최대의 위기를 맞음.' },
    { name: '소강(少康)', hanja: '少康', start: -1880, end: -1859, note: '한착을 멸하고 웅족(화하족)의 패권을 되찾은 하 왕조 중흥의 주역.' },
    { name: '저(杼)',   hanja: '杼',   start: -1859, end: -1842, note: '갑옷(포갑)을 발명하여 동이 양족의 활(단궁)에 대항한 군사 강권론자.' },
    { name: '불강(不降)', hanja: '不降', start: -1842, end: -1783, note: '하나라 세력을 북방 구이족(구환)까지 확장하며 전성기를 구가함.' },
    { name: '국(扃)',   hanja: '扃',   start: -1783, end: -1762, note: '형 불강의 뒤를 이어 왕위를 계승하며 세습제를 공고히 함.' },
    { name: '근(廑)',   hanja: '廑',   start: -1762, end: -1741, note: '수도를 서하로 옮기며 내부 결속을 다졌으나 국력이 쇠퇴하기 시작함.' },
    { name: '공갑(孔甲)', hanja: '孔甲', start: -1741, end: -1710, note: '신령과 용을 숭배하는 미신에 빠져 제후들의 민심을 잃은 실정왕.' },
    { name: '고(皐)',   hanja: '皐',   start: -1710, end: -1699, note: '쇠락해가는 하 왕조의 기틀을 잡으려 애썼으나 단명함.' },
    { name: '발(發)',   hanja: '發',   start: -1699, end: -1692, note: '제후들의 입조가 끊기고 하 왕조의 권위가 바닥으로 추락한 시기.' },
    { name: '걸(桀)',   hanja: '桀',   start: -1630, end: -1600, note: '사치와 폭정으로 일관하다 양족 후예 상나라 탕왕에게 멸망당한 말대왕.' },
];

async function main() {
    const { collections } = await connectToDatabase();

    // 1) 기존 하나라 kings 문서 찾기
    const allKingsDoc = await collections.kings.find({}).toArray();
    console.log(`전체 kings 문서 수: ${allKingsDoc.length}`);

    // country_id로 연결된 하나라 찾기
    let xiaDoc = null;
    let xiaCountryId = null;

    // countries 컬렉션에서 하나라 찾기
    const allCountries = await collections.countries.find({}).toArray();
    const xiaCountry = allCountries.find(c => {
        const name = String(c.name || c.key || '');
        return name.includes('하(夏)') || name.includes('夏') || name.includes('하나라') || name.includes('Xia');
    });

    if (xiaCountry) {
        xiaCountryId = xiaCountry._id;
        console.log(`✅ 하나라 country 발견: ${xiaCountry.name || xiaCountry.key} (id: ${xiaCountryId})`);
        xiaDoc = allKingsDoc.find(d => String(d.country_id) === String(xiaCountryId));
    } else {
        // countryKey 기반으로 찾기 (직접 저장된 경우)
        xiaDoc = allKingsDoc.find(d => {
            const k = String(d.countryKey || d.country_key || d.name || '');
            return k.includes('하(夏)') || k.includes('夏') || k.includes('하나라');
        });
        if (xiaDoc) {
            console.log(`✅ 하나라 kings 문서 발견 (country key 방식): ${JSON.stringify(Object.keys(xiaDoc))}`);
            xiaCountryId = xiaDoc.country_id || xiaDoc._id;
        }
    }

    if (!xiaCountry && !xiaDoc) {
        console.log('⚠️  하나라 country가 없습니다. 사용 가능한 country 목록:');
        allCountries.slice(0, 20).forEach(c => console.log(' -', c.name || c.key, '|', String(c._id)));
        console.log('\n하나라 country가 없으므로 kings 문서에 직접 countryKey로 저장합니다.');
    }

    // 2) kings 데이터 구성
    const kingsData = XIA_KINGS.map((k, i) => ({
        _id: new ObjectId(),
        name: k.name,
        hanja: k.hanja,
        start: k.start,
        end: k.end,
        note: k.note,
        order: i + 1,
        ...(k.isInterregnum ? { isInterregnum: true } : {})
    }));

    if (xiaDoc) {
        // 기존 문서 업데이트
        const result = await collections.kings.updateOne(
            { _id: xiaDoc._id },
            { $set: { kings: kingsData, updatedAt: new Date() } }
        );
        console.log(`✅ 기존 하나라 kings 문서 업데이트 완료 (matched: ${result.matchedCount}, modified: ${result.modifiedCount})`);
    } else if (xiaCountryId) {
        // country_id로 upsert
        const result = await collections.kings.updateOne(
            { country_id: xiaCountryId },
            { $set: { kings: kingsData, country_id: xiaCountryId, updatedAt: new Date() } },
            { upsert: true }
        );
        console.log(`✅ 하나라 kings 문서 생성/업데이트 완료 (upserted: ${result.upsertedCount}, modified: ${result.modifiedCount})`);
    } else {
        // country가 없는 경우: countryKey 방식으로 직접 삽입
        const result = await collections.kings.updateOne(
            { countryKey: '하(夏)' },
            { $set: { countryKey: '하(夏)', countryName: '하(夏)나라', kings: kingsData, updatedAt: new Date() } },
            { upsert: true }
        );
        console.log(`✅ 하나라 kings 문서 (countryKey 방식) 생성 완료 (upserted: ${result.upsertedCount})`);
    }

    // 3) 검증
    const verify = xiaCountryId
        ? await collections.kings.findOne({ country_id: xiaCountryId })
        : await collections.kings.findOne({ countryKey: '하(夏)' });

    if (verify) {
        console.log(`\n📋 검증 완료 — 저장된 왕 수: ${verify.kings?.length ?? 0}명`);
        (verify.kings || []).forEach((k, i) => {
            console.log(`  ${i+1}. ${k.name} (${k.start} ~ ${k.end})`);
        });
    }

    process.exit(0);
}

main().catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
