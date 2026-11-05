'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { applyPolygonOperation, polygonPreviewHandler, polygonEditAreaChange } = require('../lib/territoryPolygonEdit');
const { geometryArea, geometryAreaChange } = require('../lib/territoryGeometrySafety');
const { geometryContainsPoint } = require('../lib/territoryPointContainment');

const rectangle = (x, y, width, height = width) => ({ type: 'Polygon', coordinates: [
    [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]]
] });
const clone = value => JSON.parse(JSON.stringify(value));

test('a detached polygon becomes part of the same MultiPolygon territory', () => {
    const original = rectangle(0, 0, 4), island = rectangle(6, 0, 2);
    const before = clone(original);
    const result = applyPolygonOperation(original, island, 'add');
    assert.equal(result.type, 'MultiPolygon');
    assert.equal(result.coordinates.length, 2);
    assert.equal(geometryArea(result), 20);
    assert.equal(geometryContainsPoint(result, 7, 1), true);
    assert.deepEqual(original, before, 'preview must not change the input geometry');
});

test('overlapping added polygons merge without double counting the overlap', () => {
    const result = applyPolygonOperation(rectangle(0, 0, 4), rectangle(2, 0, 4), 'add');
    assert.equal(result.type, 'Polygon');
    assert.equal(geometryArea(result), 24);
});

test('a completely internal exclusion creates a hole and is excluded from point selection', () => {
    const result = applyPolygonOperation(rectangle(0, 0, 10), rectangle(2, 2, 6), 'subtract');
    assert.equal(result.type, 'Polygon');
    assert.equal(result.coordinates.length, 2);
    assert.equal(geometryArea(result), 64);
    assert.equal(geometryContainsPoint(result, 5, 5), false);
    assert.equal(geometryContainsPoint(result, 1, 1), true);
});

test('exclusions crossing an outer boundary cut it back or split it into multiple polygons', () => {
    const clipped = applyPolygonOperation(rectangle(0, 0, 10), rectangle(8, -1, 4, 12), 'subtract');
    assert.equal(clipped.coordinates.length, 1);
    assert.equal(geometryArea(clipped), 80);
    const split = applyPolygonOperation(rectangle(0, 0, 10), rectangle(4, -1, 2, 12), 'subtract');
    assert.equal(split.type, 'MultiPolygon');
    assert.equal(split.coordinates.length, 2);
    assert.equal(geometryArea(split), 80);
});

test('repeated exclusions preserve holes and unrelated islands, and addition can refill a hole', () => {
    const mainland = applyPolygonOperation(rectangle(0, 0, 10), rectangle(2, 2, 2), 'subtract');
    const islands = applyPolygonOperation(mainland, rectangle(12, 0, 4), 'add');
    const excluded = applyPolygonOperation(islands, rectangle(13, 1, 2), 'subtract');
    assert.equal(geometryArea(excluded), 108);
    assert.equal(geometryContainsPoint(excluded, 3, 3), false);
    assert.equal(geometryContainsPoint(excluded, 14, 2), false);
    assert.equal(geometryContainsPoint(excluded, 12.5, 0.5), true);
    const filled = applyPolygonOperation(excluded, rectangle(2, 2, 2), 'add');
    assert.equal(geometryContainsPoint(filled, 3, 3), true);
    assert.equal(geometryContainsPoint(filled, 14, 2), false);
});

test('self intersections, degenerate rings, malformed coordinates and total removal are rejected', () => {
    const original = rectangle(0, 0, 10);
    for (const ring of [
        [[1, 1], [4, 4], [1, 4], [4, 1], [1, 1]],
        [[1, 1], [2, 2], [3, 3], [1, 1]],
        [[1, 1], [2, NaN], [3, 1], [1, 1]],
        [[1, 1], [2, 2], [3, 1]]
    ]) assert.throws(() => applyPolygonOperation(original, { type: 'Polygon', coordinates: [ring] }, 'subtract'));
    assert.throws(() => applyPolygonOperation(original, rectangle(-1, -1, 12), 'subtract'), /전체/);
    assert.throws(() => applyPolygonOperation(original, rectangle(1, 1, 2), 'unknown'), /지원하지/);
});

