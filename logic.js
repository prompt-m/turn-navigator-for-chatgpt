// logic.js
(() => {
  const SH = window.CGTN_SHARED;
  const NS = (window.CGTN_LOGIC = window.CGTN_LOGIC || {});
  const TURN_SEL = 'div[data-testid^="conversation-turn-"]';

  // --- util ---
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

  // ★スクロール用 厳しめ（既存のまま）
  function headNodeOf(article){
    if (!article) return null;
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

// === List Panel 専用（スクロールには未使用） ===================
// 本文候補をゆるめに拾う *前回の安定版*
function listHeadNodeOf(article){
  if (!article) return null;
  const q = [
    ':scope [data-message-author-role]', // 最上位ラッパ
    ':scope div.markdown',               // 回答本文
    ':scope div.text-base',              // 旧レイアウト本文
    ':scope .user-message-bubble',       // ユーザー気泡
    ':scope article', ':scope section', ':scope > div'
  ];
  for (const sel of q){
    const n = article.matches(sel) ? article : article.querySelector(sel);
    if (n && isVisible(n)) return n;
  }
  return article;
}

  // 添付検出：DOM のみ（テキストは付けない）
  function detectAttachmentKinds(head){
    if (!head) return [];
    const kinds = [];
    if (head.querySelector('video')) kinds.push('🎞');
    if (head.querySelector('img,picture,canvas,figure')) kinds.push('🖼');
    // ダウンロード系（明示的な要素のみ）
    if (head.querySelector('a[download], [data-testid*="download"], a[href$=".pdf"], a[href$=".doc"], a[href$=".docx"], a[href$=".xlsx"], a[href$=".pptx"]')) {
      kinds.push('📄');
    }
    return kinds;
  }

  // innerText が空のときだけ最小フォールバック
  function extractSummaryText(head, maxChars){
    let txt = (head?.innerText || '').replace(/\s+/g,' ').trim();
    if (!txt) {
      const figcap = head?.querySelector?.('figcaption')?.innerText?.trim();
      const alt    = head?.querySelector?.('img[alt]')?.getAttribute('alt')?.trim();
      const aria   = head?.getAttribute?.('aria-label')?.trim();
      txt = figcap || alt || aria || '';
    }
    if (maxChars && txt.length > maxChars) txt = txt.slice(0, maxChars) + '…';
    return txt;
  }

  function articleTop(scroller, article){
    const node = headNodeOf(article);
    const scR = scroller.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return scroller.scrollTop + (r.top - scR.top);
  }
  function currentAnchorY(){ return SH.computeAnchor(SH.getCFG()).y; }

  // --- scroll core ---
  let _lockUntil = 0;
  const isLocked = () => performance.now() < _lockUntil;
  function lockFor(ms){ _lockUntil = performance.now() + (Number(ms)||0); }

  // ★Math.round() をやめ、元の正確な位置で止める
  function scrollToHead(article){
    if (!article) return;
    const sc = getTrueScroller();
    const anchor = currentAnchorY();
    const desired = articleTop(sc, article) - anchor; // ←丸めない
    const maxScroll = Math.max(0, sc.scrollHeight - sc.clientHeight);
    const clamped = Math.min(maxScroll, Math.max(0, desired));
    lockFor(SH.getCFG().lockMs);
    sc.scrollTo({ top: clamped, behavior: 'smooth' });
  }

  // --- collect ---
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
    const hasMedia = !!head.querySelector('img,video,canvas,figure,[data-testid*="download"]');
    const busy = head.getAttribute?.('aria-busy') === 'true';
    return (hasText || hasMedia) && !busy;
  }

  // --- state & rebuild ---
  const ST = { all: [], user: [], assistant: [], page:1 };
  function rebuild(){
    if (isLocked && isLocked()) return;
    NS._scroller = getTrueScroller();
    const allRaw = pickAllTurns().filter(isRealTurn);
    ST.all = sortByY(allRaw);
    ST.user = ST.all.filter(a => a.matches('[data-message-author-role="user"], div [data-message-author-role="user"]'));
    ST.assistant = ST.all.filter(a => a.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]'));
  }

  // --- list panel ---
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

    // ドラッグ保存
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
        const cfg = SH.getCFG();
        SH.saveSettingsPatch({ list:{ ...(cfg.list||{}), x:r.left, y:r.top } });
      });
    })();

    listBox.querySelector('#cgpt-list-close').addEventListener('click', ()=>{
      setListEnabled(false);
      const chk = document.getElementById('cgpt-list-toggle');
      if (chk) chk.checked = false;
    });
    return listBox;
  }

  function renderList(forceOn=false){
    const cfg = (SH && SH.getCFG && SH.getCFG()) || SH?.DEFAULTS || {};
    const enabled = forceOn ? true : !!(cfg.list && cfg.list.enabled);
    if (!enabled) return;

    const panel = ensureListBox();
    panel.style.display = 'flex';
    const body = panel.querySelector('#cgpt-list-body');
    const foot = panel.querySelector('#cgpt-list-foot');
    body.innerHTML = '';
    foot.innerHTML = '';

    const pageSize = Math.max(1, Number(cfg.list?.maxItems) || 30);
    const maxChars = Math.max(10, Number(cfg.list?.maxChars) || 40);
    const total = ST.all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, ST.page));

    const start = (page-1)*pageSize;
    const slice = ST.all.slice(start, start + pageSize);

    for (const art of slice){
      const head  = listHeadNodeOf(art);        // ← headNodeOf と同じ
      const icons = detectAttachmentKinds(head).join('');
      const txt   = extractSummaryText(head, maxChars);

      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <span class="clip" style="width:1.4em;display:inline-flex;justify-content:center">${icons}</span>
        <span class="txt">${txt}</span>
      `;
      row.addEventListener('click', ()=> scrollToHead(art));
      body.appendChild(row);
    }

    const count = document.createElement('div');
    count.style.cssText = 'margin-right:auto;opacity:.8;font-size:12px';
    const shownTo = Math.min(total, start + slice.length);
    count.textContent = `${shownTo}/${total}`;

    const pager = document.createElement('div');
    pager.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap'; // 折返し

    const mkBtn = (lbl, onClick, disabled=false)=>{
      const b = document.createElement('button');
      b.textContent = lbl;
      b.style.cssText = 'all:unset;border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:4px 8px;cursor:pointer;opacity:'+(disabled?'.35':'1');
      if (!disabled) b.addEventListener('click', onClick);
      return b;
    };

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

  function setListEnabled(on){
    const cfg = SH.getCFG();
    SH.saveSettingsPatch({ list:{ ...(cfg.list||{}), enabled: !!on } });
    const panel = ensureListBox();
    panel.style.display = on ? 'flex' : 'none';
    if (on) renderList(true);
  }

  // --- navigation ---
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

  // --- expose ---
  NS.rebuild = rebuild;
  NS.setListEnabled = setListEnabled;
  NS.goTop = goTop; NS.goBottom = goBottom; NS.goPrev = goPrev; NS.goNext = goNext;
})();
