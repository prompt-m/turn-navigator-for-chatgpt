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

  // ===== 添付ファイル検出（Article.txt対応） =====

  // 1) ファイル名の収集
  //   - a[download] / a[href] も拾う（将来の変化に備え）
  //   - ChatGPTの“ファイルチップ”（hrefなし）の中にある
  //     .border.rounded-xl .truncate.font-semibold からも拾う
  function collectAttachmentNames(root){
    const el = root || document;
    const names = new Set();

    // a[download] と a[href] のテキスト/末尾名
    el.querySelectorAll('a[download], a[href]').forEach(a => {
      const dn  = (a.getAttribute('download') || '').trim();
      const txt = (a.textContent || '').trim();
      const href = a.getAttribute('href') || '';
      const tail = href.split('/').pop()?.split('?')[0] || '';
      const picked = dn || (txt && /\S/.test(txt) ? txt : tail);
      if (picked) names.add(picked);
    });

    // “ファイルチップ”内の表示名（hrefが無いケース）
    el.querySelectorAll('.border.rounded-xl .truncate.font-semibold').forEach(n => {
      const t = (n.textContent || '').trim();
      if (t) names.add(t);
    });

    return [...names];
  }

  // 2) 種別マーク（🖼/🎞/📝）
  function detectAttachmentKinds(root){
    const el = root || document;
    const kinds = new Set();

    // 実体から判定
    if (el.querySelector('img, picture img')) kinds.add('🖼');
    if (el.querySelector('video, source[type^="video/"]')) kinds.add('🎞');

    // 名前から拡張子推定
    const names = collectAttachmentNames(el);
    const imgRe = /\.(png|jpe?g|gif|webp|svg)$/i;
    const vidRe = /\.(mp4|mov|webm|mkv|avi)$/i;
    const docRe = /\.(pdf|md|txt|csv|tsv|docx?|xlsx?|pptx?|js|ts|gs|json|htm|html)$/i;

    for (const n of names){
      const s = String(n);
      if (imgRe.test(s)) kinds.add('🖼');
      else if (vidRe.test(s)) kinds.add('🎞');
      else if (docRe.test(s)) kinds.add('📝');
    }
    if (!kinds.size && names.length) kinds.add('📝'); // 名前だけある場合

    return [...kinds];
  }

  // 3) 見出しテキスト（ファイル名優先）
  // 見出しテキスト：ファイル名＋本文を両方出す（両方ある場合は「 | 」で連結）
  function extractSummaryText(head, maxChars){
    const names = collectAttachmentNames(head);
    let filePart = names.length ? names.join('、 ') : '';

    // 本文候補
    let textPart = '';
    if (head){
      const aDownload = head.querySelector('a[download]');
      const aLabel    = head.querySelector('a[aria-label]');
      const figcap    = head.querySelector('figcaption');
      const imgAlt    = head.querySelector('img[alt]');
      textPart =
        aDownload?.getAttribute('download')?.trim() ||
        aLabel?.getAttribute('aria-label')?.trim() ||
        figcap?.innerText?.trim() ||
        imgAlt?.getAttribute('alt')?.trim() ||
        (head.innerText || '').replace(/\s+/g,' ').trim() ||
        '';
    }

    // file と text の統合
    let picked = '';
    if (filePart && textPart){
      picked = filePart + ' | ' + textPart;
    } else {
      picked = filePart || textPart;
    }

    if (maxChars && picked.length > maxChars) picked = picked.slice(0, maxChars) + '…';
    return picked || '（内容なし）';
  }

// （画像）やファイル名を並べた「添付行」を返す。無ければ空文字。
function buildAttachmentLine(root){
  const el = root || document;
  const names = collectAttachmentNames(el);     // すでに実装済み（href無チップ対応）
  const hasImg = !!el.querySelector('img, picture img');

  const parts = [];
  if (hasImg) parts.push('（画像）');            // 画像は1つに統一
  // 画像以外も含むファイル名を重複排除で追加
  for (const n of new Set(names)) {
    if (n) parts.push(String(n));
  }
  return parts.join(' ');
}

// 添付UIを取り除いて本文だけを要約（maxChars 指定で丸め）
function extractBodySnippet(head, maxChars){
  if (!head) return '';

  // クローンして添付系要素を除去してからテキスト化
  const clone = head.cloneNode(true);
  clone.querySelectorAll([
    // ファイルチップやリンク類
    '.border.rounded-xl', 'a[download]', 'a[href]',
    // 図版・メディア
    'figure', 'figcaption', 'img', 'picture', 'video', 'source'
  ].join(',')).forEach(n => n.remove());

  let txt = (clone.innerText || '').replace(/\s+/g, ' ').trim();
  if (!txt) return '';

  if (maxChars && txt.length > maxChars) txt = txt.slice(0, maxChars) + '…';
  return txt;
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

    // 「畳む/開く」トグル
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
  body.style.maxHeight = 'min(75vh, 700px)';   // 画面に合わせて
  body.style.overflowY = 'auto';
  body.innerHTML = '';
  foot.innerHTML = ''; // ページャ撤去

  // パネル側をスクロール容器に（CSSの補強：高さは既存CSSに依存）
  body.style.overflowY = 'auto';

  const maxChars = Math.max(10, Number(cfg.list?.maxChars) || 60);
  const fontPx   = (cfg.list?.fontSize || 12) + 'px';

  // すべてのターンをそのまま描画（ページングなし）
  for (const art of ST.all){
    const head = listHeadNodeOf ? listHeadNodeOf(art) : headNodeOf(art);

    // 1) 添付行
    const attachLine = buildAttachmentLine(art);
    if (attachLine){
      const row = document.createElement('div');
      row.className = 'row';
      row.style.fontSize = fontPx;
      // 行の背景（発言者に応じて）
      const isUser = art.matches('[data-message-author-role="user"], div [data-message-author-role="user"]');
      const isAsst = art.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]');
      if (isUser) row.style.background = 'rgba(240,246,255,.60)';
      if (isAsst) row.style.background = 'rgba(234,255,245,.60)';

      row.innerHTML = `
        <span class="clip" style="width:1.4em;display:inline-flex;justify-content:center">🖼</span>
        <span class="txt"></span>
      `;
      row.querySelector('.txt').textContent = attachLine;
      row.addEventListener('click', () => scrollToHead(art));
      body.appendChild(row);
    }

    // 2) 本文行
    const bodyLine = extractBodySnippet(head, maxChars);
    if (bodyLine){
      const row2 = document.createElement('div');
      row2.className = 'row';
      row2.style.fontSize = fontPx;
      // 添付行と同じ背景で統一感
      const isUser = art.matches('[data-message-author-role="user"], div [data-message-author-role="user"]');
      const isAsst = art.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]');
      if (isUser) row2.style.background = 'rgba(240,246,255,.60)';
      if (isAsst) row2.style.background = 'rgba(234,255,245,.60)';

      row2.innerHTML = `
        <span class="clip" style="width:1.4em;display:inline-flex;justify-content:center"> </span>
        <span class="txt"></span>
      `;
      row2.querySelector('.txt').textContent = bodyLine;
      row2.addEventListener('click', () => scrollToHead(art));
      body.appendChild(row2);
    }
  }

  // 件数だけ下部に表示（ページャは無し）
  const total = ST.all.length;
  const shown = body.children.length;
  const info = document.createElement('div');
  info.style.cssText = 'margin-left:auto;opacity:.8;font-size:12px;padding:4px 8px';
  info.textContent = `${shown} 行（${total} ターン）`;
  foot.appendChild(info);
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
