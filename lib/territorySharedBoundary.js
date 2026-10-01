'use strict';

const samePoint = (a, b) => Array.isArray(a) && Array.isArray(b)
    && Math.abs(Number(a[0]) - Number(b[0])) < 1e-8
    && Math.abs(Number(a[1]) - Number(b[1])) < 1e-8;

function rings(geometry) {
    if (geometry?.type === 'Polygon') return geometry.coordinates || [];
    if (geometry?.type === 'MultiPolygon') return (geometry.coordinates || []).flat();
    return [];
}

function validLine(line) {
    return Array.isArray(line) && line.length >= 2 && line.length <= 20000
        && line.every(point => Array.isArray(point) && point.length >= 2
            && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
            && Math.abs(Number(point[0])) <= 180 && Math.abs(Number(point[1])) <= 90)
        && line.some((point, index) => index > 0 && !samePoint(point, line[index - 1]));
}

const pointKey = point => `${Number(point[0]).toFixed(8)},${Number(point[1]).toFixed(8)}`;
const segmentKey = (start, end) => {
    const a = pointKey(start), b = pointKey(end);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
};

function geometrySegments(geometry) {
    const segments = new Set();
    for (const ring of rings(geometry)) {
        if (!Array.isArray(ring) || ring.length < 4) continue;
        const end = samePoint(ring[0], ring[ring.length - 1]) ? ring.length - 1 : ring.length;
        for (let i = 0; i < end; i++) {
            const a = ring[i], b = ring[(i + 1) % end];
            if (Array.isArray(a) && Array.isArray(b)) segments.add(segmentKey(a, b));
        }
    }
    return segments;
}

function sharesLine(geometry, line) {
    if (!validLine(line)) return false;
    const segments = geometrySegments(geometry);
    return line.some((point, index) => index > 0 && segments.has(segmentKey(line[index - 1], point)));
}

function isSharedLine(geometries, line) {
    if (!validLine(line)) return false;
    const edgeSets = geometries.map(geometrySegments);
    return line.every((point, index) => index === 0
        || edgeSets.filter(edges => edges.has(segmentKey(line[index - 1], point))).length >= 2);
}

module.exports = { samePoint, validLine, sharesLine, isSharedLine };
