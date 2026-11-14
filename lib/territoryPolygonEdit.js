'use strict';

const { feature, featureCollection, union, difference, lineIntersect,
    booleanWithin, booleanIntersects, polygon } = require('@turf/turf');
const { geometryArea, geometryAreaChange } = require('./territoryGeometrySafety');

function ringHasIntersection(ring) {
    // Turf의 kinks/booleanValid는 모든 점·선분 쌍을 비교한다.
    // lineIntersect의 sweep-line 검사로 원본 좌표를 유지하면서 후보 선분만 비교한다.
    const count = ring.length - 1, seen = new Set();
    for (let i = 0; i < count; i++) {
        const a = ring[(i + count - 1) % count], b = ring[i], c = ring[(i + 1) % count];
        const key = `${b[0]},${b[1]}`;
        if (seen.has(key)) return true;
        seen.add(key);
        const ax = a[0] - b[0], ay = a[1] - b[1], cx = c[0] - b[0], cy = c[1] - b[1];
        if (ax * cy - ay * cx === 0 && ax * cx + ay * cy > 0) return true;
    }
    return lineIntersect({ type: 'LineString', coordinates: ring },
        featureCollection([]), { ignoreSelfIntersections: false }).features.length > 0;
}

function validatePolygonGeometry(geometry) {
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
        : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
    if (!Array.isArray(polygons) || !polygons.length) throw new Error('폴리곤 영토가 필요합니다.');
    for (const rings of polygons) {
        if (!Array.isArray(rings) || !rings.length) throw new Error('폴리곤 경계가 비어 있습니다.');
        for (const ring of rings) {
            if (!Array.isArray(ring) || ring.length < 4
                || ring.some(p => !Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
                || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) {
                throw new Error('서로 다른 점 3개 이상으로 닫힌 폴리곤을 그려주세요.');
            }
            if (new Set(ring.slice(0, -1).map(p => JSON.stringify(p.slice(0, 2)))).size < 3
                || geometryArea({ type: 'Polygon', coordinates: [ring] }) <= 0
                || ringHasIntersection(ring)) {
                throw new Error('선이 자기교차하거나 면적이 없는 폴리곤은 사용할 수 없습니다.');
            }
        }
        for (let i = 1; i < rings.length; i++) {
            const hole = polygon([rings[i]]);
            if (lineIntersect(hole, polygon([rings[0]])).features.length > 1
                || !booleanWithin(hole, polygon([rings[0]]))
                || rings.slice(1, i).some(other => booleanIntersects(hole, polygon([other])))) {
                throw new Error('제외 영역은 외곽선 안에 있어야 하며 서로 겹칠 수 없습니다.');
            }
        }
    }
    const parts = polygons.map(rings => {
        const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        for (const p of rings[0]) {
            box.minX = Math.min(box.minX, p[0]); box.maxX = Math.max(box.maxX, p[0]);
            box.minY = Math.min(box.minY, p[1]); box.maxY = Math.max(box.maxY, p[1]);
        }
        return { rings, box };
    }).sort((a, b) => a.box.minX - b.box.minX);
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], b = parts[j];
        if (b.box.minX >= a.box.maxX) break;
        if (b.box.minY >= a.box.maxY || b.box.maxY <= a.box.minY) continue;
        if (lineIntersect(polygon(a.rings), polygon(b.rings)).features.length) {
            throw new Error('분리된 폴리곤의 경계가 서로 교차합니다.');
        }
    }
    if (geometryArea(geometry) <= 0) throw new Error('올바르지 않은 폴리곤 경계입니다.');
    return geometry;
}

