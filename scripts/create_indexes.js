// scripts/create_indexes.js
// MongoDB 컬렉션에 성능 최적화를 위한 인덱스 생성

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error("MONGO_URI 환경 변수가 설정되지 않았습니다.");
}

async function createIndexes() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log("✅ MongoDB 연결 성공\n");
        
        const db = client.db('realhistory');
        
        // 인덱스 생성 헬퍼 함수 (이미 존재하면 스킵)
        async function createIndexSafe(collection, indexSpec, options) {
            try {
                await collection.createIndex(indexSpec, options);
                console.log(`  ✓ ${options.name} 인덱스 생성`);
            } catch (error) {
                if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
                    console.log(`  ⚠️  ${options.name} 인덱스 이미 존재 (스킵)`);
                } else {
                    throw error;
                }
            }
        }
        
        // ============================================
        // 1. CASTLE (성/위치) - 가장 자주 쿼리됨
        // ============================================
        console.log("📍 castle 컬렉션 인덱스 생성...");
        const castle = db.collection('castle');
        
        await createIndexSafe(castle, { country_id: 1 }, { name: 'idx_country_id' });
        
        await createIndexSafe(castle, { built_year: 1, destroyed_year: 1 }, { name: 'idx_time_range' });
        
        await createIndexSafe(castle, { is_capital: 1 }, { sparse: true, name: 'idx_capital' });
        
        await createIndexSafe(castle, { is_battle: 1 }, { sparse: true, name: 'idx_battle' });
        
        await createIndexSafe(castle, { name: 1 }, { name: 'idx_name' });
        
        await createIndexSafe(castle, { location: '2dsphere' }, { name: 'idx_location_geo' });
        
        // ============================================
        // 2. TERRITORIES (영토 폴리곤) - 20MB 대용량
        // ============================================
        console.log("\n🗺️  territories 컬렉션 인덱스 생성...");
        const territories = db.collection('territories');
        
        await createIndexSafe(
            territories,
            { 'bbox.minLat': 1, 'bbox.maxLat': 1, 'bbox.minLng': 1, 'bbox.maxLng': 1 },
            { name: 'idx_bbox_bounds' }
        );
        
        await createIndexSafe(territories, { start_year: 1, end_year: 1 }, { name: 'idx_time_range' });
        
        await createIndexSafe(territories, { name: 1 }, { name: 'idx_name' });
        
        // ============================================
        // 3. COUNTRIES (국가)
        // ============================================
        console.log("\n🏛️  countries 컬렉션 인덱스 생성...");
        const countries = db.collection('countries');
        
        // unique 제거 (중복 데이터 있음)
        await createIndexSafe(countries, { name: 1 }, { name: 'idx_name' });
        
        await createIndexSafe(countries, { ethnicity: 1 }, { name: 'idx_ethnicity' });
        
        await createIndexSafe(countries, { start_year: 1, end_year: 1 }, { name: 'idx_time_range' });
        
        // ============================================
        // 4. HISTORY (역사 기록)
        // ============================================
        console.log("\n📜 history 컬렉션 인덱스 생성...");
        const history = db.collection('history');
        
        await createIndexSafe(history, { year: 1, month: 1 }, { name: 'idx_year_month' });
        
        await createIndexSafe(history, { castle_id: 1 }, { name: 'idx_castle_id' });
        
        await createIndexSafe(history, { country_id: 1 }, { name: 'idx_country_id' });
        
        await createIndexSafe(history, { is_battle: 1 }, { sparse: true, name: 'idx_battle' });
        
        // ============================================
        // 5. EVENTS (이벤트)
        // ============================================
        console.log("\n🎯 events 컬렉션 인덱스 생성...");
        const events = db.collection('events');
        
        await createIndexSafe(events, { year: 1, month: 1 }, { name: 'idx_year_month' });
        
        await createIndexSafe(events, { country_id: 1 }, { name: 'idx_country_id' });
        
        // ============================================
        // 6. KINGS (왕/통치자)
        // ============================================
        console.log("\n👑 kings 컬렉션 인덱스 생성...");
        const kings = db.collection('kings');
        
        await createIndexSafe(kings, { country_id: 1 }, { name: 'idx_country_id' });
        
        // ============================================
        // 7. DRAWINGS (그리기/강/산맥)
        // ============================================
        console.log("\n✏️  drawings 컬렉션 인덱스 생성...");
        const drawings = db.collection('drawings');
        
        await createIndexSafe(drawings, { start_year: 1, end_year: 1 }, { name: 'idx_time_range' });
        
        await createIndexSafe(drawings, { type: 1 }, { name: 'idx_type' });
        
        // ============================================
        // 8. USERS (사용자)
        // ============================================
        console.log("\n👤 users 컬렉션 인덱스 생성...");
        const users = db.collection('users');
        
        // unique는 애플리케이션 단에서 처리 (스키마 변경 위험 방지)
        await createIndexSafe(users, { username: 1 }, { name: 'idx_username' });
        
        await createIndexSafe(users, { role: 1 }, { name: 'idx_role' });
        
        // ============================================
        // 9. LOGIN_LOGS (로그인 로그)
        // ============================================
        console.log("\n📊 login_logs 컬렉션 인덱스 생성...");
        const loginLogs = db.collection('login_logs');
        
        await createIndexSafe(loginLogs, { username: 1 }, { name: 'idx_username' });
        
        await createIndexSafe(loginLogs, { timestamp: -1 }, { name: 'idx_timestamp_desc' });
        
        // TTL 인덱스: 90일 후 자동 삭제
        await createIndexSafe(
            loginLogs,
            { timestamp: 1 }, 
            { expireAfterSeconds: 7776000, name: 'idx_ttl_90days' }
        );
        
        // ============================================
        // 10. PAGE_VIEWS (페이지 뷰 통계)
        // ============================================
        console.log("\n📈 page_views 컬렉션 인덱스 생성...");
        const pageViews = db.collection('page_views');
        
        await createIndexSafe(pageViews, { path: 1, date: -1 }, { name: 'idx_path_date' });
        
        await createIndexSafe(pageViews, { date: -1 }, { name: 'idx_date_desc' });
        
        // ============================================
        // 완료 메시지
        // ============================================
        console.log("\n" + "=".repeat(50));
        console.log("✅ 모든 인덱스 생성 완료!");
        console.log("=".repeat(50));
        
        // 인덱스 통계 출력
        console.log("\n📊 인덱스 통계:");
        const collections = [
            'castle', 'territories', 'countries', 'history', 
            'events', 'kings', 'drawings', 'users', 'login_logs', 'page_views'
        ];
        
        for (const collName of collections) {
            const coll = db.collection(collName);
            const indexes = await coll.indexes();
            console.log(`  ${collName}: ${indexes.length}개 인덱스`);
        }
        
    } catch (error) {
        console.error("\n❌ 인덱스 생성 중 오류:", error);
        process.exit(1);
    } finally {
        await client.close();
        console.log("\n🔌 MongoDB 연결 종료");
    }
}

createIndexes();
