'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { fixture } = require('./helpers/translationFixture');
const submit = f => f.service.submit(f.auth('writer'), f.input);

test('article proposal trusts the authenticated author and preserves undated original', async () => {
    const f = fixture();
    const result = await f.service.submit(f.auth('writer'), { ...f.input, username:'가짜이름', userId:f.ids.admin });
    const proposal = result.contribution;
    assert.equal(proposal.username, '번역사관');
    assert.equal(proposal.userId, f.ids.writer);
    assert.equal(proposal.year, null);
    assert.equal(proposal.originalContent, f.data.sourceRecords[0].content);
    assert.equal(f.data.sourceRecords[0].translation, undefined);
    assert.equal(f.data.users[0].totalCount, 1);
    assert.equal(f.invalidations(), 1);
    await assert.rejects(submit(f), { status:409 });
});

test('guest, missing account, locked account and malformed submissions cannot earn points', async () => {
    const f = fixture();
    await assert.rejects(f.service.submit({ ...f.auth('writer'), isGuest:true }, f.input), { status:403 });
    await assert.rejects(f.service.submit({ userId:'0'.repeat(24) }, f.input), { status:403 });
    f.data.users[0].isLocked = true;
    await assert.rejects(submit(f), { status:403 });
    f.data.users[0].isLocked = false;
    for (const bad of [{ content:'' }, { content:'a'.repeat(100001) }, { targetId:'invalid' }, { targetType:'users' }, { targetId:'0'.repeat(24) }]) {
        await assert.rejects(f.service.submit(f.auth('writer'), { ...f.input, ...bad }));
    }
    assert.equal(f.data.contributions.length, 0);
    assert.equal(f.data.users[0].totalCount, undefined);
});

test('review then approval applies named translation and exactly the existing merit weights', async () => {
    const f = fixture();
    f.input.evidence = '  원사 권208 고려전\n원문 대조 및 용례 참고  ';
    const { contribution:p } = await submit(f);
    await f.service.transition(p._id, f.auth('reviewer'), 'review', '원문 대조 완료');
    assert.equal(f.data.sourceRecords[0].translation, undefined);
    const result = await f.service.transition(p._id, f.auth('approver'), 'approve');
    const record = f.data.sourceRecords[0];
    assert.equal(record.content, p.originalContent);
    assert.equal(record.translation.content, p.content);
    assert.equal(record.translation.translator, '번역사관');
    assert.equal(record.translation.translatorId, f.ids.writer);
    assert.equal(record.translation.contributionId, p._id);
    assert.equal(record.translation.evidence, '원사 권208 고려전\n원문 대조 및 용례 참고');
    assert.equal(record.translationHistory.length, 1);
    assert.equal(record.translationHistory[0].evidence, record.translation.evidence);
    assert.equal(result.translationTarget.id, f.ids.source);
    assert.equal(f.data.users[0].totalCount * f.ranks.scoreWeights.submitCount + f.data.users[0].approvedCount * f.ranks.scoreWeights.approvedCount, 13);
    assert.equal(f.data.users[1].reviewScore, 5);
    assert.equal(f.data.users[3].approvalScore, 10);
    await f.service.transition(p._id, f.auth('approver'), 'approve');
    assert.equal(f.data.users[0].approvedCount, 1);
    assert.equal(f.data.users[3].approvalScore, 10);
    assert.equal(record.translationHistory.length, 1);
});

test('administrator can approve while reading the proposal on the article', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    await f.service.transition(p._id, f.auth('admin'), 'approve');
    assert.equal(f.data.contributions[0].status, 'approved');
    assert.equal(f.data.sourceRecords[0].translation.translator, '번역사관');
});

test('regular accounts cannot review or approve, and reviewers cannot review their own proposal', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    for (const action of ['review', 'approve', 'reject']) {
        await assert.rejects(f.service.transition(p._id, f.auth('other'), action, '사유'), { status:403 });
    }
    f.data.users[0].position = '수찬관';
    await assert.rejects(f.service.transition(p._id, f.auth('writer'), 'review'), { status:403 });
    await assert.rejects(f.service.transition(p._id, f.auth('approver'), 'approve'), { status:409 });
    assert.equal(f.data.sourceRecords[0].translation, undefined);
});

