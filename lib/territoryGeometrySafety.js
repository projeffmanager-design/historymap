'use strict';

function ringArea(ring) {
    if (!Array.isArray(ring) || ring.length < 4) return 0;
    let twice = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i], b = ring[i + 1];
        twice += Number(a[0]) * Number(b[1]) - Number(b[0]) * Number(a[1]);
    }
    return Math.abs(twice) / 2;
}

function geometryArea(geometry) {
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
        : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
    return (polygons || []).reduce((total, rings) => {
        if (!Array.isArray(rings) || !rings.length) return total;
        const outer = ringArea(rings[0]);
        const holes = rings.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0);
        return total + Math.max(0, outer - holes);
    }, 0);
}

function geometryAreaChange(original, edited) {
    const before = geometryArea(original), after = geometryArea(edited);
    if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0 || after <= 0) {
        return { unsafe: true, ratio: null };
    }
    const ratio = after / before;
    // 경계 맞춤에서 도시 전체가 잘못된 호로 대체되는 사고를 차단한다.
    return { unsafe: ratio < 0.6 || ratio > 1.7, ratio };
}

module.exports = { geometryArea, geometryAreaChange };
