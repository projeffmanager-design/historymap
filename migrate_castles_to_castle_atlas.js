const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI; // MongoDB Atlas 연결 URI
const client = new MongoClient(uri);

async function migrateCastlesToCastleAtlas() {
    try {
        await client.connect();
        console.log("MongoDB Atlas에 연결되었습니다.");

        const db = client.db("realhistory");
        const castlesCollection = db.collection("castles");
        const castleCollection = db.collection("castle");

        // castles 컬렉션에서 모든 문서 가져오기
        const castles = await castlesCollection.find({}).toArray();

        if (castles.length === 0) {
            console.log("castles 컬렉션에 데이터가 없습니다.");
            return;
        }

        console.log(`${castles.length}개의 문서를 castle 컬렉션으로 마이그레이션합니다.`);

        // 중복 방지를 위해 기존 castle 컬렉션의 _id를 가져옴
        const existingIds = await castleCollection.find({}, { projection: { _id: 1 } }).toArray();
        const existingIdSet = new Set(existingIds.map(doc => doc._id.toString()));

        // 중복되지 않은 문서만 삽입
        const newCastles = castles.filter(doc => !existingIdSet.has(doc._id.toString()));

        if (newCastles.length === 0) {
            console.log("모든 문서가 이미 castle 컬렉션에 존재합니다. 마이그레이션할 데이터가 없습니다.");
            return;
        }

        const result = await castleCollection.insertMany(newCastles);
        console.log(`${result.insertedCount}개의 문서가 성공적으로 마이그레이션되었습니다.`);

    } catch (error) {
        console.error("마이그레이션 중 오류 발생:", error);
    } finally {
        await client.close();
        console.log("MongoDB Atlas 연결이 종료되었습니다.");
    }
}

migrateCastlesToCastleAtlas();