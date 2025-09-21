// == ChatGPT Turn Navigator – GENIE FIX (stable, index-based, PRIMARY coords) ==
(function () {
  'use strict';

  if (document.getElementById('cgpt-nav')) return;

  document.getElementById('cgpt-list-toggle')?.addEventListener('click', () => {
    openList();
  });

  const CG = window.CGTN;

  const DEFAULTS = {
    centerBias: 0.40,
    headerPx: 0,
    lockMs: 700,
    eps: 20,
    showViz: false,
    panel: { x: null, y: null },
    list: {
        previewChars: 80,   // 抜粋文字数
        maxItems: 30        // 最大表示件数
    },
    hotkeys: {
      enabled: false,
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
    }

    #cgpt-drag:active { cursor: grabbing; }

    .cgpt-nav-group {
      position: relative;
      width: 92px;
      border-radius: 14px;
      padding: 10px;
      border: 1px solid rgba(0,0,0,.12);
      background: linear-gradient(
          0deg,
          var(--role-tint, transparent),
          var(--role-tint, transparent)
        ),
        rgba(255,255,255,.95);
      box-shadow: 0 6px 24px rgba(0,0,0,.18);
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: stretch;
    }

    .cgpt-nav-group[data-role="user"]       { --role-tint: rgba(88,133,255,.12); }
    .cgpt-nav-group[data-role="assistant"]  { --role-tint: rgba(64,200,150,.14); }
    .cgpt-nav-group[data-role="all"]        { --role-tint: rgba(128,128,128,.08); }

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
      font: 12px/1.1 system-ui, -apple-system, sans-serif;
      display: grid;
      place-items: center;
      cursor: pointer;
      user-select: none;
      background: #f2f2f7;
      color: #111;
      border: 1px solid rgba(0,0,0,.08);
      transition: background .15s ease, transform .03s ease;
    }
    #cgpt-nav button:hover { background: #fff; }
    #cgpt-nav button:active { transform: translateY(1px); }

    .cgpt-grid2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    #cgpt-nav .cgpt-lang-btn { height: 28px; margin-top: 4px; }

    /* 追加: バイアス線/帯は必ずクリックを透過（念のため二段構え） */
    #cgpt-bias-line, #cgpt-bias-band { pointer-events: none !important; }

/* === 会話リスト === */
#cgpt-list {
  position: fixed;
  inset: 0 0 0 0;
  z-index: 2147483646;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,.25);
  pointer-events: auto;
}
#cgpt-list .sheet {
  width: min(800px, 94vw);
  max-height: min(70vh, 680px);
  background: rgba(255,255,255,.98);
  border: 1px solid rgba(0,0,0,.08);
  box-shadow: 0 20px 60px rgba(0,0,0,.25);
  border-radius: 16px;
  overflow: hidden;
  display: flex; flex-direction: column;
}
#cgpt-list header {
  padding: 10px 14px;
  font-weight: 600;
  border-bottom: 1px solid rgba(0,0,0,.07);
  display: flex; align-items: center; gap: 8px;
}
#cgpt-list header .spacer { flex: 1; }
#cgpt-list header button { all: unset; cursor: pointer; padding: 6px 10px; border-radius: 8px; border:1px solid rgba(0,0,0,.12); }
#cgpt-list .list {
  overflow: auto;
  padding: 8px 10px;
}
#cgpt-list .row {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 10px;
  padding: 10px 8px;
  border-bottom: 1px dashed rgba(0,0,0,.07);
  cursor: pointer;
}
#cgpt-list .row:hover { background: rgba(0,0,0,.035); }
#cgpt-list .role { font-weight: 600; opacity: .8; }
#cgpt-list .text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (prefers-color-scheme: dark) {
  #cgpt-list .sheet { background: #2a2a2d; border-color: #3a3a3f; }
  #cgpt-list header { border-color: #3a3a3f; }
  #cgpt-list header button { border-color:#3a3a3f; }
  #cgpt-list .row { border-color:#3a3a3f; }
}

    @media (prefers-color-scheme: dark) {
      .cgpt-nav-group {
        border-color: #3a3a3f;
        background: linear-gradient(
            0deg,
            var(--role-tint, transparent),
            var(--role-tint, transparent)
          ),
          #2a2a2d;
      }
      #cgpt-nav button {
        background: #3a3a40;
        color: #e7e7ea;
        border-color: #3a3a3f;
      }
      #cgpt-nav button:hover { background: #4a4a52; }

      /* === パネルのフォーカス/選択を全面オフ === */
      #cgpt-nav, #cgpt-nav * {
        -webkit-user-select: none;
        -ms-user-select: none;
        user-select: none;
        caret-color: transparent;
        outline: none;
        -webkit-tap-highlight-color: transparent;
      }
      /* グリップは最低高さを確保して“0px化”を防ぐ */
      #cgpt-drag { min-height: 12px; }

      /* バイアス線/帯は必ずクリック透過（二段構え） */
      #cgpt-bias-line, #cgpt-bias-band { pointer-events: none !important; }
      #cgpt-nav { max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); }
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
      <label class="cgpt-viz-toggle" style="margin-top:6px;display:flex;gap:8px;align-items:center;justify-content:center;font-size:12px;cursor:pointer;">
       <input id="cgpt-viz" type="checkbox" style="accent-color:#888;">
       <span>基準線</span>
      </label>
      <button id="cgpt-list-toggle" class="cgpt-lang-btn">一覧</button>
    </div>`;
  document.body.appendChild(box);

// 会話リストのオーバーレイ
const listWrap = document.createElement('div');
listWrap.id = 'cgpt-list';
listWrap.innerHTML = `
  <div class="sheet">
    <header>
      <div>会話リスト</div>
      <div class="spacer"></div>
      <button data-act="close">閉じる</button>
    </header>
    <div class="list"></div>
  </div>`;
document.body.appendChild(listWrap);



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

function renderList() {
  const listEl = listWrap.querySelector('.list');
  listEl.innerHTML = '';
  const rows = buildListRows();
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="role">${r.role}</div><div class="text">${r.text || '(画像/添付など)'}</div>`;
    row.addEventListener('click', () => {
      closeList();
      scrollToHead(r.el);
    });
    listEl.appendChild(row);
  }
}

