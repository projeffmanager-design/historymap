/**
 * Merge the three known Syngman Rhee career entries into one voting identity.
 * Preview: node merge_syngman_rhee.js
 * Apply:   node merge_syngman_rhee.js --apply
 * The original entries are retained as career phases and backed up in MongoDB.
 */
'use strict';

require('dotenv').config({ quiet: true });
const { MongoClient, ObjectId } = require('mongodb');

const DOC_ID = new ObjectId('68ea9db2d5066f1cb63241d3');
const PHASES = new Map([
    ['68eaa580a5055b9b7ed88a55', { name: '초대 국무총리 이승만', start: 1919, title: '초대 국무총리' }],
    ['68eaa580a5055b9b7ed88a56', { name: '대통령 이승만', start: 1919, title: '임시정부 대통령' }],
    ['68eaa580a5055b9b7ed88a5b', { name: '제1~3대 이승만 하야', start: 1948, title: '대한민국 제1~3대 대통령' }]
]);
const PERSON_ID = 'syngman-rhee-1875';

async function main() {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI가 없습니다.');
    const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    try {
        await client.connect();
        const db = client.db('realhistory');
        const kings = db.collection('kings');
        const doc = await kings.findOne({ _id: DOC_ID });
        if (!doc || !Array.isArray(doc.kings)) throw new Error('원본 kings 문서를 찾지 못했습니다.');

        const records = doc.kings.map((king, index) => ({ king, index }))
            .filter(({ king }) => PHASES.has(String(king._id)));
        if (records.length !== PHASES.size) throw new Error(`예상한 3개 대신 ${records.length}개를 찾았습니다.`);
        for (const { king } of records) {
            const expected = PHASES.get(String(king._id));
            if (king.name !== expected.name || Number(king.start) !== expected.start) {
                throw new Error(`${king._id}의 이름/연도가 바뀌어 병합을 중단했습니다.`);
            }
            if (king.person_id && king.person_id !== PERSON_ID) {
                throw new Error(`${king._id}가 다른 인물 ID에 연결되어 있습니다.`);
            }
        }

        const voters = [...new Set(records.flatMap(({ king }) => (king.voted_by || []).map(String)))];
        const worstVoters = [...new Set(records.flatMap(({ king }) => (king.worst_voted_by || []).map(String)))];
        // 이전 익명 투표 중 ID가 없는 표가 있다면 그 수만 보존한다.
        const untracked = field => records.reduce((sum, { king }) => Math.max(
            sum, Math.max(0, Number(king[field]) || 0)
                - (Array.isArray(king[field === 'vote_count' ? 'voted_by' : 'worst_voted_by'])
                    ? king[field === 'vote_count' ? 'voted_by' : 'worst_voted_by'].length : 0)
        ), 0);
        const voteCount = voters.length + untracked('vote_count');
        const worstVoteCount = worstVoters.length + untracked('worst_vote_count');
        console.log(JSON.stringify({ person_id: PERSON_ID, phases: records.map(({ king }) => king.name),
            vote_count: voteCount, worst_vote_count: worstVoteCount }, null, 2));
        if (!process.argv.includes('--apply')) return;

        const backupId = `merge-syngman-rhee:${DOC_ID}`;
        const backups = db.collection('migration_backups');
        await backups.updateOne({ _id: backupId }, {
            $setOnInsert: { createdAt: new Date(), country_id: doc.country_id,
                records: records.map(({ king, index }) => ({ king, index })) }
        }, { upsert: true });

        const set = { updatedAt: new Date() };
        const filter = { _id: DOC_ID };
        for (const { king, index } of records) {
            filter[`kings.${index}._id`] = king._id;
            filter[`kings.${index}.vote_count`] = king.vote_count;
            filter[`kings.${index}.worst_vote_count`] = king.worst_vote_count;
            set[`kings.${index}.person_id`] = PERSON_ID;
            set[`kings.${index}.name_ko`] = '이승만';
            set[`kings.${index}.title`] = PHASES.get(String(king._id)).title;
            set[`kings.${index}.vote_count`] = voteCount;
            set[`kings.${index}.worst_vote_count`] = worstVoteCount;
            set[`kings.${index}.voted_by`] = voters;
            set[`kings.${index}.worst_voted_by`] = worstVoters;
        }
        const result = await kings.updateOne(filter, { $set: set });
        if (result.modifiedCount !== 1) throw new Error('투표 또는 원본이 변경되었습니다. 다시 확인 후 재실행하세요.');
        console.log(`병합 완료. 원본 백업: migration_backups/${backupId}`);
    } finally {
        await client.close();
    }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
