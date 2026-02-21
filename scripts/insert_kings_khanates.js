/**
 * 몽골 4대 칸국 왕 데이터 삽입 스크립트
 * - 킵차크 칸국 (Golden Horde)
 * - 오고타이 칸국 (Ögedei Khanate)
 * - 차가타이 칸국 (Chagatai Khanate)
 * - 일한국 (Ilkhanate)
 * 실행: node scripts/insert_kings_khanates.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const GROUPS = [
    // ── 킵차크 칸국 (Golden Horde) ──────────────────────────
    {
        label: '킵차크 칸국(Golden Horde)',
        countryId: new ObjectId('694e42af1cbc0ed73d82bb25'),
        kings: [
            { name: '바투(Batu)',       start: 1227, end: 1255, summary: '실질적 창건자. 유럽 원정의 주역. 폴란드·헝가리까지 진격하며 유럽을 공포에 빠뜨림.' },
            { name: '베르케(Berke)',     start: 1257, end: 1266, summary: '이슬람으로 개종. 훌라구의 일한국과 대립하며 킵차크의 독자 노선 확립.' },
            { name: '우즈베크 칸(Özbeg)', start: 1313, end: 1341, summary: '킵차크 칸국 최전성기. 이슬람교를 국교화하여 내부 통합 강화.' },
            { name: '토크타미슈(Toqtamish)', start: 1380, end: 1395, summary: '티무르에게 패배하며 쇠퇴 시작. 사라이를 잃고 킵차크 칸국 분열의 직접적 원인이 됨.' },
        ]
    },
    // ── 오고타이 칸국 (Ögedei Khanate) ─────────────────────
    {
        label: '오고타이 칸국(Ögedeid Khanate)',
        countryId: new ObjectId('694e6e1a07f1d71fd5845470'),
        kings: [
            { name: '구육(Güyük)',  start: 1246, end: 1248, summary: '몽골 제국의 3대 대칸이자 오고타이 가문의 수장. 교황 이노센트 4세에게 사신을 맞이함.' },
            { name: '카이두(Kaidu)', start: 1264, end: 1301, summary: '대륙의 반란자. 쿠빌라이 칸의 원나라에 평생 저항하며 독자 세력 유지.' },
            { name: '차파르(Chapar)', start: 1301, end: 1310, summary: '오고타이 칸국의 마지막 칸. 차가타이 칸국에 병합되며 소멸.' },
        ]
    },
    // ── 차가타이 칸국 (Chagatai Khanate) ────────────────────
    {
        label: '차가타이 칸국(Chagatai Khanate)',
        countryId: new ObjectId('694e55ec07f1d71fd584546c'),
        kings: [
            { name: '차가타이(Chagatai)', start: 1226, end: 1242, summary: '칭기즈 칸의 차남. 몽골 전통 법령(야사, Yassa)의 수호자로 중앙아시아 실크로드를 장악.' },
            { name: '알루구(Alghu)',      start: 1260, end: 1266, summary: '아리크부카와 쿠빌라이 사이에서 세력을 확장하며 칸국의 독립성 강화.' },
            { name: '두아(Duwa)',         start: 1282, end: 1307, summary: '카이두와 연합하여 원나라에 대항. 차가타이 칸국 중흥기를 이끔.' },
            { name: '타르마시린(Tarmashirin)', start: 1331, end: 1334, summary: '이슬람화 이후 동부(모굴리스탄)와 서부 분열 시작. 내부 갈등으로 살해됨.' },
        ]
    },
    // ── 일한국 (Ilkhanate) ───────────────────────────────────
    {
        label: '일한국(Ilkhanate)',
        countryId: new ObjectId('694e49bc07f1d71fd5845464'),
        kings: [
            { name: '훌라구(Hulagu)',   start: 1256, end: 1265, summary: '바그다드 점령. 아바스 왕조를 멸망시키며 이슬람 세계를 충격에 빠뜨림.' },
            { name: '아바카(Abaqa)',    start: 1265, end: 1282, summary: '비잔틴 제국과 혼인 동맹을 맺고 십자군과의 연합을 모색하며 서방 외교 확대.' },
            { name: '가잔 칸(Ghazan)', start: 1295, end: 1304, summary: '일한국 최전성기. 이슬람교 개종 후 페르시아 문화를 적극 수용하며 독자적 문명 발전.' },
            { name: '아부 사이드(Abu Said)', start: 1316, end: 1335, summary: '일한국의 마지막 칸. 후계자 없이 사망하며 제국이 여러 소국으로 해체됨.' },
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
