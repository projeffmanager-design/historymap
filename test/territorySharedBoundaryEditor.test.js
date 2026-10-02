'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { isSharedLine } = require('../lib/territorySharedBoundary');

const source = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.844fdec57596.js'), 'utf8');
const start = source.indexOf('  function _tgOuterRingRefs(');
const end = source.indexOf('  function _tgMakeLocalMidBoundary(');
const context = {
    _tgGeometryRings: geometry => geometry.type === 'Polygon'
        ? geometry.coordinates : geometry.coordinates.flat(),
    _tgBBox: geometry => {
        const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
        const points = rings.flat();
        return {
            minLng: Math.min(...points.map(point => point[0])),
            maxLng: Math.max(...points.map(point => point[0])),
            minLat: Math.min(...points.map(point => point[1])),
            maxLat: Math.max(...points.map(point => point[1]))
        };
    }
};
assert.ok(start >= 0 && end > start);
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const attachStart = source.indexOf('  function _tgForceAttachToSharedLine(');
const attachEnd = source.indexOf('  function _tgSameBoundaryPoint(');
assert.ok(attachStart >= 0 && attachEnd > attachStart);
vm.runInContext(source.slice(attachStart, attachEnd), context);

const polygon = ring => ({ type: 'Polygon', coordinates: [ring] });
const west = () => polygon([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);

test('B candidates come only from exact clicked-point results when the lookup succeeds', async () => {
    const candidateStart = source.indexOf('  async function _tgFindPairTargetsAt(');
    const candidateEnd = source.indexOf('  function _tgClearPairSelectionOutline(');
    const requests = [];
    const candidateContext = {
        window: { mlMap3d: {
            getLayer: () => true,
            queryRenderedFeatures: () => [{ _id: 'rendered-neighbor' }]
        } },
        fetch: async (_url, options) => {
            requests.push(JSON.parse(options.body));
            return { ok: true, json: async () => ({ territories: [{ _id: 'clicked-neighbor' }] }) };
        },
        _tgToken: () => 'test',
        _tgEditId: 'A',
        _tgPairMembers: [],
        _tgTerritoryId: hit => hit._id,
        getCurrentYearMonth: () => ({ year: 424 }),
        Set
    };
    vm.createContext(candidateContext);
    vm.runInContext(source.slice(candidateStart, candidateEnd), candidateContext);
    const hits = await candidateContext._tgFindPairTargetsAt({ x: 10, y: 20 }, { lng: 127, lat: 38 }, false);
    assert.deepEqual(hits.map(hit => hit._id), ['clicked-neighbor']);
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].point, { lng: 127, lat: 38 });
});

test('selected neighbor replaces a mismatched and offset vertex run with the A boundary', () => {
    const a = west();
    const b = polygon([[1.12, 0], [2, 0], [2, 1], [1.12, 1], [1.12, 0.5], [1.12, 0]]);
    const line = context._tgMakeSharedBoundary(a, b, [1, 0.5]);
    assert.ok(line);
    assert.equal(isSharedLine([a, b], line), true);
    assert.equal(b.coordinates[0].some(point => point[0] === 1.12 && point[1] === 0.5), false);
});

test('selected parent boundary can adopt the same canonical line', () => {
    const parent = polygon([[1.18, 0], [3, 0], [3, 1], [1.18, 1], [1.18, 0]]);
    const line = [[1, 0], [1, 1]];
    assert.ok(context._tgForceAttachToSharedLine(parent, line, [1, 0.5]));
    assert.equal(isSharedLine([west(), parent], line), true);
});

test('chosen start and end vertices limit alignment to the requested edge', () => {
    const a = west();
    const b = polygon([[1.12, 0], [2, 0], [2, 1], [1.12, 1], [1.12, 0]]);
    const line = context._tgMakeSharedBoundaryByRange(a, b, [1, 0], [1, 1]);
    assert.ok(line);
    assert.equal(isSharedLine([a, b], line), true);
    assert.equal(b.coordinates[0].some(point => point[0] === 1.12), false);
});

