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

test('editor selects B before asking for shared-boundary start and end', async () => {
    const workflowStart = source.indexOf('  function _tgBeginPairRangeSelection(');
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
        _tgHideLayerPicker: () => {}, _tgClearPair: () => {}, _tgClearPairRangeMarker: () => {},
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
    assert.deepEqual(calls, ['choose-B']);
    map.handler(click(1, 0));
    assert.equal(calls.length, 1);
    map.handler(click(1, 1));
    assert.equal(calls.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[1].range)), [[1, 0], [1, 1]]);
});
