// == ChatGPT turn navigator – nav panel + hotkeys + role switching + draggable + EN/JA toggle ==
(function () {

  if (document.getElementById('cgpt-nav')) return;

  // shared.js が用意した名前空間
  const CG = window.CGTN;

// ★DEFAULTS（content.js 側のもの）— 既存の定義が他所にあればそれを残す
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



  // 起動時：設定を読み→位置だけ反映（表示は保留）
  chrome.storage.sync.get('cgNavSettings', ({ cgNavSettings }) => {
    CFG = { ...CFG, ...(cgNavSettings || {}) };
    CG.renderViz(CFG, /*visible=*/undefined); // 表示状態は維持（デフォ非表示）
  });


  // 画面サイズ変化でも再計算
  window.addEventListener('resize', () => CG.renderViz(CFG));

  // ホットキー（Ctrl+Alt+Shift+V）
  CG.installHotkey();

  // Console 互換
  window.toggleVizLines = CG.toggleVizLines;

  let _blinkState = { role: null, at: 0 };

  // ====== 言語定義 / 保存 ======
  const I18N = {
    ja: {
      user: 'ユーザー', assistant: 'アシスタント', all: '全体',
      top: '先頭', prev: '前へ', next: '次へ', bottom: '末尾',
      langBtn: 'English', dragTitle: 'ドラッグで移動'
    },
    en: {
      user: 'User', assistant: 'Assistant', all: 'All',
      top: 'Top', prev: 'Prev', next: 'Next', bottom: 'Bottom',
      langBtn: '日本語', dragTitle: 'Drag to move'
    }
  };
  let LANG = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  function saveLang(l) { try { chrome?.storage?.sync?.set?.({ cgNavLang: l }); } catch { } }
  function loadLang(cb) {
    try {
      chrome?.storage?.sync?.get?.('cgNavLang', ({ cgNavLang }) => {
        if (cgNavLang) LANG = cgNavLang;
        cb && cb();
      });
    } catch { cb && cb(); }
  }

  // ===== 設定ロード/マージ =====
  function deepMerge(dst, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) dst[k] = deepMerge(dst[k] || {}, src[k]);
      else dst[k] = src[k];
    }
    return dst;
  }
  function loadSettings(cb) {
    try {
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings }) => {
        CFG = deepMerge(structuredClone(DEFAULTS), cgNavSettings || {});
        cb && cb();
      });
    } catch { cb && cb(); }
  }
  function saveSettingsPatch(patch) {
    try {
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings }) => {
        const s = deepMerge(structuredClone(CFG), cgNavSettings || {});
        deepMerge(s, patch);
        chrome?.storage?.sync?.set?.({ cgNavSettings: s });
        CFG = s;
      });
    } catch { }
  }

  // ===== スタイル =====
  (function css(h) { const s = document.createElement('style'); s.textContent = h; document.head.appendChild(s); })(`
    :root { --cge-width: 92px; }
    #cgpt-nav{
      position:fixed; right:12px; bottom:140px;
      display:flex; flex-direction:column; gap:12px; z-index:2147483647;
      touch-action:none;
    }
    #cgpt-drag{
      width:var(--cge-width); height:12px; cursor:grab; border-radius:10px;
      background:linear-gradient(90deg, #aaa 20%, #ccc 50%, #aaa 80%);
      opacity:.55; box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);
    }
    #cgpt-drag:active{ cursor:grabbing; }

    .cgpt-nav-group{
      position:relative;
      width:var(--cge-width);
      border-radius:14px; padding:10px;
      border:1px solid var(--cge-border,rgba(0,0,0,.12));
      background:
        linear-gradient(0deg,var(--role-tint,transparent),var(--role-tint,transparent)),
        var(--cge-card,rgba(255,255,255,.95));
      box-shadow:0 6px 24px rgba(0,0,0,.18);
      display:flex; flex-direction:column; gap:6px; align-items:stretch;
    }
    .cgpt-nav-group[data-role="user"]      { --role-tint: rgba(88,133,255,.12); }
    .cgpt-nav-group[data-role="assistant"] { --role-tint: rgba(64,200,150,.14); }
    .cgpt-nav-group[data-role="all"]       { --role-tint: rgba(128,128,128,.08); }

    .cgpt-nav-label{ text-align:center; font-weight:600; opacity:.9; margin-bottom:2px; font-size:12px; }
    #cgpt-nav button{
      all:unset; height:34px; border-radius:10px;
      font:12px/1.1 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans JP",Meiryo,sans-serif;
      display:grid; place-items:center; cursor:pointer; user-select:none;
      background:var(--cge-btn,#f2f2f7); color:var(--cge-text,#111);
      border:1px solid var(--cge-border,rgba(0,0,0,.08));
      transition:background .15s ease, transform .03s ease, box-shadow .15s ease;
    }
    #cgpt-nav button:hover{ background:var(--cge-btn-hover,#fff); }
    #cgpt-nav button:active{ transform:translateY(1px); }
    .cgpt-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .cgpt-disabled{ opacity:.38; pointer-events:none; }
    .cgpt-active { box-shadow:0 0 0 2px #6aa9ff88 inset, 0 0 0 2px #6aa9ff88; }

    #cgpt-nav .cgpt-lang-btn{
      all:unset; height:28px; border-radius:8px; margin-top:6px;
      font:12px/1.1 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans JP",Meiryo,sans-serif;
      display:grid; place-items:center; cursor:pointer; user-select:none;
      background:var(--cge-btn,#f2f2f7); color:var(--cge-text,#111);
      border:1px solid var(--cge-border,rgba(0,0,0,.08));
    }
    #cgpt-nav .cgpt-lang-btn:hover{ background:var(--cge-btn-hover,#fff); }

    @media (prefers-color-scheme: dark){
      .cgpt-nav-group{ border-color:#3a3a3f; background:
        linear-gradient(0deg,var(--role-tint,transparent),var(--role-tint,transparent)), #2a2a2d; }
      #cgpt-nav button{ background:#3a3a40; color:#e7e7ea; border-color:#3a3a3f; }
      #cgpt-nav button:hover{ background:#4a4a52; }
      .cgpt-active { box-shadow:0 0 0 2px #8db3ff99 inset, 0 0 0 2px #8db3ff99; }
      #cgpt-nav .cgpt-lang-btn{ background:#3a3a40; color:#e7e7ea; border-color:#3a3a3f; }
      #cgpt-nav .cgpt-lang-btn:hover{ background:#4a4a52; }
    }
  `);

  // ===== UI =====
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
      <div class="cgpt-nav-label" data-i18n="all" style="opacity:.72"></div>
      <div class="cgpt-grid2">
        <button data-act="top">▲</button>
        <button data-act="bottom">▼</button>
      </div>
      <button class="cgpt-lang-btn"></button>
    </div>
  `;
  document.body.appendChild(box);

  // ===== 言語反映 =====
  function applyLang() {
    const t = I18N[LANG] || I18N.ja;
    box.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (t[k]) el.textContent = t[k];
    });
    const drag = box.querySelector('#cgpt-drag');
    if (drag) drag.title = t.dragTitle;
    const lb = box.querySelector('.cgpt-lang-btn');
    if (lb) lb.textContent = t.langBtn;
  }
  function toggleLang() {
    LANG = (LANG === 'ja' ? 'en' : 'ja');
    saveLang(LANG);
    applyLang();
  }

  // ===== パネル位置の適用 =====
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n | 0)); }
  function applyPanelPosition() {
    const { x, y } = CFG.panel || {};
    if (Number.isFinite(x) && Number.isFinite(y)) {
      box.style.left = x + 'px';
      box.style.top = y + 'px';
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    } else {
      box.style.left = 'auto';
      box.style.top = 'auto';
      box.style.right = '12px';
      box.style.bottom = '140px';
    }
  }
  function clampAndSavePosition() {
    const r = box.getBoundingClientRect();
    const vw = window.innerWidth | 0, vh = window.innerHeight | 0;
    const x = clamp(r.left, 4, Math.max(4, vw - r.width - 4));
    const y = clamp(r.top, 4, Math.max(4, vh - r.height - 4));
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.right = 'auto';
    box.style.bottom = 'auto';
    saveSettingsPatch({ panel: { x, y } });
  }

  // ===== ドラッグ =====
  (function enableDragging() {
    const grip = box.querySelector('#cgpt-drag');
    let dragging = false, offX = 0, offY = 0, pid = null;

    function onDown(e) {
      dragging = true; pid = e.pointerId;
      const r = box.getBoundingClientRect();
      offX = e.clientX - r.left; offY = e.clientY - r.top;
      box.style.left = (r.left) + 'px';
      box.style.top = (r.top) + 'px';
      box.style.right = 'auto'; box.style.bottom = 'auto';
      grip.setPointerCapture(pid);
      document.body.style.userSelect = 'none';
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging || e.pointerId !== pid) return;
      const vw = window.innerWidth | 0, vh = window.innerHeight | 0;
      const r = box.getBoundingClientRect();
      const w = r.width, h = r.height;
      let x = clamp(e.clientX - offX, 4, Math.max(4, vw - w - 4));
      let y = clamp(e.clientY - offY, 4, Math.max(4, vh - h - 4));
      box.style.left = x + 'px';
      box.style.top = y + 'px';
    }
    function onUp(e) {
      if (!dragging || e.pointerId !== pid) return;
      dragging = false; document.body.style.userSelect = '';
      grip.releasePointerCapture(pid); pid = null;
      clampAndSavePosition();
    }
    grip.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', () => { if (Number.isFinite(CFG.panel?.x)) clampAndSavePosition(); });
  })();

  // ===== スクロール基盤 =====
  let SCROLLERS = [], PRIMARY = null;
  const isRoot = (el) => el === document.scrollingElement || el === document.documentElement || el === document.body;

  const isScrollable = (el) => { if (!el) return false; const c = getComputedStyle(el); return /(auto|scroll|overlay)/.test(c.overflowY) && (el.scrollHeight - el.clientHeight > 2); };
  const isSidebarLike = (el) => { const aria = (el.getAttribute?.('aria-label') || '').toLowerCase(); const cls = (el.className || '') + ' ' + (el.id || ''); const tag = (el.tagName || '').toLowerCase(); return tag === 'nav' || tag === 'aside' || aria.includes('chat history') || aria.includes('チャット履歴') || /sidebar|history/i.test(cls); };
  function firstVisibleArticle() { const arts = [...document.querySelectorAll('article')].filter(a => { const r = a.getBoundingClientRect(), st = getComputedStyle(a); return st.display !== 'none' && st.visibility !== 'hidden' && r.height > 4; }); arts.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); return arts[0] || document.querySelector('main') || document.body; }
  function collectScrollers() {
    const base = firstVisibleArticle(); const set = new Set();
    set.add(document.scrollingElement || document.documentElement || document.body);
    set.add(document.documentElement); set.add(document.body);
    for (let n = base; n && n !== document.documentElement && n !== document.body; n = n.parentElement) { if (isSidebarLike(n)) continue; if (isScrollable(n)) set.add(n); }
    SCROLLERS = [...set].filter(isScrollable); if (!SCROLLERS.length) SCROLLERS = [document.scrollingElement || document.documentElement || document.body];
    const rest = (el) => isRoot(el)
      ? Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight, document.body.clientHeight, document.documentElement.clientHeight) - (window.innerHeight | 0)
      : (el.scrollHeight - el.clientHeight);
    PRIMARY = SCROLLERS.slice().sort((a, b) => rest(b) - rest(a))[0] || SCROLLERS[0];
  }
  collectScrollers();

  const getViewportH = (sc) => isRoot(sc) ? window.innerHeight : sc.clientHeight;
  const getDocH = (sc) => isRoot(sc)
    ? Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight, document.body.clientHeight, document.documentElement.clientHeight)
    : sc.scrollHeight;

// 置き換え：ユーザー/アシスタントで先頭ノードを見つける
function headNodeOf(article) {
  const turn = article.getAttribute('data-turn'); // 'user' | 'assistant' | ...
  if (turn === 'user') {
    // ユーザーはオレンジの外枠（青の外）を最優先
    // :scope を付けて直下だけを狙うことで誤爆を避ける
    const box = article.querySelector(':scope > div.text-base');
    if (box) return box;
  }
  // アシスタントは従来どおり（青内側でOK）。簡易フォールバック：
  const cands = article.querySelectorAll(
    'h1,h2,h3,h4,p,li,pre,code,blockquote,div,section'
  );
  for (const el of cands) {
    const cs = getComputedStyle(el);
    const r  = el.getBoundingClientRect();
    if (r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none') return el;
  }
  return article;
}

// 置き換え：記事のページ絶対Y（※paddingは加えない）
function articleTop(sc, article) {
  const node    = headNodeOf(article);
  const rootTop = isRoot(sc) ? 0 : sc.getBoundingClientRect().top;
  const r       = node.getBoundingClientRect();
  // content-box の上端 = top + borderTop（paddingは足さない）
  const borderT = parseFloat(getComputedStyle(node).borderTopWidth) || 0;
  return (r.top + borderT) - rootTop + getScrollTop(sc);
}


// （もし他でも先頭座標を使っていれば同様に）
function pageTopYFor(sc, el) {
  const target = headNodeOf(el) || el;
  const rootTop = isRoot(sc) ? 0 : sc.getBoundingClientRect().top;
  const st = getComputedStyle(target);
  const padTop = parseFloat(st.paddingTop) || 0;
  return (target.getBoundingClientRect().top + padTop) - rootTop + getScrollTop(sc);
}

  const getScrollTop = (sc) => isRoot(sc) ? window.scrollY : sc.scrollTop;

  // スクロールロック
  let programmaticScrollLock = 0;
  function lockFor(ms) { programmaticScrollLock = performance.now() + ms; const tick = () => { if (performance.now() < programmaticScrollLock) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  const isLocked = () => performance.now() < programmaticScrollLock;

  function scrollEachTo(topByScroller) {
    SCROLLERS.forEach(sc => {
      const top = topByScroller(sc);
      const t = clamp(top, 0, Math.max(0, getDocH(sc) - getViewportH(sc)));
      if (isRoot(sc)) window.scrollTo({ top: t, behavior: 'smooth' });
      else sc.scrollTo({ top: t, behavior: 'smooth' });
    });
  }
  const bottomTop = (sc) => Math.max(0, getDocH(sc) - getViewportH(sc));
  const scrollToAbsoluteBottom = () => { lockFor(CFG.lockMs); scrollEachTo(sc => bottomTop(sc)); };

  // ===== article 収集 =====
  function pickAllArticles() {
    const arts = Array.from(document.querySelectorAll('article')).filter(a => {
      const r = a.getBoundingClientRect(), st = getComputedStyle(a);
      return st.display !== 'none' && st.visibility !== 'hidden' && r.height > 4;
    });
    arts.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return arts;
  }
  function pickArticlesByRole(role) {
    const roleNodes = Array.from(document.querySelectorAll(`[data-message-author-role="${role}"]`));
    const fromRole = roleNodes.map(n => n.closest('article')).filter(Boolean);
    const all = pickAllArticles();
    const extra = all.filter(a => a.querySelector(`[data-message-author-role="${role}"]`));
    const set = new Set([...fromRole, ...extra]);
    const list = Array.from(set);
    list.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return list;
  }

  // ===== 状態 =====
  const state = { all: [], user: [], assistant: [], idx: { all: 0, user: 0, assistant: 0 } };


  // === 可視ライン：薄いアダプタ（新：shared.js に委譲） ===
  function applyVizFromCfg() {
    try { CG?.renderViz?.(CFG); } catch {}
  }
  // Console互換（明示呼び出しできるように）
  window.toggleVizLines = (...a) => CG?.toggleVizLines?.(...a);

  // ※ shared.js の computeAnchor を利用して“正”を取る
  function anchorY() {
    try {
      return (window.CGTN?.computeAnchor?.(CFG)?.y) | 0;
    } catch {
      // フォールバック（万一 shared がない時）
      const vh = window.innerHeight | 0;
      return Math.round(vh * CFG.centerBias - CFG.headerPx);
    }
  }
  
  function baseY() {
    // 画面中央線のページ絶対Y
    const sc = PRIMARY || SCROLLERS[0];
    return getScrollTop(sc) + anchorY();
  }
  
  // 画面基準 y*（理論値）を常に shared.js から取る
  function currentAnchor() {
    const { centerBias, headerPx } = CFG;
    const vh = getViewportH(PRIMARY || SCROLLERS[0]);
    // round で積み上がりを抑える
    return Math.round(vh * centerBias - headerPx);
  }
  
  // 現在/次/前の “index” を EPS 判定で選ぶ
  function indexByAnchor(list) {
    if (!list.length) return { cur: 0, prev: 0, next: 0 };
    const sc = PRIMARY || SCROLLERS[0];
    const tops = list.map(a => articleTop(sc, a));
    const yStar = getScrollTop(sc) + currentAnchor();  // 画面座標での基準線
  
    // cur: y* 以下で最も近い
    let cur = 0;
    for (let i = 0; i < tops.length; i++) {
      if (tops[i] <= yStar) cur = i; else break;
    }
  
    // next: y* + EPS より下で最小
    let next = cur;
    for (let i = cur + 1; i < tops.length; i++) {
      if (tops[i] > yStar + CFG.eps) { next = i; break; }
    }
  
    // prev: y* - EPS より上で最大
    let prev = cur;
    for (let i = cur - 1; i >= 0; i--) {
      if (tops[i] < yStar - CFG.eps) { prev = i; break; }
    }
  
    return { cur, prev, next };
  }
  
  function rebuild() {
    collectScrollers();
    state.all = pickAllArticles();
    state.user = pickArticlesByRole('user');
    state.assistant = pickArticlesByRole('assistant');

    if (!isLocked()) {
      // ここを統一
      let idx = indexByAnchor(state.all);
      state.idx.all = idx.cur;
      idx = indexByAnchor(state.user);
      state.idx.user = idx.cur;
      idx = indexByAnchor(state.assistant);
      state.idx.assistant = idx.cur;
    }

    updateDisabled();
    attachScrollListeners();
    // ラインは shared.js 側ですでに同期されるが、念のため一回反映
    try { CG?.renderViz?.(CFG); } catch {}
  }

  // ナビゲーション実行部分
/*
  function makeNav(role) {
    const getList = () => state[role];
    return {
      goTop() {
        const L = getList();
        if (!L.length) { scrollToAbsoluteBottom(); return; }
        state.idx[role] = 0;
        scrollToHead(L[0], role);
      },
      goBottom() {
        if (role === 'all') {
          state.idx.all = state.all.length - 1;
          scrollToAbsoluteBottom();
          return;
         }
        const L = getList();
        if (!L.length) {
          scrollToAbsoluteBottom(); return; 
        }
        state.idx[role] = L.length - 1;
        scrollToHead(L[L.length - 1], role);
      },
      goPrev() {
        const L = getList(); if (!L.length) return;
        const idx = indexByAnchor(L);
        const j = idx.prev;
        state.idx[role] = j; scrollToHead(L[j], role);
      },
      goNext() {
        const L = getList(); if (!L.length) return;
        const idx = indexByAnchor(L);
        const j = idx.next;
        state.idx[role] = j; scrollToHead(L[j], role);
      }
    };
  }
*/
function makeNav(role) {
  const getList = () => state[role];
  return {
    goTop(){
      const L = getList();
      if (!L.length) return scrollToAbsoluteBottom();
      state.idx[role] = 0;
      scrollToHead(L[0], role);
    },
    goBottom(){
      const L = getList();
      if (!L.length){
        scrollToAbsoluteBottom();
        return; 
      }
      if (role === 'all') {
        state.idx.all = L.length - 1;
        scrollToAbsoluteBottom();
        return;
      }
      state.idx[role] = L.length - 1;
      scrollToHead(L[L.length - 1], role);
    },
    goPrev(){
      const L = getList();
      if (!L.length) return;
      const k = currentIndex(L);
      const j = Math.max(0, k - 1);
      state.idx[role] = j;
      scrollToHead(L[j], role); },
    goNext(){
      const L = getList();
      if (!L.length) return;
      const k = currentIndex(L);
      const j = Math.min(L.length - 1, k + 1);
      state.idx[role] = j;
      scrollToHead(L[j], role); 
     }
  };
}

  const nav = { user: makeNav('user'), assistant: makeNav('assistant'), all: makeNav('all') };

function currentIndex(list) {
  if (!list.length) return 0;
  const sc = PRIMARY || SCROLLERS[0];
  const yStar = getScrollTop(sc) + anchorY();    // 共有の理論 y*
  const tops  = list.map(a => articleTop(sc, a)); // ※ articleTop は本文 content-top を返す版
  let best = 0, d = Infinity;
  for (let i = 0; i < tops.length; i++) {
    const dd = Math.abs(tops[i] - yStar);
    if (dd < d) { d = dd; best = i; }
  }
  return best; // ← “最も近い”ただ一つ
}


function scrollToHead(article, roleForIdx) {
  if (!article) return;
  lockFor(CFG.lockMs);

  const sc = PRIMARY || SCROLLERS[0];

  // ★記事内の本文先頭要素を取得
  const node = headNodeOf(article) || article;
  const rootTop = isRoot(sc) ? 0 : sc.getBoundingClientRect().top;
  const targetTop = node.getBoundingClientRect().top - rootTop + getScrollTop(sc);

  // 中央線にぴったり合わせる
  const vh = getViewportH(sc);
  const anchor = Math.round(vh * CFG.centerBias - CFG.headerPx);
  const desired = clamp(Math.round(targetTop - anchor), 0, Math.max(0, getDocH(sc) - vh));

  if (isRoot(sc)) window.scrollTo({ top: desired, behavior: 'smooth' });
  else sc.scrollTo({ top: desired, behavior: 'smooth' });

  // index 更新
  setTimeout(() => {
    if (!roleForIdx) return;
    const L = state[roleForIdx];
    const i = L.indexOf(article);
    if (i >= 0) state.idx[roleForIdx] = i;
  }, CFG.lockMs + 10);
}


  // ※ shared.js の computeAnchor を利用して“正”を取る
  function anchorY() {
    try { return (window.CGTN?.computeAnchor?.(CFG)?.y) | 0; }
    catch { return Math.round((window.innerHeight|0) * CFG.centerBias - CFG.headerPx); }
  }

  // 画面基準 y*（理論値）は anchorY() を直接返す（高さの二重管理をやめる）
  function currentAnchor() { return anchorY(); }


  function updateDisabled() {
    ['user', 'assistant', 'all'].forEach(role => {
      const grp = box.querySelector(`.cgpt-nav-group[data-role="${role}"]`);
      const on = !!state[role].length || role === 'all';
      grp?.querySelectorAll('button').forEach(b => {
        if (!b.classList.contains('cgpt-lang-btn')) {
          b.classList.toggle('cgpt-disabled', !on && !b.classList.contains('cgpt-lang-btn'));
        }
      });
    });
  }

  // ====== クリック ======
  box.addEventListener('click', (e) => {
    const langBtn = (e.target instanceof Element) ? e.target.closest('.cgpt-lang-btn') : null;
    if (langBtn) { toggleLang(); return; }

    const btn = (e.target instanceof Element) ? e.target.closest('button[data-act]') : null;
    if (!btn) return;
    const act = btn.dataset.act;
    const role = btn.closest('.cgpt-nav-group')?.dataset?.role;
    nav[role]?.[act === 'top' ? 'goTop' : act === 'bottom' ? 'goBottom' : act === 'prev' ? 'goPrev' : 'goNext']?.();
  }, { capture: true });

  // ====== ハイライト ======
  function reflectRoleHighlight(roleToHighlight = null, blink = false) {
    if (blink) {
      const now = performance.now();
      if (_blinkState.role === roleToHighlight && (now - _blinkState.at) < 300) {
        return;
      }
      _blinkState = { role: roleToHighlight, at: now };
    }

    const groups = document.querySelectorAll('[data-role]');
    groups.forEach(g => {
      const isTarget = roleToHighlight === null ? true : (g.dataset.role === roleToHighlight);
      g.classList.toggle('cgpt-active', isTarget);
    });

    if (blink) {
      const targets = Array.from(groups).filter(g =>
        roleToHighlight === null || g.dataset.role === roleToHighlight
      );
      targets.forEach(t => { t.classList.remove('cgpt-blink'); t.offsetWidth; t.classList.add('cgpt-blink'); });
    }
  }

  // ====== キーボード ======
  function modifierOk(e, mod) {
    if (mod === 'None') return !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey;
    if (mod === 'Alt') return e.altKey && !e.ctrlKey && !e.metaKey;
    if (mod === 'Ctrl') return e.ctrlKey && !e.altKey && !e.metaKey;
    if (mod === 'Shift') return e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
    if (mod === 'Meta') return e.metaKey && !e.ctrlKey && !e.altKey;
    return false;
  }
  function isEditable(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    const ce = el.closest('[contenteditable=""],[contenteditable="true"]');
    return tag === 'input' || tag === 'textarea' || !!ce;
  }

  function setRole(role) {
    if (!['user', 'assistant', 'all'].includes(role)) return;
    saveSettingsPatch({ hotkeys: { targetRole: role } });
    reflectRoleHighlight(role, true);
  }

  function handleHotkey(e) {
    if (!e.ctrlKey && !e.metaKey && e.altKey && !e.shiftKey && (e.key || '').toLowerCase() === 'l') {
      e.preventDefault(); e.stopPropagation(); toggleLang(); return;
    }
    if (!CFG.hotkeys.enabled) return;
    if (!CFG.hotkeys.allowInInputs && isEditable(e.target)) return;

    if (modifierOk(e, CFG.hotkeys.modifier)) {
      const key = (e.code || (e.key.length === 1 ? e.key.toUpperCase() : e.key));
      if (key === CFG.hotkeys.keys.roleUser) { e.preventDefault(); e.stopPropagation(); setRole('user'); return; }
      if (key === CFG.hotkeys.keys.roleAssistant) { e.preventDefault(); e.stopPropagation(); setRole('assistant'); return; }
      if (key === CFG.hotkeys.keys.roleAll) { e.preventDefault(); e.stopPropagation(); setRole('all'); return; }
    }

    if (!modifierOk(e, CFG.hotkeys.modifier)) return;
    const keyName = (e.code || (e.key.length === 1 ? e.key.toUpperCase() : e.key));
    const role = CFG.hotkeys.targetRole || 'assistant';
    const map = CFG.hotkeys.keys;
    if (keyName === map.prev || keyName === map.next || keyName === map.top || keyName === map.bottom) {
      e.preventDefault(); e.stopPropagation();
      if (keyName === map.prev) nav[role].goPrev();
      else if (keyName === map.next) nav[role].goNext();
      else if (keyName === map.top) nav[role].goTop();
      else if (keyName === map.bottom) nav[role].goBottom();
    }
  }
  window.addEventListener('keydown', handleHotkey, true);

  // ===== スクロール追従 =====
  let scrollTimer = 0, attached = [];

// 置き換え（onScroll）
/*
function onScroll() {
  if (isLocked()) return;
  cancelAnimationFrame(scrollTimer);
  scrollTimer = requestAnimationFrame(() => {
    let idx = indexByAnchor(state.all);
    state.idx.all = idx.cur;
    idx = indexByAnchor(state.user);
    state.idx.user = idx.cur;
    idx = indexByAnchor(state.assistant);
    state.idx.assistant = idx.cur;
  });
}
*/
function onScroll() {
  if (isLocked()) return;
  cancelAnimationFrame(scrollTimer);
  scrollTimer = requestAnimationFrame(() => {
    state.idx.all       = currentIndex(state.all);
    state.idx.user      = currentIndex(state.user);
    state.idx.assistant = currentIndex(state.assistant);
  });
}

  function attachScrollListeners() {
    attached.forEach(sc => sc.removeEventListener('scroll', onScroll, { passive: true }));
    attached = [];
    SCROLLERS.forEach(sc => { sc.addEventListener('scroll', onScroll, { passive: true }); attached.push(sc); });
  }

  document.addEventListener('cgpt:toggleViz', (e) => {
    const force = e.detail?.force;
    toggleVizLines(force);
  });

  // ===== DOM監視 & リサイズ =====
  const mo = new MutationObserver(() => rebuild());
  mo.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', () => { rebuild(); if (Number.isFinite(CFG.panel?.x)) clampAndSavePosition(); });


  // Console（ページ側）→ content.js へ橋渡し（postMessage 版）
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const m = e.data;
    if (!m || m.__cgpt_nav !== true) return;
    if (m.cmd === 'toggleViz') {
      toggleVizLines(m.force);
    }
  });

  // ===== 設定変更の即時反映 =====
  // 起動時：設定を取り込んで一度だけ描画
  try {
    chrome.storage.sync.get('cgNavSettings', ({ cgNavSettings }) => {
      CFG = { ...CFG, ...(cgNavSettings || {}) };
      applyVizFromCfg();
    });
  } catch {}

  // 設定変更は一箇所で
  try {
    chrome.storage.onChanged.addListener((c, area) => {
      if (area === 'sync' && c.cgNavSettings) {
        CFG = { ...CFG, ...(c.cgNavSettings.newValue || {}) };
        applyVizFromCfg();         // ← 位置だけ更新（表示状態は shared 側が保持）
        // 既存の rebuild() 呼び出しが別にあるなら、二重にならないよう注意
      }
    });
  } catch {}

  // 初期化
  loadLang(() => {
    applyLang();
    loadSettings(() => {
      applyPanelPosition();
      applyVizFromCfg();
      rebuild();
    });
  });
})();

