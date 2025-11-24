// server.js
require('dotenv').config(); // .env 파일의 환경 변수를 로드합니다.
const express = require('express');
const { ObjectId } = require('mongodb');
// 💡 [추가] 인증 관련 라이브러리
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const { connectToDatabase, collections } = require('./db'); // 🚩 [추가] DB 연결 모듈

const app = express();
const port = 3000;
// 💡 [추가] JWT 시크릿 키 환경 변수 확인
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    throw new Error("JWT_SECRET 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.");
}
let isAppSetup = false; // Flag to ensure setup runs only once

// 헬퍼 함수: ID를 MongoDB의 ObjectId로 변환 (전역으로 이동)
const toObjectId = (id) => {
    if (id && ObjectId.isValid(id)) {
        return new ObjectId(id);
    }
    return null;
}

// 💡 [추가] 인증 미들웨어
const verifyToken = (req, res, next) => { // (전역으로 이동)
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ message: "인증 토큰이 없습니다." });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            return res.status(403).json({ message: "유효하지 않은 토큰입니다." });
        }
        req.user = user;
        next();
    });
};

const verifyAdmin = (req, res, next) => { // (전역으로 이동)
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: "인증 토큰이 없습니다." });

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.status(403).json({ message: "유효하지 않은 토큰입니다." });
        
        if (user.role !== 'admin' && user.role !== 'superuser') {
            return res.status(403).json({ message: "관리자 권한이 필요합니다." });
        }
        req.user = user;
        next();
    });
};

const verifyAdminOnly = (req, res, next) => { // (전역으로 이동)
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: "인증 토큰이 없습니다." });

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.status(403).json({ message: "유효하지 않은 토큰입니다." });
        
        if (user.role !== 'admin') {
            return res.status(403).json({ message: "회원 관리자(admin) 권한이 필요합니다." });
        }
        req.user = user;
        next();
    });
};

const verifySuperuser = (req, res, next) => { // (전역으로 이동)
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: "인증 토큰이 없습니다." });

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.status(403).json({ message: "유효하지 않은 토큰입니다." });
        
        if (user.role !== 'superuser') {
            return res.status(403).json({ message: "최상위 관리자(superuser) 권한이 필요합니다." });
        }
        req.user = user;
        next();
    });
};

app.use(cors()); // 모든 도메인에서 요청 허용 (개발용)
app.use(express.json());
// 💡 [수정] Express 앱에서 정적 파일을 제공하는 경로를 'public' 폴더에서 프로젝트 루트로 변경합니다.
// 이제 index.html, admin.html 등을 루트 디렉토리에서 직접 서비스할 수 있습니다.
app.use(express.static(__dirname));

