(function () {
    'use strict';

    const STYLE_ID = 'odp-marker-video-style';
    let activeMedia = null;
    let activeHost = null;
    let activeKind = null;
    let youtubePlayer = null;
    let youtubeApiPromise = null;
    let pendingUnmute = false;
    let wasFullscreen = false;

    function ensureYouTubeApi() {
        if (window.YT?.Player) return Promise.resolve(window.YT);
        if (youtubeApiPromise) return youtubeApiPromise;
        youtubeApiPromise = new Promise((resolve, reject) => {
            const previousReady = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                try { previousReady?.(); } finally { resolve(window.YT); }
            };
            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            script.onerror = () => reject(new Error('YouTube IFrame API를 불러오지 못했습니다.'));
            document.head.appendChild(script);
        });
        return youtubeApiPromise;
    }

    function onFullscreenChange() {
        const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
        const inYoutubePlayer = activeKind === 'youtube' && !!activeHost && !!fullscreenElement
            && activeHost.contains(fullscreenElement);
        if (!inYoutubePlayer) {
            wasFullscreen = false;
            window._markerVideoFullscreenActive = false;
            return;
        }
        if (wasFullscreen) return;
        wasFullscreen = true;
        window._markerVideoFullscreenActive = true;
        window._odpStopVoice?.();
        window.bgmPlayer?.pause?.();
        pendingUnmute = true;
        try { youtubePlayer?.unMute?.(); } catch (_) { /* 플레이어 준비 후 다시 시도 */ }
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    function parse(raw) {
        if (!raw || typeof raw !== 'string') return null;
        let url;
        try { url = new URL(raw.trim()); } catch (_) { return null; }
        if (!['https:', 'http:'].includes(url.protocol)) return null;
        const host = url.hostname.toLowerCase();
        const path = url.pathname;
        let id = '';
        if (host === 'youtu.be' || host === 'www.youtu.be') id = path.split('/')[1] || '';
        else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
            id = path === '/watch' ? url.searchParams.get('v') || '' : (/^\/(?:embed|shorts|live)\/([^/]+)/.exec(path)?.[1] || '');
        }
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
            return {
                kind: 'youtube',
                embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0`
            };
        }
        if (host === 'vimeo.com' || host === 'www.vimeo.com' || host === 'player.vimeo.com') {
            const vimeoId = /^\/(?:video\/)?(\d+)/.exec(path)?.[1];
            if (vimeoId) return {
                kind: 'vimeo',
                embed: `https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1`
            };
        }
        if (/\.(?:mp4|webm|og[gv])$/i.test(path)) return { kind: 'file', embed: url.href };
        return null;
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .odp-video-host{position:absolute;inset:0;z-index:1;background:#080d13}
            .odp-video-host iframe,.odp-video-host video{width:100%;height:100%;display:block;border:0;object-fit:contain;background:#080d13}
            .odp-hero:has(.odp-video-host) .odp-hero-gradient{pointer-events:none}
        `;
        document.head.appendChild(style);
    }

    function makeMedia(video) {
        if (video.kind === 'file') {
            const element = document.createElement('video');
            element.src = video.embed;
            element.controls = true;
            element.autoplay = true;
            element.muted = true;
            element.playsInline = true;
            element.preload = 'metadata';
            element.play().catch(() => {});
            return element;
        }
        const element = document.createElement('iframe');
        element.src = video.embed;
        if (video.kind === 'youtube') {
            const embedUrl = new URL(element.src);
            embedUrl.searchParams.set('enablejsapi', '1');
            embedUrl.searchParams.set('origin', window.location.origin);
            element.src = embedUrl.href;
        }
        element.title = '마커 관련 동영상';
        element.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        element.allowFullscreen = true;
        element.referrerPolicy = 'strict-origin-when-cross-origin';
        return element;
    }

    function clear() {
        try { youtubePlayer?.destroy?.(); } catch (_) { /* 이미 제거된 플레이어 */ }
        youtubePlayer = null;
        pendingUnmute = false;
        wasFullscreen = false;
        window._markerVideoFullscreenActive = false;
        if (activeMedia?.tagName === 'VIDEO') activeMedia.pause();
        activeHost?.remove();
        activeMedia = null;
        activeHost = null;
        activeKind = null;
    }

    function render(heroWrap, raw) {
        clear();
        const video = parse(raw);
        if (!heroWrap || !video) return false;
        ensureStyle();
        const host = document.createElement('div');
        host.className = 'odp-video-host';
        const media = makeMedia(video);
        host.appendChild(media);
        heroWrap.insertBefore(host, heroWrap.querySelector('.odp-hero-gradient'));
        activeHost = host;
        activeMedia = media;
        activeKind = video.kind;
        if (video.kind === 'youtube') {
            ensureYouTubeApi().then(YT => {
                if (activeMedia !== media || !YT?.Player) return;
                youtubePlayer = new YT.Player(media, {
                    events: {
                        onReady(event) {
                            if (activeMedia !== media) return;
                            youtubePlayer = event.target;
                            if (pendingUnmute) event.target.unMute();
                        }
                    }
                });
            }).catch(error => console.warn('[마커 영상] YouTube 제어 API 로드 실패:', error));
        }
        return true;
    }

    window.markerVideo = { parse, render, clear };
})();
