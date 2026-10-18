(() => {
    'use strict';
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[char]));
    function renderText(value) {
        const raw = String(value ?? '');
        let html = '', cursor = 0;
        for (const match of raw.matchAll(/\[\[(person|place|country|historian):([^|\]]+)\|([^\]]+)\]\]/g)) {
            const [, type, id, label] = match;
            html += esc(raw.slice(cursor, match.index));
            html += `<button type="button" class="history-${type}-link global-entity-token-link" data-entity-type="${type}" data-entity-id="${esc(id)}">${esc(label)}</button>`;
            cursor = match.index + match[0].length;
        }
        return html + esc(raw.slice(cursor));
    }
    function mount(container, type, id, name) {
        if (!container) return;
        container.replaceChildren();
        const recordId = String(id || '');
        if (!['place', 'person'].includes(type) || !/^[a-f\d]{24}$/i.test(recordId)) return;
        const label = String(name || (type === 'place' ? '지명' : '인물')).replace(/[|\]\r\n]/g, ' ').trim();
        const tag = `[[${type}:${recordId}|${label}]]`;
        container.innerHTML = `<div class="entity-tag-copy" data-entity-copy-id="${esc(recordId)}" data-entity-copy-tag="${esc(tag)}">
            <span class="entity-tag-id-label">ID</span><code>${esc(recordId)}</code>
            <button type="button" data-entity-copy="id">ID 복사</button><button type="button" data-entity-copy="tag">태그 복사</button>
            <span class="entity-tag-copy-status" role="status"></span></div>`;
    }
    document.addEventListener('click', async event => {
        const button = event.target.closest('[data-entity-copy]');
        const row = button?.closest('.entity-tag-copy');
        if (!row) return;
        event.stopPropagation();
        const value = button.dataset.entityCopy === 'id' ? row.dataset.entityCopyId : row.dataset.entityCopyTag;
        const status = row.querySelector('[role="status"]');
        try {
            await navigator.clipboard.writeText(value);
            status.textContent = button.dataset.entityCopy === 'id' ? 'ID 복사 완료' : '태그 복사 완료 · 번역문에 붙여넣으세요.';
        } catch (_) {
            let fallback = row.querySelector('input');
            if (!fallback) {
                fallback = document.createElement('input');
                fallback.readOnly = true;
                fallback.setAttribute('aria-label', '직접 복사할 ID 또는 태그');
                row.appendChild(fallback);
            }
            fallback.value = value;
            fallback.focus();
            fallback.select();
            status.textContent = '선택된 내용을 직접 복사해 주세요.';
        }
    }, true);
    window.EntityTagTools = { renderText, mount };
})();
