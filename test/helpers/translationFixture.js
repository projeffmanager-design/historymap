'use strict';
const { createTranslationService } = require('../../lib/historyTranslation');
const ids = Object.fromEntries(['writer', 'reviewer', 'admin', 'approver', 'other', 'source', 'history'].map((key, i) => [key, String(i + 1).padStart(24, '0')]));
const ranks = {
    roles:{ reviewers:['수찬관'], approvers:['수국사'] },
    scoreWeights:{ submitCount:3, approvedCount:10 },
    limits:{ reviewBonus:5, finalApprovalBonus:10 }
};
const get = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);
const matches = (row, filter) => Object.entries(filter).every(([key, value]) =>
    value && typeof value === 'object' && '$in' in value ? value.$in.includes(get(row, key)) : get(row, key) === value);

function fixture() {
    const data = {
        users:[
            { _id:ids.writer, username:'번역사관', role:'user', position:'수분권지' },
            { _id:ids.reviewer, username:'검토사관', role:'user', position:'정3품 수찬관(修撰官)' },
            { _id:ids.admin, username:'관리사관', role:'admin' },
            { _id:ids.approver, username:'승인사관', role:'user', position:'정2품 수국사(修國史)' },
            { _id:ids.other, username:'다른사관', role:'user' }
        ],
        sourceRecords:[{ _id:ids.source, title:'고려 기사', source:'원사(元史)', year:null, content_type:'chinese_original', content:'高麗遣使來貢。' }],
        history:[{ _id:ids.history, event_name:'교류 기사', year:1234, records:{ chinese:{ source:'원사', content:'高麗遣使來貢。' }, korean:{ content:'기존 번역' } } }],
        contributions:[], activityLogs:[]
    };
    let nextId = 100;
    let failure = null;
    const collections = {};
    for (const name of Object.keys(data)) {
        collections[name] = {
            async findOne(filter) { return structuredClone(data[name].find(row => matches(row, filter)) || null); },
            find(filter = {}, options = {}) {
                let rows = data[name].filter(row => matches(row, filter));
                const cursor = {
                    sort() { rows = rows.slice().reverse(); return cursor; },
                    skip(n) { rows = rows.slice(n); return cursor; }, limit(n) { rows = rows.slice(0, n); return cursor; },
                    async toArray() { return structuredClone(rows.map(row => options.projection ? Object.fromEntries(
                        Object.entries(row).filter(([key]) => key === '_id' || options.projection[key])
                    ) : row)); }
                };
                return cursor;
            },
            async countDocuments(filter) { return data[name].filter(row => matches(row, filter)).length; },
            aggregate(pipeline) {
                const filter = pipeline[0].$match;
                const group = pipeline[1].$group;
                const pendingStatuses = group.pending.$sum.$cond[0].$in[1];
                const groups = new Map();
                for (const row of data[name].filter(row => matches(row, filter))) {
                    const key = get(row, group._id.slice(1));
                    const count = groups.get(key) || { _id:key, total:0, pending:0 };
                    count.total++;
                    if (pendingStatuses.includes(row.status)) count.pending++;
                    groups.set(key, count);
                }
                return { toArray:async () => structuredClone([...groups.values()]) };
            },
            async insertOne(row) {
                if (failure === name) { failure = null; throw new Error('simulated write failure'); }
                const _id = String(nextId++).padStart(24, '0');
                data[name].push({ ...structuredClone(row), _id });
                return { insertedId:_id };
            },
            async updateOne(filter, update) {
                if (failure === name) { failure = null; throw new Error('simulated write failure'); }
                const row = data[name].find(row => matches(row, filter));
                if (!row) return { matchedCount:0 };
                Object.assign(row, structuredClone(update.$set || {}));
                for (const [key, amount] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + amount;
                for (const [key, value] of Object.entries(update.$push || {})) (row[key] ||= []).push(structuredClone(value));
                return { matchedCount:1 };
            }
        };
    }
    let queue = Promise.resolve();
    let invalidations = 0;
    const client = { startSession:() => ({
        withTransaction(work) {
            const run = queue.then(async () => {
                const before = structuredClone(data);
                try { return await work(); }
                catch (error) { Object.assign(data, before); throw error; }
            });
            queue = run.catch(() => {});
            return run;
        }, async endSession() {}
    }) };
    const service = createTranslationService({ collections, toObjectId:value => typeof value === 'string' && /^[0-9a-f]{24}$/.test(value) ? value : null,
        getMongoClient:() => client, ranks, invalidate:() => { invalidations++; } });
    return { data, collections, service, ids, ranks, auth:who => ({ userId:ids[who] }),
        failNextWrite:name => { failure = name; }, invalidations:() => invalidations,
        input:{ targetType:'source', targetId:ids.source, content:'고려가 사신을 보내 조공하였다.' } };
}
module.exports = { fixture, ids, ranks };
