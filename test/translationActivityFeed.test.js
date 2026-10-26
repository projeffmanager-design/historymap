'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const feed = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.f32040ea8c66.js'), 'utf8');
function messages() {
    const context = vm.createContext({ window:{} });
    vm.runInContext(feed.slice(feed.indexOf('    function e('), feed.indexOf('    function _isAdminUser(')), context);
    return context.buildMessage;
}
const log = {
    actor:'승인사관', targetName:'원사 기사',
    extra:{ category:'history_translation', record_type:'source', record_id:'article', year:null,
        translator:'번역사관', translator_id:'writer', comment:'원문 대조 완료' }
};
test('translation feed wording distinguishes proposals, review, approval and rejection', () => {
    const render = messages();
    assert.match(render({ ...log, type:'translation_submit' }), /번역을 제안/);
    assert.match(render({ ...log, type:'translation_update' }), /번역 수정안을 제출/);
    assert.match(render({ ...log, type:'translation_review' }), /번역 검토를 완료/);
    const approval = render({ ...log, type:'translation_approve' });
    assert.match(approval, /승인사관/);
    assert.match(approval, /번역사관/);
    assert.match(approval, /승인·적용/);
    assert.doesNotMatch(approval, /복원에 성공/);
    assert.match(approval, /mypage.html\?id=writer/);
    assert.match(approval, /af-history-link/);
    assert.match(approval, /data-record-year=""/);
    assert.match(render({ ...log, type:'translation_reject' }), /반려/);
    assert.match(render({ ...log, type:'translation_reject' }), /원문 대조 완료/);
});
test('feed author, title and translation reviewer names cannot inject HTML', () => {
    const html = messages()({ ...log, type:'translation_approve', actor:'<img src=x>', targetName:'" onclick="bad()',
        extra:{ ...log.extra, translator:'<script>bad()</script>' } });
    assert.doesNotMatch(html, /<img|<script|title="" onclick=/);
    assert.match(html, /&lt;script&gt;/);
});
test('clicking a translation activity title opens the exact article and preserves an unknown date', () => {
    let click, opened;
    const context = vm.createContext({
        feedScroll:{ addEventListener(_name, handler) { click = handler; } },
        window:{ openLinkedHistoryRecord:record => { opened = record; } }
    });
    const start = feed.indexOf('        if (feedScroll) {');
    const end = feed.indexOf('        async function _openFeedMarker', start);
    vm.runInContext(feed.slice(start, end), context);
    const link = { dataset:{ recordId:'article', recordType:'source', recordYear:'', recordMonth:'' }, textContent:'원사 기사' };
    click({ target:{ closest:selector => selector === '.af-history-link' ? link : null }, stopPropagation() {} });
    assert.equal(opened.id, 'article');
    assert.equal(opened.type, 'source');
    assert.equal(opened.year, null);
    assert.equal(opened.title, '원사 기사');
});
