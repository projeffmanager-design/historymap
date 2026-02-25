// 내몽골 지역 렌더링 문제 심층 분석
// 1. Inner Mongol과 Mongolia 둘 다 country 레벨 + 할당 국가 없음
// 2. 둘 다 coordinates가 비어있음 → 타일에는 있는지 확인
// 3. 하위 province들의 국가 할당 상태 확인

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const ATLAS_URI = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';

async function main() {
    const client = new MongoClient(ATLAS_URI);
    await client.connect();
    const db = client.db('realhistory');
    
    // 1. 내몽골 영역 안의 모든 영토와 국가 할당 상태
    const innerMongolBbox = { minLat: 37.39, maxLat: 53.32, minLng: 97.19, maxLng: 126.06 };
    
    const allTerritories = await db.collection('territories').find({ bbox: { $exists: true } }).toArray();
    const allContributions = await db.collection('contributions').find({}).toArray();
    const allCountries = await db.collection('countries').find({}).toArray();
    
    const countryMap = new Map(allCountries.map(c => [c._id.toString(), c]));
    const contribByTerritory = new Map();
    for (const c of allContributions) {
        const key = c.territory_id.toString();
        if (!contribByTerritory.has(key)) contribByTerritory.set(key, []);
        contribByTerritory.get(key).push(c);
    }
    
    // 내몽골 bbox 내부에 center가 있는 영토들
    const innerTerritories = allTerritories.filter(t => {
        if (!t.bbox) return false;
        const cLat = (t.bbox.minLat + t.bbox.maxLat) / 2;
        const cLng = (t.bbox.minLng + t.bbox.maxLng) / 2;
        return cLat >= innerMongolBbox.minLat && cLat <= innerMongolBbox.maxLat &&
               cLng >= innerMongolBbox.minLng && cLng <= innerMongolBbox.maxLng;
    });
    
    console.log('=== 내몽골 bbox 안에 center가 있는 영토들 ===');
    console.log(`총 ${innerTerritories.length}개\n`);
    
    // 레벨별 분류
    const byLevel = { country: [], province: [], city: [] };
    for (const t of innerTerritories) {
        const level = t.level || 'city';
        if (!byLevel[level]) byLevel[level] = [];
        byLevel[level].push(t);
    }
    
    for (const level of ['country', 'province', 'city']) {
        console.log(`\n--- ${level} 레벨 (${(byLevel[level] || []).length}개) ---`);
        for (const t of (byLevel[level] || [])) {
            const contribs = contribByTerritory.get(t._id.toString()) || [];
            const countries = contribs.map(c => {
                const country = countryMap.get(c.country_id.toString());
                return country ? `${country.name}(${c.start_year||'?'}~${c.end_year||'?'})` : '?';
            });
            const hasCoords = t.coordinates && JSON.stringify(t.coordinates).length > 10;
            console.log(`  ${t.name} — 국가: ${countries.length > 0 ? countries.join(', ') : '❌없음'} ${hasCoords ? '' : '⚠️좌표없음'}`);
        }
    }
    
    // 2. 타일 파일에서 내몽골 관련 데이터 확인
    console.log('\n\n=== 타일 파일에서 Inner Mongol/Mongolia 확인 ===');
    const tilesDir = path.join(__dirname, '..', 'public', 'tiles');
    if (fs.existsSync(tilesDir)) {
        const tileFiles = fs.readdirSync(tilesDir).filter(f => f.endsWith('.json'));
        let innerMongolTile = null;
        let mongoliaTile = null;
        
        for (const file of tileFiles) {
            const data = JSON.parse(fs.readFileSync(path.join(tilesDir, file)));
            if (data.name === 'Inner Mongol') innerMongolTile = { file, data };
            if (data.name === 'Mongolia') mongoliaTile = { file, data };
        }
        
        if (innerMongolTile) {
            console.log(`Inner Mongol 타일: ${innerMongolTile.file}`);
            console.log(`  type: ${innerMongolTile.data.type}, level: ${innerMongolTile.data.level}`);
            console.log(`  coordinates: ${innerMongolTile.data.coordinates ? JSON.stringify(innerMongolTile.data.coordinates).substring(0, 100) + '...' : 'NONE'}`);
        } else {
            console.log('Inner Mongol 타일: ❌ 없음');
        }
        
        if (mongoliaTile) {
            console.log(`Mongolia 타일: ${mongoliaTile.file}`);
            console.log(`  type: ${mongoliaTile.data.type}, level: ${mongoliaTile.data.level}`);
            console.log(`  coordinates: ${mongoliaTile.data.coordinates ? JSON.stringify(mongoliaTile.data.coordinates).substring(0, 100) + '...' : 'NONE'}`);
        } else {
            console.log('Mongolia 타일: ❌ 없음');
        }
    }
    
    // 3. DB에서 coordinates 유무 확인
    console.log('\n\n=== DB coordinates 상태 ===');
    const innerMongolDB = await db.collection('territories').findOne({ name: 'Inner Mongol' });
    const mongoliaDB = await db.collection('territories').findOne({ name: 'Mongolia' });
    
    if (innerMongolDB) {
        const hasCoords = innerMongolDB.coordinates && JSON.stringify(innerMongolDB.coordinates).length > 10;
        console.log(`Inner Mongol DB: coordinates ${hasCoords ? '있음 (' + JSON.stringify(innerMongolDB.coordinates).length + ' chars)' : '❌없음'}`);
        console.log(`  type: ${innerMongolDB.type}, level: ${innerMongolDB.level}`);
    }
    if (mongoliaDB) {
        const hasCoords = mongoliaDB.coordinates && JSON.stringify(mongoliaDB.coordinates).length > 10;
        console.log(`Mongolia DB: coordinates ${hasCoords ? '있음 (' + JSON.stringify(mongoliaDB.coordinates).length + ' chars)' : '❌없음'}`);
        console.log(`  type: ${mongoliaDB.type}, level: ${mongoliaDB.level}`);
    }
    
    // 4. 렌더링 시뮬레이션: 내몽골 지역이 어떻게 처리되는지
    console.log('\n\n=== 렌더링 시뮬레이션 (연도: 1200) ===');
    const year = 1200;
    const innerTerrs = innerTerritories;
    
    // 3-pass 시뮬레이션
    const provinceStatus = new Map();
    const painted = new Set();
    
    // PASS 1: province
    const provinces = innerTerrs.filter(t => t.level === 'province');
    for (const t of provinces) {
        const contribs = contribByTerritory.get(t._id.toString()) || [];
        const activeContribs = contribs.filter(c => {
            const start = c.start_year || -5000;
            const end = c.end_year || 3000;
            return year >= start && year <= end;
        });
        
        const countryIds = [...new Set(activeContribs.map(c => c.country_id.toString()))];
        
        if (countryIds.length === 0) {
            provinceStatus.set(t._id.toString(), 'empty');
        } else if (countryIds.length === 1) {
            provinceStatus.set(t._id.toString(), 'painted');
            painted.add(t._id.toString());
        } else {
            provinceStatus.set(t._id.toString(), 'city_only');
        }
    }
    
    // PASS 1.5: city_only + childCount=0 → painted
    const cities = innerTerrs.filter(t => t.level === 'city' || !t.level);
    provinceStatus.forEach((status, provId) => {
        if (status !== 'city_only') return;
        const prov = innerTerrs.find(t => t._id.toString() === provId);
        if (!prov || !prov.bbox) return;
        const pb = prov.bbox;
        const childCount = cities.filter(c => {
            if (!c.bbox) return false;
            const cLat = (c.bbox.minLat + c.bbox.maxLat) / 2;
            const cLng = (c.bbox.minLng + c.bbox.maxLng) / 2;
            return cLat >= pb.minLat && cLat <= pb.maxLat && cLng >= pb.minLng && cLng <= pb.maxLng;
        }).length;
        if (childCount === 0) {
            provinceStatus.set(provId, 'painted_by_1.5');
            painted.add(provId);
        }
    });
    
    // PASS 2: city (skip if parent province painted)
    for (const t of cities) {
        if (!t.bbox) continue;
        const cLat = (t.bbox.minLat + t.bbox.maxLat) / 2;
        const cLng = (t.bbox.minLng + t.bbox.maxLng) / 2;
        const parentProvince = provinces.find(p => {
            if (!p.bbox) return false;
            return cLat >= p.bbox.minLat && cLat <= p.bbox.maxLat &&
                   cLng >= p.bbox.minLng && cLng <= p.bbox.maxLng;
        });
        
        const contribs = contribByTerritory.get(t._id.toString()) || [];
        const activeContribs = contribs.filter(c => {
            const start = c.start_year || -5000;
            const end = c.end_year || 3000;
            return year >= start && year <= end;
        });
        
        if (parentProvince && painted.has(parentProvince._id.toString())) {
            // skip - parent painted
        } else if (activeContribs.length > 0) {
            painted.add(t._id.toString());
        }
    }
    
    // PASS 3: country는 배경이므로 생략
    
    console.log(`\n내몽골 영역 province 상태:`);
    provinceStatus.forEach((status, provId) => {
        const t = innerTerrs.find(t => t._id.toString() === provId);
        console.log(`  ${t ? t.name : provId}: ${status}`);
    });
    
    const unpainted = innerTerrs.filter(t => !painted.has(t._id.toString()) && t.level !== 'country');
    console.log(`\n색칠 안 된 영토 (country 제외): ${unpainted.length}개`);
    for (const t of unpainted) {
        const contribs = contribByTerritory.get(t._id.toString()) || [];
        console.log(`  ${t.name} [${t.level}] — contributions: ${contribs.length}개`);
    }
    
    await client.close();
}

main().catch(console.error);
