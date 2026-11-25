'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'), 'utf8');
function section(start, end) {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert.ok(a >= 0 && b > a);
    return source.slice(a, b);
}
const selection = section('    function setup3dRiverSelection(', '    // --- 11. 그리기 폼 관리');
const rendering = section('                const _showRivers = ((typeof layerVisibility', '                } // end rebuildTerritory');
// The first declaration is in the rendering function, distinct from the cache's aligned declaration.
function element() {
    return { children: [], style: {}, listeners: {}, appendChild(child) { this.children.push(child); },
        addEventListener(name, fn) { this.listeners[name] = fn; } };
}
function fixture(role = 'admin', editing = true) {
    const handlers = {}, calls = [], layers = new Map(), sources = new Map();
    const drawing = { _id: 'same-id', type: 'river', name: '<b>강</b>', geojson: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[[1,2],[3,4]], [[5,6],[7,8]]] } } };
    const natural = { _id: { $oid: 'same-id' }, type: 'river', name: '자연 강', geometry: { type: 'LineString', coordinates: [[10,20],[30,40]] } };
    const map = {
        on(name, layer, fn) { handlers[name + (fn ? ':' + layer : '')] = fn || layer; },
        getLayer: id => layers.get(id), getSource: id => sources.get(id),
        addSource(id, data) { sources.set(id, { data: data.data, setData(value) { this.data = value; } }); },
        addLayer(layer) { layers.set(layer.id, layer); },
        setPaintProperty(id, name, value) { layers.get(id).paint[name] = value; },
        setLayoutProperty(id, name, value) { (layers.get(id).layout ||= {})[name] = value; },
        queryRenderedFeatures(point, options) { calls.push({ query: options }); return map.hits; },
        getCanvas: () => ({ style: {} }), hits: []
    };
    let popup;
    const context = vm.createContext({
        currentUser: role ? { role } : null, editMode: editing,
        drawings: [drawing], naturalFeatures: [natural], _m: map, layerVisibility: { rivers: true },
        getEffectiveZoom: () => 8, getCurrentYearMonth: () => ({ year: 400 }), resolveRiverColor: color => color || '#00f',
        document: { createElement: element, getElementById: () => ({ classList: { contains: () => false } }) },
        window: { _closeSharedPopup: () => calls.push('close'),
            _openSharedPopup: () => ({ setDOMContent(value) { popup = value; } }) },
        setEditModeState(value) { context.editMode = value; calls.push({ editMode: value }); },
        openDrawingForm: (geojson, record) => calls.push({ drawing: record, geojson }),
        openNaturalFeatureForm: record => calls.push({ natural: record })
    });
    const render = () => vm.runInContext('{ ' + rendering + ' }', context);
    render();
    vm.runInContext(selection + '\nsetup3dRiverSelection(_m);', context);
    function click(kind = 'drawing', extra = {}) {
        map.hits = [{ properties: { river_source: kind, river_id: 'same-id' }, geometry: { type: 'LineString', coordinates: [[0,0],[0,1]] } }];
        handlers.click({ point: { x: 1, y: 2 }, lngLat: { lng: 1, lat: 2 }, ...extra });
    }
    return { context, map, layers, sources, calls, drawing, natural, click, render, handlers, popup: () => popup };
}

test('3D river layers retain original collection and ID, and have a wide invisible hit target', () => {
    const f = fixture();
    const data = f.sources.get('3d-rivers').data;
    assert.deepEqual(Array.from(data.features, item => [item.properties.river_source, item.properties.river_id]),
        [['natural-feature', 'same-id'], ['drawing', 'same-id']]);
    assert.equal(f.layers.get('3d-rivers-hit').paint['line-width'][1], 14);
    f.context.layerVisibility.rivers = false;
    f.render();
    for (const layer of f.layers.values()) assert.equal(layer.layout.visibility, 'none');
    f.context.layerVisibility.rivers = true;
    f.render();
    assert.equal(f.layers.get('3d-rivers-hit').layout.visibility, 'visible');
});

test('admin click edits complete original geometry, never the rendered fragment', () => {
    const f = fixture();
    f.click();
    assert.equal(f.calls.at(-1).drawing, f.drawing);
    assert.equal(f.calls.at(-1).geojson, f.drawing.geojson);
    f.click('natural-feature');
    assert.equal(f.calls.at(-1).natural, f.natural);
});

