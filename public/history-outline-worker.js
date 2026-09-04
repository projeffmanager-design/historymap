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
            const safeUnion = list => {
                if (!list.length) return null;
                if (list.length === 1) return list[0];
                return turf.union(turf.featureCollection(list));
            };
            const safeDifference = (feature, mask) => {
                if (!mask) return feature;
                try { return turf.difference(turf.featureCollection([feature, mask])); }
                catch (_) { return feature; }
            };
            // 같은 레벨에서도 기존 수작업 경계와 신규 행정경계가 겹칠 수 있다.
            // 먼저 동일 표시색(3D는 동일 국가)의 조각을 합치고, city → province → country
            // 순서 및 같은 레벨에서는 작은 면적 순으로 점유시켜 모든 중복 면적을 제거한다.
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
                ...mergeLevelByOwner(byLevel.city, 'city'),
                ...mergeLevelByOwner(byLevel.province, 'province'),
                ...mergeLevelByOwner(byLevel.country, 'country')
            ];
            const output = [];
            let claimedMask = null;
            for (const candidate of candidates) {
                const visiblePiece = safeDifference(candidate, claimedMask);
                if (visiblePiece) {
                    visiblePiece.properties = { ...(candidate.properties || {}), level: 'country', merged: 1 };
                    output.push(visiblePiece);
                }
                claimedMask = safeUnion(claimedMask ? [claimedMask, candidate] : [candidate]);
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
