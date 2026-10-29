'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public/assets/generated/map-scripts.2b9385b0203b.js'), 'utf8');
function sourceBetween(start, end) {
    const first = script.indexOf(start), last = script.indexOf(end, first);
    assert.ok(first >= 0 && last > first);
    return script.slice(first, last);
}
function mapContext() {
    const layers = new Map([['territory-fill-city', { id:'territory-fill-city', type:'fill' }]]);
    const sources = new Map();
    const caption = { hidden:true };
    const classes = new Set();
    const map = {
        getLayer:id => layers.get(id), getSource:id => sources.get(id),
        getStyle:() => ({ layers:[...layers.values()] }),
        addSource(id, data) { sources.set(id, data); },
        addLayer(layer, before) { layers.set(layer.id, { ...layer, before }); },
        setLayoutProperty(id, name, value) { (layers.get(id).layout ||= {})[name] = value; },
        setPaintProperty(id, name, value) { (layers.get(id).paint ||= {})[name] = value; }
    };
    const context = vm.createContext({
        mlMap:map, window:{ _historyGlobeBasemap:'satellite' },
        document:{ body:{ classList:{ toggle:(name, on) => on ? classes.add(name) : classes.delete(name) } },
            getElementById:() => caption },
        captureGlobeBaseLayerVisibility() {}, restoreGlobeBaseLayerVisibility() {},
        ensureGlobeCoastlineShadow() {}, setGlobeBaseSymbolVisibility() {}, applyMinimalTerrainStyle() {}
    });
    vm.runInContext(sourceBetween('            function get3dTerritoryBasemapOpacity(', '            window._3dClearHeroCache'), context);
    vm.runInContext(sourceBetween('            function ensureSatelliteOverlay(', '            function ensureGlobeCoastlineShadow('), context);
    vm.runInContext(sourceBetween('            function applyGlobeBasemapLayers(', '            function ensureTerrainHillshade('), context);
    return { context, layers, sources, caption, classes };
}

test('night tiles load only on selection and sit underneath historical territory layers', () => {
    const f = mapContext();
    f.context.applyGlobeBasemapLayers('satellite');
    assert.equal(f.sources.has('history-globe-night-source'), false);
    f.context.window._historyGlobeBasemap = 'night';
    f.context.applyGlobeBasemapLayers('night');
    const source = f.sources.get('history-globe-night-source');
    assert.match(source.tiles[0], /^https:\/\/gibs.earthdata.nasa.gov\/.*VIIRS_CityLights_2012/);
    assert.equal(source.maxzoom, 8);
    assert.equal(f.layers.get('history-globe-night').before, 'territory-fill-city');
    assert.equal(f.layers.get('history-globe-night').layout.visibility, 'visible');
    assert.equal(f.layers.get('history-globe-satellite').layout.visibility, 'none');
    assert.equal(f.layers.get('territory-fill-city').paint['fill-opacity'][3], 0.10);
    assert.equal(f.caption.hidden, false);
    const size = f.layers.size;
    f.context.applyGlobeBasemapLayers('night');
    assert.equal(f.layers.size, size);
});

test('leaving night mode restores daytime imagery, opacity and caption state', () => {
    const f = mapContext();
    f.context.window._historyGlobeBasemap = 'night';
    f.context.applyGlobeBasemapLayers('night');
    for (const mode of ['satellite', 'terrain', 'vector']) {
        f.context.window._historyGlobeBasemap = mode;
        f.context.applyGlobeBasemapLayers(mode);
        assert.equal(f.layers.get('history-globe-night').layout.visibility, 'none');
        assert.equal(f.layers.get('history-globe-satellite').layout.visibility, mode === 'vector' ? 'none' : 'visible');
        assert.equal(f.caption.hidden, true);
        assert.equal(f.classes.has('night-map-mode'), false);
        assert.ok(f.layers.get('territory-fill-city').paint['fill-opacity'][3] >= 0.35);
    }
});

test('night button reuses the existing globe and keeps the current camera and year', () => {
    const selected = [];
    const context = vm.createContext({
        baseMaps:{ '야간모드':{} }, window:{ _historyGlobeMode:true, _setHistoryGlobeBasemap:mode => selected.push(mode) },
        document:{ querySelectorAll:() => [] }
    });
    vm.runInContext(sourceBetween('        const switchTileLayer =', '        // 🚩 [추가] 컴팩트 토글 그룹 이벤트 연결')
        + '\nswitchTileLayer("야간모드");', context);
    assert.deepEqual(selected, ['night']);
});

test('the first-load cache refresh preserves the local night preview URL', () => {
    const context = vm.createContext({
        window:{ location:{ href:'http://127.0.0.1:3001/?basemap=night&year=981', hash:'' } },
        document:{ getElementById:() => null, addEventListener() {} },
        localStorage:{ getItem:name => name === 'data_schema_version' ? '2.1.3' : null, setItem() {}, removeItem() {} },
        sessionStorage:{ getItem:() => null }, console:{ log() {} }, URL
    });
    const start = index.indexOf('(function() {');
    const end = index.indexOf('// (removed duplicate/conflicting menu toggle logic)', start);
    vm.runInContext(index.slice(start, end), context);
    const result = new URL(context.window.location.href);
    assert.equal(result.searchParams.get('basemap'), 'night');
    assert.equal(result.searchParams.get('year'), '981');
    assert.equal(result.hash, '#reloaded');
});
