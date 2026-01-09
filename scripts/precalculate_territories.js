// 영토별 지배 국가를 시대별로 사전 계산하는 스크립트
const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = "korea_history";

// 특정 연도/월의 모든 영토 계산
async function precalculateForPeriod(client, year, month = null) {
    const db = client.db(dbName);
    const territories = db.collection("territories");
    const castles = db.collection("castles");
    const countries = db.collection("countries");
    const territoryCache = db.collection("territory_cache");

    console.log(`\n📅 ${year}년 ${month ? month + '월' : ''} 계산 시작...`);

    // 해당 시기의 모든 성 데이터 가져오기
    const query = month 
        ? { startYear: { $lte: year }, endYear: { $gte: year }, startMonth: { $lte: month }, endMonth: { $gte: month } }
        : { startYear: { $lte: year }, endYear: { $gte: year } };
    
    const castlesList = await castles.find(query).toArray();
    console.log(`  🏰 마커 ${castlesList.length}개 로드됨`);

    // 모든 영토 순회
    const territoriesList = await territories.find({}).toArray();
    console.log(`  🗺️  영토 ${territoriesList.length}개 처리 시작`);

    let processed = 0;
    const bulkOps = [];

    for (const territory of territoriesList) {
        const dominantResult = calculateDominantCountry(territory, castlesList);
        
        if (!dominantResult) {
            // 마커가 없는 영토는 캐시에서 삭제
            bulkOps.push({
                deleteMany: {
                    filter: { 
                        territoryId: territory._id, 
                        year: year,
                        ...(month !== null && { month: month })
                    }
                }
            });
            continue;
        }

        // 캐시 저장 (upsert)
        const cacheDoc = {
            territoryId: territory._id,
            territoryName: territory.name,
            year: year,
            ...(month !== null && { month: month }),
            dominantCountryId: dominantResult.countryId,
            countryName: dominantResult.countryName,
            countryColor: dominantResult.color,
            markerCount: dominantResult.count,
            calculatedAt: new Date()
        };

        bulkOps.push({
            updateOne: {
                filter: { 
                    territoryId: territory._id, 
                    year: year,
                    ...(month !== null && { month: month })
                },
                update: { $set: cacheDoc },
                upsert: true
            }
        });

        processed++;
        if (processed % 50 === 0) {
            console.log(`  ⏳ ${processed}/${territoriesList.length} 처리됨...`);
        }
    }

    // Bulk write 실행
    if (bulkOps.length > 0) {
        const result = await territoryCache.bulkWrite(bulkOps);
        console.log(`  ✅ ${result.upsertedCount + result.modifiedCount}개 저장됨, ${result.deletedCount}개 삭제됨`);
    }

    return { processed, saved: bulkOps.length };
}

// 영토 내 지배 국가 계산 (기존 로직과 동일)
function calculateDominantCountry(territory, castles) {
    const geometry = territory.geojson.geometry;
    if (!geometry || !geometry.coordinates) return null;

    // 폴리곤 데이터 준비 (바운딩 박스 포함)
    let polygonData = [];
    if (geometry.type === 'Polygon') {
        const converted = geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
        const bounds = calculateBounds(converted);
        polygonData = [{ coords: converted, bounds }];
    } else if (geometry.type === 'MultiPolygon') {
        polygonData = geometry.coordinates.map(poly => {
            const converted = poly[0].map(coord => [coord[1], coord[0]]);
            const bounds = calculateBounds(converted);
            return { coords: converted, bounds };
        });
    }

    // 국가별 마커 카운트
    const countryCounts = {};

    castles.forEach(castle => {
        let isInside = false;
        
        for (const polygon of polygonData) {
            // 바운딩 박스 체크
            if (castle.lat < polygon.bounds.minLat || 
                castle.lat > polygon.bounds.maxLat ||
                castle.lng < polygon.bounds.minLng || 
                castle.lng > polygon.bounds.maxLng) {
                continue;
            }

            // Ray Casting
            if (isPointInPolygon([castle.lat, castle.lng], polygon.coords)) {
                isInside = true;
                break;
            }
        }

        if (isInside) {
            const countryId = castle.countryId?.toString() || 'unknown';
            const weight = castle.isCapital ? 3 : 1;
            countryCounts[countryId] = (countryCounts[countryId] || 0) + weight;
        }
    });

    // 최다 마커 국가 찾기
    let maxCount = 0;
    let dominantCountryId = null;

    for (const [countryId, count] of Object.entries(countryCounts)) {
        if (count > maxCount) {
            maxCount = count;
            dominantCountryId = countryId;
        }
    }

    if (!dominantCountryId) return null;

    // 국가 정보 찾기
    const castle = castles.find(c => c.countryId?.toString() === dominantCountryId);
    if (!castle) return null;

    return {
        countryId: new ObjectId(dominantCountryId),
        countryName: castle.countryName,
        color: castle.countryColor,
        count: maxCount
    };
}

