'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require.resolve('../public/assets/map/map-core.js'), 'utf8');
const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');

function functionCode(name, nextName) {
    const start = script.indexOf(`    function ${name}(`);
    const asyncStart = script.indexOf(`    async function ${name}(`);
    const from = start < 0 ? asyncStart : start;
    const end = script.indexOf(`    ${nextName}`, from);
    assert.ok(from >= 0 && end > from);
    return script.slice(from, end);
}

const fetchCode = functionCode('_fetchHistoryPanelSourceRecords', 'async function updateHistoryPanel');
const classifyCode = functionCode('_isChineseDynasticSource', 'function _renderHistoryPanel');

test('Chinese histories accept Korean, traditional, simplified and chapter-qualified source names', () => {
    const context = vm.createContext({});
    vm.runInContext(classifyCode, context);
    for (const source of ['사기(史記)', '진서(陳書/陳)', '《舊唐書》 卷一', '旧唐书', '한서 권28', '신원사(新元史)', '청사고(清史稿)']) {
        assert.equal(context._isChineseDynasticSource(source), true, source);
    }
    for (const source of ['삼국사기(三國史記)', '고려사(高麗史)', '자치통감(資治通鑑)', '사기꾼', '', null]) {
        assert.equal(context._isChineseDynasticSource(source), false, String(source));
    }
});

test('year panel retrieves Chinese records beyond the first API page', async () => {
    const records = Array.from({ length: 612 }, (_, i) => ({ _id: String(i), year: 1080, source: i < 600 ? '고려사(高麗史)' : '송사(宋史)' }));
    const requests = [];
    const signal = new AbortController().signal;
    const context = vm.createContext({ Date, Error, fetch: async (url, options) => {
        const params = new URL(url, 'http://localhost').searchParams;
        requests.push(Number(params.get('offset')));
        assert.equal(params.get('year'), '1080');
        assert.equal(options.signal, signal);
        const offset = Number(params.get('offset'));
        return { ok: true, json: async () => records.slice(offset, offset + Number(params.get('limit'))) };
    } });
    vm.runInContext(fetchCode, context);
    const result = await context._fetchHistoryPanelSourceRecords(1080, signal);
    assert.deepEqual(requests, [0, 500]);
    assert.equal(result.length, 612);
    assert.equal(result.at(-1).source, '송사(宋史)');
    assert.equal(new Set(result.map(record => record._id)).size, 612);
});

test('failed or cancelled later pages reject instead of caching incomplete records', async () => {
    for (const cancelled of [false, true]) {
        let calls = 0;
        const context = vm.createContext({ Date, Error, fetch: async () => {
            if (calls++ === 0) return { ok: true, json: async () => Array(500).fill({ _id: 'record' }) };
            if (cancelled) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
            return { ok: false };
        } });
        vm.runInContext(fetchCode, context);
        await assert.rejects(context._fetchHistoryPanelSourceRecords(1080), cancelled ? { name: 'AbortError' } : /원전 사료 조회 실패/);
    }
});

test('undated browsing omits year filtering and retrieves lightweight source summaries', async () => {
    const context = vm.createContext({ Date, Error, fetch: async url => {
        const params = new URL(url, 'http://localhost').searchParams;
        assert.equal(params.has('year'), false);
        assert.equal(params.get('undated'), '1');
        assert.equal(params.get('summary'), '1');
        return { ok:true, json:async () => [{ _id:'unknown-date', year:null }] };
    } });
    vm.runInContext(fetchCode, context);
    const result = await context._fetchHistoryPanelSourceRecords(null, undefined, { undated:true });
    assert.equal(result[0].year, null);
});

