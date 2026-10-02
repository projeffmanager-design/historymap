'use strict';

function ringContainsPoint(ring, lng, lat) {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if (!Array.isArray(a) || !Array.isArray(b)) continue;
        const cross = (b[0] - a[0]) * (lat - a[1]) - (b[1] - a[1]) * (lng - a[0]);
        if (Math.abs(cross) < 1e-9 && lng >= Math.min(a[0], b[0]) - 1e-9 && lng <= Math.max(a[0], b[0]) + 1e-9
            && lat >= Math.min(a[1], b[1]) - 1e-9 && lat <= Math.max(a[1], b[1]) + 1e-9) return true;
        if ((a[1] > lat) !== (b[1] > lat) && lng < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

function polygonContainsPoint(rings, lng, lat) {
    return Array.isArray(rings) && rings.length > 0
        && ringContainsPoint(rings[0], lng, lat)
        && !rings.slice(1).some(ring => ringContainsPoint(ring, lng, lat));
}

function geometryContainsPoint(geometry, lng, lat) {
    if (geometry?.type === 'Polygon') return polygonContainsPoint(geometry.coordinates, lng, lat);
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates.some(rings => polygonContainsPoint(rings, lng, lat));
    return false;
}

module.exports = { geometryContainsPoint };
