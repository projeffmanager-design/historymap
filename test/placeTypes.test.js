'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DOMParser } = require('@xmldom/xmldom');
const source = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'), 'utf8');
const between = (start, end) => { const a = source.indexOf(start), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a); return source.slice(a, b); };
function renderHistory(type, extra = {}) {
    const row = { style: {}, dataset: {}, querySelector: () => null };
    const context = vm.createContext({
        countries: [], document: { createElement: () => row, getElementById: () => ({ appendChild() {} }) },
        setTimeout() {}, renderCastleHistoryLinkedRecords() {}, rebuildCastleHistoryGapButtons() {}
    });
    vm.runInContext(between('    function _escapeHistoryInline(', '    function _historyVideoMarkup('), context);
    vm.runInContext(between('    function addCastleHistoryRow(', '    function _castleHistoryRowTime('), context);
    context.addCastleHistoryRow({ name: '기존 장소', country: '고려', start_year: 937, end_year: 1270, place_type: type, ...extra });
    const select = row.innerHTML.match(/<select class="history-place-type"[^>]*>[\s\S]*?<\/select>/)?.[0];
    assert.ok(select);
    const doc = new DOMParser().parseFromString(select.replace(/\sselected(?=[\s>])/g, ' selected="selected"'), 'text/xml');
    return Array.from(doc.getElementsByTagName('option'), option => ({ value: option.getAttribute('value'), selected: option.hasAttribute('selected'), label: option.textContent }));
}

test('existing 京, 府 and 牧 history rows reopen with the saved selection and all three choices', () => {
    for (const [type, label] of [['gyeong', '경(京)'], ['bu', '부(府)'], ['mok', '목(牧)']]) {
        const options = renderHistory(type);
        assert.deepEqual(options.filter(option => option.selected).map(option => option.value), [type]);
        assert.equal(options.find(option => option.value === type).label, label);
        for (const value of ['gyeong', 'bu', 'mok']) assert.ok(options.find(option => option.value === value));
    }
});

test('opening every stored place type retains its selection for saving', () => {
    const data = JSON.parse(fs.readFileSync(require.resolve('../public/castles.json'), 'utf8'));
    const types = new Set(data.flatMap(item => [item.place_type, ...(item.history || []).map(record => record.place_type)]).filter(Boolean));
    for (const type of types) {
        const options = renderHistory(type);
        assert.deepEqual(options.filter(option => option.selected).map(option => option.value), [type], type);
    }
});

test('unregistered saved types are retained safely instead of defaulting to normal', () => {
    for (const type of ['do', 'legacy-type', '\"><script>bad</script>']) {
        const options = renderHistory(type);
        assert.deepEqual(options.filter(option => option.selected).map(option => option.value), [type]);
        assert.ok(options.find(option => option.value === type).label.includes('기존 유형'));
    }
});

test('capital and gateway history flags retain their existing option selection', () => {
    assert.ok(renderHistory(undefined, { is_capital: true }).some(option => option.value === 'capital' && option.selected));
    assert.ok(renderHistory(undefined, { is_gateway: true }).some(option => option.value === 'gateway' && option.selected));
});

test('2D, 3D and mobile render 京 府 牧 with matching glyphs', () => {
    const context = vm.createContext({});
    const config2d = between('        const PLACE_TYPE_CONFIG = {', '        // ── 4a.');
    const config3d = between('                const PLACE_TYPE_CONFIG_3D = {', '                const nameStyle3d');
    vm.runInContext(config2d + config3d + 'globalThis.config2d = PLACE_TYPE_CONFIG; globalThis.config3d = PLACE_TYPE_CONFIG_3D;', context);
    const mobile = between('                const _mobileSymbolFeature = ', '                // ── diff를 위한');
    vm.runInContext(mobile + 'globalThis.mobile = _mobileSymbolFeature;', context);
    for (const [type, glyph] of [['gyeong', '京'], ['bu', '府'], ['mok', '牧']]) {
        assert.equal(context.config2d[type].hanja, glyph); assert.equal(context.config3d[type].hanja, glyph);
        assert.equal(context.mobile({ _id: 'test', lat: 35, lng: 127, place_type: type }, null, null).properties.glyph, glyph);
        assert.equal(context.mobile({ _id: 'test', lat: 35, lng: 127 }, { place_type: type }, null).properties.glyph, glyph);
    }
});

test('administrative seats remain visible like 州 and do not become royal capitals', () => {
    const context = vm.createContext({});
    vm.runInContext(between('            function getMarkerPriority(', '            function _refreshLayersInner('), context);
    for (const type of ['gyeong', 'bu', 'mok']) {
        assert.equal(context.getMarkerPriority({ place_type: type }), 3);
        assert.equal(context.getMarkerMinEffectiveZoom({ place_type: type }), 5);
        assert.equal(context.getMarkerPriority({ place_type: 'capital', is_capital: true }, { place_type: type }), 3);
    }
    assert.equal(context.getMarkerPriority({ place_type: 'capital' }), 1);
});


test('administrative seals are larger than ordinary city seals in both map renderers', () => {
    const context = vm.createContext({});
    vm.runInContext(between('        const PLACE_TYPE_CONFIG = {', '        // ── 4a.')
        + between('                const PLACE_TYPE_CONFIG_3D = {', '                const nameStyle3d')
        + 'globalThis.two = PLACE_TYPE_CONFIG; globalThis.three = PLACE_TYPE_CONFIG_3D;', context);
    for (const type of ['gyeong', 'bu', 'mok']) {
        assert.ok(context.two[type].size > context.two.seong.size);
        assert.ok(context.three[type].size > context.three.seong.size);
        assert.equal(context.two[type].size, context.three[type].size);
    }
});

test('mobile keeps administrative seals in the same full seal renderer as desktop', () => {
    const context = vm.createContext({ _useMobileSymbols: true });
    vm.runInContext(between('                const _isMobileSimpleMarker = ', '                const _mobileSymbolFeature = ')
        + 'globalThis.isSimple = _isMobileSimpleMarker;', context);
    for (const type of ['gyeong', 'bu', 'mok']) {
        assert.equal(context.isSimple({ place_type: type }, null), false);
        assert.equal(context.isSimple({ place_type: 'seong' }, { place_type: type }), false);
    }
    assert.equal(context.isSimple({ place_type: 'seong' }, null), true);
});

test('changing only the history place type invalidates a retained 3D marker', () => {
    const context = vm.createContext({});
    vm.runInContext(between('            function getMarkerPriority(', '            function _refreshLayersInner('), context);
    const castle = { _id: 'same-id', name: '같은 이름', place_type: 'normal' };
    const country = { name: '고려', color: '#f00' };
    const key = type => context.get3dCastleMarkerKey(castle, { name: '같은 이름', place_type: type }, country);
    assert.equal(new Set(['normal', 'bu', 'mok', 'gyeong'].map(key)).size, 4);
    assert.equal(key('mok'), key('mok'));
    assert.equal((source.match(/= get3dCastleMarkerKey\(c, activeRec, ci\);/g) || []).length, 3);
});
