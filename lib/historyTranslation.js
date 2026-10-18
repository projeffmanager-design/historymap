'use strict';

const CATEGORY = 'history_translation';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max, label, required = false) => {
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
        fail(400, `${label}을(를) 확인해 주세요. (최대 ${max.toLocaleString()}자)`);
    }
    return value.trim();
};

function createTranslationService({ collections, toObjectId, getMongoClient, ranks, invalidate = () => {} }) {
    const id = value => {
        const result = toObjectId(value);
        if (!result) fail(400, '잘못된 ID 형식입니다.');
        return result;
    };
    const member = async (auth, session) => {
        if (!auth || auth.isGuest) fail(403, '로그인한 사관만 번역 제안에 참여할 수 있습니다.');
        const user = await collections.users.findOne({ _id:id(auth.userId) }, { session });
        if (!user || user.isGuest || user.isLocked || user.username === '서긍') fail(403, '로그인한 사관만 번역 제안에 참여할 수 있습니다.');
        return user;
    };
    const isAdmin = user => ['admin', 'superuser'].includes(user.role);
    const hasPosition = (user, positions) => positions.some(position => String(user.position || '').includes(position));
    const canApprove = user => isAdmin(user) || hasPosition(user, ranks.roles.approvers)
        || [1, 2, 3, 4].includes(user.designated_rank);
    const targetOf = async (type, recordId, session) => {
        if (!['source', 'history'].includes(type)) fail(400, '번역할 기록 유형이 올바르지 않습니다.');
        const collection = type === 'source' ? collections.sourceRecords : collections.history;
        const record = await collection.findOne({ _id:id(recordId) }, { session });
        if (!record) fail(404, '번역할 기록을 찾을 수 없습니다.');
        const originalRecord = ['chinese', 'foreign', 'korean', 'true_history']
            .map(key => record.records?.[key]).find(value => value?.content?.trim());
        const original = type === 'source' ? record.content : originalRecord?.content || record.comment;
        if (typeof original !== 'string' || !original.trim()) fail(400, '번역할 원문이 없습니다.');
        return { collection, record, original, source:record.source || originalRecord?.source || '' };
    };
    const transaction = async work => {
        const session = getMongoClient().startSession();
        try {
            const result = await session.withTransaction(() => work(session));
            invalidate();
            return result;
        } finally { await session.endSession(); }
    };
    const activity = async (session, type, user, proposal, comment = '') => {
        await collections.activityLogs.insertOne({
            type, actor:user.username, actorId:String(user._id), actorPosition:user.position || '',
            targetName:proposal.name.replace(/^\[번역\]\s*/, ''),
            extra:{
                category:CATEGORY, record_type:proposal.targetType, record_id:proposal.targetId,
                contribution_id:String(proposal._id), translator:proposal.username,
                translator_id:String(proposal.userId), source:proposal.source,
                year:proposal.year, month:proposal.month,
                ...(proposal.revisionOf ? { revision_of:proposal.revisionOf } : {}), ...(comment ? { comment } : {})
            },
            createdAt:new Date()
        }, { session });
    };

    async function createProposal(session, user, body, content, evidence, revisionOf = null) {
        const { record, original, source } = await targetOf(body.targetType, body.targetId, session);
        if (await collections.contributions.findOne({
            category:CATEGORY, userId:user._id, targetType:body.targetType, targetId:String(record._id),
            status:{ $in:['pending', 'reviewed'] }
        }, { session })) fail(409, '이 기사에 제출한 번역이 검토 중입니다. 사료 제안 목록에서 확인해 주세요.');
        const proposal = {
            category:CATEGORY, targetType:body.targetType, targetId:String(record._id),
            userId:user._id, username:user.username,
            name:`[번역] ${record.title || record.event_name || '제목 없음'}`,
            source,
            year:record.year ?? null, month:record.month ?? null,
            originalContent:original, baseTranslationId:record.translation?.contributionId || null,
            previousTranslation:record.translation?.content || '',
            content, evidence, status:'pending', votes:0, votedBy:[],
            reviewerId:null, reviewedAt:null, revision:0,
            ...(revisionOf ? { revisionOf } : {}), createdAt:new Date()
        };
        const result = await collections.contributions.insertOne(proposal, { session });
        await collections.users.updateOne({ _id:user._id }, { $inc:{ totalCount:1 } }, { session });
        await activity(session, revisionOf ? 'translation_update' : 'translation_submit', user, { ...proposal, _id:result.insertedId });
        return { message:revisionOf ? '수정안을 검토 대기로 등록했습니다. 기존 승인 번역은 새 수정안이 승인될 때까지 유지됩니다.'
            : '번역 제안이 접수되었습니다. 검토와 최종 승인 후 번역자 이름으로 반영됩니다.',
            contribution:{ ...proposal, _id:result.insertedId } };
    }

    async function submit(auth, body = {}) {
        if (!body || typeof body !== 'object') fail(400, '번역 제안 내용을 입력해 주세요.');
        const content = text(body.content, 100000, '번역문', true);
        const evidence = text(body.evidence ?? '', 2000, '번역 근거');
        return transaction(async session => {
            const user = await member(auth, session);
            return createProposal(session, user, body, content, evidence);
        });
    }

    async function edit(proposalId, auth, body = {}) {
        if (!body || typeof body !== 'object') fail(400, '번역 수정 내용을 입력해 주세요.');
        const content = text(body.content, 100000, '번역문', true);
        const evidence = text(body.evidence ?? '', 2000, '번역 근거');
        if (!Number.isSafeInteger(body.revision) || body.revision < 0) fail(400, '수정할 번역의 버전을 확인해 주세요.');
        return transaction(async session => {
            const user = await member(auth, session);
            const proposal = await collections.contributions.findOne({ _id:id(proposalId) }, { session });
            if (!proposal || proposal.category !== CATEGORY) fail(404, '번역 제안을 찾을 수 없습니다.');
            if (String(proposal.userId) !== String(user._id)) fail(403, '본인이 작성한 번역만 수정할 수 있습니다.');
            if ((proposal.revision || 0) !== body.revision) fail(409, '다른 창에서 번역이 수정되었습니다. 새로고침 후 확인해 주세요.');
            const target = await targetOf(proposal.targetType, proposal.targetId, session);
            if (content === proposal.content && evidence === (proposal.evidence || '') && proposal.status !== 'rejected'
                && target.original === proposal.originalContent
                && (proposal.status === 'approved' || (target.record.translation?.contributionId || null) === (proposal.baseTranslationId || null))) {
                return { message:'변경된 내용이 없습니다.', unchanged:true, contribution:proposal };
            }
            if (proposal.status === 'approved') {
                return createProposal(session, user, { targetType:proposal.targetType, targetId:proposal.targetId }, content, evidence,
                    proposal.revisionOf || String(proposal._id));
            }
            if (!['pending', 'reviewed', 'rejected'].includes(proposal.status)) fail(409, '수정할 수 없는 상태입니다.');
            const duplicate = await collections.contributions.findOne({
                category:CATEGORY, userId:user._id, targetType:proposal.targetType, targetId:proposal.targetId,
                status:{ $in:['pending', 'reviewed'] }
            }, { session });
            if (duplicate && String(duplicate._id) !== String(proposal._id)) fail(409, '이 기사에 검토 중인 다른 번역 제안이 있습니다. 해당 제안을 수정해 주세요.');
            const update = {
                content, evidence, revision:(proposal.revision || 0) + 1, status:'pending', updatedAt:new Date(),
                originalContent:target.original, baseTranslationId:target.record.translation?.contributionId || null,
                previousTranslation:target.record.translation?.content || '', source:target.source,
                year:target.record.year ?? null, month:target.record.month ?? null,
                reviewerId:null, reviewerUsername:null, reviewedAt:null, reviewComment:null,
                approverId:null, approverUsername:null, approvedAt:null, approveComment:null, rejectComment:null
            };
            await collections.contributions.updateOne({ _id:proposal._id }, { $set:update, $push:{ editHistory:{
                content:proposal.content, evidence:proposal.evidence || '', status:proposal.status,
                revision:proposal.revision || 0, reviewComment:proposal.reviewComment || '',
                rejectComment:proposal.rejectComment || '', editedAt:update.updatedAt
            } } }, { session });
            await activity(session, 'translation_update', user, { ...proposal, ...update });
            return { message:'번역문과 참고 자료를 수정했습니다. 수정된 내용으로 다시 검토받습니다.',
                contribution:{ ...proposal, ...update } };
        });
    }

    async function getOwn(proposalId, auth) {
        const user = await member(auth);
        const proposal = await collections.contributions.findOne({ _id:id(proposalId), category:CATEGORY });
        if (!proposal) fail(404, '번역 제안을 찾을 수 없습니다.');
        if (String(proposal.userId) !== String(user._id)) fail(403, '본인이 작성한 번역만 수정할 수 있습니다.');
        return proposal;
    }

    async function transition(proposalId, auth, action, comment = '', expectedRevision) {
        if (!['review', 'review-reject', 'approve', 'reject'].includes(action)) fail(400, '잘못된 심사 요청입니다.');
        const note = text(comment ?? '', 2000, '검토 의견');
        return transaction(async session => {
            const user = await member(auth, session);
            const proposal = await collections.contributions.findOne({ _id:id(proposalId) }, { session });
            if (!proposal || proposal.category !== CATEGORY) fail(404, '번역 제안을 찾을 수 없습니다.');
            const reviewAction = action.startsWith('review');
            if (reviewAction ? !(canApprove(user) || hasPosition(user, ranks.roles.reviewers)) : !canApprove(user)) {
                fail(403, reviewAction ? '번역 검토 권한이 필요합니다.' : '번역 승인 권한이 필요합니다.');
            }
            if (String(proposal.userId) === String(user._id) && (reviewAction || !isAdmin(user))) {
                fail(403, '본인이 제출한 번역은 직접 심사할 수 없습니다.');
            }
            if (((proposal.revision || 0) > 0 && expectedRevision === undefined)
                || (expectedRevision !== undefined && expectedRevision !== (proposal.revision || 0))) {
                fail(409, '번역이 수정되었습니다. 최신 내용을 확인한 뒤 다시 심사해 주세요.');
            }
            if (proposal.status === 'approved' && action === 'approve') {
                return { message:'이미 적용된 번역입니다.', unchanged:true,
                    translationTarget:{ type:proposal.targetType, id:proposal.targetId, year:proposal.year } };
            }
            if (proposal.status === 'approved' || proposal.status === 'rejected') fail(409, '이미 심사가 끝난 번역입니다.');
            if (reviewAction && proposal.status !== 'pending') fail(409, '이미 검토된 번역입니다.');
            if (action === 'approve' && proposal.status !== 'reviewed' && !isAdmin(user)) fail(409, '1차 검토를 마친 번역만 최종 승인할 수 있습니다.');
            if (['reject', 'review-reject'].includes(action) && !note) fail(400, '반려 사유를 입력해 주세요.');

            const now = new Date();
            const update = reviewAction ? {
                status:action === 'review' ? 'reviewed' : 'rejected',
                reviewerId:user._id, reviewerUsername:user.username, reviewedAt:now, reviewComment:note
            } : {
                status:action === 'approve' ? 'approved' : 'rejected',
                approverId:user._id, approverUsername:user.username, approvedAt:now,
                ...(action === 'approve' ? { approveComment:note } : { rejectComment:note })
            };
            if (action === 'approve') {
                const { collection, record, original } = await targetOf(proposal.targetType, proposal.targetId, session);
                if (original !== proposal.originalContent
                    || (record.translation?.contributionId || null) !== (proposal.baseTranslationId || null)) {
                    fail(409, '제안 후 원문 또는 적용된 번역이 변경되었습니다. 최신 기사를 확인해 다시 제안해 주세요.');
                }
                const translation = {
                    content:proposal.content, translator:proposal.username, translatorId:proposal.userId,
                    evidence:String(proposal.evidence || '').trim(), revision:proposal.revision || 0,
                    contributionId:String(proposal._id), approvedBy:user.username, approvedById:user._id, approvedAt:now
                };
                await collection.updateOne({ _id:record._id }, {
                    $set:{ translation, updatedAt:now }, $push:{ translationHistory:translation }
                }, { session });
                await collections.users.updateOne({ _id:proposal.userId }, { $inc:{ approvedCount:1 } }, { session });
                await collections.users.updateOne({ _id:user._id }, {
                    $inc:{ approvalScore:ranks.limits.finalApprovalBonus }
                }, { session });
            } else if (reviewAction) {
                await collections.users.updateOne({ _id:user._id }, { $inc:{ reviewScore:ranks.limits.reviewBonus } }, { session });
            }
            await collections.contributions.updateOne({ _id:proposal._id }, { $set:update }, { session });
            await activity(session, action === 'approve' ? 'translation_approve'
                : action === 'review' ? 'translation_review' : 'translation_reject', user, proposal, note);
            return {
                message:action === 'approve' ? `${proposal.username} 사관의 이름으로 번역을 적용했습니다.`
                    : action === 'review' ? '번역 검토가 완료되었습니다. 최종 승인을 기다립니다.' : '번역 제안을 반려했습니다.',
                status:update.status,
                translationTarget:{ type:proposal.targetType, id:proposal.targetId, year:proposal.year }
            };
        });
    }

    async function counts({ targetType, ids }) {
        if (!['source', 'history'].includes(targetType) || typeof ids !== 'string') fail(400, '기록 유형과 ID를 확인해 주세요.');
        const recordIds = [...new Set(ids.split(',').filter(Boolean))];
        if (!recordIds.length || recordIds.length > 40) fail(400, '한 번에 최대 40개 기사를 조회할 수 있습니다.');
        recordIds.forEach(id);
        const rows = await collections.contributions.aggregate([
            { $match:{ category:CATEGORY, targetType, targetId:{ $in:recordIds } } },
            { $group:{ _id:'$targetId', total:{ $sum:1 }, pending:{ $sum:{
                $cond:[{ $in:['$status', ['pending', 'reviewed']] }, 1, 0]
            } } } }
        ]).toArray();
        const result = Object.fromEntries(recordIds.map(key => [key, { total:0, pending:0 }]));
        rows.forEach(row => { result[String(row._id)] = { total:row.total, pending:row.pending }; });
        return { counts:result };
    }

    return { submit, edit, getOwn, transition, counts };
}

module.exports = { CATEGORY, createTranslationService };
