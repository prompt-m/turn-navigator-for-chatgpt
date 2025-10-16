// logic.js
(() => {
  const SH = window.CGTN_SHARED;
  const NS = (window.CGTN_LOGIC = window.CGTN_LOGIC || {});
  const TURN_SEL = 'div[data-testid^="conversation-turn-"]';
  const titleEscape = SH.titleEscape;

  const t = window.CGTN_I18N?.t || ((k)=>k);
  function _L(){ return (SH?.getLang?.() || '').toLowerCase().startsWith('en') ? 'en':'ja'; }

  // ★チャット別ピン・キャッシュ
  let _pinsCache = null;   // { [turnId]: true }
  NS._pinsCache = _pinsCache; // デバッグ用

  function hydratePinsCache(chatId){
    const cfg = SH.getCFG() || {};
    const pinsArr = cfg.pinsByChat?.[chatId]?.pins || [];
    _pinsCache = {};

    for (let i = 0; i < pinsArr.length; i++){
      if (pinsArr[i]) _pinsCache['turn:' + (i + 1)] = true;
    }
  }

  // 必ず役割を決定する（なければ既定で assistant）
  function getTurnRole(turnEl){
    // 直下 or 配下から探す
    const r = turnEl.querySelector('[data-message-author-role]');
    let role = r?.getAttribute('data-message-author-role');
    if (!role) {
      // 稀に turnEl 直下にいないケースへの保険
      const any = turnEl.querySelector('*[data-message-author-role]');
      role = any?.getAttribute('data-message-author-role') || '';
    }
    // tool はアシスタント寄りに扱う（既存UIとの整合）
    if (role === 'tool') role = 'assistant';
    return (role === 'user' || role === 'assistant') ? role : 'assistant';
  }

  function isPinnedByKey(turnId){
    return !!(_pinsCache && _pinsCache[String(turnId)]);
  }
  NS.isPinnedByKey = isPinnedByKey;

  // ピンの ON/OFF（呼び元は既存 bindClipPin / togglePin からそのまま呼べる）
  NS.togglePin = function(turnId){
    const on = NS.togglePinByIndex(turnId, SH.getChatId());
    // ローカルキャッシュも合わせる
    if (!_pinsCache) _pinsCache = {};
    if (on) _pinsCache[String(turnId)] = true;
    else delete _pinsCache[String(turnId)];
    return on;
  };

  // 互換：従来の _savePinsSet 等を使っていた呼び出しを内部移譲
  NS.isPinned = function(art){ return isPinnedByKey(NS.getTurnKey?.(art)); };

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
//      return pick(article, ':scope > div, :scope > article') || pick(article, 'div.text-base') || pick(article, 'div.markdown') || article;
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
    return s.length > max ? s.slice(0, max) + '' : s;
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
      const tx = (n.textContent || '').trim();
      if (tx) names.add(tx);
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

    if (maxChars && picked.length > maxChars) picked = picked.slice(0, maxChars) + '';
    return picked || '（内容なし）';
  }

  function buildAttachmentLine(root, maxChars){
    const el = root || document;

    const kinds = Array.from(new Set(detectAttachmentKinds(el) || []));
    const order = ['🖼','🎞','📝'];
    kinds.sort((a,b)=> order.indexOf(a) - order.indexOf(b));
    const kindsStr = kinds.join('');

    const hasImg = !!el.querySelector('img, picture img');
    const names = Array.from(new Set(collectAttachmentNames(el))).filter(Boolean);
    const namesStr = names.join(' ');

    // ★I18N経由で（画像）/(image)
    const imgLabel = (!namesStr && hasImg)
      ? (window.CGTN_UI?.t?.('image') || '(image)')
      : '';

    const line = [kindsStr, imgLabel, namesStr].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    const max = Math.max(10, Number(maxChars)||0);
    return max ? (line.length > max ? line.slice(0, max) : line) : line;
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
      return norm.length > 2000 ? norm.slice(0, 2000) + '' : norm;
    } catch {
      return '';
    }
  }

  // 互換の薄ラッパー（他所で使っていても安心・未使用なら残すだけ）
  // --- 互換の薄ラッパー（index方式 → 'turn:n' 文字列）---
  function getTurnKey(article){
    const rows = (window.ST?.all || []);
    const idx  = rows.indexOf(article);
    return idx >= 0 ? ('turn:' + (idx + 1)) : '';
  }

  // 行のインデックス取得ヘルパ
  function getIndex1FromRow(row){
    const v = Number(row?.dataset?.idx);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  // === PINS: sync cache ===
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
  const clip = row.querySelector('.cgtn-clip-pin');
  if (!clip) return;

  const on = !!pinned;
  clip.setAttribute('aria-pressed', String(on));
  clip.classList.toggle('off', !on);
  clip.textContent = '🔖\uFE0E';
}

  function bindClipPinByIndex(clipEl, rowEl, chatId){
    clipEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const idx1 = Number(rowEl?.dataset?.idx);
      if (!Number.isFinite(idx1) || idx1 < 1) return;

      const next = SH.togglePinByIndex?.(idx1, chatId);
      paintPinRow(rowEl, !!next);
      NS.updateListFooterInfo?.();

      // pinOnly 表示中は再描画したい場合 ↓を有効化
      // const cfg = SH.getCFG() || {};
      // if (cfg.list?.pinOnly) NS.renderList?.(true);
    }, { passive:false });
  }

  // 相方行のUI更新（ここ変えたよ：強制値を優先）
  function refreshPinUIForTurn(turnKey, forcedState){
    const state = (typeof forcedState === 'boolean') ? forcedState : isPinnedByKey(turnKey);

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

    // --- 会話スレッドが切り替わったらリストは閉じる（★一度だけインストール） ---
    if (!window.CGTN_LOGIC?._threadHooked) {
      (function(){
        let _lastUrl = location.pathname + location.search;

        // idempotent にする（過去のハンドラを外してから入れる）
        if (window.CGTN_LOGIC._popHandler) {
          window.removeEventListener('popstate', window.CGTN_LOGIC._popHandler);
        }
        window.CGTN_LOGIC._popHandler = () => {
          _lastUrl = location.pathname + location.search;
        };
        window.addEventListener('popstate', window.CGTN_LOGIC._popHandler);

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
      window.CGTN_LOGIC._threadHooked = true; // ★これで以降は再インストールされない
    }
    // 会話スレッドが切り替わったらリストは閉じる ここまで

    NS._scroller = getTrueScroller();

    const allRaw = pickAllTurns().filter(isRealTurn);
    ST.all = sortByY(allRaw);
    ST.user = ST.all.filter(a => a.matches('[data-message-author-role="user"], div [data-message-author-role="user"]'));
    ST.assistant = ST.all.filter(a => a.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]'));
    // 全要素にキーを確実に紐付け
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
      <div id="cgpt-list-foot">
        <button id="cgpt-list-refresh" class="cgtn-mini-btn" type="button">↻</button>
        <div id="cgpt-list-foot-info" style="margin-left:auto;opacity:.8;font-size:12px;padding:4px 8px;"></div>
      </div>
    `;

    document.body.appendChild(listBox);

    // ツールチップ用titleを登録
    if (!listBox._tipsBound) {
      window.CGTN_SHARED?.applyTooltips?.({
        '#cgpt-list-collapse'          : 'list.collapse',
        '#cgpt-pin-filter'             : 'list.pinonly',
        '#cgpt-list-grip'              : 'nav.drag',
        '#cgpt-list-refresh'           : 'list.refresh'
      }, listBox);
      listBox._tipsBound = true; // ★重複登録防止
    }

    // ↻ クリックで再描画（重複バインド防止）
    const refreshBtn = listBox.querySelector('#cgpt-list-refresh');
    if (refreshBtn && !refreshBtn._cgtnBound) {
      refreshBtn._cgtnBound = true;
      refreshBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { NS.renderList?.(true); } catch {}
      }, { passive: true });
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
        const el = e.target && e.target.closest(INTERACTIVE);
        if (el && !lastWasKeyboard) {
          try { el.blur(); } catch {}
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
        const el = e.target && e.target.closest('button, label, input[type=checkbox]');
        if (el) e.preventDefault();
      }, { passive: false });

      // クリック後は念のため blur（キーボード操作には影響なし）
      root.addEventListener('click', (e) => {
        const el = e.target && e.target.closest('button, label, input[type=checkbox]');
        if (el && el.blur) el.blur();
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
        const el = e.target.closest('button, label, input[type=checkbox]');
        if (el) e.preventDefault();
      }, { passive: false });

      panel.addEventListener('click', (e) => {
        const el = e.target.closest('button, label, input[type=checkbox]');
        if (el && el.blur) el.blur();
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
//console.debug('[pinFilter] next=%s (before renderList override)', next);
        SH.saveSettingsPatch({ list:{ ...(cur.list||{}), pinOnly: next } });

        btn.setAttribute('aria-pressed', String(next));
        const pinOnlyChk = document.getElementById('cgpt-pinonly');
        if (pinOnlyChk) pinOnlyChk.checked = next;

        // ★ オーバーライドで1クリック目から絞込み／解除を確定
        NS.renderList(true, { pinOnlyOverride: next });
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

    // ensureListBox() の末尾あたり（listBox を生成した直後でOK）
    if (!document.getElementById('cgtn-pinonly-style')) {
      const st = document.createElement('style');
      st.id = 'cgtn-pinonly-style';
      st.textContent = `
        #cgpt-pin-filter[aria-pressed="true"]{
          color: #e60033 !important;
        }
      `;
      document.head.appendChild(st);
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



  NS.renderList = async function renderList(forceOn=false, opts={}){
//console.debug('[renderList 冒頭] chat=', SH.getChatId?.(), 'turns(before)=', ST.all.length);
    await SH.whenLoaded?.();

//    const cfg = (SH && SH.getCFG && SH.getCFG()) || SH?.DEFAULTS || {};
//    const enabled = forceOn ? true : !!(cfg.list && cfg.list.enabled);
    const cfg = SH.getCFG?.() || SH?.DEFAULTS || {};
    const enabled = forceOn ? true : !!cfg.list?.enabled;

    if (!enabled) return;

    const T = (k)=> window.CGTN_I18N?.t?.(k) || k;

    const panel = ensureListBox();
    const body  = panel.querySelector('#cgpt-list-body');
    const foot  = panel.querySelector('#cgpt-list-foot');
    panel.style.display = 'flex';
    body.style.maxHeight = 'min(75vh, 700px)';
    body.style.overflowY = 'auto';
    body.innerHTML = '';
  

    //pinOnly のときのフィルタは 最新の PINS セットで判定
    // pinOnly 判定（オーバーライド優先）
    const pinOnly = (opts && Object.prototype.hasOwnProperty.call(opts,'pinOnlyOverride'))
      ? !!opts.pinOnlyOverride
      : !!cfg.list?.pinOnly;
//console.debug('[renderList] pinOnly=%s turns(before)=%d',pinOnly, ST.all.length);

    const pinBtn = panel.querySelector('#cgpt-pin-filter');
    if (pinBtn) pinBtn.setAttribute('aria-pressed', String(pinOnly));
    applyPinTheme?.();

    const chatId  = SH.getChatId?.();
    const pinsArr = SH.getPinsArr?.(chatId) || [];
    let turns     = ST.all.slice();

    // pinOnly のときは「配列」でフィルタ
    if (pinOnly) turns = turns.filter((_, i) => !!pinsArr[i]);

//console.debug('[renderList] turns(after)=%d pinsCount=%d',  turns.length, Object.keys(_pinsCache||{}).length);

    const maxChars = Math.max(10, Number(cfg.list?.maxChars) || 60);
    const fontPx   = (cfg.list?.fontSize || 12) + 'px';
    // === 行生成 ===
    for (const art of turns){
      // “元の全体順”の1始まり index を算出して、行に刻む
      const index1 = ST.all.indexOf(art) + 1;

      const head        = listHeadNodeOf ? listHeadNodeOf(art) : headNodeOf(art);
      const attachLine  = buildAttachmentLine(art, maxChars);
      const bodyLine    = extractBodySnippet(head, maxChars);

      // 🔖をどちらに出すか：添付があれば添付行、無ければ本文行
      const showClipOnAttach = !!attachLine;
      const showClipOnBody   = !attachLine && !!bodyLine;

      // ★追記: プレビュー用（長め）テキストを生成
      //   - 長さは 1200 文字を基準（設定があればそれを優先）
      //   - body優先、無ければattachを採用
      const PREVIEW_MAX   = Math.max(600, Math.min(2000, (SH?.getCFG?.()?.list?.previewMax || 1200)));
      const attachPreview = buildAttachmentLine(art, PREVIEW_MAX) || '';
      const bodyPreview   = extractBodySnippet(head, PREVIEW_MAX) || '';
      const previewText   = (bodyPreview || attachPreview).replace(/\s+\n/g, '\n').trim();

      // 添付行
      if (attachLine){
        const row = document.createElement('div');
        row.className = 'row';
        row.style.fontSize = fontPx;
        row.dataset.idx  = String(index1);
        row.dataset.kind = 'attach';

        const isUser = art.matches('[data-message-author-role="user"], div [data-message-author-role="user"]');
        const isAsst = art.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]');
        if (isUser) row.style.background = 'rgba(240,246,255,.60)';
        if (isAsst) row.style.background = 'rgba(234,255,245,.60)';

        // 本文行テンプレート
        row.innerHTML = `
          <div class="txt"></div>
          <div class="ops">
            <button class="cgtn-clip-pin cgtn-iconbtn off" title="${T('row.pin')}" aria-pressed ="false" aria-label="${T('row.pin')}">🔖\uFE0E</button>
            <button class="cgtn-preview-btn cgtn-iconbtn" title="${T('row.previewBtn')}" aria-label="${T('row.previewBtn')}">🔎\uFE0E</button>
          </div>
        `;
        row.querySelector('.txt').textContent = attachLine;
        row.addEventListener('click', () => scrollToHead(art));
        row.dataset.preview = previewText || attachLine || '';

        // 付箋の色設定(初期ピン色)：配列の index で決める
        const on = !!pinsArr[index1 - 1];
        paintPinRow(row, on);
        if (showClipOnAttach) bindClipPinByIndex(row.querySelector('.cgtn-clip-pin'), row, chatId);

        body.appendChild(row);
      }

      // 本文行
      if (bodyLine){  
        const row2 = document.createElement('div');
        row2.className = 'row';
        row2.style.fontSize = fontPx;
        row2.dataset.idx  = String(index1);
        row2.dataset.kind = 'body';

        const isUser = art.matches('[data-message-author-role="user"], div [data-message-author-role="user"]');
        const isAsst = art.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]');
        if (isUser) row2.style.background = 'rgba(240,246,255,.60)';
        if (isAsst) row2.style.background = 'rgba(234,255,245,.60)';

        // 本文行テンプレート
        row2.innerHTML = `
          <div class="txt"></div>
          <div class="ops">
            ${showClipOnBody ? `<button class="cgtn-clip-pin cgtn-iconbtn off" title="${T('row.pin')}" aria-pressed ="false" aria-label="${T('row.pin')}" >🔖\uFE0E</button>` : ``}
            <button class="cgtn-preview-btn cgtn-iconbtn" title="${T('row.previewBtn')}" aria-label="${T('row.previewBtn')}">🔎\uFE0E</button>
          </div>
        `;

        row2.querySelector('.txt').textContent = bodyLine;
        row2.addEventListener('click', () => scrollToHead(art));
        row2.dataset.preview = previewText || bodyLine || '';

        const on2 = !!pinsArr[index1 - 1];
        paintPinRow(row2, on2);

        if (showClipOnBody) bindClipPinByIndex(row2.querySelector('.cgtn-clip-pin'), row2, chatId);

        body.appendChild(row2);
      }
    }

    // 付箋有無チェック（pinOnly中で0件なら空表示）
    let madeRows = body.querySelectorAll('.row').length;
    if (madeRows === 0 && pinOnly) {
      const T = window.CGTN_I18N?.t || ((k) => k);

      const empty = document.createElement('div');
      empty.className = 'cgtn-empty';
      empty.style.cssText = 'padding:16px;opacity:.85;font-size:13px;';
      empty.innerHTML = `
        <div class="msg" style="margin-bottom:6px;" data-kind="msg">${T('list.noPins')}</div>
        <button class="show-all" type="button">${T('list.showAll')}</button>
      `;
      body.appendChild(empty);

      // 「すべて表示」ボタンの動作
      empty.querySelector('.show-all')?.addEventListener('click', () => {
        try {
          const cfg2 = SH.getCFG() || {};
          SH.saveSettingsPatch({ list: { ...(cfg2.list || {}), pinOnly: false } });
          document.querySelector('#cgpt-pin-filter')?.setAttribute('aria-pressed', 'false');
          NS.renderList?.(true, { pinOnlyOverride: false });
        } catch (e) {
          console.warn('show-all click failed', e);
        }
      });
    }
    const rowsCount = body.querySelectorAll('.row').length;   // ← 空行は .row じゃないので除外される
    NS._lastVisibleRows = rowsCount;
    NS.updateListFooterInfo();
    //注目ターンのキー行へスクロール
    scrollListToTurn(NS._currentTurnKey);
//console.debug('[renderList 末尾] done pinsCount=', Object.keys(_pinsCache||{}).length);
  }

  function setListEnabled(on){
    const cfg = SH.getCFG();
    SH.saveSettingsPatch({ list:{ ...(cfg.list||{}), enabled: !!on } });
    //チャット名を取得しておく
    //window.CGTN_SHARED?.touchChatMeta?.();
    // 一覧ONではメタを作らない（ピン操作時にだけ作成/更新する）

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
  
      NS.renderList(true);
      // ②遅延スキャン（添付UIが後から差し込まれる分を回収）★★★
      //    rAF×2 でペイント後、さらに少し待ってから確定
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        setTimeout(()=>{ rebuild(); NS.renderList(true); }, 180);
      }));
    } else {
    }
  }
/*
  function updateListFooterInfo(){
    try {
      const info = document.getElementById('cgpt-list-foot-info');
      const body = document.getElementById('cgpt-list-body');
      if (!info || !body) return;

      info.textContent = `${body.children.length}行（${ST.all.length}ターン中）`;
    } catch(e){
      console.warn('updateListFooterInfo failed', e);
    }
  }
*/
  function updateListFooterInfo() {
    const total = ST.all.length;
    const cfg = SH.getCFG?.() || {};
    const listCfg = cfg.list || {};
    const pinOnly = !!listCfg.pinOnly;   // ← これを追加！

    const info = document.getElementById('cgpt-list-foot-info');
    if (!info) return;

    const fmt = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_,k)=> (vars?.[k] ?? ''));
    const T   = (k)=> window.CGTN_I18N?.t?.(k) || k;

    if (pinOnly) {
      // 付箋ターン数で数える
      const chatId = SH.getChatId?.();
      const pins = SH.getPinsForChat?.(chatId);
      const pinnedCount = Array.isArray(pins)
        ? pins.filter(Boolean).length
        : Object.values(pins || {}).filter(Boolean).length;

      info.textContent = fmt(T('list.footer.pinOnly'), { count: pinnedCount, total });
    } else {
      info.textContent = fmt(T('list.footer.all'), { total });
    }
  }



  // --- expose ---
  window.CGTN_LOGIC = Object.assign(window.CGTN_LOGIC || {}, {
    updateListFooterInfo,                // ← ここはローカル名で参照できる
    getTurnKey: (NS.getTurnKey || getTurnKey),
    isPinnedByKey
  });

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
  NS.updateListFooterInfo = updateListFooterInfo;
  NS.rebuild = rebuild;
  NS.setListEnabled = setListEnabled;
  NS.goTop = goTop; 
  NS.goBottom = goBottom;
  NS.goPrev = goPrev;
  NS.goNext = goNext;
  NS.getTurnKey = getTurnKey;

})();
