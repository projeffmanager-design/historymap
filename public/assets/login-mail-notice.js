(() => {
    'use strict';
    // 로그인 페이지에서만 설정되는 값이므로 일반 새로고침에는 팝업을 반복하지 않는다.
    let loginNotice;
    try { loginNotice = JSON.parse(sessionStorage.getItem('_loginNotice') || 'null'); } catch (_) { return; }
    if (!loginNotice) return;

    async function init() {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) return;
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const [countResponse, mailResponse] = await Promise.all([
                fetch('/api/historian-notifications/unread-count', { headers }),
                fetch('/api/historian-messages?box=inbox&unread=1&limit=3', { headers })
            ]);
            if (!countResponse.ok || !mailResponse.ok) return;
            const count = await countResponse.json();
            const messages = await mailResponse.json();
            if (!count.mail || !messages.length) return;

            const style = document.createElement('style');
            style.textContent = `
                #login-mail-notice{position:fixed;right:18px;top:64px;z-index:2147483001;width:min(350px,calc(100vw - 32px));padding:16px;border:1px solid #bd9b51;border-radius:12px;background:#192027;color:#f3ead4;box-shadow:0 16px 44px #0009;font:13px/1.5 'Noto Sans KR',sans-serif}
                #login-mail-notice .mail-notice-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
                #login-mail-notice strong{color:#f3cf79;font-size:15px}
                #login-mail-notice .mail-notice-close{border:0;background:transparent;color:#ddd;font-size:22px;line-height:1;cursor:pointer}
                #login-mail-notice .mail-notice-item{padding:9px 0;border-top:1px solid #ffffff25}
                #login-mail-notice .mail-notice-item b{display:block;color:#f8e8bc}
                #login-mail-notice .mail-notice-item p{margin:3px 0 0;color:#c8cdd0;white-space:pre-wrap;overflow-wrap:anywhere}
                #login-mail-notice .mail-notice-open{display:block;width:100%;margin-top:10px;padding:9px;border:1px solid #bd9b51;border-radius:6px;background:#7d261d;color:#fff7e5;text-align:center;text-decoration:none;font-weight:700}
                @media(max-width:600px){#login-mail-notice{top:auto;bottom:16px;right:16px}}
            `;
            document.head.appendChild(style);
            const notice = document.createElement('aside');
            notice.id = 'login-mail-notice';
            notice.setAttribute('role', 'status');
            notice.setAttribute('aria-label', '읽지 않은 전서구');
            const head = document.createElement('div');
            head.className = 'mail-notice-head';
            const title = document.createElement('strong');
            title.textContent = `🕊️ 새 전서구 ${count.mail}통`;
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'mail-notice-close';
            close.setAttribute('aria-label', '전서구 알림 닫기');
            close.textContent = '×';
            close.addEventListener('click', () => notice.remove());
            head.append(title, close);
            notice.appendChild(head);
            for (const message of messages) {
                const item = document.createElement('div');
                item.className = 'mail-notice-item';
                const sender = document.createElement('b');
                sender.textContent = `${message.senderName || '사관'} 사관`;
                const excerpt = document.createElement('p');
                excerpt.textContent = String(message.body || '').slice(0, 95);
                item.append(sender, excerpt);
                notice.appendChild(item);
            }
            const open = document.createElement('a');
            open.className = 'mail-notice-open';
            open.href = '/mypage.html?tab=mail';
            open.textContent = '받은 전서구 보기';
            notice.appendChild(open);

            const canShow = () => ['firstLoginWelcome', 'newsletter-popup-overlay', 'welcomePopupModal'].every(id => {
                const element = document.getElementById(id);
                return !element || getComputedStyle(element).display === 'none';
            });
            const showWhenReady = () => {
                if (!canShow()) return;
                clearInterval(timer);
                document.body.appendChild(notice);
            };
            // 지도 진입 시 환영창·사관청 소식창이 잠시 뒤 열리므로 먼저 지나가게 한다.
            let timer;
            setTimeout(() => {
                timer = setInterval(showWhenReady, 500);
                showWhenReady();
            }, 2300);
        } finally {
            sessionStorage.removeItem('_loginNotice');
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { init().catch(() => {}); });
    else init().catch(() => {});
})();
