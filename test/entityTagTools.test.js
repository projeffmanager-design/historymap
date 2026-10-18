'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require.resolve('../public/assets/entity-tag-tools.js'), 'utf8');
const id = '1234567890abcdef12345678';
function context(clipboard = { writeText:async () => {} }) {
    const handlers = {};
    const ctx = vm.createContext({
        document:{ addEventListener(name, fn) { handlers[name] = fn; } },
        window:{}, navigator:{ clipboard }
    });
    vm.runInContext(script, ctx);
    return { ctx, tools:ctx.window.EntityTagTools, handlers };
}

test('translation entity tokens render as links while HTML and labels remain escaped once', () => {
    const { tools } = context();
    const html = tools.renderText(`<img src=x onerror=bad()> [[place:${id}|개경 & 왕도]]에서 [[person:${id}|왕건]]을 만났다.`);
    assert.match(html, /data-entity-type="place" data-entity-id="1234567890abcdef12345678"/);
    assert.match(html, /data-entity-type="person"/);
    assert.match(html, /개경 &amp; 왕도/);
    assert.doesNotMatch(html, /&amp;amp;|<img/);
    assert.match(html, /&lt;img/);
    assert.equal((html.match(/global-entity-token-link/g) || []).length, 2);
});

test('public detail controls expose the record ID and a ready-to-paste tag', () => {
    const { tools } = context();
    const container = { innerHTML:'', replaceChildren() { this.innerHTML = ''; } };
    tools.mount(container, 'place', id, '개경');
    assert.match(container.innerHTML, /ID 복사/);
    assert.match(container.innerHTML, /태그 복사/);
    assert.match(container.innerHTML, /\[\[place:1234567890abcdef12345678\|개경\]\]/);
    tools.mount(container, 'person', id, '왕건');
    assert.match(container.innerHTML, /\[\[person:1234567890abcdef12345678\|왕건\]\]/);
    tools.mount(container, 'person', '', '왕건');
    assert.equal(container.innerHTML, '');
});

test('ID and tag buttons copy different exact values without an administrator context', async () => {
    const copied = [];
    const { handlers } = context({ writeText:async value => copied.push(value) });
    const status = { textContent:'' };
    const tag = `[[person:${id}|왕건]]`;
    const row = { dataset:{ entityCopyId:id, entityCopyTag:tag }, querySelector:() => status };
    const button = { dataset:{ entityCopy:'id' }, closest:() => row };
    const event = { target:{ closest:() => button }, stopPropagation() {} };
    await handlers.click(event);
    button.dataset.entityCopy = 'tag';
    await handlers.click(event);
    assert.deepEqual(copied, [id, tag]);
    assert.match(status.textContent, /태그 복사 완료/);
});

test('approved translations and proposal bodies use the same entity token renderer', async () => {
    const { ctx, tools } = context();
    const handlers = {};
    ctx.document.addEventListener = (name, fn) => { handlers[name] = fn; };
    ctx.window.addEventListener = () => {};
    ctx.document.querySelectorAll = () => [];
    ctx.URLSearchParams = URLSearchParams;
    const tag = `[[place:${id}|개경]]`;
    ctx.fetch = async () => ({ ok:true, json:async () => ({ proposals:[{ _id:'proposal', username:'사관', content:tag, status:'pending' }], total:1, pending:1, offset:0 }) });
    vm.runInContext(fs.readFileSync(require.resolve('../public/assets/history-translations.js'), 'utf8'), ctx);
    const markup = ctx.window.HistoryTranslations.markup({ _id:id, content:'原文', translation:{ content:tag, translator:'사관' } }, 'source');
    assert.ok(markup.includes(tools.renderText(tag)));
    const list = { innerHTML:'', querySelector:() => null, insertAdjacentHTML(_where, html) { this.innerHTML += html; } };
    const panel = { hidden:true, children:[{}] };
    const button = { dataset:{}, isConnected:true, setAttribute() {}, classList:{ contains:() => true } };
    const widget = { dataset:{ targetType:'source', targetId:id }, isConnected:true, classList:{ contains:() => false },
        querySelector:selector => ({ '.history-translation-panel':panel, '.history-translation-toggle':button, '.history-translation-list':list }[selector]) };
    button.closest = () => widget;
    await handlers.click({ target:{ closest:() => button }, stopPropagation() {} });
    assert.match(list.innerHTML, /global-entity-token-link/);
    assert.match(list.innerHTML, /data-entity-type="place"/);
    assert.doesNotMatch(list.innerHTML, /\[\[place:/);
});

test('translation submission saves selected @ mentions as IDs and resets mention state after success', async () => {
    const { ctx } = context();
    const handlers = {};
    ctx.document.addEventListener = (name, fn) => { handlers[name] = fn; };
    ctx.document.querySelectorAll = () => [];
    ctx.window.addEventListener = () => {};
    let feedRefreshes = 0;
    ctx.window.refreshActivityFeed = () => { feedRefreshes++; };
    ctx.window.serializeEntityMentionsForField = () => `[[place:${id}|개경]]`;
    ctx.URLSearchParams = URLSearchParams;
    ctx.FormData = class { get(key) { return key === 'content' ? '@개경' : ''; } };
    ctx.Event = Event;
    const sent = [];
    ctx.fetch = async (url, init) => {
        if (init.method) sent.push(JSON.parse(init.body));
        return { ok:true, json:async () => init.method ? { message:'접수 완료' } : { proposals:[], total:0, pending:0, offset:0 } };
    };
    vm.runInContext(fs.readFileSync(require.resolve('../public/assets/history-translations.js'), 'utf8'), ctx);
    ctx.window.HistoryTranslations.configure({ getUser:() => ({ username:'일반사관', role:'user' }), getToken:() => 'token' });
    const message = { textContent:'' }, button = { disabled:false };
    let reset = false, mentionReset = false;
    const list = { innerHTML:'', querySelector:() => null, insertAdjacentHTML() {} };
    const slot = { hidden:false, innerHTML:'form' };
    const composeButton = { setAttribute(name, value) { this[name] = value; } };
    const saveNote = { textContent:'' };
    const panel = { querySelector:() => saveNote };
    const widget = { dataset:{ targetType:'source', targetId:id }, isConnected:true,
        classList:{ contains:() => false }, querySelector:selector => ({
            '.history-translation-list':list, '.history-translation-composer':slot,
            '.history-translation-panel':panel, '[data-translation-action="compose"]':composeButton
        }[selector]) };
    const form = { elements:{ content:{ dispatchEvent:event => { mentionReset = event.type === 'input'; } } },
        closest:() => widget, querySelector:selector => selector === '[type="submit"]' ? button : message,
        reset:() => { reset = true; } };
    await handlers.submit({ target:{ closest:() => form }, preventDefault() {}, stopPropagation() {} });
    assert.equal(sent[0].content, `[[place:${id}|개경]]`);
    assert.equal(reset, true);
    assert.equal(mentionReset, true);
    assert.equal(button.disabled, false);
    assert.equal(message.textContent, '접수 완료');
    assert.equal(slot.hidden, true);
    assert.equal(slot.innerHTML, '');
    assert.equal(composeButton['aria-expanded'], 'false');
    assert.equal(saveNote.textContent, '접수 완료');
    assert.equal(feedRefreshes, 1);
});