test('intentional large additions and exclusions can be saved, while accidental area collapse stays blocked', () => {
    const original = rectangle(0, 0, 10);
    for (const [operation, mask] of [['add', rectangle(12, 0, 10)], ['subtract', rectangle(1, 1, 8)]]) {
        const step = { geometry: original, polygon: mask, operation };
        const edited = applyPolygonOperation(original, mask, operation);
        assert.equal(geometryAreaChange(original, edited).unsafe, true);
        assert.equal(polygonEditAreaChange(original, edited, [step]).unsafe, false);
        assert.equal(polygonEditAreaChange(original, edited).unsafe, true);
        assert.equal(polygonEditAreaChange(original, rectangle(0, 0, 0.1), [step]).unsafe, true);
    }
    assert.throws(() => polygonEditAreaChange(original, original, [{ geometry: rectangle(0, 0, 0.1), polygon: rectangle(1, 1, 1), operation: 'add' }]), /면적/);
    assert.throws(() => polygonEditAreaChange(original, original, null), /기록/);
});

test('save replays multiple operations and keeps every previous hole and island', () => {
    const original = rectangle(0, 0, 10);
    const first = { geometry: original, polygon: rectangle(1, 1, 8), operation: 'subtract' };
    const hole = applyPolygonOperation(first.geometry, first.polygon, first.operation);
    const second = { geometry: hole, polygon: rectangle(12, 0, 10), operation: 'add' };
    const result = applyPolygonOperation(second.geometry, second.polygon, second.operation);
    assert.equal(polygonEditAreaChange(original, result, [first, second]).unsafe, false);
});

