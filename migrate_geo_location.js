/**
 * migrate_geo_location.js
 * ─────────────────────────────────────────────────────────────
 * castle / contributions 컬렉션의 lat/lng 필드를 GeoJSON Point
 * location 필드로 변환하고, 2dsphere 인덱스를 생성합니다.
 *
 * 실행: node migrate_geo_location.js
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: './env' });
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DB_NAME   = 'realhistory';

async function run() {
    if (!MONGO_URI) {
        console.error('❌ MONGODB_URI 환경변수가 없습니다. env 파일을 확인하세요.');
        process.exit(1);
    }

    const client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log('✅ MongoDB 연결 성공');

    const db = client.db(DB_NAME);

    // ──────────────────────────────────────────────
    // 1. castle 컬렉션 마이그레이션
    // ──────────────────────────────────────────────
    await migrateCollection(db, 'castle',        'castle');
    await migrateCollection(db, 'contributions', 'contribution');

    // ──────────────────────────────────────────────
    // 2. 인덱스 생성
    // ──────────────────────────────────────────────
    await ensureIndex(db, 'castle',        'idx_location_geo');
    await ensureIndex(db, 'contributions', 'idx_location_geo');

    await client.close();
    console.log('\n🎉 마이그레이션 완료!');
}

/**
 * lat/lng → location: GeoJSON Point 변환
 * location 필드가 이미 있는 문서는 건너뜁니다.
 */
async function migrateCollection(db, collectionName, label) {
    const col = db.collection(collectionName);

    // location 필드가 없고 lat/lng이 있는 문서만 대상
    const cursor = col.find({
        location: { $exists: false },
        lat: { $exists: true, $ne: null },
        lng: { $exists: true, $ne: null }
    });

    const total = await col.countDocuments({
        location: { $exists: false },
        lat: { $exists: true, $ne: null },
        lng: { $exists: true, $ne: null }
    });

    console.log(`\n📦 [${collectionName}] 변환 대상: ${total}개`);
    if (total === 0) {
        console.log(`   → 이미 모두 변환되어 있습니다.`);
        return;
    }

    let updated = 0;
    let skipped = 0;

    const BATCH = 500;
    const ops   = [];

    for await (const doc of cursor) {
        const lat = parseFloat(doc.lat);
        const lng = parseFloat(doc.lng);

        // 유효 좌표 범위 체크
        if (isNaN(lat) || isNaN(lng) ||
            lat < -90 || lat > 90 ||
            lng < -180 || lng > 180) {
            console.warn(`   ⚠️  [${doc._id}] "${doc.name}" 좌표 범위 이상 (lat=${doc.lat}, lng=${doc.lng}) — 건너뜀`);
            skipped++;
            continue;
        }

        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: {
                    $set: {
                        location: {
                            type: 'Point',
                            coordinates: [lng, lat]   // GeoJSON: [경도, 위도] 순서!
                        }
                    }
                }
            }
        });

        if (ops.length >= BATCH) {
            const result = await col.bulkWrite(ops, { ordered: false });
            updated += result.modifiedCount;
            process.stdout.write(`   → ${updated}/${total} 완료...\r`);
            ops.length = 0;
        }
    }

    // 나머지 처리
    if (ops.length > 0) {
        const result = await col.bulkWrite(ops, { ordered: false });
        updated += result.modifiedCount;
    }

    console.log(`   ✅ ${updated}개 변환 완료, ${skipped}개 건너뜀`);
}

/**
 * 2dsphere 인덱스 생성 (이미 있으면 건너뜀)
 */
async function ensureIndex(db, collectionName, indexName) {
    const col = db.collection(collectionName);

    // 기존 인덱스 목록 확인
    const indexes = await col.indexes();
    const exists  = indexes.some(i => i.name === indexName);

    if (exists) {
        // 인덱스는 있지만 실제로 location 데이터가 채워졌으므로 drop → 재생성으로 정합성 보장
        console.log(`\n🔄 [${collectionName}] "${indexName}" 인덱스 재생성 중...`);
        try {
            await col.dropIndex(indexName);
        } catch (e) {
            console.warn(`   ⚠️  drop 실패 (무시): ${e.message}`);
        }
    } else {
        console.log(`\n🔧 [${collectionName}] "${indexName}" 인덱스 신규 생성 중...`);
    }

    await col.createIndex(
        { location: '2dsphere' },
        { name: indexName, background: true }
    );
    console.log(`   ✅ [${collectionName}] 2dsphere 인덱스 준비 완료`);
}

run().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
