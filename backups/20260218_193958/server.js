// server.js
require('dotenv').config(); // .env 파일의 환경 변수를 로드합니다.
const express = require('express');
const { ObjectId } = require('mongodb');
// 💡 [추가] 인증 관련 라이브러리
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const compression = require('compression');
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

// 헬퍼 함수: 점수에 따른 직급 결정
const getPosition = (score) => {
    if (score >= 2600) return '수찬관(修撰官)';
    if (score >= 2100) return '직수찬관(直修撰官)';
    if (score >= 1700) return '사관수찬(史館修撰)';
    if (score >= 1400) return '시강학사(侍講學士)';
    if (score >= 1100) return '기거주(起居注) / 낭중(郞中)';
    if (score >= 850) return '기거사(起居舍) / 원외랑(員外郞)';
    if (score >= 650) return '기거랑(起居郞) / 직사관(直史館)';
    if (score >= 450) return '기거도위(起居都尉)';
    if (score >= 300) return '수찬(修撰)';
    if (score >= 200) return '직문한(直文翰)';
    if (score >= 120) return '주서(注書)';
    if (score >= 60) return '검열(檢閱)';
    if (score >= 30) return '학유';
    if (score >= 10) return '정자(正字)';
    return '수분권지(修分權知)';
};

// 헬퍼 함수: Geometry로부터 bbox 계산
const calculateBBoxFromGeometry = (geometry) => {
    let minLon = Infinity, minLat = Infinity;
    let maxLon = -Infinity, maxLat = -Infinity;
    
    const processCoordinates = (coords) => {
        if (typeof coords[0] === 'number') {
            // [lon, lat] 형식
            minLon = Math.min(minLon, coords[0]);
            maxLon = Math.max(maxLon, coords[0]);
            minLat = Math.min(minLat, coords[1]);
            maxLat = Math.max(maxLat, coords[1]);
        } else {
            // 중첩 배열
            coords.forEach(processCoordinates);
        }
    };
    
    if (geometry.type === 'Polygon') {
        processCoordinates(geometry.coordinates);
    } else if (geometry.type === 'MultiPolygon') {
        processCoordinates(geometry.coordinates);
    } else if (geometry.type === 'Point') {
        minLon = maxLon = geometry.coordinates[0];
        minLat = maxLat = geometry.coordinates[1];
    }
    
    return [minLon, minLat, maxLon, maxLat];
}

// � [신규 추가] CRUD 로깅 헬퍼 함수
const logCRUD = (operation, collection, identifier, details = '') => {
    const timestamp = new Date().toISOString();
    const emoji = {
        CREATE: '✅ [CREATE]',
        READ: '📖 [READ]',
        UPDATE: '✅ [UPDATE]',
        DELETE: '✅ [DELETE]',
        ERROR: '❌ [ERROR]'
    };
    console.log(`${emoji[operation] || operation} ${collection}: ${identifier} ${details}`.trim());
};

// �💡 [추가] 인증 미들웨어
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

    console.log('🔍 [verifyAdmin] Authorization Header:', authHeader);
    console.log('🔍 [verifyAdmin] Token:', token ? token.substring(0, 20) + '...' : 'null');

    if (!token) return res.status(401).json({ message: "인증 토큰이 없습니다." });

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            console.log('❌ [verifyAdmin] JWT 검증 실패:', err.message);
            return res.status(403).json({ message: "유효하지 않은 토큰입니다.", error: err.message });
        }
        
        console.log('✅ [verifyAdmin] JWT 검증 성공 - User:', user.username, 'Role:', user.role);
        
        if (user.role !== 'admin' && user.role !== 'superuser') {
            console.log('⛔ [verifyAdmin] 권한 부족 - Role:', user.role);
            return res.status(403).json({ message: "관리자 권한이 필요합니다." });
        }
        req.user = user;
        next();
    });
};

const verifyApprover = (req, res, next) => { // 동수국사 이상 승인 권한 검증
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    console.log('🔍 [verifyApprover] Authorization Header:', authHeader);
    console.log('🔍 [verifyApprover] Token:', token ? token.substring(0, 20) + '...' : 'null');

    if (!token) return res.status(401).json({ message: "인증 토큰이 없습니다." });

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            console.log('❌ [verifyApprover] JWT 검증 실패:', err.message);
            return res.status(403).json({ message: "유효하지 않은 토큰입니다.", error: err.message });
        }

        console.log('✅ [verifyApprover] JWT 검증 성공 - User:', user.username, 'Position:', user.position);

        // 승인 권한이 있는 직급들 (정2품 수국사 이상)
        const approverPositions = ['수국사', '판사관사', '감수국사'];

        if (user.role !== 'admin' && user.role !== 'superuser' && !approverPositions.includes(user.position)) {
            console.log('⛔ [verifyApprover] 승인 권한 부족 - Position:', user.position);
            return res.status(403).json({ message: "승인 권한이 필요합니다. (정2품 수국사 이상)" });
        }
        req.user = user;
        next();
    });
};

const verifyAdminOnly = (req, res, next) => { // 회원 관리자 권한 검증
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

const resolveTrackedPagePath = (req) => {
    if (req.method !== 'GET') return null;
    if (req.path === '/' || req.path === '') {
        return '/index.html';
    }
    if (req.path.endsWith('.html')) {
        return req.path;
    }
    return null;
};

const incrementPageView = async (pagePath) => {
    try {
        await connectToDatabase();
        if (!collections.pageViews) return;

        const now = new Date();
        const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

        await collections.pageViews.updateOne(
            { path: pagePath, date: dayStart },
            {
                $inc: { count: 1 },
                $setOnInsert: {
                    path: pagePath,
                    date: dayStart,
                    firstSeenAt: new Date()
                }
            },
            { upsert: true }
        );
    } catch (error) {
        console.error('페이지 뷰 기록 중 오류:', error);
    }
};

app.use(cors()); // 모든 도메인에서 요청 허용 (개발용)
app.use(express.json({ limit: '50mb' })); // 대용량 GeoJSON 지원 (기본 100kb → 50mb)
app.use(express.urlencoded({ limit: '50mb', extended: true })); // URL 인코딩된 데이터도 대용량 지원
app.use(compression()); // 응답 압축으로 대용량 전송 최적화
app.use(async (req, res, next) => {
    const trackedPath = resolveTrackedPagePath(req);
    if (trackedPath) {
        incrementPageView(trackedPath).finally(() => next());
        return;
    }
    next();
});
// 💡 [수정] Express 앱에서 정적 파일을 제공하는 경로를 'public' 폴더에서 프로젝트 루트로 변경합니다.
// 이제 index.html, admin.html 등을 루트 디렉토리에서 직접 서비스할 수 있습니다.
app.use(express.static(__dirname));

// 🚩 [추가] public 폴더를 정적 파일로 제공 (타일 파일 접근용)
app.use('/public', express.static(path.join(__dirname, 'public')));

// This function will set up all the routes and collections
async function setupRoutesAndCollections() {
    if (isAppSetup) {
        return; // Already set up
    }
    await connectToDatabase(); // 🚩 [수정] DB 연결 및 컬렉션 초기화
    
    // 🚩 [추가] 기여(Contributions) 컬렉션 초기화 (db.js에 없을 경우를 대비해 동적 할당)
    // users 컬렉션에서 db 인스턴스를 가져와서 사용합니다.
    if (!collections.contributions && collections.users) {
        collections.contributions = collections.users.s.db.collection('contributions');
    }

        // ----------------------------------------------------
        // 🏰 CASTLE (성/위치) API 엔드포인트
        // ----------------------------------------------------

        // GET: 모든 성 정보 반환
        app.get('/api/castle', verifyToken, async (req, res) => { // (collections.castle로 변경)
            try {
                // 🚩 [추가] label_type 쿼리 파라미터로 필터링 지원
                const { label_type } = req.query;
                let query = { $or: [{ deleted: { $exists: false } }, { deleted: false }] }; // deleted 필드가 없거나 false인 문서들 (삭제되지 않은 문서들)
                
                if (label_type && label_type !== 'exclude_labels') {
                    // label_type이 지정된 경우 해당 타입만 조회
                    query.label_type = label_type;
                    query.is_label = true; // 라벨 타입인 경우 is_label도 true여야 함
                } else if (label_type === 'exclude_labels') {
                    // 라벨을 제외한 모든 데이터 조회 - deleted 필터와 결합
                    query = {
                        $and: [
                            { $or: [{ deleted: { $exists: false } }, { deleted: false }] },
                            { $or: [{ is_label: false }, { is_label: { $exists: false } }] }
                        ]
                    };
                }
                
                const castles = await collections.castle.find(query).toArray();
                console.log(`📖 Castle 조회: ${castles.length}개 (필터: ${label_type || '전체'})`);
                
                // 디버깅: 첫 번째 문서의 deleted 필드 확인
                if (castles.length > 0) {
                    console.log(`🔍 첫 번째 문서의 deleted 필드:`, castles[0].deleted);
                    console.log(`🔍 첫 번째 문서의 키들:`, Object.keys(castles[0]));
                }
                
                res.json(castles);
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
                if (newCastle.country_id !== undefined && newCastle.country_id !== null && newCastle.country_id !== '') {
                    const convertedId = toObjectId(newCastle.country_id);
                    if (convertedId) {
                        newCastle.country_id = convertedId;
                    } else {
                        // 잘못된 ID는 null로 설정
                        newCastle.country_id = null;
                    }
                } else if (newCastle.country_id === '' || newCastle.country_id === null) {
                    // 빈 문자열이나 null은 명시적으로 null로 설정
                    newCastle.country_id = null;
                }
                // 기존 newCastle.country 필드가 있다면 삭제 (마이그레이션 구조 유지)
                if (newCastle.country) delete newCastle.country;

                const result = await collections.castle.insertOne(newCastle);
                
                // 🚩 [수정] 삽입된 전체 문서를 다시 조회해서 반환
                const insertedDocument = await collections.castle.findOne({ _id: result.insertedId });
                
                logCRUD('CREATE', 'Castle', newCastle.name, `(ID: ${result.insertedId})`);
                res.status(201).json({ 
                    message: "Castle 추가 성공", 
                    id: result.insertedId.toString(),
                    castle: insertedDocument // 삽입된 전체 문서 반환
                });
            } catch (error) {
                logCRUD('ERROR', 'Castle', 'POST', error.message);
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
                
                // 🚩 [디버그] 서버가 받은 데이터 확인
                console.log('📥 서버 수신 데이터 (Castle PUT):', JSON.stringify(updatedCastle, null, 2));
                
                if (updatedCastle._id) delete updatedCastle._id;

                // 🚨 [필수 수정]: 클라이언트가 country_id를 보냈다면 ObjectId로 변환하여 업데이트
                if (updatedCastle.country_id !== undefined && updatedCastle.country_id !== null && updatedCastle.country_id !== '') {
                    const convertedId = toObjectId(updatedCastle.country_id);
                    if (convertedId) {
                        updatedCastle.country_id = convertedId;
                    } else {
                        // 잘못된 ID는 null로 설정
                        updatedCastle.country_id = null;
                    }
                } else if (updatedCastle.country_id === '' || updatedCastle.country_id === null) {
                    // 빈 문자열이나 null은 명시적으로 null로 설정 (삭제하지 않음)
                    updatedCastle.country_id = null;
                }
                // country 필드가 넘어온다면 삭제 (ID 기반 구조 유지)
                if (updatedCastle.country) delete updatedCastle.country;
                
                const result = await collections.castle.updateOne(
                    { _id: _id },
                    { $set: updatedCastle }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: "성을 찾을 수 없습니다." });
                }

                // 🚩 [디버그] 업데이트 결과 확인
                console.log('✅ DB 업데이트 결과:', {
                    matchedCount: result.matchedCount,
                    modifiedCount: result.modifiedCount,
                    acknowledged: result.acknowledged
                });

                // 🚩 [수정] 업데이트된 전체 객체를 다시 조회해서 반환
                const updatedDocument = await collections.castle.findOne({ _id: _id });
                
                logCRUD('UPDATE', 'Castle', updatedCastle.name || id, `(ID: ${id})`);
                res.json({ 
                    message: "Castle 정보 업데이트 성공",
                    castle: updatedDocument // 업데이트된 전체 문서 반환
                });
            } catch (error) {
                logCRUD('ERROR', 'Castle', 'PUT', error.message);
                res.status(500).json({ message: "Castle 정보 업데이트 실패", error: error.message });
            }
        });
        
        // 🚩 [신규 추가] GET: 개별 성 정보 조회
        app.get('/api/castle/:id', verifyToken, async (req, res) => {
            try {
                const { id } = req.params;
                // name 또는 _id로 검색
                let castle;
                const objectId = toObjectId(id);
                
                if (objectId) {
                    castle = await collections.castle.findOne({ _id: objectId });
                } else {
                    castle = await collections.castle.findOne({ name: id });
                }
                
                if (!castle) {
                    return res.status(404).json({ message: "성을 찾을 수 없습니다." });
                }
                
                res.json(castle);
            } catch (error) {
                console.error("Castle 조회 중 오류:", error);
                res.status(500).json({ message: "Castle 조회 실패", error: error.message });
            }
        });
        
        // DELETE: 성 정보 휴지통으로 이동 (소프트 삭제)
        app.delete('/api/castle/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

                const result = await collections.castle.updateOne(
                    { _id: _id },
                    {
                        $set: {
                            deleted: true,
                            deletedAt: new Date()
                        }
                    }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: "성을 찾을 수 없습니다." });
                }

                logCRUD('SOFT_DELETE', 'Castle', id);
                res.json({ message: "Castle 정보 휴지통으로 이동됨" });
            } catch (error) {
                logCRUD('ERROR', 'Castle', 'SOFT_DELETE', error.message);
                res.status(500).json({ message: "Castle 정보 휴지통 이동 실패", error: error.message });
            }
        });

        // PUT: 휴지통에서 성 복원
        app.put('/api/castle/:id/restore', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

                const result = await collections.castle.updateOne(
                    { _id: _id, deleted: true },
                    {
                        $unset: {
                            deleted: "",
                            deletedAt: ""
                        }
                    }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: "휴지통에서 성을 찾을 수 없습니다." });
                }

                logCRUD('RESTORE', 'Castle', id);
                res.json({ message: "Castle 정보 복원 성공" });
            } catch (error) {
                logCRUD('ERROR', 'Castle', 'RESTORE', error.message);
                res.status(500).json({ message: "Castle 정보 복원 실패", error: error.message });
            }
        });

        // DELETE: 휴지통에서 성 영구 삭제
        app.delete('/api/castle/:id/permanent', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

                const result = await collections.castle.deleteOne({ _id: _id, deleted: true });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ message: "휴지통에서 성을 찾을 수 없습니다." });
                }

                logCRUD('PERMANENT_DELETE', 'Castle', id);
                res.json({ message: "Castle 정보 영구 삭제 성공" });
            } catch (error) {
                logCRUD('ERROR', 'Castle', 'PERMANENT_DELETE', error.message);
                res.status(500).json({ message: "Castle 정보 영구 삭제 실패", error: error.message });
            }
        });

        // GET: 휴지통의 성 목록
        app.get('/api/castle/trash', verifyAdmin, async (req, res) => {
            try {
                const castles = await collections.castle.find({ deleted: true }).toArray();
                res.json(castles);
            } catch (error) {
                logCRUD('ERROR', 'Castle', 'GET_TRASH', error.message);
                res.status(500).json({ message: "휴지통 조회 실패", error: error.message });
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
        logCRUD('CREATE', 'Country', newCountry.name, `(ID: ${result.insertedId})`);
        res.status(201).json({ message: "Country 추가 성공", id: result.insertedId.toString(), countryOriginalName: newCountry.name }); 
    } catch (error) {
        logCRUD('ERROR', 'Country', 'POST', error.message);
        res.status(500).json({ message: "Country 추가 실패", error: error.message });
    }
});