test('boundary alignment inserts guard vertices and preserves the outer neighboring edges', () => {
    const a = west();
    const b = polygon([[1.12, 0], [2, 0], [2, 1], [1.12, 1], [1.12, 0]]);
    const line = context._tgMakeSharedBoundaryByRange(a, b, [1, 0], [1, 1]);
    assert.ok(line);
    assert.equal(isSharedLine([a, b], line), true);
    const ring = b.coordinates[0];
    assert.equal(ring.some(point => point[0] === 2 && point[1] === 0), true);
    assert.equal(ring.some(point => point[0] === 2 && point[1] === 1), true);
    assert.equal(ring.some(point => point[0] > 1 && point[0] < 2 && point[1] === 0), true);
    assert.equal(ring.some(point => point[0] > 1 && point[0] < 2 && point[1] === 1), true);
});

test('editor rejects a boundary match that collapses most of a polygon', () => {
    const original = polygon([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]);
    const collapsed = polygon([[0, 0], [0.1, 0], [0.1, 2], [0, 2], [0, 0]]);
    assert.equal(context._tgLargeAreaChange(original, collapsed), true);
});

test('reverse alignment changes A while preserving B geometry', () => {
    const a = polygon([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
    const b = polygon([[1.12, 0], [2, 0], [2, 1], [1.12, 1], [1.12, 0]]);
    const originalB = JSON.stringify(b);
    const line = context._tgMakeSharedBoundaryByRange(b, a, [1.12, 0], [1.12, 1]);
    assert.ok(line);
    assert.equal(JSON.stringify(b), originalB);
    assert.equal(isSharedLine([a, b], line), true);
});

test('forced matching refuses an unrelated distant polygon', () => {
    const far = polygon([[5, 0], [6, 0], [6, 1], [5, 1], [5, 0]]);
    assert.equal(context._tgForceSharedBoundary(west(), far, [1, 0.5]), null);
});

test('matching another side does not load or enforce persisted neighbor groups', () => {
    const forward = source.slice(source.indexOf('  async function _tgPreparePair('), source.indexOf('  function _tgExtendSavedPair('));
    const reverse = source.slice(source.indexOf('  async function _tgPrepareReversePair('), source.indexOf('  function _tgBeginPairRangeSelection('));
    const open = source.slice(source.indexOf('  async function _tgOpen3dEdit('), source.indexOf('  function _tgEnter3dSelect('));
    assert.doesNotMatch(forward, /_tgImportLinkedGroupsForIds|alreadyLinkedElsewhere/);
    assert.doesNotMatch(reverse, /_tgImportLinkedGroupsForIds/);
    assert.doesNotMatch(open, /_tgLoadSavedBoundaryGroups/);
    const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
    const route = server.slice(server.indexOf("app.put('/api/territories/shared-boundary'"), server.indexOf("app.patch('/api/territories/:id/population'"));
    assert.doesNotMatch(route, /territory_shared_boundaries|sharedBoundaries/);
    assert.match(route, /withTransaction/);
});

test('selected B polygons are outlined until the range is finished or cancelled', async () => {
    const previewStart = source.indexOf('  function _tgClearPairSelectionOutline(');
    const previewEnd = source.indexOf('  async function _tgBeginPairRangeSelection(');
    assert.ok(previewStart >= 0 && previewEnd > previewStart);
    const layers = new Map(), sources = new Map();
    const map = {
        getLayer: id => layers.get(id), removeLayer: id => layers.delete(id),
        getSource: id => sources.get(id), removeSource: id => sources.delete(id),
        addLayer: layer => layers.set(layer.id, layer),
        addSource: (id, source) => sources.set(id, source)
    };
    const preview = {
        window: { mlMap3d: map }, _tgPairPreviewRequest: 3,
        _tgTerritoryId: hit => hit._id,
        _tgTerritoryName: hit => hit.name,
        _tgFetch: async id => ({ _id: id, name: id, geometry: west() })
    };
    vm.createContext(preview);
    vm.runInContext(source.slice(previewStart, previewEnd), preview);
    assert.equal(await preview._tgShowPairSelectionOutline([{ _id: 'B1', name: 'first' }, { _id: 'B2', name: 'second' }], 3), true);
    assert.equal(sources.get('territory-3d-pair-preview').data.features.length, 2);
    const features = sources.get('territory-3d-pair-preview').data.features;
    assert.notEqual(features[0].properties.preview_color, features[1].properties.preview_color);
    assert.deepEqual(JSON.parse(JSON.stringify(layers.get('territory-3d-pair-preview-line').paint['line-color'])), ['get', 'preview_color']);
    preview._tgClearPairSelectionOutline();
    assert.equal(sources.size, 0);
    assert.equal(layers.size, 0);
    assert.equal(await preview._tgShowPairSelectionOutline([{ _id: 'B1' }], 2), false);
    assert.equal(sources.size, 0);
});

test('dense shared vertices do not cover the boundary with overlapping markers', () => {
    const markerStart = source.indexOf('  function _tg3dRefreshMarkers(');
    const markerEnd = source.indexOf('  function _tg3dClear(');
    assert.ok(markerStart >= 0 && markerEnd > markerStart);
    const created = [];
    const line = Array.from({ length: 101 }, (_, index) => [index / 100, 0]);
    const markerContext = {
        window: {
            mlMap3d: { getZoom: () => 7, project: coord => ({ x: coord[0] * 100, y: 0 }) },
            maplibregl: { Marker: class {
                constructor() { this.position = null; }
                setLngLat(coord) { this.position = coord; return this; }
                addTo() { created.push(this); return this; }
                on() { return this; }
            } }
        },
        document: { createElement: () => ({ style: {}, addEventListener() {} }) },
        _tg3dRemoveMarkers: () => { created.length = 0; },
        _tgCrossingVertices: () => new Set(),
        _tgPairMembers: [{}], _tgPairSharedLines: [line],
        _tg3dMarkers: [], _tgEraserMode: false, _tgBoundarySelectMode: false
    };
    markerContext.maplibregl = markerContext.window.maplibregl;
    vm.createContext(markerContext);
    vm.runInContext(source.slice(markerStart, markerEnd), markerContext);
    markerContext._tg3dRefreshMarkers();
    assert.ok(created.length < 15, `rendered ${created.length} overlapping markers`);
    assert.equal(created[0].position, line[0]);
    assert.equal(created.at(-1).position, line.at(-1));
});

test('editor selects B before asking for shared-boundary start and end', async () => {
    const workflowStart = source.indexOf('  async function _tgBeginPairRangeSelection(');
    const workflowEnd = source.indexOf('  function _tgClearCoastGuide(');
    assert.ok(workflowStart >= 0 && workflowEnd > workflowStart);
    const calls = [];
    const map = {
        handler: null,
        canvas: { style: {} },
        on(_name, handler) { this.handler = handler; },
        off(_name, handler) { if (this.handler === handler) this.handler = null; },
        getCanvas() { return this.canvas; }
    };
    const workflow = {
        window: { mlMap3d: map },
        _tgEditId: 'A', _tgEditedGeometry: west(), _tgPairMembers: [], _tgCanonicalGroups: [],
        _tgPairClickHandler: null, _tgPairSelectDirection: null, _tgPairStartPoint: null,
        _tgPairRangeEnabled: true, _tgPairRangeMarker: null,
        _tgPairPreviewRequest: 0,
        _tgHideLayerPicker: () => {}, _tgClearPair: () => {}, _tgClearPairRangeMarker: () => {},
        _tgClearPairSelectionOutline: () => {},
        _tgShowPairSelectionOutline: async () => { calls.push('show-B-outline'); return true; },
        _tgPairBtn: () => {}, _tgReversePairBtn: () => {}, _tgSetMsg: () => {},
        _tgFindPairTargetsAt: async () => [{ _id: 'B' }],
        _tgChoosePairTargets: (hits, _focus, choose) => { calls.push('choose-B'); choose(hits); return true; },
        _tgPreparePair: (_hits, _focus, range) => calls.push({ range }),
        document: { createElement: () => ({ style: {} }) },
        maplibregl: { Marker: class { setLngLat() { return this; } addTo() { return this; } remove() {} } }
    };
    vm.createContext(workflow);
    vm.runInContext(source.slice(workflowStart, workflowEnd), workflow);
    const click = (lng, lat) => ({ point: { x: lng, y: lat }, lngLat: { lng, lat } });
    workflow._tgStartPairSelect('forward');
    await map.handler(click(1, 0.5));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['choose-B', 'show-B-outline']);
    map.handler(click(1, 0));
    assert.equal(calls.length, 2);
    map.handler(click(1, 1));
    assert.equal(calls.length, 3);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[2].range)), [[1, 0], [1, 1]]);
});