test('opening an undated search detail keeps the map date and displays no fabricated January', async () => {
    const time = { textContent:'' };
    const body = { innerHTML:'' };
    const close = { addEventListener() {}, focus() {} };
    const detail = { innerHTML:'', querySelector:selector => ({ time, '.history-panel-search-detail-body':body, '.history-detail-close':close }[selector] || null), scrollIntoView() {} };
    const context = vm.createContext({
        document: { createElement:() => detail },
        window: { goToHistoricalTime:() => assert.fail('must not navigate to year zero') },
        fetch:async () => ({ ok:true, json:async () => ({ title:'풍속 기사', source:'삼국지(三國志)', year:null, month:null, content:'본문' }) }),
        _escapeHistoryInline:value => value, _historyRichContent:value => value,
        canAdminEditHistoryRecords:() => false, _historyVideoMarkup:() => ''
    });
    vm.runInContext(functionCode('_showHistoryPanelSearchDetail', 'async function _runHistoryPanelSearch'), context);
    await context._showHistoryPanelSearchDetail({ _id:'undated', type:'source', year:null, month:null }, { querySelector:() => detail, classList:{ contains:() => false } });
    assert.equal(time.textContent, '연도 미상');
    assert.doesNotMatch(time.textContent, /0년|1월|NaN/);
});

test('source API applies pagination with a stable tie-breaker for records in the same month', async () => {
    const start = server.indexOf("        app.get('/api/source-records',");
    const end = server.indexOf('        // GET: 실제 등록된 사서 목록', start);
    const calls = {};
    const cursor = {
        sort(value) { calls.sort = value; return this; },
        skip(value) { calls.skip = value; return this; },
        limit(value) { calls.limit = value; return this; },
        async toArray() { return [{ _id: 'next-page', source: '송사(宋史)' }]; }
    };
    let handler;
    const context = vm.createContext({
        app: { get(_route, callback) { handler = callback; } },
        collections: { sourceRecords: { find(query) { calls.query = query; return cursor; } } },
        console
    });
    vm.runInContext(server.slice(start, end), context);
    let payload;
    await handler({ query: { year: '1080', limit: '500', offset: '500' } }, {
        set() {}, json(value) { payload = value; }, status() { throw new Error('unexpected API failure'); }
    });
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), { query: { year: 1080 }, sort: { year: 1, month: 1, _id: 1 }, skip: 500, limit: 500 });
    assert.equal(payload[0]._id, 'next-page');
});

test('history panel displays Chinese histories separately while preserving source cards and comments', () => {
    const content = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
    const context = vm.createContext({
        document: { getElementById: id => id === 'map-all-records-content' ? content : null },
        _historyPanelUndatedActive: false,
        _sortHistoryPanelRecords: records => records,
        _escapeHistoryInline: value => String(value),
        _historyEntityLinks: value => value,
        _historyRichContent: value => value,
        _historyVideoMarkup: () => '',
        canAdminEditHistoryRecords: () => false,
        _loadHistoryCommentCounts: () => {},
        _focusRequestedHistoryRecord: () => {},
        _renderHistoryPlaceBacklinks: () => {},
        updateHistoryCaption: () => {}
    });
    vm.runInContext(classifyCode + functionCode('_renderHistoryPanel', 'function _historyCommentEscape'), context);
    context._renderHistoryPanel(1080, [], [
        { _id: 'korean', source: '고려사(高麗史)', title: '고려 기록', content: '한국어 본문' },
        { _id: 'chinese', source: '宋史', title: '송 기록', content: '漢文', content_type: 'chinese_original' }
    ]);
    const sections = content.innerHTML.split('<section class="history-section">');
    assert.equal(sections.length, 3);
    assert.match(sections[1], /📖 원전 사료/);
    assert.match(sections[1], /고려 기록/);
    assert.doesNotMatch(sections[1], /송 기록/);
    assert.match(sections[2], /📚 중국 25사 · 1건/);
    assert.match(sections[2], /송 기록/);
    assert.match(sections[2], /is-original/);
    assert.match(sections[2], /data-record-type="source" data-record-id="chinese"/);
});
