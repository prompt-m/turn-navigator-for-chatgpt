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

  //行へスクロールする関数
  function scrollListToTurn(turnKey){
    if (!turnKey) return;
    const list = document.getElementById('cgpt-list-body');
    if (!list) return;
    const row = list.querySelector(`.row[data-turn="${CSS.escape(turnKey)}"]`);
    if (!row) return;

    // 行をパネル中央付近に出す
    const top = row.offsetTop - (list.clientHeight/2 - row.clientHeight/2);
    list.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
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

  // ここ変えたよ：共通トランケータ
  function truncate(s, max){
    if (!max || !s) return s || '';
    return s.length > max ? s.slice(0, max) + '…' : s;
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

  // ここ変えたよ：種別アイコンを先頭に横並び → （画像） → ファイル名を連結
  function buildAttachmentLine(root, maxChars){
    const el = root || document;

    // 種別（既存の detectAttachmentKinds は 🖼/🎞/📝 を返す想定）
    const kinds = Array.from(new Set(detectAttachmentKinds(el) || []));
    // 表示順を固定（画像→動画→文書ほか）
    const order = ['🖼','🎞','📝'];
    kinds.sort((a,b)=> order.indexOf(a) - order.indexOf(b));
    const kindsStr = kinds.join('');

    // （画像）表記
    const hasImg = !!el.querySelector('img, picture img');
    const imgLabel = hasImg ? '（画像）' : '';

    // ファイル名（href無しのチップも含む）
    const names = Array.from(new Set(collectAttachmentNames(el))).filter(Boolean);
    const namesStr = names.join(' '); // ← 横に並べる

    // 結合：🖼📝 + 半角スペース + （画像） + 半角スペース + 連結名
    const line = [kindsStr, imgLabel, namesStr].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();

    // 既存の truncate/または安全切り詰め
    const max = Math.max(10, Number(maxChars)||0);
    return max ? (line.length > max ? line.slice(0, max) + '…' : line) : line;
  }

  // 添付UIを取り除いて本文だけを要約（maxChars 指定で丸め）
  // ここ変えたよ：トリム＆maxChars 厳密適用
  function extractBodySnippet(head, maxChars){
    if (!head) return '';
    const clone = head.cloneNode(true);
    clone.querySelectorAll([
      '.border.rounded-xl','a[download]','a[href]',
      'figure','figcaption','img','picture','video','source'
    ].join(',')).forEach(n => n.remove());

    let txt = (clone.innerText || '').replace(/\s+/g, ' ').trim();
    return truncate(txt, maxChars);
  }

  function articleTop(scroller, article){
    const node = headNodeOf(article);
    const scR = scroller.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return scroller.scrollTop + (r.top - scR.top);
  }
  const currentAnchorY = ()=> SH.computeAnchor(SH.getCFG()).y;

  // ここ変えたよ：ターンキー安定化。DOMに無ければ連番を割り当てて保持。
  const _turnKeyMap = new WeakMap();

  // [追記] 本文からプレビュー用テキストを抽出（改行・空白を整理、長すぎるときはカット）
  function extractPreviewText(node){
//console.log("プレビュー用テキストnode:",node);
    try {
      const raw = (node?.innerText || node?.textContent || '').trim();
      // 行頭・行末の連続空白を整理し、内部の過剰連続空白も縮める
      const norm = raw.replace(/\r/g,'')
                      .replace(/[ \t]+\n/g, '\n')
                      .replace(/\n{3,}/g, '\n\n')
                      .replace(/[ \t]{2,}/g, ' ');
//console.log("プレビュー用テキストnorm:",norm);
      return norm.length > 2000 ? norm.slice(0, 2000) + '…' : norm;
    } catch {
      return '';
    }
  }


  // --- Pins (付箋) ---
  function getTurnKey(article){
    if (!article) return '';
    const domId =
      article.getAttribute('data-turn-id') ||
      article.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
      article.id;
    if (domId) return String(domId);
    // 連番の自前キー
    if (_turnKeyMap.has(article)) return _turnKeyMap.get(article);
    const k = 'turn:' + Math.random().toString(36).slice(2, 9);
    _turnKeyMap.set(article, k);
    return k;
  }

  // === PINS: sync cache ===
  let PINS = new Set();
  let _pinsInited = false;

function _pinsSetFromCFG(cfg){
  const arr = (cfg && cfg.list && Array.isArray(cfg.list.pins)) ? cfg.list.pins : [];
  return new Set(arr.map(String));
}
function _savePinsSet(set){
  PINS = new Set(set);
  const cur = SH.getCFG() || {};
  SH.saveSettingsPatch({ list:{ ...(cur.list||{}), pins: Array.from(PINS) } });
}

// ★ここを置換：毎回initしない。初回だけCFGを読み込む。
function ensurePinsCache(){
  if (_pinsInited) return;
  PINS = _pinsSetFromCFG(SH.getCFG() || {});
  _pinsInited = true;
}

  function initPinsCache(){ PINS = _pinsSetFromCFG(SH.getCFG() || {}); }

  // キーAPI（ここが“真実”）
  function isPinnedByKey(k){ return PINS.has(String(k)); }
  function setPinnedByKey(k, val){
    const s = new Set(PINS); const ks = String(k);
    if (val) s.add(ks); else s.delete(ks);
    _savePinsSet(s); return val;
  }
  function togglePinnedByKey(k){
    const s = new Set(PINS); const ks = String(k);
    const next = !s.has(ks); if (next) s.add(ks); else s.delete(ks);
    _savePinsSet(s); return next; // ← 次状態を返すのが超重要
  }

function getPins(){ return Array.from(PINS); }
function isPinned(artOrKey){
  const k = (typeof artOrKey==='string') ? artOrKey : getTurnKey(artOrKey);
  return PINS.has(String(k));
}
function togglePin(artOrKey){
  const k = (typeof artOrKey==='string') ? artOrKey : getTurnKey(artOrKey);
  // 戻り値は次状態（true/false）
  const s = new Set(PINS);
  const ks = String(k);
  const next = !s.has(ks);
  if (next) s.add(ks); else s.delete(ks);
  _savePinsSet(s);
  return next;
}
function setPinned(artOrKey, val){
  const k = (typeof artOrKey==='string') ? artOrKey : getTurnKey(artOrKey);
  const s = new Set(PINS);
  const ks = String(k);
  if (val) s.add(ks); else s.delete(ks);
  _savePinsSet(s);
  return !!val;
}
  function qListBody(){ return document.getElementById('cgpt-list-body'); }

  function rowsByTurn(turnKey){
    const body = qListBody();
    if (!body) return [];
    return Array.from(body.querySelectorAll(`.row[data-turn="${CSS.escape(turnKey)}"]`));
  }

  // === pin theme (gold test) ===
  function applyPinTheme(){
    const cfg = SH.getCFG() || {};
    const theme = cfg.list?.pinTheme || 'red';
    const btn = document.getElementById('cgpt-pin-filter');
    if (!btn) return;
    if (theme === 'gold') btn.classList.add('golden');
    else btn.classList.remove('golden');
  }

  function paintPinRow(row, pinned){
    const clip = row.querySelector('.clip');
    if (!clip) return;
    clip.classList.add('cgtn-clip-pin');
    clip.classList.add('cgtn-cursor-pin');
    clip.classList.toggle('off', !pinned);
    // ダミーは見せずに幅だけ確保
    if (clip.classList.contains('clip-dummy')){
      clip.setAttribute('aria-pressed', 'false');
      clip.style.visibility = 'hidden';
      clip.style.pointerEvents = 'none';
      return;
    }
    clip.style.visibility = 'visible';
    clip.style.pointerEvents = 'auto';
    clip.textContent = '🔖\uFE0E';
    clip.setAttribute('aria-pressed', String(!!pinned));
  }

  //🔖︎
// ここ変えたよ：左🔖クリックのハンドラは click だけ、再入＆二重バインドガード付き
function bindClipPin(clip, art){
  if (!clip) return;

  // 再描画での二重バインド防止
  if (clip._cgtnPinBound) return;
  clip._cgtnPinBound = true;

  if (!clip.textContent) clip.textContent = '🔖\uFE0E'; // モノクロ字形で color が効く
  clip.classList.add('cgtn-clip-pin');
  clip.classList.add('cgtn-cursor-pin');
  clip.classList.toggle('off', !isPinned(art));
  clip.style.cursor = 'pointer';
  clip.style.userSelect = 'none';
  clip.style.padding = '2px 6px';

  let busy = false;
  const handler = (ev)=>{
    ev.preventDefault();           // フォーカスや既定動作を抑止
    ev.stopPropagation();          // 行側のクリック（スクロール）へバブルさせない
    if (busy) return;              // デバウンス（同フレーム二重発火防止）
    busy = true;

    const k = getTurnKey(art);
    const next = togglePinnedByKey(k);   // ← 次状態（true/false）を確定

    // 自分を即時反映
    clip.setAttribute('aria-pressed', String(next));
    clip.classList.toggle('off', !next);

    const cfg = SH.getCFG() || {};
    if (cfg.list?.pinOnly && !next){
      // 付箋のみ表示中でOFF → 同ターンの2行を即削除
      rowsByTurn(k).forEach(n => n.remove());
    } else {
      // 相方行の色も“確定値”で更新
      refreshPinUIForTurn(k, next);
    }

    // 次ティックでロック解除（同フレーム多重を防ぐ）
    setTimeout(()=>{ busy = false; }, 0);

//console.debug('[PIN]', k, 'next=', next, 'PINS=', Array.from(PINS));

  };

  // ★ click だけを登録（pointerdown は絶対に付けない）
  clip.addEventListener('click', handler, {passive:false});
}

// 相方行のUI更新（ここ変えたよ：強制値を優先）
function refreshPinUIForTurn(turnKey, forcedState){
  const state = (typeof forcedState === 'boolean') ? forcedState : PINS.has(String(turnKey));
  rowsByTurn(turnKey).forEach(row=>{
    const clipEl = row.querySelector('.cgtn-clip-pin');
    if (clipEl){
      clipEl.setAttribute('aria-pressed', String(!!state));
      clipEl.classList.toggle('off', !state); // ←★ 同期
    }
  });
}


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
    //注目ターンのキーを覚える
    NS._currentTurnKey = getTurnKey(article);
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
//★★★    const hasMedia = !!head.querySelector('img,video,canvas,figure,[data-testid*="download"]');
    const hasMedia = !!article.querySelector(
      'img,video,canvas,figure,' +
      '[data-testid*="download"],[data-testid*="attachment"],[data-testid*="file"],' +
      'a[download],a[href^="blob:"]'
    );

    const busy = head.getAttribute?.('aria-busy') === 'true';
    return (hasText || hasMedia) && !busy;
  }

  // --- state & rebuild ---
  const ST = { all: [], user: [], assistant: [], page:1 };

  // rebuild の最後にキーを必ず割り振る
  function rebuild(){

    ensurePinsCache();

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
    // ここ変えたよ：全要素にキーを確実に紐付け
    for (const a of ST.all){ getTurnKey(a); }
  }

  // --- list panel ---
  let listBox = null;

  function ensureListBox(){
    if (listBox && document.body.contains(listBox)) return listBox;
    listBox = document.createElement('div');
    listBox.id = 'cgpt-list-panel';
    listBox.innerHTML = `
      <div id="cgpt-list-head">
        <div id="cgpt-list-grip"></div>
        <button id="cgpt-pin-filter" type="button" aria-pressed="false" style="cursor:pointer">🔖\uFE0E</button>
        <button id="cgpt-list-collapse" aria-expanded="true">▾</button>
      </div>
      <div id="cgpt-list-body"></div>
      <div id="cgpt-list-foot"></div>
    `;
    document.body.appendChild(listBox);

// この処理は、ensureListBoxのどこらへんにいれるのが正解？
    if (!listBox._tipsBound) {
      window.CGTN_SHARED?.applyTooltips?.({
        '#cgpt-list-collapse'          : 'list.collapse',
        '#cgpt-pin-filter'             : 'list.pinonly',
        '#cgpt-list-grip'              : 'nav.drag'
      }, listBox);
      listBox._tipsBound = true; // ★重複登録防止
    }


    /*ｺｺｶﾗ*/
    // === リスト側：モダリティ + パーキングでフォーカス完全排除 ===
    (function enforceNoFocusList(panel){
      if (!panel || panel._cgtnFocusGuard) return;
      panel._cgtnFocusGuard = true;

      let lastWasKeyboard = false;
      window.addEventListener('keydown',     () => { lastWasKeyboard = true;  }, {capture:true});
      window.addEventListener('pointerdown', () => { lastWasKeyboard = false; }, {capture:true});

      let park = document.getElementById('cgtn-focus-park');
      if (!park) {
        park = document.createElement('button');
        park.id = 'cgtn-focus-park';
        park.type = 'button';
        park.tabIndex = -1;
        park.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none;';
        document.body.appendChild(park);
      }

      const INTERACTIVE = 'button, label, input[type=checkbox]';
      panel.addEventListener('focusin', (e) => {
        const t = e.target && e.target.closest(INTERACTIVE);
        if (t && !lastWasKeyboard) {
          try { t.blur(); } catch {}
          try { park.focus({ preventScroll:true }); } catch {}
        }
      }, true);

      panel.addEventListener('mouseup', () => {
        try {
          if (document.activeElement && panel.contains(document.activeElement)) {
            park.focus({ preventScroll:true });
          }
        } catch {}
      }, { capture:true });
    })(listBox);
    /*ｺｺﾏﾃﾞ*/
    // === リスト側：マウス操作のフォーカス残りを抑止 ===
    (function suppressMouseFocusInList(){
      const root = listBox;
      if (!root || root._cgtnNoMouseFocus) return;
      root._cgtnNoMouseFocus = true;

      // マウス押下時にフォーカス移動を阻止
      root.addEventListener('mousedown', (e) => {
        const t = e.target && e.target.closest('button, label, input[type=checkbox]');
        if (t) e.preventDefault();
      }, { passive: false });

      // クリック後は念のため blur（キーボード操作には影響なし）
      root.addEventListener('click', (e) => {
        const t = e.target && e.target.closest('button, label, input[type=checkbox]');
        if (t && t.blur) t.blur();
      }, { passive: true });

      // マウスアップ捕捉で“今フォーカス中”も外す（より強固に）
      root.addEventListener('mouseup', () => {
        try {
          const ae = document.activeElement;
          if (ae && typeof ae.blur === 'function') ae.blur();
        } catch {}
      }, { capture:true });
    })();


    // リストパネル内でもクリックでフォーカスを残さない
    (function suppressMouseFocusInList(panel){
      if (!panel || panel._cgtnNoMouseFocus) return;
      panel._cgtnNoMouseFocus = true;

      panel.addEventListener('mousedown', (e) => {
        const t = e.target.closest('button, label, input[type=checkbox]');
        if (t) e.preventDefault();
      }, { passive: false });

      panel.addEventListener('click', (e) => {
        const t = e.target.closest('button, label, input[type=checkbox]');
        if (t && t.blur) t.blur();
      }, { passive: true });
    })(listBox);

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

    // ここ変えたよ：つまみ横の付箋のみ（1クリック目から確実に反映）
    (function bindPinFilter(){
      const btn = listBox.querySelector('#cgpt-pin-filter');
      if (!btn || btn._cgtnBound) return;
      btn._cgtnBound = true;
      btn.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        const cur = SH.getCFG() || {};

        // Alt+クリックはテーマ切替（任意運用）
        if (ev.altKey){
          const nextTheme = (cur.list?.pinTheme === 'gold') ? 'red' : 'gold';
          SH.saveSettingsPatch({ list:{ ...(cur.list||{}), pinTheme: nextTheme } });
          applyPinTheme?.();
          return;
        }

        // 通常クリック：pinOnlyトグル → 即時反映
        const next = !cur.list?.pinOnly;
        SH.saveSettingsPatch({ list:{ ...(cur.list||{}), pinOnly: next } });

        btn.setAttribute('aria-pressed', String(next));
        const pinOnlyChk = document.getElementById('cgpt-pinonly');
        if (pinOnlyChk) pinOnlyChk.checked = next;

        // ★ オーバーライドで1クリック目から絞込み／解除を確定
        renderList(true, { pinOnlyOverride: next });
      }, {passive:true});
    })();

    // ここ変えたよ：畳み/開きのバインドを安全に一度だけ行う
    function bindCollapseOnce(panel){
      const btn = panel.querySelector('#cgpt-list-collapse');
      if (!btn) return;
      if (btn._cgtnBound) return;       // 二重バインド防止
      btn._cgtnBound = true;

      btn.addEventListener('click', () => {
        const collapsed = panel.classList.toggle('collapsed');
        const on = !collapsed; // 展開=true
        btn.textContent = on ? '▴' : '▾';       // 開=▴ / 閉=▾
        btn.setAttribute('aria-expanded', String(on));
      });
    }
    bindCollapseOnce(listBox);

    return listBox;
  }

  // 行右端🗒️のイベントを二重で拾い、誤クリック防止
  function addPinHandlers(btn, art){
    if (!btn) return;
    btn.type = 'button';
    btn.style.pointerEvents = 'auto';
    btn.style.cursor = 'pointer';
    btn.style.padding = '2px 6px';     // ヒットボックス拡大
    const handler = (ev) => {
      ev.stopPropagation();
      const k = getTurnKey(art);
      const before = isPinned(art);
      togglePin(art);                  // 保存（SH.saveSettingsPatchベース）
      const after = isPinned(art);

      const cur = SH.getCFG() || {};
      if (cur.list?.pinOnly && before && !after){
        rowsByTurn(k).forEach(n => n.remove()); // 付箋のみで外した→そのターン行を削除
        return;
      }
      refreshPinUIForTurn(k);                   // 同ターン2行を部分更新
    };
    btn.addEventListener('pointerdown', handler, {passive:true});
    btn.addEventListener('click',        handler, {passive:true});
  }

  function renderList(forceOn=false, opts={}){
    const cfg = (SH && SH.getCFG && SH.getCFG()) || SH?.DEFAULTS || {};
    const enabled = forceOn ? true : !!(cfg.list && cfg.list.enabled);
    if (!enabled) return;

    const panel = ensureListBox();
    const body  = panel.querySelector('#cgpt-list-body');
    const foot  = panel.querySelector('#cgpt-list-foot');
    panel.style.display = 'flex';
    body.style.maxHeight = 'min(75vh, 700px)';
    body.style.overflowY = 'auto';
    body.innerHTML = '';
    foot.innerHTML = '';

    const maxChars = Math.max(10, Number(cfg.list?.maxChars) || 60);
    const fontPx   = (cfg.list?.fontSize || 12) + 'px';

    const pinOnly = (opts && Object.prototype.hasOwnProperty.call(opts,'pinOnlyOverride'))
      ? !!opts.pinOnlyOverride
      : !!cfg.list?.pinOnly;

    const pinBtn = panel.querySelector('#cgpt-pin-filter');
    if (pinBtn) pinBtn.setAttribute('aria-pressed', String(pinOnly));
    applyPinTheme?.();

    let turns = ST.all;
    if (pinOnly) turns = turns.filter(isPinned);

    for (const art of turns){
      const turnKey = getTurnKey(art);
      const head = listHeadNodeOf ? listHeadNodeOf(art) : headNodeOf(art);

      const attachLine = buildAttachmentLine(art, maxChars);
      const bodyLine   = extractBodySnippet(head, maxChars);

      // 🔖をどちらに出すか：添付があれば添付行、無ければ本文行
      const showClipOnAttach = !!attachLine;
      const showClipOnBody   = !attachLine && !!bodyLine;

      // ★追記: プレビュー用（長め）テキストを生成
      //   - 長さは 1200 文字を基準（設定があればそれを優先）
      //   - body優先、無ければattachを採用
      const PREVIEW_MAX =
        Math.max(600, Math.min(2000, (SH?.getCFG?.()?.list?.previewMax || 1200)));
      const attachPreview = buildAttachmentLine(art, PREVIEW_MAX) || '';
      const bodyPreview   = extractBodySnippet(head, PREVIEW_MAX) || '';
      const previewText   = (bodyPreview || attachPreview).replace(/\s+\n/g, '\n').trim();

      // 添付行
      if (attachLine){
        const row = document.createElement('div');
        row.className = 'row';
        row.style.fontSize = fontPx;

        const isUser = art.matches('[data-message-author-role="user"], div [data-message-author-role="user"]');
        const isAsst = art.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]');
        if (isUser) row.style.background = 'rgba(240,246,255,.60)';
        if (isAsst) row.style.background = 'rgba(234,255,245,.60)';

        row.innerHTML = `
          <button class="cgtn-preview-btn">…</button>
          <span class="txt"></span>
          <span class="clip ${showClipOnAttach ? '' : 'clip-dummy'}" style="width:1.6em;display:inline-flex;justify-content:center;align-items:center">🔖\uFE0E</span>
          
        `;
        row.querySelector('.txt').textContent = attachLine;
        row.addEventListener('click', () => scrollToHead(art));
        row.dataset.turn = turnKey;
        row.dataset.kind = 'attach';

//        paintPinRow(row, isPinned(art));
        paintPinRow(row,  isPinnedByKey(turnKey));
        if (showClipOnAttach) bindClipPin(row.querySelector('.clip'), art);
        if (row)  row.dataset.preview  = previewText || attachLine || '';

        window.CGTN_SHARED?.applyTooltips?.({'.cgtn-preview-btn': 'row.previewBtn'}, row);
        window.CGTN_SHARED?.applyTooltips?.({'#cgpt-list-body .cgtn-clip-pin' : 'row.pin'}, listBox);

        body.appendChild(row);
      }

      // 本文行
      if (bodyLine){
        const row2 = document.createElement('div');
        row2.className = 'row';
        row2.style.fontSize = fontPx;

        const isUser = art.matches('[data-message-author-role="user"], div [data-message-author-role="user"]');
        const isAsst = art.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]');
        if (isUser) row2.style.background = 'rgba(240,246,255,.60)';
        if (isAsst) row2.style.background = 'rgba(234,255,245,.60)';

        row2.innerHTML = `
          <button class="cgtn-preview-btn">…</button> 
          <span class="txt"></span>
          <span class="clip ${showClipOnBody ? '' : 'clip-dummy'}" style="width:1.6em;display:inline-flex;justify-content:center;align-items:center">🔖\uFE0E</span>
          
        `;
        row2.querySelector('.txt').textContent = bodyLine;
        row2.addEventListener('click', () => scrollToHead(art));
        row2.dataset.turn = turnKey;
        row2.dataset.kind = 'body';

        paintPinRow(row2, isPinnedByKey(turnKey));
        if (showClipOnBody) bindClipPin(row2.querySelector('.clip'), art);
        if (row2) row2.dataset.preview = previewText || bodyLine || '';

        window.CGTN_SHARED?.applyTooltips?.({'.cgtn-preview-btn': 'row.previewBtn'}, row2);
        window.CGTN_SHARED?.applyTooltips?.({'#cgpt-list-body .cgtn-clip-pin' : 'row.pin'}, listBox);


        body.appendChild(row2);
      }
    }

    const info = document.createElement('div');
    info.style.cssText = 'margin-left:auto;opacity:.8;font-size:12px;padding:4px 8px';
    info.textContent = `${body.children.length}行（${ST.all.length}ターン中）`;
    foot.appendChild(info);
    //注目ターンのキー行へスクロール
    scrollListToTurn(NS._currentTurnKey);
  }

  function setListEnabled(on){
    const cfg = SH.getCFG();
    SH.saveSettingsPatch({ list:{ ...(cfg.list||{}), enabled: !!on } });
  
    const panel = ensureListBox();
    panel.style.display = on ? 'flex' : 'none';
  
    // 一覧ON時は必ず展開＆再構築→描画、付箋UIも有効化
    if (on) {
      ensurePinsCache();  // ← 追加
      // ①まず即時スキャン（ある程度は出る）★★★
      rebuild();
      panel.classList.remove('collapsed');
      const btn = panel.querySelector('#cgpt-list-collapse');
      if (btn) { btn.textContent = '▴'; btn.setAttribute('aria-expanded','true'); }
  
      // pinOnly チェックを有効化
//      const pinOnlyChk = document.getElementById('cgpt-pinonly');
//      if (pinOnlyChk) pinOnlyChk.disabled = false;
  
      renderList(true);
      // ②遅延スキャン（添付UIが後から差し込まれる分を回収）★★★
      //    rAF×2 でペイント後、さらに少し待ってから確定
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        setTimeout(()=>{ rebuild(); renderList(true); }, 180);
      }));
    } else {
      // OFF時は pinOnly もOFFにして保存＆UI無効化
//      const cur = SH.getCFG() || {};
//      SH.saveSettingsPatch({ list:{ ...(cur.list||{}), pinOnly:false } });
//      const pinOnlyChk = document.getElementById('cgpt-pinonly');
//      if (pinOnlyChk) { pinOnlyChk.checked = false; pinOnlyChk.disabled = true; }
    }
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
  NS.renderList = renderList;
  NS.rebuild = rebuild;
  NS.setListEnabled = setListEnabled;
  NS.goTop = goTop; 
  NS.goBottom = goBottom;
  NS.goPrev = goPrev;
  NS.goNext = goNext;
})();
