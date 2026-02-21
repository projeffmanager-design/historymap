/**
 * 티무르 제국 / 오스만 제국 / 카자르 왕조 왕 데이터 삽입 스크립트
 * 실행: node scripts/insert_kings_timurid_ottoman_qajar.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const GROUPS = [
    // ── 티무르 제국 (1370–1507) ──────────────────────────────
    {
        label: '티무르 제국(Timurid Empire)',
        countryId: new ObjectId('694d4b0007f1d71fd5845422'),
        kings: [
            { name: '티무르(Timur)',        start: 1370, end: 1405, summary: '제국 창건자. 킵차크·일한국의 후계를 자처하며 중앙아시아를 석권. 명나라 원정 중 오트라르에서 사망.' },
            { name: '샤 루흐(Shah Rukh)',   start: 1405, end: 1447, summary: '티무르의 4남. 티무르 르네상스를 이끌며 헤라트·사마르칸트에 이슬람-페르시아 문화의 황금기를 열음.' },
            { name: '울루그 베그(Ulugh Beg)', start: 1447, end: 1449, summary: '위대한 천문학자. 사마르칸트에 거대 천문대를 건립하고 항성 목록을 편찬. 조선 칠정산과 궤를 같이하는 동방 천문학의 공유.' },
            { name: '아부 사이드(Abu Said)', start: 1451, end: 1469, summary: '제국 분열기를 수습하려 노력하며 중앙아시아 영역을 일시 재통합.' },
            { name: '후세인 바이카라(Husayn Bayqara)', start: 1469, end: 1506, summary: '헤라트를 중심으로 예술과 문학의 꽃을 피움. 시인 나보이와 화가 비흐자드를 후원.' },
        ]
    },
    // ── 오스만 제국 (1299–1922) ──────────────────────────────
    {
        label: '오스만 제국(Ottoman Empire)',
        countryId: new ObjectId('68dc7f9ade5169a850293fd8'),
        kings: [
            { name: '오스만 1세(Osman I)',       start: 1299, end: 1326, summary: '오스만 왕조의 창시자. 오구즈 투르크족 출신으로 아나톨리아 서부에 독립 공국 수립.' },
            { name: '메흐메트 2세(Mehmet II)',   start: 1451, end: 1481, summary: '정복왕. 1453년 비잔틴 제국의 수도 콘스탄티노플을 함락시키며 동로마 제국을 완전히 종식.' },
            { name: '셀림 1세(Selim I)',         start: 1512, end: 1520, summary: '이집트 정복 후 맘루크 왕조를 멸망시키고 칼리프 직위를 획득. 제국의 영역을 중동·북아프리카로 확대.' },
            { name: '술레이만 1세(Suleiman I)', start: 1520, end: 1566, summary: '입법자(칸우니). 제국의 최대 판도 달성. 유럽의 심장 빈 포위, 지중해 해상권 장악.' },
            { name: '메흐메트 6세(Mehmet VI)',   start: 1918, end: 1922, summary: '오스만 제국의 마지막 술탄. 1차 세계대전 패전 후 무스타파 케말의 혁명으로 폐위되며 제국 멸망.' },
        ]
    },
    // ── 카자르 왕조 (1794–1925) ──────────────────────────────
    {
        label: '카자르 왕조(Qajar)',
        countryId: new ObjectId('694e184b55b1f6bab9b3ab48'),
        kings: [
            { name: '아가 모함마드 칸(Agha Mohammad Khan)', start: 1794, end: 1797, summary: '테헤란을 수도로 정하고 카자르 왕조 창건. 투르크계 유목 부족의 이란 지배 시작.' },
            { name: '파드 알리 샤(Fath-Ali Shah)',          start: 1797, end: 1834, summary: '러시아와의 두 차례 전쟁으로 코카서스 영토 상실(굴리스탄 조약 1813, 투르크만차이 조약 1828).' },
            { name: '나시르 앗딘 샤(Naser al-Din Shah)',   start: 1848, end: 1896, summary: '근대화를 시도했으나 영국·러시아 열강의 이권 침탈에 시달림. 로이터 양허권 사건으로 민중 저항 촉발.' },
            { name: '아흐마드 샤(Ahmad Shah)',              start: 1909, end: 1925, summary: '카자르 왕조의 마지막 샤. 레자 칸(팔레비)의 쿠데타로 폐위되며 왕조 완전 종식.' },
        ]
    },
];

async function main() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const kingsCol = db.collection('kings');

    const normalize = str => str.replace(/[\s\(\)\（\）\/\\]/g, '');

    let totalInserted = 0;
    let totalSkipped = 0;

    for (const group of GROUPS) {
        const existingDoc = await kingsCol.findOne({ country_id: group.countryId });
        const existingNames = existingDoc ? existingDoc.kings.map(k => normalize(k.name)) : [];

        const toInsert = group.kings
            .filter(k => !existingNames.includes(normalize(k.name)))
            .map(k => ({
                _id: new ObjectId(),
                name: k.name,
                start: k.start,
                start_month: 1,
                end: k.end,
                end_month: 12,
                summary: k.summary,
            }));

        const skipped = group.kings.length - toInsert.length;
        totalSkipped += skipped;

        if (skipped > 0) {
            const skippedNames = group.kings.filter(k => existingNames.includes(normalize(k.name))).map(k => k.name);
            console.log(`  ⏭  [${group.label}] 중복 스킵: ${skippedNames.join(', ')}`);
        }

        if (toInsert.length === 0) {
            console.log(`  ✅ [${group.label}] 추가할 새 왕 없음`);
            continue;
        }

        await kingsCol.updateOne(
            { country_id: group.countryId },
            { $push: { kings: { $each: toInsert } } },
            { upsert: true }
        );

        console.log(`  ✅ [${group.label}] ${toInsert.length}명 삽입:`);
        toInsert.forEach(k => console.log(`     - ${k.name} (${k.start} ~ ${k.end})`));
        totalInserted += toInsert.length;
    }

    console.log(`\n🎉 완료: 총 ${totalInserted}명 삽입, ${totalSkipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
