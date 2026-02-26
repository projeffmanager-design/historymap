// /Users/jeffhwang/Documents/KoreaHistory/db.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error("MONGO_URI 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.");
}

const client = new MongoClient(mongoUri);
let db;
const collections = {};

async function connectToDatabase() {
    if (db) {
        return { db, collections };
    }
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
        } catch (indexError) {
            console.warn("⚠️ Index creation warning (may already exist):", indexError.message);
        }

        return { db, collections };
    } catch (err) {
        console.error("MongoDB 연결 실패:", err);
        process.exit(1); // DB 연결에 실패하면 프로세스를 종료합니다.
    }
}

module.exports = { connectToDatabase, collections };