test('preview endpoint returns a result or a useful validation error without touching a database', () => {
    const response = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    polygonPreviewHandler({ body: { geometry: rectangle(0, 0, 10), polygon: rectangle(2, 2, 2), operation: 'subtract' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.geometry.coordinates.length, 2);
    polygonPreviewHandler({ body: {} }, response);
    assert.equal(response.statusCode, 400);
    assert.ok(response.body.message);
});

test('existing save route persists large intentional exclusions and strips the transient operation log', async () => {
    const source = fs.readFileSync(require.resolve('../server'), 'utf8');
    const start = source.indexOf("        app.put('/api/territories/:id',");
    const end = source.indexOf('        // POST: 기존 simplify_territory.js', start);
    const writes = [], rebuilds = [];
    let save;
    const original = rectangle(0, 0, 10);
    const context = vm.createContext({
        app: { put(_path, _auth, handler) { save = handler; } }, verifyAdmin() {}, toObjectId: id => id,
        collections: { territories: {
            findOne: async () => ({ geometry: original }),
            updateOne: async (query, update) => { writes.push({ query, update }); return { matchedCount: 1 }; }
        } },
        polygonEditAreaChange, _geometryHasSelfIntersection: () => false,
        territoriesCache: null, territoriesCacheTime: null, _dirtyTerritoryIds: new Set(), _territoryDirty: false,
        rebuildTerritoryTilesIncremental: async (_label, ids) => { rebuilds.push([...ids]); },
        console: { log() {}, error() {} }
    });
    vm.runInContext(source.slice(start, end), context);
    const step = { geometry: original, polygon: rectangle(1, 1, 8), operation: 'subtract' };
    const geometry = applyPolygonOperation(step.geometry, step.polygon, step.operation);
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await save({ params: { id: 'A' }, body: { geometry, bbox: {}, geometry_operations: [step] } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].update.$set.geometry.coordinates.length, 2);
    assert.equal(writes[0].update.$set.boundary_preserve, true);
    assert.equal('geometry_operations' in writes[0].update.$set, false);
    assert.deepEqual(rebuilds, [['A']]);
    await save({ params: { id: 'A' }, body: { geometry, bbox: {} } }, res);
    assert.equal(res.statusCode, 409, 'the same unexplained collapse must still be rejected');
    assert.equal(writes.length, 1);
});

const editorSource = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.844fdec57596.js'), 'utf8');
function editorFixture(is3d = true) {
    const buttons = new Map(), documentEvents = new Map(), mapEvents = new Map(), sources = new Map(), layers = new Map();
    const makeButton = id => ({ id, style: {}, disabled: false, classList: { toggle() {}, add() {}, remove() {} }, addEventListener() {} });
    const document = {
        readyState: 'loading',
        getElementById(id) { if (!buttons.has(id)) buttons.set(id, makeButton(id)); return buttons.get(id); },
        querySelectorAll() { return [...buttons.values()]; },
        addEventListener(name, fn) { documentEvents.set(name, fn); },
        removeEventListener(name, fn) { if (documentEvents.get(name) === fn) documentEvents.delete(name); }
    };
    for (const id of ['add-polygon', 'subtract-polygon', 'polygon-finish', 'polygon-cancel', 'save', 'cancel', 'eraser']) document.getElementById('territory-geom-' + id + '-btn');
    let zoomEnabled = true;
    const surface = { style: {} };
    const map = {
        on(name, fn) { mapEvents.set(name, fn); }, off(name, fn) { if (mapEvents.get(name) === fn) mapEvents.delete(name); },
        getCanvas: () => surface, getContainer: () => surface,
        project: p => ({ x: p[0] * 100, y: p[1] * 100 }), latLngToContainerPoint: p => ({ x: p[1] * 100, y: p[0] * 100 }),
        doubleClickZoom: { isEnabled: () => zoomEnabled, enabled: () => zoomEnabled, enable() { zoomEnabled = true; }, disable() { zoomEnabled = false; } },
        dragPan: { enable() {} }, dragging: { enable() {} },
        getSource: id => sources.get(id), addSource(id, data) { sources.set(id, { data: data.data, setData(value) { this.data = value; } }); }, removeSource: id => sources.delete(id),
        getLayer: id => layers.get(id), addLayer(layer) { layers.set(layer.id, layer); }, removeLayer: id => layers.delete(id),
        getPane: () => null
    };
    // Leaflet previews/edit layers use the actual editor code with a lightweight renderer.
    const leafletLayers = new Set();
    const L = { geoJSON(data) { return { data, addTo() { leafletLayers.add(this); return this; }, eachLayer(fn) { fn({ pm: { enable() {}, disable() {} }, on() {}, off() {} }); } }; } };
    map.removeLayer = id => { layers.delete(id); leafletLayers.delete(id); };
    const window = { _is3dMode: is3d, mlMap3d: is3d ? map : null, territoryEditLayerGroup: { clearLayers() {} } };
    const requests = [], messages = [];
    const context = vm.createContext({ window, document, map, L, console, localStorage: { getItem: () => 'test-token' },
        sessionStorage: { getItem: () => null }, setTimeout() {}, setInterval() {}, clearInterval() {},
        fetch: async (url, options) => {
            const body = JSON.parse(options.body); requests.push({ url, body });
            if (url.endsWith('geometry-preview')) {
                try { return { ok: true, json: async () => ({ geometry: applyPolygonOperation(body.geometry, body.polygon, body.operation) }) }; }
                catch (error) { return { ok: false, json: async () => ({ message: error.message }) }; }
            }
            return { ok: true, json: async () => ({}) };
        }
    });
    const expose = `window.editor = {
        start:_tgStartPolygonDraw, finish:_tgFinishPolygonDraw, stop:_tgStopPolygonDraw, save:_tgSave, cancel:_tgCancel,
        init:function(geometry){_tgEditMode=true;_tgEditId='A';_tgOriginalGeom=geometry;_tgEditedGeometry=JSON.parse(JSON.stringify(geometry));},
        state:function(){return {geometry:_tgEditedGeometry,operations:_tgPolygonOperations,mode:_tgPolygonMode,busy:_tgPolygonBusy,points:_tgPolygonPoints};}
    }; _tgSetMsg=function(message){messages.push(message);};`;
    context.messages = messages;
    vm.runInContext(editorSource.replace(/\}\)\(\);\s*$/, expose + '\n})();'), context);
    window.editor.init(rectangle(0, 0, 10));
    const click = (lng, lat) => mapEvents.get('click')({ lngLat: { lng, lat }, latlng: { lng, lat } });
    return { context, editor: window.editor, click, mapEvents, documentEvents, buttons, sources, layers, requests, messages,
        leafletLayers, zoomEnabled: () => zoomEnabled };
}

