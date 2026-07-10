// /Users/jeffhwang/Documents/KoreaHistory/db.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error("MONGO_URI 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.");
}

const clientOptions = {
    serverSelectionTimeoutMS: 30000,   // 서버 선택 대기 30초
    connectTimeoutMS: 30000,           // 연결 대기 30초
    socketTimeoutMS: 300000,           // 소켓 유지 5분 (대용량 castle 전체 조회 대응)
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    maxPoolSize: 10,
    minPoolSize: 2
};
const client = new MongoClient(mongoUri, clientOptions);
let db;
const collections = {};

async function connectToDatabase() {
    if (db) {
        return { db, collections };
    }
    const maxAttempts = 3;
    const baseDelay = 500; // ms
    let attempt = 0;
    while (attempt < maxAttempts) {
        attempt++;
        try {
            await client.connect();
            console.log("MongoDB에 성공적으로 연결되었습니다!");
            db = client.db("realhistory");

            // 컬렉션 초기화
            collections.castle = db.collection("castle");
            collections.castles = db.collection("castle"); // 🚩 [추가] 별칭 (복수형)
            collections.countries = db.collection("countries");
            collections.history = db.collection("history");
            collections.kings = db.collection("kings");
            collections.users = db.collection("users");
            collections.general = db.collection("general");
            collections.events = db.collection("events");
            collections.drawings = db.collection("drawings");
            collections.territories = db.collection("territories"); // 🚩 [추가] 영토 폴리곤 컬렉션
            collections.territory_tiles = db.collection("territory_tiles"); // 🚩 [추가] 영토 타일 컬렉션 (Topojson 압축)
            collections.territoryCache = db.collection("territory_cache"); // 🚩 [추가] 영토 캐시 컬렉션
            collections.naturalFeatures = db.collection("natural_features"); // 🚩 [추가] 자연 지형지물 컬렉션 (강, 산맥 등)
            collections.contributions = db.collection("contributions"); // 🚩 [추가] 기여 컬렉션 초기화
            collections.loginLogs = db.collection("login_logs"); // 🚩 [추가] 로그인 로그 컬렉션 초기화
            collections.pageViews = db.collection("page_views"); // 🚩 [추가] 페이지 뷰 통계 컬렉션 초기화
            collections.layerSettings = db.collection("layer_settings"); // 🚩 [추가] 레이어 설정 컬렉션 초기화
            collections.markerComments = db.collection("marker_comments"); // 🚩 [추가] 마커 의견(코멘트) 컬렉션
            collections.activityLogs = db.collection("activity_logs"); // 🚩 [추가] 액티비티 로그 컬렉션
            collections.sourceRecords = db.collection("source_records"); // 🚩 [추가] 사료 원전 기록 컬렉션
            collections.voice = db.collection("voice"); // 🚩 [추가] 마커 음성 컬렉션
            collections.siteSettings = db.collection("site_settings"); // 🚩 [추가] 사이트 전역 설정 컬렉션
            collections.quizzes = db.collection("quizzes"); // 🚩 [추가] 사관 역사 퀴즈 컬렉션
            collections.cards = db.collection("cards");     // 🚩 [추가] 사관 보감(카드 도감) 컬렉션
            collections.adMarkers = db.collection("ad_markers"); // 📢 [추가] 관리자 생성 지도 광고 마커 컬렉션
            collections.heroPositions = db.collection("hero_positions"); // 🦸 [추가] 영웅 연도별 위치 컬렉션
            collections.heroComments = db.collection("hero_comments");   // 🦸 [추가] 영웅 사관 댓글 컬렉션

            // 🚩 [추가] 지리 공간 인덱스 생성
            try {
                // territories 컬렉션에 2dsphere 인덱스 생성
                await collections.territories.createIndex({ "geometry": "2dsphere" });
                console.log("✅ Territories collection 2dsphere index created");

                // natural_features 컬렉션에 2dsphere 인덱스 생성
                await collections.naturalFeatures.createIndex({ "geometry": "2dsphere" });
                console.log("✅ Natural features collection 2dsphere index created");

                // castle 컬렉션에 2dsphere 인덱스 생성 (location 필드)
                await collections.castle.createIndex({ "location": "2dsphere" });
                console.log("✅ Castle collection 2dsphere index created");

                // hero_positions 컬렉션에 2dsphere + 연도 복합 인덱스
                await collections.heroPositions.createIndex({ "geometry": "2dsphere" });
                await collections.heroPositions.createIndex({ hero_id: 1, year: 1 });
                console.log("✅ Hero position indexes created");
            } catch (indexError) {
                console.warn("⚠️ Index creation warning (may already exist):", indexError.message);
            }

            return { db, collections };
        } catch (err) {
            console.error(`MongoDB 연결 실패 (시도 ${attempt}/${maxAttempts}):`, err && err.message ? err.message : err);
            if (attempt < maxAttempts) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`재시도: ${delay}ms 후 재연결 시도합니다...`);
                await new Promise(res => setTimeout(res, delay));
                continue;
            }
            console.error("MongoDB 연결에 여러 번 실패했습니다. 프로세스를 종료합니다.");
            process.exit(1);
        }
    }
}

// 연결이 끊어졌을 때 강제 재연결 (타임아웃 후 재빌드 재시도용)
async function reconnectDatabase() {
    try {
        db = null; // 기존 연결 상태 초기화
        await client.close(true).catch(() => {}); // 기존 소켓 강제 종료
    } catch (e) { /* 무시 */ }
    return connectToDatabase();
}

module.exports = { connectToDatabase, reconnectDatabase, collections };
