/* 국가 폴리곤 합성은 무거우므로 지도 UI와 분리된 Worker에서 처리한다. */
importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@7.3.1/turf.min.js');

const cache = new Map();

self.onmessage = event => {
    const { key, countryId, features } = event.data || {};
    if (!key || !Array.isArray(features) || features.length === 0) return;
    if (cache.has(key)) {
        self.postMessage({ key, countryId, outline: cache.get(key) });
        return;
    }
    try {
        const outline = turf.union(turf.featureCollection(features));
        if (outline) outline.properties = { country_id: countryId };
        cache.set(key, outline || null);
        if (cache.size > 400) cache.delete(cache.keys().next().value);
        self.postMessage({ key, countryId, outline: outline || null });
    } catch (error) {
        self.postMessage({ key, countryId, outline: null, error: error?.message || String(error) });
    }
};