test('rejection records its reason without publishing or earning an approval bonus', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    await assert.rejects(f.service.transition(p._id, f.auth('admin'), 'reject'), { status:400 });
    await f.service.transition(p._id, f.auth('admin'), 'reject', '구절 재검토 필요');
    assert.equal(f.data.contributions[0].rejectComment, '구절 재검토 필요');
    assert.equal(f.data.users[0].approvedCount, undefined);
    assert.equal(f.data.sourceRecords[0].translation, undefined);
    await assert.rejects(f.service.transition(p._id, f.auth('admin'), 'approve'), { status:409 });
});

test('changed originals and newer accepted translations require a fresh proposal', async () => {
    for (const changed of ['original', 'translation']) {
        const f = fixture();
        const { contribution:p } = await submit(f);
        if (changed === 'original') f.data.sourceRecords[0].content += '改';
        else f.data.sourceRecords[0].translation = { contributionId:'newer', content:'다른 번역' };
        await assert.rejects(f.service.transition(p._id, f.auth('admin'), 'approve'), { status:409 });
        assert.equal(f.data.contributions[0].status, 'pending');
        assert.equal(f.data.users[0].approvedCount, undefined);
    }
});

test('history articles keep their existing Korean and Chinese records', async () => {
    const f = fixture();
    const { contribution:p } = await f.service.submit(f.auth('writer'), { ...f.input, targetType:'history', targetId:f.ids.history });
    const original = structuredClone(f.data.history[0].records);
    await f.service.transition(p._id, f.auth('admin'), 'approve');
    assert.deepEqual(f.data.history[0].records, original);
    assert.equal(f.data.history[0].translation.translator, '번역사관');
});

test('write failure rolls back translation, approval status and merit together', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    f.failNextWrite('contributions');
    await assert.rejects(f.service.transition(p._id, f.auth('admin'), 'approve'), /simulated write/);
    assert.equal(f.data.sourceRecords[0].translation, undefined);
    assert.equal(f.data.contributions[0].status, 'pending');
    assert.equal(f.data.users[0].approvedCount, undefined);
    assert.equal(f.data.users[2].approvalScore, undefined);
    await f.service.transition(p._id, f.auth('admin'), 'approve');
    assert.equal(f.data.users[0].approvedCount, 1);
});

