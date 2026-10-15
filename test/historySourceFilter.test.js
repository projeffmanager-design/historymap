'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require.resolve('../public/assets/map/map-core.js'), 'utf8');
const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');

function code(name, next) {
    const start = script.indexOf(`    async function ${name}(`);
    const end = script.indexOf(`    ${next}`, start);
    assert.ok(start >= 0 && end > start);
    return script.slice(start, end);
}

function listHandler(collection) {
    const routes = new Map();
    const context = vm.createContext({ app:{ get:(route, handler) => routes.set(route, handler) }, collections:{ sourceRecords:collection }, console });
    const start = server.indexOf("        app.get('/api/source-records',");
    const end = server.indexOf('        // GET: source_records의 연도 목록', start);
    vm.runInContext(server.slice(start, end), context);
    return routes;
}

test('book listing uses exact source identity and paginates all years without changing the legacy response', async () => {
    let query, projection, sort, offset, limit;
    const cursor = {
        sort(value) { sort = value; return this; }, skip(value) { offset = value; return this; }, limit(value) { limit = value; return this; },
        async toArray() { return Array.from({ length:11 }, (_, index) => ({ _id:String(index + 50), source:'원사(元史)', year:1293 + index })); }
    };
    const routes = listHandler({ find(q, options) { query = q; projection = options; return cursor; }, countDocuments:async () => 61 });
    let payload;
    const response = { set() {}, json(value) { payload = value; }, status() { throw new Error('API failed'); } };
    await routes.get('/api/source-records')({ query:{ sourceExact:'원사(元史)', source:'신원사', summary:'1', withTotal:'1', offset:'50', limit:'50' } }, response);
    assert.equal(query.source, '원사(元史)');
    assert.equal('year' in query, false);
    assert.deepEqual(JSON.parse(JSON.stringify(sort)), { year:1, month:1, _id:1 });
    assert.equal(projection.projection.content, undefined);
    assert.equal(offset, 50);
    assert.equal(limit, 50);
    assert.equal(payload.total, 61);
    assert.equal(payload.records.length, 11);
    await routes.get('/api/source-records')({ query:{ year:'1270' } }, response);
    assert.equal(query.year, 1270);
    assert.ok(Array.isArray(payload));
});

test('within-book keyword search and undated filter stay intersected and escape literal regex characters', async () => {
    let query;
    const cursor = { sort() { return this; }, skip() { return this; }, limit() { return this; }, async toArray() { return []; } };
    const routes = listHandler({ find(value) { query = value; return cursor; }, countDocuments:async () => 0 });
    await routes.get('/api/source-records')({ query:{ sourceExact:'원사(元史)', undated:'1', q:' [王].* ', withTotal:'1' } }, { set() {}, json() {}, status() { throw new Error('API failed'); } });
    assert.equal(query.source, '원사(元史)');
    assert.equal(query.year, null);
    assert.equal(query.$or[0].title.$regex, '\\[王\\]\\.\\*');
    assert.equal(query.$or[1].content.$regex, '\\[王\\]\\.\\*');
});

test('source options are based on all registered books instead of the current year', async () => {
    let pipeline, payload;
    const routes = listHandler({ aggregate(value) { pipeline = value; return { toArray:async () => [{ source:'원사(元史)', count:61 }] }; } });
    await routes.get('/api/source-records/sources')({}, { set() {}, json(value) { payload = value; }, status() { throw new Error('API failed'); } });
    assert.equal(pipeline[0].$match.source.$type, 'string');
    assert.equal(pipeline[1].$group._id, '$source');
    assert.equal('year' in pipeline[0].$match, false);
    assert.equal(payload[0].count, 61);
});

function pageContext(fetch) {
    const controls = {
        'map-history-source-select':{ value:'원사(元史)' },
        'map-history-search-input':{ value:'' },
        'map-history-search-status':{}, 'map-all-records-content':{}, 'map-history-year-title':{}
    };
    const rendered = [];
    const context = vm.createContext({
        document:{ getElementById:id => controls[id] || null }, URLSearchParams, AbortController, fetch,
        _historyPanelSearchSequence:0, _historyPanelSearchAbort:null, _historyPanelUndatedActive:false,
        _renderHistoryPanelSearchResults:(...args) => rendered.push(args)
    });
    vm.runInContext(code('_loadHistoryPanelSourcePage', 'async function _fetchHistoryPanelSourceRecords'), context);
    return { context, controls, rendered };
}

test('client book requests omit the map year, use lightweight pages, and retain search and undated choices', async () => {
    let params;
    const { context, controls, rendered } = pageContext(async url => {
        params = new URL(url, 'http://localhost').searchParams;
        return { ok:true, json:async () => ({ records:[{ _id:'yuan', source:'원사(元史)', year:null }], total:1, offset:0, limit:50 }) };
    });
    controls['map-history-search-input'].value = '탐라';
    context._historyPanelUndatedActive = true;
    await context._loadHistoryPanelSourcePage();
    assert.equal(params.get('sourceExact'), '원사(元史)');
    assert.equal(params.get('q'), '탐라');
    assert.equal(params.get('undated'), '1');
    assert.equal(params.get('limit'), '50');
    assert.equal(params.get('summary'), '1');
    assert.equal(params.has('year'), false);
    assert.equal(rendered[0][1][0].type, 'source');
    assert.equal(rendered[0][2].total, 1);
});

test('switching books quickly cannot display the earlier book response', async () => {
    const waiting = [];
    const { context, controls, rendered } = pageContext(url => new Promise(resolve => waiting.push({ url, resolve })));
    const first = context._loadHistoryPanelSourcePage();
    controls['map-history-source-select'].value = '고려사(高麗史)';
    const second = context._loadHistoryPanelSourcePage(50);
    waiting[1].resolve({ ok:true, json:async () => ({ records:[], total:100, offset:50, limit:50 }) });
    await second;
    waiting[0].resolve({ ok:true, json:async () => ({ records:[], total:61, offset:0, limit:50 }) });
    await first;
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0][0], '고려사(高麗史)');
    assert.equal(rendered[0][2].offset, 50);
});

test('all-source selection restores current-year behavior instead of continuing a book request', async () => {
    let restored = 0;
    const controls = { 'map-history-source-select':{ value:'' }, 'map-history-search-input':{ value:'' }, 'map-history-undated-btn':{ setAttribute() {} } };
    const context = vm.createContext({
        document:{ getElementById:id => controls[id] || null },
        _historyPanelSearchSequence:0, _historyPanelSearchAbort:null,
        _restoreHistoryPanelYear:() => restored++,
        _loadHistoryPanelSourcePage:() => assert.fail('must restore the default view')
    });
    vm.runInContext(code('_runHistoryPanelSearch', 'async function _loadHistoryPanelUndatedRecords'), context);
    await context._runHistoryPanelSearch();
    assert.equal(restored, 1);
});
