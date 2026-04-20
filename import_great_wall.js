/**
 * import_great_wall.js
 * 만리장성(Great Wall) 데이터를 OSM Overpass API에서 받아
 * MongoDB drawings 컬렉션에 시대별 레이어로 임포트합니다.
 *
 * 사용법:
 *   node import_great_wall.js [--dry-run] [--clear]
 *
 * 옵션:
 *   --dry-run  : DB에 저장하지 않고 결과만 출력
 *   --clear    : 기존 만리장성 데이터 삭제 후 재임포트
 */

require('dotenv').config();
const { connectToDatabase, collections } = require('./db');
const https = require('https');
const http = require('http');

const DRY_RUN = process.argv.includes('--dry-run');
const CLEAR   = process.argv.includes('--clear');

// ─── 시대별 레이어 정의 ─────────────────────────────────────────
// 각 항목은 하나의 drawing 레코드로 DB에 저장됩니다.
const WALL_LAYERS = [
    {
        name: '진(秦)·연(燕) 장성',
        nameEn: 'Qin-Yan Great Wall',
        color: '#8B1A1A',   // 짙은 적갈색
        startYear: -221,
        endYear: -206,
        // Overpass: 진·연 시대 태그 또는 위치로 필터
        tag: 'qin',
        description: '진(秦)·연(燕) 시대 장성. 기원전 221년 진시황 통일 이후 확장됨.',
    },
    {
        name: '한(漢) 장성',
        nameEn: 'Han Great Wall',
        color: '#B8860B',   // 황금빛 갈색
        startYear: -206,
        endYear: 220,
        tag: 'han',
        description: '한(漢)나라 시대 장성. 흉노 방어를 위해 서쪽으로 크게 연장됨.',
    },
    {
        name: '명(明) 장성',
        nameEn: 'Ming Great Wall',
        color: '#A0522D',   // 시에나 갈색
        startYear: 1368,
        endYear: 1644,
        tag: 'ming',
        description: '명(明)나라 시대 장성. 현재 가장 잘 보존된 구간으로, 학계 통설의 장성.',
    },
    {
        name: '만리장성 (전체)',
        nameEn: 'Great Wall of China (All)',
        color: '#6B4226',   // 통합 갈색
        startYear: -221,
        endYear: 1644,
        tag: 'all',
        description: '전 시대를 포함한 만리장성 전체 경로.',
    },
];

// ─── Overpass API 쿼리 ────────────────────────────────────────────
// 만리장성 관련 OSM way/relation 데이터를 GeoJSON으로 가져옵니다.
// (전체 + 시대별 name 태그로 필터)
const OVERPASS_QUERIES = {
    all: `
[out:json][timeout:120];
(
  way["historic"="citywalls"]["name:en"~"Great Wall",i];
  way["historic"="wall"]["name:en"~"Great Wall",i];
  way["barrier"="wall"]["name:en"~"Great Wall",i];
  relation["historic"="citywalls"]["name:en"~"Great Wall",i];
);
out geom;
`,
    // 시대별은 'all'을 공유하고 JS에서 분리
};

// ─── HTTP GET 유틸 ────────────────────────────────────────────────
function fetchUrl(urlStr) {
    return new Promise((resolve, reject) => {
        const mod = urlStr.startsWith('https') ? https : http;
        let data = '';
        mod.get(urlStr, (res) => {
            res.setEncoding('utf8');
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { reject(new Error('JSON 파싱 실패: ' + e.message)); }
            });
        }).on('error', reject);
    });
}