test('two approvals of competing proposals do not overwrite or double award', async () => {
    const f = fixture();
    const { contribution:first } = await submit(f);
    const { contribution:second } = await f.service.submit(f.auth('other'), { ...f.input, content:'다른 제안' });
    const results = await Promise.allSettled([
        f.service.transition(first._id, f.auth('admin'), 'approve'),
        f.service.transition(second._id, f.auth('admin'), 'approve')
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(f.data.sourceRecords[0].translation.contributionId, first._id);
    assert.equal(f.data.sourceRecords[0].translationHistory.length, 1);
});

test('article markup escapes translated text and displays the author while retaining a single translation button', () => {
    const context = { document:{ addEventListener() {} }, window:{ addEventListener() {} } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../public/assets/history-translations.js'), 'utf8'), context);
    const html = context.window.HistoryTranslations.markup({ _id:'id', content:'原文', translation:{ content:'<script>bad()</script>\n번역', translator:'사관<이름>', evidence:'원사\n<script>unsafe()</script>' } }, 'source');
    assert.match(html, /🌐 번역제안/);
    assert.match(html, /사관&lt;이름&gt;/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.equal((html.match(/<button/g) || []).length, 1);
    assert.match(html, /<small class="history-approved-translation-evidence">번역 근거·참고 자료: 원사\n&lt;script&gt;unsafe/);
    const withoutEvidence = context.window.HistoryTranslations.markup({ _id:'id', content:'原文', translation:{ content:'번역', translator:'사관', evidence:'   ' } }, 'source');
    assert.doesNotMatch(withoutEvidence, /history-approved-translation-evidence/);
});

test('administrator article action publishes immediately and refreshes the article without reloading', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    const handlers = {};
    const captures = {};
    const applied = { innerHTML:'' };
    const list = { innerHTML:'', querySelector:() => null,
        insertAdjacentHTML(_where, html) { this.innerHTML += html; } };
    const panel = { querySelector:() => null };
    const toggle = { innerHTML:'', title:'' };
    const widget = { dataset:{ targetType:'source', targetId:f.ids.source }, isConnected:true, classList:{ contains:() => false },
        querySelector:selector => ({ '.history-translation-panel':panel, '.history-translation-applied':applied, '.history-translation-list':list, '.history-translation-toggle':toggle }[selector]) };
    const proposal = { dataset:{ proposalId:p._id }, querySelector:() => null };
    const button = { dataset:{ translationAction:'approve' }, isConnected:true, disabled:false,
        classList:{ contains:() => false }, closest:selector => selector === '.history-translations' ? widget : proposal };
    let invalidated;
    let feedRefreshes = 0;
    const context = {
        document:{
            addEventListener(name, handler, capture) { handlers[name] = handler; captures[name] = capture; },
            querySelectorAll:selector => selector === '.history-translations' ? [widget] : []
        },
        window:{ addEventListener() {}, refreshActivityFeed() { feedRefreshes++; } },
        fetch:async (url, init) => {
            let data;
            if (init.method === 'PUT') data = await f.service.transition(p._id, f.auth('admin'), 'approve');
            else if (url.includes('source-records')) data = structuredClone(f.data.sourceRecords[0]);
            else data = { proposals:structuredClone(f.data.contributions), total:1, offset:0 };
            return { ok:true, json:async () => data };
        }, URLSearchParams
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../public/assets/history-translations.js'), 'utf8'), context);
    context.window.HistoryTranslations.configure({ getUser:() => f.data.users[2], getToken:() => 'test', onApplied:target => { invalidated = target; } });
    await handlers.click({ target:{ closest:() => button }, stopPropagation() {} });
    assert.equal(f.data.contributions[0].status, 'approved');
    assert.match(applied.innerHTML, /번역사관/);
    assert.match(applied.innerHTML, /고려가 사신을 보내 조공하였다/);
    assert.match(list.innerHTML, /승인/);
    assert.match(list.innerHTML, /<details class="history-translation-proposal"/);
    assert.doesNotMatch(list.innerHTML, /<details[^>]*\bopen\b/);
    assert.doesNotMatch(list.innerHTML, /승인·번역 적용/);
    assert.equal(button.disabled, false);
    assert.equal(invalidated.id, f.ids.source);
    assert.equal(feedRefreshes, 1);
    // Map panels stop bubbling to the document; these controls must use capture.
    assert.equal(captures.click, true);
    assert.equal(captures.submit, true);
});

test('articles without a Chinese block can also receive a named translation', async () => {
    const f = fixture();
    delete f.data.history[0].records.chinese;
    const { contribution:p } = await f.service.submit(f.auth('writer'), { ...f.input, targetType:'history', targetId:f.ids.history });
    assert.equal(p.originalContent, '기존 번역');
    await f.service.transition(p._id, f.auth('admin'), 'approve');
    assert.equal(f.data.history[0].translation.content, p.content);
    assert.equal(f.data.history[0].records.korean.content, '기존 번역');
});

test('batch counts distinguish pending proposals, history, source and unrelated contributions', async () => {
    const f = fixture();
    await submit(f);
    for (const extra of [
        { category:'history_translation', targetType:'source', targetId:f.ids.source, status:'reviewed' },
        { category:'history_translation', targetType:'source', targetId:f.ids.source, status:'approved' },
        { category:'history_translation', targetType:'history', targetId:f.ids.source, status:'pending' },
        { category:'historical_record', targetType:'source', targetId:f.ids.source, status:'pending' }
    ]) f.data.contributions.push(extra);
    const result = await f.service.counts({ targetType:'source', ids:`${f.ids.source},${f.ids.history}` });
    assert.deepEqual(result.counts[f.ids.source], { total:3, pending:2 });
    assert.deepEqual(result.counts[f.ids.history], { total:0, pending:0 });
    await assert.rejects(f.service.counts({ targetType:'source', ids:'invalid' }), { status:400 });
    await assert.rejects(f.service.counts({ targetType:'source', ids:Array.from({ length:41 }, (_, i) => String(i + 1).padStart(24, '0')).join(',') }), { status:400 });
});

function widgetFixture(recordId, type = 'source', badge = false) {
    const list = { innerHTML:'', querySelector:() => null,
        insertAdjacentHTML(_where, html) { this.innerHTML += html; } };
    const panel = { hidden:true, children:[],
        set innerHTML(value) { this.children = [value]; } };
    const toggle = { innerHTML:'', title:'', setAttribute(name, value) { this[name] = value; } };
    const parent = { tagName:'DETAILS', open:false, parentElement:null };
    const widget = {
        dataset:{ targetType:type, targetId:recordId }, isConnected:true, hidden:true,
        innerHTML:'', parentElement:parent,
        classList:{ contains:name => name === (badge ? 'history-translation-result-badge' : 'history-translations') },
        querySelector:selector => ({ '.history-translation-panel':panel, '.history-translation-toggle':toggle, '.history-translation-list':list }[selector])
    };
    return { widget, panel, toggle, list, parent };
}

test('only NEW proposals open automatically; approved-only articles and source groups stay closed', async () => {
    const pending = widgetFixture('one');
    const approved = widgetFixture('two');
    const empty = widgetFixture('empty');
    const badge = widgetFixture('one', 'source', true);
    const manual = widgetFixture('one');
    manual.widget.dataset.translationManuallyClosed = 'true';
    const disconnected = widgetFixture('one');
    disconnected.widget.isConnected = false;
    const records = [pending, approved, empty, badge, manual, disconnected];
    const requests = [];
    const context = {
        document:{ addEventListener() {}, querySelectorAll:() => [badge.widget] },
        window:{ addEventListener() {} }, URLSearchParams,
        fetch:async url => {
            requests.push(url);
            const approved = new URL(url, 'http://test').searchParams.get('targetId') === 'two';
            const data = url.includes('/counts?') ? { counts:{ one:{ total:3, pending:2 }, two:{ total:1, pending:0 } } }
                : { proposals:[{ _id:'proposal', username:'사관', content:'번역문', status:approved ? 'approved' : 'pending' }], total:approved ? 1 : 3, pending:approved ? 0 : 2, offset:0 };
            return { ok:true, json:async () => data };
        }, URL
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../public/assets/history-translations.js'), 'utf8'), context);
    context.window.HistoryTranslations.configure({ getUser:() => ({ username:'사관', role:'user' }) });
    const root = { querySelectorAll:() => records.map(record => record.widget) };
    await context.window.HistoryTranslations.hydrate(root);
    assert.match(pending.toggle.innerHTML, />3<.*NEW/);
    assert.equal(pending.panel.hidden, false);
    assert.equal(pending.toggle['aria-expanded'], 'true');
    assert.equal(pending.parent.open, true);
    assert.match(pending.list.innerHTML, /번역문/);
    assert.match(pending.panel.children[0], /새 번역 제안 작성/);
    assert.doesNotMatch(pending.panel.children[0], /<textarea|<form/);
    assert.match(approved.toggle.title, /번역 제안 1건/);
    assert.doesNotMatch(approved.toggle.innerHTML, /NEW/);
    assert.equal(approved.panel.hidden, true);
    assert.equal(approved.parent.open, false);
    assert.equal(empty.panel.hidden, true);
    assert.equal(manual.panel.hidden, true);
    assert.equal(disconnected.panel.hidden, true);
    assert.equal(badge.widget.hidden, false);
    assert.match(badge.widget.innerHTML, /NEW/);
    assert.equal(requests.length, 2); // One batch plus only the article with NEW proposals.
    await context.window.HistoryTranslations.hydrate(root);
    assert.equal(requests.length, 2);
});

test('proposal counters split large lists into batches of 40 without opening empty articles', async () => {
    const records = Array.from({ length:85 }, (_, i) => widgetFixture(String(i)));
    const requests = [];
    const context = {
        document:{ addEventListener() {} }, window:{ addEventListener() {} }, URLSearchParams,
        fetch:async url => { requests.push(url); return { ok:true, json:async () => ({ counts:{} }) }; }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../public/assets/history-translations.js'), 'utf8'), context);
    await context.window.HistoryTranslations.hydrate({ querySelectorAll:() => records.map(record => record.widget) });
    assert.deepEqual(requests.map(url => new URL(url, 'http://test').searchParams.get('ids').split(',').length), [40, 40, 5]);
    assert.ok(records.every(record => record.panel.hidden));
});

test('translation submit, review and approval publish attributed activity once per transition', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    await assert.rejects(submit(f), { status:409 });
    await f.service.transition(p._id, f.auth('reviewer'), 'review', '원문 대조 완료');
    await f.service.transition(p._id, f.auth('approver'), 'approve', '번역 승인');
    await f.service.transition(p._id, f.auth('approver'), 'approve');
    const logs = f.data.activityLogs;
    assert.deepEqual(logs.map(log => log.type), ['translation_submit', 'translation_review', 'translation_approve']);
    assert.deepEqual(logs.map(log => log.actor), ['번역사관', '검토사관', '승인사관']);
    assert.equal(logs[0].targetName, '고려 기사');
    assert.equal(logs[2].extra.translator, '번역사관');
    assert.equal(logs[2].extra.translator_id, f.ids.writer);
    assert.equal(logs[2].extra.record_id, f.ids.source);
    assert.equal(logs[2].extra.record_type, 'source');
    assert.equal(logs[2].extra.year, null);
    assert.equal(logs[2].extra.comment, '번역 승인');
    assert.equal(logs[2].extra.contribution_id, p._id);
});

test('rejected translations publish their reason, while failed and unauthorized approvals publish no news', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    await assert.rejects(f.service.transition(p._id, f.auth('other'), 'approve'), { status:403 });
    assert.equal(f.data.activityLogs.length, 1);
    await f.service.transition(p._id, f.auth('admin'), 'reject', '재번역 필요');
    assert.equal(f.data.activityLogs[1].type, 'translation_reject');
    assert.equal(f.data.activityLogs[1].extra.comment, '재번역 필요');
    assert.equal(f.data.sourceRecords[0].translation, undefined);
});

test('activity is committed atomically with the proposal, translation and merit', async () => {
    const f = fixture();
    f.failNextWrite('activityLogs');
    await assert.rejects(submit(f), /simulated write/);
    assert.equal(f.data.contributions.length, 0);
    assert.equal(f.data.users[0].totalCount, undefined);
    const { contribution:p } = await submit(f);
    f.failNextWrite('activityLogs');
    await assert.rejects(f.service.transition(p._id, f.auth('admin'), 'approve'), /simulated write/);
    assert.equal(f.data.activityLogs.length, 1);
    assert.equal(f.data.contributions[0].status, 'pending');
    assert.equal(f.data.sourceRecords[0].translation, undefined);
    assert.equal(f.data.users[0].approvedCount, undefined);
    await f.service.transition(p._id, f.auth('admin'), 'approve');
    assert.equal(f.data.activityLogs.length, 2);
});

test('authors can edit pending content and evidence without creating another submission', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    const content = `[[place:${f.ids.source}|개경]]의 수정 번역`;
    const result = await f.service.edit(p._id, f.auth('writer'), { revision:0, content, evidence:'수정 근거' });
    assert.equal(result.contribution._id, p._id);
    assert.equal(result.contribution.content, content);
    assert.equal(result.contribution.evidence, '수정 근거');
    assert.equal(result.contribution.revision, 1);
    assert.equal(f.data.contributions.length, 1);
    assert.equal(f.data.users[0].totalCount, 1);
    assert.equal(f.data.sourceRecords[0].translation, undefined);
    assert.equal(f.data.contributions[0].editHistory[0].content, p.content);
    assert.equal(f.data.activityLogs[1].type, 'translation_update');
    const unchanged = await f.service.edit(p._id, f.auth('writer'), { revision:1, content, evidence:'수정 근거' });
    assert.equal(unchanged.unchanged, true);
    assert.equal(f.data.activityLogs.length, 2);
});

test('only the author can retrieve and edit a translation, including when the caller is an administrator', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    assert.equal((await f.service.getOwn(p._id, f.auth('writer'))).content, p.content);
    for (const who of ['other', 'admin']) {
        await assert.rejects(f.service.getOwn(p._id, f.auth(who)), { status:403 });
        await assert.rejects(f.service.edit(p._id, f.auth(who), { revision:0, content:'무단 수정' }), { status:403 });
    }
    await assert.rejects(f.service.edit(p._id, { ...f.auth('writer'), isGuest:true }, { revision:0, content:'게스트' }), { status:403 });
    await assert.rejects(f.service.edit(p._id, f.auth('writer'), { content:'버전 없음' }), { status:400 });
    await assert.rejects(f.service.edit(p._id, f.auth('writer'), { revision:0, content:'' }), { status:400 });
    assert.equal(f.data.contributions[0].content, p.content);
});

test('editing reviewed or rejected translations clears the old decision and requires the latest revision for review', async () => {
    for (const action of ['review', 'reject']) {
        const f = fixture();
        const { contribution:p } = await submit(f);
        await f.service.transition(p._id, f.auth(action === 'review' ? 'reviewer' : 'admin'), action, '심사 의견');
        await f.service.edit(p._id, f.auth('writer'), { revision:0, content:'심사 의견을 반영한 번역' });
        const proposal = f.data.contributions[0];
        assert.equal(proposal.status, 'pending');
        assert.equal(proposal.reviewerId, null);
        assert.equal(proposal.approverId, null);
        assert.equal(proposal.reviewComment, null);
        assert.equal(proposal.rejectComment, null);
        await assert.rejects(f.service.transition(p._id, f.auth('admin'), 'approve', '', 0), { status:409 });
        await assert.rejects(f.service.transition(p._id, f.auth('admin'), 'approve'), { status:409 });
        await f.service.transition(p._id, f.auth('admin'), 'approve', '', 1);
        assert.equal(f.data.sourceRecords[0].translation.content, '심사 의견을 반영한 번역');
    }
});

test('editing an approved translation creates a new draft while preserving the published translation until approval', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    await f.service.transition(p._id, f.auth('admin'), 'approve');
    const result = await f.service.edit(p._id, f.auth('writer'), { revision:0, content:'승인본의 수정안', evidence:'새 자료' });
    const draft = result.contribution;
    assert.notEqual(draft._id, p._id);
    assert.equal(draft.revisionOf, p._id);
    assert.equal(draft.status, 'pending');
    assert.equal(f.data.contributions[0].status, 'approved');
    assert.equal(f.data.contributions[0].content, p.content);
    assert.equal(f.data.sourceRecords[0].translation.content, p.content);
    await assert.rejects(f.service.edit(p._id, f.auth('writer'), { revision:0, content:'중복 수정안' }), { status:409 });
    await f.service.transition(draft._id, f.auth('admin'), 'approve', '', 0);
    assert.equal(f.data.sourceRecords[0].translation.content, '승인본의 수정안');
    assert.equal(f.data.sourceRecords[0].translation.evidence, '새 자료');
    assert.equal(f.data.sourceRecords[0].translationHistory.length, 2);
});

test('stale edits and failed edit news writes cannot overwrite content or create partial changes', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    await f.service.edit(p._id, f.auth('writer'), { revision:0, content:'먼저 저장한 수정' });
    await assert.rejects(f.service.edit(p._id, f.auth('writer'), { revision:0, content:'늦게 도착한 수정' }), { status:409 });
    f.failNextWrite('activityLogs');
    await assert.rejects(f.service.edit(p._id, f.auth('writer'), { revision:1, content:'실패한 수정' }), /simulated write/);
    assert.equal(f.data.contributions[0].content, '먼저 저장한 수정');
    assert.equal(f.data.contributions[0].revision, 1);
    assert.equal(f.data.activityLogs.length, 2);
});

