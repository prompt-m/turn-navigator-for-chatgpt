// == ChatGPT turn navigator – nav panel + hotkeys + role switching + draggable + EN/JA toggle ==
(function () {
  if (document.getElementById('cgpt-nav')) return;

  // ===== 既定設定 =====
  const DEFAULTS = {
    centerBias: 0.46,
    headerPx: 48,
    lockMs: 700,
    eps: 6,
    panel: { x: null, y: null }, // パネル位置（left/top px）
    hotkeys: {
      enabled: true,
      targetRole: 'assistant',   // 'assistant' | 'user' | 'all'
      modifier: 'Alt',           // 'Alt' | 'Ctrl' | 'Shift' | 'Meta' | 'None'
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

  // ====== 言語定義 / 保存 ======
  const I18N = {
    ja: {
      user:'ユーザー', assistant:'アシスタント', all:'全体',
      top:'先頭', prev:'前へ', next:'次へ', bottom:'末尾',
      langBtn:'English', dragTitle:'ドラッグで移動'
    },
    en: {
      user:'User', assistant:'Assistant', all:'All',
      top:'Top', prev:'Prev', next:'Next', bottom:'Bottom',
      langBtn:'日本語', dragTitle:'Drag to move'
    }
  };
  let LANG = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  function saveLang(l){ try{ chrome?.storage?.sync?.set?.({ cgNavLang:l }); }catch{} }
  function loadLang(cb){
    try{
      chrome?.storage?.sync?.get?.('cgNavLang', ({ cgNavLang })=>{
        if (cgNavLang) LANG = cgNavLang;
        cb && cb();
      });
    }catch{ cb && cb(); }
  }

  // ===== 設定ロード/マージ =====
  function deepMerge(dst, src){
    for(const k in src){
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) dst[k] = deepMerge(dst[k] || {}, src[k]);
      else dst[k] = src[k];
    }
    return dst;
  }
  function loadSettings(cb){
    try{
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings })=>{
        CFG = deepMerge(structuredClone(DEFAULTS), cgNavSettings || {});
        cb && cb();
      });
    }catch{ cb && cb(); }
  }
  function saveSettingsPatch(patch){
    try{
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings })=>{
        const s = deepMerge(structuredClone(CFG), cgNavSettings || {});
        deepMerge(s, patch);
        chrome?.storage?.sync?.set?.({ cgNavSettings: s });
        CFG = s;
      });
    }catch{}
  }

  // ===== スタイル =====
  (function css(h){const s=document.createElement('style');s.textContent=h;document.head.appendChild(s);})(`
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
    /* ロール別の淡い色味 */
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

    /* 言語切替ボタン */
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
  function applyLang(){
    const t = I18N[LANG] || I18N.ja;
    box.querySelectorAll('[data-i18n]').forEach(el=>{
      const k = el.getAttribute('data-i18n');
      if (t[k]) el.textContent = t[k];
    });
    const drag = box.querySelector('#cgpt-drag');
    if (drag) drag.title = t.dragTitle;
    const lb = box.querySelector('.cgpt-lang-btn');
    if (lb) lb.textContent = t.langBtn;
  }
  function toggleLang(){
    LANG = (LANG==='ja' ? 'en' : 'ja');
    saveLang(LANG);
    applyLang();
  }

  // ===== パネル位置の適用 =====
  function clamp(n, lo, hi){ return Math.min(hi, Math.max(lo, n|0)); }
  function applyPanelPosition(){
    const { x, y } = CFG.panel || {};
    if (Number.isFinite(x) && Number.isFinite(y)) {
      box.style.left = x + 'px';
      box.style.top  = y + 'px';
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    } else {
      // 既定の右下寄せ
      box.style.left = 'auto';
      box.style.top  = 'auto';
      box.style.right = '12px';
      box.style.bottom = '140px';
    }
  }
  function clampAndSavePosition(){
    const r = box.getBoundingClientRect();
    const vw = window.innerWidth|0, vh = window.innerHeight|0;
    const x = clamp(r.left, 4, Math.max(4, vw - r.width - 4));
    const y = clamp(r.top,  4, Math.max(4, vh - r.height - 4));
    box.style.left = x + 'px';
    box.style.top  = y + 'px';
    box.style.right = 'auto';
    box.style.bottom = 'auto';
    saveSettingsPatch({ panel:{ x, y } });
  }

  // ===== ドラッグ（pointer events） =====
  (function enableDragging(){
    const grip = box.querySelector('#cgpt-drag');
    let dragging = false, offX = 0, offY = 0, pid = null;

    function onDown(e){
      dragging = true; pid = e.pointerId;
      const r = box.getBoundingClientRect();
      offX = e.clientX - r.left; offY = e.clientY - r.top;
      box.style.left = (r.left) + 'px';
      box.style.top  = (r.top) + 'px';
      box.style.right = 'auto'; box.style.bottom='auto';
      grip.setPointerCapture(pid);
      document.body.style.userSelect = 'none';
      e.preventDefault();
    }
    function onMove(e){
      if (!dragging || e.pointerId!==pid) return;
      const vw = window.innerWidth|0, vh = window.innerHeight|0;
      const r = box.getBoundingClientRect();
      const w = r.width, h = r.height;
      let x = clamp(e.clientX - offX, 4, Math.max(4, vw - w - 4));
      let y = clamp(e.clientY - offY, 4, Math.max(4, vh - h - 4));
      box.style.left = x + 'px';
      box.style.top  = y + 'px';
    }
    function onUp(e){
      if (!dragging || e.pointerId!==pid) return;
      dragging = false; document.body.style.userSelect = '';
      grip.releasePointerCapture(pid); pid = null;
      clampAndSavePosition();
    }
    grip.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive:true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', ()=>{ if (Number.isFinite(CFG.panel?.x)) clampAndSavePosition(); });
  })();

  // ===== スクロール基盤 =====
  let SCROLLERS = [], PRIMARY = null;
  const isRoot = (el) => el === document.scrollingElement || el === document.documentElement || el === document.body;
  const isScrollable = (el)=>{ if(!el) return false; const c=getComputedStyle(el); return /(auto|scroll|overlay)/.test(c.overflowY) && (el.scrollHeight-el.clientHeight>2); };
  const isSidebarLike = (el)=>{ const aria=(el.getAttribute?.('aria-label')||'').toLowerCase(); const cls=(el.className||'')+' '+(el.id||''); const tag=(el.tagName||'').toLowerCase(); return tag==='nav'||tag==='aside'||aria.includes('chat history')||aria.includes('チャット履歴')||/sidebar|history/i.test(cls); };
  function firstVisibleArticle(){ const arts=[...document.querySelectorAll('article')].filter(a=>{const r=a.getBoundingClientRect(), st=getComputedStyle(a); return st.display!=='none'&&st.visibility!=='hidden'&&r.height>4;}); arts.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top); return arts[0]||document.querySelector('main')||document.body; }
  function collectScrollers(){
    const base = firstVisibleArticle(); const set=new Set();
    set.add(document.scrollingElement||document.documentElement||document.body);
    set.add(document.documentElement); set.add(document.body);
    for(let n=base; n && n!==document.documentElement && n!==document.body; n=n.parentElement){ if(isSidebarLike(n)) continue; if(isScrollable(n)) set.add(n); }
    SCROLLERS=[...set].filter(isScrollable); if(!SCROLLERS.length) SCROLLERS=[document.scrollingElement||document.documentElement||document.body];
    const rest=(el)=> isRoot(el)
      ? Math.max(document.body.scrollHeight,document.documentElement.scrollHeight,document.body.offsetHeight,document.documentElement.offsetHeight,document.body.clientHeight,document.documentElement.clientHeight)-(window.innerHeight|0)
      : (el.scrollHeight - el.clientHeight);
    PRIMARY = SCROLLERS.slice().sort((a,b)=>rest(b)-rest(a))[0]||SCROLLERS[0];
  }
  collectScrollers();

  const getScrollTop = (sc)=> isRoot(sc) ? window.scrollY : sc.scrollTop;
  const getViewportH = (sc)=> isRoot(sc) ? window.innerHeight : sc.clientHeight;
  const getDocH = (sc)=> isRoot(sc)
    ? Math.max(document.body.scrollHeight,document.documentElement.scrollHeight,document.body.offsetHeight,document.documentElement.offsetHeight,document.body.clientHeight,document.documentElement.clientHeight)
    : sc.scrollHeight;
  function pageTopYFor(sc, el){
    const rootTop = isRoot(sc)?0:sc.getBoundingClientRect().top;
    return el.getBoundingClientRect().top - rootTop + getScrollTop(sc);
  }

  // スクロールロック
  let programmaticScrollLock = 0;
  function lockFor(ms){ programmaticScrollLock = performance.now()+ms; const tick=()=>{ if(performance.now()<programmaticScrollLock) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  const isLocked = ()=> performance.now() < programmaticScrollLock;

  function scrollEachTo(topByScroller){
    SCROLLERS.forEach(sc=>{
      const top = topByScroller(sc);
      const t = clamp(top, 0, Math.max(0, getDocH(sc) - getViewportH(sc)));
      if(isRoot(sc)) window.scrollTo({ top: t, behavior: 'smooth' });
      else sc.scrollTo({ top: t, behavior: 'smooth' });
    });
  }
  const bottomTop = (sc)=> Math.max(0, getDocH(sc) - getViewportH(sc));
  const scrollToAbsoluteBottom = ()=>{ lockFor(CFG.lockMs); scrollEachTo(sc=>bottomTop(sc)); };

  // ===== article 収集 =====
  function pickAllArticles(){
    const arts = Array.from(document.querySelectorAll('article')).filter(a=>{
      const r=a.getBoundingClientRect(), st=getComputedStyle(a);
      return st.display!=='none' && st.visibility!=='hidden' && r.height>4;
    });
    arts.sort((a,b)=>a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return arts;
  }
  function pickArticlesByRole(role){
    const roleNodes = Array.from(document.querySelectorAll(`[data-message-author-role="${role}"]`));
    const fromRole = roleNodes.map(n=>n.closest('article')).filter(Boolean);
    const all = pickAllArticles();
    const extra = all.filter(a=>a.querySelector(`[data-message-author-role="${role}"]`));
    const set = new Set([...fromRole, ...extra]);
    const list = Array.from(set);
    list.sort((a,b)=>a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return list;
  }

  // ===== 状態 =====
  const state = { all:[], user:[], assistant:[], idx:{ all:0, user:0, assistant:0 } };

  function baseY(){
    const sc = PRIMARY || SCROLLERS[0];
    return getScrollTop(sc) + (getViewportH(sc)*CFG.centerBias) - CFG.headerPx;
  }
  function guessIndex(list){
    if(!list.length) return 0;
    const b = baseY();
    const tops = list.map(el=>pageTopYFor(PRIMARY||SCROLLERS[0], el));
    let k = tops.findIndex(t => t >= b - CFG.eps);
    if (k === -1) k = tops.length;
    return clamp(k-1, 0, list.length-1);
  }
  function nextIndexByPosition(list){
    if(!list.length) return 0;
    const b = baseY();
    const tops = list.map(el=>pageTopYFor(PRIMARY||SCROLLERS[0], el));
    let j = tops.findIndex(t => t > b + CFG.eps);
    if (j === -1) j = list.length - 1;
    return j;
  }
  function prevIndexByPosition(list){
    if(!list.length) return 0;
    const b = baseY();
    const tops = list.map(el=>pageTopYFor(PRIMARY||SCROLLERS[0], el));
    let j = -1; for(let i=0;i<tops.length;i++){ if(tops[i] < b - CFG.eps) j=i; else break; }
    if (j < 0) j = 0;
    return j;
  }

  function rebuild(){
    collectScrollers();
    state.all = pickAllArticles();
    state.user = pickArticlesByRole('user');
    state.assistant = pickArticlesByRole('assistant');
    if(!isLocked()){
      state.idx.all = guessIndex(state.all);
      state.idx.user = guessIndex(state.user);
      state.idx.assistant = guessIndex(state.assistant);
    }
    updateDisabled();
    attachScrollListeners();
    reflectRoleHighlight();
  }

  function scrollToHead(el, roleForIdx){
    if(!el) return;
    lockFor(CFG.lockMs);
    scrollEachTo(sc=>{
      const top0 = pageTopYFor(sc, el);
      const vh   = getViewportH(sc);
      const dh   = getDocH(sc);
      return Math.max(0, Math.min(top0 - (vh*CFG.centerBias) + CFG.headerPx, dh - vh));
    });
    setTimeout(()=>{
      if (roleForIdx) {
        const list = state[roleForIdx];
        const i = list.indexOf(el);
        if (i >= 0) state.idx[roleForIdx] = i;
      }
    }, CFG.lockMs + 10);
  }

  function makeNav(role){
    const getList = () => state[role];
    return {
      goTop(){ const L=getList(); if(!L.length){ scrollToAbsoluteBottom(); return; } state.idx[role]=0; scrollToHead(L[0], role); },
      goBottom(){
        if (role==='all'){ state.idx.all=state.all.length-1; scrollToAbsoluteBottom(); return; }
        const L=getList(); if(!L.length){ scrollToAbsoluteBottom(); return; }
        state.idx[role]=L.length-1; scrollToHead(L[L.length-1], role);
      },
      goPrev(){ const L=getList(); if(!L.length) return; const j=prevIndexByPosition(L); state.idx[role]=j; scrollToHead(L[j], role); },
      goNext(){ const L=getList(); if(!L.length) return; const j=nextIndexByPosition(L); state.idx[role]=j; scrollToHead(L[j], role); }
    };
  }
  const nav = { user: makeNav('user'), assistant: makeNav('assistant'), all: makeNav('all') };

  function updateDisabled(){
    ['user','assistant','all'].forEach(role=>{
      const grp = box.querySelector(`.cgpt-nav-group[data-role="${role}"]`);
      const on = !!state[role].length || role==='all';
      grp?.querySelectorAll('button').forEach(b=>{
        if (!b.classList.contains('cgpt-lang-btn')) {
          b.classList.toggle('cgpt-disabled', !on && !b.classList.contains('cgpt-lang-btn'));
        }
      });
    });
  }

  // ====== クリック ======
  box.addEventListener('click', (e)=>{
    // 言語ボタン
    const langBtn = (e.target instanceof Element) ? e.target.closest('.cgpt-lang-btn') : null;
    if (langBtn){ toggleLang(); return; }

    const btn = (e.target instanceof Element) ? e.target.closest('button[data-act]') : null;
    if(!btn) return;
    const act = btn.dataset.act;
    const role = btn.closest('.cgpt-nav-group')?.dataset?.role;
    nav[role]?.[act === 'top' ? 'goTop' : act === 'bottom' ? 'goBottom' : act === 'prev' ? 'goPrev' : 'goNext']?.();
  }, { capture:true });

  // ====== ハイライト（現在ロール） ======
  function reflectRoleHighlight(blink=true){
    box.querySelectorAll('.cgpt-nav-group').forEach(g=>g.classList.remove('cgpt-active'));
    const g = box.querySelector(`.cgpt-nav-group[data-role="${CFG.hotkeys.targetRole}"]`);
    if (!g) return;
    g.classList.add('cgpt-active');
    if (blink){ setTimeout(()=> g.classList.remove('cgpt-active'), 900); }
  }

  // ====== キーボード ======
  function modifierOk(e, mod){
    if (mod==='None') return !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey;
    if (mod==='Alt')  return  e.altKey && !e.ctrlKey && !e.metaKey;
    if (mod==='Ctrl') return  e.ctrlKey && !e.altKey && !e.metaKey;
    if (mod==='Shift')return  e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
    if (mod==='Meta') return  e.metaKey && !e.ctrlKey && !e.altKey;
    return false;
  }
  function isEditable(el){
    if (!el) return false;
    const tag=(el.tagName||'').toLowerCase();
    const ce = el.closest('[contenteditable=""],[contenteditable="true"]');
    return tag==='input'||tag==='textarea'||!!ce;
  }
  function setRole(role){
    if (!['user','assistant','all'].includes(role)) return;
    saveSettingsPatch({ hotkeys:{ targetRole: role } });
    reflectRoleHighlight(true);
  }
  function handleHotkey(e){
    // Alt+L で言語切替（Ctrl/Metaなし）
    if(!e.ctrlKey && !e.metaKey && e.altKey && !e.shiftKey && (e.key||'').toLowerCase()==='l'){
      e.preventDefault(); e.stopPropagation(); toggleLang(); return;
    }
    if (!CFG.hotkeys.enabled) return;
    if (!CFG.hotkeys.allowInInputs && isEditable(e.target)) return;

    if (modifierOk(e, CFG.hotkeys.modifier)) {
      const key = (e.code || (e.key.length===1 ? e.key.toUpperCase() : e.key));
      if (key === CFG.hotkeys.keys.roleUser){ e.preventDefault(); e.stopPropagation(); setRole('user'); return; }
      if (key === CFG.hotkeys.keys.roleAssistant){ e.preventDefault(); e.stopPropagation(); setRole('assistant'); return; }
      if (key === CFG.hotkeys.keys.roleAll){ e.preventDefault(); e.stopPropagation(); setRole('all'); return; }
    }

    if (!modifierOk(e, CFG.hotkeys.modifier)) return;
    const keyName = (e.code || (e.key.length===1 ? e.key.toUpperCase() : e.key));
    const role = CFG.hotkeys.targetRole || 'assistant';
    const map = CFG.hotkeys.keys;
    if (keyName===map.prev || keyName===map.next || keyName===map.top || keyName===map.bottom){
      e.preventDefault(); e.stopPropagation();
      if (keyName===map.prev)   nav[role].goPrev();
      else if (keyName===map.next)   nav[role].goNext();
      else if (keyName===map.top)    nav[role].goTop();
      else if (keyName===map.bottom) nav[role].goBottom();
    }
  }
  window.addEventListener('keydown', handleHotkey, true);

  // ===== スクロール追従 =====
  let scrollTimer = 0, attached=[];
  function onScroll(){
    if (isLocked()) return;
    cancelAnimationFrame(scrollTimer);
    scrollTimer = requestAnimationFrame(()=>{
      state.idx.all = guessIndex(state.all);
      state.idx.user = guessIndex(state.user);
      state.idx.assistant = guessIndex(state.assistant);
    });
  }
  function attachScrollListeners(){
    attached.forEach(sc=> sc.removeEventListener('scroll', onScroll, { passive:true }));
    attached = [];
    SCROLLERS.forEach(sc=>{ sc.addEventListener('scroll', onScroll, { passive:true }); attached.push(sc); });
  }

  // ===== DOM監視 & リサイズ =====
  const mo = new MutationObserver(() => rebuild());
  mo.observe(document.body, { childList:true, subtree:true });
  window.addEventListener('resize', ()=>{ rebuild(); if (Number.isFinite(CFG.panel?.x)) clampAndSavePosition(); });

  // ===== 設定変更の即時反映 =====
  try{
    chrome?.storage?.onChanged?.addListener?.((changes,area)=>{
      if(area!=='sync' || !changes.cgNavSettings) return;
      CFG = deepMerge(structuredClone(DEFAULTS), changes.cgNavSettings.newValue || {});
      applyPanelPosition();
      rebuild();
    });
  }catch{}

  // 初期化
  loadLang(()=> {
    applyLang();
    loadSettings(()=> {
      applyPanelPosition();
      reflectRoleHighlight(false);
      rebuild();
    });
  });
})();
