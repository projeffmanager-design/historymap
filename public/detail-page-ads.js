(function renderDetailPageAd() {
  var provider = 'google';
  window.KOREA_MAP_AD_PROVIDER = provider;

  // 상세 문서에도 AdSense 공통 로더를 한 번만 등록한다.
  if (!document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')) {
    var adsenseLoader = document.createElement('script');
    adsenseLoader.async = true;
    adsenseLoader.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6821586098117394';
    adsenseLoader.crossOrigin = 'anonymous';
    document.head.appendChild(adsenseLoader);
  }

  function mountAd() {
    // Kakao 슬롯과 로더는 롤백을 위해 아래에 보존하되 현재 제공자가 아니면 실행하지 않는다.
    if (provider !== 'kakao') return;
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
