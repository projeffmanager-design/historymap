/* Apply optional layer defaults after map and independent layer modules have booted. */
(function () {
  'use strict';
  window.addEventListener('load', async () => {
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