test('outside edit mode, privileged users can enter from the river popup', () => {
    for (const role of ['admin', 'superuser']) {
        const f = fixture(role, false);
        f.click();
        assert.equal(f.popup().children[0].textContent, '<b>강</b>');
        const button = f.popup().children[1];
        button.listeners.click();
        assert.equal(f.context.editMode, true);
        assert.equal(f.calls.at(-1).drawing, f.drawing);
    }
});

test('guests and regular users only see names; stale edit buttons recheck permissions', () => {
    for (const role of ['user', null]) {
        const f = fixture(role);
        f.click();
        assert.equal(f.popup().children.length, 1);
        assert.equal(f.calls.length, 1);
    }
    const f = fixture('admin', false);
    f.click();
    f.context.currentUser = { role: 'user' };
    f.popup().children[1].listeners.click();
    assert.equal(f.calls.length, 1);
});

test('river selection does not interrupt active editors, coordinate picking, or marker clicks', () => {
    for (const flag of ['_globeLocationPickActive', '_vertexEditMode', '_segmentEraseMode']) {
        const f = fixture();
        f.context.window[flag] = true;
        f.click();
        assert.equal(f.calls.length, 0);
    }
    const f = fixture();
    f.context.document.getElementById = () => ({ classList: { contains: () => true } });
    f.click();
    assert.equal(f.calls.length, 0);
    const g = fixture();
    g.click('drawing', { defaultPrevented: true });
    g.click('drawing', { originalEvent: { target: { closest: () => ({}) } } });
    assert.equal(g.calls.length, 0);
});

test('hidden or stale river features do not open an editor', () => {
    const f = fixture();
    f.context.drawings = [];
    f.click();
    assert.equal(f.calls.length, 1);
    assert.equal(f.popup(), undefined);
    f.layers.clear();
    f.click();
    assert.equal(f.calls.length, 1);
});

test('river data replacement, addition and deletion invalidate the 3D cache', () => {
    const code = section('                const riverRecords = ', '                // ── 마커 캐시 키:');
    const context = vm.createContext({ drawings: [], naturalFeatures: [], year: 400, month: 1,
        _td: {}, _showTerritory: true, _showRivers: true, _lastRiverRecords: [], _riverDataVersion: 0, _territoryDataVersion: 0, _globeDrawingLayers:{key:()=>''} });
    const key = () => vm.runInContext('{ ' + code + '\nnewTerritoryKey; }', context);
    const initial = key();
    context.drawings.push({ type: 'river' });
    const added = key(); assert.notEqual(added, initial); assert.equal(key(), added);
    context.drawings[0] = { type: 'river', name: '수정' };
    const edited = key(); assert.notEqual(edited, added);
    context.drawings.splice(0, 1);
    assert.notEqual(key(), edited);
});

test('point editing uses the globe editor and flushes its draft into the form', async () => {
    const code = section('    // 📍 기본 지도 포인트 편집.', '    // 영토 편집기는 렌더링');
    const fields = new Map();
    for(const id of ['drawingGeoJson','nfGeometry','vertexEditBtn','nfVertexEditBtn','vertexEditHint','vertexEditDoneBtn','vertexEditCancelBtn','cancelDrawingBtn','cancelNaturalFeatureBtn','territory-geom-edit-bar']) {
        fields.set(id, {value:JSON.stringify({type:'LineString',coordinates:[[1,2],[3,4]]}),style:{},classList:{contains:()=>false,remove(){}},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});
    }
    let options, instance;
    const window={_is3dMode:true,mlMap3d:{isStyleLoaded:()=>true},GlobePointEditor:class {
        constructor(opts){options=opts;instance=this;}
        finish(save){options.onFinish(save?{type:'LineString',coordinates:[[5,6],[7,8]]}:null);}
    },_exitHistory3d(){throw new Error('must keep default map');}};
    const context=vm.createContext({window,document:{getElementById:id=>fields.get(id)},showToast(){},setTimeout,Date,Promise});
    vm.runInContext(code,context);
    await fields.get('vertexEditBtn').listeners.click();
    assert.equal(options.map,window.mlMap3d);assert.equal(window._vertexEditMode,true);
    window._finishGlobePointEdit(true);
    assert.deepEqual(JSON.parse(fields.get('drawingGeoJson').value).coordinates,[[5,6],[7,8]]);
    assert.equal(window._vertexEditMode,false);
    await fields.get('nfVertexEditBtn').listeners.click();instance.finish(false);
    assert.deepEqual(JSON.parse(fields.get('nfGeometry').value).coordinates,[[1,2],[3,4]]);
});
