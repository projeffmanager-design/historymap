'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const mapScript = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.f8beb53dd7ab.js'), 'utf8');
const territoryEditorScript = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.844fdec57596.js'), 'utf8');
const start = mapScript.indexOf('    const mobileFirstPaint =');
const end = mapScript.indexOf('    const mobileOptionalLoads =', start);
assert.ok(start >= 0 && end > start);

test('mobile eclipse data waits for explicit layer activation', async () => {
    const script = fs.readFileSync(require.resolve('../public/assets/eclipse-layer.js'), 'utf8');
    let onReady;
    let fetchCount = 0;
    const controls = {
        'menu-layer-eclipse': { checked: true, addEventListener() {}, toggleAttribute() {} },
        'mobile-layer-eclipse': { checked: false, addEventListener() {} },
        yearInput: { value: '981' },
        monthInput: { value: '1' }
    };
    const context = {
        window: { innerWidth: 390, innerHeight: 844, mlMap3d: null },
        document: {
            body: { classList: { contains: () => false } },
            getElementById: id => controls[id] || null,
            addEventListener: (_event, handler) => { onReady = handler; }
        },
        fetch: async () => { fetchCount++; return { ok: true, json: async () => ({ features: [], events: [], historical_records: [] }) }; },
        AbortController,
        setTimeout: () => 1,
        clearTimeout,
        console
    };
    vm.createContext(context);
    vm.runInContext(script, context);
    onReady();
    assert.equal(fetchCount, 0);
    assert.equal(controls['mobile-layer-eclipse'].checked, false);
    context.window.eclipseLayer.setEnabled(true);
    await Promise.resolve();
    assert.equal(fetchCount > 0, true);
});

test('mobile first paint enables exactly the five basic map layers', () => {
    const context = {
        window: { innerWidth: 390, innerHeight: 844 },
        layerVisibility: {
            city: true, placeLabel: true, countryLabel: true, territoryPolygon: true,
            military: true, activityFeed: true, natural: true, historyPanel: true,
            get label() { return this.placeLabel; },
            set label(value) { this.placeLabel = value; }
        }
    };
    vm.createContext(context);
    vm.runInContext(mapScript.slice(start, end) + '\nthis.result = applyMobileFirstPaintLayers({ city:true, nationalPower:true, label:false });', context);
    const result = context.result;
    assert.equal(result.city, true);
    assert.equal(result.placeLabel, true);
    assert.equal(result.countryLabel, true);
    assert.equal(result.adminLabel, true);
    assert.equal(result.territoryPolygon, true);
    assert.equal(result.military, false);
    assert.equal(result.activityFeed, false);
    assert.equal(result.natural, false);
    assert.equal(result.historyPanel, false);
    assert.equal(Object.values(result).filter(Boolean).length, 5);
    assert.equal('label' in result, false);
});

test('mobile optional server layer defaults do not fetch or activate national power', async () => {
    const script = fs.readFileSync(require.resolve('../public/assets/layer-default-extras.js'), 'utf8');
    let loadHandler;
    let calls = 0;
    const context = {
        window: { innerWidth: 390, innerHeight: 844, addEventListener: (_event, handler) => { loadHandler = handler; } },
        fetch: async () => { calls++; return { ok: true, json: async () => ({ settings: { nationalPower:true } }) }; },
        document: { getElementById: () => null },
        console
    };
    vm.createContext(context);
    vm.runInContext(script, context);
    await loadHandler();
    assert.equal(calls, 0);
});

