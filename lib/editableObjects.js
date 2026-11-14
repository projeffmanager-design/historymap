'use strict';

const EDITOR_ROLES = new Set(['admin', 'superuser', '사관', '정사관', '수사관']);
const NATURAL_NAMES = { mountain:'산', river:'강/호수', sea:'바다', tomb:'고분/묘', other:'기타' };
const idString = id => String(id?.$oid || id || '');
const isAdmin = user => ['admin', 'superuser'].includes(user?.role);
function objectLabel(source, record) {
    if (source === 'castle') {
        if (record.is_label) return '지명';
        if (record.is_natural_feature) return `자연지물 · ${NATURAL_NAMES[record.natural_feature_type] || record.natural_feature_type || '기타'}`;
        if (record.is_military_flag) return '군대';
        return record.is_battle ? '전투' : '성/도시';
    }
    if (source === 'natural-feature') return `자연지형 · ${NATURAL_NAMES[record.type] || record.type || '기타'}`;
    if (source === 'contribution' && record.status === 'approved') return '승인 사료 · 지도 등록 확인';
    return { drawing:'그리기', resource:'자원/서식지', crop:'작물', 'ad-marker':'광고', contribution:'제출 사료 · 상세/검토' }[source];
}
function searchableNames(record) {
    return [...new Set([
        record.name, record.name_ko, record.name_zh, record.name_en, record.title,
        record.properties?.name, ...(Array.isArray(record.history) ? record.history : []).map(row => row?.name)
    ].filter(value => typeof value === 'string' && value.trim()))];
}

function createEditableObjectHandlers({ collections, toObjectId }) {
    function sources(user) {
        const entries = [
            { source:'castle', collection:collections.castle, filter:{ deleted:{ $ne:true } } },
            { source:'natural-feature', collection:collections.naturalFeatures, filter:{ deleted:{ $ne:true } } }
        ];
        if (isAdmin(user)) {
            const db = collections.countries.s.db;
            entries.push(
                { source:'drawing', collection:collections.drawings, filter:{ deleted:{ $ne:true } } },
                { source:'resource', collection:db.collection('resources'), filter:{ deleted:{ $ne:true } } },
                { source:'crop', collection:db.collection('crops'), filter:{ deleted:{ $ne:true } } },
                { source:'ad-marker', collection:collections.adMarkers, filter:{ deleted:{ $ne:true } } },
                { source:'contribution', collection:collections.contributions, filter:{
                    status:{ $in:['pending', 'reviewed', 'approved'] },
                    category:{ $nin:['historical_record', 'hero_research', 'history_translation'] }
                } }
            );
        }
        return entries;
    }
    function allowed(req, res) {
        if (EDITOR_ROLES.has(req.user?.role)) return true;
        res.status(403).json({ message:'오브젝트 편집 권한이 필요합니다.' });
        return false;
    }
    return {
        async search(req, res) {
            if (!allowed(req, res)) return;
            const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
            if (!q) return res.json([]);
            const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
            const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            const fields = ['name', 'name_ko', 'name_zh', 'name_en', 'title', 'properties.name', 'history.name'];
            const projection = { _id:1, name:1, name_ko:1, name_zh:1, name_en:1, title:1, 'properties.name':1,
                'history.name':1, is_label:1, is_natural_feature:1, natural_feature_type:1, is_military_flag:1,
                is_battle:1, type:1, placeType:1, status:1, resource_type:1 };
            try {
                const groups = await Promise.all(sources(req.user).map(async entry => {
                    const records = await entry.collection.find({ $and:[entry.filter, { $or:fields.map(field => ({ [field]:regex })) }] }, { projection })
                        .sort({ name:1, _id:1 }).limit(limit).toArray();
                    return records.map(record => {
                        const names = searchableNames(record);
                        const name = names[0] || '이름 없음';
                        const matchedName = names.find(value => regex.test(value)) || name;
                        return { _id:idString(record._id), source:entry.source, name, matchedName,
                            typeLabel:objectLabel(entry.source, record), status:record.status || null };
                    });
                }));
                const results = groups.flat().sort((a, b) =>
                    Number(b.matchedName.toLowerCase() === q.toLowerCase()) - Number(a.matchedName.toLowerCase() === q.toLowerCase())
                    || a.name.localeCompare(b.name, 'ko') || a.source.localeCompare(b.source) || a._id.localeCompare(b._id));
                res.set('Cache-Control', 'no-store');
                return res.json(results.slice(0, limit));
            } catch (error) {
                return res.status(500).json({ message:'오브젝트 검색에 실패했습니다.' });
            }
        },
        async detail(req, res) {
            if (!allowed(req, res)) return;
            const objectId = toObjectId(req.params.id);
            if (!objectId) return res.status(400).json({ message:'잘못된 오브젝트 ID입니다.' });
            try {
                const entry = sources(req.user).find(item => item.source === req.params.source);
                if (!entry) return res.status(404).json({ message:'지원하지 않는 오브젝트 유형입니다.' });
                const record = await entry.collection.findOne({ $and:[{ _id:objectId }, entry.filter] });
                if (!record) return res.status(404).json({ message:'오브젝트가 삭제되었거나 더 이상 편집할 수 없습니다.' });
                if (entry.source === 'contribution' && record.status === 'approved') {
                    record._editableLinkedCastle = await collections.castle.findOne({
                        originContributionId:idString(record._id), deleted:{ $ne:true }
                    });
                    record._editableMissingMarker = !record._editableLinkedCastle;
                }
                res.set('Cache-Control', 'no-store');
                return res.json(record);
            } catch (error) {
                return res.status(500).json({ message:'오브젝트를 불러오지 못했습니다.' });
            }
        }
    };
}
module.exports = { createEditableObjectHandlers };
