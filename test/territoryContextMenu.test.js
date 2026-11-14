'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'), 'utf8');
const start = source.indexOf("    map.on('contextmenu', (e) => {");
const end = source.indexOf('    // 🚩 [추가] 마커 타입 선택기 이벤트 리스너', start);
assert.ok(start >= 0 && end > start);

function popupFor(role, editMode = false) {
    let handler, content;
    const calls = [];
    const context = vm.createContext({
        currentUser: role ? { role } : null, editMode,
        document: { createElement: () => ({ style: {}, children: [], appendChild(child) { this.children.push(child); } }) },
        map: { on(_event, callback) { handler = callback; }, closePopup: () => calls.push('close') },
        L: { popup() { return { setLatLng() { return this; }, setContent(value) { content = value; return this; }, openOn() {} }; } },
        setEditModeState: state => calls.push({ editMode: state }),
        window: { openTerritoryGeomEditAt: point => calls.push({ point: { ...point } }) }
    });
    vm.runInContext(source.slice(start, end), context);
    handler({ latlng: { lat: 35.674499, lng: 119.558415 } });
    return { context, calls, button: content.children.find(button => button.innerText === '🧭 이 영토 경계 편집') };
}

test('territory edit is offered to admins and superusers, including outside edit mode', () => {
    for (const role of ['admin', 'superuser']) for (const editing of [false, true]) {
        const { button, calls } = popupFor(role, editing);
        assert.ok(button);
        button.onclick();
        assert.equal(calls[0], 'close');
        if (!editing) assert.deepEqual(calls[1], { editMode: true });
        assert.deepEqual(calls.at(-1), { point: { lat: 35.674499, lng: 119.558415 } });
    }
});

test('territory edit is absent for regular users, guests and signed-out visitors', () => {
    for (const role of ['user', 'guest', null]) assert.equal(popupFor(role).button, undefined);
});

test('a stale admin menu cannot start an edit after the user loses admin status', () => {
    const { context, button, calls } = popupFor('admin');
    context.currentUser = { role: 'user' };
    button.onclick();
    assert.deepEqual(calls, []);
});