test('3D editor draws an exclusion, restores controls and submits operation evidence on save', async () => {
    const f = editorFixture();
    f.editor.start('subtract');
    assert.equal(f.zoomEnabled(), false);
    assert.equal(f.buttons.get('territory-geom-save-btn').disabled, true);
    f.click(1, 1); f.click(9, 1); f.click(9, 9); f.click(1, 9);
    assert.equal(f.buttons.get('territory-geom-polygon-finish-btn').disabled, false);
    await f.editor.finish();
    assert.equal(f.editor.state().geometry.coordinates.length, 2);
    assert.equal(f.editor.state().operations.length, 1);
    assert.equal(f.editor.state().mode, null);
    assert.equal(f.zoomEnabled(), true);
    assert.equal(f.mapEvents.has('mousemove'), false);
    assert.equal(f.sources.has('territory-polygon-draw'), false);
    assert.equal(f.buttons.get('territory-geom-save-btn').disabled, false);
    await f.editor.save();
    assert.equal(f.requests.at(-1).url, '/api/territories/A');
    assert.equal(f.requests.at(-1).body.geometry_operations[0].operation, 'subtract');
    assert.equal(polygonEditAreaChange(rectangle(0, 0, 10), f.requests.at(-1).body.geometry, f.requests.at(-1).body.geometry_operations).unsafe, false);
});

test('drawing supports undo and cancellation without changing territory geometry', () => {
    const f = editorFixture(), original = clone(f.editor.state().geometry);
    f.editor.start('add'); f.click(12, 0); f.click(14, 0); f.click(14, 2);
    f.documentEvents.get('keydown')({ key: 'Backspace', preventDefault() {} });
    assert.equal(f.editor.state().points.length, 2);
    assert.equal(f.buttons.get('territory-geom-polygon-finish-btn').disabled, true);
    f.documentEvents.get('keydown')({ key: 'Escape', preventDefault() {} });
    assert.deepEqual(clone(f.editor.state().geometry), original);
    assert.equal(f.editor.state().operations.length, 0);
    assert.equal(f.documentEvents.has('keydown'), false);
    assert.equal(f.mapEvents.has('click'), false);
    assert.equal(f.zoomEnabled(), true);
});

test('closing on the first point completes a polygon and a later cancelled draft preserves that edit', async () => {
    const f = editorFixture();
    f.editor.start('add'); f.click(12, 0); f.click(14, 0); f.click(14, 2); f.click(12, 2); f.click(12, 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.editor.state().geometry.type, 'MultiPolygon');
    const before = clone(f.editor.state().geometry);
    f.editor.start('subtract'); f.click(1, 1); f.click(2, 1);
    await f.editor.save();
    assert.equal(f.requests.length, 1, 'saving a partially drawn polygon must be blocked');
    f.editor.stop();
    assert.deepEqual(clone(f.editor.state().geometry), before);
    assert.equal(f.editor.state().operations.length, 1);
    f.editor.cancel();
    assert.equal(f.editor.state().geometry, null);
    assert.equal(f.editor.state().operations.length, 0);
});

test('cancelling a pending request discards its late result and leaves controls usable', async () => {
    const f = editorFixture(); let resolve;
    f.context.fetch = () => new Promise(done => { resolve = done; });
    f.editor.start('add'); f.click(12, 0); f.click(14, 0); f.click(14, 2);
    const pending = f.editor.finish();
    assert.equal(f.editor.state().busy, true);
    f.editor.stop();
    resolve({ ok: true, json: async () => ({ geometry: rectangle(12, 0, 2) }) });
    await pending;
    assert.equal(geometryArea(f.editor.state().geometry), 100);
    assert.equal(f.editor.state().operations.length, 0);
    assert.equal(f.buttons.get('territory-geom-add-polygon-btn').disabled, false);
});

test('a failed operation keeps the draft editable and never changes the territory', async () => {
    const f = editorFixture();
    f.editor.start('subtract'); f.click(-1, -1); f.click(11, -1); f.click(11, 11); f.click(-1, 11);
    await f.editor.finish();
    assert.equal(f.editor.state().mode, 'subtract');
    assert.equal(f.editor.state().busy, false);
    assert.equal(geometryArea(f.editor.state().geometry), 100);
    assert.match(f.messages.at(-1), /전체/);
    assert.equal(f.buttons.get('territory-geom-subtract-polygon-btn').disabled, false);
});

test('2D editor previews a detached polygon, preserves the base outline and restores vertex editing', async () => {
    const f = editorFixture(false);
    f.editor.start('add'); f.click(12, 0); f.click(14, 0); f.click(14, 2); f.click(12, 2);
    assert.equal(f.leafletLayers.size, 2, 'base territory and draft must both remain visible');
    await f.editor.finish();
    assert.equal(f.editor.state().geometry.type, 'MultiPolygon');
    assert.equal(f.editor.state().operations.length, 1);
    assert.equal(f.leafletLayers.size, 1, 'only the editable territory remains');
    assert.equal(f.zoomEnabled(), true);
});
