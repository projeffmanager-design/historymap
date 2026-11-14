'use strict';
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function searchMatch(options, type) {
    const clauses = [];
    const keyword = String(options.q || '').trim().slice(0, 200);
    const source = String(options.source || '').trim();
    const sourceFields = type === 'source' ? ['source'] : ['records.korean.source', 'records.chinese.source', 'records.foreign.source'];
    if (keyword) {
        const fields = type === 'source' ? ['title', 'content', 'source'] : [
            'event_name', 'comment', ...sourceFields, 'records.korean.content',
            'records.chinese.content', 'records.foreign.content', 'records.true_history.content'
        ];
        clauses.push({ $or: fields.map(field => ({ [field]: { $regex: escapeRegex(keyword), $options: 'i' } })) });
    }
    if (source) clauses.push({ $or: sourceFields.map(field => ({ [field]: source })) });
    if (options.undated === '1') clauses.push({ $expr: { $eq: [
        { $convert: { input: '$year', to: 'double', onError: null, onNull: null } }, null
    ] } });
    return clauses.length ? { $and: clauses } : {};
}

async function searchHistoryRecords(collections, options) {
    const limit = Math.max(1, Math.min(100, parseInt(options.limit, 10) || 100));
    const offset = Math.max(0, Math.min(100000, parseInt(options.offset, 10) || 0));
    const sourceStages = [
        { $match: searchMatch(options, 'source') },
        { $project: { _id: 1, year: 1, month: 1, source: 1, event_name: '$title', type: { $literal: 'source' } } }
    ];
    const historyStages = [
        { $match: searchMatch(options, 'history') },
        { $project: { _id: 1, year: 1, month: 1, event_name: 1,
            source: { $ifNull: ['$records.korean.source', { $ifNull: ['$records.chinese.source', '$records.foreign.source'] }] },
            type: { $literal: 'history' } } }
    ];
    const onlyHistory = options.type === 'history';
    const collection = onlyHistory ? collections.history : collections.sourceRecords;
    const pipeline = onlyHistory ? historyStages : [...sourceStages];
    if (!onlyHistory && options.type !== 'source') pipeline.push({ $unionWith: { coll: collections.history.collectionName, pipeline: historyStages } });
    pipeline.push({ $sort: { year: -1, month: -1, _id: 1, type: 1 } }, { $facet: {
        records: [{ $skip: offset }, { $limit: limit }], count: [{ $count: 'total' }]
    } });
    const [page] = await collection.aggregate(pipeline).toArray();
    const total = page?.count?.[0]?.total || 0;
    const records = page?.records || [];
    return { records, total, offset, limit, hasMore: offset + records.length < total };
}

async function listHistorySources(collections) {
    const fields = ['records.korean.source', 'records.chinese.source', 'records.foreign.source'];
    const lists = await Promise.all([collections.sourceRecords.distinct('source'), ...fields.map(field => collections.history.distinct(field))]);
    return [...new Set(lists.flat().filter(value => typeof value === 'string' && value.trim()))].sort((a, b) => a.localeCompare(b, 'ko'));
}
module.exports = { searchHistoryRecords, listHistorySources, searchMatch };