// 🚩 [신규 추가] GET: 개별 국가 정보 조회
app.get('/api/countries/:name', verifyToken, async (req, res) => {
    try {
        const { name } = req.params;
        
        // 🚩 [수정] _id 또는 name으로 검색
        let query;
        const objectId = toObjectId(name);
        if (objectId) {
            query = { _id: objectId };
        } else {
            query = { name: decodeURIComponent(name) };
        }
        
        const country = await collections.countries.findOne(query);
        
        if (!country) {
            return res.status(404).json({ message: "국가를 찾을 수 없습니다." });
        }
        
        res.json(country);
    } catch (error) {
        console.error("Country 조회 중 오류:", error);
        res.status(500).json({ message: "Country 조회 실패", error: error.message });
    }
});

// PUT: 국가 정보 업데이트 (기존 국가 수정)
app.put('/api/countries/:name', verifyAdmin, async (req, res) => {
    try {
        const { name } = req.params; // 원본 국가 이름 또는 _id
        const updatedCountry = req.body;
        
        // 🚩 [추가] is_main_dynasty 필드가 boolean 타입인지 확인
        updatedCountry.is_main_dynasty = typeof updatedCountry.is_main_dynasty === 'boolean' ? updatedCountry.is_main_dynasty : false;
        // ✨ NEW: ethnicity 필드 추가
        updatedCountry.ethnicity = updatedCountry.ethnicity || null;
        
        // 🚩 [수정] _id 또는 name으로 검색 (이름 변경 시에도 안전)
        let query;
        const objectId = toObjectId(name);
        if (objectId) {
            query = { _id: objectId };
        } else {
            query = { name: decodeURIComponent(name) };
        }
        
        // 업데이트할 데이터에서 _id 제거 (MongoDB는 _id 변경 불가)
        delete updatedCountry._id;
        
        const result = await collections.countries.updateOne(
            query,
            { $set: updatedCountry }
        );

        if (result.matchedCount === 0) {
            // 원본 이름이 바뀌었거나 찾을 수 없을 때
            return res.status(404).json({ message: `국가 '${name}'을(를) 찾을 수 없습니다.` });
        }

        logCRUD('UPDATE', 'Country', name, `→ ${updatedCountry.name || name}`);
        res.json({ message: "Country 정보 업데이트 성공" });
    } catch (error) {
        logCRUD('ERROR', 'Country', 'PUT', error.message);
        res.status(500).json({ message: "Country 정보 업데이트 실패", error: error.message });
    }
});

