const { MongoClient } = require('mongodb');

const uri = "mongodb://localhost:27017"; // MongoDB 연결 URI
const client = new MongoClient(uri);

async function migrateCastles() {
    try {
        await client.connect();
        console.log("MongoDB에 연결되었습니다.");

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

        // castle 컬렉션에 데이터 삽입
        const result = await castleCollection.insertMany(castles);
        console.log(`${result.insertedCount}개의 문서가 성공적으로 마이그레이션되었습니다.`);

        // 필요하다면, 기존 castles 컬렉션 삭제
        // await castlesCollection.drop();
        // console.log("castles 컬렉션이 삭제되었습니다.");
    } catch (error) {
        console.error("마이그레이션 중 오류 발생:", error);
    } finally {
        await client.close();
        console.log("MongoDB 연결이 종료되었습니다.");
    }
}

migrateCastles();