// This function will set up all the routes and collections
async function setupRoutesAndCollections() {
    if (isAppSetup) {
        return; // Already set up
    }
    await connectToDatabase(); // 🚩 [수정] DB 연결 및 컬렉션 초기화

        // ----------------------------------------------------
        // 🏰 CASTLE (성/위치) API 엔드포인트
        // ----------------------------------------------------

        // GET: 모든 성 정보 반환
        app.get('/api/castle', verifyToken, async (req, res) => { // (collections.castle로 변경)
            try {
                const castles = await collections.castle.find({}).toArray();

                // Normalize each castle for backward compatibility: if `history` is missing,
                // derive a minimal history array from legacy fields so the client works
                const normalized = castles.map(castle => {
                    try {
                        if (Array.isArray(castle.history) && castle.history.length > 0) return castle;

                        const h = {};
                        h.name = castle.name || '';
                        // prefer existing country_id; preserve country name if present
                        if (castle.country_id) h.country_id = castle.country_id;
                        else if (castle.country) h.country_name = castle.country;

                        h.start_year = castle.built_year ?? castle.built ?? castle.start ?? null;
                        h.start_month = castle.built_month ?? castle.start_month ?? 1;
                        h.end_year = castle.destroyed_year ?? castle.destroyed ?? castle.end ?? null;
                        h.end_month = castle.destroyed_month ?? castle.end_month ?? 12;
                        h.is_capital = !!castle.is_capital;

                        // Attach a derived history array without mutating DB
                        return { ...castle, history: [h] };
                    } catch (e) {
                        // On any problem just return original castle
                        return castle;
                    }
                });

                res.json(normalized);
            } catch (error) {
                console.error("Castle 조회 중 오류:", error);
                res.status(500).json({ message: "Castle 조회 실패", error: error.message });
            }
        });

        // POST: 성 정보 추가
        // 🚩 [수정] 일반 사용자도 성을 추가할 수 있도록 verifyAdmin을 verifyToken으로 변경
        app.post('/api/castle', verifyToken, async (req, res) => {
            try {
                const newCastle = req.body;
                if (newCastle._id) delete newCastle._id; 
                
                // 🚨 [필수 수정]: 클라이언트가 countryId를 보내도록 가정
                newCastle.country_id = toObjectId(newCastle.country_id); 
                // 기존 newCastle.country 필드가 있다면 삭제 (마이그레이션 구조 유지)
                if (newCastle.country) delete newCastle.country;

                const result = await collections.castle.insertOne(newCastle);
                res.status(201).json({ message: "Castle 추가 성공", id: result.insertedId.toString() });
            } catch (error) {
                console.error("Castle 추가 중 오류:", error);
                res.status(500).json({ message: "Castle 추가 실패", error: error.message });
            }
        });

        // PUT: 성 정보 업데이트
        // 🚩 [수정] 일반 사용자도 성을 수정할 수 있도록 verifyAdmin을 verifyToken으로 변경
        app.put('/api/castle/:id', verifyToken, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

                const updatedCastle = req.body;
                if (updatedCastle._id) delete updatedCastle._id; 

                // 🚨 [필수 수정]: 클라이언트가 country_id를 보냈다면 ObjectId로 변환하여 업데이트
                if (updatedCastle.country_id) {
                    updatedCastle.country_id = toObjectId(updatedCastle.country_id);
                }
                // country 필드가 넘어온다면 삭제 (ID 기반 구조 유지)
                if (updatedCastle.country) delete updatedCastle.country;

                // ✨ [수정] history 배열 내의 country_id를 ObjectId로 변환
                if (Array.isArray(updatedCastle.history)) {
                    updatedCastle.history.forEach(h => {
                        // history 항목에 country_id가 있고, 유효한 ObjectId 문자열이 아닌 경우 변환
                        if (h.country_id && typeof h.country_id === 'string') {
                            h.country_id = toObjectId(h.country_id);
                        }
                    });
                }
                
                const result = await collections.castle.updateOne(
                    { _id: _id },
                    { $set: updatedCastle }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: "성을 찾을 수 없습니다." });
                }

                res.json({ message: "Castle 정보 업데이트 성공" });
            } catch (error) {
                console.error("Castle 정보 업데이트 중 오류:", error);
                res.status(500).json({ message: "Castle 정보 업데이트 실패", error: error.message });
            }
        });
        
        // DELETE: 성 정보 삭제
        app.delete('/api/castle/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

                const result = await collections.castle.deleteOne({ _id: _id });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ message: "성을 찾을 수 없습니다." });
                }

                res.json({ message: "Castle 정보 삭제 성공" });
            } catch (error) {
                console.error("Castle 정보 삭제 중 오류:", error);
                res.status(500).json({ message: "Castle 정보 삭제 실패", error: error.message });
            }
        });

// ----------------------------------------------------
// ⚔️ GENERAL (장수) API 엔드포인트 (NEW)
// ----------------------------------------------------

// GET: 모든 장수 정보 반환
app.get('/api/general', verifyToken, async (req, res) => {
    try {
        const generals = await collections.general.find({}).toArray();
        res.json(generals);
    } catch (error) {
        console.error("General 조회 중 오류:", error);
        res.status(500).json({ message: "General 조회 실패", error: error.message });
    }
});

// POST: 장수 정보 추가
app.post('/api/general', verifyAdmin, async (req, res) => {
    try {
        const newGeneral = req.body;
        if (newGeneral._id) delete newGeneral._id;
        const result = await collections.general.insertOne(newGeneral);
        res.status(201).json({ message: "General 추가 성공", id: result.insertedId.toString() });
    } catch (error) {
        console.error("General 저장 중 오류:", error);
        res.status(500).json({ message: "General 저장 실패", error: error.message });
    }
});

// PUT: 장수 정보 수정 (ObjectId 사용)
app.put('/api/general/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updatedGeneral = req.body;
        if (updatedGeneral._id) delete updatedGeneral._id;

        const result = await collections.general.updateOne(
            { _id: toObjectId(id) },
            { $set: updatedGeneral }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "장수를 찾을 수 없습니다." });
        }

        res.json({ message: "General 정보 업데이트 성공" });
    } catch (error) {
        console.error("General 정보 업데이트 중 오류:", error);
        res.status(500).json({ message: "General 정보 업데이트 실패", error: error.message });
    }
});

