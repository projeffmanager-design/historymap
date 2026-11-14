'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { searchMatch, searchHistoryRecords, listHistorySources } = require('../lib/historySearch');
const source = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'), 'utf8');
function section(start, end) { const a = source.indexOf(start), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a); return source.slice(a, b); }
const helpers = section('    function _historyRecordYear(', '    function _restoreHistoryPanelYear(');
const runner = section('    async function _runHistoryPanelSearch(', "    ['map-history-source-filter', 'map-history-undated-filter']");
function fixture() {
    const elements = {
        'map-history-search-input': { value: '' }, 'map-history-source-filter': { value: '' },
        'map-history-undated-filter': { checked: false }, 'map-history-search-clear': {},
        'map-history-search-status': {}, 'map-all-records-content': {}
    };
    const requests = [], renders = [];
    let restores = 0;
    const context = vm.createContext({
        document: { getElementById: id => elements[id] || null }, URLSearchParams, AbortController,
        _historyPanelSearchSequence: 0, _historyPanelSearchDetailSequence: 0, _historyPanelSearchOffset: 0,
        _historyPanelSearchCache: new Map(), _historyPanelSearchAbort: null,
        _restoreHistoryPanelYear: () => restores++, _renderHistoryPanelSearchResults: (...args) => renders.push(args),
        fetch: async url => { requests.push(url); return { ok: true, json: async () => ({ records: [{ _id: 'one', year: null }], total: 2281, offset: 0, hasMore: true }) }; }
    });
    vm.runInContext(helpers + runner, context);
    return { context, elements, requests, renders, restores: () => restores };
}

test('missing and invalid years remain undated, while zero and BCE years remain numeric', () => {
    const { context } = fixture();
    for (const value of [null, undefined, '', '  ', '미상', NaN]) assert.equal(context._historyRecordYear(value), null);
    for (const value of [0, -108, 1392, '918']) assert.equal(context._historyRecordYear(value), Number(value));
});

test('undated and source filters work with an empty keyword and paginate beyond 100 records', async () => {
    const f = fixture();
    f.elements['map-history-undated-filter'].checked = true;
    f.elements['map-history-source-filter'].value = '사기(史記)';
    await f.context._runHistoryPanelSearch(100);
    const params = new URL(f.requests[0], 'http://local').searchParams;
    assert.equal(params.get('q'), ''); assert.equal(params.get('undated'), '1');
    assert.equal(params.get('source'), '사기(史記)'); assert.equal(params.get('offset'), '100');
    assert.equal(f.renders[0][2].total, 2281);
    assert.equal(f.restores(), 0);
    assert.equal(f.context._historyPanelSearchOffset, 100);
});

test('filter combinations use separate caches; clearing filters restores the current year', async () => {
    const f = fixture();
    f.elements['map-history-search-input'].value = '황제';
    await f.context._runHistoryPanelSearch();
    f.elements['map-history-undated-filter'].checked = true;
    await f.context._runHistoryPanelSearch();
    f.elements['map-history-source-filter'].value = '사기(史記)';
    await f.context._runHistoryPanelSearch();
    assert.equal(f.requests.length, 3);
    await f.context._runHistoryPanelSearch();
    assert.equal(f.requests.length, 3);
    f.elements['map-history-search-input'].value = '';
    f.elements['map-history-source-filter'].value = '';
    f.elements['map-history-undated-filter'].checked = false;
    await f.context._runHistoryPanelSearch();
    assert.equal(f.restores(), 1);
});

test('saving invalidates old results and reloads the current undated page', async () => {
    const f = fixture();
    f.elements['map-history-undated-filter'].checked = true;
    await f.context._runHistoryPanelSearch(100);
    await f.context._refreshHistoryPanelSearchAfterSave();
    assert.equal(f.requests.length, 2);
    assert.equal(new URL(f.requests[1], 'http://local').searchParams.get('offset'), '100');
});

test('late search responses cannot replace a changed source filter', async () => {
    const f = fixture(); let finish;
    f.context.fetch = () => new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => ({ records: [], total: 0 }) }); });
    f.elements['map-history-undated-filter'].checked = true;
    const pending = f.context._runHistoryPanelSearch();
    f.elements['map-history-source-filter'].value = '한서(漢書)';
    finish(); await pending;
    assert.equal(f.renders.length, 0);
});

test('an undated detail keeps the timeline and offers the existing exact-record editor', async () => {
    const f = fixture(), jumps = [], edits = [];
    const button = { addEventListener(_event, fn) { this.click = fn; } };
    const detail = { innerHTML: '', querySelector: selector => selector === '.history-search-detail-edit' ? button : null, scrollIntoView() {} };
    const item = { _id: 'undated-id', title: '사료 제목', source: '사기(史記)', year: null, content: '원문' };
    Object.assign(f.context, { window: { goToHistoricalTime: (...args) => jumps.push(args) },
        fetch: async () => ({ ok: true, json: async () => item }), canAdminEditHistoryRecords: () => true,
        _escapeHistoryInline: String, _historyRichContent: String, _historyVideoMarkup: () => '',
        openSourceRecordEditor: record => edits.push(record) });
    vm.runInContext(section('    async function _showHistoryPanelSearchDetail(', '    async function _runHistoryPanelSearch('), f.context);
    await f.context._showHistoryPanelSearchDetail({ ...item, type: 'source' }, { querySelector: () => detail });
    assert.deepEqual(jumps, []);
    assert.match(detail.innerHTML, /연도 미지정/);
    assert.doesNotMatch(detail.innerHTML, /NaN|기원전 0년/);
    button.click({ stopPropagation() {} });
    assert.equal(edits[0], item);
});

