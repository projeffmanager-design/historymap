#!/usr/bin/env node
'use strict';

// Inserts NIKH's published Korea excerpts. Existing records are never replaced.
// node scripts/import-chinese-histories-korea.js --input=.../records.jsonl --env=.../.env [--apply]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function normalizedOriginal(value) {
    return String(value || '').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '');
}

function identity(sourceId) {
    return crypto.createHash('sha256').update(`nikh:chinese-histories-korea:${sourceId}`).digest('hex').slice(0, 24);
}

function validateRecord(record) {
    if (!/^(?:jo_\d{3}r_\d+(?:_\d+)+|ko_\d{3}_\d+_\d+)$/.test(record.source_id || '')) throw new Error('Invalid official article ID');
    if (record.source_url !== `https://db.history.go.kr/id/${record.source_id}`) throw new Error('Invalid official source URL');
    if (!record.source || !record.title || !record.original_content?.trim() || (record.content_type === 'translation' && !record.translation?.trim())) throw new Error(`Missing text: ${record.source_id}`);
    if (record.year !== null && (!Number.isInteger(record.year) || record.year === 0 || record.year < -3000 || record.year > 1912)) throw new Error(`Invalid year: ${record.source_id}`);
    if (record.year !== null && !['explicit_year_in_title', 'official_xml_date'].includes(record.date_basis)) throw new Error(`Unverified year: ${record.source_id}`);
    if (record.year === null && record.date_basis !== 'undated') throw new Error(`Invalid undated article: ${record.source_id}`);
    return record;
}

async function main() {
    const args = process.argv.slice(2);
    const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const input = option('input');
    if (!input) throw new Error('--input is required');
    const apply = args.includes('--apply');
    require('dotenv').config({ path: option('env') || '.env', quiet: true });
    const { MongoClient, ObjectId } = require('mongodb');
    const rows = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean).map(line => validateRecord(JSON.parse(line)));
    if (new Set(rows.map(row => row.source_id)).size !== rows.length) throw new Error('Duplicate article IDs in input');
    const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    try {
        await client.connect();
        const collection = client.db('realhistory').collection('source_records');
        const sources = [...new Set(rows.map(row => row.source))];
        const existing = await collection.find({ source: { $in: sources } }, { projection: { source: 1, source_id: 1, year: 1, title: 1, content: 1, original_content: 1 } }).toArray();
        const existingIds = new Set(existing.flatMap(row => [String(row._id), row.source_id].filter(Boolean)));
        const originalKeys = new Set(existing.map(row => `${row.source}|${row.year ?? 'undated'}|${normalizedOriginal(row.original_content || row.content)}`));
        const legacyKeys = new Set(existing.map(row => `${row.source}|${row.year}|${String(row.title).normalize('NFKC').replace(/\s+/g, ' ').trim()}`));
        const pending = [], skipped = [];
        for (const row of rows) {
            const id = identity(row.source_id);
            const key = `${row.source}|${row.year ?? 'undated'}|${normalizedOriginal(row.original_content)}`;
            const legacyKey = `${row.source}|${row.year}|${row.title.normalize('NFKC').replace(/\s+/g, ' ').trim()}`;
            if (existingIds.has(id) || existingIds.has(row.source_id) || originalKeys.has(key) || (row.source_id.startsWith('ko_') && legacyKeys.has(legacyKey))) {
                skipped.push(row.source_id);
                continue;
            }
            pending.push({ ...row, _id: new ObjectId(id) });
            originalKeys.add(key);
        }
        const bySource = {};
        pending.forEach(row => {
            const counts = bySource[row.source] ||= { articles: 0, dated: 0, undated: 0 };
            counts.articles++;
            counts[row.year === null ? 'undated' : 'dated']++;
        });
        const report = { mode: apply ? 'apply' : 'dry-run', input: rows.length, existing: existing.length, skipped: skipped.length, pending: pending.length, bySource };
        if (apply) {
            // Save the precise insertion plan before writing so each new record
            // can be audited or removed independently of existing research.
            const auditPath = path.join(path.dirname(input), 'insertion-plan.json');
            fs.writeFileSync(auditPath, JSON.stringify(pending.map(row => ({ _id: String(row._id), source_id: row.source_id, source: row.source, year: row.year })), null, 2));
            let inserted = 0;
            const now = new Date();
            for (let offset = 0; offset < pending.length; offset += 200) {
                const operations = pending.slice(offset, offset + 200).map(row => ({ updateOne: {
                    filter: { _id: row._id }, update: { $setOnInsert: { ...row, importedAt: now, import_method: 'nikh_published_korea_excerpts_v1' } }, upsert: true
                } }));
                const result = await collection.bulkWrite(operations, { ordered: true });
                inserted += result.upsertedCount;
            }
            report.inserted = inserted;
            const imported = await collection.find({ _id: { $in: pending.map(row => row._id) } }, { projection: { source_id: 1, year: 1, original_content: 1, translation: 1, content_type: 1 } }).toArray();
            report.verified = imported.filter(row => row.original_content?.trim() && (row.content_type !== 'translation' || row.translation?.trim())).length;
            report.dated = imported.filter(row => Number.isInteger(row.year)).length;
            report.undated = imported.filter(row => row.year === null).length;
            if (report.verified !== pending.length) throw new Error(`Insertion verification failed: ${report.verified}/${pending.length}`);
        }
        fs.writeFileSync(path.join(path.dirname(input), apply ? 'import-summary.json' : 'import-preview.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally {
        await client.close();
    }
}

module.exports = { normalizedOriginal, identity, validateRecord };
if (require.main === module) main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