// 예전 경계에 있는 A→B→C→A 형태의 면적 없는 되짚기만 제거한다.
// 실제 면적이 있는 고리나 자기교차를 임의로 고치거나 단순화하지 않는다.
function removeZeroAreaSpurs(geometry) {
    function cleanRing(ring) {
        if (!Array.isArray(ring) || ring.length < 4
            || ring.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
            || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return ring;
        const points = [], seen = new Map();
        const key = p => `${p[0]},${p[1]}`;
        function isSpur(start, end) {
            const origin = points[start];
            let farthest = origin, length = 0;
            for (let i = start + 1; i < points.length; i++) {
                const distance = Math.hypot(points[i][0] - origin[0], points[i][1] - origin[1]);
                if (distance > length) { length = distance; farthest = points[i]; }
            }
            if (!length) return true;
            const dx = farthest[0] - origin[0], dy = farthest[1] - origin[1];
            return points.slice(start + 1).concat([end]).every(p =>
                Math.abs(dx * (p[1] - origin[1]) - dy * (p[0] - origin[0])) / length <= 1e-12);
        }
        for (const point of ring.slice(0, -1)) {
            const id = key(point), previous = seen.get(id);
            if (previous !== undefined && isSpur(previous, point)) {
                for (let i = previous + 1; i < points.length; i++) {
                    if (seen.get(key(points[i])) === i) seen.delete(key(points[i]));
                }
                points.length = previous + 1;
                continue;
            }
            seen.set(id, points.length);
            points.push(point.slice());
        }
        if (points.length) points.push(points[0].slice());
        return points;
    }
    if (geometry?.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
        return { ...geometry, coordinates: geometry.coordinates.map(cleanRing) };
    }
    if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
        return { ...geometry, coordinates: geometry.coordinates.map(rings => Array.isArray(rings) ? rings.map(cleanRing) : rings) };
    }
    return geometry;
}

function validateForRole(geometry, role) {
    try { return validatePolygonGeometry(geometry); }
    catch (error) {
        error.message = ({ existing: '기존 영토 경계', drawn: '새로 그린 폴리곤', result: '연산 결과' })[role] + ': ' + error.message;
        error.geometryRole = role;
        throw error;
    }
}

// 미리보기와 저장 검증이 같은 연산을 사용한다. 입력 좌표는 변경하지 않는다.
function applyPolygonOperation(geometry, mask, operation) {
    if (operation !== 'add' && operation !== 'subtract') throw new Error('지원하지 않는 폴리곤 작업입니다.');
    const existing = validateForRole(removeZeroAreaSpurs(geometry), 'existing');
    validateForRole(mask, 'drawn');
    const features = featureCollection([feature(existing), feature(mask)]);
    const result = operation === 'add' ? union(features) : difference(features);
    if (!result) throw new Error('영토 전체를 제외할 수 없습니다. 일부 영역을 남겨주세요.');
    return validateForRole(removeZeroAreaSpurs(result.geometry), 'result');
}

function polygonPreviewHandler(req, res) {
    try {
        const { geometry, polygon: mask, operation } = req.body || {};
        return res.json({ geometry: applyPolygonOperation(geometry, mask, operation) });
    } catch (error) {
        return res.status(400).json({ message: error.message, geometryRole: error.geometryRole });
    }
}

// 추가/제외로 의도한 큰 면적 변경은 허용하되, 이후 꼭짓점 편집의 면적 보호는 유지한다.
function polygonEditAreaChange(original, edited, operations) {
    if (operations === undefined) return geometryAreaChange(original, edited);
    if (!Array.isArray(operations) || operations.length > 100) throw new Error('폴리곤 작업 기록이 올바르지 않습니다.');
    let reference = original;
    for (const step of operations) {
        if (!step || geometryAreaChange(reference, step.geometry).unsafe) {
            throw new Error('폴리곤 작업 전 경계의 면적이 크게 변했습니다. 경계를 다시 확인하세요.');
        }
        reference = applyPolygonOperation(step.geometry, step.polygon, step.operation);
    }
    if (operations.length) validatePolygonGeometry(edited);
    return geometryAreaChange(reference, edited);
}

module.exports = { applyPolygonOperation, polygonPreviewHandler, polygonEditAreaChange };
