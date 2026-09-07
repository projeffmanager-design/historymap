/* 국가 폴리곤 합성은 무거우므로 지도 UI와 분리된 Worker에서 처리한다. */
importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@7.3.1/turf.min.js');

const cache = new Map();

// union 결과에서 외곽 링만 남긴다. GeoJSON의 두 번째 이후 링은 완전히
// 둘러싸인 내부 구멍이므로 제거하면 외부 미점유지는 건드리지 않고 빵꾸만 메워진다.
function fillEnclosedHoles(feature) {
    if (!feature?.geometry) return feature;
    const geometry = feature.geometry;
    if (geometry.type === 'Polygon') {
        geometry.coordinates = geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
    } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates = (geometry.coordinates || [])
            .filter(polygon => polygon?.[0])
            .map(polygon => [polygon[0]]);
    }
    return feature;
}

self.onmessage = event => {
    const { key, countryId, features, mode } = event.data || {};
    if (!key || !Array.isArray(features) || features.length === 0) return;
    if (cache.has(key)) {
        self.postMessage({ key, countryId, outline: cache.get(key) });
        return;
    }
    try {
        if (mode === 'hierarchy' || mode === 'hierarchy-pieces') {
            const byLevel = { country: [], province: [], city: [] };
            features.forEach(feature => {
                // 영토 내부에 완전히 둘러싸인 링은 미점유지가 아니라 데이터 공백으로 본다.
                // 해안 바깥이나 다른 폴리곤 사이의 열린 공간은 건드리지 않는다.
                fillEnclosedHoles(feature);
                const level = feature?.properties?.level || 'city';
                (byLevel[level] || byLevel.city).push(feature);
            });
            const repairFeature = feature => {
                if (!feature?.geometry) return null;
                try {
                    const cleaned = turf.cleanCoords(feature, { mutate: false });
                    if (cleaned.geometry.type === 'Polygon') {
                        const pieces = turf.unkinkPolygon(cleaned)?.features || [];
                        return pieces.length > 1 ? turf.union(turf.featureCollection(pieces)) : (pieces[0] || cleaned);
                    }
                    if (cleaned.geometry.type === 'MultiPolygon') {
                        const pieces = turf.flatten(cleaned).features.flatMap(part =>
                            turf.unkinkPolygon(part)?.features || [part]
                        );
                        return pieces.length > 1 ? turf.union(turf.featureCollection(pieces)) : (pieces[0] || cleaned);
                    }
                    return cleaned;
                } catch (_) {
                    // buffer(0)는 잘못 닫힌 링과 가벼운 자기교차를 복구하는 마지막 수단이다.
                    try { return turf.buffer(feature, 0, { units: 'kilometers', steps: 8 }); }
                    catch (_) { return null; }
                }
            };
            const safeUnion = list => {
                const valid = list.map(repairFeature).filter(Boolean);
                if (!valid.length) return null;
                if (valid.length === 1) return valid[0];
                try { return turf.union(turf.featureCollection(valid)); }
                catch (_) {
                    // 한 도형 때문에 전체 합성이 무너지지 않도록 정상 조각만 순차 합성한다.
                    let merged = valid[0];
                    for (let i = 1; i < valid.length; i++) {
                        try { merged = turf.union(turf.featureCollection([merged, valid[i]])); }
                        catch (_) { /* 손상 조각은 겹친 원본으로 되살리지 않고 제외 */ }
                    }
                    return merged;
                }
            };
            const safeDifference = (feature, mask) => {
                const repaired = repairFeature(feature);
                if (!repaired) return null;
                if (!mask) return repaired;
                try { return turf.difference(turf.featureCollection([repaired, mask])); }
                catch (_) {
                    const repairedMask = repairFeature(mask);
                    if (!repairedMask) return repaired;
                    try { return turf.difference(turf.featureCollection([repaired, repairedMask])); }
                    catch (_) {
                        // 서로 닿지 않는 정상 조각은 제거할 이유가 없으므로 공백 없이 유지한다.
                        try { return turf.booleanDisjoint(repaired, repairedMask) ? repaired : null; }
                        catch (_) { return null; }
                    }
                }
            };
            // 같은 레벨에서도 기존 수작업 경계와 신규 행정경계가 겹칠 수 있다.
            // 먼저 동일 표시색(3D는 동일 국가)의 조각을 합치고, country → province → city
            // 순서로 처리한다. 부모와 같은 색인 작은 영토는 생략하고,
            // 다른 색의 경합만 최대 두 겹으로 남긴다.
            const mergeLevelByOwner = (list, level) => {
                const groups = new Map();
                list.forEach(feature => {
                    const cid = String(feature?.properties?.country_id || '__unowned__');
                    const ownerKey = mode === 'hierarchy-pieces'
                        ? String(feature?.properties?.color_key || feature?.properties?.fillColor || cid)
                        : cid;
                    if (!groups.has(ownerKey)) groups.set(ownerKey, []);
                    groups.get(ownerKey).push(feature);
                });
                const merged = [];
                groups.forEach(group => {
                    const feature = safeUnion(group);
                    if (!feature) return;
                    feature.properties = { ...(group[0]?.properties || {}), level, merged: 1 };
                    merged.push(feature);
                });
                return merged.sort((a, b) => turf.area(a) - turf.area(b));
            };

            const candidates = [
                ...mergeLevelByOwner(byLevel.country, 'country'),
                ...mergeLevelByOwner(byLevel.province, 'province'),
                ...mergeLevelByOwner(byLevel.city, 'city')
            ];
            const output = [];
            const claimedParts = [];
            for (const candidate of candidates) {
                // 엄격한 단일 채우기: 소유 국가와 관계없이 이미 칠한 모든 면적을 뺀다.
                // country → province → city 순이므로 큰 영역이 먼저 자리를 차지하고,
                // 작은 영역은 아직 비어 있는 부분만 보완한다.
                // 누적 union 하나만 마스크로 쓰면 union 복구 과정에서 제외된 손상 조각이
                // 다음 후보에 다시 칠해질 수 있다. 이미 출력한 모든 조각을 개별적으로
                // 차감하면 union 성공 여부와 무관하게 같은 픽셀이 두 번 채워지지 않는다.
                let visiblePiece = candidate;
                for (const claimed of claimedParts) {
                    visiblePiece = safeDifference(visiblePiece, claimed);
                    if (!visiblePiece) break;
                }
                if (visiblePiece) {
                    visiblePiece.properties = { ...(candidate.properties || {}), merged: 1 };
                    output.push(visiblePiece);
                    claimedParts.push(visiblePiece);
                }
            }
            const result = turf.featureCollection(output);
            cache.set(key, result);
            if (cache.size > 400) cache.delete(cache.keys().next().value);
            self.postMessage({ key, countryId, outline: result });
            return;
        }
        const outline = fillEnclosedHoles(turf.union(turf.featureCollection(features)));
        if (outline) outline.properties = { country_id: countryId };
        cache.set(key, outline || null);
        if (cache.size > 400) cache.delete(cache.keys().next().value);
        self.postMessage({ key, countryId, outline: outline || null });
    } catch (error) {
        self.postMessage({ key, countryId, outline: null, error: error?.message || String(error) });
    }
};
