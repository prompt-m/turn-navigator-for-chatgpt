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
    showViz: false,
    panel: { x: null, y: null },
    list: {
      enabled: false,        // 表示ON/OFF（パネルのトグルと連動）
      maxChars: 40,          // 1行の文字数（省略は … で表示）
      fontSize: 12,          // px
      theme: 'mint',         // 'mint' | 'violet' | 'slate' など（後述）
      width: 320,            // パネル幅
      x: null,
      y: null,               // 位置（ドラッグで保存）
      previewChars: 80,      // 抜粋文字数
      maxItems: 30           // 最大表示件数
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
  const isVisible = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const pick = (root, sel) => {
    const n = (root || article).querySelector(sel);
    return n && isVisible(n) ? n : null;
  };

  const isAssistant = article.matches('[data-message-author-role="assistant"]')
                   || !!article.querySelector('[data-message-author-role="assistant"]');
  const isUser      = article.matches('[data-message-author-role="user"]')
                   || !!article.querySelector('[data-message-author-role="user"]');

  // --- Assistant: ---
  if (isAssistant) {
    return (
      pick(article, ':scope > div') ||
      pick(article, 'div.text-base') ||
      pick(article, 'div.markdown')  ||
      article
    );
  }

  // --- User: ---
  if (isUser) {
    // 右寄せコンテナ（外枠）
    const wrap =
      pick(article, 'div.flex.justify-end') ||
      pick(article, 'div.items-end') || article;

    // 仕様：先頭の可視子要素にスナップ（＝添付が先頭なら添付、本文が先頭なら本文）
    const firstVisibleChild = Array.from(wrap.children).find(isVisible);
    if (firstVisibleChild) return firstVisibleChild;

    // フォールバック（念のため）
    return article;
  }
  return article;
}



  // PRIMARY座標で記事先頭の絶対Y（③の土台）
  function articleTop(scroller, article) {
    const node = headNodeOf(article);

  // ★デバッグ：返されたノードを一瞬ハイライト
//try {
//  node.style.setProperty('outline', '2px solid red', 'important');
//  setTimeout(() => node && node.style && node.style.removeProperty('outline'), 2000);
//} catch {}

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
})(`
  /* ===== ナビ本体 ===== */
  #cgpt-nav {
    position: fixed;
    right: 12px;
    bottom: 140px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 2147483647;
    touch-action: none;
  }
  #cgpt-drag {
    width: 92px;
    height: 12px;
    cursor: grab;
    border-radius: 10px;
    background: linear-gradient(90deg, #aaa 20%, #ccc 50%, #aaa 80%);
    opacity: .55;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,.08);
    min-height: 12px; /* 0px化防止 */
  }
  #cgpt-drag:active { cursor: grabbing; }

  .cgpt-nav-group {
    position: relative;
    width: 92px;
    border-radius: 14px;
    padding: 10px;
    border: 1px solid rgba(0,0,0,.12);
    background: linear-gradient(0deg, var(--role-tint,transparent), var(--role-tint,transparent)), rgba(255,255,255,.95);
    box-shadow: 0 6px 24px rgba(0,0,0,.18);
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: stretch;
  }
  .cgpt-nav-group[data-role="user"]      { --role-tint: rgba(88,133,255,.12); }
  .cgpt-nav-group[data-role="assistant"] { --role-tint: rgba(64,200,150,.14); }
  .cgpt-nav-group[data-role="all"]       { --role-tint: rgba(128,128,128,.08); }

  .cgpt-nav-label {
    text-align: center;
    font-weight: 600;
    opacity: .9;
    margin-bottom: 2px;
    font-size: 12px;
  }

  #cgpt-nav button {
    all: unset;
    height: 34px;
    border-radius: 10px;
    font: 12px/1.1 system-ui,-apple-system,sans-serif;
    display: grid;
    place-items: center;
    cursor: pointer;
    user-select: none;
    background: #f2f2f7;
    color: #111;
    border: 1px solid rgba(0,0,0,.08);
    transition: background .15s ease, transform .03s ease;
  }
  #cgpt-nav button:hover  { background: #fff; }
  #cgpt-nav button:active { transform: translateY(1px); }

  .cgpt-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
  #cgpt-nav .cgpt-lang-btn { height: 28px; margin-top: 4px; }

  /* バイアス線/帯は必ずクリックを透過（念のため二段構え） */
  #cgpt-bias-line, #cgpt-bias-band { pointer-events: none !important; }

  /* パネルの選択/フォーカス無効（常に） */
  #cgpt-nav, #cgpt-nav * {
    -webkit-user-select: none;
    -ms-user-select: none;
    user-select: none;
    caret-color: transparent;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  /* ======= 会話リスト（ベースは @media の外に） ======= */
  #cgpt-list-panel {
    position: fixed;
    right: 12px;           /* JSでleft/topに置換される想定 */
    bottom: 140px;
    z-index: 2147483646;
    width: 360px;
    max-width: min(92vw, 420px);
    max-height: min(62vh, 680px);

    display: none;         /* JSで block に */
    flex-direction: column;
    gap: 0;

    border: 1px solid rgba(0,0,0,.12);
    border-radius: 16px;
    background: rgba(255,255,255,.98);
    box-shadow: 0 18px 56px rgba(0,0,0,.25);

    /* テーマ変数（ライトの既定） */
    --user-bg:       rgba(88,133,255,.06);
    --assistant-bg:  rgba(64,200,150,.06);
    --hover:         rgba(0,0,0,.05);
    --border:        rgba(0,0,0,.10);
    --text:          #111;
  }

  /* ヘッダー（つまみ＋閉じる） */
  #cgpt-list-head {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--border);
    padding: 6px 10px;
    color: var(--text);
  }
  #cgpt-list-grip {
    height: 12px;
    border-radius: 10px;
    background: linear-gradient(90deg, #aaa 18%, #d0d0d0 50%, #aaa 82%);
    opacity: .6;
    cursor: grab;
    user-select: none;
  }
  #cgpt-list-grip:active { cursor: grabbing; }
  #cgpt-list-title { font-weight: 600; font-size: 12px; opacity: .85; }
  #cgpt-list-close {
    all: unset;
    font-size: 12px;
    line-height: 1;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    cursor: pointer;
    user-select: none;
  }

  /* 本体スクロール領域 */
  #cgpt-list-body { overflow: auto; padding: 6px 8px; }

   /* === サイズ可変 + 左寄せ + アイコン + 件数表示 === */
   #cgpt-list-panel{
     resize: both;             /* サイズ可変 */
     overflow: auto;
     min-width: 280px;
     min-height: 180px;
   }
   #cgpt-list-panel .cgpt-list-item {
     display: flex;
     align-items: center;
     gap: 8px;
     padding: 8px 8px;
     border-bottom: 1px dashed var(--border);
     cursor: pointer;
     user-select: none;
     transition: background .12s ease;
     outline: none;
     text-align: left;
     justify-content: flex-start !important;
   }
   #cgpt-list-panel .cgpt-list-item:last-child { border-bottom: none; }
   #cgpt-list-panel .cgpt-list-item:hover { background: var(--hover); }
   #cgpt-list-panel .cgpt-list-item:focus-visible {
     box-shadow: 0 0 0 2px rgba(80,120,255,.35) inset;
     border-radius: 8px;
   }
   /* アイコン列（複数可） */
   #cgpt-list-panel .cgpt-list-item .icons{
     display: inline-flex;
     gap: 4px;
     min-width: 1.6em;
     opacity: .9;
     font-size: 0.95em;
   }
   #cgpt-list-panel .cgpt-list-item .txt{
     flex: 1 1 auto;
     white-space: nowrap;
     overflow: hidden;
     text-overflow: ellipsis;
     color: var(--text);
     font-size: 13px;
   }
   /* フッター（件数表示 + ボタン） */
   #cgpt-list-foot{
     border-top: 1px solid var(--border);
     padding: 6px 8px;
     display: flex;
     align-items: center;
     justify-content: space-between;
   }
   #cgpt-list-count{ font-size:12px; opacity:.75; }

  /* ===== ダークモード差分（色だけ上書き） ===== */
  @media (prefers-color-scheme: dark) {
    .cgpt-nav-group {
      border-color: #3a3a3f;
      background: linear-gradient(0deg, var(--role-tint,transparent), var(--role-tint,transparent)), #2a2a2d;
    }
    #cgpt-nav button {
      background: #3a3a40;
      color: #e7e7ea;
      border-color: #3a3a3f;
    }
    #cgpt-nav button:hover { background: #4a4a52; }

    #cgpt-list-panel {
      background: #2a2a2d;
      --text:   #e8e8ea;
      --border: #3a3a3f;
      --hover:  rgba(255,255,255,.06);
      --user-bg:      rgba(88,133,255,.14);
      --assistant-bg: rgba(64,200,150,.16);
    }
    #cgpt-list-head  { border-color: var(--border); }
    #cgpt-list-close { border-color: var(--border); }
  }
`);


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
      <label class="cgpt-viz-toggle"  style="margin-top:6px;display:flex;gap:8px;align-items:center;font-size:12px;">
        <input id="cgpt-viz" type="checkbox" style="accent-color:#888;">
        <span>基準線</span>
      </label>
      <label class="cgpt-list-toggle" style="margin-top:6px;display:flex;gap:8px;align-items:center;font-size:12px;">
        <input id="cgpt-list-toggle" type="checkbox" style="accent-color:#888;">
        <span>一覧</span>
      </label>
    </div>`;
  document.body.appendChild(box);

  // パネル内のフォーカスを奪わない（Tab移動やクリックでフォーカスさせない）
  box.querySelectorAll('button, .cgpt-nav-label, .cgpt-nav-group, #cgpt-drag')
    .forEach(el => {
      el.setAttribute('tabindex', '-1');
      el.addEventListener('mousedown', e => { e.preventDefault(); }, true);
  });

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

  // ---------------- Panel clamp (GLOBAL) ----------------
  function clampPanelWithinViewport() {
    const margin = 8;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const r = box.getBoundingClientRect();
    // 位置は left/top を常用。right/bottom が残っていると箱の寸法が歪むことがあるので無効化
    box.style.right = 'auto';
    box.style.bottom = 'auto';
    let x = Number.isFinite(r.left) ? r.left : vw - r.width - 12;
    let y = Number.isFinite(r.top)  ? r.top  : vh - r.height - 140;
    x = Math.min(vw - r.width - margin, Math.max(margin, x));
    y = Math.min(vh - r.height - margin, Math.max(margin, y));
    box.style.left = `${x}px`;
    box.style.top  = `${y}px`;
  }

  // ---------------- Panel: drag & settings ----------------
  (function enableDragging() {
    const grip = box.querySelector('#cgpt-drag');
    let dragging = false, offX = 0, offY = 0;

    function onDown(e){
      dragging = true;
      const r = box.getBoundingClientRect();
      offX = e.clientX - r.left;
      offY = e.clientY - r.top;
      grip.setPointerCapture(e.pointerId);
    }
    function onMove(e){
      if (!dragging) return;
      box.style.left = `${e.clientX - offX}px`;
      box.style.top  = `${e.clientY - offY}px`;
    }
    function onUp(e){
      if (!dragging) return;
      dragging = false;
      grip.releasePointerCapture(e.pointerId);
      clampPanelWithinViewport(); // 画面内に押し戻す
      const r = box.getBoundingClientRect();
      saveSettingsPatch({ panel:{ x:r.left, y:r.top } });
    }

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
      getter('cgNavSettings', ({ cgNavSettings }) => {
        // 1) defaults をコピー → 2) 保存値で上書き（ユーザー値が勝つ）
        CFG = structuredClone(DEFAULTS);
        if (cgNavSettings) deepMerge(CFG, cgNavSettings);
        cb?.();
      });
    } catch { CFG = structuredClone(DEFAULTS); cb?.(); }
  }

  // ---- 追加：設定変更のサブスクライブ（Center Bias 等の即時反映）----
  try {
    chrome?.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== 'sync' || !changes.cgNavSettings) return;
      const next = changes.cgNavSettings.newValue || {};
      CFG = (function deepMerge(dst, src) {
        for (const k in src) {
          if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
            dst[k] = deepMerge(dst[k] || {}, src[k]);
          } else {
            dst[k] = src[k];
          }
        }
        return dst;
      })(structuredClone(DEFAULTS), next);
  
      // アンカーの可視ガイドも即更新
      try { window.CGTN?.renderViz?.(CFG, true); } catch {}
      // 位置決めに使う幾何も更新
      requestAnimationFrame(() => { 
        // スクロール中の揺れを避けるなら isLocked() で弾いてもよい
        // 今回は即時反映を優先
        // （必要なら if(isLocked()) return; を入れてください）
        // リスト再構築
        typeof rebuild === 'function' && rebuild();
      });
    });
  } catch {}

  function saveSettingsPatch(patch) {
    // いまの保存値を読んでから patch を上書きマージして保存
    const getter = chrome?.storage?.sync?.get;
    const setter = chrome?.storage?.sync?.set;
    if (typeof getter !== 'function' || typeof setter !== 'function') {
      // 退避先が無い環境でも、少なくともローカルの CFG は壊さない
      deepMerge(CFG, patch);
      return;
    }
    try {
      getter('cgNavSettings', ({ cgNavSettings }) => {
        const next = structuredClone(DEFAULTS);
        if (cgNavSettings) deepMerge(next, cgNavSettings); // 既存ユーザー値
        deepMerge(next, patch);                            // → patch で上書き
        CFG = next;                                       // ローカルも即更新
        try { setter({ cgNavSettings: next }); } catch {}
      });
    } catch {
      // 読み出し失敗時も手元の CFG だけは更新
      deepMerge(CFG, patch);
      try { setter?.({ cgNavSettings: CFG }); } catch {}
    }
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

  // アンカー基準の厳密な 前/次 ピッカー
  function pickNextAfter(list, yStar, eps=0) {
    const sc = getTrueScroller();
    for (const el of list) {
      if (articleTop(sc, el) > yStar + eps) return el;
    }
    return null;
  }

  function pickPrevBefore(list, yStar, eps=0) {
    const sc = getTrueScroller();
    for (let i=list.length-1; i>=0; i--) {
      if (articleTop(sc, list[i]) < yStar - eps) return list[i];
    }
    return null;
  }


  // ナビ本体
  function makeNav(role) {
    const getList = () => state[role];
    const scrollToAbsoluteBottom = () => {
      const s = getTrueScroller();
      lockFor(CFG.lockMs);
      s.scrollTo({ top: s.scrollHeight, behavior: 'smooth' });
    };
  
    return {
      goTop(){
        const L=getList(); if (!L.length) return;
        scrollToHead(L[0]);
      },
      goBottom(){
        const L=getList(); if (!L.length) return;
        if (role==='all') { scrollToAbsoluteBottom(); }
        else { scrollToHead(L[L.length-1]); } // 最後の“実体”
      },
      goPrev(){
        const L=getList(); if (!L.length) return;
        const sc = getTrueScroller();
        const yStar = sc.scrollTop + currentAnchor();
        const prev = pickPrevBefore(L, yStar, Number(CFG.eps)||0);
        if (prev) scrollToHead(prev);
      },
      goNext(){
        const L=getList(); if (!L.length) return;
        const sc = getTrueScroller();
        const yStar = sc.scrollTop + currentAnchor();
        const next = pickNextAfter(L, yStar, Number(CFG.eps)||0);
        if (next) scrollToHead(next);
      }
    };
  }


  // 追加：そのターンが“実体のある発言”かを判定
  function isRealTurn(article) {
    const head = headNodeOf(article);
    if (!head) return false;
  
    const r = head.getBoundingClientRect();
    if (r.height < 8 || !isVisible(head)) return false;
  
    // 文章 or メディアが何かしらあるか？
    const txt = (head.textContent || head.innerText || '').trim();
    const hasText  = txt.length > 0;
    const hasMedia = !!head.querySelector('img,video,canvas,figure');
  
    // “描画中/プレースホルダー”的なものを保険で除外
    const looksBusy = head.getAttribute?.('aria-busy') === 'true';
  
    return (hasText || hasMedia) && !looksBusy;
  }


  const nav = { user: makeNav('user'), assistant: makeNav('assistant'), all: makeNav('all') };

  let currentScrollerForListener = null;
  function rebuild() {
    if (isLocked()) return; // smooth中は揺れるので抑止（③）
    TRUE_SCROLLER = getTrueScroller();
    const allRaw = pickAllArticles().filter(isRealTurn);
    state.all = sortByY(allRaw, TRUE_SCROLLER);
    state.user = pickArticlesByRole('user', state.all);
    state.assistant = pickArticlesByRole('assistant', state.all);

    if (currentScrollerForListener !== TRUE_SCROLLER) {
      if (currentScrollerForListener) currentScrollerForListener.removeEventListener('scroll', rebuild);
      TRUE_SCROLLER.addEventListener('scroll', rebuild, { passive: true });
      currentScrollerForListener = TRUE_SCROLLER;
    }
    renderList();  // ★追加
  }

  //　リスト関連

function textOfTurn(article) {
  try {
    // 既存 headNodeOf を利用
    const head = headNodeOf(article);
    if (!head) return '';
    // テキスト抽出（code/blockquote等は簡略に）
    const t = (head.innerText || head.textContent || '').replace(/\s+/g, ' ').trim();
    return t;
  } catch { return ''; }
}

function roleOf(article) {
  return article.matches('[data-message-author-role="assistant"], :scope [data-message-author-role="assistant"]')
    ? 'アシスタント'
    : 'ユーザー';
}

function buildListRows() {
  const cfg = CFG.list || DEFAULTS.list;
  const max = Math.max(1, Number(cfg.maxItems) || DEFAULTS.list.maxItems);
  const prevN = Math.max(10, Number(cfg.previewChars) || DEFAULTS.list.previewChars);

  const L = state.all.slice(0, max); // 画面上に並んでいる順（rebuildでソート済み）

  const rows = L.map((el) => {
    const role = roleOf(el);
    let text = textOfTurn(el);
    const trimmed = text.length > prevN;
    if (trimmed) text = text.slice(0, prevN).trimEnd() + '…';
    return { el, role, text };
  });
  return rows;
}

// === List Panel ===
// === List Panel ===
let listBox = null;

function ensureListBox(){
  if (listBox && document.body.contains(listBox)) return listBox;

  listBox = document.createElement('div');
  listBox.id = 'cgpt-list-panel';  // ← CSS と一致させる
  listBox.innerHTML = `
    <div id="cgpt-list-head">
      <div id="cgpt-list-grip" title="ドラッグで移動"></div>
      <button id="cgpt-list-close">閉じる</button>
    </div>
    <div id="cgpt-list-body"></div>
    <div id="cgpt-list-foot"></div>
  `;
  document.body.appendChild(listBox);

  // サイズ／テーマ
  listBox.style.setProperty('--list-w', (CFG.list?.width || 320) + 'px');
  listBox.style.setProperty('--fs', (CFG.list?.fontSize || 12) + 'px');
  listBox.classList.add('theme-' + (CFG.list?.theme || 'mint'));

  // 位置
  const { x, y } = CFG.list || {};
  if (Number.isFinite(x) && Number.isFinite(y)) {
    listBox.style.left = x + 'px';
    listBox.style.top  = y + 'px';
  } else {
    const r = box.getBoundingClientRect();
    listBox.style.left = Math.max(8, r.left - (CFG.list?.width || 320) - 12) + 'px';
    listBox.style.top  = (r.top) + 'px';
  }

// 初期サイズ（保存値があれば反映）
if (Number.isFinite(CFG.list?.width))  listBox.style.width  = CFG.list.width + 'px';
if (Number.isFinite(CFG.list?.height)) listBox.style.height = CFG.list.height + 'px';

// リサイズ検知 → 保存
const ro = new ResizeObserver(entries=>{
  for (const e of entries){
    const cr = e.contentRect;
    saveSettingsPatch({ list:{ ...(CFG.list||{}), width: Math.round(cr.width), height: Math.round(cr.height) }});
  }
});
ro.observe(listBox);


  // ドラッグ
  (function enableDrag(){
    const grip = listBox.querySelector('#cgpt-list-grip');
    let dragging=false, offX=0, offY=0;
    grip.addEventListener('pointerdown',e=>{
      dragging=true;
      const rr=listBox.getBoundingClientRect();
      offX = e.clientX - rr.left; offY = e.clientY - rr.top;
      grip.setPointerCapture(e.pointerId);
    });
    window.addEventListener('pointermove',e=>{
      if(!dragging) return;
      listBox.style.left = (e.clientX - offX) + 'px';
      listBox.style.top  = (e.clientY - offY) + 'px';
    },{passive:true});
    window.addEventListener('pointerup',e=>{
      if(!dragging) return;
      dragging=false; 
      listBox.querySelector('#cgpt-list-grip').releasePointerCapture(e.pointerId);
      const rr=listBox.getBoundingClientRect();
      saveSettingsPatch({ list:{ ...(CFG.list||{}), x:rr.left, y:rr.top } });
    });
  })();

  // 閉じる
  listBox.querySelector('#cgpt-list-close').addEventListener('click', ()=>{
    setListEnabled(false);
    const chk = document.getElementById('cgpt-list-toggle');
    if (chk) chk.checked = false;
  });

  return listBox;
}

function setListEnabled(on){
  ensureListBox();
  listBox.style.display = on ? 'flex' : 'none';
  saveSettingsPatch({ list: { ...(CFG.list||{}), enabled: !!on } });
  const chk = document.getElementById('cgpt-list-toggle');
  if (chk) chk.checked = !!on;
}

function toggleList(){ setListEnabled(!(CFG.list?.enabled)); }

function iconsFor(head){
  if (!head) return [];
  const icons = [];
  // 画像系
  if (head.querySelector('img,figure picture,canvas')) icons.push('🖼');
  // 動画/音声系
  if (head.querySelector('video, audio')) icons.push('🎞');
  // PDFリンク
  if (head.querySelector('a[href$=".pdf" i]')) icons.push('📑');
  // テキスト/コード添付らしきもの（<pre>やプレーン添付リンク）
  if (head.querySelector('pre, code, a[href$=".txt" i], a[href$=".md" i]')) icons.push('📄');
  // 何も無ければ空配列
  return icons;
}
function renderList(){
  if (!CFG.list?.enabled) return;
  const panel = ensureListBox();
  const body  = panel.querySelector('#cgpt-list-body');
  const foot  = panel.querySelector('#cgpt-list-foot');
  body.innerHTML = '';

  const lim      = Math.max(3, Math.min(100, CFG.list?.maxItems ?? 18));
  const maxChars = Math.max(10, Math.min(200, CFG.list?.maxChars ?? 40));

  const take = state.all.slice(0, lim);
  for (const art of take){
    const head = headNodeOf(art);
    let txt = (head?.innerText || '').replace(/\s+/g,' ').trim();
    const clipped = txt.length > maxChars;
    if (clipped) txt = txt.slice(0, maxChars);

    const ico = iconsFor(head).join('');
    const row = document.createElement('div');
    row.className = 'cgpt-list-item';
    row.innerHTML = `
      <span class="icons">${ico}</span>
      <span class="txt">${txt}${clipped ? '…' : ''}</span>
    `;
    row.addEventListener('click', ()=> scrollToHead(art));
    body.appendChild(row);
  }

  // 件数表示をフッターに
  const total   = state.all.length;
  const showing = take.length;
  foot.innerHTML = `
    <span id="cgpt-list-count">${showing} / ${total}</span>
    <button id="cgpt-list-close">閉じる</button>
  `;
  foot.querySelector('#cgpt-list-close').onclick = () => {
    setListEnabled(false);
    const chk = document.getElementById('cgpt-list-toggle'); if (chk) chk.checked = false;
  };
}


  /* === 他タブの保存を即反映（options で保存→即反映） === */
  try {
    chrome?.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== 'sync' || !changes.cgNavSettings) return;
      const newVal = changes.cgNavSettings.newValue || {};
      const next = structuredClone(DEFAULTS);
      deepMerge(next, newVal);   // 既存の deepMerge を使用
      CFG = next;
      try { box.querySelector('#cgpt-viz').checked        = !!CFG.showViz; } catch {}
      try { box.querySelector('#cgpt-list-toggle').checked = !!CFG.list?.enabled; } catch {}
      try { CG?.renderViz?.(CFG, true); } catch {}
      rebuild();
    });
  } catch {}

  // ---------------- Wire UI ----------------
  box.addEventListener('click', (e) => {
    const t = (e.target instanceof Element) ? e.target : null;
    if (!t) return;

    // 一覧トグル（最優先）
    const listChk = t.closest('#cgpt-list-toggle');
    if (listChk) {
      const on = listChk.checked;
      setListEnabled(on);                          // ← 下の 3) で定義
      saveSettingsPatch({ list: { ...(CFG.list||{}), enabled: !!on } });
      return;
    }

    // 基準線トグル
    const vizChk = t.closest('#cgpt-viz');
    if (vizChk) {
      const on = vizChk.checked;
      try { CG?.toggleViz?.(on, CFG); } catch {}
      saveSettingsPatch({ showViz: !!on });
      return;
    }

    // 言語トグル
    const langBtn = t.closest('.cgpt-lang-btn');
    if (langBtn) { LANG = LANG === 'ja' ? 'en' : 'ja'; applyLang(); return; }
  
    // 既存の移動ボタン
    const btn = t.closest('button[data-act]');
    if (!btn) return;
    const act  = btn.dataset.act;
    const role = btn.closest('.cgpt-nav-group')?.dataset.role;
    const m = `go${act[0].toUpperCase()}${act.slice(1)}`;
    nav[role]?.[m]?.();
    },/* capture: */ false);

  const mo = new MutationObserver((muts) => {
    // 自分のUI（ナビパネル/リストパネル）で起きた変化は無視
    for (const m of muts) {
      const n = m.target instanceof Node ? m.target : null;
      if (!n) continue;
      if (box.contains(n)) return;               // ナビ
      if (listBox && listBox.contains(n)) return; // リスト
    }
    rebuild();
  });

  function initialize() {
    loadSettings(() => {
      const { x, y } = CFG.panel || {};
      if (CFG.list?.enabled) {
        setListEnabled(true);
        renderList();
      }
      if (Number.isFinite(x) && Number.isFinite(y)) {
        box.style.left = x + 'px';
        box.style.top  = y + 'px';
      }
      // 初期表示でもはみ出しを矯正
      requestAnimationFrame(() => {
        clampPanelWithinViewport();
      });
      applyLang();
      // 初期トグル状態をUIに反映。ロード時は表示しない仕様なので描画は呼ばない
      try { box.querySelector('#cgpt-viz').checked = !!CFG.showViz; } catch {}
      rebuild();
      // ★ここで UI のトグルと保存値を同期（表示は切り替えない）
      try { box.querySelector('#cgpt-viz').checked        = !!CFG.showViz; } catch {}
      try { box.querySelector('#cgpt-list-toggle').checked = !!CFG.list?.enabled; } catch {}

      mo.observe(document.body, { childList:true, subtree:true, attributes:false });

    });
  }

  // 画面幅変化に追随（デバウンス）
  let resizeT = 0;
  function onResize() {
    cancelAnimationFrame(resizeT);
    resizeT = requestAnimationFrame(() => {
      // アンカーは shared.js に従う（可視ガイドも描画更新）
      try { CG?.renderViz?.(CFG); } catch {}
      rebuild();
      // リサイズでつまみが画面外に出たら戻す
      clampPanelWithinViewport();
    });
  }
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