function calculateBounds(coords) {
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    for (const [lat, lng] of coords) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
    }
    return { minLat, maxLat, minLng, maxLng };
}

function isPointInPolygon(point, polygon) {
    const [lat, lng] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [latI, lngI] = polygon[i];
        const [latJ, lngJ] = polygon[j];
        const intersect = ((lngI > lng) !== (lngJ > lng)) &&
            (lat < (latJ - latI) * (lng - lngI) / (lngJ - lngI) + latI);
        if (intersect) inside = !inside;
    }
    return inside;
}

// 연도 범위 계산
async function precalculateYearRange(client, startYear, endYear, monthGranularity = false) {
    console.log(`\n🚀 사전 계산 시작: ${startYear}년 ~ ${endYear}년`);
    console.log(`   세분화: ${monthGranularity ? '월별' : '연도별'}`);

    const totalYears = endYear - startYear + 1;
    let completed = 0;

    for (let year = startYear; year <= endYear; year++) {
        if (monthGranularity) {
            for (let month = 1; month <= 12; month++) {
                await precalculateForPeriod(client, year, month);
            }
        } else {
            await precalculateForPeriod(client, year, null);
        }
        
        completed++;
        const progress = (completed / totalYears * 100).toFixed(1);
        console.log(`\n📊 전체 진행률: ${completed}/${totalYears} (${progress}%)`);
    }

    console.log(`\n✅ 모든 계산 완료!`);
}

// 메인 실행
async function main() {
    const client = new MongoClient(uri);
    
    try {
        await client.connect();
        console.log("✅ MongoDB 연결 성공");

        // 인덱스 생성 (성능 최적화)
        const db = client.db(dbName);
        const territoryCache = db.collection("territory_cache");
        
        await territoryCache.createIndex({ territoryId: 1, year: 1, month: 1 }, { unique: true });
        await territoryCache.createIndex({ year: 1, month: 1 });
        console.log("✅ 인덱스 생성 완료");

        // CLI 인자 파싱
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            console.log("\n사용법:");
            console.log("  node precalculate_territories.js <시작년도> <종료년도> [--monthly]");
            console.log("\n예시:");
            console.log("  node precalculate_territories.js -100 2000          # -100년~2000년 (연도별)");
            console.log("  node precalculate_territories.js 1000 1500 --monthly # 1000년~1500년 (월별)");
            console.log("  node precalculate_territories.js 668 668              # 668년만 계산");
            process.exit(0);
        }

        const startYear = parseInt(args[0]);
        const endYear = parseInt(args[1] || args[0]);
        const monthly = args.includes('--monthly');

        await precalculateYearRange(client, startYear, endYear, monthly);

        // 통계 출력
        const totalCached = await territoryCache.countDocuments();
        console.log(`\n📈 캐시 통계:`);
        console.log(`   전체 캐시 항목: ${totalCached}개`);

    } catch (error) {
        console.error("❌ 오류 발생:", error);
        throw error;
    } finally {
        await client.close();
        console.log("\n👋 MongoDB 연결 종료");
    }
}

main().catch(console.error);
