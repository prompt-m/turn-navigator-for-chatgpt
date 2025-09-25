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

  // ★スクロール用 厳しめ（安定版のまま）
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

  // === List Panel 専用（ゆるめ） ===
  function listHeadNodeOf(article){
    if (!article) return null;
    const q = [
      ':scope [data-message-author-role]',
      ':scope div.markdown',
      ':scope div.text-base',
      ':scope .user-message-bubble',
      ':scope article', ':scope section', ':scope > div'
    ];
    for (const sel of q){
      const n = article.matches(sel) ? article : article.querySelector(sel);
      if (n && isVisible(n)) return n;
    }
    return article;
  }

  function detectAttachmentKinds(head){
    const kinds = [];
    if (!head) return kinds;
    if (head.querySelector('video, source[type^="video/"]')) kinds.push('🎞');
    if (head.querySelector('img,picture,canvas,figure'))    kinds.push('🖼');
    if (head.querySelector('a[download], [data-testid*="download"], a[href$=".pdf"], a[href$=".doc"], a[href$=".docx"], a[href$=".xlsx"], a[href$=".pptx"], a[href$=".txt"]'))
      kinds.push('📝');
    return kinds;
  }

/*
  // 添付検出（画像/動画/ダウンロード）
  function detectAttachmentKinds(head){
    if (!head) return [];
    const kinds = [];
    if (head.querySelector('video')) kinds.push('🎞');
    if (head.querySelector('img,picture,canvas,figure')) kinds.push('🖼');
    // PDF/Office/任意の download を「テキストっぽい添付」として扱う
    if (head.querySelector('a[download], [data-testid*="download"], a[href$=".pdf"], a[href$=".doc"], a[href$=".docx"], a[href$=".xlsx"], a[href$=".pptx"]')) {
      kinds.push('📝');
    }
    return kinds;
  }

  function detectAttachmentKinds(head){
    if (!head) return [];
    const kinds = [];
    if (head.querySelector('video')) kinds.push('🎞');
    if (head.querySelector('img,picture,canvas,figure')) kinds.push('🖼');
    if (head.querySelector('a[download], [data-testid*="download"], a[href$=".pdf"], a[href$=".doc"], a[href$=".docx"], a[href$=".xlsx"], a[href$=".pptx"]')) {
      kinds.push('📄');
    }
    return kinds;
  }
*/
/*
  // innerText が空のときだけ figcaption/alt/aria から最小要約
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

  function extractSummaryText(head, maxChars){
    // 1) 添付の「名前」優先
    const aDownload = head?.querySelector?.('a[download]'); // download属性のファイル名
    const aLabel    = head?.querySelector?.('a[aria-label]'); // 名前付きリンク
    const figcap    = head?.querySelector?.('figcaption');
    const imgAlt    = head?.querySelector?.('img[alt]');

    let name =
      aDownload?.getAttribute('download')?.trim() ||
      aLabel?.getAttribute('aria-label')?.trim() ||
      figcap?.innerText?.trim() ||
      imgAlt?.getAttribute('alt')?.trim() || '';

    // 2) なければ本文
    let txt = (head?.innerText || '').replace(/\s+/g,' ').trim();
    if (name) txt = name || txt;

    if (maxChars && txt.length > maxChars) txt = txt.slice(0, maxChars) + '…';
    return txt;
  }
*/

  function extractSummaryText(head, maxChars){
    const aDownload = head?.querySelector?.('a[download]');
    const aLabel    = head?.querySelector?.('a[aria-label]');
    const figcap    = head?.querySelector?.('figcaption');
    const imgAlt    = head?.querySelector?.('img[alt]');
    let picked =
      aDownload?.getAttribute('download')?.trim() ||
      aLabel?.getAttribute('aria-label')?.trim() ||
      figcap?.innerText?.trim() ||
      imgAlt?.getAttribute('alt')?.trim() || '';

    if (!picked) {
      picked = (head?.innerText || '').replace(/\s+/g,' ').trim();
    }
    if (maxChars && picked.length > maxChars) picked = picked.slice(0, maxChars) + '…';
    return picked || '画像をアップロードしました';
  }

  function articleTop(scroller, article){
    const node = headNodeOf(article);
    const scR = scroller.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return scroller.scrollTop + (r.top - scR.top);
  }
  const currentAnchorY = ()=> SH.computeAnchor(SH.getCFG()).y;

  // --- scroll core ---
  let _lockUntil = 0;
  const isLocked = () => performance.now() < _lockUntil;
  function lockFor(ms){ _lockUntil = performance.now() + (Number(ms)||0); }

  function scrollToHead(article){
    if (!article) return;
    const sc = getTrueScroller();
    const anchor  = currentAnchorY();
    const desired = articleTop(sc, article) - anchor; // 丸めない
    const maxScroll = Math.max(0, sc.scrollHeight - sc.clientHeight);
    const clamped   = Math.min(maxScroll, Math.max(0, desired));
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
    try{
      return list.map(el => ({ el, y: articleTop(sc, el) }))
                 .sort((a,b)=> a.y - b.y).map(x=>x.el);
    }catch{ return list; }
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

    // 会話スレッドが切り替わったらリストは閉じる
    (function(){
      let _lastUrl = location.pathname + location.search;
      window.addEventListener('popstate', ()=>{ _lastUrl = location.pathname + location.search; });
      const _ensureOffOnThreadChange = () => {
        const now = location.pathname + location.search;
        if (now !== _lastUrl) {
          _lastUrl = now;
          try {
            const chk = document.getElementById('cgpt-list-toggle');
            if (chk) chk.checked = false;
            window.CGTN_LOGIC?.setListEnabled?.(false, false);
          } catch {}
        }
      };
      // rebuild の最初で呼ぶ
      const _origRebuild = window.CGTN_LOGIC?.rebuild;
      window.CGTN_LOGIC.rebuild = function(){
        _ensureOffOnThreadChange();
        return _origRebuild?.apply(this, arguments);
      };
    })();
    // 会話スレッドが切り替わったらリストは閉じる ここまで

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
        <button id="cgpt-list-collapse" aria-expanded="true">∨</button>
      </div>
      <div id="cgpt-list-body"></div>
      <div id="cgpt-list-foot"></div>
    `;
    document.body.appendChild(listBox);

    // パネルDOM生成の直後に追加：bottom固定からtop固定へ切替
    const r = listBox.getBoundingClientRect();
    listBox.style.top = `${Math.max(8, r.top)}px`;
    listBox.style.bottom = 'auto';

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

//    listBox.querySelector('#cgpt-list-close').addEventListener('click', ()=>{
//      setListEnabled(false);
//      const chk = document.getElementById('cgpt-list-toggle');
//      if (chk) chk.checked = false;
//    });
    // 「畳む/開く」トグルに変更
    listBox.querySelector('#cgpt-list-collapse').addEventListener('click', () => {
      const on = listBox.classList.toggle('collapsed') === false; // collapsed が無ければ展開＝on
      const btn = listBox.querySelector('#cgpt-list-collapse');
      if (btn) {
        btn.textContent = on ? '∧' : '∨';
        btn.setAttribute('aria-expanded', String(on));
      }
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
  const head  = listHeadNodeOf(art);
  const kinds = detectAttachmentKinds(head);              // ← 1回だけ呼ぶ
  const icons = kinds.join(' ');
  const txt   = extractSummaryText(head, maxChars);

  const row = document.createElement('div');
  row.className = 'row';

  // 行の配色・文字サイズ
  const isUser = art.matches('[data-message-author-role="user"], div [data-message-author-role="user"]');
  const isAsst = art.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]');
  if (isUser) row.style.background = 'rgba(240,246,255,.35)';
  if (isAsst) row.style.background = 'rgba(234,255,245,.35)';
  row.style.fontSize = (cfg.list?.fontSize || 12) + 'px';

  // ここで innerHTML を一度だけセット
  row.innerHTML = `
    <span class="clip" style="width:1.6em;display:inline-flex;justify-content:center"></span>
    <span class="txt"></span>
  `;

  // ★ innerHTML した“後”にテキストとアイコンを流し込む（上書き防止）
  row.querySelector('.clip').textContent = icons;
  row.querySelector('.txt').textContent  = txt;

  // クリックでジャンプ
  row.addEventListener('click', ()=> scrollToHead(art));
  body.appendChild(row);
}

    const count = document.createElement('div');
    count.style.cssText = 'margin-right:auto;opacity:.8;font-size:12px';
    const shownTo = Math.min(total, start + slice.length);
    count.textContent = `${shownTo}/${total}`;

    const pager = document.createElement('div');
    pager.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';

    const mkBtn = (lbl, onClick, disabled=false)=>{
      const b = document.createElement('button');
      b.textContent = lbl;
      b.style.cssText = 'all:unset;border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:4px 8px;cursor:pointer;opacity:'+(disabled?'.35':'1');
      if (!disabled) b.addEventListener('click', onClick);
      return b;
    };

    pager.appendChild(mkBtn('前へ', ()=>{ ST.page=Math.max(1,page-1); renderList(); }, page<=1));
/*
    const win = 10;
    let pStart = Math.max(1, page - Math.floor(win/2));
    let pEnd   = Math.min(totalPages, pStart + win - 1);
    if (pEnd - pStart + 1 < win) pStart = Math.max(1, pEnd - win + 1);
    for (let p=pStart; p<=pEnd; p++){
      const b = mkBtn(String(p), ()=>{ ST.page=p; renderList(); }, false);
      if (p===page) b.style.cssText += 'background:#f2f2f7';
      pager.appendChild(b);
    }
*/

    // 既存: const win = 10; … のブロックを削除して、以下に置換

    const MAX_ALL = 20;
    if (totalPages <= MAX_ALL) {
      // 1..N を全部（折り返しでOK）
      for (let p=1; p<=totalPages; p++){
        const b = mkBtn(String(p), ()=>{ ST.page=p; renderList(); });
        if (p===page) b.style.cssText += 'background:#f2f2f7';
        pager.appendChild(b);
      }
    } else {
      // スライディング・ウィンドウ（10）
      const win = 10;
      let pStart = Math.max(1, page - Math.floor(win/2));
      let pEnd   = Math.min(totalPages, pStart + win - 1);
      if (pEnd - pStart + 1 < win) pStart = Math.max(1, pEnd - win + 1);
      for (let p=pStart; p<=pEnd; p++){
        const b = mkBtn(String(p), ()=>{ ST.page=p; renderList(); });
        if (p===page) b.style.cssText += 'background:#f2f2f7';
        pager.appendChild(b);
      }
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
