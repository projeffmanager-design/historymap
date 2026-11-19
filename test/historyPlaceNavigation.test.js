'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'), 'utf8');
function section(start, end) { const a = source.indexOf(start), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a); return source.slice(a, b); }
function fixture(is3d = true, zoom = 5) {
    const calls = [], timers = [], handlers = {};
    const castle = { _id: 'place-a', lat: '37.5', lng: '127.2', history: [], country_id: 'country-a' };
    const context = vm.createContext({
        castles: [castle], allCastleMarkers: [{ _castleData: castle, openPopup: () => calls.push('popup') }],
        map: { getZoom: () => zoom, flyTo: (...args) => calls.push({ two: args }) },
        window: { _is3dMode: is3d, mlMap3d: { getZoom: () => zoom, flyTo: options => calls.push({ three: options }) } },
        getCurrentYearMonth: () => ({ year: 981, month: 4 }), updateTime: (...args) => calls.push({ time: args }),
        getActiveHistoryInfo: () => ({ record: { country_id: 'country-a' } }),
        _mergeCastlesIntoSession: records => { context.castles.push(...records); calls.push('merged'); },
        updateMap: (...args) => calls.push({ refresh:args }),
        getCountryInfoById: id => ({ _id: id }), openDetailPanel: (...args) => calls.push({ detail: args }),
        setTimeout: fn => timers.push(fn), showToast: (...args) => calls.push({ toast: args }),
        document: { getElementById: () => ({ addEventListener: (name, fn) => { handlers[name] = fn; } }) },
        fetch: async () => { throw new Error('unexpected request'); }
    });
    vm.runInContext(section('    function _historyRecordYear(', '    function _historyPanelSearchState(')
        + section('    function yearMonthToTotalMonths(', '    // 지도 항목의 유효 기간')
        + section('    function totalMonthsToYearMonth(', '    function normalizeHistoryNumber(')
        + section('    // 링크의 시점에 마커가 없으면', '    async function _renderHistoryPlaceBacklinks('), context);
    return { context, calls, timers, handlers, castle, open: (...args) => context.window._openHistoryPlaceOnMap(...args) };
}

test('history place links zoom the visible 3D globe without moving the hidden Leaflet map', async () => {
    const f = fixture();
    await f.open('place-a', '1100', '6');
    const camera = f.calls.find(call => call.three).three;
    assert.deepEqual(Array.from(camera.center), [127.2, 37.5]); assert.equal(camera.zoom, 10);
    assert.deepEqual(f.calls.find(call => call.time).time, [1100, 6]);
    assert.equal(f.calls.some(call => call.two), false);
    f.timers.shift()();
    assert.equal(f.calls.includes('popup'), false);
    assert.equal(f.calls.at(-1).detail[0], f.castle);
});

test('2D navigation keeps the existing popup behavior and never zooms an already close view out', async () => {
    const f = fixture(false, 13);
    await f.open('place-a', 1100, 1);
    const camera = f.calls.find(call => call.two).two;
    assert.deepEqual(Array.from(camera[0]), [37.5, 127.2]); assert.equal(camera[1], 13);
    f.timers.shift()(); assert.ok(f.calls.includes('popup'));
    assert.equal(f.calls.some(call => call.three), false);
    const g = fixture(true, 14); await g.open('place-a');
    assert.equal(g.calls.find(call => call.three).three.zoom, 14);
});

test('an unversioned place tag preserves the current timeline instead of jumping to zero', async () => {
    for (const date of [undefined, null, '', '미상']) {
        const f = fixture(); await f.open('place-a', date);
        assert.equal(f.calls.some(call => call.time), false);
        assert.ok(f.calls.some(call => call.three));
    }
});

test('a linked place outside the loaded map cache is fetched by ID before zooming', async () => {
    const f = fixture(); f.context.castles = [];
    let requested;
    f.context.fetch = async url => { requested = url; return { ok: true, json: async () => f.castle }; };
    await f.open('place-a');
    assert.equal(requested, '/api/castle/place-a');
    assert.equal(f.calls.find(call => call.three).three.center[0], 127.2);
});

test('missing or invalid coordinates never navigate to an accidental origin', async () => {
    for (const lat of [null, undefined, '', 'bad']) {
        const f = fixture(); f.castle.lat = lat; await f.open('place-a');
        assert.equal(f.calls.some(call => call.three || call.two), false);
    }
    const f = fixture(); f.castle.lat = 0; f.castle.lng = 0; await f.open('place-a');
    assert.deepEqual(Array.from(f.calls.find(call => call.three).three.center), [0, 0]);
});

test('mobile navigation focuses the map without reopening a detail panel over the location', async () => {
    const f = fixture(); f.context.window.prepareMobilePanelTransition = () => true;
    await f.open('place-a'); f.timers.shift()();
    assert.ok(f.calls.some(call => call.three)); assert.equal(f.calls.some(call => call.detail), false);
});

test('late fetches and old detail timers cannot replace the most recently clicked place', async () => {
    const f = fixture(); let finish;
    f.context.fetch = () => new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => ({ _id: 'slow', lat: 10, lng: 20 }) }); });
    const slow = f.open('slow'); await f.open('place-a'); finish(); await slow;
    assert.equal(f.calls.filter(call => call.three).length, 1);
    await f.open('place-a');
    f.timers[0](); assert.equal(f.calls.some(call => call.detail), false);
    f.timers[1](); assert.ok(f.calls.some(call => call.detail));
});

