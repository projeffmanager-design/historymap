'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.844fdec57596.js'), 'utf8');
function loadSection(context, start, end) {
    const first = source.indexOf('  function ' + start);
    const last = source.indexOf('  function ' + end, first);
    assert.ok(first >= 0 && last > first);
    vm.runInContext(source.slice(first, last), context);
}
function crossings() {
    const context = vm.createContext({});
    loadSection(context, '_tgSegmentsCross(', '_tgRemoveVertexEverywhere(');
    return context;
}
function bruteForce(context, ring) {
    const points = new Set(), n = ring.length - 1;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (context._tgSegmentsCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
            [ring[i], ring[i + 1], ring[j], ring[j + 1]].forEach(point => points.add(point));
        }
    }
    return points;
}
function circle(count) {
    const ring = Array.from({ length: count }, (_, index) => {
        const angle = 2 * Math.PI * index / count;
        return [127 + Math.cos(angle), 38 + Math.sin(angle)];
    });
    ring.push(ring[0].slice());
    return ring;
}

test('crossing scan matches all-pairs results, preserves coordinates and responds to edits', () => {
    const context = crossings();
    let seed = 1234;
    function random() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; }
    const rings = [circle(200), [[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]],
        [[0, 0], [0, 1], [0, 1], [1, 1], [1, 0], [0, 0]]];
    for (let sample = 0; sample < 80; sample++) {
        const ring = Array.from({ length: 30 }, () => [Math.floor(random() * 15), Math.floor(random() * 15)]);
        ring.push(ring[0].slice());
        rings.push(ring);
    }
    for (const ring of rings) {
        const original = JSON.stringify(ring), expected = bruteForce(context, ring), actual = new Set();
        assert.equal(context._tgCollectRingCrossings(ring, actual), expected.size > 0);
        assert.deepEqual(actual, expected);
        assert.equal(context._tgRingHasSelfIntersection(ring), expected.size > 0);
        assert.equal(JSON.stringify(ring), original);
    }
    const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    assert.equal(context._tgRingHasSelfIntersection(ring), false);
    ring[1][1] = 2;
    assert.equal(context._tgRingHasSelfIntersection(ring), true);
});

test('dense simple boundaries avoid quadratic exact crossing checks', () => {
    const context = crossings(), ring = circle(10000);
    const exact = context._tgSegmentsCross;
    let comparisons = 0;
    context._tgSegmentsCross = (...args) => { comparisons++; return exact(...args); };
    assert.equal(context._tgCollectRingCrossings(ring, new Set()), false);
    assert.ok(comparisons < ring.length * 4, `${comparisons} exact checks for ${ring.length} vertices`);
});

function markerEditor(rings, canvas) {
    const markers = [];
    const map = {
        getZoom: () => 10,
        getCanvas: () => canvas,
        project: coord => ({ x: coord[0], y: coord[1] })
    };
    const Marker = class {
        constructor() { this.events = {}; }
        setLngLat(coord) { this.position = coord; return this; }
        addTo() { markers.push(this); return this; }
        on(event, handler) { this.events[event] = handler; return this; }
        getLngLat() { return { lng: this.position[0], lat: this.position[1] }; }
    };
    const geometry = { type: 'Polygon', coordinates: rings };
    const context = vm.createContext({
        window: { mlMap3d: map, maplibregl: { Marker } }, maplibregl: { Marker },
        document: { createElement: () => ({ style: {}, addEventListener() {} }) },
        _tg3dRemoveMarkers: () => { markers.length = 0; },
        _tgCrossingVertices: () => new Set(),
        _tgPairMembers: [], _tgPairSharedLines: [], _tg3dMarkers: [],
        _tgEditedGeometry: geometry, _tgEraserMode: false, _tg3dAddMode: false, _tgBoundarySelectMode: false,
        _tgSnapLngLat: () => null, _tg3dSetGeometry: () => {}, _tgSetMsg: () => {}
    });
    loadSection(context, '_tg3dRefreshMarkers(', '_tg3dClear(');
    return { context, map, markers, geometry };
}

test('pixel grid retains marker spacing across cell edges and preserves crossing markers', () => {
    const ring = [[0, 0], [13, 13], [15, 13], [-5, -5], [30, 0], [0, 0]];
    const { context, markers } = markerEditor([ring], {});
    context._tg3dRefreshMarkers(new Set([ring[2]]));
    assert.deepEqual(markers.map(marker => marker.position), [ring[0], ring[1], ring[2], ring[4]]);
});

test('offscreen control points reappear after panning, without changing polygon coordinates', () => {
    const ring = [[-100, 50], [50, 50], [200, 50], [200, 100], [-100, 50]];
    const before = JSON.stringify(ring);
    const { context, map, markers } = markerEditor([ring], { clientWidth: 100, clientHeight: 100, width: 200, height: 200 });
    context._tg3dRefreshMarkers();
    assert.deepEqual(markers.map(marker => marker.position), [ring[1]]);
    map.project = coord => ({ x: coord[0] - 150, y: coord[1] });
    context._tg3dRefreshMarkers();
    assert.deepEqual(markers.map(marker => marker.position), [ring[2], ring[3]]);
    assert.equal(JSON.stringify(ring), before);
});

test('moving the first vertex still closes the polygon and updates its marker', () => {
    const ring = [[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]];
    const { context, markers } = markerEditor([ring], {});
    context._tg3dRefreshMarkers();
    const marker = markers[0];
    marker.setLngLat([5, 7]);
    marker.events.dragend();
    assert.deepEqual(ring[0], [5, 7]);
    assert.deepEqual(Array.from(ring.at(-1)), [5, 7]);
    assert.equal(markers[0].position, ring[0]);
});