// DELETE: 장수 정보 삭제
app.delete('/api/general/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await collections.general.deleteOne({ _id: toObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "장수를 찾을 수 없습니다." });
        }
        res.json({ message: "General 정보 삭제 성공" });
    } catch (error) {
        console.error("General 정보 삭제 중 오류:", error);
        res.status(500).json({ message: "General 정보 삭제 실패", error: error.message });
    }
});

        // ----------------------------------------------------
        // 🌍 COUNTRIES API 엔드포인트 (생략 - 기본 기능으로 가정)
        // ----------------------------------------------------
app.get('/api/countries', verifyToken, async (req, res) => {
    try {
        const countries = await collections.countries.find({}).toArray();
        res.json(countries);
    } catch (error) {
        console.error("Country 조회 중 오류:", error);
        res.status(500).json({ message: "Country 조회 실패", error: error.message });
    }
});

// POST: 국가 정보 추가 (새 국가 저장)
app.post('/api/countries', verifyAdmin, async (req, res) => {
    try {
        const newCountry = req.body;
        if (newCountry._id) delete newCountry._id; 
        // 🚩 [추가] is_main_dynasty 필드가 boolean 타입인지 확인
        newCountry.is_main_dynasty = typeof newCountry.is_main_dynasty === 'boolean' ? newCountry.is_main_dynasty : false;
        // ✨ NEW: ethnicity 필드 추가
        newCountry.ethnicity = newCountry.ethnicity || null;

        const result = await collections.countries.insertOne(newCountry);
        // 클라이언트에서 countryOriginalName 필드를 사용하여 신규 여부를 확인하므로, 
        // 응답 시 해당 필드를 함께 반환하는 것이 좋습니다.
        res.status(201).json({ message: "Country 추가 성공", id: result.insertedId.toString(), countryOriginalName: newCountry.name }); 
    } catch (error) {
        console.error("Country 추가 중 오류:", error);
        res.status(500).json({ message: "Country 추가 실패", error: error.message });
    }
});

// PUT: 국가 정보 업데이트 (기존 국가 수정)
app.put('/api/countries/:name', verifyAdmin, async (req, res) => {
    try {
        const { name } = req.params; // 원본 국가 이름
        const updatedCountry = req.body;
        
        // 🚩 [추가] is_main_dynasty 필드가 boolean 타입인지 확인
        updatedCountry.is_main_dynasty = typeof updatedCountry.is_main_dynasty === 'boolean' ? updatedCountry.is_main_dynasty : false;
        // ✨ NEW: ethnicity 필드 추가
        updatedCountry.ethnicity = updatedCountry.ethnicity || null;
        
        // MongoDB는 국가 이름(name)을 Key로 사용하여 업데이트합니다.
        const result = await collections.countries.updateOne(
            { name: name },
            { $set: updatedCountry }
        );

        if (result.matchedCount === 0) {
            // 원본 이름이 바뀌었거나 찾을 수 없을 때
            return res.status(404).json({ message: `국가 '${name}'을(를) 찾을 수 없습니다.` });
        }

        res.json({ message: "Country 정보 업데이트 성공" });
    } catch (error) {
        console.error("Country 정보 업데이트 중 오류:", error);
        res.status(500).json({ message: "Country 정보 업데이트 실패", error: error.message });
    }
});

// DELETE: 국가 정보 삭제
app.delete('/api/countries/:name', verifyAdmin, async (req, res) => {
    try {
        const { name } = req.params;

        const result = await collections.countries.deleteOne({ name: name });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "국가를 찾을 수 없습니다." });
        }

        res.json({ message: "Country 정보 삭제 성공" });
    } catch (error) {
        console.error("Country 정보 삭제 중 오류:", error);
        res.status(500).json({ message: "Country 정보 삭제 실패", error: error.message });
    }
});

// ----------------------------------------------------
// 👑 KINGS (왕) API 엔드포인트 (수정된 로직)
// ----------------------------------------------------

// GET: 모든 왕 정보 반환 (변경 없음)
app.get('/api/kings', verifyToken, async (req, res) => {
     try {
        const kings = await collections.kings.find({}).toArray();
        res.json(kings);
     } catch (error) {
         res.status(500).json({ message: "Kings 조회 실패" });
     }
});