// ─── Overpass POST ────────────────────────────────────────────────
function overpassPost(query) {
    return new Promise((resolve, reject) => {
        const body = 'data=' + encodeURIComponent(query);
        const options = {
            hostname: 'overpass-api.de',
            path: '/api/interpreter',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'KoreaManriMap/1.0 (historymap import script)'
            }
        };
        let data = '';
        const req = https.request(options, (res) => {
            res.setEncoding('utf8');
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { reject(new Error('Overpass 응답 파싱 실패')); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── OSM element → GeoJSON LineString 변환 ─────────────────────────
function osmToLineStrings(elements) {
    const lines = [];
    for (const el of elements) {
        if (el.type === 'way' && el.geometry) {
            const coords = el.geometry.map(pt => [pt.lon, pt.lat]);
            if (coords.length >= 2) {
                lines.push(coords);
            }
        }
        // relation의 경우 member ways를 합칩니다
        if (el.type === 'relation' && el.members) {
            for (const m of el.members) {
                if (m.type === 'way' && m.geometry) {
                    const coords = m.geometry.map(pt => [pt.lon, pt.lat]);
                    if (coords.length >= 2) lines.push(coords);
                }
            }
        }
    }
    return lines;
}

// ─── 여러 LineString → MultiLineString GeoJSON ──────────────────────
function toMultiLineStringGeoJSON(lines) {
    return {
        type: 'Feature',
        properties: {},
        geometry: {
            type: 'MultiLineString',
            coordinates: lines
        }
    };
}

// ─── 청나라·명나라 구분: 위도 기준 단순 분리 ────────────────────────
// OSM 데이터에는 시대 태그가 거의 없으므로
// 경도 범위로 대략적인 구간을 구분합니다 (고증 작업의 시작점으로만 활용).
function filterByEra(lines, tag) {
    if (tag === 'all') return lines;
    // 명나라 장성: 대략 동경 98° ~ 132° 사이의 주요 구간
    // 진·연 장성: 현재 OSM 데이터에서 별도 구분 어렵기 때문에
    //             위도/경도 범위로 추정 분리합니다.
    return lines.filter(coords => {
        const lons = coords.map(c => c[0]);
        const avgLon = lons.reduce((a, b) => a + b, 0) / lons.length;
        const lats = coords.map(c => c[1]);
        const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        if (tag === 'ming') return avgLon >= 98 && avgLon <= 122 && avgLat >= 37 && avgLat <= 42;
        if (tag === 'han')  return avgLon >= 95 && avgLon <= 108 && avgLat >= 38 && avgLat <= 44;
        if (tag === 'qin')  return avgLon >= 100 && avgLon <= 118 && avgLat >= 37 && avgLat <= 43;
        return true;
    });
}

// ─── 메인 ────────────────────────────────────────────────────────────
async function main() {
    console.log('🏯 만리장성 데이터 임포트 시작');
    console.log(`   모드: ${DRY_RUN ? '드라이런(DB저장 안 함)' : '실제 저장'} | ${CLEAR ? '기존 데이터 삭제 후 재임포트' : '추가 임포트'}`);
    console.log('');

    // 1. DB 연결
    if (!DRY_RUN) {
        await connectToDatabase();
        console.log('✅ DB 연결 완료');
    }

    // 2. 기존 만리장성 데이터 삭제
    if (CLEAR && !DRY_RUN) {
        const del = await collections.drawings.deleteMany({
            name: { $regex: '장성', $options: 'i' }
        });
        console.log(`🗑️  기존 만리장성 데이터 ${del.deletedCount}건 삭제`);
    }

    // 3. Overpass API 호출
    console.log('🌐 Overpass API에서 만리장성 데이터 다운로드 중...');
    console.log('   (최대 2분 소요될 수 있습니다)');
    let osmData;
    try {
        osmData = await overpassPost(OVERPASS_QUERIES.all);
    } catch(e) {
        console.error('❌ Overpass API 오류:', e.message);
        console.log('');
        console.log('💡 오프라인 대안: great_wall.geojson 파일이 있다면');
        console.log('   --file great_wall.geojson 옵션을 추가해주세요.');
        process.exit(1);
    }

    const elements = osmData.elements || [];
    console.log(`✅ OSM 데이터 수신: ${elements.length}개 요소`);

    // 4. GeoJSON 변환
    const allLines = osmToLineStrings(elements);
    console.log(`📐 변환된 LineString: ${allLines.length}개`);

    if (allLines.length === 0) {
        console.error('❌ 변환 가능한 라인이 없습니다.');
        process.exit(1);
    }

    // 5. 시대별 레이어 생성 및 저장
    const results = [];
    for (const layer of WALL_LAYERS) {
        const filtered = filterByEra(allLines, layer.tag);
        if (filtered.length === 0 && layer.tag !== 'all') {
            console.log(`⚠️  [${layer.name}] 해당 구간 데이터 없음 — 건너뜀`);
            continue;
        }
        const lines = layer.tag === 'all' ? allLines : filtered;
        const geojson = toMultiLineStringGeoJSON(lines);

        // 총 좌표 수
        const totalCoords = lines.reduce((s, l) => s + l.length, 0);

        const drawing = {
            name: layer.name,
            type: 'wall',
            color: layer.color,
            startYear: layer.startYear,
            endYear: layer.endYear,
            description: layer.description,
            geojson,
            importedFrom: 'overpass-osm',
            importedAt: new Date().toISOString(),
            tag: layer.tag,
        };

        console.log(`\n🏯 [${layer.name}]`);
        console.log(`   구간 수: ${lines.length} | 좌표 수: ${totalCoords.toLocaleString()}`);
        console.log(`   연도: ${layer.startYear} ~ ${layer.endYear}`);
        console.log(`   색상: ${layer.color}`);

        if (!DRY_RUN) {
            // 중복 방지: 같은 이름이 있으면 업서트
            const r = await collections.drawings.updateOne(
                { name: layer.name, tag: layer.tag },
                { $set: drawing },
                { upsert: true }
            );
            if (r.upsertedCount > 0) {
                console.log(`   → ✅ 신규 삽입 (_id: ${r.upsertedId})`);
            } else {
                console.log(`   → 🔄 기존 데이터 업데이트`);
            }
        } else {
            console.log(`   → [드라이런] 저장 생략`);
        }

        results.push({ name: layer.name, lines: lines.length, coords: totalCoords });
    }

    // 6. 요약
    console.log('\n══════════════════════════════════');
    console.log('📊 임포트 완료 요약');
    console.log('══════════════════════════════════');
    for (const r of results) {
        console.log(`  ${r.name}: ${r.lines}구간, ${r.coords.toLocaleString()}좌표`);
    }
    if (DRY_RUN) {
        console.log('\n⚠️  드라이런 모드 — DB에는 저장되지 않았습니다.');
        console.log('   실제 저장하려면: node import_great_wall.js');
    } else {
        console.log('\n✅ DB 저장 완료. 서버를 재시작하면 지도에 반영됩니다.');
    }

    process.exit(0);
}

main().catch(e => {
    console.error('치명적 오류:', e);
    process.exit(1);
});
