/**
 * 누락된 유럽 / 중동 / 북아프리카 영토 복구 스크립트
 * 소스: world-countries.json (Natural Earth ne_10m_admin_0_countries)
 * 
 * 대상 36개국:
 * 유럽: Spain, Portugal, Greece, Netherlands, Belgium, Poland, Sweden, Norway,
 *       Denmark, Finland, Croatia, Slovakia, Albania, Bosnia and Herzegovina,
 *       Serbia, Kosovo, Montenegro, Slovenia, Latvia, Lithuania, Estonia, Belarus
 * 중동: Jordan, Lebanon, Saudi Arabia, Kuwait, Oman, Yemen, Qatar, Bahrain
 * 북아프리카: Egypt, Libya, Algeria, Morocco, Tunisia
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');

const MONGO_URI = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/realhistory';

// ADMIN 필드 기준 대상 국가 목록
const TARGET_COUNTRIES = [
    'Spain', 'Portugal', 'Greece', 'Netherlands', 'Belgium', 'Poland',
    'Sweden', 'Norway', 'Denmark', 'Finland', 'Croatia', 'Slovakia',
    'Albania', 'Bosnia and Herzegovina', 'Montenegro', 'Slovenia',
    'Latvia', 'Lithuania', 'Estonia', 'Belarus',
    'Jordan', 'Lebanon', 'Saudi Arabia', 'Kuwait', 'Oman', 'Yemen', 'Qatar', 'Bahrain',
    'Egypt', 'Libya', 'Algeria', 'Morocco', 'Tunisia',
    'Kosovo', 'Serbia'
];

// 한국어 이름 매핑
const NAME_KO = {
    'Spain': '스페인', 'Portugal': '포르투갈', 'Greece': '그리스',
    'Netherlands': '네덜란드', 'Belgium': '벨기에', 'Poland': '폴란드',
    'Sweden': '스웨덴', 'Norway': '노르웨이', 'Denmark': '덴마크',
    'Finland': '핀란드', 'Croatia': '크로아티아', 'Slovakia': '슬로바키아',
    'Albania': '알바니아', 'Bosnia and Herzegovina': '보스니아 헤르체고비나',
    'Montenegro': '몬테네그로', 'Slovenia': '슬로베니아',
    'Latvia': '라트비아', 'Lithuania': '리투아니아', 'Estonia': '에스토니아',
    'Belarus': '벨라루스', 'Kosovo': '코소보',
    'Serbia': '세르비아',
    'Jordan': '요르단', 'Lebanon': '레바논', 'Saudi Arabia': '사우디아라비아',
    'Kuwait': '쿠웨이트', 'Oman': '오만', 'Yemen': '예멘',
    'Qatar': '카타르', 'Bahrain': '바레인',
    'Egypt': '이집트', 'Libya': '리비아', 'Algeria': '알제리',
    'Morocco': '모로코', 'Tunisia': '튀니지'
};

function calcBbox(geometry) {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    
    function processRing(ring) {
        for (const [lng, lat] of ring) {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        }
    }
    
    function processCoords(coords, type) {
        if (type === 'Polygon') {
            for (const ring of coords) processRing(ring);
        } else if (type === 'MultiPolygon') {
            for (const polygon of coords) {
                for (const ring of polygon) processRing(ring);
            }
        }
    }
    
    processCoords(geometry.coordinates, geometry.type);
    return { minLat, maxLat, minLng, maxLng };
}

function simplifyCoords(coords, tol) {
    if (!Array.isArray(coords)) return coords;
    if (typeof coords[0] === 'number') return coords;
    if (typeof coords[0][0] === 'number') {
        // ring simplification (Douglas-Peucker)
        if (coords.length <= 2) return coords;
        function sqSegDist(p, p1, p2) {
            let x = p1[0], y = p1[1], dx = p2[0]-x, dy = p2[1]-y;
            if (dx || dy) {
                const t = ((p[0]-x)*dx + (p[1]-y)*dy) / (dx*dx+dy*dy);
                if (t>1) { x=p2[0]; y=p2[1]; } else if (t>0) { x+=dx*t; y+=dy*t; }
            }
            return (p[0]-x)*(p[0]-x) + (p[1]-y)*(p[1]-y);
        }
        function dp(pts, t) {
            if (pts.length<=2) return pts;
            let maxD=0, idx=0;
            for (let i=1;i<pts.length-1;i++) {
                const d = sqSegDist(pts[i], pts[0], pts[pts.length-1]);
                if (d>maxD) { maxD=d; idx=i; }
            }
            if (maxD > t*t) {
                return dp(pts.slice(0,idx+1),t).slice(0,-1).concat(dp(pts.slice(idx),t));
            }
            return [pts[0], pts[pts.length-1]];
        }
        return dp(coords, tol);
    }
    return coords.map(c => simplifyCoords(c, tol));
}

async function main() {
    console.log('🔌 MongoDB 연결 중...');
    const client = await MongoClient.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    const db = client.db('realhistory');
    const col = db.collection('territories');
    
    // 현재 존재하는 이름 확인
    const existing = await col.find({}, { projection: { name: 1, name_en: 1 } }).toArray();
    const existingNames = new Set(existing.map(t => t.name));
    console.log(`📊 현재 territories: ${existing.length}개`);
    
    // world-countries.json 로드
    console.log('📂 world-countries.json 로드 중 (13MB)...');
    const raw = fs.readFileSync('./world-countries.json', 'utf8');
    const geojson = JSON.parse(raw);
    console.log(`🌍 world-countries.json: ${geojson.features.length}개 피처`);
    
    const toInsert = [];
    
    for (const feature of geojson.features) {
        const adminName = feature.properties.ADMIN || feature.properties.NAME;
        const nameEn = feature.properties.NAME_EN || feature.properties.NAME || adminName;
        
        // 대상 국가인지 확인
        const matchedTarget = TARGET_COUNTRIES.find(t => 
            adminName === t || adminName === 'Republic of ' + t ||
            (t === 'Serbia' && adminName === 'Republic of Serbia')
        );
        if (!matchedTarget) continue;
        
        // 이미 존재하면 스킵
        if (existingNames.has(adminName) || existingNames.has(matchedTarget)) {
            console.log(`⏭️  이미 존재: ${adminName}`);
            continue;
        }
        
        const geometry = feature.geometry;
        if (!geometry || !geometry.coordinates) {
            console.log(`⚠️  geometry 없음: ${adminName}`);
            continue;
        }
        
        const bbox = calcBbox(geometry);
        const nameForDB = matchedTarget; // 표준 이름 사용
        
        const doc = {
            name: nameForDB,
            name_en: nameEn,
            name_ko: NAME_KO[nameForDB] || '',
            geometry: {
                type: geometry.type,
                coordinates: geometry.coordinates  // 원본 좌표 그대로 저장 (서버에서 단순화)
            },
            type: geometry.type,
            bbox,
            level: 'province',
            start_year: -5000,
            end_year: 3000,
            start: -5000,
            end: 3000,
            properties: {
                source: 'world-countries.json',
                import_date: new Date().toISOString(),
                original_admin: adminName
            }
        };
        
        toInsert.push(doc);
        console.log(`✅ 준비: ${nameForDB} (${nameForDB !== adminName ? 'from ' + adminName : ''}) bbox: ${bbox.minLat.toFixed(1)}~${bbox.maxLat.toFixed(1)}N, ${bbox.minLng.toFixed(1)}~${bbox.maxLng.toFixed(1)}E`);
    }
    
    if (toInsert.length === 0) {
        console.log('ℹ️  삽입할 새 영토 없음. 모두 이미 존재합니다.');
        await client.close();
        return;
    }
    
    console.log(`\n📥 ${toInsert.length}개 영토 삽입 중...`);
    const result = await col.insertMany(toInsert, { ordered: false });
    console.log(`✅ 삽입 완료: ${result.insertedCount}개`);
    
    const finalCount = await col.countDocuments();
    console.log(`📊 최종 territories 수: ${finalCount}개`);
    
    await client.close();
    console.log('\n🎉 복구 완료! 서버 재시작 후 캐시를 갱신해주세요.');
}

main().catch(e => {
    console.error('❌ 오류:', e.message);
    process.exit(1);
});
