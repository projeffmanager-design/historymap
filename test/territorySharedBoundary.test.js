'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validLine, sharesLine, isSharedLine } = require('../lib/territorySharedBoundary');

const west = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
const east = { type: 'Polygon', coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]] };
const shared = [[1, 0], [1, 1]];

test('two neighboring polygons recognize the same edge in opposite ring directions', () => {
    assert.equal(sharesLine(west, shared), true);
    assert.equal(sharesLine(east, shared), true);
    assert.equal(sharesLine(east, [...shared].reverse()), true);
    assert.equal(isSharedLine([west, east], shared), true);
});

test('a detached or invalid line cannot be stored as a shared boundary', () => {
    assert.equal(sharesLine(west, [[3, 0], [3, 1]]), false);
    assert.equal(validLine([[1, 0], [1, 0]]), false);
    assert.equal(validLine([[181, 0], [1, 1]]), false);
    assert.equal(isSharedLine([west, east], [[1, 0], [1, 1], [1, 2]]), false);
});

test('multipolygon members can share just one segment of a longer canonical line', () => {
    const archipelago = { type: 'MultiPolygon', coordinates: [[[[4, 0], [5, 0], [5, 1], [4, 1], [4, 0]]], east.coordinates] };
    assert.equal(sharesLine(archipelago, [[1, -1], [1, 0], [1, 1]]), true);
});
