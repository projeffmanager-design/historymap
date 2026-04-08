// 타일 전체 재빌드 (standalone)
require('dotenv').config();
const { connectToDatabase } = require('./db');
const fs = require('fs');
const path = require('path');

const TILES_DIR = path.join(__dirname, 'public', 'tiles');
const TILE_SIZE = 10;

function _dpSimplify(points, tol) {
    if (points.length <= 2) return points;
    const sq = t => t * t;
    function sqSegDist(p, p1, p2) {
        let x = p1[0], y = p1[1], dx = p2[0]-x, dy = p2[1]-y;
        if (dx !== 0 || dy !== 0) {
            const t = ((p[0]-x)*dx + (p[1]-y)*dy) / (sq(dx)+sq(dy));
            if (t > 1) { x = p2[0]; y = p2[1]; }
            else if (t > 0) { x += dx*t; y += dy*t; }
        }
        return sq(p[0]-x) + sq(p[1]-y);
    }
    const sqTol = sq(tol); let maxD = 0, idx = 0;
    for (let i = 1; i < points.length-1; i++) {
        const d = sqSegDist(points[i], points[0], points[points.length-1]);
        if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > sqTol) {
        const l = _dpSimplify(points.slice(0, idx+1), tol);
        const r = _dpSimplify(points.slice(idx), tol);
        return l.slice(0,-1).concat(r);
    }
    return [points[0], points[points.length-1]];
}

function _simplifyGeometry(geometry, tol) {
    if (!geometry?.coordinates) return geometry;
    function simplifyCoords(coords) {
        if (!Array.isArray(coords) || coords.length === 0) return coords;
        if (typeof coords[0] === 'number') return coords;
        if (typeof coords[0][0] === 'number') {
            const s = _dpSimplify(coords, tol);
            if (s.length >= 2 && (s[0][0] !== s[s.length-1][0] || s[0][1] !== s[s.length-1][1])) s.push(s[0]);
            return s.length >= 4 ? s : coords;
        }
        return coords.map(c => simplifyCoords(c));
    }
    return { ...geometry, coordinates: simplifyCoords(geometry.coordinates) };
}

function _getBboxFromGeometry(geometry) {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    (function walk(coords) {
        if (!Array.isArray(coords)) return;
        if (typeof coords[0] === 'number') {
            if (coords[1] < minLat) minLat = coords[1];
            if (coords[1] > maxLat) maxLat = coords[1];
            if (coords[0] < minLng) minLng = coords[0];
            if (coords[0] > maxLng) maxLng = coords[0];
        } else { coords.forEach(walk); }
    })(geometry.coordinates);
    return { minLat, maxLat, minLng, maxLng };
}

function _getTileKeysForBbox(minLat, maxLat, minLng, maxLng) {
    const keys = new Set();
    const startLat = Math.floor(minLat / TILE_SIZE) * TILE_SIZE;
    const endLat   = Math.ceil(maxLat  / TILE_SIZE) * TILE_SIZE;
    const startLng = Math.floor(minLng / TILE_SIZE) * TILE_SIZE;
    const endLng   = Math.ceil(maxLng  / TILE_SIZE) * TILE_SIZE;
    for (let lat = startLat; lat < endLat; lat += TILE_SIZE)
        for (let lng = startLng; lng < endLng; lng += TILE_SIZE)
            keys.add(`${lat}_${lng}`);
    return keys;
}

function _territoryToFeature(territory) {
    const geometry = territory.geometry
        || (territory.type && territory.coordinates
            ? { type: territory.type, coordinates: territory.coordinates } : null);
    if (!geometry) return null;
    return {
        type: 'Feature',
        geometry: _simplifyGeometry(geometry, 0.005),
        properties: {
            _id: territory._id.toString(),
            name: territory.name,
            name_ko: territory.name_ko,
            type: territory.type,
            level: territory.level,
            country: territory.country ? territory.country.toString() : null,
            country_id: territory.country ? territory.country.toString() : null,
            start_year: territory.start_year || territory.start || null,
            end_year: territory.end_year || territory.end || null,
        }
    };
}

async function main() {
    const { collections } = await connectToDatabase();
    const startTime = Date.now();
    console.log('🗺️  [전체 타일 재빌드 시작]');

    const tileMap = new Map();
    let total = 0, skipped = 0;

    const cursor = collections.territories.find({});
    for await (const territory of cursor) {
        const feature = _territoryToFeature(territory);
        if (!feature) { skipped++; continue; }

        const geometry = territory.geometry
            || (territory.type && territory.coordinates ? { type: territory.type, coordinates: territory.coordinates } : null);
        const bbox = territory.bbox || _getBboxFromGeometry(geometry);
        const tileKeys = _getTileKeysForBbox(bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng);

        for (const key of tileKeys) {
            if (!tileMap.has(key)) {
                const [lat, lng] = key.split('_').map(Number);
                tileMap.set(key, {
                    tile_lat: lat, tile_lng: lng,
                    bounds: { north: lat+TILE_SIZE, south: lat, west: lng, east: lng+TILE_SIZE },
                    features: []
                });
            }
            tileMap.get(key).features.push(feature);
        }
        total++;
        if (total % 50 === 0) process.stdout.write(`  처리 중: ${total}개\r`);
    }

    console.log(`\n  총 ${total}개 처리, ${skipped}개 geometry 없음(스킵)`);

    // 기존 타일 파일 삭제 후 재생성
    const existing = fs.readdirSync(TILES_DIR).filter(f => f.match(/^tile_-?\d+_-?\d+\.json$/));
    for (const f of existing) fs.unlinkSync(path.join(TILES_DIR, f));
    console.log(`  기존 타일 ${existing.length}개 삭제`);

    for (const [, tile] of tileMap) {
        const filename = `tile_${tile.tile_lat}_${tile.tile_lng}.json`;
        fs.writeFileSync(path.join(TILES_DIR, filename), JSON.stringify({
            type: 'FeatureCollection',
            tile_lat: tile.tile_lat,
            tile_lng: tile.tile_lng,
            bounds: tile.bounds,
            features: tile.features,
            feature_count: tile.features.length
        }));
    }

    // index.json 재생성
    const files = fs.readdirSync(TILES_DIR).filter(f => f.match(/^tile_-?\d+_-?\d+\.json$/));
    const indexData = files.map(filename => {
        const raw = JSON.parse(fs.readFileSync(path.join(TILES_DIR, filename), 'utf8'));
        return { lat: raw.tile_lat, lng: raw.tile_lng, bounds: raw.bounds, filename, feature_count: raw.feature_count };
    });
    fs.writeFileSync(path.join(TILES_DIR, 'index.json'), JSON.stringify(indexData, null, 2));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ [완료] ${tileMap.size}개 타일 생성, index.json 갱신 (${elapsed}초)`);
    process.exit(0);
}

main().catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
