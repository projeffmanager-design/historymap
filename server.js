// PUT: 왕 정보 업데이트 (기존 로직 유지, ObjectId 사용)
app.put('/api/kings/:id', verifyAdmin, async (req, res) => {
// ...
//기존 PUT 로직 유지 (kings 배열 내의 _id를 찾아 업데이트)
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
// ...
기존 DELETE 로직 유지 (kings 배열 내의 _id를 찾아 삭제)
    try {
        const { id } = req.params; // 삭제할 왕 레코드의 _id (문자열)
        const _id = toObjectId(id);
        if (!_id) return res.status(400).json({ message: "잘못된 ID 형식입니다." });
// 1단계: designated_position / designated_rank 적용
                // 구버전 형식(품계 없음) → 품계 포함 형식으로 정규화하는 서버 헬퍼
                const normalizePositionServer = (pos) => {
                    if (!pos) return pos;
                    if (/^(정|종)[0-9]품/.test(pos)) return pos; // 이미 품계 포함
                    // 이름만 있는 경우 tiers에서 찾아 grade 붙이기
                    for (const t of RANK_CONFIG.tiers) {
                        if (pos === t.name || pos === t.fullName) return `${t.grade} ${t.fullName}`;
                    }
                    for (const mt of RANK_CONFIG.ministerTiers) {
                        if (pos === mt.name || pos === mt.fullName) return `${mt.grade} ${mt.fullName}`;
                    }
                    return pos;
                };
                const designatedSlots = new Set();
                rankings.forEach((user) => {
                    if (user.designated_position) {
                        user.position = normalizePositionServer(user.designated_position);
                        user.isDesignatedPosition = true;
                    }
                    if (user.designated_rank) {
                        const mt = RANK_CONFIG.ministerTiers.find(t => t.rank === user.designated_rank);
                        if (mt) {
                            user.position = `${mt.grade} ${mt.fullName}`;
                            user.isMinister = true;
                            user.isDesignated = true;
                            designatedSlots.add(user.designated_rank);
                        }
                    }
                });
                // 2단계: 점수 경쟁으로 빈 재상급 자리 채우기
                //   · designated_position / designated_rank 적용된 사용자 제외
                //   · 종2품 최소 점수(3100) 이상이어야 재상급 자격
                //   · rankings는 이미 score 내림차순 정렬되어 있음
                const MINISTER_MIN_SCORE = RANK_CONFIG.ministerTiers[RANK_CONFIG.ministerTiers.length - 1].minScore; // 3100
                let competitiveRank = 1;
                rankings.forEach((user) => {
                    if (user.isDesignated || user.isDesignatedPosition) return;
                    // 빈 slot 찾기 (designated로 채워진 slot 건너뜀)
                    while (competitiveRank <= RANK_CONFIG.ministerTiers.length && designatedSlots.has(competitiveRank)) {
                        competitiveRank++;
                    }
                    if (competitiveRank <= RANK_CONFIG.ministerTiers.length && user.score >= MINISTER_MIN_SCORE) {
                        // 해당 slot의 개별 minScore도 충족해야 함
                        const mt = RANK_CONFIG.ministerTiers.find(t => t.rank === competitiveRank);
                        if (mt && user.score >= mt.minScore) {
                            user.position = `${mt.grade} ${mt.fullName}`;
                            user.isMinister = true;
                            competitiveRank++;
                        } else {
                            // 이 slot의 minScore 미달 → 더 이상 재상급 없음 (이후 모두 탈락)
                            competitiveRank = RANK_CONFIG.ministerTiers.length + 1;
app.post('/api/admin/rebuild-tiles', verifyAdmin, async (req, res) => {
            if (_tileRebuildInProgress) {
                return res.status(409).json({ message: '이미 타일 재빌드가 진행 중입니다.
잠시 후 다시 시도하세요.' });
            }
            res.json({ message: '🗺️ 영토 타일 재빌드 시작.
서버 로그를 확인하세요.' });
            rebuildTerritoryTiles('admin 수동 트리거', true).catch(e =>
                console.error('❌ [타일 수동 재빌드 실패]', e.message)
            );
        });
        // 🔔 내부 webhook: Vercel API 호출 후 로컬 서버에 증분 재빌드 알림 (localhost 전용)
        app.post('/api/internal/tile-notify', async (req, res) => {
            const ip = req.ip || req.connection?.remoteAddress || '';
            const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
            if (!isLocalhost) {
                return res.status(403).json({ message: 'localhost에서만 사용 가능합니다.' });
            }
            const { action, ids } = req.body; // action: 'add'|'update'|'delete', ids: [string, ...]
            if (!action) return res.status(400).json({ message: 'action 필드가 필요합니다.' });
            if (_tileRebuildInProgress) {
                // 이미 진행 중이면 dirty 목록에 추가만 하고 OK 반환
                if (Array.isArray(ids)) ids.forEach(id => _dirtyTerritoryIds.add(id));
                _territoryDirty = true;
                return res.json({ message: '재빌드 진행 중 - dirty 목록에 추가됨', queued: true });
            }
            const affectedIds = Array.isArray(ids) && ids.length > 0 ?
new Set(ids) : null;
            if (affectedIds) affectedIds.forEach(id => _dirtyTerritoryIds.add(id));
            _territoryDirty = true;
            res.json({ message: `🗺️ 증분 타일 재빌드 시작 (${action}, ${affectedIds ?
affectedIds.size : '전체'}개)` });
            rebuildTerritoryTilesIncremental(`외부 알림(${action})`, affectedIds).catch(e =>
                console.error('❌ [webhook 타일 재빌드 실패]', e.message)
            );
        });
        // 🔔 내부 타일 재빌드 상태 조회 (localhost 전용)
        app.get('/api/internal/tile-status', (req, res) => {
            const ip = req.ip || req.connection?.remoteAddress || '';
            const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
            if (!isLocalhost) {
                return res.status(403).json({ message: 'localhost에서만 사용 가능합니다.' });
            }
            res.json({
                inProgress: _tileRebuildInProgress,
                dirty: _territoryDirty,
                dirtyCount: _dirtyTerritoryIds.size
            });
        });
// 🚩 [추가] history_id가 있고 lat/lng가 없는 이벤트에 castle 좌표 자동 join
                const needsCoords = events.filter(ev => ev.history_id && (ev.lat == null || ev.lng == null));
                if (needsCoords.length > 0) {
                    const { ObjectId } = require('mongodb');
                    const ids = needsCoords.map(ev => {
                        try { return new ObjectId(ev.history_id); } catch(e) { return null; }
                    }).filter(Boolean);
                    if (ids.length > 0) {
                        const castleMap = new Map();
                        const castleDocs = await collections.castle.find(
                            { _id: { $in: ids } },
                            { projection: { _id: 1, lat: 1, lng: 1, name: 1 } }
                        ).toArray();
                        castleDocs.forEach(c => castleMap.set(c._id.toString(), c));
                        events.forEach(ev => {
                            if (ev.history_id && (ev.lat == null || ev.lng == null)) {
                                const c = castleMap.get(ev.history_id);
                                if (c && c.lat != null && c.lng != null) {
                                    ev.lat = c.lat;
                                    ev.lng = c.lng;
                                    ev._castle_name = c.name || null;
                                }
                            }
                        });
                    }
                }
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
        app.get('/api/events/:id', async (req, res) => {
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
                // 🚩 [추가] history_id가 있고 lat/lng가 없으면 castle 좌표 join (전체 조회와 동일)
                if (event.history_id && (event.lat == null || event.lng == null)) {
                    try {
                        const { ObjectId } = require('mongodb');
                        const castleId = new ObjectId(event.history_id);
                        const castle = await collections.castle.findOne(
                            { _id: castleId },
                            { projection: { _id: 1, lat: 1, lng: 1, name: 1 } }
                        );
// 📢 [추가] 공지사항 등록 API (admin/superuser 전용)
app.post('/api/notice', verifyAdmin, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.trim()) return res.status(400).json({ message: '공지 내용을 입력하세요.' });
        const text = message.trim().slice(0, 300);
        const noticeDoc = {
            type: 'notice',
            actor: req.user.username,
            actorPosition: req.user.position || 'admin',
            targetName: null,
            extra: { text },
            createdAt: new Date(),
            pinned: true   // 공지는 항상 상단 고정 표시용 플래그
        };
        await collections.activityLogs.insertOne(noticeDoc);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: '공지 등록 실패', error: error.message });
    }
});
// 📢 [추가] 공지사항 삭제 API (admin/superuser 전용)
app.delete('/api/notice/:id', verifyAdmin, async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const result = await collections.activityLogs.deleteOne({
            _id: new ObjectId(req.params.id),
            type: 'notice'
        });
        if (result.deletedCount === 0) return res.status(404).json({ message: '공지를 찾을 수 없습니다.' });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: '공지 삭제 실패', error: error.message });
    }
});
// GET: 전체 마커 의견 개수 맵 조회 (인증 불필요 — 뱃지 표시용)
app.get('/api/marker-comments-counts', async (req, res) => {
    try {
        const counts = await collections.markerComments.aggregate([
            { $group: { _id: '$castle_id', count: { $sum: 1 } } }
        ]).toArray();
        // { castleId: count } 형태로 변환
        const result = {};
        counts.forEach(c => { result[c._id] = c.count; });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: '카운트 조회 실패', error: error.message });
    }
});
// GET: 특정 마커의 의견 목록 조회
app.get('/api/marker-comments/:castleId', async (req, res) => {
    try {
        const { castleId } = req.params;
        const comments = await collections.markerComments
            .find({ castle_id: castleId })
            .sort({ created_at: -1 })
            .toArray();
        res.json(comments);
    } catch (error) {
        res.status(500).json({ message: '의견 조회 실패', error: error.message });
    }
});
// POST: 의견 작성 (로그인 필요)
app.post('/api/marker-comments', verifyToken, async (req, res) => {
    try {
        const { castle_id, text } = req.body;
        if (!castle_id || !text || text.trim().length === 0) {
            return res.status(400).json({ message: '마커 ID와 의견 내용이 필요합니다.'
// 🚩 [추가] 로그인 로그 기록
                await collections.loginLogs.insertOne({
                    userId: user._id,
                    timestamp: new Date()
                });
                // 🚩 [추가] 사용자 공적 점수 계산 (출석 처리 전에 먼저)
                let score = 0;
                try {
                    // userId(ObjectId) 또는 username 문자열 양쪽으로 저장된 기여도 모두 집계
                    const contribAgg = await collections.contributions.aggregate([
                        { $match: { $or: [{ userId: user._id }, { username: user.username }] } },
                        { $group: {
                            _id: null,
                            totalCount:    { $sum: 1 },
                            approvedCount: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
                            totalVotes:    { $sum: { $ifNull: ['$votes', 0] } }
                        }}
                    ]).toArray();
                    const stats = contribAgg[0] || { totalCount: 0, approvedCount: 0, totalVotes: 0 };
                    score = (stats.totalCount    * RANK_CONFIG.scoreWeights.submitCount)
                          + (stats.approvedCount * RANK_CONFIG.scoreWeights.approvedCount)
                          + stats.totalVotes
                          + (user.reviewScore      || 0)
                          + (user.approvalScore    || 0)
                          + (user.attendancePoints || 0)
                          + (user.commentScore     || 0);
                } catch (error) {
                    console.error('점수 계산 에러:', error);
                    score = 0;
                }
                // 실시간 직급 계산 (admin 지정 재상급 우선, 없으면 점수 기반)
                // 항상 실시간 재계산 — 이전에 저장된 position 값은 무시
                const position = getRealtimePosition(score, null, user.designated_rank || null);
                // 🚩 [추가] 출석 포인트 처리 (하루에 1회 1점)
                // KST(UTC+9) 기준 날짜 계산 (Vercel 서버는 UTC 사용)
                const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
                const today = nowKST.toISOString().split('T')[0]; // YYYY-MM-DD (KST 기준)
                let attendancePoints = 0;
                // 게스트는 출석 점수 부여 대상에서 제외
                if (user.isGuest) {
                    return res.json({ attended: false, message: '게스트 계정은 출석 점수를 받을 수 없습니다.' });
                }
                if (!user.lastAttendanceDate || user.lastAttendanceDate !== today) {
                    // 출석하지 않은 경우 1점 지급
                    attendancePoints = 1;
                    await collections.users.updateOne(
                        { _id: user._id },
                        {
                            $set: { lastAttendanceDate: today, position: position },
                            $inc: { attendancePoints: 1 } // 출석 포인트 누적
                        }
                    );
                    console.log(`출석 포인트 지급: ${user.
// 3.
전체 재빌드: 기존 파일 삭제 후 전체 저장 ──────────────────
                if (isFullRebuild) {
                    const existing = fs.readdirSync(TILES_DIR).filter(f => f.endsWith('.json'));
                    for (const f of existing) fs.unlinkSync(path.join(TILES_DIR, f));
                    for (const [, tile] of tileMap) {
                        const filename = `tile_${tile.tile_lat}_${tile.tile_lng}.json`;
                        fs.writeFileSync(path.join(TILES_DIR, filename), JSON.stringify({
                            type: 'FeatureCollection', tile_lat: tile.tile_lat, tile_lng: tile.tile_lng,
                            bounds: tile.bounds, features: tile.features, feature_count: tile.features.length
                        }));
                    }
                } else {
                    // 4.
증분: 영향받는 타일 파일만 덮어쓰기 ──────────────────
                    for (const key of affectedTileKeys) {
                        const filename = `tile_${key.replace('_', '_')}.json`;
                        const filepath = path.join(TILES_DIR, filename);
                        const tile = tileMap.get(key);
                        if (tile && tile.features.length > 0) {
                            fs.writeFileSync(filepath, JSON.stringify({
                                type: 'FeatureCollection', tile_lat: tile.tile_lat, tile_lng: tile.tile_lng,
                                bounds: tile.bounds, features: tile.features, feature_count: tile.features.length
                            }));
                        } else {
                            // 영토가 없어진 타일은 파일 삭제
                            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
                        }
                    }
                    // 새 영토가 새 타일을 만들 수 있으므로 기존 타일 외 신규 타일 저장
                    for (const [key, tile] of tileMap) {
                        if (affectedTileKeys.has(key)) continue; // 이미 처리됨
                        const filename = `tile_${tile.tile_lat}_${tile.tile_lng}.json`;
                        fs.writeFileSync(path.join(TILES_DIR, filename), JSON.stringify({
                            type: 'FeatureCollection', tile_lat: tile.tile_lat, tile_lng: tile.tile_lng,
                            bounds: tile.bounds, features: tile.features, feature_count: tile.features.length
                        }));
                    }
                }
                // 5.
index.json 갱신 ────────────────────────────────────────────
                const tileCount = _rebuildTileIndex();
                _territoryDirty = false;
                _dirtyTerritoryIds = new Set();
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`✅ [타일 재빌드 완료] ${tileCount}개 타일 (${isFullRebuild ?
'전체' : '증분'}, ${elapsed}초)`);
                // 6.
Vercel 자동 배포 ───────────────────────────────────────────
                await _gitPushTiles(reason);
            } catch (e) {
                console.error('❌ [타일 재빌드 실패]', e.message);
            } finally {
                _tileRebuildInProgress = false;
            }
        }
} catch (e) {
                console.error(`❌ [Vercel 배포 실패] ${e.message}`);
            }
        }
        let _tileRebuildInProgress = false;
        // ─── 증분 타일 재빌드: 변경된 영토 ID Set만 처리 ────────────────────────
        // affectedIds: Set<string> — 비어 있으면 전체 재빌드 (force 모드)
        async function rebuildTerritoryTilesIncremental(reason, affectedIds = null) {
            if (_tileRebuildInProgress) {
                console.log(`⏳ [타일 스킵] 이미 진행 중 (사유: ${reason})`);
                return;
            }
            _tileRebuildInProgress = true;
            const startTime = Date.now();
            const isFullRebuild = !affectedIds || affectedIds.size === 0;
            console.log(`🗺️  [타일 ${isFullRebuild ?
'전체' : '증분'} 재빌드 시작] (사유: ${reason}, 대상: ${isFullRebuild ?
'전체' : affectedIds.size + '개 영토'})`);
            try {
                // 1.
영향받는 타일 키 수집 ──────────────────────────────────────
                let affectedTileKeys; // Set<string> | null(전체)
                if (!isFullRebuild) {
                    affectedTileKeys = new Set();
                    // 현재 타일 파일에서 해당 영토가 들어있는 타일 키 찾기
                    const existingFiles = fs.readdirSync(TILES_DIR).filter(f => f.match(/^tile_-?\d+_-?\d+\.json$/));
                    for (const filename of existingFiles) {
                        const raw = JSON.parse(fs.readFileSync(path.join(TILES_DIR, filename), 'utf8'));
                        const hasAffected = (raw.features || []).some(f => affectedIds.has(f.properties?._id));
                        if (hasAffected) {
                            const m = filename.match(/^tile_(-?\d+)_(-?\d+)\.json$/);
                            if (m) affectedTileKeys.add(`${m[1]}_${m[2]}`);
                        }
                    }
                }
                // 2.
영향받는 타일에 포함될 영토 조회 ──────────────────────────
                // 전체 재빌드: 모든 영토
                // 증분: 영향받는 타일 bbox와 겹치는 영토 전체 (타일 내 다른 영토도 유지)
                let territoriesToQuery = {};
                if (!isFullRebuild && affectedTileKeys.size > 0) {
                    // 영향 타일들의 전체 bbox 범위 계산
                    let qMinLat = 90, qMaxLat = -90, qMinLng = 180, qMaxLng = -180;
                    for (const key of affectedTileKeys) {
                        const [lat, lng] = key.split('_').map(Number);
                        if (lat < qMinLat) qMinLat = lat;
                        if (lat + TILE_SIZE > qMaxLat) qMaxLat = lat + TILE_SIZE;
                        if (lng < qMinLng) qMinLng = lng;
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
                res.json({ message: `사용자 계정이 성공적으로 ${lock ?
'잠금' : '해제'}되었습니다.` });
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
                if (status && status !== 'all') {
                    query.status = status;
                } else if (!status) {
                    // 기본 조회: approved/rejected는 제외 (지도에서 불필요)
                    query.status = { $in: ['pending', 'reviewed'] };
                }
                // status=all 이면 필터 없이 전체 반환 (관리자 페이지용)
                if (userId) {
                    try { query.userId = toObjectId(userId); }
                    catch (e) { query.userId = userId; }
                }
                const contributions = await collections.contributions.find(query)
                    .sort({ createdAt: -1 })
                    .toArray();
                if (contributions.length === 0) return res.json([]);
                // ⚡ 배치 처리: userId 집합을 한 번에 조회 (N+1 → 1쿼리)
                const allUserIds = [...new Set(contributions.flatMap(c => {
                    const ids = [];
                    if (c.userId)     ids.push(String(c.userId));
                    if (c.reviewerId) ids.push(String(c.reviewerId));
                    if (c.reviewedBy) ids.push(String(c.reviewedBy));
                    if (c.approverId) ids.push(String(c.approverId));
                    if (c.votedBy)    c.votedBy.forEach(id => ids.push(String(id)));
                    return ids;
                }))];
                const userDocs = await collections.users.find(
                    { _id: { $in: allUserIds.map(id => { try { return toObjectId(id); } catch { return id; } }) } },
                    { projection: { username: 1 } }
                ).toArray();
                const userMap = Object.fromEntries(userDocs.map(u => [String(u._id), u.username]));
existsSync(filepath)) fs.unlinkSync(filepath);
                        }
                    }
                    // 새 영토가 새 타일을 만들 수 있으므로 기존 타일 외 신규 타일 저장
                    for (const [key, tile] of tileMap) {
                        if (affectedTileKeys.has(key)) continue; // 이미 처리됨
                        const filename = `tile_${tile.tile_lat}_${tile.tile_lng}.json`;
                        fs.writeFileSync(path.join(TILES_DIR, filename), JSON.stringify({
                            type: 'FeatureCollection', tile_lat: tile.tile_lat, tile_lng: tile.tile_lng,
                            bounds: tile.bounds, features: tile.features, feature_count: tile.features.length
                        }));
                    }
                }
                // 5.
index.json 갱신 ────────────────────────────────────────────
                const tileCount = _rebuildTileIndex();
                _territoryDirty = false;
                _dirtyTerritoryIds = new Set();
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`✅ [타일 재빌드 완료] ${tileCount}개 타일 (${isFullRebuild ?
'전체' : '증분'}, ${elapsed}초)`);
                // 6.
Vercel 자동 배포 ───────────────────────────────────────────
                await _gitPushTiles(reason);
            } catch (e) {
                console.error('❌ [타일 재빌드 실패]', e.message);
            } finally {
                _tileRebuildInProgress = false;
            }
        }
        // 하위 호환: 기존 rebuildTerritoryTiles 호출부 지원
        async function rebuildTerritoryTiles(reason, force = false) {
            if (!force && !_territoryDirty) {
                console.log(`⏭️  [타일 스킵] 영토 변경 없음 (사유: ${reason})`);
                return;
            }
            // 야간 배치: dirty ID Set으로 증분, 없으면 전체
            const ids = _dirtyTerritoryIds.size > 0 ?
new Set(_dirtyTerritoryIds) : null;
            await rebuildTerritoryTilesIncremental(reason, force ?
null : ids);
        }
        // ⏰ [배치 스케줄러] 매일 새벽 3시 — castles.json + 영토 타일(변경시만) 갱신
        (function scheduleDailyRebuild() {
            function msUntilNextBatch() {
                const now = new Date();
                const next = new Date(now);
                next.setHours(3, 0, 0, 0);
                if (next <= now) next.setDate(next.getDate() + 1);
                return next - now;
            }
            function scheduleNext() {
                const delay = msUntilNextBatch();
                const nextTime = new Date(Date.now() + delay).toLocaleString('ko-KR');
                console.log(`⏰ [배치] 다음 야간 재빌드 예약: ${nextTime} (${Math.round(delay / 3600000)}시간 후)`);
                setTimeout(async () => {
                    await rebuildCastleStaticFile('야간 배치 (새벽 3시)');
// GET: Territory Tiles (Topojson compressed + tile-based) - Optimized
        app.get('/api/territory-tiles', async (req, res) => {
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
                console.log(`🗺️ Territory Tiles query start.
(bounds: ${minLat ?
'O' : 'X'})`);
                const startTime = Date.now();
                const tiles = await collections.territory_tiles.find(query).toArray();
                const elapsed = Date.now() - startTime;
                const totalSize = tiles.reduce((sum, t) => sum + (t.compressed_size || 0), 0);
                console.log(`🗺️ Territory Tiles complete: ${tiles.length} tiles, ${(totalSize/1024).toFixed(2)}KB (${elapsed}ms)`);
                res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
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
                        console.log(`🚀 Territories 캐시 사용 (${(cacheAge/1000).toFixed(0)}초 전 데이터, ${territoriesCache.
query;
                // 🚀 [v3.5] label_type 없는 전체 조회 시 서버 캐시 사용
                // 🚀 [v3.7] 캐시가 있어도 DB에서 신규 추가 / 삭제된 항목을 동기화해 병합
                // → Vercel serverless에서 castles.json push 없이도 신규 승인·삭제 마커 즉시 반영
                if (!label_type && _castleCache && (Date.now() - _castleCacheTime) < CASTLE_CACHE_TTL) {
                    try {
                        const { ObjectId: ObjId } = require('mongodb');
                // ✅ [추가] updatedAt 기반 수정된 항목 동기화 (이름 변경 등)
                const updatedDocs = await collections.castle.find({
                    $and: [
                        { $or: [{ deleted: { $exists: false } }, { deleted: false }] },
                        { updatedAt: { $gt: new Date(_castleCacheTime) } }
                    ]
                }).toArray();
                if (updatedDocs.length > 0) {
                    console.log(`⚡ [증분 업데이트] ${updatedDocs.length}개 수정 항목 반영`);
                    for (const doc of updatedDocs) {
                        const idStr = String(doc._id);
                        const idx = _castleCache.findIndex(c => String(c._id) === idStr);
                        const asStr = { ...doc, _id: idStr };
                        if (idx >= 0) _castleCache[idx] = asStr;
                        else _castleCache.push(asStr);
                    }
                    _castleCacheTime = Date.now();
                    _castleLastModified = Date.now();
                }
                                        // 1) DB에서 삭제된 항목의 ID 목록 조회 → 캐시에서 제외
                        const deletedDocs = await collections.castle.find(
                            { deleted: true },
                            { projection: { _id: 1 } }
                        ).toArray();
                        const deletedIds = new Set(deletedDocs.map(d => String(d._id)));
                        // 2) 캐시 내 최신 ObjectId 추출 → 그보다 최신인 신규 항목 조회
                        const maxCachedId = _castleCache.reduce((max, c) => {
                            const id = String(c._id);
                            return id > max ?
id : max;
                        }, '0');
                        const newQuery = {
                            $and: [
                                { $or: [{ deleted: { $exists: false } }, { deleted: false }] },
                                { _id: { $gt: new ObjId(maxCachedId) } }
                            ]
                        };
                        const newDocs = await collections.castle.find(newQuery).toArray();
// 하위 호환: 기존 rebuildTerritoryTiles 호출부 지원
        async function rebuildTerritoryTiles(reason, force = false) {
            if (!force && !_territoryDirty) {
                console.log(`⏭️  [타일 스킵] 영토 변경 없음 (사유: ${reason})`);
                return;
            }
            // 야간 배치: dirty ID Set으로 증분, 없으면 전체
            const ids = _dirtyTerritoryIds.size > 0 ?
new Set(_dirtyTerritoryIds) : null;
            await rebuildTerritoryTilesIncremental(reason, force ?
null : ids);
        }
        // ⏰ [배치 스케줄러] 매일 새벽 3시 — castles.json + 영토 타일(변경시만) 갱신
        (function scheduleDailyRebuild() {
            function msUntilNextBatch() {
                const now = new Date();
                const next = new Date(now);
                next.setHours(3, 0, 0, 0);
                if (next <= now) next.setDate(next.getDate() + 1);
                return next - now;
            }
            function scheduleNext() {
                const delay = msUntilNextBatch();
                const nextTime = new Date(Date.now() + delay).toLocaleString('ko-KR');
                console.log(`⏰ [배치] 다음 야간 재빌드 예약: ${nextTime} (${Math.round(delay / 3600000)}시간 후)`);
                setTimeout(async () => {
                    await rebuildCastleStaticFile('야간 배치 (새벽 3시)');
                    await rebuildTerritoryTiles('야간 배치 (새벽 3시)'); // dirty면 증분, 아니면 skip (타일 push 내장)
                    // 🚀 Vercel 자동 배포 — castles.json 변경사항 push
                    try {
                        const { execSync } = require('child_process');
                        const repoDir = __dirname;
                        const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
                        execSync('git add public/castles.json', { cwd: repoDir });
                        const diffStat = execSync('git diff --cached --stat', { cwd: repoDir }).toString().trim();
                        if (diffStat) {
                            execSync(`git commit -m "chore: 야간 배치 castles.json 갱신 (${today})"`, { cwd: repoDir });
                            execSync('git push', { cwd: repoDir });
                            console.log(`✅ [Vercel 배포] castles.json push 완료`);
                        } else {
                            console.log(`⏭️  [Vercel 배포 스킵] castles.json 변경 없음`);
                        }
                    } catch (e) {
                        console.error('❌ [Vercel 배포 실패] git push 오류:', e.message);
                    }
                    scheduleNext();
                }, delay);
            }
            scheduleNext();
        })();
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
        // 🚀 [최적화] 서버 메모리 캐시 - Atlas 콜드스타트 8초 병목 해결
        let naturalFeaturesCache = null;
        let naturalFeaturesCacheTime = null;
        const NATURAL_FEATURES_CACHE_TTL = 10 * 60 * 1000; // 10분
        app.get('/api/natural-features', async (req, res) => {
            try {
                const { type } = req.query; // type: 'river', 'mountain', etc.
// type 없는 전체 조회만 캐시 적용 (type 지정 쿼리는 캐시 우회)
                if (!type && naturalFeaturesCache && naturalFeaturesCacheTime) {
                    const age = Date.now() - naturalFeaturesCacheTime;
                    if (age < NATURAL_FEATURES_CACHE_TTL) {
                        console.log(`🚀 [natural-features 캐시] ${(age/1000).toFixed(0)}초 전 데이터, ${naturalFeaturesCache.length}개`);
                        return res.json(naturalFeaturesCache);
                    }
                }
                const query = type ?
{ type } : {};
                const features = await collections.naturalFeatures.find(query).toArray();
                console.log(`🌊 [자연 지형지물 조회] type: ${type || 'all'}, ${features.length}개 반환`);
                // 전체 조회 결과만 캐시 저장
                if (!type) {
                    naturalFeaturesCache = features;
                    naturalFeaturesCacheTime = Date.now();
                }
                res.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');
                res.json(features);
            } catch (error) {
                console.error("자연 지형지물 조회 중 오류:", error);
                res.status(500).json({ message: "자연 지형지물 조회 실패", error: error.message });
            }
        });
}
                    return [points[0], points[points.length - 1]];
                }
                function simplifyCoords(coords, tol) {
                    if (!Array.isArray(coords)) return coords;
                    if (typeof coords[0] === 'number') return coords; // single point
                    if (typeof coords[0][0] === 'number') return dpSimplify(coords, tol); // ring
                    return coords.map(c => simplifyCoords(c, tol)); // Polygon/MultiPolygon
                }
                function truncCoords(coords) {
                    if (!Array.isArray(coords)) return coords;
                    if (typeof coords[0] === 'number') {
                        return [Math.round(coords[0] * 10000) / 10000,
                                Math.round(coords[1] * 10000) / 10000];
                    }
                    return coords.map(truncCoords);
                }
                const SIMPLIFY_TOL = 0.001; // ~100m — 지도 표시에 충분
                // ──────────────────────────────────────────────────────────────
                // lightweight 모드: geometry 제외, 메타데이터만
                if (lightweight === 'true') {
                    const territories = await collections.territories.find(query).project({
                        _id: 1, name: 1, name_ko: 1, name_en: 1, name_type: 1,
                        bbox: 1, start: 1, start_year: 1, end: 1, end_year: 1, level: 1, type: 1
                    }).toArray();
                    const elapsed = Date.now() - startTime;
                    console.log(`🗺️ Territories(lightweight) 완료: ${territories.length}개 (${elapsed}ms)`);
                    return res.json(territories);
                }
                // 🚀 Streaming cursor — toArray() 대신 cursor로 순회해 메모리 절감
                const result = [];
                const cursor = collections.territories.find(query);
                for await (const t of cursor) {
                    // geometry 좌표 단순화 + 정밀도 축소
                    const geomCoords = t.geometry?.coordinates || t.coordinates;
                    const geomType  = t.geometry?.type || t.type;
                    const simplified = geomCoords
                        ?
truncCoords(simplifyCoords(geomCoords, SIMPLIFY_TOL))
                        : geomCoords;
                    // ObjectId → hex string
                    const country = (t.country && typeof t.country === 'object' && t.country._id === undefined)
                        ?
String(t.country) : t.country;
                    const props = t.properties ?
{ ...t.properties } : t.properties;
                    if (props?.country_id && typeof props.country_id === 'object') {
                        props.country_id = String(props.country_id);
                    }
                    result.push({
                        _id: t._id,
                        name: t.name,
                        name_ko: t.name_ko,
                        name_en: t.name_en,
                        name_type: t.name_type,
                        type: geomType,
                        coordinates: simplified,
                        bbox: t.bbox,
                        level: t.level,
                        country,
                        properties: props,
                        osm_id: t.osm_id,
                        start: t.start || t.start_year,
                        end: t.end || t.end_year
                    });
                }
                const elapsed = Date.now() - startTime;
                const sizeMB = (JSON.stringify(result).length / 1024 / 1024).toFixed(2);
                console.log(`🗺️ Territories 조회 완료: ${result.length}개 (${elapsed}ms, ${sizeMB}MB)`);
if (user.role !== 'admin' && user.role !== 'superuser' && !approverPositions.includes(user.position)) {
            console.log('⛔ [verifyApprover] 승인 권한 부족 - Position:', user.position);
            return res.status(403).json({ message: "승인 권한이 필요합니다.
(정2품 수국사 이상)" });
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
}, delay);
            }
            scheduleNext();
        })();
        // 🔔 [v3.9] GET: castle 데이터 마지막 수정 시각 — 클라이언트 캐시 무효화용
        // 극초경량(JSON 1줄)이므로 캐시 체크용으로 매 페이지 로드 시 호출해도 무방
        app.get('/api/castle/version', async (req, res) => {
            try {
                // 최근 수정된 항목 (updatedAt 기준)
                const latestUpdated = await collections.castle.findOne(
                    { updatedAt: { $exists: true } },
                    { sort: { updatedAt: -1 }, projection: { updatedAt: 1 } }
                );
                let lastModified = _castleLastModified;
                if (latestUpdated && latestUpdated.updatedAt) {
                    lastModified = new Date(latestUpdated.updatedAt).getTime();
                }
                res.json({ lastModified });
            } catch (err) {
                console.error('[/api/castle/version] 에러:', err);
                // DB 에러 시 기존 메모리 변수 반환
                res.json({ lastModified: _castleLastModified });
            }
        });
        // GET: 모든 성 정보 반환
        app.get('/api/castle', async (req, res) => { // (collections.castle로 변경)
            try {                // 🚩 [추가] label_type 쿼리 파라미터로 필터링 지원
                const { label_type } = req.query;
                // 🚀 [v3.5] label_type 없는 전체 조회 시 서버 캐시 사용
                // 🚀 [v3.7] 캐시가 있어도 DB에서 신규 추가 / 삭제된 항목을 동기화해 병합
                // → Vercel serverless에서 castles.json push 없이도 신규 승인·삭제 마커 즉시 반영
                if (!label_type && _castleCache && (Date.now() - _castleCacheTime) < CASTLE_CACHE_TTL) {
                    try {
                        const { ObjectId: ObjId } = require('mongodb');
                // ✅ [추가] updatedAt 기반 수정된 항목 동기화 (이름 변경 등)
                const updatedDocs = await collections.castle.find({
                    $and: [
                        { $or: [{ deleted: { $exists: false } }, { deleted: false }] },
                        { updatedAt: { $gt: new Date(_castleCacheTime) } }
                    ]
                }).toArray();
                if (updatedDocs.length > 0) {
                    console.log(`⚡ [증분 업데이트] ${updatedDocs.length}개 수정 항목 반영`);
                    for (const doc of updatedDocs) {
                        const idStr = String(doc._id);
                        const idx = _castleCache.findIndex(c => String(c._id) === idStr);
                        const asStr = { ...doc, _id: idStr };
                        if (idx >= 0) _castleCache[idx] = asStr;
                        else _castleCache.push(asStr);
                    }
                    _castleCacheTime = Date.now();
                    _castleLastModified = Date.now();
                }
'place' : null,
                    label_color: '#ffffff',
                    label_size: 'medium',
                    natural_feature_type: contribution.natural_feature_type || null,
                    built_year: startYear,
                    built_month: 1,
                    destroyed_year: endYear,
                    destroyed_month: endYear ?
12 : null,
                    custom_icon: null,
                    icon_width: null,
                    icon_height: null,
                    originContributionId: contribution._id.toString(),
                    history: history,
                    country_id: countryId ?
toObjectId(countryId) : null,
                    createdBy: contribution.username || 'unknown',
                    path_data: []
                };
                // 🚩 [중복 방지] 이미 같은 contribution에서 생성된 castle이 있으면 스킵
                const existingCastleApprove = await collections.castle.findOne({
                    originContributionId: contribution._id.toString(),
                    $or: [{ deleted: { $exists: false } }, { deleted: false }]
                });
                if (existingCastleApprove) {
                    console.log(`⚠️ [/approve Castle 스킵] '${contribution.name}' 이미 castle 존재 (ID: ${existingCastleApprove._id})`);
                    insertedCastle = existingCastleApprove;
                } else {
                const insertResult = await collections.castle.insertOne(newCastle);
                insertedCastle = await collections.castle.findOne({ _id: insertResult.insertedId });
                logCRUD('CREATE', 'Castle (from approve)', newCastle.name, `(ID: ${insertResult.insertedId}, ContribID: ${contribution._id})`);
                console.log(`✅ [Castle 생성] 승인된 기여 "${contribution.name}"를 Castle로 변환 완료 (ID: ${insertResult.insertedId}, is_natural: ${isNatural})`);
                // 🔄 [자동화] 최종승인 castle 생성 → castles.json 재빌드
                invalidateCastleCache(); // 메모리 캐시 무효화 (파일은 새벽 3시 배치로 갱신)
                // 기여자에게도 추가 보상 (승인 완료 시)
                if (contribution.userId) {
                    await collections.users.updateOne(
                        { _id: contribution.userId },
                        { $inc: { approvedCount: 1 } }
                    );
                }
                }
            } catch (castleError) {
                console.error('❌ [Castle 생성 실패]', castleError);
                // Castle 생성 실패해도 승인은 완료된 상태 유지
            }
        } else {
            console.log(`ℹ️ [Castle 변환 스킵] 사관 기록이거나 좌표 없음: category=${contribution.category}, lat=${contribution.lat}, lng=${contribution.lng}`);
        }
        // 🚩 [추가] 동일 이름의 다른 pending/reviewed 중복 기여 자동 거부
        if (contribution.name) {
            const dupResult = await collections.contributions.updateMany(
                {
                    _id: { $ne: toObjectId(id) },
                    name: contribution.name,
                    status: { $in: ['pending', 'reviewed'] }
                },
                {
                    $set: {
                        status: 'rejected',
                        rejectComment: `"${contribution.name}" 이름의 다른 기여가 이미 승인되어 자동 거부됨`,
// ✅ [추가] X-Force-Refresh: 1이면 위 증분 업데이트 후 결과 반환 (캐시 신뢰 안 함)
                if (forceRefresh) {
                    console.log(`🔄 [X-Force-Refresh] 캐시 우회 — MongoDB 최신 데이터 반환`);
                    // 증분 업데이트 완료된 _castleCache 그대로 반환 (이미 최신화됨)
                }
                        // 1) DB에서 삭제된 항목의 ID 목록 조회 → 캐시에서 제외
                        const deletedDocs = await collections.castle.find(
                            { deleted: true },
                            { projection: { _id: 1 } }
                        ).toArray();
                        const deletedIds = new Set(deletedDocs.map(d => String(d._id)));
                        // 2) 캐시 내 최신 ObjectId 추출 → 그보다 최신인 신규 항목 조회
                        const maxCachedId = _castleCache.reduce((max, c) => {
                            const id = String(c._id);
                            return id > max ?
id : max;
                        }, '0');
                        const newQuery = {
                            $and: [
                                { $or: [{ deleted: { $exists: false } }, { deleted: false }] },
                                { _id: { $gt: new ObjId(maxCachedId) } }
                            ]
                        };
                        const newDocs = await collections.castle.find(newQuery).toArray();
                        // ✅ [버그수정] updatedAt 기반 수정된 항목 감지
                        // 기존 코드: _id 비교로 신규 추가만 감지 → 이름 변경 등 수정은 누락
                        // 수정 후: _castleCacheTime 이후 updatedAt이 변경된 항목도 캐시에 반영
                        if (_castleCache && _castleCacheTime) {
                            try {
                                const updatedDocs = await collections.castle.find({
                                    $and: [
                                        { $or: [{ deleted: { $exists: false } }, { deleted: false }] },
                                        { updatedAt: { $gt: new Date(_castleCacheTime) } }
                                    ]
                                }).toArray();
                                if (updatedDocs.length > 0) {
                                    console.log(`⚡ [증분 업데이트] updatedAt 기반 수정 감지: ${updatedDocs.length}개`);
                                    for (const doc of updatedDocs) {
                                        const idStr = String(doc._id);
                                        const asStr = { ...doc, _id: idStr };
                                        const idx = _castleCache.findIndex(c => String(c._id) === idStr);
                                        if (idx >= 0) {
                                            _castleCache[idx] = asStr;  // 수정된 항목 교체
                                        } else {
                                            _castleCache.push(asStr);   // 신규 항목 추가 (fallback)
                                        }
                                    }
                                    _castleCacheTime = Date.now();
                                    _castleLastModified = Date.now();
                                }
                            } catch (e) {
                                console.warn('⚠️ [증분 업데이트] updatedAt 체크 실패 (무시):', e.message);
                            }
                        }
// ----------------------------------------------------
        // 🏰 CASTLE (성/위치) API 엔드포인트
        // ----------------------------------------------------
        // 🚀 [v3.5] Castle 서버 메모리 캐시 (TTL 6시간) — Atlas 느린 쿼리 대응
        let _castleCache = null;
        let _castleCacheTime = 0;
        const CASTLE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6시간
        const CASTLE_STATIC_FILE = path.join(__dirname, 'public', 'castles.json');
        // 🔔 [v3.9] 마지막 castle 데이터 변경 시각 — 클라이언트 캐시 무효화용
        // 서버 재시작 시엔 castles.json mtime 기반으로 초기화
        let _castleLastModified = (() => {
            try {
                if (fs.existsSync(CASTLE_STATIC_FILE)) {
                    return fs.statSync(CASTLE_STATIC_FILE).mtimeMs;
                }
            } catch (e) {}
            return Date.now();
        })();
        // 🚀 [v3.6] 정적 파일에서 즉시 캐시 주입 (밀리초) — MongoDB 쿼리 없이 서버 시작
        (function preloadCastleFromFile() {
            if (fs.existsSync(CASTLE_STATIC_FILE)) {
                try {
                    const raw = fs.readFileSync(CASTLE_STATIC_FILE, 'utf8');
                    _castleCache = JSON.parse(raw);
                    _castleCacheTime = Date.now();
                    console.log(`⚡ [캐시 사전주입] castle 정적 파일 로드: ${_castleCache.length}개 (${(raw.length/1024/1024).toFixed(1)}MB)`);
                } catch (e) {
                    console.warn('⚠️ castle 정적 파일 파싱 실패 (MongoDB fallback 사용):', e.message);
                }
            } else {
                console.log('ℹ️ public/castles.json 없음 → 첫 요청 시 MongoDB 쿼리 (약 270초)');
                console.log('   빠른 시작을 위해: node scripts/export_castles_to_json.js');
            }
        })();
        function invalidateCastleCache() {
            _castleCache = null;
            _castleCacheTime = 0;
        }
        // ✏️ [v3.8] castles.json 즉시 패치 — 단일 항목 추가/수정/삭제를 파일에 바로 반영
        // 전체 재빌드(270초) 없이 해당 항목만 수술적으로 수정 → DB와 파일 동기화 유지
        function patchCastleInStaticFile(op, doc) {
            // op: 'upsert' | 'delete'
            // doc: { _id (string), ...fields }  — upsert 시 전체 문서, delete 시 _id만 필요
            try {
                if (!fs.existsSync(CASTLE_STATIC_FILE)) return; // 파일 없으면 skip
                const raw = fs.readFileSync(CASTLE_STATIC_FILE, 'utf8');
                let arr = JSON.parse(raw);
                const idStr = doc._id?.toString ?
doc._id.toString() : String(doc._id);
// ⚡ aggregation $switch의 position은 attendancePoints 누락 가능성 있으므로
                // JS 단계에서 실제 score 기준으로 일반 직급을 재설정 (재상급은 아래에서 덮어씀)
                rankings.forEach((user) => {
                    if (!user.designated_rank && !user.designated_position) {
                        user.position = getPosition(user.score);
                    }
                });
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // 재상급 직급 결정 규칙
                //  · designated_rank(admin 수동 지정)는 점수 무관 우선 적용
                //  · 그 외: 종2품 최소 점수(3100) 이상인 사람 중 점수 상위 4명
                //    → 각각 rank 1~4 타이틀 부여 (감수국사~동수국사)
                //  · 재상급 조건 미충족 → 정3품 수찬관으로 자동 강등
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // 1단계: designated_position / designated_rank 적용
                // 구버전 형식(품계 없음) → 품계 포함 형식으로 정규화하는 서버 헬퍼
                const normalizePositionServer = (pos) => {
                    if (!pos) return pos;
                    if (/^(정|종)[0-9]품/.test(pos)) return pos; // 이미 품계 포함
                    // 이름만 있는 경우 tiers에서 찾아 grade 붙이기
                    for (const t of RANK_CONFIG.tiers) {
                        if (pos === t.name || pos === t.fullName) return `${t.grade} ${t.fullName}`;
                    }
                    for (const mt of RANK_CONFIG.ministerTiers) {
                        if (pos === mt.name || pos === mt.fullName) return `${mt.grade} ${mt.fullName}`;
                    }
                    return pos;
                };
                const designatedSlots = new Set();
                rankings.forEach((user) => {
                    if (user.designated_position) {
                        user.position = normalizePositionServer(user.designated_position);
                        user.isDesignatedPosition = true;
                    }
                    if (user.designated_rank) {
                        const mt = RANK_CONFIG.ministerTiers.find(t => t.rank === user.designated_rank);
                        if (mt) {
                            user.position = `${mt.grade} ${mt.fullName}`;
                            user.isMinister = true;
                            user.isDesignated = true;
                            designatedSlots.add(user.designated_rank);
                        }
                    }
                });
// 🔄 [자동화] 최종승인 castle 생성 → castles.json 재빌드
                invalidateCastleCache(); // 메모리 캐시 무효화 (파일은 새벽 3시 배치로 갱신)
                // 기여자에게도 추가 보상 (승인 완료 시)
                if (contribution.userId) {
                    await collections.users.updateOne(
                        { _id: contribution.userId },
                        { $inc: { approvedCount: 1 } }
                    );
                }
                }
            } catch (castleError) {
                console.error('❌ [Castle 생성 실패]', castleError);
                // Castle 생성 실패해도 승인은 완료된 상태 유지
            }
        } else {
            console.log(`ℹ️ [Castle 변환 스킵] 사관 기록이거나 좌표 없음: category=${contribution.category}, lat=${contribution.lat}, lng=${contribution.lng}`);
        }
        // 🚩 [추가] 동일 이름의 다른 pending/reviewed 중복 기여 자동 거부
        if (contribution.name) {
            const dupResult = await collections.contributions.updateMany(
                {
                    _id: { $ne: toObjectId(id) },
                    name: contribution.name,
                    status: { $in: ['pending', 'reviewed'] }
                },
                {
                    $set: {
                        status: 'rejected',
                        rejectComment: `"${contribution.name}" 이름의 다른 기여가 이미 승인되어 자동 거부됨`,
                        rejectedAt: new Date()
                    }
                }
            );
            if (dupResult.modifiedCount > 0) {
                console.log(`🗑️ [중복 자동 거부] "${contribution.name}" 동명 중복 기여 ${dupResult.modifiedCount}건 rejected 처리`);
            }
        }
        // 🚩 [추가] 최종 승인 액티비티 로그
        await logActivity('approve', user.username, user.position || '', contribution.name || '사관 기록', {
            category: contribution.category || null, isNew: true,
            castle_id: insertedCastle ?
insertedCastle._id.toString() : undefined
        }, userId);
        res.json({ message: "기여가 최종 승인되었습니다.
성 마커로 변환되었습니다.", castle: insertedCastle });
    } catch (error) {
        res.status(500).json({ message: "승인 실패", error: error.message });
    }
});
// 🚩 [추가] 최종 반려 API (동수국사 이상 또는 admin/superuser)
app.put('/api/contributions/:id/reject-final', verifyToken, async (req, res) => {
    try {
        await setupRoutesAndCollections();
        const { id } = req.params;
        const { comment } = req.body;
        const userId = req.user.userId;
// 🚀 Streaming cursor — toArray() 대신 cursor로 순회해 메모리 절감
                const result = [];
                const cursor = collections.territories.find(query);
                for await (const t of cursor) {
                    // geometry 좌표 단순화 + 정밀도 축소
                    const geomCoords = t.geometry?.coordinates || t.coordinates;
                    const geomType  = t.geometry?.type || t.type;
                    const simplified = geomCoords
                        ?
truncCoords(simplifyCoords(geomCoords, SIMPLIFY_TOL))
                        : geomCoords;
                    // ObjectId → hex string
                    const country = (t.country && typeof t.country === 'object' && t.country._id === undefined)
                        ?
String(t.country) : t.country;
                    const props = t.properties ?
{ ...t.properties } : t.properties;
                    if (props?.country_id && typeof props.country_id === 'object') {
                        props.country_id = String(props.country_id);
                    }
                    result.push({
                        _id: t._id,
                        name: t.name,
                        name_ko: t.name_ko,
                        name_en: t.name_en,
                        name_type: t.name_type,
                        type: geomType,
                        coordinates: simplified,
                        bbox: t.bbox,
                        level: t.level,
                        country,
                        properties: props,
                        osm_id: t.osm_id,
                        start: t.start || t.start_year,
                        end: t.end || t.end_year
                    });
                }
                const elapsed = Date.now() - startTime;
                const sizeMB = (JSON.stringify(result).length / 1024 / 1024).toFixed(2);
                console.log(`🗺️ Territories 조회 완료: ${result.length}개 (${elapsed}ms, ${sizeMB}MB)`);
                // 🚀 캐시 저장 (bounds 없는 전체 조회인 경우만)
                if (useCache) {
                    territoriesCache = result;
                    territoriesCacheTime = Date.now();
                    console.log(`💾 Territories 캐시 저장됨 (${result.length}개)`);
                }
                res.json(result);
            } catch (error) {
                console.error("Territories 조회 중 오류:", error);
                res.status(500).json({ message: "Territories 조회 실패", error: error.message });
            }
        });
        // POST: 새 영토 폴리곤 추가 (배치 import 지원) - 자동 검증 및 필드 추가
        app.post('/api/territories', verifyAdmin, async (req, res) => {
            try {
                const newTerritories = Array.isArray(req.body) ?
req.body : [req.body];
                console.log(`📍 Territory 추가 요청: ${newTerritories.length}개`);
                // 각 영토 데이터 검증 및 보완
                const processedTerritories = newTerritories.map((territory, index) => {
                    // _id 필드 제거
                    if (territory._id) delete territory._id;
                    // 1.
const elapsed = Date.now() - startTime;
                const sizeMB = (JSON.stringify(result).length / 1024 / 1024).toFixed(2);
                console.log(`🗺️ Territories 조회 완료: ${result.length}개 (${elapsed}ms, ${sizeMB}MB)`);
                // 🚀 캐시 저장 (bounds 없는 전체 조회인 경우만)
                if (useCache) {
                    territoriesCache = result;
                    territoriesCacheTime = Date.now();
                    console.log(`💾 Territories 캐시 저장됨 (${result.length}개)`);
                }
                res.json(result);
            } catch (error) {
                console.error("Territories 조회 중 오류:", error);
                res.status(500).json({ message: "Territories 조회 실패", error: error.message });
            }
        });
        // POST: 새 영토 폴리곤 추가 (배치 import 지원) - 자동 검증 및 필드 추가
        app.post('/api/territories', verifyAdmin, async (req, res) => {
            try {
                const newTerritories = Array.isArray(req.body) ?
req.body : [req.body];
                console.log(`📍 Territory 추가 요청: ${newTerritories.length}개`);
                // 각 영토 데이터 검증 및 보완
                const processedTerritories = newTerritories.map((territory, index) => {
                    // _id 필드 제거
                    if (territory._id) delete territory._id;
                    // 1.
필수 필드 검증
                    if (!territory.name) {
                        throw new Error(`Territory ${index}: name 필드가 필요합니다`);
                    }
                    if (!territory.geometry || !territory.geometry.coordinates) {
                        throw new Error(`Territory ${index} (${territory.name}): geometry.coordinates가 필요합니다`);
                    }
                    // 2.
bbox 자동 계산 (없으면)
                    if (!territory.bbox) {
                        console.log(`  🔧 ${territory.name}: bbox 자동 계산 중...`);
                        territory.bbox = calculateBBoxFromGeometry(territory.geometry);
                    }
                    // 2-1.
GeoJSON 링 자동 닫기 (첫 좌표 ≠ 마지막 좌표인 경우 보정)
                    const closeRings = (coords, depth) => {
                        if (depth === 0) {
                            // 개별 링: Array of [lng, lat]
                            if (coords.length >= 3) {
                                const first = coords[0];
                                const last  = coords[coords.length - 1];
                                if (first[0] !== last[0] || first[1] !== last[1]) {
                                    coords.push([.first]);
                                }
                            }
                        } else {
                            coords.forEach(c => closeRings(c, depth - 1));
                        }
                    };
                    const gtype = territory.geometry.type;
                    if (gtype === 'Polygon') {
                        closeRings(territory.geometry.coordinates, 1);
                    } else if (gtype === 'MultiPolygon') {
                        closeRings(territory.geometry.coordinates, 2);
                    }
                    // 3.
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
        // ⚡ 캐시: 3분간 유지 (매 요청마다 heavy aggregation 재실행 방지)
        let _rankingsCache = null;
        let _rankingsCacheTime = 0;
        const RANKINGS_CACHE_TTL = 3 * 60 * 1000; // 3분
        function invalidateRankingsCache() { _rankingsCache = null; }
        app.get('/api/rankings', async (req, res) => {
            try {
                // 캐시 히트
                if (_rankingsCache && Date.now() - _rankingsCacheTime < RANKINGS_CACHE_TTL) {
                    return res.json(_rankingsCache);
                }
                console.log('🏆 [랭킹 조회] 시작');
                // 랭킹에서 숨길 계정 (관리용 계정 등 비회원)
                const RANKING_HIDDEN_USERS = ['송나라 사신 서긍'];
                // 🚩 [수정] users 컬렉션 기반으로 랭킹 계산 (승인만 한 사용자도 포함)
                const rankings = await collections.users.aggregate([
                    {
                        $match: { username: { $nin: RANKING_HIDDEN_USERS } }
                    },
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
// 승인 시 검토자와 승인자에게 보너스 점수 부여
                if (status === 'approved') {
                    // 검토자에게 reviewBonus 부여
                    if (contribution.reviewerId) {
                        await collections.users.updateOne(
                            { _id: contribution.reviewerId },
                            { $inc: { reviewScore: RANK_CONFIG.limits.reviewBonus } }
                        );
                    }
                    // 승인한 관리자에게 approvalBonus 부여
                    await collections.users.updateOne(
                        { _id: toObjectId(adminUserId) },
                        { $inc: { approvalScore: RANK_CONFIG.limits.approvalBonus } }
                    );
                    // 🚩 [핵심] 승인 시 castle 컬렉션에 자동 삽입 (지도 기반 기여만)
                    if (contribution.lat && contribution.lng && contribution.category !== 'historical_record') {
                        try {
                            const isNatural = !!contribution.is_natural_feature;
                            // 시간 기반 자연지물(고분/묘 등)은 실제 연도 사용, 그 외 지형은 -5000 (항상 표시)
                            const naturalTimeTypes = ['tomb', 'construction', 'hunting', 'buffalo', 'horse', 'camel', 'mongky'];
                            const natType = contribution.natural_feature_type || 'other';
                            const isTimeBased = isNatural && naturalTimeTypes.includes(natType);
                            const startYear = isNatural
                                ?
(isTimeBased ?
(contribution.start_year != null ?
contribution.start_year : -5000) : -5000)
                                : (contribution.start_year != null ?
contribution.start_year : -5000);
                            const endYear = isNatural
                                ?
(isTimeBased ?
(contribution.end_year != null ?
contribution.end_year : null) : null)
                                : (contribution.end_year != null ?
contribution.end_year : null);
                            const countryId = contribution.country_id || null;
                            // history 배열 구성 (자연지물은 빈 배열)
                            const history = [];
                            if (!isNatural && countryId) {
                                history.push({
                                    name: (contribution.name || '').trim(),
                                    country_id: countryId,
                                    start_year: startYear,
                                    start_month: 1,
                                    end_year: endYear,
                                    end_month: endYear ?
12 : null,
                                    is_capital: false,
                                    is_battle: false
                                });
                            }
                // 🚩 [중복 방지] 이미 같은 contribution에서 생성된 castle이 있으면 스킵
                const existingCastle = await collections.castle.findOne({
                    originContributionId: contribution._id.toString(),
                    $or: [{ deleted: { $exists: false } }, { deleted: false }]
                });
                if (existingCastle) {
                    console.log(`⚠️ [승인→Castle 스킵] '${contribution.name}' 이미 castle 존재 (ID: ${existingCastle._id})`);
                    const message = '검토가 완료되었습니다.';
                    await logActivity('approve', req.user.username, req.user.position || '', contribution.name || '사관 기록', {
                        category: contribution.category || null, isNew: false, castle_id: existingCastle._id.toString()
                    }, req.user.userId);
                    return res.json({ message, castle: existingCastle });
                }
const contributions = await collections.contributions.find(query)
                    .sort({ createdAt: -1 })
                    .toArray();
                if (contributions.length === 0) return res.json([]);
                // ⚡ 배치 처리: userId 집합을 한 번에 조회 (N+1 → 1쿼리)
                const allUserIds = [...new Set(contributions.flatMap(c => {
                    const ids = [];
                    if (c.userId)     ids.push(String(c.userId));
                    if (c.reviewerId) ids.push(String(c.reviewerId));
                    if (c.reviewedBy) ids.push(String(c.reviewedBy));
                    if (c.approverId) ids.push(String(c.approverId));
                    if (c.votedBy)    c.votedBy.forEach(id => ids.push(String(id)));
                    return ids;
                }))];
                const userDocs = await collections.users.find(
                    { _id: { $in: allUserIds.map(id => { try { return toObjectId(id); } catch { return id; } }) } },
                    { projection: { username: 1 } }
                ).toArray();
                const userMap = Object.fromEntries(userDocs.map(u => [String(u._id), u.username]));
                const result = contributions.map(contrib => {
                    const r = { ...contrib };
                    // username 보정
                    if (!r.username && r.userId) r.username = userMap[String(r.userId)] || null;
                    // votedBy → 이름 배열
                    if (r.votedBy && r.votedBy.length > 0) {
                        r.votedBy = r.votedBy.map(id => userMap[String(id)] || String(id));
                    }
                    // 검토자
                    if (contrib.reviewerId && contrib.reviewedAt) {
                        r.reviewerUsername = userMap[String(contrib.reviewerId)] || null;
                        r.reviewComment    = contrib.reviewComment || null;
                    }
                    // 승인자 (reviewedBy 필드)
                    if (contrib.reviewedBy) {
                        r.approverUsername = userMap[String(contrib.reviewedBy)] || null;
                    }
                    // 댓글 수
                    r.commentCount = (contrib.comments || []).length;
                    return r;
                });
                res.json(result);
            } catch (error) {
                res.status(500).json({ message: "기여 목록 조회 실패", error: error.message });
            }
        });
        // POST: 기여 제출 (역사 복원 핀 꼽기)
        app.post('/api/contributions', verifyToken, async (req, res) => {
            try {
                // 🚩 [추가] 게스트(서긍)는 사관 기록 제출 불가
                if (req.user.isGuest) {
                    return res.status(403).json({ message: '송나라 사신 서긍은 사관 기록을 제출할 수 없습니다.' });
                }
                const { name, lat, lng, description, category, evidence, year, source, content,
                        placeType, is_natural_feature, natural_feature_type, country_id, start_year, end_year, is_capital, new_country_name,
                        _forceUsername, _forceUserId } = req.body;
                // 🚩 [추가] 관리자가 대신 기여자 이름/ID를 지정할 수 있음
                const isAdmin = req.user.position === 'admin';
                let effectiveUsername = req.user.username;
                let effectiveUserId = req.user.userId;
let vercelStatus = { state: 'unknown' };
            try {
                const sha = gitInfo.sha ?
await ghFetch(`https://api.github.com/repos/projeffmanager-design/historymap/commits/HEAD`) : null;
                const fullSha = sha?.sha;
                if (fullSha) {
                    const checks = await ghFetch(`https://api.github.com/repos/projeffmanager-design/historymap/commits/${fullSha}/check-runs`);
                    const vercelRun = (checks.check_runs || []).find(r => r.app?.slug === 'vercel' || r.name?.toLowerCase().includes('vercel'));
                    if (vercelRun) {
                        vercelStatus = {
                            state: vercelRun.conclusion || vercelRun.status,
                            name: vercelRun.name,
                            url: vercelRun.html_url,
                            completedAt: vercelRun.completed_at,
                            startedAt: vercelRun.started_at
                        };
                    } else {
                        // check-runs 없으면 commit statuses 조회
                        const statuses = await ghFetch(`https://api.github.com/repos/projeffmanager-design/historymap/statuses/${fullSha}`);
                        const vercelSt = (statuses || []).find(s => s.context?.toLowerCase().includes('vercel'));
                        if (vercelSt) {
                            vercelStatus = { state: vercelSt.state, description: vercelSt.description, url: vercelSt.target_url, updatedAt: vercelSt.updated_at };
                        }
                    }
                }
            } catch(e) { vercelStatus = { state: 'error', error: e.message }; }
            res.json({
                localBuild: { inProgress: _tileRebuildInProgress, dirty: _territoryDirty, dirtyCount: _dirtyTerritoryIds.size },
                git: gitInfo,
                vercel: vercelStatus,
                timestamp: new Date().toISOString()
            });
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
기본 타입 설정
                    if (!territory.type) {
                        territory.type = 'admin_area';
                    }
                    if (!territory.admin_level) {
                        territory.admin_level = 2;
                    }
                    console.log(`  ✓ ${territory.name}: 검증 완료 (bbox: ${territory.bbox ?
'O' : 'X'}, time: ${territory.start_year}~${territory.end_year})`);
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
                // 🚀 캐시 무효화 + 즉시 증분 타일 재빌드 (백그라운드)
                territoriesCache = null;
                territoriesCacheTime = null;
                const newIds = new Set(Object.values(result.insertedIds).map(id => id.toString()));
                for (const id of newIds) _dirtyTerritoryIds.add(id);
                _territoryDirty = true;
                console.log('🗑️ Territories 캐시 무효화됨 (POST)');
                rebuildTerritoryTilesIncremental('영토 추가', newIds).catch(e =>
                    console.error('❌ [즉시 타일 재빌드 실패]', e.message));
            } catch (error) {
                console.error("Territory 추가 중 오류:", error);
                res.status(500).json({ message: "Territory 추가 실패", error: error.message });
            }
        });
        // POST: 영역 교차 검색 (bbox 기반) - territory_manager에서 사용
        app.post('/api/territories/intersect', verifyAdmin, async (req, res) => {
            try {
                const { bbox } = req.body;
                if (!bbox || bbox.minLat === undefined || bbox.maxLat === undefined || bbox.minLng === undefined || bbox.maxLng === undefined) {
                    return res.status(400).json({ message: "bbox (minLat, maxLat, minLng, maxLng) 필드가 필요합니다." });
                }
                console.log(`🔎 영역 교차 검색: lat ${bbox.minLat}~${bbox.maxLat}, lng ${bbox.minLng}~${bbox.maxLng}`);
                // bbox가 겹치는 영토 검색 (두 사각형이 겹치는 조건)
                const query = {
                    'bbox.minLat': { $lte: bbox.maxLat },
                    'bbox.maxLat': { $gte: bbox.minLat },
                    'bbox.minLng': { $lte: bbox.maxLng },
                    'bbox.maxLng': { $gte: bbox.minLng }
                };
name: '감수국사', fullName: '감수국사(監修國史)', grade: '정1품', minScore: 5000 },
        { rank: 2, name: '판사관사', fullName: '판사관사(判史館事)', grade: '종1품', minScore: 4300 },
        { rank: 3, name: '수국사',   fullName: '수국사(修國史)',     grade: '정2품', minScore: 3700 },
        { rank: 4, name: '동수국사', fullName: '동수국사(同修國史)', grade: '종2품', minScore: 3100 },
    ],
    // 자동진급 직급 (점수 기반 — 내림차순 정렬 필수)
    tiers: [
        { minScore: 2600, name: '수찬관',   fullName: '수찬관(修撰官)',              grade: '정3품' },
        { minScore: 2100, name: '직수찬관', fullName: '직수찬관(直修撰官)',          grade: '종3품' },
        { minScore: 1700, name: '사관수찬', fullName: '사관수찬(史館修撰)',          grade: '정4품' },
        { minScore: 1400, name: '시강학사', fullName: '시강학사(侍講學士)',          grade: '종4품' },
        { minScore: 1100, name: '기거주',   fullName: '기거주(起居注) / 낭중(郞中)', grade: '정5품' },
        { minScore: 850,  name: '기거사',   fullName: '기거사(起居舍) / 원외랑(員外郞)', grade: '종5품' },
        { minScore: 650,  name: '기거랑',   fullName: '기거랑(起居郞) / 직사관(直史館)', grade: '정6품' },
        { minScore: 450,  name: '기거도위', fullName: '기거도위(起居都尉)',          grade: '종6품' },
        { minScore: 300,  name: '수찬',     fullName: '수찬(修撰)',                  grade: '정7품' },
        { minScore: 200,  name: '직문한',   fullName: '직문한(直文翰)',              grade: '종7품' },
        { minScore: 120,  name: '주서',     fullName: '주서(注書)',                  grade: '정8품' },
        { minScore: 60,   name: '검열',
json 즉시 패치 실패 (무시, 배치로 보완):', e.message);
            }
        }
        // 📦 [배치/수동] castles.json 재빌드 — 매일 새벽 3시 자동 실행 + admin API로 수동 트리거 가능
        // 데이터 변경 직후 호출 안 함 (Atlas M0에서 270초 소요 → 배치로 일괄 처리)
        let _castleRebuildInProgress = false;
        async function rebuildCastleStaticFile(reason) {
            if (_castleRebuildInProgress) {
                console.log(`⏳ [재빌드 스킵] 이미 진행 중 (사유: ${reason})`);
                return;
            }
            _castleRebuildInProgress = true;
            console.log(`🔄 [재빌드 시작] castles.json 갱신 중.
(사유: ${reason})`);
            const startTime = Date.now();
            try {
                const query = { $or: [{ deleted: { $exists: false } }, { deleted: false }] };
                const cursor = collections.castle.find(query);
                const castles = [];
                for await (const doc of cursor) {
                    castles.push({ ...doc, _id: doc._id?.toString ?
doc._id.toString() : doc._id });
                }
                const json = JSON.stringify(castles);
                fs.writeFileSync(CASTLE_STATIC_FILE, json);
                // update metadata for incremental rebuilds
                try {
                    const metaPath = path.join(__dirname, 'public', 'castles.meta.json');
                    fs.writeFileSync(metaPath, JSON.stringify({ lastRebuild: new Date().toISOString() }));
                } catch (e) {
                    console.warn('⚠️ castles.meta.json 쓰기 실패:', e.message);
                }
                // 메모리 캐시도 동시 갱신
                _castleCache = castles;
                _castleCacheTime = Date.now();
                _castleLastModified = Date.now();
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`✅ [재빌드 완료] castles.json 갱신: ${castles.length}개, ${(json.length/1024/1024).toFixed(1)}MB (${elapsed}초)`);
            } catch (e) {
                console.error('❌ [재빌드 실패] castles.json 갱신 오류:', e.message);
                // 실패 시 메모리 캐시만 무효화 → 다음 GET 요청이 재쿼리
                invalidateCastleCache();
            } finally {
                _castleRebuildInProgress = false;
            }
        }
// 🚩 [추가] 기여 제출 액티비티 로그
                await logActivity('submit', effectiveUsername, req.user.position || '', newContribution.name || '사관 기록', { category }, req.user.userId);
                res.status(201).json({
                    message: category === 'historical_record' ?
"사관 기록이 접수되었습니다.
검토 후 반영됩니다." : "역사 복원 제안이 접수되었습니다.
검토 후 지도에 반영됩니다.",
                    contribution: createdContribution
                });
            } catch (error) {
                res.status(500).json({ message: "제안 접수 실패", error: error.message });
            }
        });
        // PUT: 기여 추천 (투표)
        app.put('/api/contributions/:id/vote', verifyToken, async (req, res) => {
            try {
                // 🚩 [추가] 게스트(서긍)는 추천 불가
                if (req.user.isGuest) {
                    return res.status(403).json({ message: '송나라 사신 서긍은 추천할 수 없습니다.' });
                }
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
                const lastVoteDate = user?.lastVoteDate ?
new Date(user.lastVoteDate) : null;
                let dailyVoteCount = user?.dailyVoteCount || 0;
                // 날짜가 바뀌었으면 카운트 리셋
                if (!lastVoteDate || lastVoteDate < today) {
                    dailyVoteCount = 0;
                }
                if (dailyVoteCount >= RANK_CONFIG.limits.dailyVotes) {
                    return res.status(400).json({ message: `일일 추천 제한(${RANK_CONFIG.limits.dailyVotes}회)을 초과했습니다.
내일 다시 시도해주세요.` });
                }
totalCount", 0] },
                            approvedCount: { $ifNull: ["$contributionStats.approvedCount", 0] },
                            totalVotes: { $ifNull: ["$contributionStats.totalVotes", 0] },
                            reviewedCount: { $ifNull: ["$reviewStats.reviewedCount", 0] },
                            approvedByCount: { $ifNull: ["$approvalStats.approvedByCount", 0] },
                            reviewScore: { $ifNull: ["$reviewScore", 0] },
                            approvalScore: { $ifNull: ["$approvalScore", 0] },
                            attendancePoints: { $ifNull: ["$attendancePoints", 0] },
                            position: { $switch: buildPositionSwitch() },
                            score: {
                                $add: [
                                    { $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, RANK_CONFIG.scoreWeights.submitCount] },
                                    { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, RANK_CONFIG.scoreWeights.approvedCount] },
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
                // ⚡ aggregation $switch의 position은 attendancePoints 누락 가능성 있으므로
                // JS 단계에서 실제 score 기준으로 일반 직급을 재설정 (재상급은 아래에서 덮어씀)
                rankings.forEach((user) => {
                    if (!user.designated_rank && !user.designated_position) {
                        user.position = getPosition(user.score);
                    }
                });
// 🚩 [수정] 지리 공간 인덱스 - 첫 실행시에만 필요, 이후에는 불필요
    // 인덱스는 MongoDB에 영구 저장되므로 매 서버 시작마다 체크할 필요 없음
    // 필요시 수동으로 scripts/check_and_fix_indexes.js 실행
    console.log('ℹ️ 인덱스는 이미 설정됨 (수동 관리: scripts/check_and_fix_indexes.js)');
    // ── 채팅 메시지 POST (로그인 필요) ───────────────────────────────
    app.post('/api/chat', verifyToken, async (req, res) => {
        try {
            // 게스트는 채팅 금지
            if (req.user && req.user.isGuest) {
                return res.status(403).json({ message: '게스트는 채팅을 보낼 수 없습니다.' });
            }
            const { message } = req.body;
            if (!message || !message.trim()) return res.status(400).json({ message: '메시지를 입력하세요.' });
            const text = message.trim().slice(0, 200);
            const user = await collections.users.findOne({ _id: toObjectId(req.user.userId) });
            const position = user?.position || req.user.position || '';
            await collections.activityLogs.insertOne({
                type: 'chat',
                actor: req.user.username,
                actorPosition: position,
                targetName: null,
                extra: { text },
                createdAt: new Date()
            });
            // 채팅만 최대 50개 FIFO 보존
            const chatCount = await collections.activityLogs.countDocuments({ type: 'chat' });
            if (chatCount > 50) {
                const overChat = await collections.activityLogs
                    .find({ type: 'chat' })
                    .sort({ createdAt: 1 })
                    .limit(chatCount - 50)
                    .toArray();
                if (overChat.length > 0) {
                    await collections.activityLogs.deleteMany({ _id: { $in: overChat.map(d => d._id) } });
                }
            }
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ message: '채팅 전송 실패', error: error.message });
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
res.json({
                    summary: {
                        totalUsers,
                        newUsers7d,
                        totalContribs,
                        approvedContribs: (statusStats.find(s => s._id === 'approved') || {}).count || 0,
                        pendingContribs: (statusStats.find(s => s._id === 'pending') || {}).count || 0,
                        reviewedContribs: (statusStats.find(s => s._id === 'reviewed') || {}).count || 0,
                        rejectedContribs: (statusStats.find(s => s._id === 'rejected') || {}).count || 0,
                        totalVotes: (voteStats[0] || {}).totalVotes || 0,
                        avgVotes: Math.round(((voteStats[0] || {}).avgVotes || 0) * 10) / 10,
                    },
                    topContributors,
                    categoryStats,
                    monthlyTrend,
                    recentActivity,
                    rankDistribution,
                    dbStats: {
                        castle:       dbCastle,
                        contributions: dbContribs,
                        users:        dbUsers,
                        countries:    dbCountries,
                        activityLogs: dbActivityLogs,
                        loginLogs:    dbLoginLogs,
                        total:        dbCastle + dbContribs + dbUsers + dbCountries + dbActivityLogs + dbLoginLogs,
                    },
                });
            } catch (error) {
                console.error('대시보드 통계 오류:', error);
                res.status(500).json({ message: '통계 조회 실패', error: error.message });
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
const sq = t => t * t;
                    function sqSegDist(p, p1, p2) {
                        let x = p1[0], y = p1[1], dx = p2[0] - x, dy = p2[1] - y;
                        if (dx !== 0 || dy !== 0) {
                            const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (sq(dx) + sq(dy));
                            if (t > 1) { x = p2[0]; y = p2[1]; }
                            else if (t > 0) { x += dx * t; y += dy * t; }
                        }
                        return sq(p[0] - x) + sq(p[1] - y);
                    }
                    const sqTol = sq(tolerance);
                    let maxSqDist = 0, idx = 0;
                    for (let i = 1; i < points.length - 1; i++) {
                        const d = sqSegDist(points[i], points[0], points[points.length - 1]);
                        if (d > maxSqDist) { maxSqDist = d; idx = i; }
                    }
                    if (maxSqDist > sqTol) {
                        const l = dpSimplify(points.slice(0, idx + 1), tolerance);
                        const r = dpSimplify(points.slice(idx), tolerance);
                        return l.slice(0, -1).concat(r);
                    }
                    return [points[0], points[points.length - 1]];
                }
                function simplifyCoords(coords, tol) {
                    if (!Array.isArray(coords)) return coords;
                    if (typeof coords[0] === 'number') return coords; // single point
                    if (typeof coords[0][0] === 'number') return dpSimplify(coords, tol); // ring
                    return coords.map(c => simplifyCoords(c, tol)); // Polygon/MultiPolygon
                }
                function truncCoords(coords) {
                    if (!Array.isArray(coords)) return coords;
                    if (typeof coords[0] === 'number') {
                        return [Math.round(coords[0] * 10000) / 10000,
                                Math.round(coords[1] * 10000) / 10000];
                    }
                    return coords.map(truncCoords);
                }
                const SIMPLIFY_TOL = 0.001; // ~100m — 지도 표시에 충분
                // ──────────────────────────────────────────────────────────────
                // lightweight 모드: geometry 제외, 메타데이터만
                if (lightweight === 'true') {
                    const territories = await collections.territories.find(query).project({
                        _id: 1, name: 1, name_ko: 1, name_en: 1, name_type: 1,
                        bbox: 1, start: 1, start_year: 1, end: 1, end_year: 1, level: 1, type: 1
                    }).toArray();
                    const elapsed = Date.now() - startTime;
                    console.log(`🗺️ Territories(lightweight) 완료: ${territories.length}개 (${elapsed}ms)`);
                    return res.json(territories);
                }
console.log(`\n🚀 영토 캐시 재계산 시작: ${startYear}년 ~ ${endYear}년 (${monthly ?
'월별' : '연도별'})`);
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
            console.log(`\n📅 ${year}년 ${month ?
month + '월' : ''} 계산 중...`);
            // 해당 시기의 모든 성 데이터 가져오기
            const query = month
                ?
{
                    built_year: { $lte: year },
                    $or: [{ destroyed_year: null }, { destroyed_year: { $gte: year } }],
                    built_month: { $lte: month },
                    $or: [{ destroyed_month: null }, { destroyed_month: { $gte: month } }]
                  }
                : {
                    built_year: { $lte: year },
                    $or: [{ destroyed_year: null }, { destroyed_year: { $gte: year } }]
                  };
            const castles = await collectionsRef.castle.find(query).toArray();
            const territories = await collectionsRef.territories.find({}).toArray();
            // 국가 정보 조회 (한 번만)
            const countries = await collectionsRef.countries.find({}).toArray();
            const countryMap = new Map(countries.map(c => [c._id.toString(), c]));
            // 🔍 디버깅
            console.log(`  🔍 성 개수: ${castles.length}, 영토 개수: ${territories.length}, 국가 개수: ${countries.length}`);
            if (castles.length > 0) {
                console.log(`  🔍 첫 번째 성 샘플:`, castles[0].name, `(${castles[0].built_year}~${castles[0].destroyed_year})`);
            }
            const bulkOps = [];
            let processedCount = 0;
            let savedCount = 0;
error("Territory Tiles error:", error);
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
                        res.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');
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
                console.log(`🗺️ Territories 쿼리 시작.
(bounds: ${minLat ?
'O' : 'X'}, lightweight: ${lightweight || 'X'})`);
                const startTime = Date.now();
                // ─── 서버 측 Douglas-Peucker 좌표 단순화 ───────────────────
                // tolerance=0.001 ≈ ~100m 정밀도 (지도 뷰에 충분)
                function dpSimplify(points, tolerance) {
                    if (points.length <= 2) return points;
                    const sq = t => t * t;
                    function sqSegDist(p,
country_id = convertedId;
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
                // 🚩 [수정] 군대(military) 마커 신규 생성 시에도 연도 필드 양방향 동기화
                if (newCastle.is_military_flag) {
                    if (newCastle.destroyed_year !== undefined) newCastle.end_year = newCastle.destroyed_year;
                    if (newCastle.end_year !== undefined && newCastle.destroyed_year === undefined) newCastle.destroyed_year = newCastle.end_year;
                    if (newCastle.built_year !== undefined) newCastle.start_year = newCastle.built_year;
                    if (newCastle.start_year !== undefined && newCastle.built_year === undefined) newCastle.built_year = newCastle.start_year;
                    console.log(`🎯 [군대 마커 신규 연도] built=${newCastle.built_year}, destroyed=${newCastle.destroyed_year}`);
                }
                // 🚩 [중복 방지] 같은 이름 + 유사 좌표(±0.001도 이내)의 castle이 이미 존재하면 추가 차단
                if (newCastle.name && newCastle.lat != null && newCastle.lng != null) {
                    const COORD_TOLERANCE = 0.001;
                    const duplicateCastle = await collections.castle.findOne({
                        name: newCastle.name,
                        lat: { $gte: newCastle.lat - COORD_TOLERANCE, $lte: newCastle.lat + COORD_TOLERANCE },
                        lng: { $gte: newCastle.lng - COORD_TOLERANCE, $lte: newCastle.lng + COORD_TOLERANCE },
                        $or: [{ deleted: { $exists: false } }, { deleted: false }]
                    });
                    if (duplicateCastle) {
                        console.warn(`⚠️ [중복 Castle 차단] '${newCastle.name}' 동일 이름+좌표 castle 이미 존재 (ID: ${duplicateCastle._id}).
기존 castle을 편집해주세요.`);
                        return res.status(409).json({
                            message: `'${newCastle.name}' 이름의 castle이 같은 위치에 이미 존재합니다.
기존 항목을 편집해주세요.`,
                            existingId: duplicateCastle._id.toString()
                        });
                    }
                }
                // timestamp for incremental/changed-only detection
                newCastle.updatedAt = new Date();
                const result = await collections.castle.insertOne(newCastle);
                // 🚩 [수정] 삽입된 전체 문서를 다시 조회해서 반환
                const insertedDocument = await collections.castle.findOne({ _id: result.insertedId });
                // ✏️ [v3.8] castles.json 즉시 패치
                patchCastleInStaticFile('upsert', insertedDocument);
// 🚩 [수정] DB에 저장된 직급 또는 실시간 계산된 직급 중 하나라도 승인 권한이 있으면 허용
        const hasApproverPosition = approverPositions.includes(user.position) || approverPositions.includes(realtimePosition);
        if (!user || !hasApproverPosition) {
            return res.status(403).json({
                message: `승인 권한이 없습니다.
(동수국사(종2품) 이상만 가능, DB직급: ${user.position}, 실시간직급: ${realtimePosition})`
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
        // 🚩 [추가] 승인자 점수 부여
        await collections.users.updateOne(
            { _id: toObjectId(userId) },
            { $inc: { approvalScore: RANK_CONFIG.limits.finalApprovalBonus } }
        );
        // 🚩 [추가] 검토자가 있으면 검토자에게도 추가 점수
        if (contribution.reviewerId) {
            await collections.users.updateOne(
                { _id: contribution.reviewerId },
                { $inc: { reviewScore: RANK_CONFIG.limits.reviewBonus } }  // 최종 승인 시 검토자 추가 보상
            );
        }
        // 🚩 [핵심] 승인된 기여를 Castle로 자동 변환
        let insertedCastle = null;
        if (contribution.category !== 'historical_record' && contribution.lat && contribution.lng) {
            try {
                const isNatural = !!contribution.is_natural_feature;
                const isCapital = !isNatural && !!contribution.is_capital;
                // 시간 기반 자연지물(고분/묘 등)은 실제 연도 사용, 그 외 지형은 -5000 (항상 표시)
                const naturalTimeTypes = ['tomb', 'construction', 'hunting', 'buffalo', 'horse', 'camel', 'mongky'];
                const natType = contribution.natural_feature_type || 'other';
                const isTimeBased = isNatural && naturalTimeTypes.includes(natType);
                const startYear = isNatural
                    ?
(isTimeBased ?
(contribution.start_year != null ?
contribution.start_year : -5000) : -5000)
                    : (contribution.start_year != null ?
contribution.start_year : (contribution.year || -5000));
                const endYear = isNatural
                    ?
(isTimeBased ?
(contribution.end_year != null ?
contribution.end_year : null) : null)
                    : (contribution.end_year != null ?
contribution.end_year : null);
                let countryId = contribution.country_id || contribution.countryId || null;
                // 🚩 [추가] 새 국가 자동 생성 (new_country_name이 있고 country_id가 없을 때)
                if (!isNatural && !countryId && contribution.new_country_name) {
                    const newCountryName = contribution.new_country_name.trim();
// RANK_CONFIG 헬퍼: MongoDB $switch branches 동적 생성 (랭킹 aggregation용)
const buildPositionSwitch = () => {
    const scoreExpr = {
        $add: [
            { $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, RANK_CONFIG.scoreWeights.submitCount] },
            { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, RANK_CONFIG.scoreWeights.approvedCount] },
            { $ifNull: ["$contributionStats.totalVotes", 0] },
            { $ifNull: ["$reviewScore", 0] },
            { $ifNull: ["$approvalScore", 0] },
            { $ifNull: ["$attendancePoints", 0] },  // ⚡ 출석 점수 포함
            { $multiply: [{ $ifNull: ["$commentScore", 0] }, RANK_CONFIG.scoreWeights.commentCount] } // 💬 의견 점수
        ]
    };
    const branches = RANK_CONFIG.tiers
        .filter(t => t.minScore > 0)
        .map(t => ({ case: { $gte: [scoreExpr, t.minScore] }, then: `${t.grade} ${t.fullName}` }));
    return { branches, default: `${RANK_CONFIG.tiers[RANK_CONFIG.tiers.length - 1].grade} ${RANK_CONFIG.tiers[RANK_CONFIG.tiers.length - 1].fullName}` };
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
// ============================================================
const RANK_CONFIG = {
    // 점수 계산 가중치
    scoreWeights: {
        submitCount:   3,   // 제출 1건당 획득 점수
        approvedCount: 10,  // 승인 1건당 획득 점수
        votes:         1,   // 추천 1회당 획득 점수 (계수)
        review:        1,   // reviewScore 그대로 반영
        approval:      1,   // approvalScore 그대로 반영
        attendance:    1,   // attendancePoints 그대로 반영
        commentCount:  1,   // 의견 1건당 획득 점수 (30자 이상, 일 5회 한도)
    },
    limits: {
        dailyVotes:         9999,  // 일일 추천 제한 없음
        dailyComments:         5,  // 일일 의견 점수 획득 한도
        commentMinLength:     30,  // 점수 획득 최소 글자 수
        reviewBonus:           5,  // 검토 1회당 획득 점수
        approvalBonus:         5,  // 관리자 패널 승인 시 획득 점수
        finalApprovalBonus:   10,  // /approve API 최종승인 시 승인자 획득 점수
    },
    // 재상급 직급 (순위 기반 — 상위 4명 + 최소 점수 충족 시)
    ministerTiers: [
        { rank: 1, name: '감수국사', fullName: '감수국사(監修國史)', grade: '정1품', minScore: 5000 },
        { rank: 2, name: '판사관사', fullName: '판사관사(判史館事)', grade: '종1품', minScore: 4300 },
        { rank: 3, name: '수국사',   fullName: '수국사(修國史)',     grade: '정2품', minScore: 3700 },
        { rank: 4, name: '동수국사', fullName: '동수국사(同修國史)', grade: '종2품', minScore: 3100 },
    ],
    // 자동진급 직급 (점수 기반 — 내림차순 정렬 필수)
    tiers: [
        { minScore: 2600, name: '수찬관',   fullName: '수찬관(修撰官)',              grade: '정3품' },
        { minScore: 2100, name: '직수찬관', fullName: '직수찬관(直修撰官)',          grade: '종3품' },
        { minScore: 1700, name: '사관수찬',
fullName: '검열(檢閱)',                  grade: '종8품' },
        { minScore: 30,   name: '정자',     fullName: '정자(正字)',                  grade: '정9품' },
        { minScore: 0,    name: '수분권지', fullName: '수분권지(修分權知)',          grade: '종9품' },
    ],
    // 권한 그룹 (name 기준으로 비교)
    roles: {
        reviewers:    ['시강학사', '사관수찬', '직수찬관', '수찬관'],          // 검토 가능 직급 (종4품~정3품)
        approvers:    ['동수국사', '수국사', '판사관사', '감수국사'],          // 최종 승인 가능 직급 (종2품~정1품)
        apiApprovers: ['수국사', '판사관사', '감수국사'],                      // API verifyApprover 미들웨어 (정2품~정1품)
        assignable:   ['수찬관', '사천감', '한림학사', '상서', '수국사', '동수국사', '감수국사', '문하시중'], // 검토자 자동배정 후보
    }
};
// RANK_CONFIG 헬퍼: 점수 → "품계 직급명(한자)" 반환 (재상급 제외, 자동직급만)
const getPosition = (score) => {
    for (const tier of RANK_CONFIG.tiers) {
        if (score >= tier.minScore) return `${tier.grade} ${tier.fullName}`;
    }
    const last = RANK_CONFIG.tiers[RANK_CONFIG.tiers.length - 1];
    return `${last.grade} ${last.fullName}`;
};
// RANK_CONFIG 헬퍼: 점수 + 순위 + 지정직급 → 실시간 직급 name 반환
// designatedRank: admin이 직접 지정한 재상급 rank 번호 (1~4), 우선 적용
const getRealtimePosition = (score, rank, designatedRank = null) => {
    // admin 지정 재상급이 있으면 점수 무관하게 우선 적용
    if (designatedRank) {
        const mt = RANK_CONFIG.ministerTiers.find(t => t.rank === designatedRank);
        if (mt) return `${mt.grade} ${mt.fullName}`;
    }
    for (const mt of RANK_CONFIG.ministerTiers) {
        if (rank === mt.rank && score >= mt.minScore) return `${mt.grade} ${mt.fullName}`;
    }
    for (const tier of RANK_CONFIG.tiers) {
        if (score >= tier.minScore) return `${tier.grade} ${tier.fullName}`;
    }
    return `${RANK_CONFIG.tiers[RANK_CONFIG.tiers.length - 1].grade} ${RANK_CONFIG.tiers[RANK_CONFIG.tiers.length - 1].fullName}`;
};
// server.js
require('dotenv').config(); // .env 파일의 환경 변수를 로드합니다.
require('dotenv').config({ path: '.env.local', override: false }); // .env.local 추가 로드 (GITHUB_TOKEN 등)
const express = require('express');
const { ObjectId } = require('mongodb');
// 💡 [추가] 인증 관련 라이브러리
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { connectToDatabase, collections } = require('./db'); // 🚩 [추가] DB 연결 모듈
const { put: blobPut, del: blobDel } = require('@vercel/blob'); // 🎙️ [추가] Vercel Blob SDK
const app = express();
const port = 3000;
// 💡 [추가] JWT 시크릿 키 환경 변수 확인
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    throw new Error("JWT_SECRET 환경 변수가 설정되지 않았습니다.
.env 파일을 확인해주세요.");
}
let isAppSetup = false; // Flag to ensure setup runs only once
// 헬퍼 함수: ID를 MongoDB의 ObjectId로 변환 (전역으로 이동)
const toObjectId = (id) => {
    if (id && ObjectId.isValid(id)) {
        return new ObjectId(id);
    }
    return null;
}
// ============================================================
// 📋 RANK_CONFIG — 직급 체계 중앙 설정
//   이 객체 하나를 수정하면 전체 직급 관련 동작이 바뀝니다.
// ============================================================
const RANK_CONFIG = {
    // 점수 계산 가중치
    scoreWeights: {
        submitCount:   3,   // 제출 1건당 획득 점수
        approvedCount: 10,  // 승인 1건당 획득 점수
        votes:         1,   // 추천 1회당 획득 점수 (계수)
        review:        1,   // reviewScore 그대로 반영
        approval:      1,   // approvalScore 그대로 반영
        attendance:    1,   // attendancePoints 그대로 반영
        commentCount:  1,   // 의견 1건당 획득 점수 (30자 이상, 일 5회 한도)
    },
    limits: {
        dailyVotes:         9999,  // 일일 추천 제한 없음
        dailyComments:         5,  // 일일 의견 점수 획득 한도
        commentMinLength:     30,  // 점수 획득 최소 글자 수
        reviewBonus:           5,  // 검토 1회당 획득 점수
        approvalBonus:         5,  // 관리자 패널 승인 시 획득 점수
        finalApprovalBonus:   10,  // /approve API 최종승인 시 승인자 획득 점수
    },
// RANK_CONFIG 헬퍼: 점수 → "품계 직급명(한자)" 반환 (재상급 제외, 자동직급만)
const getPosition = (score) => {
    for (const tier of RANK_CONFIG.tiers) {
        if (score >= tier.minScore) return `${tier.grade} ${tier.fullName}`;
    }
    const last = RANK_CONFIG.tiers[RANK_CONFIG.tiers.length - 1];
    return `${last.grade} ${last.fullName}`;
};
// RANK_CONFIG 헬퍼: 점수 + 순위 + 지정직급 → 실시간 직급 name 반환
// designatedRank: admin이 직접 지정한 재상급 rank 번호 (1~4), 우선 적용
const getRealtimePosition = (score, rank, designatedRank = null) => {
    // admin 지정 재상급이 있으면 점수 무관하게 우선 적용
    if (designatedRank) {
        const mt = RANK_CONFIG.ministerTiers.find(t => t.rank === designatedRank);
        if (mt) return `${mt.grade} ${mt.fullName}`;
    }
    for (const mt of RANK_CONFIG.ministerTiers) {
        if (rank === mt.rank && score >= mt.minScore) return `${mt.grade} ${mt.fullName}`;
    }
    for (const tier of RANK_CONFIG.tiers) {
        if (score >= tier.minScore) return `${tier.grade} ${tier.fullName}`;
    }
    return `${RANK_CONFIG.tiers[RANK_CONFIG.tiers.length - 1].grade} ${RANK_CONFIG.tiers[RANK_CONFIG.tiers.length - 1].fullName}`;
};
// RANK_CONFIG 헬퍼: MongoDB $switch branches 동적 생성 (랭킹 aggregation용)
const buildPositionSwitch = () => {
    const scoreExpr = {
        $add: [
            { $multiply: [{ $ifNull: ["$contributionStats.totalCount", 0] }, RANK_CONFIG.scoreWeights.submitCount] },
            { $multiply: [{ $ifNull: ["$contributionStats.approvedCount", 0] }, RANK_CONFIG.scoreWeights.approvedCount] },
            { $ifNull: ["$contributionStats.totalVotes", 0] },
            { $ifNull: ["$reviewScore", 0] },
            { $ifNull: ["$approvalScore", 0] },
            { $ifNull: ["$attendancePoints", 0] },  // ⚡ 출석 점수 포함
            { $multiply: [{ $ifNull: ["$commentScore", 0] }, RANK_CONFIG.scoreWeights.commentCount] } // 💬 의견 점수
        ]
    };
    const branches = RANK_CONFIG.tiers
        .filter(t => t.minScore > 0)
        .map(t => ({ case: { $gte: [scoreExpr, t.minScore] }, then: `${t.grade} ${t.fullName}` }));
    return { branches, default: `${RANK_CONFIG.tiers[RANK_CONFIG.tiers.length - 1].grade} ${RANK_CONFIG.tiers[RANK_CONFIG.tiers.length - 1].fullName}` };
};
// 헬퍼 함수: Geometry로부터 bbox 계산
const calculateBBoxFromGeometry = (geometry) => {
    let minLon = Infinity, minLat = Infinity;
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
                // ⚡ aggregation $switch의 position은 attendancePoints 누락 가능성 있으므로
                // JS 단계에서 실제 score 기준으로 일반 직급을 재설정 (재상급은 아래에서 덮어씀)
                rankings.forEach((user) => {
                    if (!user.designated_rank && !user.designated_position) {
                        user.position = getPosition(user.score);
                    }
                });
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // 재상급 직급 결정 규칙
                //  · designated_rank(admin 수동 지정)는 점수 무관 우선 적용
                //  · 그 외: 종2품 최소 점수(3100) 이상인 사람 중 점수 상위 4명
                //    → 각각 rank 1~4 타이틀 부여 (감수국사~동수국사)
                //  · 재상급 조건 미충족 → 정3품 수찬관으로 자동 강등
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
minLat = Infinity;
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
// 🚩 [추가] 액티비티 로그 기록 헬퍼 함수
// type: 'register' | 'submit' | 'review' | 'approve' | 'comment' | 'rankup' | 'checkin' | 'checkout'
// userId(옵션): 전달 시 DB에서 실시간 직급을 계산하여 actorPosition을 덮어씀
async function logActivity(type, actor, actorPosition, targetName, extra = {}, userId = null) {
    try {
        const { collections: cols } = await require('./db').connectToDatabase();
        // 🚩 userId가 있으면 DB에서 실시간 직급 계산 (토큰 캐시 직급 오류 방지)
        if (userId) {
            try {
                const { ObjectId } = require('mongodb');
                const uid = typeof userId === 'string' ?
new ObjectId(userId) : userId;
                const u = await cols.users.findOne({ _id: uid }, { projection: { username: 1, reviewScore: 1, approvalScore: 1, attendancePoints: 1, designated_rank: 1 } });
                if (u) {
                    // contributions 컬렉션에서 직접 집계 (로그인과 동일한 방식)
                    const contribAgg = await cols.contributions.aggregate([
                        { $match: { $or: [{ userId: uid }, { username: u.username }] } },
                        { $group: {
                            _id: null,
                            totalCount:    { $sum: 1 },
                            approvedCount: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
                            totalVotes:    { $sum: { $ifNull: ['$votes', 0] } }
                        }}
                    ]).toArray();
name: '시강학사', fullName: '시강학사(侍講學士)',          grade: '종4품' },
        { minScore: 1100, name: '기거주',   fullName: '기거주(起居注) / 낭중(郞中)', grade: '정5품' },
        { minScore: 850,  name: '기거사',   fullName: '기거사(起居舍) / 원외랑(員外郞)', grade: '종5품' },
        { minScore: 650,  name: '기거랑',   fullName: '기거랑(起居郞) / 직사관(直史館)', grade: '정6품' },
        { minScore: 450,  name: '기거도위', fullName: '기거도위(起居都尉)',          grade: '종6품' },
        { minScore: 300,  name: '수찬',     fullName: '수찬(修撰)',                  grade: '정7품' },
        { minScore: 200,  name: '직문한',   fullName: '직문한(直文翰)',              grade: '종7품' },
        { minScore: 120,  name: '주서',     fullName: '주서(注書)',                  grade: '정8품' },
        { minScore: 60,   name: '검열',     fullName: '검열(檢閱)',                  grade: '종8품' },
        { minScore: 30,   name: '정자',     fullName: '정자(正字)',                  grade: '정9품' },
        { minScore: 0,    name: '수분권지', fullName: '수분권지(修分權知)',          grade: '종9품' },
    ],
    // 권한 그룹 (name 기준으로 비교)
    roles: {
        reviewers:    ['시강학사', '사관수찬', '직수찬관', '수찬관'],          // 검토 가능 직급 (종4품~정3품)
        approvers:    ['동수국사', '수국사', '판사관사', '감수국사'],          // 최종 승인 가능 직급 (종2품~정1품)
        apiApprovers: ['수국사', '판사관사', '감수국사'],                      // API verifyApprover 미들웨어 (정2품~정1품)
        assignable:   ['수찬관', '사천감', '한림학사', '상서', '수국사', '동수국사', '감수국사', '문하시중'], // 검토자 자동배정 후보
    }
};
attendancePoints || 0)
                             + (u.commentScore     || 0);
                    actorPosition = getRealtimePosition(sc, null, u.designated_rank || null);
                }
            } catch (_) { /* 실패 시 기존 actorPosition 유지 */ }
        }
        // 🔕 checkin/checkout: 같은 유저의 동일 타입이 30분 내 존재하면 스킵 (도배 방지)
        if (type === 'checkin' || type === 'checkout') {
            const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
            const dup = await cols.activityLogs.findOne({
                type, actor, createdAt: { $gte: thirtyMinAgo }
            });
            if (dup) return; // 중복 — 기록하지 않음
        }
        await cols.activityLogs.insertOne({
            type,
            actor,
            actorPosition,
            targetName,
            extra,
            createdAt: new Date()
        });
        // FIFO 정리: 전체 30개 유지, 단 checkin/checkout은 최대 8개만 보존
        const total = await cols.activityLogs.countDocuments({});
        if (total > 30) {
            const overflow = total - 30;
            const oldest = await cols.activityLogs
                .find({})
                .sort({ createdAt: 1 })
                .limit(overflow)
                .toArray();
            await cols.activityLogs.deleteMany({ _id: { $in: oldest.map(d => d._id) } });
        }
        // checkin/checkout 각각 최대 8개 보존 (나머지는 삭제)
        for (const t of ['checkin', 'checkout']) {
            const tCount = await cols.activityLogs.countDocuments({ type: t });
            if (tCount > 8) {
                const overT = await cols.activityLogs
                    .find({ type: t })
                    .sort({ createdAt: 1 })
                    .limit(tCount - 8)
                    .toArray();
                if (overT.length > 0) {
                    await cols.activityLogs.deleteMany({ _id: { $in: overT.map(d => d._id) } });
                }
            }
        }
    } catch (e) {
        // non-fatal: 로그 실패가 서비스에 영향 주지 않도록
        console.warn('⚠️ [logActivity] 기록 실패:', e.message);
    }
}
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
const castles = [];
                for await (const doc of cursor) {
                    castles.push({ ...doc, _id: doc._id?.toString ?
doc._id.toString() : doc._id });
                }
                const json = JSON.stringify(castles);
                fs.writeFileSync(CASTLE_STATIC_FILE, json);
                // update metadata for incremental rebuilds
                try {
                    const metaPath = path.join(__dirname, 'public', 'castles.meta.json');
                    fs.writeFileSync(metaPath, JSON.stringify({ lastRebuild: new Date().toISOString() }));
                } catch (e) {
                    console.warn('⚠️ castles.meta.json 쓰기 실패:', e.message);
                }
                // 메모리 캐시도 동시 갱신
                _castleCache = castles;
                _castleCacheTime = Date.now();
                _castleLastModified = Date.now();
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`✅ [재빌드 완료] castles.json 갱신: ${castles.length}개, ${(json.length/1024/1024).toFixed(1)}MB (${elapsed}초)`);
            } catch (e) {
                console.error('❌ [재빌드 실패] castles.json 갱신 오류:', e.message);
                // 실패 시 메모리 캐시만 무효화 → 다음 GET 요청이 재쿼리
                invalidateCastleCache();
            } finally {
                _castleRebuildInProgress = false;
            }
        }
        // 🗺️ [영토 타일] 변경 추적 — 변경된 영토 ID Set (증분 재빌드용)
        let _dirtyTerritoryIds = new Set(); // 변경된 영토 _id 문자열
        let _territoryDirty = false;        // 야간 배치용 dirty 플래그 (하위 호환)
        const TILES_DIR = path.join(__dirname, 'public', 'tiles');
        const TILE_SIZE = 10; // 10도 x 10도 타일
        // ─── Douglas-Peucker 단순화 (export_territories_to_tiles.js와 동일 로직) ───
        function _dpSimplify(points, tol) {
            if (points.length <= 2) return points;
            const sq = t => t * t;
            function sqSegDist(p, p1, p2) {
                let x = p1[0], y = p1[1], dx = p2[0]-x, dy = p2[1]-y;
                if (dx !== 0 || dy !== 0) {
                    const t = ((p[0]-x)*dx + (p[1]-y)*dy) / (sq(dx)+sq(dy));
                    if (t > 1) { x = p2[0]; y = p2[1]; }
                    else if (t > 0) { x += dx*t; y += dy*t; }
                }
                return sq(p[0]-x) + sq(p[1]-y);
            }
            const sqTol = sq(tol); let maxD = 0, idx = 0;
            for (let i = 1; i < points.