// DELETE: 국가 정보 삭제
app.delete('/api/countries/:name', verifyAdmin, async (req, res) => {
    try {
        const { name } = req.params;

        // 🚩 [수정] _id 또는 name으로 검색
        let query;
        const objectId = toObjectId(name);
        if (objectId) {
            query = { _id: objectId };
        } else {
            query = { name: decodeURIComponent(name) };
        }

        const result = await collections.countries.deleteOne(query);

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
app.get('/api/kings', async (req, res) => {
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

// 🚩 [신규 추가] GET: 개별 왕 정보 조회
app.get('/api/kings/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const objectId = toObjectId(id);
        
        if (!objectId) {
            return res.status(400).json({ message: "잘못된 ID 형식입니다." });
        }
        
        const king = await collections.kings.findOne({ _id: objectId });
        
        if (!king) {
            return res.status(404).json({ message: "왕 정보를 찾을 수 없습니다." });
        }
        
        res.json(king);
    } catch (error) {
        console.error("King 조회 중 오류:", error);
        res.status(500).json({ message: "King 조회 실패", error: error.message });
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

        // 🚩 [신규 추가] GET: 개별 이벤트 정보 조회
        app.get('/api/events/:id', verifyToken, async (req, res) => {
            try {
                const { id } = req.params;
                const objectId = toObjectId(id);
                
                if (!objectId) {
                    return res.status(400).json({ message: "잘못된 ID 형식입니다." });
                }
                
                const event = await collections.events.findOne({ _id: objectId });
                
                if (!event) {
                    return res.status(404).json({ message: "이벤트를 찾을 수 없습니다." });
                }
                
                res.json(event);
            } catch (error) {
                console.error("Event 조회 중 오류:", error);
                res.status(500).json({ message: "Event 조회 실패", error: error.message });
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

        // 🚩 [신규 추가] GET: 개별 그리기 정보 조회
        app.get('/api/drawings/:id', verifyToken, async (req, res) => {
            try {
                const { id } = req.params;
                const objectId = toObjectId(id);
                
                if (!objectId) {
                    return res.status(400).json({ message: "잘못된 ID 형식입니다." });
                }
                
                const drawing = await collections.drawings.findOne({ _id: objectId });
                
                if (!drawing) {
                    return res.status(404).json({ message: "그리기 정보를 찾을 수 없습니다." });
                }
                
                res.json(drawing);
            } catch (error) {
                console.error("Drawing 조회 중 오류:", error);
                res.status(500).json({ message: "Drawing 조회 실패", error: error.message });
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

        // GET: Territory Tiles (Topojson compressed + tile-based) - Optimized
        app.get('/api/territory-tiles', verifyToken, async (req, res) => {
            try {
                const { minLat, maxLat, minLng, maxLng } = req.query;
                
                let query = {};
                
                if (minLat && maxLat && minLng && maxLng) {
                    const bounds = {
                        minLat: parseFloat(minLat),
                        maxLat: parseFloat(maxLat),
                        minLng: parseFloat(minLng),
                        maxLng: parseFloat(maxLng)
                    };
                    
                    query = {
                        $and: [
                            { "bounds.maxLat": { $gte: bounds.minLat } },
                            { "bounds.minLat": { $lte: bounds.maxLat } },
                            { "bounds.maxLng": { $gte: bounds.minLng } },
                            { "bounds.minLng": { $lte: bounds.maxLng } }
                        ]
                    };
                }
                
                console.log(`🗺️ Territory Tiles query start... (bounds: ${minLat ? 'O' : 'X'})`);
                const startTime = Date.now();
                
                const tiles = await collections.territory_tiles.find(query).toArray();
                
                const elapsed = Date.now() - startTime;
                const totalSize = tiles.reduce((sum, t) => sum + (t.compressed_size || 0), 0);
                console.log(`🗺️ Territory Tiles complete: ${tiles.length} tiles, ${(totalSize/1024).toFixed(2)}KB (${elapsed}ms)`);
                
                res.json(tiles);
            } catch (error) {
                console.error("Territory Tiles error:", error);
                res.status(500).json({ message: "Territory Tiles failed", error: error.message });
            }
        });

        // � [추가] ----------------------------------------------------
        // 🗺️ TERRITORIES API 엔드포인트 (행정구역 영토 폴리곤)
        // ----------------------------------------------------
        
        // 🚀 [최적화] 서버 메모리 캐시 - MongoDB Atlas 네트워크 지연 해결
        let territoriesCache = null;
        let territoriesCacheTime = null;
        const CACHE_TTL = 30 * 60 * 1000; // 30분 캐시

        // GET: 영토 폴리곤 조회 (뷰포트 bounds 필터링 지원)
        // 🗺️ [공개 API] Territories 조회 - 인증 불필요 (공개 데이터)
        app.get('/api/territories', async (req, res) => {
            try {
                const { minLat, maxLat, minLng, maxLng, lightweight, nocache } = req.query;
                
                // 🚀 캐시 사용 (bounds 없고, lightweight 아니고, nocache 아닌 경우)
                const useCache = !minLat && !lightweight && nocache !== 'true';
                
                if (useCache && territoriesCache && territoriesCacheTime) {
                    const cacheAge = Date.now() - territoriesCacheTime;
                    if (cacheAge < CACHE_TTL) {
                        console.log(`🚀 Territories 캐시 사용 (${(cacheAge/1000).toFixed(0)}초 전 데이터, ${territoriesCache.length}개)`);
                        return res.json(territoriesCache);
                    }
                }
                
                let query = {};
                
                // 🚩 bounds 파라미터가 있으면 지리적 범위로 필터링
                if (minLat && maxLat && minLng && maxLng) {
                    const bounds = {
                        minLat: parseFloat(minLat),
                        maxLat: parseFloat(maxLat),
                        minLng: parseFloat(minLng),
                        maxLng: parseFloat(maxLng)
                    };
                    
                    query = {
                        $or: [
                            { "bbox": { $exists: false } },
                            {
                                $and: [
                                    { "bbox.maxLat": { $gte: bounds.minLat } },
                                    { "bbox.minLat": { $lte: bounds.maxLat } },
                                    { "bbox.maxLng": { $gte: bounds.minLng } },
                                    { "bbox.minLng": { $lte: bounds.maxLng } }
                                ]
                            }
                        ]
                    };
                }
                
                console.log(`🗺️ Territories 쿼리 시작... (bounds: ${minLat ? 'O' : 'X'}, lightweight: ${lightweight || 'X'})`);
                const startTime = Date.now();
                
                let territories;
                
                // � [최적화] lightweight 모드: geometry 제외, 메타데이터만 (빠름)
                if (lightweight === 'true') {
                    territories = await collections.territories.find(query).project({
                        _id: 1,
                        name: 1,
                        name_ko: 1,
                        name_en: 1,
                        name_type: 1,
                        bbox: 1,
                        start: 1,
                        start_year: 1,
                        end: 1,
                        end_year: 1,
                        level: 1,
                        type: 1
                    }).toArray();
                } else {
                    // 전체 데이터 (geometry 포함)
                    territories = await collections.territories.find(query).toArray();
                    
                    // 🚀 캐시 저장 (bounds 없는 전체 조회인 경우만)
                    if (useCache) {
                        territoriesCache = territories;
                        territoriesCacheTime = Date.now();
                        console.log(`💾 Territories 캐시 저장됨 (${territories.length}개)`);
                    }
                }
                
                const elapsed = Date.now() - startTime;
                const sizeMB = (JSON.stringify(territories).length / 1024 / 1024).toFixed(2);
                console.log(`🗺️ Territories 조회 완료: ${territories.length}개 (${elapsed}ms, ${sizeMB}MB, lightweight: ${lightweight || 'X'})`);
                
                if (elapsed > 5000) {
                    console.warn(`⚠️  느린 쿼리 감지! ${elapsed}ms`);
                }
                
                res.json(territories);
            } catch (error) {
                console.error("Territories 조회 중 오류:", error);
                res.status(500).json({ message: "Territories 조회 실패", error: error.message });
            }
        });

        // POST: 새 영토 폴리곤 추가 (배치 import 지원) - 자동 검증 및 필드 추가
        app.post('/api/territories', verifyAdmin, async (req, res) => {
            try {
                const newTerritories = Array.isArray(req.body) ? req.body : [req.body];
                
                console.log(`📍 Territory 추가 요청: ${newTerritories.length}개`);
                
                // 각 영토 데이터 검증 및 보완
                const processedTerritories = newTerritories.map((territory, index) => {
                    // _id 필드 제거
                    if (territory._id) delete territory._id;
                    
                    // 1. 필수 필드 검증
                    if (!territory.name) {
                        throw new Error(`Territory ${index}: name 필드가 필요합니다`);
                    }
                    if (!territory.geometry || !territory.geometry.coordinates) {
                        throw new Error(`Territory ${index} (${territory.name}): geometry.coordinates가 필요합니다`);
                    }
                    
                    // 2. bbox 자동 계산 (없으면)
                    if (!territory.bbox) {
                        console.log(`  🔧 ${territory.name}: bbox 자동 계산 중...`);
                        territory.bbox = calculateBBoxFromGeometry(territory.geometry);
                    }
                    
                    // 3. 시간 필드 자동 설정 (없으면)
                    if (territory.start_year === undefined) {
                        territory.start_year = territory.start || -3000;
                    }
                    if (territory.end_year === undefined) {
                        territory.end_year = territory.end || 3000;
                    }
                    if (territory.start === undefined) {
                        territory.start = territory.start_year;
                    }
                    if (territory.end === undefined) {
                        territory.end = territory.end_year;
                    }
                    
                    // 4. 기본 타입 설정
                    if (!territory.type) {
                        territory.type = 'admin_area';
                    }
                    if (!territory.admin_level) {
                        territory.admin_level = 2;
                    }
                    
                    console.log(`  ✓ ${territory.name}: 검증 완료 (bbox: ${territory.bbox ? 'O' : 'X'}, time: ${territory.start_year}~${territory.end_year})`);
                    
                    return territory;
                });
                
                const result = await collections.territories.insertMany(processedTerritories);
                
                console.log(`✅ Territory 추가 완료: ${result.insertedCount}개`);
                
                res.status(201).json({ 
                    message: "Territory 추가 성공", 
                    count: result.insertedCount,
                    ids: Object.values(result.insertedIds).map(id => id.toString()),
                    insertedId: result.insertedIds[0] // 단일 추가 시 호환성
                });
                
                // 🚀 캐시 무효화
                territoriesCache = null;
                territoriesCacheTime = null;
                console.log('🗑️ Territories 캐시 무효화됨 (POST)');
            } catch (error) {
                console.error("Territory 추가 중 오류:", error);
                res.status(500).json({ message: "Territory 추가 실패", error: error.message });
            }
        });

        // PUT: 영토 폴리곤 업데이트
        app.put('/api/territories/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });

                const updatedTerritory = req.body;
                if (updatedTerritory._id) delete updatedTerritory._id;

                const result = await collections.territories.updateOne({ _id: _id }, { $set: updatedTerritory });
                if (result.matchedCount === 0) return res.status(404).json({ message: "영토 정보를 찾을 수 없습니다." });
                
                // 🚀 캐시 무효화
                territoriesCache = null;
                territoriesCacheTime = null;
                console.log('🗑️ Territories 캐시 무효화됨 (PUT)');
                
                res.json({ message: "Territory 정보 업데이트 성공" });
            } catch (error) {
                console.error("Territory 정보 업데이트 중 오류:", error);
                res.status(500).json({ message: "Territory 정보 업데이트 실패", error: error.message });
            }
        });

        // DELETE: 영토 폴리곤 삭제
        app.delete('/api/territories/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });
                const result = await collections.territories.deleteOne({ _id: _id });
                if (result.deletedCount === 0) return res.status(404).json({ message: "영토 정보를 찾을 수 없습니다." });
                
                // 🚀 캐시 무효화
                territoriesCache = null;
                territoriesCacheTime = null;
                console.log('🗑️ Territories 캐시 무효화됨 (DELETE)');
                
                res.json({ message: "Territory 정보 삭제 성공" });
            } catch (error) {
                console.error("Territory 정보 삭제 중 오류:", error);
                res.status(500).json({ message: "Territory 정보 삭제 실패", error: error.message });
            }
        });

        // DELETE: 영토 폴리곤 삭제 by OSM ID (관리자 전용)
        // 사용 예: DELETE /api/territories/by-osm/2697305 또는 /api/territories/by-osm/r2697305
        app.delete('/api/territories/by-osm/:osm', verifyAdmin, async (req, res) => {
            try {
                const { osm } = req.params;
                if (!osm) return res.status(400).json({ message: "osm 파라미터가 필요합니다." });

                // 지원 포맷: '2697305' 또는 'r2697305'
                const variants = new Set();
                variants.add(osm);
                if (osm.startsWith('r')) variants.add(osm.slice(1));
                else variants.add('r' + osm);

                const query = { osm_id: { $in: Array.from(variants) } };
                console.log(`🧹 OSM 기반 삭제 요청: ${osm} -> 쿼리: ${JSON.stringify(query)}`);

                const result = await collections.territories.deleteMany(query);
                console.log(`✅ OSM 기반 삭제 완료: ${result.deletedCount}개 삭제`);
                
                // 🚀 캐시 무효화
                territoriesCache = null;
                territoriesCacheTime = null;
                console.log('🗑️ Territories 캐시 무효화됨 (DELETE by OSM)');

                res.json({ message: 'OSM 기반 영토 삭제 완료', deletedCount: result.deletedCount });
            } catch (error) {
                console.error('OSM 기반 영토 삭제 중 오류:', error);
                res.status(500).json({ message: 'OSM 기반 영토 삭제 실패', error: error.message });
            }
        });

        // GET: 사전 계산된 영토 캐시 조회 (특정 연도/월) - 🚩 인증 불필요 (공개 읽기)
        app.get('/api/territory-cache', async (req, res) => {
            try {
                const { year, month } = req.query;
                console.log('🔍 [캐시 조회] year:', year, 'month:', month);
                
                if (!year) return res.status(400).json({ message: "year 파라미터가 필요합니다." });
                
                // 📝 수정: 연도별 캐시만 있으므로 month를 무시하고 year만으로 조회
                const query = { year: parseInt(year) };
                
                console.log('🔍 [캐시 쿼리]', JSON.stringify(query));
                const cached = await collections.territoryCache.find(query).toArray();
                console.log('🔍 [캐시 조회 결과]', cached.length, '개 반환');
                
                res.json(cached);
            } catch (error) {
                console.error("Territory 캐시 조회 중 오류:", error);
                res.status(500).json({ message: "Territory 캐시 조회 실패", error: error.message });
            }
        });

        // DELETE: 영토 캐시 삭제 (특정 연도 또는 전체) - 관리자 전용
        app.delete('/api/territory-cache', verifyAdmin, async (req, res) => {
            try {
                const { year, month } = req.query;
                
                let query = {};
                if (year) {
                    query.year = parseInt(year);
                    if (month) query.month = parseInt(month);
                }
                
                const result = await collections.territoryCache.deleteMany(query);
                res.json({ 
                    message: "캐시 삭제 성공", 
                    deletedCount: result.deletedCount 
                });
            } catch (error) {
                console.error("Territory 캐시 삭제 중 오류:", error);
                res.status(500).json({ message: "Territory 캐시 삭제 실패", error: error.message });
            }
        });

        // 🌊 GET: 자연 지형지물 (강, 산맥 등) 조회 - 🚩 인증 불필요 (공개 읽기)
        app.get('/api/natural-features', async (req, res) => {
            try {
                const { type } = req.query; // type: 'river', 'mountain', etc.
                const query = type ? { type } : {};
                
                const features = await collections.naturalFeatures.find(query).toArray();
                console.log(`🌊 [자연 지형지물 조회] type: ${type || 'all'}, ${features.length}개 반환`);
                
                res.json(features);
            } catch (error) {
                console.error("자연 지형지물 조회 중 오류:", error);
                res.status(500).json({ message: "자연 지형지물 조회 실패", error: error.message });
            }
        });

        // 🌊 POST: 자연 지형지물 추가
        app.post('/api/natural-features', verifyToken, async (req, res) => {
            try {
                const newFeature = req.body;
                if (newFeature._id) delete newFeature._id;
                
                // Validation
                if (!newFeature.name || !newFeature.coordinates) {
                    return res.status(400).json({ message: "자연 지형지물 이름과 좌표가 필요합니다." });
                }
                
                const result = await collections.naturalFeatures.insertOne(newFeature);
                
                logCRUD('CREATE', 'NaturalFeature', newFeature.name, `(ID: ${result.insertedId})`);
                res.status(201).json({ 
                    message: "자연 지형지물이 성공적으로 생성되었습니다.", 
                    id: result.insertedId.toString()
                });
            } catch (error) {
                console.error("자연 지형지물 생성 중 오류:", error);
                logCRUD('ERROR', 'NaturalFeature', 'POST', error.message);
                res.status(500).json({ message: "자연 지형지물 생성 실패", error: error.message });
            }
        });

        // POST: 영토 캐시 재계산 (관리자 전용 - 특정 연도 범위)
        app.post('/api/territory-cache/recalculate', verifyAdmin, async (req, res) => {
            try {
                const { startYear, endYear, monthly } = req.body;
                
                if (!startYear || !endYear) {
                    return res.status(400).json({ message: "startYear와 endYear가 필요합니다." });
                }

                // 비동기로 계산 시작 (응답은 즉시 반환)
                res.json({ 
                    message: "영토 캐시 계산이 시작되었습니다.",
                    startYear,
                    endYear,
                    monthly: !!monthly,
                    status: "processing"
                });

                // 백그라운드에서 계산 실행
                setImmediate(async () => {
                    try {
                        // DB 연결 확인 및 collections 재확인
                        await connectToDatabase();
                        if (!collections || !collections.castles) {
                            console.error('❌ collections가 초기화되지 않았습니다.');
                            return;
                        }

                        console.log(`\n🚀 영토 캐시 재계산 시작: ${startYear}년 ~ ${endYear}년 (${monthly ? '월별' : '연도별'})`);
                        
                        const totalYears = endYear - startYear + 1;
                        let completed = 0;

                        for (let year = startYear; year <= endYear; year++) {
                            if (monthly) {
                                for (let month = 1; month <= 12; month++) {
                                    await precalculateForPeriodInternal(collections, year, month);
                                }
                            } else {
                                await precalculateForPeriodInternal(collections, year, null);
                            }
                            
                            completed++;
                            const progress = (completed / totalYears * 100).toFixed(1);
                            console.log(`📊 진행률: ${completed}/${totalYears} (${progress}%)`);
                        }

                        console.log(`✅ 영토 캐시 재계산 완료!`);
                    } catch (error) {
                        console.error('❌ 영토 캐시 재계산 중 오류:', error);
                    }
                });

            } catch (error) {
                console.error("Territory 캐시 재계산 시작 중 오류:", error);
                res.status(500).json({ message: "Territory 캐시 재계산 실패", error: error.message });
            }
        });

        // 내부 함수: 특정 시기의 영토 계산
        async function precalculateForPeriodInternal(collectionsRef, year, month = null) {
            console.log(`\n📅 ${year}년 ${month ? month + '월' : ''} 계산 중...`);

            // 해당 시기의 모든 성 데이터 가져오기
            // castle 데이터는 built/destroyed 필드 사용
            const query = month 
                ? { 
                    built: { $lte: year }, 
                    destroyed: { $gte: year },
                    built_month: { $lte: month }, 
                    destroyed_month: { $gte: month } 
                  }
                : { 
                    built: { $lte: year }, 
                    destroyed: { $gte: year } 
                  };
            
            const castles = await collectionsRef.castles.find(query).toArray();
            const territories = await collectionsRef.territories.find({}).toArray();
            
            // 국가 정보 조회 (한 번만)
            const countries = await collectionsRef.countries.find({}).toArray();
            const countryMap = new Map(countries.map(c => [c._id.toString(), c]));

            // 🔍 디버깅
            console.log(`  🔍 성 개수: ${castles.length}, 영토 개수: ${territories.length}, 국가 개수: ${countries.length}`);
            if (castles.length > 0) {
                console.log(`  🔍 첫 번째 성 샘플:`, castles[0].name, `(${castles[0].built}~${castles[0].destroyed})`);
            }

            const bulkOps = [];
            
            let processedCount = 0;
            let savedCount = 0;

            for (const territory of territories) {
                const dominantResult = calculateDominantCountryServer(territory, castles, countryMap);
                
                processedCount++;
                
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
                
                savedCount++;
                
                // 🔍 첫 번째 저장 항목 디버깅
                if (savedCount === 1) {
                    console.log(`  🔍 첫 저장: ${territory.name} → ${dominantResult.countryName} (${dominantResult.count}개)`);
                }
            }

            // Bulk write 실행
            if (bulkOps.length > 0) {
                const result = await collectionsRef.territoryCache.bulkWrite(bulkOps);
                console.log(`  ✅ ${result.upsertedCount + result.modifiedCount}개 저장, ${result.deletedCount}개 삭제 (처리: ${processedCount}, 저장 대상: ${savedCount})`);
            } else {
                console.log(`  ⚠️ 저장할 데이터 없음 (처리한 영토: ${processedCount})`);
            }
        }

        // 내부 함수: 영토 내 지배 국가 계산
        function calculateDominantCountryServer(territory, castles, countryMap) {
            const geometry = territory.geojson.geometry;
            if (!geometry || !geometry.coordinates) return null;

            // 폴리곤 데이터 준비
            let polygonData = [];
            if (geometry.type === 'Polygon') {
                const converted = geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
                const bounds = calculateBoundsServer(converted);
                polygonData = [{ coords: converted, bounds }];
            } else if (geometry.type === 'MultiPolygon') {
                polygonData = geometry.coordinates.map(poly => {
                    const converted = poly[0].map(coord => [coord[1], coord[0]]);
                    const bounds = calculateBoundsServer(converted);
                    return { coords: converted, bounds };
                });
            }

            // 국가별 마커 카운트
            const countryCounts = {};

            castles.forEach(castle => {
                let isInside = false;
                
                for (const polygon of polygonData) {
                    if (castle.lat < polygon.bounds.minLat || 
                        castle.lat > polygon.bounds.maxLat ||
                        castle.lng < polygon.bounds.minLng || 
                        castle.lng > polygon.bounds.maxLng) {
                        continue;
                    }

                    if (isPointInPolygonServer([castle.lat, castle.lng], polygon.coords)) {
                        isInside = true;
                        break;
                    }
                }

                if (isInside) {
                    // 🔧 수정: country_id 사용 (언더스코어)
                    const countryId = castle.country_id?.toString() || castle.countryId?.toString() || 'unknown';
                    // 🔧 수정: is_capital 사용 (언더스코어)
                    const weight = castle.is_capital ? 3 : 1;
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

            // 🔧 수정: countryMap에서 국가 정보 조회
            const country = countryMap.get(dominantCountryId);
            
            return {
                countryId: toObjectId(dominantCountryId),
                countryName: country?.name || 'Unknown',
                color: country?.color || '#808080',
                count: maxCount
            };
        }

        function calculateBoundsServer(coords) {
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

        function isPointInPolygonServer(point, polygon) {
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

        // 💡 [추가] ----------------------------------------------------
        // 🔐 AUTH & USERS API 엔드포인트
        // ----------------------------------------------------

        // POST: 사용자 등록 (관리자만 가능)
        app.post('/api/auth/register', verifyAdminOnly, async (req, res) => {
            try {
                const { username, password, email, role, position } = req.body;
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
                    position: position || '참봉', // 기본 직급은 '참봉'
                    reviewScore: 0, // 검토 점수
                    approvalScore: 0, // 승인 점수
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

                // 🚩 [수정] 비밀번호 필드가 없는 경우 방어 처리
                if (!user.password) {
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

                // 🚩 [추가] 출석 포인트 처리 (하루에 1회 1점)
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
                let attendancePoints = 0;
                
                if (!user.lastAttendanceDate || user.lastAttendanceDate !== today) {
                    // 출석하지 않은 경우 1점 지급
                    attendancePoints = 1;
                    await collections.users.updateOne(
                        { _id: user._id },
                        { 
                            $set: { lastAttendanceDate: today },
                            $inc: { attendancePoints: 1 } // 출석 포인트 누적
                        }
                    );
                    console.log(`출석 포인트 지급: ${user.username} (+1점)`);
                }

                // 🚩 [추가] 마지막 로그인 시간 업데이트
                await collections.users.updateOne(
                    { _id: user._id },
                    { $set: { lastLogin: new Date() } }
                );

                // 🚩 [추가] 사용자 공적 점수 계산 및 직급 부여
                let score = 0;
                try {
                    // 기여도 점수 계산
                    const contributionCount = await collections.contributions.countDocuments({ userId: user._id });
                    score = contributionCount * 3; // 기본 점수: 제출 개수 × 3
                    
                    // 출석 포인트 추가 (누적)
                    score += attendancePoints;
                } catch (error) {
                    console.error('점수 계산 에러:', error);
                    score = 0;
                }

                // 데이터베이스에 저장된 position을 우선 사용, 없으면 점수 기반 계산
                const position = user.position || getPosition(score);

                const token = jwt.sign(
                    { userId: user._id, username: user.username, role: user.role, position: position },
                    jwtSecret,
                    { expiresIn: '365d' } // 토큰 유효기간 365일 (1년)
                );

                res.json({ message: "로그인 성공", token });
            } catch (error) {
                res.status(500).json({ message: "서버 오류가 발생했습니다.", error: error.message });
            }
        });

        // 🚩 [추가] POST: 게스트 로그인 (비밀번호 없이 입장)
        app.post('/api/auth/guest-login', async (req, res) => {
            try {
                // 'guest' 사용자 찾기
                const guestName = '송나라 사신 서긍';
                let guestUser = await collections.users.findOne({ username: guestName });

                if (!guestUser) {
                    // 게스트 계정이 없으면 자동 생성
                    const hashedPassword = await bcrypt.hash(Math.random().toString(36), 10); // 랜덤 비밀번호
                    const result = await collections.users.insertOne({
                        username: guestName,
                        email: 'seogeung@historymap.com', // 더미 이메일
                        password: hashedPassword,
                        role: 'user', // 일반 사용자 권한
                        position: '참봉', // 기본 직급
                        reviewScore: 0, // 검토 점수
                        approvalScore: 0, // 승인 점수
                        createdAt: new Date(),
                        lastLogin: new Date(),
                        isGuest: true // 게스트 식별 플래그
                    });
                    guestUser = await collections.users.findOne({ _id: result.insertedId });
                } else {
                    // 게스트 계정이 있으면 마지막 로그인 시간만 업데이트
                    await collections.users.updateOne(
                        { _id: guestUser._id },
                        { $set: { lastLogin: new Date() } }
                    );
                }

                // 토큰 발급 (24시간 유효)
                const token = jwt.sign(
                    { userId: guestUser._id, username: guestUser.username, role: guestUser.role, isGuest: true, position: guestUser.position || "참봉" },
                    jwtSecret,
                    { expiresIn: '24d' }
                );

                res.json({ message: "게스트 로그인 성공", token });
            } catch (error) {
                res.status(500).json({ message: "서버 오류가 발생했습니다.", error: error.message });
            }
        });

        // 🚩 [추가] POST: 게스트 로그인 (비밀번호 없이 입장)
        app.post('/api/auth/guest-login', async (req, res) => {
            console.log('📢 게스트 로그인 요청 받음'); // 디버깅용 로그
            try {
                // 'guest' 사용자 찾기
                const guestName = '송나라 사신 서긍';
                let guestUser = await collections.users.findOne({ username: guestName });

                if (!guestUser) {
                    console.log('✨ 게스트 계정 새로 생성 중...');
                    // 게스트 계정이 없으면 자동 생성
                    const hashedPassword = await bcrypt.hash(Math.random().toString(36), 10); // 랜덤 비밀번호
                    const result = await collections.users.insertOne({
                        username: guestName,
                        email: 'seogeung@historymap.com', // 더미 이메일
                        password: hashedPassword,
                        role: 'user', // 일반 사용자 권한
                        position: '참봉', // 기본 직급
                        reviewScore: 0, // 검토 점수
                        approvalScore: 0, // 승인 점수
                        createdAt: new Date(),
                        lastLogin: new Date(),
                        isGuest: true // 게스트 식별 플래그
                    });
                    guestUser = await collections.users.findOne({ _id: result.insertedId });
                } else {
                    console.log('✅ 기존 게스트 계정으로 로그인 처리');
                    // 게스트 계정이 있으면 마지막 로그인 시간만 업데이트
                    await collections.users.updateOne(
                        { _id: guestUser._id },
                        { $set: { lastLogin: new Date() } }
                    );
                }

                // 토큰 발급 (24시간 유효)
                const token = jwt.sign(
                    { userId: guestUser._id, username: guestUser.username, role: guestUser.role, isGuest: true, position: guestUser.position || "참봉" },
                    jwtSecret,
                    { expiresIn: '24d' }
                );

                res.json({ message: "게스트 로그인 성공", token });
            } catch (error) {
                console.error('❌ 게스트 로그인 오류:', error);
                res.status(500).json({ message: "서버 오류가 발생했습니다.", error: error.message });
            }
        });

        // 🚩 [추가] GET: 최근 7일간 일일 접속자 수 (관리자 전용)
        app.get('/api/stats/daily-logins', verifyAdminOnly, async (req, res) => {
            try {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                sevenDaysAgo.setHours(0, 0, 0);

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

        // 🚩 [추가] GET: 페이지 뷰 통계 (관리자 전용)
        app.get('/api/stats/page-views', verifyAdminOnly, async (req, res) => {
            try {
                const daysParam = parseInt(req.query.days, 10);
                const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 30) : 7;
                const topParam = parseInt(req.query.top, 10);
                const maxPages = Number.isFinite(topParam) ? Math.min(Math.max(topParam, 1), 10) : 5;

                const now = new Date();
                const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                const startDateUtc = new Date(todayUtc);
                startDateUtc.setUTCDate(startDateUtc.getUTCDate() - (days - 1));

                const pageViewDocs = await collections.pageViews
                    .find({ date: { $gte: startDateUtc } })
                    .toArray();

                const labels = Array.from({ length: days }, (_, index) => {
                    const labelDate = new Date(startDateUtc);
                    labelDate.setUTCDate(startDateUtc.getUTCDate() + index);
                    return labelDate.toISOString().split('T')[0];
                });

                const datasetMap = new Map();
                pageViewDocs.forEach(doc => {
                    if (!doc || !doc.date || typeof doc.count !== 'number') return;
                    const dateKey = doc.date.toISOString().split('T')[0];
                    const labelIndex = labels.indexOf(dateKey);
                    if (labelIndex === -1) return;

                    const pathKey = doc.path || 'unknown';
                    if (!datasetMap.has(pathKey)) {
                        datasetMap.set(pathKey, Array(days).fill(0));
                    }
                    const counts = datasetMap.get(pathKey);
                    counts[labelIndex] += doc.count;
                });

                const totals = Array.from(datasetMap.entries())
                    .map(([pathKey, counts]) => ({
                        path: pathKey,
                        totalCount: counts.reduce((sum, value) => sum + value, 0)
                    }))
                    .sort((a, b) => b.totalCount - a.totalCount);

                const selectedTotals = totals.slice(0, Math.min(maxPages, totals.length));
                const datasets = selectedTotals.map(item => ({
                    path: item.path,
                    counts: datasetMap.get(item.path)
                }));

                if (totals.length > selectedTotals.length) {
                    const otherCounts = Array(days).fill(0);
                    totals.slice(selectedTotals.length).forEach(item => {
                        const counts = datasetMap.get(item.path);
                        counts.forEach((value, idx) => {
                            otherCounts[idx] += value;
                        });
                    });
                    datasets.push({ path: '기타', counts: otherCounts });
                }

                res.json({ labels, datasets, totals });
            } catch (error) {
                console.error("페이지 뷰 통계 조회 중 오류:", error);
                res.status(500).json({ message: "페이지 뷰 통계 조회 실패", error: error.message });
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
                
                // 🚩 [추가] 각 사용자의 로그인 횟수 및 점수 집계
                const usersWithStats = await Promise.all(users.map(async (user) => {
                    const loginCount = await collections.loginLogs.countDocuments({ userId: user._id });
                    
                    // 기여도 통계 계산
                    const contributionStats = await collections.contributions.aggregate([
                        { $match: { userId: user._id } },
                        {
                            $group: {
                                _id: null,
                                totalCount: { $sum: 1 },
                                approvedCount: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
                                totalVotes: { $sum: "$votes" }
                            }
                        }
                    ]).toArray();
                    
                    const stats = contributionStats[0] || { totalCount: 0, approvedCount: 0, totalVotes: 0 };
                    
                    // 점수 계산: 제출 개수 × 3 + 승인 개수 × 10 + 투표 수 + 검토 점수 + 승인 점수 + 출석 포인트
                    const score = (stats.totalCount * 3) + (stats.approvedCount * 10) + stats.totalVotes + (user.reviewScore || 0) + (user.approvalScore || 0) + (user.attendancePoints || 0);
                    
                    return { 
                        ...user, 
                        loginCount,
                        score,
                        totalCount: stats.totalCount,
                        approvedCount: stats.approvedCount,
                        totalVotes: stats.totalVotes
                    };
                }));

                res.json(usersWithStats);
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

                const { username, email, role, password, position } = req.body;
                const updateData = { username, email, role, position };

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

        // 🚩 [추가] ----------------------------------------------------
        // 🏆 CONTRIBUTIONS (역사 복원 참여) API
        // ----------------------------------------------------

        // GET: 기여 목록 조회 (필터링 지원)
        app.get('/api/contributions', async (req, res) => {
            try {
                const { status, userId } = req.query;
                const query = {};
                if (status) query.status = status;
                if (userId) {
                    // ObjectId로 변환하여 검색
                    try {
                        query.userId = toObjectId(userId);
                    } catch (e) {
                        // ObjectId 변환 실패 시 문자열로 검색
                        query.userId = userId;
                    }
                }
                
                const contributions = await collections.contributions.find(query).sort({ createdAt: -1 }).toArray();
                
                // votedBy의 사용자 ID를 사용자 이름으로 변환 및 reviewer 정보 추가
                const contributionsWithNames = await Promise.all(contributions.map(async (contrib) => {
                    let result = { ...contrib };
                    
                    // 🚩 [추가] username이 없는 경우 userId로 조회하여 추가
                    if (!result.username && result.userId) {
                        try {
                            const user = await collections.users.findOne({ _id: toObjectId(result.userId) });
                            if (user && user.username) {
                                result.username = user.username;
                            }
                        } catch (e) {
                            console.error('❌ username 조회 실패:', e);
                        }
                    }
                    
                    // votedBy 처리
                    if (contrib.votedBy && contrib.votedBy.length > 0) {
                        const voters = await collections.users.find({ 
                            _id: { $in: contrib.votedBy.map(id => toObjectId(id)) } 
                        }).project({ username: 1 }).toArray();
                        const voterNames = voters.map(voter => voter.username);
                        result.votedBy = voterNames;
                    }
                    
                    // reviewer 정보 처리
                    // 검토가 완료된 경우에만 검토자 이름을 표시
                    if (contrib.reviewerId && contrib.reviewedAt) {
                        const reviewer = await collections.users.findOne({ _id: toObjectId(contrib.reviewerId) });
                        if (reviewer) {
                            result.reviewerUsername = reviewer.username;
                            result.reviewComment = contrib.reviewComment || null; // 검토 의견 추가
                        }
                    }
                    
                    // reviewedBy 정보 처리 (승인자)
                    if (contrib.reviewedBy) {
                        const approver = await collections.users.findOne({ _id: toObjectId(contrib.reviewedBy) });
                        if (approver) {
                            result.approverUsername = approver.username;
                        }
                    }
                    
                    return result;
                }));
                
                res.json(contributionsWithNames);
            } catch (error) {
                res.status(500).json({ message: "기여 목록 조회 실패", error: error.message });
            }
        });

        // POST: 기여 제출 (역사 복원 핀 꼽기)
        app.post('/api/contributions', verifyToken, async (req, res) => {
            try {
                const { name, lat, lng, description, category, evidence, year, source, content } = req.body;
                
                // 🚩 [추가] 사관 기록의 경우 다른 필드 구조 사용
                let newContribution;
                if (category === 'historical_record') {
                    newContribution = {
                        userId: toObjectId(req.user.userId),
                        username: req.user.username,
                        name, year, source, content, category, evidence,
                        status: 'pending',
                        votes: 0,
                        votedBy: [],
                        reviewerId: null,
                        reviewedAt: null,
                        createdAt: new Date()
                    };
                } else {
                    // 기존 지도 기반 기여
                    newContribution = {
                        userId: toObjectId(req.user.userId),
                        username: req.user.username,
                        name, lat, lng, description, category, evidence,
                        status: 'pending',
                        votes: 0,
                        votedBy: [],
                        reviewerId: null,
                        reviewedAt: null,
                        createdAt: new Date()
                    };
                }

                // 수찬관 이상의 사용자를 검토자로 할당 (랜덤, 본인 제외)
                const reviewerPositions = ['수찬관', '사천감', '한림학사', '상서', '수국사', '동수국사', '감수국사', '문하시중'];
                const availableReviewers = await collections.users.find({
                    position: { $in: reviewerPositions },
                    _id: { $ne: toObjectId(req.user.userId) } // 자신 제외
                }).toArray();

                if (availableReviewers.length > 0) {
                    const randomReviewer = availableReviewers[Math.floor(Math.random() * availableReviewers.length)];
                    newContribution.reviewerId = randomReviewer._id;
                }
                // 검토자가 없으면 관리자가 직접 승인하도록 함

                const result = await collections.contributions.insertOne(newContribution);
                // 🚩 [수정] 생성된 객체 반환 (ID 포함)
                const createdContribution = { ...newContribution, _id: result.insertedId };
                
                res.status(201).json({ 
                    message: category === 'historical_record' ? "사관 기록이 접수되었습니다. 검토 후 반영됩니다." : "역사 복원 제안이 접수되었습니다. 검토 후 지도에 반영됩니다.",
                    contribution: createdContribution 
                });
            } catch (error) {
                res.status(500).json({ message: "제안 접수 실패", error: error.message });
            }
        });

        // PUT: 기여 추천 (투표)
        app.put('/api/contributions/:id/vote', verifyToken, async (req, res) => {
            try {
                const { id } = req.params;
                const userId = req.user.userId;
                const _id = toObjectId(id);

                const contribution = await collections.contributions.findOne({ _id });
                if (!contribution) return res.status(404).json({ message: "항목을 찾을 수 없습니다." });

                // 이미 투표했는지 확인
                if (contribution.votedBy && contribution.votedBy.includes(userId)) {
                    return res.status(400).json({ message: "이미 추천했습니다." });
                }

                // 🚩 [추가] 일일 추천 제한 10회 체크
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                const todayVoteCount = await collections.contributions.countDocuments({
                    votedBy: userId,
                    updatedAt: { $gte: today, $lt: tomorrow }
                });

                // 오늘 이미 본인이 추천한 총 횟수 계산 (더 정확한 방법)
                const allContributions = await collections.contributions.find({
                    votedBy: userId
                }).toArray();
                
                // 각 contribution의 votedBy에서 userId가 오늘 추가되었는지 확인하기 어려우므로
                // users 컬렉션에 dailyVoteCount 필드를 사용
                const user = await collections.users.findOne({ _id: toObjectId(userId) });
                const lastVoteDate = user?.lastVoteDate ? new Date(user.lastVoteDate) : null;
                let dailyVoteCount = user?.dailyVoteCount || 0;

                // 날짜가 바뀌었으면 카운트 리셋
                if (!lastVoteDate || lastVoteDate < today) {
                    dailyVoteCount = 0;
                }

                if (dailyVoteCount >= 10) {
                    return res.status(400).json({ message: "일일 추천 제한(10회)을 초과했습니다. 내일 다시 시도해주세요." });
                }

                await collections.contributions.updateOne(
                    { _id },
                    { $inc: { votes: 1 }, $push: { votedBy: userId } }
                );

                // 🚩 [추가] 일일 추천 카운트 업데이트
                await collections.users.updateOne(
                    { _id: toObjectId(userId) },
                    { 
                        $set: { lastVoteDate: new Date() },
                        $inc: { dailyVoteCount: 1 }
                    }
                );

                // 최신 데이터 조회
                const updatedContribution = await collections.contributions.findOne({ _id });
                res.json({ 
                    message: "추천하였습니다.", 
                    votes: updatedContribution.votes || 0, 
                    action: 'vote',
                    remainingVotes: 10 - dailyVoteCount - 1  // 남은 추천 횟수
                });
            } catch (error) {
                res.status(500).json({ message: "투표 실패", error: error.message });
            }
        });

        // PUT: 기여 상태 변경 (동수국사 이상 승인/거절)
        app.put('/api/contributions/:id/status', verifyApprover, async (req, res) => {
            try {
                const { id } = req.params;
                const { status } = req.body; // 'approved' or 'rejected'
                const adminUserId = req.user.userId;
                
                const contribution = await collections.contributions.findOne({ _id: toObjectId(id) });
                if (!contribution) return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
                
                await collections.contributions.updateOne(
                    { _id: toObjectId(id) },
                    { 
                        $set: { 
                            status,
                            reviewedAt: new Date(),
                            reviewedBy: adminUserId // 승인/거절한 관리자 ID
                        } 
                    }
                );
                
                // 승인 시 검토자와 승인자에게 5점씩 부여
                if (status === 'approved') {
                    // 검토자에게 5점 부여 (리뷰 점수)
                    if (contribution.reviewerId) {
                        await collections.users.updateOne(
                            { _id: contribution.reviewerId },
                            { $inc: { reviewScore: 5 } }
                        );
                    }
                    
                    // 승인한 관리자에게 5점 부여 (승인 점수)
                    await collections.users.updateOne(
                        { _id: toObjectId(adminUserId) },
                        { $inc: { approvalScore: 5 } }
                    );
                }
                
                const message = status === 'approved' ? '검토가 완료되었습니다.' : '검토가 거부되었습니다.';
                res.json({ message });
            } catch (error) {
                res.status(500).json({ message: "상태 변경 실패", error: error.message });
            }
        });

        // 🚩 [추가] DELETE: 본인 사료 삭제 (승인 전에만 가능)
        app.delete('/api/contributions/:id/my', verifyToken, async (req, res) => {
            try {
                const { id } = req.params;
                const userId = req.user.userId;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: '잘못된 ID 형식입니다.' });

                const contribution = await collections.contributions.findOne({ _id });
                if (!contribution) return res.status(404).json({ message: '항목을 찾을 수 없습니다.' });

                // 본인 사료인지 확인
                if (contribution.userId.toString() !== userId) {
                    return res.status(403).json({ message: '본인이 제출한 사료만 삭제할 수 있습니다.' });
                }

                // 승인된 사료는 삭제 불가
                if (contribution.status === 'approved') {
                    return res.status(400).json({ message: '이미 승인된 사료는 삭제할 수 없습니다.' });
                }

                const result = await collections.contributions.deleteOne({ _id });
                if (result.deletedCount === 0) {
                    return res.status(500).json({ message: '삭제에 실패했습니다.' });
                }

                // 제출자의 totalCount 감소
                await collections.users.updateOne(
                    { _id: toObjectId(userId) },
                    { $inc: { totalCount: -1 } }
                );

                res.json({ message: '사료가 삭제되었습니다.' });
            } catch (error) {
                res.status(500).json({ message: '삭제 실패', error: error.message });
            }
        });

        // DELETE: 기여 삭제 (관리자 전용)
        app.delete('/api/contributions/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const _id = toObjectId(id);
                if (!_id) return res.status(400).json({ message: '잘못된 ID 형식입니다.' });

                const contribution = await collections.contributions.findOne({ _id });
                if (!contribution) return res.status(404).json({ message: '항목을 찾을 수 없습니다.' });

                const result = await collections.contributions.deleteOne({ _id });
                if (result.deletedCount === 0) {
                    return res.status(500).json({ message: '삭제에 실패했습니다.' });
                }

                // 승인된 항목인 경우 검토자/승인자의 점수를 되돌립니다.
                if (contribution.status === 'approved') {
                    try {
                        if (contribution.reviewerId) {
                            await collections.users.updateOne(
                                { _id: toObjectId(contribution.reviewerId) },
                                { $inc: { reviewScore: -5 } }
                            );
                        }
                        if (contribution.reviewedBy) {
                            await collections.users.updateOne(
                                { _id: toObjectId(contribution.reviewedBy) },
                                { $inc: { approvalScore: -5 } }
                            );
                        }
                    } catch (scoreErr) {
                        // 점수 되돌리기 실패는 로그만 남기고 삭제는 성공으로 처리
                        console.error('기여 삭제 후 점수 되돌리기 실패:', scoreErr.message);
                    }
                }

                res.json({ message: '사료가 삭제되었습니다.' });
            } catch (error) {
                res.status(500).json({ message: '삭제 실패', error: error.message });
            }
        });

        // GET: 명예의 전당 (랭킹)
        app.get('/api/rankings', async (req, res) => {
            try {
                console.log('🏆 [랭킹 조회] 시작');
                
                // 🚩 [수정] users 컬렉션 기반으로 랭킹 계산 (승인만 한 사용자도 포함)
                const rankings = await collections.users.aggregate([
                    {
                        $lookup: {
                            from: "contributions",
                            let: { userId: "$_id" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: { $eq: ["$userId", "$$userId"] }
                                    }
                                },
                                {
                                    $group: {
                                        _id: null,
                                        totalCount: { $sum: 1 },
                                        approvedCount: {
                                            $sum: {
                                                $cond: [{ $eq: ["$status", "approved"] }, 1, 0]
                                            }
                                        },
                                        totalVotes: { $sum: "$votes" }
                                    }
                                }
                            ],
                            as: "contributionStats"
                        }
                    },
                    {
                        $lookup: {
                            from: "contributions",
                            let: { userId: "$_id" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: { $eq: ["$reviewerId", "$$userId"] }
                                    }
                                },
                                {
                                    $count: "reviewedCount"
                                }
                            ],
                            as: "reviewStats"
                        }
                    },
                    {
                        $lookup: {
                            from: "contributions",
                            let: { userId: "$_id" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: { $eq: ["$approverId", "$$userId"] }
                                    }
                                },
                                {
                                    $count: "approvedByCount"
                                }
                            ],
                            as: "approvalStats"
                        }
                    },
                    {
                        $unwind: {
                            path: "$contributionStats",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $unwind: {
                            path: "$reviewStats",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $unwind: {
                            path: "$approvalStats",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $project: {
                            username: 1,
                            totalCount: { $ifNull: ["$contributionStats.totalCount", 0] },
                            approvedCount: { $ifNull: ["$contributionStats.approvedCount", 0] },
                            totalVotes: { $ifNull: ["$contributionStats.totalVotes", 0] },
                            reviewedCount: { $ifNull: ["$reviewStats.reviewedCount", 0] },
                            approvedByCount: { $ifNull: ["$approvalStats.approvedByCount", 0] },
                            reviewScore: { $ifNull: ["$reviewScore", 0] },
                            approvalScore: { $ifNull: ["$approvalScore", 0] },
                            attendancePoints: { $ifNull: ["$attendancePoints", 0] },
                            position: {
                                $switch: {
                                    branches: [
                                        // 고려 사관 통합 18단계 직급표 (정3품~종9품, 재상급은 순위별 후처리)
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 2600] }, then: "수찬관" },
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 2100] }, then: "직수찬관" },
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 1700] }, then: "사관수찬" },
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 1400] }, then: "시강학사" },
                                        // 정5품~종6품 (중급 사관)
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 1100] }, then: "기거주" },
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 850] }, then: "기거사" },
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 650] }, then: "기거랑" },
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 450] }, then: "기거도위" },
                                        // 정7품~종9품 (하급 사관)
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 300] }, then: "수찬" },
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 200] }, then: "직문한" },
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 120] }, then: "주서" },
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 60] }, then: "검열" },
                                        { case: { $gte: [{ $add: [{ $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] }, { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] }, { $ifNull: ["$contributionStats.totalVotes", 0] }, { $ifNull: ["$reviewScore", 0] }, { $ifNull: ["$approvalScore", 0] }] }, 30] }, then: "정자" }
                                    ],
                                    default: "수분권지"
                                }
                            },
                            score: {
                                $add: [
                                    { $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, 3] },
                                    { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, 10] },
                                    { $ifNull: ["$contributionStats.totalVotes", 0] },
                                    { $ifNull: ["$reviewScore", 0] },
                                    { $ifNull: ["$approvalScore", 0] },
                                    { $ifNull: ["$attendancePoints", 0] }
                                ]
                            }
                        }
                    },
                    // { $match: { score: { $gt: 0 } } },  // 점수가 0인 사용자도 포함
                    { $sort: { score: -1 } }
                    // { $limit: 100 }  // 제한 제거 - 모든 사용자 표시
                ]).toArray();

                console.log(`🏆 [랭킹 조회] ${rankings.length}명 조회 완료`);
                if (rankings.length > 0) {
                    console.log('🏆 [랭킹 첫 번째 사용자 샘플]:', {
                        username: rankings[0].username,
                        totalCount: rankings[0].totalCount,
                        approvedCount: rankings[0].approvedCount,
                        totalVotes: rankings[0].totalVotes,
                        reviewScore: rankings[0].reviewScore,
                        approvalScore: rankings[0].approvalScore,
                        score: rankings[0].score
                    });
                }

                // 🚩 [추가] 재상급 직급 - 순위 기반으로 부여 (상위 4명, 정1품~종2품)
                const ministerPositions = ['감수국사', '판사관사', '수국사', '동수국사'];
                const ministerMinScores = [5000, 4300, 3700, 3100];  // 최소 점수 요건
                
                rankings.forEach((user, index) => {
                    const rank = index + 1;
                    // 상위 4명 중 최소 점수를 충족하면 재상급 직급 부여
                    if (rank <= 4 && user.score >= ministerMinScores[rank - 1]) {
                        user.position = ministerPositions[rank - 1];
                        user.isMinister = true;  // 재상급 표시
                    }
                    user.rank = rank;  // 순위 추가
                });

                // 모든 사용자 반환
                res.json(rankings);
            } catch (error) {
                res.status(500).json({ message: "랭킹 조회 실패", error: error.message });
            }
        });

        // 🚩 [추가] 점수 재계산 API (관리자용)
        app.post('/api/admin/recalculate-scores', verifyToken, async (req, res) => {
            try {
                // 관리자 권한 확인
                const userId = req.user.userId;
                const user = await collections.users.findOne({ _id: toObjectId(userId) });
                if (!user || user.role !== 'admin') {
                    return res.status(403).json({ message: "관리자 권한이 필요합니다." });
                }

                console.log('🔄 점수 재계산 시작...');

                // 모든 사용자 조회
                const allUsers = await collections.users.find({}).toArray();
                let updatedCount = 0;

                for (const user of allUsers) {
                    // 실제 검토 횟수 계산 (승인된 기여물을 검토한 횟수)
                    const actualReviewedCount = await collections.contributions.countDocuments({
                        reviewerId: user._id,
                        status: 'approved'
                    });

                    // 실제 승인 횟수 계산
                    const actualApprovedCount = await collections.contributions.countDocuments({
                        approverId: user._id,
                        status: 'approved'
                    });

                    // 점수 계산
                    const correctReviewScore = actualReviewedCount * 5;
                    const correctApprovalScore = actualApprovedCount * 5;

                    // 점수 업데이트
                    await collections.users.updateOne(
                        { _id: user._id },
                        {
                            $set: {
                                reviewScore: correctReviewScore,
                                approvalScore: correctApprovalScore
                            }
                        }
                    );

                    if (user.reviewScore !== correctReviewScore || user.approvalScore !== correctApprovalScore) {
                        updatedCount++;
                    }
                }

                console.log(`🎯 점수 재계산 완료: ${updatedCount}명의 점수 수정됨`);
                res.json({
                    message: `점수 재계산 완료: ${updatedCount}명의 점수 수정됨`,
                    updatedUsers: updatedCount
                });

            } catch (error) {
                console.error('점수 재계산 오류:', error);
                res.status(500).json({ message: "점수 재계산 실패", error: error.message });
            }
        });

        // 🚩 [추가] 현재 로그인한 사용자 정보 조회 (DB 직급 포함)
        app.get('/api/user/me', verifyToken, async (req, res) => {
            try {
                const userId = req.user.userId;
                const user = await collections.users.findOne({ _id: toObjectId(userId) });
                
                if (!user) {
                    return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
                }
                
                // 비밀번호 제외하고 반환
                const { password, ...userWithoutPassword } = user;
                res.json(userWithoutPassword);
            } catch (error) {
                res.status(500).json({ message: "사용자 정보 조회 실패", error: error.message });
            }
        });

    // 🚩 [수정] 지리 공간 인덱스 - 첫 실행시에만 필요, 이후에는 불필요
    // 인덱스는 MongoDB에 영구 저장되므로 매 서버 시작마다 체크할 필요 없음
    // 필요시 수동으로 scripts/check_and_fix_indexes.js 실행
    console.log('ℹ️ 인덱스는 이미 설정됨 (수동 관리: scripts/check_and_fix_indexes.js)');

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

