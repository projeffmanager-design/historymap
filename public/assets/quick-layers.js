(() => {
    'use strict';
    const categories = [
        { title: '지도 기본', icon: '▧', layers: [
            ['menu-layer-territory', '영토', '▧'], ['menu-layer-city', '성/도시', '⌂'],
            ['menu-layer-country-label', '국가명', '文'], ['menu-layer-admin-label', '행정구역명', '▤'],
            ['menu-layer-place-label', '지명', '⌖']
        ] },
        { title: '사람·군사', icon: '♙', layers: [
            ['menu-layer-ethnic-label', '민족', '♟'], ['menu-layer-military', '군대', '⚑'],
            ['menu-layer-heroes', '영웅', '♛'], ['menu-layer-pop-heat', '영토 인구', '●']
        ] },
        { title: '지형·자료', icon: '◇', layers: [
            ['menu-layer-natural', '자연', '△'], ['menu-layer-rivers', '강', '≈'],
            ['menu-layer-relic', '유적', '◇'], ['menu-layer-resource', '자원', '⚒'],
            ['menu-layer-water-level', '고환경', '◍'], ['menu-layer-eclipse', '일식', '◐']
        ] },
        { title: '기록·패널', icon: '☷', layers: [
            ['menu-layer-event', '이벤트 알림', '▣'], ['menu-layer-timeline', '연대표', '━'],
            ['menu-layer-king', '왕 패널', '♛'], ['menu-layer-history', '역사 패널', '▤'],
            ['menu-layer-contributions', '사관 사료', '✎'], ['menu-layer-ranking', '사관 랭킹', '★'],
            ['menu-layer-activity-feed', '활동 소식', '◉'], ['menu-layer-caption', '역사 자막', '▰']
        ] }
    ];
    const layerIds = new Set(categories.flatMap(category => category.layers.map(layer => layer[0])));

    function init() {
        if (document.getElementById('quick-layer-control')) return;
        const control = document.createElement('div');
        control.id = 'quick-layer-control';
        control.innerHTML = `<button id="quick-layer-launcher" type="button" aria-label="레이어 열기" aria-expanded="false" aria-controls="quick-layer-panel" title="레이어"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 15l9 5 9-5"/></svg></button><div id="quick-layer-panel" hidden><div class="quick-layer-heading">표시 레이어</div>${categories.map(category => `<details class="quick-layer-category"><summary><span class="quick-layer-category-icon" aria-hidden="true">${category.icon}</span>${category.title}<span class="quick-layer-category-count"></span></summary><div class="quick-layer-options">${category.layers.map(([id, label, icon]) => `<button type="button" data-checkbox="${id}" aria-pressed="false" title="${label} 표시 전환"><span class="quick-layer-symbol" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')}</div></details>`).join('')}</div>`;
        const coordButton = document.getElementById('coord-goto-wrap');
        if (!coordButton) return;
        coordButton.insertAdjacentElement('afterend', control);
        const launcher = control.querySelector('#quick-layer-launcher');
        const panel = control.querySelector('#quick-layer-panel');
        document.body.appendChild(panel);
        const position = () => {
            const rect = launcher.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const panelWidth = panel.offsetWidth || 208;
            panel.style.left = `${Math.max(8, Math.min(Math.round(rect.left), window.innerWidth - panelWidth - 8))}px`;
            panel.style.top = `${Math.round(rect.bottom + 8)}px`;
            panel.style.maxHeight = `${Math.max(120, Math.round(window.innerHeight - rect.bottom - 16))}px`;
        };
        const sync = () => {
            for (const button of panel.querySelectorAll('[data-checkbox]')) {
                const input = document.getElementById(button.dataset.checkbox);
                button.setAttribute('aria-pressed', input?.checked ? 'true' : 'false');
            }
            for (const category of panel.querySelectorAll('.quick-layer-category')) {
                const buttons = [...category.querySelectorAll('[data-checkbox]')];
                const count = buttons.filter(button => button.getAttribute('aria-pressed') === 'true').length;
                category.querySelector('.quick-layer-category-count').textContent = `${count}/${buttons.length}`;
            }
        };
        const close = () => {
            panel.hidden = true;
            launcher.setAttribute('aria-expanded', 'false');
            launcher.setAttribute('aria-label', '레이어 열기');
        };
        launcher.addEventListener('click', () => {
            panel.hidden = !panel.hidden;
            launcher.setAttribute('aria-expanded', String(!panel.hidden));
            launcher.setAttribute('aria-label', panel.hidden ? '레이어 열기' : '레이어 닫기');
            position();
            sync();
        });
        panel.addEventListener('click', event => {
            const button = event.target.closest('[data-checkbox]');
            if (!button) return;
            document.getElementById(button.dataset.checkbox)?.click();
            sync();
        });
        panel.addEventListener('toggle', event => {
            if (!event.target.open || !event.target.classList?.contains('quick-layer-category')) return;
            for (const category of panel.querySelectorAll('.quick-layer-category')) {
                if (category !== event.target) category.open = false;
            }
        }, true);
        document.addEventListener('change', event => {
            if (layerIds.has(event.target.id)) sync();
        });
        document.addEventListener('pointerdown', event => {
            if (!control.contains(event.target) && !panel.contains(event.target)) close();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') close();
        });
        window.addEventListener('resize', position, { passive: true });
        position();
        sync();
        // 저장된 레이어 설정은 비동기로 적용되므로 열린 동안 상태를 재확인한다.
        setInterval(() => { if (!panel.hidden) { position(); sync(); } }, 500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
