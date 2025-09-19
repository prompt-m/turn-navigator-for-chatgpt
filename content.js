// == ChatGPT Turn Navigator – GENIE FIX (stable, index-based, PRIMARY coords) ==
(function () {
  'use strict';

  if (document.getElementById('cgpt-nav')) return;

  const CG = window.CGTN;

  const DEFAULTS = {
    centerBias: 0.40,
    headerPx: 0,
    lockMs: 700,
    eps: 20,
    panel: { x: null, y: null },
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

  // ---------------- Scroller / Turn pickup ----------------
  let TRUE_SCROLLER = null;
  const TURN_SELECTORS = 'div[data-testid^="conversation-turn-"]';

  function getTrueScroller() {
    if (TRUE_SCROLLER && document.body.contains(TRUE_SCROLLER)) return TRUE_SCROLLER;
    const isScrollable = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight;
    };
    let firstArticle = document.querySelector(TURN_SELECTORS)
                    || document.querySelector('[data-message-author-role]');
    if (firstArticle) {
      for (let el = firstArticle.parentElement; el && el !== document.body; el = el.parentElement) {
        if (isScrollable(el)) { TRUE_SCROLLER = el; return el; }
      }
    }
    TRUE_SCROLLER = document.scrollingElement || document.documentElement;
    return TRUE_SCROLLER;
  }

  // 可視・面積>0
  function isVisible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function pickAllArticles() {
    let list = Array.from(document.querySelectorAll(TURN_SELECTORS));
    if (!list.length) {
      // UI変更フォールバック：roleノードから親ターンを引く、なければ自分
      const seen = new Set();
      const nodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
      list = nodes.map(n => n.closest(TURN_SELECTORS) || n)
                  .filter(el => el && !seen.has(el) && (seen.add(el), true));
    }
    return list.filter(a => {
      const r = a.getBoundingClientRect();
      return r.height > 10 && getComputedStyle(a).display !== 'none';
    });
  }

  function pickArticlesByRole(role, all) {
    const sel = `[data-message-author-role="${role}"]`;
    return all.filter(a => a.matches(sel) || a.querySelector(sel)); // 自分or子孫の両方を拾う
  }

  // ---------------- Anchor / Geometry ----------------
  function currentAnchor() {
    const ret = CG?.computeAnchor?.(CFG);
    if (ret && Number.isFinite(ret.y)) return ret.y;
    // sharedが無い場合でも viewport 基準で固定（①composer高さの影響排除）
    return Math.round(window.innerHeight * CFG.centerBias - CFG.headerPx);
  }

  function headNodeOf(article) {
    const pick = (sel) => {
      const n = article.querySelector(sel);
      return n && isVisible(n) ? n : null;
    };
    const isAssistant = article.matches('[data-message-author-role="assistant"]')
                      || !!article.querySelector('[data-message-author-role="assistant"]');
    const isUser      = article.matches('[data-message-author-role="user"]')
                      || !!article.querySelector('[data-message-author-role="user"]');

    if (isAssistant) {
      // アシスタント：markdown本文を最優先（②浅掴み対策）
      return pick('div.markdown')
          || pick('div.text-base')
          || pick('div.prose')
          || pick('article > div')
          || article;
    }
    if (isUser) {
      // ユーザー：外枠でなく“内側バブル”
      return pick('div.text-token-text-primary')
          || pick('div[class*="message-bubble"]')
          || pick('div.items-end > div')
          || pick('div.items-end')
          || article;
    }
    return article;
  }

  // PRIMARY座標で記事先頭の絶対Y（③の土台）
  function articleTop(scroller, article) {
    const node = headNodeOf(article);
    const scR = scroller.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return scroller.scrollTop + (r.top - scR.top);
  }

  // ---------------- Scroll / Lock ----------------
  let programmaticScrollLock = 0;
  const isLocked = () => performance.now() < programmaticScrollLock;
  function lockFor(ms) { programmaticScrollLock = performance.now() + ms; }

  function scrollToHead(article) {
    if (!article) return;
    const scroller = getTrueScroller();
    const anchor = currentAnchor();
    const desired = Math.round(articleTop(scroller, article) - anchor);
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const clamped = Math.min(maxScroll, Math.max(0, desired));
    lockFor(CFG.lockMs);
    scroller.scrollTo({ top: clamped, behavior: 'smooth' });
  }

  // ---------------- UI（踏襲） ----------------
  try { CG?.installHotkey?.(); } catch {}

  (function injectCss(css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  })(`#cgpt-nav{position:fixed;right:12px;bottom:140px;display:flex;flex-direction:column;gap:12px;z-index:2147483647;touch-action:none}
#cgpt-drag{width:92px;height:12px;cursor:grab;border-radius:10px;background:linear-gradient(90deg,#aaa 20%,#ccc 50%,#aaa 80%);opacity:.55;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
#cgpt-drag:active{cursor:grabbing}
.cgpt-nav-group{position:relative;width:92px;border-radius:14px;padding:10px;border:1px solid rgba(0,0,0,.12);background:linear-gradient(0deg,var(--role-tint,transparent),var(--role-tint,transparent)),rgba(255,255,255,.95);box-shadow:0 6px 24px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:6px;align-items:stretch}
.cgpt-nav-group[data-role="user"]{--role-tint:rgba(88,133,255,.12)}
.cgpt-nav-group[data-role="assistant"]{--role-tint:rgba(64,200,150,.14)}
.cgpt-nav-group[data-role="all"]{--role-tint:rgba(128,128,128,.08)}
.cgpt-nav-label{text-align:center;font-weight:600;opacity:.9;margin-bottom:2px;font-size:12px}
#cgpt-nav button{all:unset;height:34px;border-radius:10px;font:12px/1.1 system-ui,-apple-system,sans-serif;display:grid;place-items:center;cursor:pointer;user-select:none;background:#f2f2f7;color:#111;border:1px solid rgba(0,0,0,.08);transition:background .15s ease,transform .03s ease}
#cgpt-nav button:hover{background:#fff}
#cgpt-nav button:active{transform:translateY(1px)}
.cgpt-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#cgpt-nav .cgpt-lang-btn{height:28px;margin-top:4px}
@media (prefers-color-scheme:dark){
  .cgpt-nav-group{border-color:#3a3a3f;background:linear-gradient(0deg,var(--role-tint,transparent),var(--role-tint,transparent)),#2a2a2d}
  #cgpt-nav button{background:#3a3a40;color:#e7e7ea;border-color:#3a3a3f}
  #cgpt-nav button:hover{background:#4a4a52}
}`);

  const box = document.createElement('div');
  box.id = 'cgpt-nav';
  box.innerHTML = `
  <div id="cgpt-drag" title=""></div>
  <div class="cgpt-nav-group" data-role="user">
    <div class="cgpt-nav-label" data-i18n="user"></div>
    <button data-act="top" data-i18n="top"></button>
    <button data-act="prev" data-i18n="prev"></button>
    <button data-act="next" data-i18n="next"></button>
    <button data-act="bottom" data-i18n="bottom"></button>
  </div>
  <div class="cgpt-nav-group" data-role="assistant">
    <div class="cgpt-nav-label" data-i18n="assistant"></div>
    <button data-act="top" data-i18n="top"></button>
    <button data-act="prev" data-i18n="prev"></button>
    <button data-act="next" data-i18n="next"></button>
    <button data-act="bottom" data-i18n="bottom"></button>
  </div>
  <div class="cgpt-nav-group" data-role="all">
    <div class="cgpt-nav-label" data-i18n="all"></div>
    <div class="cgpt-grid2">
      <button data-act="top">▲</button>
      <button data-act="bottom">▼</button>
    </div>
    <button class="cgpt-lang-btn"></button>
  </div>`;
  document.body.appendChild(box);

  const I18N = {
    ja: { user:'ユーザー', assistant:'アシスタント', all:'全体', top:'先頭', prev:'前へ', next:'次へ', bottom:'末尾', langBtn:'English', dragTitle:'ドラッグで移動' },
    en: { user:'User', assistant:'Assistant', all:'All', top:'Top', prev:'Prev', next:'Next', bottom:'Bottom', langBtn:'日本語', dragTitle:'Drag to move' }
  };
  let LANG = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';

  function applyLang() {
    const t = I18N[LANG] || I18N.ja;
    box.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (t[k]) el.textContent = t[k];
    });
    box.querySelector('#cgpt-drag').title = t.dragTitle;
    box.querySelector('.cgpt-lang-btn').textContent = t.langBtn;
  }

  // ---------------- Panel: drag & settings ----------------
  (function enableDragging() {
    const grip = box.querySelector('#cgpt-drag');
    let dragging = false, offX = 0, offY = 0;
    function onDown(e){ dragging = true; const r = box.getBoundingClientRect(); offX = e.clientX - r.left; offY = e.clientY - r.top; grip.setPointerCapture(e.pointerId); }
    function onMove(e){ if (!dragging) return; box.style.left = `${e.clientX - offX}px`; box.style.top = `${e.clientY - offY}px`; }
    function onUp(e){ if (!dragging) return; dragging = false; grip.releasePointerCapture(e.pointerId); const r = box.getBoundingClientRect(); saveSettingsPatch({ panel:{ x:r.left, y:r.top } }); }
    grip.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
  })();

  function deepMerge(dst, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
        dst[k] = deepMerge(dst[k] || {}, src[k]);
      } else { dst[k] = src[k]; }
    }
    return dst;
  }
  function loadSettings(cb) {
    const getter = chrome?.storage?.sync?.get;
    if (typeof getter !== 'function') { CFG = structuredClone(DEFAULTS); cb?.(); return; }
    try {
      getter('cgNavSettings', ({ cgNavSettings }) => { CFG = deepMerge(structuredClone(DEFAULTS), cgNavSettings || {}); cb?.(); });
    } catch { CFG = structuredClone(DEFAULTS); cb?.(); }
  }
  function saveSettingsPatch(patch) {
    loadSettings(() => {
      deepMerge(CFG, patch);
      try { chrome?.storage?.sync?.set?.({ cgNavSettings: CFG }); } catch {}
    });
  }

  // ---------------- State / Rebuild ----------------
  const state = { all: [], user: [], assistant: [] };

  function sortByY(list, scroller) {
    const s = scroller || getTrueScroller();
    try {
      return list.map(el => ({ el, y: articleTop(s, el) }))
                 .sort((a,b) => a.y - b.y)
                 .map(x => x.el);
    } catch { return list; }
  }

  function indexByAnchor(list) {
    if (!list.length) return { cur:-1, prev:-1, next:-1 };
    const sc = getTrueScroller();
    const yStar = sc.scrollTop + currentAnchor();
    const eps = Number(CFG.eps) || 0;

    let cur = 0, bestAbs = Infinity, signed = 0;
    for (let i=0;i<list.length;i++){
      const d = articleTop(sc, list[i]) - yStar;
      const a = Math.abs(d);
      if (a < bestAbs) { bestAbs = a; cur = i; signed = d; }
    }
    if (bestAbs <= eps) return { cur, prev: Math.max(0, cur-1), next: Math.min(list.length-1, cur+1) };
    const prev = (signed > 0) ? Math.max(0, cur-1) : cur;
    const next = (signed > 0) ? cur : Math.min(list.length-1, cur+1);
    return { cur, prev, next };
  }

  function makeNav(role) {
    const getList = () => state[role];
    const scrollToAbsoluteBottom = () => {
      const s = getTrueScroller();
      lockFor(CFG.lockMs);
      s.scrollTo({ top: s.scrollHeight, behavior: 'smooth' });
    };
    return {
      goTop(){ const L=getList(); if (L.length) scrollToHead(L[0]); },
      goBottom(){ const L=getList(); if (!L.length) return; if (role==='all') scrollToAbsoluteBottom(); else scrollToHead(L[L.length-1]); },
      goPrev(){ const L=getList(); if (!L.length) return; const idx=indexByAnchor(L); if (idx.prev>=0) scrollToHead(L[idx.prev]); },
      goNext(){ const L=getList(); if (!L.length) return; const idx=indexByAnchor(L); if (idx.next>=0) scrollToHead(L[idx.next]); }
    };
  }

  const nav = { user: makeNav('user'), assistant: makeNav('assistant'), all: makeNav('all') };

  let currentScrollerForListener = null;
  function rebuild() {
    if (isLocked()) return; // smooth中は揺れるので抑止（③）
    TRUE_SCROLLER = getTrueScroller();
    const allRaw = pickAllArticles();
    state.all = sortByY(allRaw, TRUE_SCROLLER);
    state.user = pickArticlesByRole('user', state.all);
    state.assistant = pickArticlesByRole('assistant', state.all);

    if (currentScrollerForListener !== TRUE_SCROLLER) {
      if (currentScrollerForListener) currentScrollerForListener.removeEventListener('scroll', rebuild);
      TRUE_SCROLLER.addEventListener('scroll', rebuild, { passive: true });
      currentScrollerForListener = TRUE_SCROLLER;
    }
  }

  // ---------------- Wire UI ----------------
  box.addEventListener('click', (e) => {
    const langBtn = e.target.closest('.cgpt-lang-btn');
    if (langBtn) { LANG = LANG === 'ja' ? 'en' : 'ja'; applyLang(); return; }
    const btn = e.target.closest('button[data-act]'); if (!btn) return;
    const act = btn.dataset.act;
    const role = btn.closest('.cgpt-nav-group')?.dataset.role;
    const m = `go${act[0].toUpperCase()}${act.slice(1)}`;
    nav[role]?.[m]?.();
  });

  const mo = new MutationObserver(() => rebuild());

  function initialize() {
    loadSettings(() => {
      const { x, y } = CFG.panel || {};
      if (Number.isFinite(x) && Number.isFinite(y)) { box.style.left = x + 'px'; box.style.top = y + 'px'; }
      applyLang();
      rebuild();
      mo.observe(document.body, { childList:true, subtree:true, attributes:false });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