// 🚩 [추가] Admin: 사용자 스위치
app.post('/api/admin/switch-user/:userId', verifyAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const targetUser = await collections.users.findOne({ _id: toObjectId(userId) });
        if (!targetUser) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });

        // 해당 사용자의 JWT 토큰 생성
        const token = jwt.sign(
            { userId: targetUser._id.toString(), username: targetUser.username, role: targetUser.role, position: targetUser.position || '백성' },
            jwtSecret,
            { expiresIn: '365d' }
        );

        res.json({ message: "사용자로 스위치되었습니다.", token });
    } catch (error) {
        res.status(500).json({ message: "스위치 실패", error: error.message });
    }
});

// 🚩 [추가] 레이어 기본 설정 관리
// 기본 레이어 설정
const defaultLayerSettings = {
    city: true,
    placeLabel: false,
    countryLabel: true,
    ethnicLabel: false,
    military: false,
    natural: false,
    event: false,
    territoryPolygon: true,
    rivers: false,
    timeline: true,
    kingPanel: false,
    historyPanel: false,
    userContributions: true
};

// 레이어 설정 불러오기
app.get('/api/layer-settings', async (req, res) => {
    try {
        const settings = await collections.layerSettings.findOne({ type: 'default' });
        if (!settings) {
            // 설정이 없으면 기본값 반환
            return res.json({ settings: defaultLayerSettings });
        }
        res.json({ settings: settings.settings });
    } catch (error) {
        res.status(500).json({ message: "레이어 설정 불러오기 실패", error: error.message });
    }
});