// POST: 왕 정보 추가 (countryName 대신 countryId 참조)
app.post('/api/kings', verifyAdmin, async (req, res) => {
    try {
        // 클라이언트에서 countryId를 받아 ObjectId로 변환합니다.
        const { countryId, ...newKing } = req.body;
        const _countryId = toObjectId(countryId); // ObjectId로 변환
        if (!_countryId) {
            return res.status(400).json({ message: "유효하지 않은 countryId 입니다." });
        }
        
        // 새로운 왕 레코드에 고유한 ObjectId를 할당합니다.
        const newKingWithId = { 
            _id: new ObjectId(), // 배열 내 객체에 새 _id 할당
            ...newKing 
        };
        
        // country_id를 기준으로 문서를 찾거나 새로 생성하고 kings 배열에 push합니다.
        const result = await collections.kings.updateOne(
            { country_id: _countryId }, // 🚨 country_id 필드로 변경
            { $push: { kings: newKingWithId } },
            { upsert: true } // 국가 문서가 없으면 새로 생성
        );

        if (result.modifiedCount === 0 && result.upsertedCount === 0) {
            throw new Error("국가 찾기/추가 실패");
        }
        
        res.status(201).json({ 
            message: "King 추가 성공", 
            id: newKingWithId._id.toString() 
        });
    } catch (error) {
        console.error("King 저장 중 오류:", error);
        res.status(500).json({ 
            message: "King 저장 실패", 
            error: error.message 
        });
    }
});
        // PUT: 왕 정보 업데이트 (기존 로직 유지, ObjectId 사용)
app.put('/api/kings/:id', verifyAdmin, async (req, res) => {
// ... 기존 PUT 로직 유지 (kings 배열 내의 _id를 찾아 업데이트)
// 이 로직은 ObjectId를 참조하므로 큰 변경 없이 사용할 수 있습니다.
    try {
        const { id } = req.params; // 수정할 왕 레코드의 _id (문자열)
        const _id = toObjectId(id); 
        if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

        const dataToUpdate = req.body;
        // 클라이언트에서 보낸 countryId는 업데이트할 필드가 아니므로 제거
        delete dataToUpdate.countryId; 
        if (dataToUpdate._id) delete dataToUpdate._id; 

        // 동적으로 $set 연산자를 구성하여, 전송된 필드만 업데이트하고 _id를 보존합니다.
        const setOperators = {};
        for (const key in dataToUpdate) {
            // 예: "kings.$[kingElem].name": dataToUpdate.name 와 같이 설정
            setOperators[`kings.$[kingElem].${key}`] = dataToUpdate[key];
        }
        
        if (Object.keys(setOperators).length === 0) {
             return res.status(400).json({ message: "업데이트할 내용이 없습니다." });
        }

        // $set 연산과 arrayFilters를 사용하여 kings 배열 내의 특정 원소의 필드만 업데이트합니다.
        const result = await collections.kings.updateOne(
            { "kings._id": _id }, 
            { $set: setOperators }, 
            {
                arrayFilters: [ { "kingElem._id": _id } ] 
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "해당 ID를 가진 왕 레코드를 찾을 수 없습니다." });
        }

        res.json({ message: "King 정보 업데이트 성공" });
    } catch (error) {
        console.error("King 정보 업데이트 중 오류:", error);
        res.status(500).json({ message: "King 정보 업데이트 실패", error: error.message });
    }
});


