'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { geometryArea, geometryAreaChange } = require('../lib/territoryGeometrySafety');

const square = size => ({ type: 'Polygon', coordinates: [[[0, 0], [size, 0], [size, size], [0, size], [0, 0]]] });

test('minor shared-boundary adjustments keep their original area', () => {
    assert.equal(geometryAreaChange(square(1), square(0.9)).unsafe, false);
});

test('collapsing a city polygon to a narrow strip is rejected', () => {
    const original = square(1);
    const collapsed = { type: 'Polygon', coordinates: [[[0, 0], [0.2, 0], [0.2, 1], [0, 1], [0, 0]]] };
    assert.equal(geometryAreaChange(original, collapsed).unsafe, true);
});

test('multipolygon area excludes holes', () => {
    const geometry = { type: 'MultiPolygon', coordinates: [
        square(2).coordinates,
        [square(1).coordinates[0], [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75], [0.25, 0.25]]]
    ] };
    assert.equal(geometryArea(geometry), 4.75);
});
