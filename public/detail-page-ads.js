(function renderDetailPageAd() {
  function mountAd() {
    var main = document.querySelector('main');
    if (!main || document.getElementById('detail-page-ads')) return;

    var section = document.createElement('section');
    section.id = 'detail-page-ads';
    section.setAttribute('aria-label', '광고');
    section.style.cssText = [
      'width:728px',
      'max-width:calc(100% - 40px)',
      'min-height:90px',
      'margin:48px auto 40px',
      'padding-top:32px',
      'border-top:1px solid rgba(93,113,133,0.4)',
      'overflow:hidden',
      'text-align:center'
    ].join(';');
    section.innerHTML = [
      '<div style="margin-bottom:8px;color:#738496;font-size:9px;line-height:1;letter-spacing:1px;">AD</div>',
      '<ins class="kakao_ad_area" style="display:none;" data-ad-unit="DAN-HzZDhbewYpSJ34JH" data-ad-width="728" data-ad-height="90"></ins>'
    ].join('');
    main.appendChild(section);

    if (!document.querySelector('script[data-kakao-adfit-loader]')) {
      var loader = document.createElement('script');
      loader.async = true;
      loader.charset = 'utf-8';
      loader.src = 'https://t1.kakaocdn.net/kas/static/ba.min.js';
      loader.setAttribute('data-kakao-adfit-loader', 'true');
      document.body.appendChild(loader);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAd, { once: true });
  } else {
    mountAd();
  }
})();
