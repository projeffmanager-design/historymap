'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...index.matchAll(/<script[^>]+src="([^"?]+)(?:\?[^\"]*)?"/g)].map(match => match[1]);
const loaded = suffix => fs.readFileSync(path.join(root, scripts.find(src => src.endsWith(suffix))), 'utf8');
const mapScript = scripts.filter(src => src.includes('/generated/')).map(src => fs.readFileSync(path.join(root, src), 'utf8'))
    .find(script => script.includes('function _renderHistoryPanel('));
const { fixture } = require('./helpers/translationFixture');

function articleContext() {
    const container = { innerHTML:'', querySelectorAll:() => [], querySelector:() => null };
    const context = vm.createContext({
        document:{ addEventListener() {}, getElementById:id => id === 'map-all-records-content' ? container : null },
        addEventListener() {}, URLSearchParams, console,
        fetch:async () => ({ ok:true, json:async () => ({ counts:{} }) }),
        _escapeHistoryInline:String, _historyEntityLinks:String, _historyRichContent:String, _historyVideoMarkup:() => '',
        canAdminEditHistoryRecords:() => false, updateHistoryCaption() {}, _loadHistoryCommentCounts() {},
        _focusRequestedHistoryRecord() {}, _renderHistoryPlaceBacklinks() {}
    });
    context.window = context;
    vm.runInContext(loaded('/history-translations.js'), context);
    return { context, container };
}

test('the scripts loaded by index render translation controls for both record types', () => {
    assert.ok(scripts.indexOf('/public/assets/history-translations.js') < scripts.findIndex(src => src.includes('map-scripts.2b9385b0203b')));
    const { context, container } = articleContext();
    const f = fixture();
    vm.runInContext(mapScript.slice(mapScript.indexOf('    function _renderHistoryPanel('), mapScript.indexOf('    function _historyCommentEscape(')), context);
    context._renderHistoryPanel(1284, f.data.history, f.data.sourceRecords);
    assert.equal((container.innerHTML.match(/class="history-translation-toggle"/g) || []).length, 2);
    assert.ok(container.innerHTML.includes(`data-target-type="source" data-target-id="${f.ids.source}"`));
    assert.ok(container.innerHTML.includes(`data-target-type="history" data-target-id="${f.ids.history}"`));
    assert.ok(container.innerHTML.includes(`data-record-id="${f.ids.source}"`));
    assert.ok(container.innerHTML.includes(f.data.sourceRecords[0].content));
});

test('search detail uses the same translation controls as the year panel', async () => {
    const { context } = articleContext();
    const f = fixture();
    const detail = { innerHTML:'', querySelector:() => null, querySelectorAll:() => [], scrollIntoView() {} };
    const wrap = { querySelector:() => detail };
    context.fetch = async () => ({ ok:true, json:async () => f.data.sourceRecords[0] });
    vm.runInContext(mapScript.slice(mapScript.indexOf('    async function _showHistoryPanelSearchDetail('), mapScript.indexOf('    async function _runHistoryPanelSearch(')), context);
    await context._showHistoryPanelSearchDetail({ ...f.data.sourceRecords[0], type:'source' }, wrap);
    assert.ok(detail.innerHTML.includes('class="history-translation-toggle"'));
    assert.ok(detail.innerHTML.includes(`data-target-id="${f.ids.source}"`));
});

test('registered API handlers submit and list proposals using the translation service', async () => {
    const f = fixture();
    const routes = new Map();
    const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    const context = vm.createContext({
        app:Object.fromEntries(['get', 'post', 'put'].map(method => [method, (url, ...handlers) => routes.set(`${method} ${url}`, handlers.at(-1))])),
        verifyToken() {}, createTranslationService:() => f.service, TRANSLATION_CATEGORY:'history_translation',
        collections:f.collections, toObjectId:value => /^[0-9a-f]{24}$/.test(value) ? value : null,
        getMongoClient() {}, RANK_CONFIG:f.ranks, invalidateTranslationRankings() {}
    });
    const start = server.indexOf('        const translationService = createTranslationService(');
    vm.runInContext(server.slice(start, server.indexOf('        // GET: 연도 범위로 사료 기록 조회', start)), context);
    const response = () => ({ statusCode:200, status(code) { this.statusCode = code; return this; }, set() {}, json(body) { this.body = body; return this; } });
    const saved = response();
    await routes.get('post /api/translation-proposals')({ user:f.auth('writer'), body:f.input }, saved);
    assert.equal(saved.statusCode, 201);
    const listed = response();
    await routes.get('get /api/translation-proposals')({ query:{ targetType:'source', targetId:f.ids.source } }, listed);
    assert.equal(listed.body.total, 1);
    assert.equal(listed.body.pending, 1);
    assert.equal(listed.body.proposals[0].content, f.input.content);
    const invalid = response();
    await routes.get('get /api/translation-proposals')({ query:{ targetType:'users', targetId:f.ids.source } }, invalid);
    assert.equal(invalid.statusCode, 400);
});
