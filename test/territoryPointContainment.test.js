'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { geometryContainsPoint } = require('../lib/territoryPointContainment');

test('candidate must contain the exact click, not merely intersect a nearby bbox', () => {
    const west = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    const east = { type: 'Polygon', coordinates: [[[1.1, 0], [2, 0], [2, 1], [1.1, 1], [1.1, 0]]] };
    assert.equal(geometryContainsPoint(west, 0.5, 0.5), true);
    assert.equal(geometryContainsPoint(east, 0.5, 0.5), false);
});

test('overlapping polygons can both be selected, but a hole cannot', () => {
    const city = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    const province = { type: 'Polygon', coordinates: [[[-1, -1], [2, -1], [2, 2], [-1, 2], [-1, -1]]] };
    const withHole = { type: 'Polygon', coordinates: [province.coordinates[0], city.coordinates[0]] };
    assert.equal(geometryContainsPoint(city, 0.5, 0.5), true);
    assert.equal(geometryContainsPoint(province, 0.5, 0.5), true);
    assert.equal(geometryContainsPoint(withHole, 0.5, 0.5), false);
    assert.equal(geometryContainsPoint({ type: 'MultiPolygon', coordinates: [city.coordinates] }, 0.5, 0.5), true);
});