test('rapid mobile year changes update the date immediately and render only the last year', () => {
    const start = mapScript.indexOf('    let _mobileTimeCommitTimer =');
    const end = mapScript.indexOf('    window.goToHistoricalTime =', start);
    assert.ok(start >= 0 && end > start);
    const calls = [];
    const timers = new Map();
    let nextTimer = 1;
    const context = {
        mobileFirstPaint: true,
        combinedSlider: { min: '0', max: '30000', value: 0 },
        yearMonthToTotalMonths: year => year,
        updateMap: year => calls.push(`map:${year}`),
        updateUI: year => calls.push(`ui:${year}`),
        refreshHeroPinsForTime: () => {},
        checkAndDisplayEvent: () => {},
        updateTimelineScroll: () => {},
        scheduleHistoryPanelUpdate: () => {},
        layerVisibility: { event:false, timeline:false, historyPanel:false, captionPanel:false },
        document: { getElementById: () => null },
        window: {},
        setTimeout: callback => { const id = nextTimer++; timers.set(id, callback); return id; },
        clearTimeout: id => timers.delete(id)
    };
    vm.createContext(context);
    vm.runInContext(mapScript.slice(start, end), context);
    context.updateTime(400, 1);
    context.updateTime(500, 1);
    assert.deepEqual(calls, ['ui:400', 'ui:500']);
    assert.equal(timers.size, 1);
    [...timers.values()][0]();
    assert.deepEqual(calls, ['ui:400', 'ui:500', 'map:500']);
});

test('OpenFreeMap styles use a single glyph directory instead of a missing joined font stack', () => {
    const start = mapScript.indexOf('    function normalizeOpenFreeMapGlyphStacks');
    const end = mapScript.indexOf('    async function fetchOpenFreeMapStyle', start);
    assert.ok(start >= 0 && end > start);
    const context = {};
    vm.createContext(context);
    vm.runInContext(mapScript.slice(start, end) + `
        this.result = normalizeOpenFreeMapGlyphStacks({ layers: [
            { layout: { 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'] } },
            { layout: { 'text-font': ['Open Sans Regular,Arial Unicode MS Regular'] } },
            { layout: { 'text-font': 'Open Sans Regular,Arial Unicode MS Regular' } },
            { layout: { 'text-font': ['Noto Sans Regular'] } },
            { type: 'fill' }
        ] });`, context);
    assert.deepEqual(
        JSON.parse(JSON.stringify(context.result.layers.map(layer => layer.layout?.['text-font'] || null))),
        [['Open Sans Regular'], ['Open Sans Regular'], ['Open Sans Regular'], ['Noto Sans Regular'], null]
    );
});

test('3D marker culling uses CSS canvas dimensions when MapLibre pixel ratio differs from device DPR', () => {
    assert.match(mapScript, /const cw = _cullCanvas\.clientWidth \|\| canvasRect\.width/);
    assert.match(mapScript, /const ch = _cullCanvas\.clientHeight \|\| canvasRect\.height/);
    assert.doesNotMatch(mapScript, /_cullCanvas\.height \/ \(window\.devicePixelRatio/);
});

test('mobile globe decorative layers do not force an unnecessary full-rate render loop', () => {
    assert.match(mapScript, /if \(pitch < 15\) return;/);
    assert.match(mapScript, /this\._nextRepaintTimer = setTimeout\(\(\) => \{/);
    assert.doesNotMatch(mapScript, /_threeRenderer\.render\(_threeScene, _threeCamera\);\s*window\.mlMap3d\.triggerRepaint\(\)/);
});

test('mobile globe uses MapLibre WebGL1 fallback to avoid WebGL2 PBO fence warnings', () => {
    assert.match(mapScript, /contextType: mobileFirstPaint \? 'webgl' : 'webgl2'/);
});

test('mobile MapLibre symbol layer declares one available glyph font', () => {
    const layerStart = mapScript.indexOf('id: _mobileSymbolTextId');
    const layerEnd = mapScript.indexOf('paint:', layerStart);
    assert.ok(layerStart >= 0 && layerEnd > layerStart);
    assert.match(mapScript.slice(layerStart, layerEnd), /'text-font': \['Open Sans Regular'\]/);
});

test('shared-boundary editor can reselect endpoints without restarting territory selection', () => {
    assert.match(territoryEditorScript, /function _tgReselectPairRange\(\)/);
    assert.match(territoryEditorScript, /btn\.textContent='📍 시작·끝점 다시 선택'/);
    assert.match(territoryEditorScript, /_tgRestorePairState\(context\.snapshot\)/);
    assert.match(territoryEditorScript, /btn\.textContent='📍 시작점 다시 선택'/);
});