// 레이어 설정 저장
app.put('/api/layer-settings', verifyAdmin, async (req, res) => {
    try {
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ message: "올바른 설정 데이터가 필요합니다." });
        }

        // 설정 저장
        await collections.layerSettings.updateOne(
            { type: 'default' },
            { $set: { settings, updatedAt: new Date() } },
            { upsert: true }
        );

        res.json({ message: "레이어 설정이 저장되었습니다." });
    } catch (error) {
        res.status(500).json({ message: "레이어 설정 저장 실패", error: error.message });
    }
});

// 🚩 [추가] 기여물 검토
app.put('/api/contributions/:id/review', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, comment } = req.body;
        const userId = req.user.userId;

        const contribution = await collections.contributions.findOne({ _id: toObjectId(id) });
        if (!contribution) return res.status(404).json({ message: "기여를 찾을 수 없습니다." });

        // pending 상태에서만 검토 가능
        if (contribution.status !== 'pending') return res.status(400).json({ message: "이미 검토된 기여입니다." });

        // 🚩 [수정] 검토자 권한 확인 - 시강학사(종4품) ~ 수찬관(정3품) - 상급 사관
        const reviewerPositions = [
            '시강학사', '사관수찬', '직수찬관', '수찬관'  // 종4품~정3품 (상급 사관)
        ];
        const user = await collections.users.findOne({ _id: toObjectId(userId) });
        
        // 🚩 [수정] DB에 저장된 직급 또는 실시간 계산된 직급 확인
        // (admin이 수동으로 직급을 부여한 경우를 위해 DB 직급도 확인)
        const hasReviewerPosition = reviewerPositions.includes(user.position);
        
        if (!user || !hasReviewerPosition) {
            return res.status(403).json({ 
                message: `검토 권한이 없습니다. (시강학사(종4품) 이상만 가능, 현재: ${user.position})` 
            });
        }

        // 🚩 [수정] 검토는 'reviewed' 상태로 변경 (승인이 아님)
        const updateData = {
            status: status === 'approved' ? 'reviewed' : 'rejected',  // approved → reviewed로 변경
            reviewerId: toObjectId(userId),
            reviewerUsername: user.username,  // 검토자 이름 저장
            reviewedAt: new Date(),
            reviewComment: comment || null
        };

        await collections.contributions.updateOne({ _id: toObjectId(id) }, { $set: updateData });

        // 🚩 [수정] 검토자 점수 부여 (5점)
        await collections.users.updateOne(
            { _id: toObjectId(userId) },
            { $inc: { reviewScore: 5 } }
        );

        res.json({ message: `기여가 ${status === 'approved' ? '검토 완료' : '검토 거부'}되었습니다.` });
    } catch (error) {
        res.status(500).json({ message: "검토 실패", error: error.message });
    }
});

