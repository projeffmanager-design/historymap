'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizedOriginal, identity, validateRecord } = require('../scripts/import-chinese-histories-korea');

const article = {
    source_id: 'jo_020r_0010_0010_0070',
    source_url: 'https://db.history.go.kr/id/jo_020r_0010_0010_0070',
    source: '금사(金史)', title: '[康宗] 2년 甲申(1104)에 高麗가 쳐들어오자,',
    original_content: '高麗來攻', translation: '고려가 쳐들어왔다.',
    content_type: 'translation', year: 1104, date_basis: 'explicit_year_in_title'
};

test('import identity remains stable across repeated collection runs', () => {
    assert.match(identity(article.source_id), /^[0-9a-f]{24}$/);
    assert.equal(identity(article.source_id), identity(article.source_id));
    assert.notEqual(identity(article.source_id), identity('ko_019_0010_0010'));
    assert.equal(normalizedOriginal('○ 高麗，來攻。'), normalizedOriginal('高麗 來攻'));
});

test('published translation and original records retain auditable official provenance', () => {
    assert.equal(validateRecord(article), article);
    const original = { ...article, source_id: 'ko_019_0010_0010', source_url: 'https://db.history.go.kr/id/ko_019_0010_0010', translation: undefined, content_type: 'chinese_original', date_basis: 'official_xml_date' };
    assert.equal(validateRecord(original), original);
    assert.throws(() => validateRecord({ ...article, source_url: 'https://example.com' }), /source URL/);
    assert.throws(() => validateRecord({ ...article, translation: '' }), /Missing text/);
});

test('undated articles never acquire a fabricated year', () => {
    assert.equal(validateRecord({ ...article, year: null, date_basis: 'undated' }).year, null);
    for (const year of [0, 9999, '1104']) assert.throws(() => validateRecord({ ...article, year }), /Invalid year/);
    assert.throws(() => validateRecord({ ...article, date_basis: 'guess' }), /Unverified year/);
});
