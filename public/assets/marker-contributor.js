(function () {
    'use strict';
    const isAdmin = user => ['admin','superuser'].includes(user?.role);
    const get = id => document.getElementById(id);
    let markerId = '', originalName = '', originalMemberId = '', selected = null;
    let revision = 0, timer = null, controller = null, boundInput = null;
    const status = message => { const el = get('castleContributorStatus'); if (el) el.textContent = message; };
    function hideResults() {
        const results = get('castleContributorResults');
        if (results) results.style.display = 'none';
        get('castleCreatedByInput')?.setAttribute('aria-expanded','false');
    }
    function invalidate() {
        revision++;
        clearTimeout(timer);
        controller?.abort();
        controller = null;
        selected = null;
        const results = get('castleContributorResults');
        if (results) results.innerHTML = '';
        hideResults();
    }
    function clear() {
        invalidate();
        markerId = originalName = originalMemberId = '';
        const row = get('castleCreatedByRow'), input = get('castleCreatedByInput');
        if (row) row.style.display = 'none';
        if (input) { input.value = ''; input.disabled = true; }
        status('');
    }
    function selectMember(member) {
        selected = member;
        const input = get('castleCreatedByInput');
        input.value = member.username;
        get('castleContributorSelected').textContent = `선택한 회원: ${member.username}${member.displayName && member.displayName !== member.username ? ` (${member.displayName})` : ''}`;
        hideResults();
        status('저장 버튼을 누르면 선택한 회원으로 변경됩니다.');
        input.focus();
    }
    async function searchMembers(term, expectedRevision, expectedMarker) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) { status('관리자 로그인이 필요합니다.'); return; }
        controller = new AbortController();
        try {
            const response = await fetch(`/api/admin/contributor-members?q=${encodeURIComponent(term)}`, {
                headers:{ Authorization:`Bearer ${token}` }, cache:'no-store', signal:controller.signal
            });
            if (!response.ok) throw new Error('회원 검색에 실패했습니다. 로그인과 연결 상태를 확인해 주세요.');
            const members = await response.json();
            const input = get('castleCreatedByInput');
            if (revision !== expectedRevision || markerId !== expectedMarker || input.value.trim() !== term) return;
            if (!Array.isArray(members)) throw new Error('검색 결과를 불러오지 못했습니다.');
            const results = get('castleContributorResults');
            results.innerHTML = '';
            for (const member of members) {
                const row = document.createElement('div');
                row.setAttribute('role','option');
                row.tabIndex = 0;
                row.textContent = `${member.username}${member.displayName && member.displayName !== member.username ? ` (${member.displayName})` : ''}${member.position ? ` · ${member.position}` : ''}`;
                row.style.cssText = 'padding:8px;cursor:pointer;border-bottom:1px solid #3b4d5e;';
                const choose = () => {
                    if (revision === expectedRevision && markerId === expectedMarker && input.value.trim() === term) selectMember(member);
                };
                row.addEventListener('click',choose);
                row.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
                    if (event.key === 'Escape') { event.preventDefault(); hideResults(); input.focus(); }
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        const rows = Array.from(results.children), index = rows.indexOf(row);
                        rows[(index + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus();
                    }
                });
                results.appendChild(row);
            }
            results.style.display = members.length ? 'block' : 'none';
            input.setAttribute('aria-expanded',members.length ? 'true' : 'false');
            status(members.length ? `회원 ${members.length}명 검색됨${members.length === 20 ? ' · 최대 20명 표시' : ''}. 결과에서 선택해 주세요.` : '일치하는 회원이 없습니다.');
        } catch (error) {
            if (error.name === 'AbortError' || revision !== expectedRevision || markerId !== expectedMarker) return;
            hideResults();
            status(error.message || '회원 검색에 실패했습니다.');
        }
    }
    function bind(input) {
        if (boundInput === input) return;
        boundInput = input;
        input.addEventListener('input', () => {
            invalidate();
            if (input.disabled) return;
            const term = input.value.trim();
            get('castleContributorSelected').textContent = term === originalName ? `현재 기여자: ${originalName || '미지정'}` : '선택된 회원 없음';
            status(term ? '회원 검색 중…' : '회원 이름 또는 활동명을 입력한 뒤 검색 결과에서 선택해 주세요.');
            if (term) {
                const expectedRevision = revision, expectedMarker = markerId;
                timer = setTimeout(() => searchMembers(term,expectedRevision,expectedMarker),200);
            }
        });
        input.addEventListener('keydown', event => {
            const results = get('castleContributorResults');
            if (event.key === 'ArrowDown' && results.style.display !== 'none' && results.children.length) {
                event.preventDefault(); results.children[0].focus();
            }
            if (event.key === 'Escape') hideResults();
        });
        document.addEventListener('click', event => {
            const picker = get('castleContributorPicker');
            if (picker && !picker.contains(event.target)) hideResults();
        });
    }
    function populate(castle, user) {
        invalidate();
        const row = get('castleCreatedByRow'), display = get('castleCreatedByDisplay'), input = get('castleCreatedByInput');
        if (!row || !display || !input) return;
        markerId = String(castle._id);
        originalName = castle.createdBy || '';
        originalMemberId = String(castle.createdByUserId || '');
        const editable = isAdmin(user);
        display.textContent = originalName || '미지정';
        display.style.display = editable ? 'none' : '';
        input.value = originalName;
        input.disabled = !editable;
        get('castleContributorPicker').style.display = editable ? 'block' : 'none';
        get('castleContributorSelected').textContent = `현재 기여자: ${originalName || '미지정'}`;
        row.style.display = originalName || editable ? 'block' : 'none';
        status(editable ? '회원 이름 또는 활동명으로 검색한 뒤 결과에서 선택해 주세요.' : '');
        bind(input);
    }
    function apply(data, targetId, user) {
        const input = get('castleCreatedByInput');
        if (!targetId || !isAdmin(user) || !input || input.disabled || markerId !== String(targetId)) return null;
        if (!selected && input.value.trim() === originalName) return null;
        if (!selected || input.value.trim() !== selected.username) {
            input.focus();
            return '회원 검색 결과에서 기여자를 선택해 주세요.';
        }
        if (String(selected._id) !== originalMemberId || selected.username !== originalName) data.createdByUserId = String(selected._id);
        return null;
    }
    function syncDetail(castle) {
        if (!castle || String(window._currentDetailCastleId) !== String(castle._id)) return;
        const meta = get('odp-meta');
        if (!meta || !castle.createdBy) return;
        let label = meta.querySelector('[data-marker-contributor]');
        if (!label) {
            label = document.createElement('span');
            label.setAttribute('data-marker-contributor','');
            meta.appendChild(label);
        }
        label.textContent = `✍️ ${castle.createdBy}`;
    }
    window.markerContributorForm = { clear, populate, apply, syncDetail };
})();
