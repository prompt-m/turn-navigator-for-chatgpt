// == ChatGPT Turn Navigator – FINAL COMPLETE VERSION (Sibling Traversal Logic) ==
(function() {
    'use strict';

    if (document.getElementById('cgpt-nav')) return;

    const CG = window.CGTN;

    const DEFAULTS = {
        centerBias: 0.40,
        headerPx: 0,
        lockMs: 700,
        eps: 20,
        panel: {
            x: null,
            y: null
        },
        hotkeys: {
            enabled: true,
            targetRole: 'assistant',
            modifier: 'Alt',
            allowInInputs: false,
            keys: {
                prev: 'ArrowUp',
                next: 'ArrowDown',
                top: 'Home',
                bottom: 'End',
                roleUser: 'Digit1',
                roleAssistant: 'Digit2',
                roleAll: 'Digit3'
            }
        }
    };
    let CFG = structuredClone(DEFAULTS);

    let TRUE_SCROLLER = null;

    function getTrueScroller() {
        if (TRUE_SCROLLER && document.body.contains(TRUE_SCROLLER)) return TRUE_SCROLLER;
        const isScrollable = (el) => {
            if (!el) return false;
            const style = getComputedStyle(el);
            return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
        };
        const firstArticle = document.querySelector('div[data-testid^="conversation-turn-"], article');
        if (firstArticle) {
            for (let el = firstArticle.parentElement; el && el !== document.body; el = el.parentElement) {
                if (isScrollable(el)) {
                    TRUE_SCROLLER = el;
                    return el;
                }
            }
        }
        TRUE_SCROLLER = document.scrollingElement || document.documentElement;
        return TRUE_SCROLLER;
    }

    const TURN_SELECTORS = 'div[data-testid^="conversation-turn-"], article';
    const isTurnElement = (el) => el?.matches(TURN_SELECTORS);

    function headNodeOf(article) {
        if (article.querySelector('[data-message-author-role="assistant"]')) {
            const assistantNode = article.querySelector('div.text-base, div.markdown');
            if (assistantNode) return assistantNode;
        }
        if (article.querySelector('[data-message-author-role="user"]')) {
            const userNode = article.querySelector('div.items-end');
            if (userNode) return userNode;
        }
        return article;
    }

    CG.installHotkey();

    const I18N = {
        ja: {
            user: 'ユーザー',
            assistant: 'アシスタント',
            all: '全体',
            top: '先頭',
            prev: '前へ',
            next: '次へ',
            bottom: '末尾',
            langBtn: 'English',
            dragTitle: 'ドラッグで移動'
        },
        en: {
            user: 'User',
            assistant: 'Assistant',
            all: 'All',
            top: 'Top',
            prev: 'Prev',
            next: 'Next',
            bottom: 'Bottom',
            langBtn: '日本語',
            dragTitle: 'Drag to move'
        }
    };
    let LANG = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';

    function deepMerge(dst, src) {
        for (const k in src) {
            if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
                dst[k] = deepMerge(dst[k] || {}, src[k]);
            } else {
                dst[k] = src[k];
            }
        }
        return dst;
    }

    function loadSettings(cb) {
        try {
            chrome?.storage?.sync?.get?.('cgNavSettings', ({
                cgNavSettings
            }) => {
                CFG = deepMerge(structuredClone(DEFAULTS), cgNavSettings || {});
                cb?.();
            });
        } catch {
            cb?.();
        }
    }

    function saveSettingsPatch(patch) {
        loadSettings(() => {
            deepMerge(CFG, patch);
            try {
                chrome?.storage?.sync?.set?.({
                    cgNavSettings: CFG
                });
            } catch {}
        });
    }

    (function injectCss(css) {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }) (`#cgpt-nav{position:fixed;right:12px;bottom:140px;display:flex;flex-direction:column;gap:12px;z-index:2147483647;touch-action:none}#cgpt-drag{width:92px;height:12px;cursor:grab;border-radius:10px;background:linear-gradient(90deg, #aaa 20%, #ccc 50%, #aaa 80%);opacity:.55;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}#cgpt-drag:active{cursor:grabbing}.cgpt-nav-group{position:relative;width:92px;border-radius:14px;padding:10px;border:1px solid rgba(0,0,0,.12);background:linear-gradient(0deg,var(--role-tint,transparent),var(--role-tint,transparent)),rgba(255,255,255,.95);box-shadow:0 6px 24px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:6px;align-items:stretch}.cgpt-nav-group[data-role="user"]{--role-tint:rgba(88,133,255,.12)}.cgpt-nav-group[data-role="assistant"]{--role-tint:rgba(64,200,150,.14)}.cgpt-nav-group[data-role="all"]{--role-tint:rgba(128,128,128,.08)}.cgpt-nav-label{text-align:center;font-weight:600;opacity:.9;margin-bottom:2px;font-size:12px}#cgpt-nav button{all:unset;height:34px;border-radius:10px;font:12px/1.1 system-ui,-apple-system,sans-serif;display:grid;place-items:center;cursor:pointer;user-select:none;background:#f2f2f7;color:#111;border:1px solid rgba(0,0,0,.08);transition:background .15s ease,transform .03s ease}#cgpt-nav button:hover{background:#fff}#cgpt-nav button:active{transform:translateY(1px)}.cgpt-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}#cgpt-nav .cgpt-lang-btn{height:28px;margin-top:4px}@media (prefers-color-scheme:dark){.cgpt-nav-group{border-color:#3a3a3f;background:linear-gradient(0deg,var(--role-tint,transparent),var(--role-tint,transparent)),#2a2a2d}#cgpt-nav button{background:#3a3a40;color:#e7e7ea;border-color:#3a3a3f}#cgpt-nav button:hover{background:#4a4a52}}`);

    const box = document.createElement('div');
    box.id = 'cgpt-nav';
    box.innerHTML = `<div id="cgpt-drag" title=""></div><div class="cgpt-nav-group" data-role="user"><div class="cgpt-nav-label" data-i18n="user"></div><button data-act="top" data-i18n="top"></button><button data-act="prev" data-i18n="prev"></button><button data-act="next" data-i18n="next"></button><button data-act="bottom" data-i18n="bottom"></button></div><div class="cgpt-nav-group" data-role="assistant"><div class="cgpt-nav-label" data-i18n="assistant"></div><button data-act="top" data-i18n="top"></button><button data-act="prev" data-i18n="prev"></button><button data-act="next" data-i18n="next"></button><button data-act="bottom" data-i18n="bottom"></button></div><div class="cgpt-nav-group" data-role="all"><div class="cgpt-nav-label" data-i18n="all"></div><div class="cgpt-grid2"><button data-act="top">▲</button><button data-act="bottom">▼</button></div><button class="cgpt-lang-btn"></button></div>`;
    document.body.appendChild(box);

    function applyLang() {
        const t = I18N[LANG] || I18N.ja;
        box.querySelectorAll('[data-i18n]').forEach(el => {
            const k = el.getAttribute('data-i18n');
            if (t[k]) el.textContent = t[k];
        });
        box.querySelector('#cgpt-drag').title = t.dragTitle;
        box.querySelector('.cgpt-lang-btn').textContent = t.langBtn;
    }
    (function enableDragging() {
        const grip = box.querySelector('#cgpt-drag');
        let dragging = false,
            offX = 0,
            offY = 0;

        function onDown(e) {
            dragging = true;
            const r = box.getBoundingClientRect();
            offX = e.clientX - r.left;
            offY = e.clientY - r.top;
            grip.setPointerCapture(e.pointerId);
        }

        function onMove(e) {
            if (!dragging) return;
            box.style.left = `${e.clientX - offX}px`;
            box.style.top = `${e.clientY - offY}px`;
        }

        function onUp(e) {
            if (!dragging) return;
            dragging = false;
            grip.releasePointerCapture(e.pointerId);
            const r = box.getBoundingClientRect();
            saveSettingsPatch({
                panel: {
                    x: r.left,
                    y: r.top
                }
            });
        }
        grip.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove, {
            passive: true
        });
        window.addEventListener('pointerup', onUp);
    })();

    let programmaticScrollLock = 0;
    const isLocked = () => performance.now() < programmaticScrollLock;

    function lockFor(ms) {
        programmaticScrollLock = performance.now() + ms;
    }

    function pickAllArticles() {
        return Array.from(document.querySelectorAll(TURN_SELECTORS)).filter(a => {
            const r = a.getBoundingClientRect();
            return r.height > 10 && getComputedStyle(a).display !== 'none';
        });
    }

    function pickArticlesByRole(role, allArticles) {
        return allArticles.filter(article => article.querySelector(`[data-message-author-role="${role}"]`));
    }

    const state = {
        all: [],
        user: [],
        assistant: []
    };

    function currentAnchor() {
        const vh = window.innerHeight;
        return Math.round(vh * CFG.centerBias - CFG.headerPx);
    }

    function scrollToHead(article) {
        if (!article) return;
        lockFor(CFG.lockMs);
        const scroller = getTrueScroller();
        const nodeToAlign = headNodeOf(article);
        const rect = nodeToAlign.getBoundingClientRect();
        const anchor = currentAnchor();
        const scrollerRect = scroller.getBoundingClientRect();
        const desiredScrollTop = scroller.scrollTop + (rect.top - scrollerRect.top) - anchor;
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const clampedTop = Math.min(maxScroll, Math.max(0, Math.round(desiredScrollTop)));
        scroller.scrollTo({
            top: clampedTop,
            behavior: 'smooth'
        });
    }

    function makeNav(role) {
        const getList = () => state[role];
        const scrollToAbsoluteBottom = () => {
            const s = getTrueScroller();
            s.scrollTo({
                top: s.scrollHeight,
                behavior: 'smooth'
            });
        };

        const findCurrentArticle = (list) => {
            if (!list.length) return null;
            const yStar = currentAnchor();
            let current = list[0];
            let minDiff = Infinity;
            for (const article of list) {
                const diff = Math.abs(headNodeOf(article).getBoundingClientRect().top - yStar);
                if (diff < minDiff) {
                    minDiff = diff;
                    current = article;
                }
            }
            return current;
        };

        return {
            goTop() {
                const L = getList();
                if (L.length) scrollToHead(L[0]);
            },
            goBottom() {
                const L = getList();
                if (role === 'all' && L.length) {
                    scrollToAbsoluteBottom();
                } else if (L.length) {
                    scrollToHead(L[L.length - 1]);
                }
            },
            goPrev() {
                const L = getList();
                if (!L.length) return;
                const current = findCurrentArticle(L);
                let prevSibling = current?.previousElementSibling;
                while (prevSibling) {
                    if (isTurnElement(prevSibling) && (role === 'all' || pickArticlesByRole(role, [prevSibling]).length > 0)) {
                        scrollToHead(prevSibling);
                        return;
                    }
                    prevSibling = prevSibling.previousElementSibling;
                }
            },
            goNext() {
                const L = getList();
                if (!L.length) return;
                const current = findCurrentArticle(L);
                let nextSibling = current?.nextElementSibling;
                while (nextSibling) {
                    if (isTurnElement(nextSibling) && (role === 'all' || pickArticlesByRole(role, [nextSibling]).length > 0)) {
                        scrollToHead(nextSibling);
                        return;
                    }
                    nextSibling = nextSibling.nextElementSibling;
                }
            }
        };
    }
    const nav = {
        user: makeNav('user'),
        assistant: makeNav('assistant'),
        all: makeNav('all')
    };

    let currentScrollerForListener = null;

    function rebuild() {
        TRUE_SCROLLER = getTrueScroller();
        state.all = pickAllArticles();
        state.user = pickArticlesByRole('user', state.all);
        state.assistant = pickArticlesByRole('assistant', state.all);

        if (currentScrollerForListener !== TRUE_SCROLLER) {
            if (currentScrollerForListener) currentScrollerForListener.removeEventListener('scroll', rebuild);
            TRUE_SCROLLER.addEventListener('scroll', rebuild, {
                passive: true
            });
            currentScrollerForListener = TRUE_SCROLLER;
        }
    }

    box.addEventListener('click', (e) => {
        const langBtn = e.target.closest('.cgpt-lang-btn');
        if (langBtn) {
            LANG = (LANG === 'ja' ? 'en' : 'ja');
            applyLang();
            return;
        }
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        const role = btn.closest('.cgpt-nav-group')?.dataset.role;
        const methodName = `go${act.charAt(0).toUpperCase() + act.slice(1)}`;
        nav[role]?.[methodName]?.();
    });

    const mo = new MutationObserver(() => rebuild());

    function initialize() {
        loadSettings(() => {
            const {
                x,
                y
            } = CFG.panel || {};
            if (Number.isFinite(x) && Number.isFinite(y)) {
                box.style.left = x + 'px';
                box.style.top = y + 'px';
            }
            applyLang();
            rebuild();
            mo.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: false
            });
        });
    }

    setTimeout(initialize, 2000);
})();