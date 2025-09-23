// logic.js — 会話リスト（ページング付）/ 位置決め / 再構築
(() => {
  const SH = window.CGTN_SHARED;   // 設定API（DEFAULTS/CFGロード・保存・基準線計算…）
  const UI = window.CGTN_UI;       // UIヘルパ（言語反映・パネル位置クランプ等）

  const NS = (window.CGTN_LOGIC = window.CGTN_LOGIC || {});
  const TURN_SEL = 'div[data-testid^="conversation-turn-"]';

  // 他ファイルからも使えるように公開（既存の公開パターンに合わせて）
  window.CGTN_APP = Object.assign(window.CGTN_APP || {}, {
    rebuild,
    rebuildAndMaybeRenderList
  });


  // ------- 基本ユーティリティ -------

  // 必要なときだけリストを再描画
  function rebuildAndMaybeRenderList() {
    rebuild();
    if (isListEnabled() && typeof renderList === 'function') {
      try { renderList(); } catch {}
    }
  }

  function isListEnabled() {
    try {
      return !!(window.CGTN_SHARED?.getCFG?.().list?.enabled);
    } catch { return false; }
  }

  function isVisible(el){
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function getTrueScroller(){
    if (NS._scroller && document.body.contains(NS._scroller)) return NS._scroller;
    const isScrollable = (el)=>el && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight>el.clientHeight;
    const first = document.querySelector(TURN_SEL) || document.querySelector('[data-message-author-role]');
    if (first){
      for (let p = first.parentElement; p && p!==document.body; p=p.parentElement){
        if (isScrollable(p)) { NS._scroller = p; return p; }
      }
    }
    NS._scroller = document.scrollingElement || document.documentElement;
    return NS._scroller;
  }

  function headNodeOf(article){
    const pick = (root, sel) => {
      const n = (root || article).querySelector(sel);
      return n && isVisible(n) ? n : null;
    };
    const isAssistant = article.matches('[data-message-author-role="assistant"]')
                     || !!article.querySelector('[data-message-author-role="assistant"]');
    const isUser      = article.matches('[data-message-author-role="user"]')
                     || !!article.querySelector('[data-message-author-role="user"]');
    if (isAssistant){
      return pick(article, ':scope > div') || pick(article, 'div.text-base') || pick(article, 'div.markdown') || article;
    }
    if (isUser){
      const wrap = pick(article, 'div.flex.justify-end') || pick(article, 'div.items-end') || article;
      const firstVisibleChild = Array.from(wrap.children).find(isVisible);
      return firstVisibleChild || article;
    }
    return article;
  }

  function articleTop(scroller, article){
    const node = headNodeOf(article);
    const scR = scroller.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return scroller.scrollTop + (r.top - scR.top);
  }

  function currentAnchorY(){
    const { y } = SH.computeAnchor(SH.getCFG());
    return y;
  }

  // ------- スクロール制御 -------
  let _lockUntil = 0;
  const isLocked = () => performance.now() < _lockUntil;
  function lockFor(ms){ _lockUntil = performance.now() + (Number(ms)||0); }

  function scrollToHead(article){
    if (!article) return;
    const sc = getTrueScroller();
    const anchor = currentAnchorY();
    const desired = Math.round(articleTop(sc, article) - anchor);
    const maxScroll = Math.max(0, sc.scrollHeight - sc.clientHeight);
    const clamped = Math.min(maxScroll, Math.max(0, desired));
    lockFor(SH.getCFG().lockMs);
    sc.scrollTo({ top: clamped, behavior: 'smooth' });
  }

  // ------- 会話の収集 / ソート -------
  function pickAllTurns(){
    let list = Array.from(document.querySelectorAll(TURN_SEL));
    if (!list.length){
      const seen = new Set();
      const nodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
      list = nodes.map(n => n.closest(TURN_SEL) || n).filter(el => el && !seen.has(el) && (seen.add(el), true));
    }
    return list.filter(a => a.getBoundingClientRect().height > 10 && getComputedStyle(a).display !== 'none');
  }

  function sortByY(list){
    const sc = getTrueScroller();
    try {
      return list.map(el => ({ el, y: articleTop(sc, el) }))
                 .sort((a,b) => a.y - b.y)
                 .map(x => x.el);
    } catch { return list; }
  }

  function isRealTurn(article){
    const head = headNodeOf(article);
    if (!head) return false;
    const r = head.getBoundingClientRect();
    if (r.height < 8 || !isVisible(head)) return false;
    const txt = (head.textContent || head.innerText || '').trim();
    const hasText  = txt.length > 0;
    const hasMedia = !!head.querySelector('img,video,canvas,figure,[aria-haspopup="dialog"]');
    const looksBusy = head.getAttribute?.('aria-busy') === 'true';
    return (hasText || hasMedia) && !looksBusy;
  }

  // ------- 公開: rebuild / goXx など -------
  const ST = { all: [], user: [], assistant: [], page:1 }; // page = 1-based

  function rebuild() {
    if (isLocked && isLocked()) return;

    TRUE_SCROLLER = getTrueScroller();
    const allRaw = pickAllTurns().filter(isRealTurn);

    // 修正ポイント：引数は list のみ
    ST.all = sortByY(allRaw);

    ST.user = ST.all.filter(a => a.matches('[data-message-author-role="user"], div [data-message-author-role="user"]'));
    ST.assistant = ST.all.filter(a => a.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]'));

    if (typeof currentScrollerForListener !== 'undefined') {
      if (currentScrollerForListener !== TRUE_SCROLLER) {
        if (currentScrollerForListener) currentScrollerForListener.removeEventListener('scroll', rebuild);
        TRUE_SCROLLER.addEventListener('scroll', rebuild, { passive: true });
        currentScrollerForListener = TRUE_SCROLLER;
      }
    }
  }


  // ------- 一覧パネル（ページング付） -------
  let listBox = null;

  function ensureListBox(){
    if (listBox && document.body.contains(listBox)) return listBox;
    listBox = document.createElement('div');
    listBox.id = 'cgpt-list-panel';
    listBox.innerHTML = `
      <div id="cgpt-list-head">
        <div id="cgpt-list-grip" title="ドラッグで移動"></div>
        <button id="cgpt-list-close">閉じる</button>
      </div>
      <div id="cgpt-list-body"></div>
      <div id="cgpt-list-foot"></div>
    `;
    document.body.appendChild(listBox);

    // ドラッグ移動＆保存
    (function enableDrag(){
      const grip = listBox.querySelector('#cgpt-list-grip');
      let dragging=false, offX=0, offY=0;
      grip.addEventListener('pointerdown',e=>{
        dragging=true; const r=listBox.getBoundingClientRect();
        offX=e.clientX-r.left; offY=e.clientY-r.top;
        grip.setPointerCapture(e.pointerId);
      });
      window.addEventListener('pointermove',e=>{
        if(!dragging) return;
        listBox.style.left=(e.clientX-offX)+'px';
        listBox.style.top =(e.clientY-offY)+'px';
      },{passive:true});
      window.addEventListener('pointerup',e=>{
        if(!dragging) return;
        dragging=false; grip.releasePointerCapture(e.pointerId);
        const r=listBox.getBoundingClientRect();
        SH.saveSettingsPatch({ list:{ ...(SH.getCFG().list||{}), x:r.left, y:r.top } });
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

  function detectAttachmentKind(head){
    if (!head) return null;
    if (head.querySelector('video')) return '🎞';
    if (head.querySelector('img,canvas,figure')) return '🖼';
    if (head.querySelector('[aria-haspopup="dialog"]')) return '📑';
    if (/\.(pdf|docx?|xlsx?|pptx?)\b/i.test(head.innerText||'')) return '📄';
    return null;
  }

  function renderList(){

  const cfg = (SH && SH.getCFG && SH.getCFG()) || {};
//  if (!cfg.list || !cfg.list.enabled) {
//    console.warn("renderList: cfg.list が無効です！！");
//    return;
//  }

    const panel = ensureListBox();
    const body  = panel.querySelector('#cgpt-list-body');
    const foot  = panel.querySelector('#cgpt-list-foot');
    body.innerHTML = '';
    foot.innerHTML = '';

    const pageSize = Math.max(1, Number(cfg.list?.maxItems) || 30);
    const maxChars = Math.max(10, Number(cfg.list?.maxChars) || 40);
    const total    = ST.all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, ST.page));

    const start = (page-1)*pageSize;
    const slice = ST.all.slice(start, start + pageSize);

    for (const art of slice){

      const head = headNodeOf(art);
console.log("renderList head:", head, "text:", head?.innerText);

      let txt = (head?.innerText || '').replace(/\s+/g,' ').trim();
      if (!txt) txt = '';
      const clipped = txt.length > maxChars;
      if (clipped) txt = txt.slice(0, maxChars);

      const icon = detectAttachmentKind(head) || '';
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <span class="clip" style="width:1.2em;display:inline-flex;justify-content:center">${icon}</span>
        <span class="txt">${txt}${clipped?'…':''}</span>
      `;
      row.addEventListener('click', ()=> scrollToHead(art));
      body.appendChild(row);
    }

    const count = document.createElement('div');
    count.style.cssText = 'margin-right:auto;opacity:.8;font-size:12px';
    const shownTo = Math.min(total, start + slice.length);
    count.textContent = `${shownTo}/${total}`;

    const pager = document.createElement('div');
    pager.style.cssText = 'display:flex;gap:6px;align-items:center';

    function mkBtn(lbl, onClick, disabled=false){
      const b = document.createElement('button');
      b.textContent = lbl;
      b.style.cssText = 'all:unset;border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:4px 8px;cursor:pointer;opacity:'+(disabled?'.35':'1');
      if (!disabled) b.addEventListener('click', onClick);
      return b;
    }

    pager.appendChild(mkBtn('前へ', ()=>{ ST.page=Math.max(1,page-1); renderList(); }, page<=1));
    const win = 10;
    let pStart = Math.max(1, page - Math.floor(win/2));
    let pEnd   = Math.min(totalPages, pStart + win - 1);
    if (pEnd - pStart + 1 < win) pStart = Math.max(1, pEnd - win + 1);

    for (let p=pStart; p<=pEnd; p++){
      const b = mkBtn(String(p), ()=>{ ST.page=p; renderList(); }, false);
      if (p===page) b.style.cssText += 'background:#f2f2f7';
      pager.appendChild(b);
    }
    pager.appendChild(mkBtn('次へ', ()=>{ ST.page=Math.min(totalPages,page+1); renderList(); }, page>=totalPages));

    foot.appendChild(count);
    foot.appendChild(pager);
  }

  // ------- パブリックAPI -------
  function setListEnabled(on){
    const cfg = SH.getCFG();
    SH.saveSettingsPatch({ list:{ ...(cfg.list||{}), enabled: !!on } });
    const panel = ensureListBox();
    panel.style.display = on ? 'flex' : 'none';
    if (on) renderList();
  }

  function goTop(role){
    const L = role==='user' ? ST.user : role==='assistant' ? ST.assistant : ST.all;
    if (!L.length) return;
    scrollToHead(L[0]);
  }
  function goBottom(role){
    const sc = getTrueScroller();
    if (role==='all'){
      lockFor(SH.getCFG().lockMs);
      sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
      return;
    }
    const L = role==='user' ? ST.user : ST.assistant;
    if (!L.length) return;
    scrollToHead(L[L.length-1]);
  }
  function goPrev(role){
    const L = role==='user' ? ST.user : role==='assistant' ? ST.assistant : ST.all;
    if (!L.length) return;
    const sc = getTrueScroller();
    const yStar = sc.scrollTop + currentAnchorY();
    const eps = Number(SH.getCFG().eps)||0;
    for (let i=L.length-1;i>=0;i--){
      if (articleTop(sc, L[i]) < yStar - eps) { scrollToHead(L[i]); return; }
    }
  }
  function goNext(role){
    const L = role==='user' ? ST.user : role==='assistant' ? ST.assistant : ST.all;
    if (!L.length) return;
    const sc = getTrueScroller();
    const yStar = sc.scrollTop + currentAnchorY();
    const eps = Number(SH.getCFG().eps)||0;
    for (const el of L){
      if (articleTop(sc, el) > yStar + eps) { scrollToHead(el); return; }
    }
  }


  (function exposeApp(){
    function isListEnabled(){
      try { return !!(window.CGTN_SHARED?.getCFG?.().list?.enabled); }
      catch { return false; }
    }
    function rebuildAndMaybeRenderList(){
      try { window.CGTN_LOGIC?.rebuild?.(); } catch {}
      if (isListEnabled() && typeof window.CGTN_LOGIC?.renderList === 'function') {
        try { window.CGTN_LOGIC.renderList(); } catch {}
      }
    }
    window.CGTN_APP = Object.assign(window.CGTN_APP || {}, {
      rebuildAndMaybeRenderList
    });
  })();

  // デバッグ用: 現在のターン数を出す
  NS._debugAll = function(){
    const all = pickAllTurns();
    console.log("pickAllTurns() count:", all.length, all);
    console.log("ST.all count:", ST.all.length, ST.all);
    return ST.all;
  };


  // 公開
  NS.rebuild = rebuild;
  NS.setListEnabled = setListEnabled;
  NS.goTop = goTop;
  NS.goBottom = goBottom;
  NS.goPrev = goPrev;
  NS.goNext = goNext;
})();
