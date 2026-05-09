#!/usr/bin/env node
/**
 * generate_metatiles.js
 *
 * 기존 10°×10° 개별 타일을 20°×20° 메타타일로 병합합니다.
 *
 * 효과:
 *   한반도 뷰포트 기준  개별 타일 9개 요청 → 메타타일 ~3개 요청
 *   전체 233타일 → 약 60개 메타타일 (request 약 75% 감소)
 *
 * 사용법:
 *   node generate_metatiles.js
 *   node generate_metatiles.js --size 40   (40°×40° 4x4 메타타일)
 *   node generate_metatiles.js --dir /custom/path/to/tiles
 */

const fs   = require('fs');
const path = require('path');

// ── 옵션 파싱 ──────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const getArg   = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const TILE_SIZE = parseInt(getArg('--size', '20'), 10); // 기본 20° (2x2 메타타일)
const TILES_DIR = getArg('--dir', path.join(__dirname, 'public', 'tiles'));
const OUT_DIR   = path.join(TILES_DIR, `meta${TILE_SIZE}`);

console.log(`\n🗺️  메타타일 생성 시작`);
console.log(`   타일 디렉터리: ${TILES_DIR}`);
console.log(`   메타타일 크기: ${TILE_SIZE}°×${TILE_SIZE}° (${TILE_SIZE/10}x${TILE_SIZE/10} 배치)`);
console.log(`   출력 디렉터리: ${OUT_DIR}\n`);

// ── 개별 타일 인덱스 로드 ──────────────────────────────────────────────────
const indexPath = path.join(TILES_DIR, 'index.json');
if (!fs.existsSync(indexPath)) {
    console.error(`❌ index.json 없음: ${indexPath}`);
    process.exit(1);
}
const tileIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
console.log(`📋 개별 타일: ${tileIndex.length}개 로드`);

// ── 출력 디렉터리 생성 ─────────────────────────────────────────────────────
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ── 메타타일 그리드 계산 ────────────────────────────────────────────────────
// 각 타일의 lat/lng를 TILE_SIZE 단위로 스냅 → 메타타일 기준 좌표 계산
function snapToMeta(val) {
    return Math.floor(val / TILE_SIZE) * TILE_SIZE;
}

// 타일 → 메타타일 그룹 매핑
const metaGroups = new Map(); // key: "lat_lng" → tiles[]
for (const tile of tileIndex) {
    const metaLat = snapToMeta(tile.lat);
    const metaLng = snapToMeta(tile.lng);
    const key = `${metaLat}_${metaLng}`;
    if (!metaGroups.has(key)) {
        metaGroups.set(key, {
            metaLat,
            metaLng,
            bounds: {
                south: metaLat,
                north: metaLat + TILE_SIZE,
                west:  metaLng,
                east:  metaLng + TILE_SIZE,
            },
            tiles: [],
        });
    }
    metaGroups.get(key).tiles.push(tile);
}

console.log(`🧩 메타타일 그룹: ${metaGroups.size}개 (예상 최대 ${Math.ceil(233 * (10/TILE_SIZE) ** 2)}개)\n`);

// ── 메타타일 파일 생성 ─────────────────────────────────────────────────────
const metaIndex = [];
let generated = 0, skipped = 0, empty = 0;

for (const [key, group] of metaGroups) {
    const metaFilename = `meta_${group.metaLat}_${group.metaLng}.json`;
    const outPath = path.join(OUT_DIR, metaFilename);

    // 이미 생성된 파일은 스킵 (--force 없으면)
    if (!args.includes('--force') && fs.existsSync(outPath)) {
        // 인덱스에는 추가
        const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const featureCount = existing.features ? existing.features.length : 0;
        metaIndex.push({
            metaLat: group.metaLat,
            metaLng: group.metaLng,
            bounds: group.bounds,
            filename: metaFilename,
            feature_count: featureCount,
            child_tiles: group.tiles.map(t => t.filename),
        });
        skipped++;
        continue;
    }

    // 자식 타일들의 features 병합
    const allFeatures = [];
    const seenIds = new Set();

    for (const tile of group.tiles) {
        const tilePath = path.join(TILES_DIR, tile.filename);
        if (!fs.existsSync(tilePath)) {
            console.warn(`  ⚠️  자식 타일 없음: ${tile.filename}`);
            continue;
        }
        try {
            const data = JSON.parse(fs.readFileSync(tilePath, 'utf8'));
            const features = data.features || [];
            for (const f of features) {
                const id = f.properties?._id || f.properties?.id || f.id;
                if (id && seenIds.has(id)) continue; // 중복 제거
                if (id) seenIds.add(id);
                allFeatures.push(f);
            }
        } catch (e) {
            console.warn(`  ⚠️  타일 파싱 오류: ${tile.filename}`, e.message);
        }
    }

    if (allFeatures.length === 0) {
        empty++;
        // 빈 메타타일도 파일로 저장 (다음 실행 시 스킵)
    }

    // GeoJSON FeatureCollection으로 저장
    const metaTile = {
        type: 'FeatureCollection',
        meta: {
            size: TILE_SIZE,
            bounds: group.bounds,
            child_tiles: group.tiles.map(t => t.filename),
            generated_at: new Date().toISOString(),
        },
        features: allFeatures,
    };

    fs.writeFileSync(outPath, JSON.stringify(metaTile), 'utf8');
    generated++;

    metaIndex.push({
        metaLat: group.metaLat,
        metaLng: group.metaLng,
        bounds: group.bounds,
        filename: metaFilename,
        feature_count: allFeatures.length,
        child_tiles: group.tiles.map(t => t.filename),
    });

    process.stdout.write(`\r  생성 중: ${generated + skipped}/${metaGroups.size} (${metaFilename}: ${allFeatures.length} features)`);
}

console.log('\n');

// ── 메타타일 인덱스 저장 ───────────────────────────────────────────────────
const metaIndexPath = path.join(OUT_DIR, 'index.json');
fs.writeFileSync(metaIndexPath, JSON.stringify(metaIndex, null, 2), 'utf8');

// 원본 tiles 디렉터리에도 심볼릭 위치 기록 (클라이언트가 쉽게 찾도록)
const metaRefPath = path.join(TILES_DIR, `meta${TILE_SIZE}_index.json`);
fs.writeFileSync(metaRefPath, JSON.stringify({ dir: `meta${TILE_SIZE}`, index: metaIndex }, null, 2), 'utf8');

// ── 결과 요약 ──────────────────────────────────────────────────────────────
const totalMeta   = metaIndex.length;
const totalChild  = tileIndex.length;
const reduction   = ((1 - totalMeta / totalChild) * 100).toFixed(1);
const totalFeat   = metaIndex.reduce((s, m) => s + m.feature_count, 0);

console.log(`✅ 메타타일 생성 완료!`);
console.log(`   신규 생성: ${generated}개 | 스킵(기존): ${skipped}개 | 빈 타일: ${empty}개`);
console.log(`   개별 타일: ${totalChild}개 → 메타타일: ${totalMeta}개 (요청 ${reduction}% 감소)`);
console.log(`   총 features: ${totalFeat}개 (중복 제거 후)`);
console.log(`   메타 인덱스: ${metaRefPath}`);
console.log(`\n🔧 다음 단계:`);
console.log(`   1. 서버 재시작 → 메타타일 서빙 자동 활성화`);
console.log(`   2. 브라우저 콘솔에서 확인: window._tileStrategyConfig.metatileSize`);
console.log(`   3. 40°×40° 버전도 필요하면: node generate_metatiles.js --size 40\n`);