// DELETE: 왕 정보 삭제 (기존 로직 유지, ObjectId 사용)
app.delete('/api/kings/:id', verifyAdmin, async (req, res) => {
// ... 기존 DELETE 로직 유지 (kings 배열 내의 _id를 찾아 삭제)
    try {
        const { id } = req.params; // 삭제할 왕 레코드의 _id (문자열)
        const _id = toObjectId(id); 

        if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

        // 🎯 쿼리: kings 배열에 해당 _id를 가진 요소가 있는 문서를 찾습니다.
        const result = await collections.kings.updateOne(
            { "kings._id": _id }, 
            { $pull: { kings: { _id: _id } } }
        );
        
        if (result.modifiedCount === 0) {
             return res.status(404).json({ message: "해당 ID를 가진 왕 레코드를 찾을 수 없거나 이미 삭제되었습니다." });
        }

        res.json({ message: "King 정보 삭제 성공" });
    } catch (error) {
        console.error("King 정보 삭제 중 오류:", error);
        res.status(500).json({ message: "King 정보 삭제 실패", error: error.message });
    }
});
        // ----------------------------------------------------
        // 📜 HISTORY (역사) API 엔드포인트 (생략 - 기본 기능으로 가정)
        // ----------------------------------------------------
        app.get('/api/history', verifyToken, async (req, res) => {
             // 임시로 기본 성공 응답을 가정합니다.
             try {
                const history = await collections.history.find({}).toArray();
                res.json(history);
             } catch (error) {
                 res.status(500).json({ message: "History 조회 실패" });
             }
        });

        // POST: 새 역사 기록 추가
        app.post('/api/history', verifyAdmin, async (req, res) => {
            try {
                const newHistory = req.body;
                if (newHistory._id) delete newHistory._id;
                // 🚩 [추가] 이벤트 발생 플래그가 boolean 타입인지 확인
                newHistory.create_event = typeof newHistory.create_event === 'boolean' ? newHistory.create_event : false;

                const result = await collections.history.insertOne(newHistory);
                res.status(201).json({ message: "History 추가 성공", id: result.insertedId.toString() });
            } catch (error) {
                console.error("History 추가 중 오류:", error);
                res.status(500).json({ message: "History 추가 실패", error: error.message });
            }
        });

        // PUT: 역사 기록 업데이트
        app.put('/api/history/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

                const updatedHistory = req.body;
                if (updatedHistory._id) delete updatedHistory._id;
                // 🚩 [추가] 이벤트 발생 플래그가 boolean 타입인지 확인
                updatedHistory.create_event = typeof updatedHistory.create_event === 'boolean' ? updatedHistory.create_event : false;

                const result = await collections.history.updateOne(
                    { _id: _id },
                    { $set: updatedHistory }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: "역사 기록을 찾을 수 없습니다." });
                }

                res.json({ message: "History 정보 업데이트 성공" });
            } catch (error) {
                console.error("History 정보 업데이트 중 오류:", error);
                res.status(500).json({ message: "History 정보 업데이트 실패", error: error.message });
            }
        });

        // DELETE: 역사 기록 삭제
        app.delete('/api/history/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

                const result = await collections.history.deleteOne({ _id: _id });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ message: "역사 기록을 찾을 수 없습니다." });
                }

                res.json({ message: "History 정보 삭제 성공" });
            } catch (error) {
                console.error("History 정보 삭제 중 오류:", error);
                res.status(500).json({ message: "History 정보 삭제 실패", error: error.message });
            }
        });

        // ----------------------------------------------------
        // 🎉 EVENTS API 엔드포인트 (NEW)
        // ----------------------------------------------------

        // GET: 모든 이벤트 조회
        app.get('/api/events', verifyToken, async (req, res) => {
            try {
                const events = await collections.events.find({}).sort({ year: 1, month: 1 }).toArray();
                res.json(events);
            } catch (error) {
                console.error("Events 조회 중 오류:", error);
                res.status(500).json({ message: "Events 조회 실패", error: error.message });
            }
        });

        // POST: 새 이벤트 추가
        app.post('/api/events', verifyAdmin, async (req, res) => {
            try {
                const newEvent = req.body;
                if (newEvent._id) delete newEvent._id;
                const result = await collections.events.insertOne(newEvent);
                res.status(201).json({ message: "Event 추가 성공", id: result.insertedId.toString() });
            } catch (error) {
                console.error("Event 추가 중 오류:", error);
                res.status(500).json({ message: "Event 추가 실패", error: error.message });
            }
        });

        // PUT: 이벤트 정보 업데이트
        app.put('/api/events/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

                const updatedEvent = req.body;
                if (updatedEvent._id) delete updatedEvent._id;

                const result = await collections.events.updateOne({ _id: _id }, { $set: updatedEvent });
                if (result.matchedCount === 0) return res.status(404).json({ message: "이벤트를 찾을 수 없습니다." });
                res.json({ message: "Event 정보 업데이트 성공" });
            } catch (error) {
                console.error("Event 정보 업데이트 중 오류:", error);
                res.status(500).json({ message: "Event 정보 업데이트 실패", error: error.message });
            }
        });

        // DELETE: 이벤트 정보 삭제
        app.delete('/api/events/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });
                const result = await collections.events.deleteOne({ _id: _id });
                if (result.deletedCount === 0) return res.status(404).json({ message: "이벤트를 찾을 수 없습니다." });
                res.json({ message: "Event 정보 삭제 성공" });
            } catch (error) {
                console.error("Event 정보 삭제 중 오류:", error);
                res.status(500).json({ message: "Event 정보 삭제 실패", error: error.message });
            }
        });

        // ----------------------------------------------------
        // 🗺️ DRAWINGS API 엔드포인트 (NEW)
        // ----------------------------------------------------

        // GET: 모든 그리기 정보 조회
        app.get('/api/drawings', verifyToken, async (req, res) => {
            try {
                const drawings = await collections.drawings.find({}).toArray();
                res.json(drawings);
            } catch (error) {
                console.error("Drawings 조회 중 오류:", error);
                res.status(500).json({ message: "Drawings 조회 실패", error: error.message });
            }
        });

        // POST: 새 그리기 정보 추가
        app.post('/api/drawings', verifyAdmin, async (req, res) => {
            try {
                const newDrawing = req.body;
                if (newDrawing._id) delete newDrawing._id;
                const result = await collections.drawings.insertOne(newDrawing);
                res.status(201).json({ message: "Drawing 추가 성공", id: result.insertedId.toString() });
            } catch (error) {
                console.error("Drawing 추가 중 오류:", error);
                res.status(500).json({ message: "Drawing 추가 실패", error: error.message });
            }
        });

        // PUT: 그리기 정보 업데이트
        app.put('/api/drawings/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

                const updatedDrawing = req.body;
                if (updatedDrawing._id) delete updatedDrawing._id;

                const result = await collections.drawings.updateOne({ _id: _id }, { $set: updatedDrawing });
                if (result.matchedCount === 0) return res.status(404).json({ message: "그리기 정보를 찾을 수 없습니다." });
                res.json({ message: "Drawing 정보 업데이트 성공" });
            } catch (error) {
                console.error("Drawing 정보 업데이트 중 오류:", error);
                res.status(500).json({ message: "Drawing 정보 업데이트 실패", error: error.message });
            }
        });

        // DELETE: 그리기 정보 삭제
        app.delete('/api/drawings/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });
                const result = await collections.drawings.deleteOne({ _id: _id });
                if (result.deletedCount === 0) return res.status(404).json({ message: "그리기 정보를 찾을 수 없습니다." });
                res.json({ message: "Drawing 정보 삭제 성공" });
            } catch (error) {
                console.error("Drawing 정보 삭제 중 오류:", error);
                res.status(500).json({ message: "Drawing 정보 삭제 실패", error: error.message });
            }
        });

        // 💡 [추가] ----------------------------------------------------
        // � AUTH & USERS API 엔드포인트
        // ----------------------------------------------------

        // POST: 사용자 등록 (관리자만 가능)
        app.post('/api/auth/register', verifyAdminOnly, async (req, res) => {
            try {
                const { username, password, email, role } = req.body;
                if (!username || !password || !email) {
                    return res.status(400).json({ message: "사용자 이름, 이메일, 비밀번호를 모두 입력해주세요." });
                }

                const existingUser = await collections.users.findOne({ username });
                if (existingUser) {
                    return res.status(409).json({ message: "이미 존재하는 사용자 이름입니다." });
                }
                // 🚩 [추가] 이메일 중복 확인
                const existingEmail = await collections.users.findOne({ email });
                if (existingEmail) {
                    return res.status(409).json({ message: "이미 사용 중인 이메일입니다." });
                }

                const hashedPassword = await bcrypt.hash(password, 10);
                await collections.users.insertOne({
                    username,
                    email,
                    password: hashedPassword,
                    role: role || 'user', // 기본 역할은 'user'
                    createdAt: new Date(), // 🚩 [추가] 생성일 기록
                    lastLogin: null
                });

                res.status(201).json({ message: "사용자 등록 성공" });
            } catch (error) {
                res.status(500).json({ message: "서버 오류가 발생했습니다.", error: error.message });
            }
        });

        // POST: 로그인
        app.post('/api/auth/login', async (req, res) => {
            try {
                const { username, password } = req.body;
                const user = await collections.users.findOne({ username });
                if (!user) {
                    return res.status(401).json({ message: "사용자 이름 또는 비밀번호가 잘못되었습니다." });
                }

                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    return res.status(401).json({ message: "사용자 이름 또는 비밀번호가 잘못되었습니다." });
                }

                // 🚩 [추가] 계정 잠금 상태 확인
                if (user.isLocked) {
                    return res.status(403).json({ message: "계정이 잠겨있습니다. 관리자에게 문의하세요." });
                }

                // 🚩 [추가] 로그인 로그 기록
                await collections.loginLogs.insertOne({
                    userId: user._id,
                    timestamp: new Date()
                });

                // 🚩 [추가] 마지막 로그인 시간 업데이트
                await collections.users.updateOne(
                    { _id: user._id },
                    { $set: { lastLogin: new Date() } }
                );

                const token = jwt.sign(
                    { userId: user._id, username: user.username, role: user.role },
                    jwtSecret,
                    { expiresIn: '1d' } // 토큰 유효기간 1일
                );

                res.json({ message: "로그인 성공", token });
            } catch (error) {
                res.status(500).json({ message: "서버 오류가 발생했습니다.", error: error.message });
            }
        });

        // 🚩 [추가] GET: 최근 7일간 일일 접속자 수 (관리자 전용)
        app.get('/api/stats/daily-logins', verifyAdminOnly, async (req, res) => {
            try {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                sevenDaysAgo.setHours(0, 0, 0, 0);

                const dailyLogins = await collections.loginLogs.aggregate([
                    { $match: { timestamp: { $gte: sevenDaysAgo } } },
                    {
                        $group: {
                            _id: {
                                year: { $year: "$timestamp" },
                                month: { $month: "$timestamp" },
                                day: { $dayOfMonth: "$timestamp" }
                            },
                            uniqueUsers: { $addToSet: "$userId" }
                        }
                    },
                    { $project: { date: "$_id", count: { $size: "$uniqueUsers" }, _id: 0 } },
                    { $sort: { "date.year": 1, "date.month": 1, "date.day": 1 } }
                ]).toArray();

                res.json(dailyLogins);
            } catch (error) {
                console.error("일일 접속자 수 통계 조회 중 오류:", error);
                res.status(500).json({ message: "통계 조회 실패", error: error.message });
            }
        });

        // 🚩 [추가] PUT: 사용자 비밀번호 변경 (로그인한 사용자 본인)
        app.put('/api/auth/change-password', verifyToken, async (req, res) => {
            try {
                const { userId } = req.user; // verifyToken에서 추가된 사용자 ID
                const { currentPassword, newPassword } = req.body;

                if (!currentPassword || !newPassword) {
                    return res.status(400).json({ message: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요." });
                }

                const user = await collections.users.findOne({ _id: toObjectId(userId) });
                if (!user) {
                    return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
                }

                // 현재 비밀번호 확인
                const isMatch = await bcrypt.compare(currentPassword, user.password);
                if (!isMatch) {
                    return res.status(401).json({ message: "현재 비밀번호가 일치하지 않습니다." });
                }

                // 새 비밀번호 해시
                const hashedNewPassword = await bcrypt.hash(newPassword, 10);

                // 데이터베이스 업데이트
                const result = await collections.users.updateOne(
                    { _id: toObjectId(userId) },
                    { $set: { password: hashedNewPassword } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: "사용자 정보 업데이트 중 오류가 발생했습니다." });
                }

                res.json({ message: "비밀번호가 성공적으로 변경되었습니다." });
            } catch (error) {
                res.status(500).json({ message: "서버 오류가 발생했습니다.", error: error.message });
            }
        });

        // GET: 모든 사용자 목록 (관리자 전용)
        app.get('/api/users', verifyAdminOnly, async (req, res) => {
            try {
                const users = await collections.users.find({}, { projection: { password: 0 } }).toArray(); // 비밀번호 제외
                res.json(users);
            } catch (error) {
                res.status(500).json({ message: "사용자 목록 조회 실패", error: error.message });
            }
        });

        // 🚩 [추가] PUT: 사용자 정보 업데이트 (관리자 전용)
        app.put('/api/users/:id', verifyAdminOnly, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) {
                    return res.status(400).json({ message: "잘못된 ID 형식입니다." });
                }

                const { username, email, role, password } = req.body;
                const updateData = { username, email, role };

                // 사용자 이름 중복 확인 (자신 제외)
                const existingUser = await collections.users.findOne({ username, _id: { $ne: _id } });
                if (existingUser) {
                    return res.status(409).json({ message: "이미 존재하는 사용자 이름입니다." });
                }

                // 이메일 중복 확인 (자신 제외)
                const existingEmail = await collections.users.findOne({ email, _id: { $ne: _id } });
                if (existingEmail) {
                    return res.status(409).json({ message: "이미 사용 중인 이메일입니다." });
                }

                // 비밀번호가 제공된 경우에만 해시하여 업데이트 객체에 추가
                if (password) {
                    updateData.password = await bcrypt.hash(password, 10);
                }

                const result = await collections.users.updateOne(
                    { _id: _id },
                    { $set: updateData }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
                }

                res.json({ message: "사용자 정보 업데이트 성공" });
            } catch (error) {
                console.error("사용자 정보 업데이트 중 오류:", error);
                res.status(500).json({ message: "사용자 정보 업데이트 실패", error: error.message });
            }
        });

        // DELETE: 사용자 삭제 (관리자 전용)
        app.delete('/api/users/:id', verifyAdminOnly, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) {
                    return res.status(400).json({ message: "잘못된 ID 형식입니다." });
                }
                const result = await collections.users.deleteOne({ _id: _id });
                if (result.deletedCount === 0) {
                    return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
                }
                res.json({ message: "사용자 삭제 성공" });
            } catch (error) {
                res.status(500).json({ message: "사용자 삭제 실패", error: error.message });
            }
        });

        // PUT: 사용자 역할 수정 (관리자/최상위 관리자 전용)
        app.put('/api/users/:id/role', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const { role } = req.body;
                const _id = toObjectId(id);

                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });
                if (!['user', 'admin', 'superuser'].includes(role)) {
                    return res.status(400).json({ message: "유효하지 않은 역할입니다." });
                }

                const result = await collections.users.updateOne(
                    { _id: _id },
                    { $set: { role: role } }
                );

                if (result.matchedCount === 0) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
                res.json({ message: "사용자 역할이 성공적으로 업데이트되었습니다." });
            } catch (error) {
                res.status(500).json({ message: "사용자 역할 업데이트 실패", error: error.message });
            }
        });

        // 🚩 [추가] 사용자 계정 잠금/해제
        app.put('/api/users/:id/lock', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const { lock } = req.body; // true: 잠금, false: 해제
                const _id = toObjectId(id);

                if (!_id) {
                    return res.status(400).json({ message: "잘못된 ID 형식입니다." });
                }
                if (typeof lock !== 'boolean') {
                    return res.status(400).json({ message: "잠금 상태(lock)는 boolean 값이어야 합니다." });
                }

                const result = await collections.users.updateOne(
                    { _id: _id },
                    { $set: { isLocked: lock } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
                }

                res.json({ message: `사용자 계정이 성공적으로 ${lock ? '잠금' : '해제'}되었습니다.` });
            } catch (error) {
                res.status(500).json({ message: "사용자 계정 상태 변경 실패", error: error.message });
            }
        });

    isAppSetup = true; // Mark setup as complete
}

