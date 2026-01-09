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
        collections.territoryCache = db.collection("territory_cache"); // 🚩 [추가] 영토 캐시 컬렉션
        collections.naturalFeatures = db.collection("natural_features"); // 🚩 [추가] 자연 지형지물 컬렉션 (강, 산맥 등)
        collections.loginLogs = db.collection("login_logs"); // 🚩 [추가] 로그인 로그 컬렉션 초기화
    collections.pageViews = db.collection("page_views"); // 🚩 [추가] 페이지 뷰 통계 컬렉션 초기화

        return { db, collections };
    } catch (err) {
        console.error("MongoDB 연결 실패:", err);
        process.exit(1); // DB 연결에 실패하면 프로세스를 종료합니다.
    }
}

module.exports = { connectToDatabase, collections };