// 🚩 [추가] 최종 승인 API (동수국사 이상만 가능)
app.put('/api/contributions/:id/approve', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        const userId = req.user.userId;

        const contribution = await collections.contributions.findOne({ _id: toObjectId(id) });
        if (!contribution) return res.status(404).json({ message: "기여를 찾을 수 없습니다." });

        console.log('🔍 [Approve] 기여 상태:', contribution.status, '기여 ID:', id);

        // reviewed 상태에서만 승인 가능 (또는 pending 상태도 허용 - 고위직이 바로 승인 가능)
        if (contribution.status !== 'reviewed' && contribution.status !== 'pending') {
            console.log('⛔ [Approve] 상태 오류 - 현재 상태:', contribution.status);
            return res.status(400).json({ message: `승인할 수 없는 상태입니다. (현재 상태: ${contribution.status})` });
        }

        // 🚩 [수정] 승인자 권한 확인 (동수국사(종2품) 이상) - DB position과 실시간 계산 모두 확인
        const approverPositions = ['동수국사', '수국사', '판사관사', '감수국사'];
        const user = await collections.users.findOne({ _id: toObjectId(userId) });
        
        // 🚩 [추가] 실시간 직급 계산 (고려 사관 통합 18단계 직급표)
        const userScore = (user.totalCount || 0) * 3 + (user.approvedCount || 0) * 10 + 
                         (user.totalVotes || 0) + (user.reviewScore || 0) + (user.approvalScore || 0);
        
        // 사용자 순위 조회 (재상급 직급 판별용)
        const allUsers = await collections.users.find().toArray();
        const usersWithScores = allUsers.map(u => ({
            _id: u._id.toString(),
            score: (u.totalCount || 0) * 3 + (u.approvedCount || 0) * 10 + 
                   (u.totalVotes || 0) + (u.reviewScore || 0) + (u.approvalScore || 0)
        })).sort((a, b) => b.score - a.score);
        const userRank = usersWithScores.findIndex(u => u._id === userId) + 1;
        
        let realtimePosition = user.position || '수분권지';
        // 정1품~종2품 (재상급 - 순위 + 최소 점수 기준)
        if (userScore >= 5000 && userRank === 1) realtimePosition = '감수국사';      // 정1품
        else if (userScore >= 4300 && userRank <= 2) realtimePosition = '판사관사';  // 종1품
        else if (userScore >= 3700 && userRank <= 3) realtimePosition = '수국사';    // 정2품
        else if (userScore >= 3100 && userRank <= 4) realtimePosition = '동수국사';  // 종2품
        // 정3품~종4품 (상급 사관)
        else if (userScore >= 2600) realtimePosition = '수찬관';                     // 정3품
        else if (userScore >= 2100) realtimePosition = '직수찬관';                   // 종3품
        else if (userScore >= 1700) realtimePosition = '사관수찬';                   // 정4품
        else if (userScore >= 1400) realtimePosition = '시강학사';                   // 종4품
        // 정5품~종6품 (중급 사관)
        else if (userScore >= 1100) realtimePosition = '기거주';                     // 정5품
        else if (userScore >= 850) realtimePosition = '기거사';                      // 종5품
        else if (userScore >= 650) realtimePosition = '기거랑';                      // 정6품
        else if (userScore >= 450) realtimePosition = '기거도위';                    // 종6품
        // 정7품~종9품 (하급 사관)
        else if (userScore >= 300) realtimePosition = '수찬';                        // 정7품
        else if (userScore >= 200) realtimePosition = '직문한';                      // 종7품
        else if (userScore >= 120) realtimePosition = '주서';                        // 정8품
        else if (userScore >= 60) realtimePosition = '검열';                         // 종8품
        else if (userScore >= 30) realtimePosition = '정자';                         // 정9품
        else realtimePosition = '수분권지';                                          // 종9품
        
        console.log('🔍 [Approve] 사용자:', user.username, 'DB직급:', user.position, '실시간직급:', realtimePosition, '점수:', userScore);
        
        // 🚩 [수정] DB에 저장된 직급 또는 실시간 계산된 직급 중 하나라도 승인 권한이 있으면 허용
        const hasApproverPosition = approverPositions.includes(user.position) || approverPositions.includes(realtimePosition);
        
        if (!user || !hasApproverPosition) {
            return res.status(403).json({ 
                message: `승인 권한이 없습니다. (동수국사(종2품) 이상만 가능, DB직급: ${user.position}, 실시간직급: ${realtimePosition})` 
            });
        }

        const updateData = {
            status: 'approved',
            approverId: toObjectId(userId),
            approverUsername: user.username,
            approvedAt: new Date(),
            approveComment: comment || null
        };

        await collections.contributions.updateOne({ _id: toObjectId(id) }, { $set: updateData });

        // 🚩 [추가] 승인자 점수 부여 (10점)
        await collections.users.updateOne(
            { _id: toObjectId(userId) },
            { $inc: { approvalScore: 10 } }
        );

        // 🚩 [추가] 검토자가 있으면 검토자에게도 추가 점수 (5점)
        if (contribution.reviewerId) {
            await collections.users.updateOne(
                { _id: contribution.reviewerId },
                { $inc: { reviewScore: 5 } }  // 최종 승인 시 검토자 추가 보상
            );
        }

        // 🚩 [핵심 추가] 승인된 기여를 Castle로 자동 변환
        if (contribution.category !== 'historical_record' && contribution.lat && contribution.lng) {
            try {
                const newCastle = {
                    name: contribution.name,
                    lat: contribution.lat,
                    lng: contribution.lng,
                    description: contribution.description || '',
                    built_year: contribution.year || null,
                    country_id: contribution.countryId || null,
                    is_label: contribution.category === 'place_label' || false,
                    label_type: contribution.category === 'place_label' ? 'place' : null,
                    created_by: contribution.username || 'unknown',
                    created_from_contribution: contribution._id,
                    created_at: new Date()
                };

                const insertResult = await collections.castle.insertOne(newCastle);
                console.log(`✅ [Castle 생성] 승인된 기여 "${contribution.name}"를 Castle로 변환 완료 (ID: ${insertResult.insertedId})`);
                
                // 기여자에게도 추가 보상 (승인 완료 시)
                if (contribution.userId) {
                    await collections.users.updateOne(
                        { _id: contribution.userId },
                        { $inc: { approvedCount: 1 } }  // 승인된 기여 카운트 증가
                    );
                }
            } catch (castleError) {
                console.error('❌ [Castle 생성 실패]', castleError);
                // Castle 생성 실패해도 승인은 완료된 상태 유지
            }
        } else {
            console.log(`ℹ️ [Castle 변환 스킵] 사관 기록이거나 좌표 없음: category=${contribution.category}, lat=${contribution.lat}, lng=${contribution.lng}`);
        }

        res.json({ message: "기여가 최종 승인되었습니다. 성 마커로 변환되었습니다." });
    } catch (error) {
        res.status(500).json({ message: "승인 실패", error: error.message });
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