test('delegated links also work in dynamically generated history search details', () => {
    const f = fixture(); const stops = [];
    f.handlers.click({ target: { closest: () => ({ dataset: { castleId: 'place-a', year: '1100', month: '2' } }) },
        preventDefault: () => stops.push('prevent'), stopPropagation: () => stops.push('stop') });
    assert.equal(f.calls.find(call => call.three).three.zoom, 10);
    assert.deepEqual(stops, ['prevent', 'stop']);
});


test('an article before the marker existed navigates to its first visible month', async () => {
    const f = fixture(); f.castle.history = [{ start_year:1394, start_month:10, end_year:1910, end_month:8 }];
    await f.open('place-a', 981, 4);
    assert.deepEqual(f.calls.find(call => call.time).time, [1394, 10]);
    assert.equal(f.calls.find(call => call.three).three.zoom, 10);
});

test('an undated general place link leaves an invisible period for the nearest visible month', async () => {
    const f = fixture(); f.castle.history = [{ start_year:1000, start_month:7 }];
    await f.open('place-a');
    assert.deepEqual(f.calls.find(call => call.time).time, [1000, 7]);
});

test('an active marker keeps the requested article date or current date', async () => {
    const f = fixture(); f.castle.history = [{ start_year:900, end_year:1200 }];
    await f.open('place-a', 1100, 6);
    assert.deepEqual(f.calls.find(call => call.time).time, [1100, 6]);
    const g = fixture(); g.castle.history = f.castle.history;
    await g.open('place-a');
    assert.equal(g.calls.some(call => call.time), false);
});

test('a date after extinction moves to the final visible month, including history gaps', async () => {
    const f = fixture(); f.castle.history = [{ start_year:900, end_year:950, end_month:8 }, { start_year:1100, start_month:3, end_year:1200 }];
    await f.open('place-a', 1000, 1);
    assert.deepEqual(f.calls.find(call => call.time).time, [950, 8]);
    f.calls.length = 0;
    await f.open('place-a', 1300, 1);
    assert.deepEqual(f.calls.find(call => call.time).time, [1200, 12]);
});

test('legacy start/end fields and BCE periods use the same no-year-zero timeline', async () => {
    const f = fixture(); f.castle.history = [{ start:-108, start_month:3, end:-1, end_month:12 }];
    await f.open('place-a', 1, 1);
    assert.deepEqual(f.calls.find(call => call.time).time, [-1, 12]);
    f.calls.length = 0;
    await f.open('place-a', -200, 1);
    assert.deepEqual(f.calls.find(call => call.time).time, [-108, 3]);
});

test('label and natural marker navigation follows the marker lifetime rather than city history', async () => {
    for (const kind of ['is_label', 'is_natural_feature', 'is_military_flag']) {
        const f = fixture(); Object.assign(f.castle, { [kind]:true, built_year:1200, built_month:5, destroyed_year:1300, destroyed_month:9,
            history:[{ start_year:500, end_year:600 }] });
        await f.open('place-a', 1100, 1);
        assert.deepEqual(f.calls.find(call => call.time).time, [1200, 5]);
    }
});

test('late fetched places are merged into the actual marker data and rerendered', async () => {
    const f = fixture(); f.context.castles = [];
    f.context.fetch = async () => ({ ok:true, json:async () => f.castle });
    await f.open('place-a');
    assert.ok(f.context.castles.includes(f.castle));
    assert.ok(f.calls.includes('merged'));
    assert.deepEqual(Array.from(f.calls.find(call => call.refresh).refresh), [981, 4, false, true]);
});

test('link navigation reveals the target layer and synchronizes its checkbox', async () => {
    const f = fixture(); f.castle.is_label = true;
    f.context.layerVisibility = { placeLabel:false, city:false };
    const checkbox = {};
    f.context.document.getElementById = id => id === 'menu-layer-place-label' ? checkbox : null;
    await f.open('place-a');
    assert.equal(f.context.layerVisibility.placeLabel, true);
    assert.equal(f.context.layerVisibility.city, false);
    assert.equal(checkbox.checked, true);
    assert.ok(f.calls.some(call => call.refresh));
});

test('invalid periods are skipped and valid periods respect the timeline bounds', async () => {
    const f = fixture(); f.castle.history = [{ start_year:1100, end_year:1000 }, { start_year:-6000, end_year:1000 }];
    f.context.document.getElementById = id => id === 'combinedSlider' ? { min:0, max:24000 } : null;
    await f.open('place-a', -100, 1);
    assert.deepEqual(f.calls.find(call => call.time).time, [1, 1]);
});


test('general place mention links also use the shared visible-date navigation', async () => {
    const f = fixture(); f.castle.history = [{ start_year:1200, start_month:8 }];
    const mentions = fs.readFileSync(require.resolve('../src/core/entity-mentions.js'), 'utf8');
    const start = mentions.indexOf("document.addEventListener('click', (event) => {\n  const link = event.target.closest('.global-entity-token-link');");
    assert.ok(start >= 0);
    let handler;
    f.context.document.addEventListener = (_name, callback) => { handler = callback; };
    vm.runInContext(mentions.slice(start), f.context);
    handler({ target:{ closest:() => ({ dataset:{ entityId:'place-a', entityType:'place' } }) }, preventDefault(){}, stopPropagation(){} });
    assert.deepEqual(f.calls.find(call => call.time).time, [1200, 8]);
    assert.equal(f.calls.find(call => call.three).three.zoom, 10);
});