test('approved edit controls belong to the author and the private draft lookup includes authentication', async () => {
    const f = fixture();
    const { contribution:p } = await submit(f);
    p.status = 'approved';
    let click, editorOpened = false, authorization;
    const editButton = { click:() => { editorOpened = true; } };
    const entry = { tagName:'DETAILS', open:false, querySelector:() => editButton };
    const panel = { hidden:true, children:[{}] };
    const toggle = { setAttribute() {}, innerHTML:'' };
    const list = { innerHTML:'', querySelector:() => null, insertAdjacentHTML() {} };
    const widget = { dataset:{ targetType:'source', targetId:f.ids.source }, isConnected:true,
        classList:{ contains:() => false }, querySelector:selector => {
            if (selector.startsWith('[data-proposal-id=')) return entry;
            return { '.history-translation-panel':panel, '.history-translation-toggle':toggle, '.history-translation-list':list }[selector];
        } };
    const button = { dataset:{ translationAction:'edit-applied', editProposalId:p._id }, isConnected:true,
        classList:{ contains:() => false }, closest:() => widget };
    const context = vm.createContext({
        document:{ addEventListener(name, handler) { if (name === 'click') click = handler; }, querySelectorAll:() => [] },
        window:{ addEventListener() {} }, URLSearchParams,
        fetch:async (url, init) => {
            const data = url.endsWith(p._id) ? p : { proposals:[p], total:1, pending:0, offset:0 };
            if (url.endsWith(p._id)) authorization = init.headers.Authorization;
            return { ok:true, json:async () => data };
        }
    });
    vm.runInContext(fs.readFileSync(require.resolve('../public/assets/history-translations.js'), 'utf8'), context);
    const tools = context.window.HistoryTranslations;
    const record = { _id:f.ids.source, content:'原文', translation:{ content:p.content, contributionId:p._id, translator:p.username, translatorId:p.userId } };
    tools.configure({ getUser:() => f.data.users[0], getToken:() => 'writer-token' });
    assert.match(tools.markup(record, 'source'), /data-translation-action="edit-applied"/);
    await click({ target:{ closest:() => button }, stopPropagation() {} });
    assert.equal(authorization, 'Bearer writer-token');
    assert.equal(editorOpened, true);
    assert.equal(entry.open, true);
    tools.configure({ getUser:() => f.data.users[2] });
    assert.doesNotMatch(tools.markup(record, 'source'), /data-translation-action="edit-applied"/);
});