// POST: 공개 사용자 회원가입 (setupRoutesAndCollections 밖으로 이동)
app.post('/api/auth/signup', async (req, res) => {
    try {
        await setupRoutesAndCollections(); // Ensure collections are available
        const { username, password, email } = req.body;
        if (!username || !password || !email) {
            return res.status(400).json({ message: "사용자 이름, 이메일, 비밀번호를 모두 입력해주세요." });
        }
        if (password.length < 4) {
            return res.status(400).json({ message: "비밀번호는 4자 이상이어야 합니다." });
        }

        // 🚩 [수정] 사용자 이름 및 이메일 중복 확인
        const existingUser = await collections.users.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ message: "이미 존재하는 사용자 이름입니다." });
        }
        const existingEmail = await collections.users.findOne({ email });
        if (existingEmail) {
            return res.status(409).json({ message: "이미 사용 중인 이메일입니다." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await collections.users.insertOne({
            username,
            email,
            password: hashedPassword,
            role: 'user', // 일반 사용자로 역할 고정
            createdAt: new Date(), // 🚩 [추가] 생성일 기록
            lastLogin: null
        });

        res.status(201).json({ message: "회원가입 성공" });
    } catch (error) {
        res.status(500).json({ message: "서버 오류가 발생했습니다.", error: error.message });
    }
});

// For local development, listen on a port.
if (require.main === module) {
    setupRoutesAndCollections().then(() => {
        app.listen(port, () => {
            console.log(`Server listening on http://localhost:${port}`);
        });
    }).catch(err => {
        console.error("MongoDB 연결 또는 서버 시작 중 치명적인 오류 발생:", err);
    });
}

// Vercel 배포를 위해 Express 앱 인스턴스를 내보냅니다.
module.exports = async (req, res) => {
    await setupRoutesAndCollections(); // Ensure app is fully configured
    return app(req, res); // Let Express handle the request
};