function openList() {
  renderList();
  listWrap.style.display = 'flex';
}
function closeList() {
  listWrap.style.display = 'none';
}

listWrap.addEventListener('click', (e) => {
  if (e.target === listWrap) closeList();
});
listWrap.querySelector('button[data-act="close"]').addEventListener('click', closeList);

  /* === 他タブの保存を即反映（options で保存→即反映） === */
  try {
    chrome?.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== 'sync' || !changes.cgNavSettings) return;
      const newVal = changes.cgNavSettings.newValue || {};
      const next = structuredClone(DEFAULTS);
      deepMerge(next, newVal);   // 既存の deepMerge を使用
      CFG = next;
      try { CG?.renderViz?.(CFG, true); } catch {}
      rebuild();
    });
  } catch {}

  // ---------------- Wire UI ----------------
  box.addEventListener('click', (e) => {
    const langBtn = e.target.closest('.cgpt-lang-btn');
    if (langBtn) { LANG = LANG === 'ja' ? 'en' : 'ja'; applyLang(); return; }
    const btn = e.target.closest('button[data-act]'); 
    if (!btn) {
      // ガイド線トグル
      const chk = e.target.closest('#cgpt-viz');
      if (chk) {
        const on = chk.checked;
        try { CG?.toggleViz?.(on, CFG); } catch {}
        saveSettingsPatch({ showViz: !!on });
      }
      return;
    }
    const act = btn.dataset.act;
    const role = btn.closest('.cgpt-nav-group')?.dataset.role;
    const m = `go${act[0].toUpperCase()}${act.slice(1)}`;
    nav[role]?.[m]?.();
  });

  const mo = new MutationObserver(() => rebuild());

  function initialize() {
    loadSettings(() => {
      const { x, y } = CFG.panel || {};
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
