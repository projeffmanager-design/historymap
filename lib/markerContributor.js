'use strict';
const isAdmin = user => ['admin', 'superuser'].includes(user?.role);
const activeMember = { isGuest:{ $ne:true }, isActive:{ $ne:false }, deleted:{ $ne:true } };
function contributorName(value) {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    return name.length >= 1 && name.length <= 80 && !/[<>\x00-\x1f\x7f]/.test(name) ? name : null;
}
async function validateContributorUpdate(body, user, { users, toObjectId }) {
    const owns = key => Object.prototype.hasOwnProperty.call(body, key);
    if (!owns('createdBy') && !owns('createdByUserId')) return null;
    if (!isAdmin(user)) return { status:403, message:'기여자는 관리자만 변경할 수 있습니다.' };
    const id = typeof body.createdByUserId === 'string' ? toObjectId(body.createdByUserId) : null;
    if (!id) return { status:400, message:'회원 검색 결과에서 기여자를 선택해 주세요.' };
    const member = await users.findOne({ _id:id, ...activeMember }, { projection:{ _id:1, username:1 } });
    if (!member) return { status:404, message:'선택한 회원이 없거나 활동 중인 회원이 아닙니다. 다시 검색해 주세요.' };
    const name = contributorName(member.username);
    if (!name) return { status:400, message:'선택한 회원의 이름을 확인할 수 없습니다.' };
    body.createdBy = name;
    body.createdByUserId = String(member._id);
    return null;
}
function createContributorMemberSearch({ collections }) {
    return async (req, res) => {
        if (!isAdmin(req.user)) return res.status(403).json({ message:'관리자 권한이 필요합니다.' });
        const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0,80) : '';
        res.set('Cache-Control','private, no-store');
        if (!q) return res.json([]);
        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
        try {
            const members = await collections.users.find({ ...activeMember,
                $or:[{ username:regex }, { 'historianProfile.displayName':regex }]
            }, { projection:{ _id:1, username:1, position:1, 'historianProfile.displayName':1 } })
                .sort({ username:1, _id:1 }).limit(20).toArray();
            return res.json(members.map(member => ({ _id:String(member._id), username:member.username,
                displayName:member.historianProfile?.displayName || '', position:member.position || '' })));
        } catch (error) {
            return res.status(500).json({ message:'회원 검색에 실패했습니다. 다시 시도해 주세요.' });
        }
    };
}
module.exports = { contributorName, validateContributorUpdate, createContributorMemberSearch };
