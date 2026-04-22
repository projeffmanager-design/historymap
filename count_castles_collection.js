const { MongoClient } = require('mongodb');

const uri = "mongodb://localhost:27017"; // MongoDB 연결 URI
const client = new MongoClient(uri);

async function countCastlesCollection() {
    try {
        await client.connect();
        console.log("MongoDB에 연결되었습니다.");

        const db = client.db("realhistory");
        const castlesCollection = db.collection("castles");

        // castles 컬렉션의 문서 수 세기
        const count = await castlesCollection.countDocuments();

        console.log(`castles 컬렉션에 ${count}개의 문서가 있습니다.`);
    } catch (error) {
        console.error("castles 컬렉션 문서 수 확인 중 오류 발생:", error);
    } finally {
        await client.close();
        console.log("MongoDB 연결이 종료되었습니다.");
    }
}

countCastlesCollection();