test('literal source and keyword constraints are combined with the missing-year predicate', () => {
    const match = searchMatch({ q: '[황제].*', source: '사기(史記)', undated: '1' }, 'source');
    assert.equal(match.$and[0].$or[0].title.$regex, '\\[황제\\]\\.\\*');
    assert.deepEqual(match.$and[1], { $or: [{ source: '사기(史記)' }] });
    assert.equal(match.$and[2].$expr.$eq[0].$convert.onNull, null);
    assert.ok(!JSON.stringify(match).includes('"year":0'));
});

test('database pagination counts all matches and omits large original texts from summaries', async () => {
    let stages;
    const collections = { history: { collectionName: 'history' }, sourceRecords: { aggregate(pipeline) {
        stages = pipeline; return { toArray: async () => [{ records: [{ _id: 'one', year: null }], count: [{ total: 2281 }] }] };
    } } };
    const page = await searchHistoryRecords(collections, { undated: '1', offset: '200', limit: '100' });
    assert.equal(page.total, 2281); assert.equal(page.hasMore, true); assert.equal(page.offset, 200);
    assert.equal(stages.at(-1).$facet.records[0].$skip, 200);
    assert.equal(stages[1].$project.content, undefined);
    assert.equal(stages[2].$unionWith.coll, 'history');
});

test('source choices include research citations, deduplicate and retain exact source names', async () => {
    const values = await listHistorySources({ sourceRecords: { distinct: async () => ['사기(史記)', null, ''] },
        history: { distinct: async field => field.includes('korean') ? ['사기(史記)', '삼국사기'] : [] } });
    assert.deepEqual(values.sort(), ['사기(史記)', '삼국사기'].sort());
});


test('timeline refreshes do not replace an undated list when the keyword is empty', () => {
    const f = fixture(); let captions = 0;
    f.elements['map-history-undated-filter'].checked = true;
    f.elements['map-all-records-content'].innerHTML = '미지정 검색 결과';
    f.context.updateHistoryCaption = () => captions++;
    vm.runInContext(section('    function _renderHistoryPanel(', '    function _historyCommentEscape('), f.context);
    f.context._renderHistoryPanel(918, [], []);
    assert.equal(f.elements['map-all-records-content'].innerHTML, '미지정 검색 결과');
    assert.equal(captions, 1);
});

test('entering a year updates the existing source record and refreshes the undated queue', async () => {
    const start = source.indexOf("        form.addEventListener('submit', async event => {", source.indexOf('window.openSourceRecordEditor ='));
    const end = source.indexOf('        form.elements.title?.focus();', start);
    const code = source.slice(start, end);
    const calls = [], fields = new Map(Object.entries({ year: '', month: '1', source: '사기(史記)', title: '원래 제목', content_type: 'chinese_original', content: '원문 그대로' }));
    let submit;
    const context = vm.createContext({
        form: { addEventListener: (_name, fn) => { submit = fn; }, querySelector: () => ({}) },
        FormData: class { get(key) { return fields.get(key) || ''; } }, record: { _id: 'original-id', year: null },
        serializeSourceMentions: value => value, sourceLinkExclusions: new Set(['place:kept']),
        API_BASE_URL: '/api', token: 'test-only', window: {}, _historyPanelCache: new Map(), yearInput: { value: '400' },
        updateTime: (...args) => calls.push({ time: args }), layerVisibility: { historyPanel: true },
        _refreshHistoryPanelSearchAfterSave: async () => calls.push('refresh'), close: () => calls.push('close'),
        alert: message => calls.push({ alert: message }), showToast() {},
        fetch: async (url, options) => { calls.push({ url, method: options.method, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({}) }; }
    });
    vm.runInContext(code, context);
    await submit({ preventDefault() {} });
    assert.equal(calls.filter(call => call.url).length, 0); // A blank date must never become year zero.
    fields.set('year', '-108');
    await submit({ preventDefault() {} });
    const saved = calls.find(call => call.url);
    assert.equal(saved.url, '/api/source-records/original-id');
    assert.equal(saved.method, 'PUT'); assert.equal(saved.body.year, -108);
    assert.equal(saved.body.title, '원래 제목'); assert.equal(saved.body.content, '원문 그대로');
    assert.deepEqual(saved.body.link_exclusions, ['place:kept']);
    assert.ok(calls.includes('refresh'));
});
