/* Apply optional layer defaults after map and independent layer modules have booted. */
(function () {
  'use strict';
  window.addEventListener('load', async () => {
    // 모바일 첫 화면은 기본 지도·지명·국가명·영토만 유지한다.
    // 특별한 모바일 표시 요청이 없는 한 국력/자원/영웅 자동 활성화를 추가하지 말 것.
    if (window.innerWidth <= 967 || window.innerHeight > window.innerWidth) return;
    try {
      const response = await fetch('/api/layer-settings', { cache: 'no-store' });
      if (!response.ok) return;
      const { settings = {} } = await response.json();
      if (settings.resourceBar === true && typeof window.toggleResourceBar === 'function') {
        window.toggleResourceBar(document.getElementById('btn-resource-bar'), true);
        const checkbox = document.getElementById('menu-layer-resource');
        if (checkbox) checkbox.checked = true;
      }
      if (settings.heroLayer === true && window.heroSystem?.toggleLayer) {
        const checkbox = document.getElementById('menu-layer-heroes');
        if (checkbox && !checkbox.checked) { checkbox.checked = true; window.heroSystem.toggleLayer(checkbox); }
      }
      if (settings.nationalPower === true) window.NationalPower?.toggle(true);
    } catch (error) {
      console.warn('추가 레이어 기본 설정을 적용하지 못했습니다.', error);
    }
  }, { once: true });
})();
