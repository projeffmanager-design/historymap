'use strict';

const { feature, featureCollection, union, difference, kinks, booleanValid,
    booleanWithin, booleanIntersects, polygon } = require('@turf/turf');
const { geometryArea, geometryAreaChange } = require('./territoryGeometrySafety');

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
                || kinks(polygon([ring])).features.length) {
                throw new Error('선이 자기교차하거나 면적이 없는 폴리곤은 사용할 수 없습니다.');
            }
        }
        for (let i = 1; i < rings.length; i++) {
            const hole = polygon([rings[i]]);
            if (!booleanWithin(hole, polygon([rings[0]]))
                || rings.slice(1, i).some(other => booleanIntersects(hole, polygon([other])))) {
                throw new Error('제외 영역은 외곽선 안에 있어야 하며 서로 겹칠 수 없습니다.');
            }
        }
    }
    if (!booleanValid(geometry) || geometryArea(geometry) <= 0) throw new Error('올바르지 않은 폴리곤 경계입니다.');
    return geometry;
}

// 미리보기와 저장 검증이 같은 연산을 사용한다. 입력 좌표는 변경하지 않는다.
function applyPolygonOperation(geometry, mask, operation) {
    if (operation !== 'add' && operation !== 'subtract') throw new Error('지원하지 않는 폴리곤 작업입니다.');
    validatePolygonGeometry(geometry);
    validatePolygonGeometry(mask);
    const features = featureCollection([feature(geometry), feature(mask)]);
    const result = operation === 'add' ? union(features) : difference(features);
    if (!result) throw new Error('영토 전체를 제외할 수 없습니다. 일부 영역을 남겨주세요.');
    return validatePolygonGeometry(result.geometry);
}

function polygonPreviewHandler(req, res) {
    try {
        const { geometry, polygon: mask, operation } = req.body || {};
        return res.json({ geometry: applyPolygonOperation(geometry, mask, operation) });
    } catch (error) {
        return res.status(400).json({ message: error.message });
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
