// logic.js
(() => {
  const UI = window.CGTN_UI;
  const SH = window.CGTN_SHARED;
  const NS = (window.CGTN_LOGIC = window.CGTN_LOGIC || {});
//  const TURN_SEL = 'div[data-testid^="conversation-turn-"]'; // keep (legacy)
  const TURN_SEL = 'article'; // 1 <article> = 1 turn
  const SHOW_UNKNOWN_ATTACH = false; // trueにすると従来表示

  const titleEscape = SH.titleEscape;
  let uploads = 0, downloads = 0;// ダウンロードターン数・アップロードターン数


const T = (k)=> window.CGTN_I18N?.t?.(k) ?? k;

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
    if (article?.tagName === 'ARTICLE') return article;
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
    const sc = document.getElementById('cgpt-list-body');
    if (!sc) return;

    // ★ 改修: turnKey が未指定なら末尾にスクロール
    if (!turnKey) {
      sc.scrollTop = sc.scrollHeight;
      console.debug('[scrollListToTurn] turnKey undefined → scroll to bottom');
      return;
    }

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

  function pickPdfNames(names){
    return (names || []).filter(n => /\.pdf(\b|$)/i.test(String(n)));
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

  // 「…をダウンロード」抽出 → ラベル化（⭳（…））
  function _extractDownloadLabelFromText(el){
    if (!el) return '';
    const raw = (el.innerText || '').replace(/\s+/g,' ').trim();
    // 「この」を任意化し、全角半角の「 をダウンロード 」を吸収
    const m = raw.match(/(?:この)?\s*([^。\n\r]+?)\s*をダウンロード/);
    let name = (m && m[1] || '').trim();
    if (!name) return '';
    // 先頭の「この」を除去
    name = name.replace(/^この\s*/,'');
    return `⭳（${name}）`;
  }


  // ===== 添付ファイル検出（Article.txt対応） =====
  // 添付UIの実在判定（本文の単語では反応しない）
  function hasAttachmentUI(root){
    const el = root || document;
    return !!el.querySelector(
      'a[download], a[href^="blob:"], ' +
      '.border.rounded-xl .truncate.font-semibold, ' +
      'img, picture img, video, source[type^="video/"]'
    );
  }

  // ★画像生成テキストを後ろに足すための簡易検出
  function getAttachmentTailMessage(el) {
    try {
      // 1) 画像キャプションを表す要素を探す
      const captionEl = el.querySelector(
        '.text-token-text-secondary, .text-sm.text-token-text-secondary, figcaption'
      );
      if (captionEl) {
        const text = captionEl.innerText.trim();
        // 不要な語句を含む場合はスキップ
        if (text.length && !/click|open|download/i.test(text)) {
          return text;
        }
      }

      // 2) 画像の直近にある補足テキストを探す（DOM変化対応）
      const img = el.querySelector('img, picture img');
      if (img) {
        const next = img.closest('figure')?.querySelector('.text-token-text-secondary');
        if (next) return next.innerText.trim();
      }

      return '';
    } catch (e) {
      console.warn('getAttachmentTailMessage failed', e);
      return '';
    }
  }



  // --- logic.js: buildAttachmentLine 置き換え版 -------------------------------
  // 目的：
  // ・アシスタント：非PDFファイルを添付行に列挙（複数時は ⭳（<本文から抽出したFileラベル>）a b c）
  //                  単数時は ⭳（a）
  // ・ユーザー：PDFは ⭳ ではなく 📄 を添付行に出す（例：📄 Spec.pdf）
  // ・PDFのみのアシスタント配布時は添付行は空（本文側の処理は別途）
  // ・画像/動画の既存処理は維持
  function buildAttachmentLine(root, maxChars) {
    const el   = root || document;
    const role = (typeof getTurnRole === 'function' ? getTurnRole(el) : 'unknown') || 'unknown';

    // 1) 既存抽出でファイル名を取得
    const names = Array.from(new Set(collectAttachmentNames(el))).filter(Boolean);
    if (names.length) {
      // ローカル小ヘルパ：PDF抽出
      const pickPdfNames = (arr) => (arr || []).filter(n => /\.pdf(\b|$)/i.test(String(n)));
      const pdfs   = pickPdfNames(names);
      const nonPdf = names.filter(n => !pdfs.includes(n));

      // ローカル小ヘルパ：アシスタント本文の「File」ラベル抽出
      // - 近傍の chip/attachment っぽい要素から "File" / "ファイル" を拾う
      // - 見つからなければ 'File' をフォールバック
      const extractAssistantFileLabel = () => {
        // 1) よくある data-testid / class 名称を総当りで捜索
        const candidates = el.querySelectorAll(
          '[data-testid*="file"],[data-testid*="attachment"],[class*="file"],[class*="attachment"]'
        );
        for (const c of candidates) {
          const t = (c.textContent || '').trim();
          const m = t.match(/\b(File|ファイル)\b/i);
          if (m) return m[0]; // 本文で使われている表記をそのまま採用
        }
        // 2) <a download> の親周辺（2〜3階層）からテキストノードを捜索
        const a = el.querySelector('a[download], a[href]');
        if (a) {
          let p = a.parentElement;
          for (let hop = 0; hop < 3 && p; hop++, p = p.parentElement) {
            const t = (p.textContent || '').trim();
            const m = t.match(/\b(File|ファイル)\b/i);
            if (m) return m[0];
          }
        }
        return 'File';
      };

      // 役割ごとの分岐
      if (role === 'user') {
        // ユーザー投稿PDFは ⭳ ではなく 📄 を添付行に出す（複数なら空白区切り）
        if (pdfs.length) return `📄 ${pdfs.join(' ')}`;
        // 非PDFは従来どおり（必要なら別仕様に差し替え）
        if (nonPdf.length > 1) return `⭳（${nonPdf.join(' ')}）`;
        if (nonPdf.length === 1) return `⭳（${nonPdf[0]}）`;
        return '';
      }

      if (role === 'assistant') {
        // アシスタント：非PDFのみ添付行に列挙。PDFは本文側（別処理）に任せる
        if (nonPdf.length > 1) {
          const label = extractAssistantFileLabel();
          return `⭳（${label}）${nonPdf.join(' ')}`;
        }
        if (nonPdf.length === 1) {
          return `⭳（${nonPdf[0]}）`;
        }
        // PDFのみ → 添付行は空（本文側で ⭳(pdf) を出す想定／本文が無い場合）
        return '';
      }
  
      // 未知の役割：無難に非PDFを列挙
      if (nonPdf.length > 1) return `⭳（${nonPdf.join(' ')}）`;
      if (nonPdf.length === 1) return `⭳（${nonPdf[0]}）`;
      return '';
    }
  
    // 2) 実体メディア（画像/動画）検出は従来維持
    const hasImg = !!el.querySelector('img, picture img');
    const hasVid = !!el.querySelector('video, source[type^="video/"]');
    if (hasImg || hasVid) {
      const kind = hasImg && hasVid ? T('media') : hasImg ? T('image') : T('video');
      // ここは従来仕様：アシスタントは ⭳、ユーザーはアイコンなど別処理にしたい場合は適宜拡張
      const role = getTurnRole?.(el) || 'unknown';
      if (role === 'assistant') {
        // アシスタントはダウンロード可として扱う
        return `⭳${kind}`;
      } else if (role === 'user') {
        // ユーザー投稿は送信アイコンに変更
        if (hasImg) return `🖼 ${T('image')}`;
        if (hasVid) return `🎞 ${T('video')}`;
      }
      return '';
    }
  
    return '';
  }
  // ---------------------------------------------------------------------------


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
    try {
      const raw = (node?.innerText || node?.textContent || '').trim();
      // 行頭・行末の連続空白を整理し、内部の過剰連続空白も縮める
      const norm = raw.replace(/\r/g,'')
                      .replace(/[ \t]+\n/g, '\n')
                      .replace(/\n{3,}/g, '\n\n')
                      .replace(/[ \t]{2,}/g, ' ');
      return norm.length > 2000 ? norm.slice(0, 2000) + '' : norm;
    } catch {
      return '';
    }
  }

  // 互換の薄ラッパー（他所で使っていても安心・未使用なら残すだけ）
  // --- 互換の薄ラッパー（index方式 → 'turn:n' 文字列）---
  function getTurnKey(article){
/*
    const rows = (window.ST?.all || []);
    const idx  = rows.indexOf(article);
console.log("getTurnKey rows:",rows," idx:",idx);　　
    return idx >= 0 ? ('turn:' + (idx + 1)) : '';
*/
  const rows = (ST?.all || NS?.ST?.all || []);
  let target = article;
  // 引数が article 直下の子要素のことがあるので、closest で補正
  if (target && !target.matches?.('article')) {
    target = target.closest?.('article,[data-testid^="conversation-turn-"]') || target;
  }
  let idx = rows.indexOf(target);
  if (idx < 0 && target?.dataset?.turnId){
    // もし内部で turnId を振っているなら、そのIDで探索（任意）
    idx = rows.findIndex(n => n?.dataset?.turnId === target.dataset.turnId);
  }
  // デバッグ
console.debug('getTurnKey len:', rows.length, 'idx:', idx);
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
console.log("！！！scrollToHead NS._currentTurnKey: ",NS._currentTurnKey);
  }

  // ターン検出<article>
  function pickAllTurns(){
    const seen = new Set();
    let list = Array.from(document.querySelectorAll(TURN_SEL));
    if (!list.length){
      const nodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
      list = nodes.map(n => n.closest('article') || n)
                  .filter(el => el && !seen.has(el) && (seen.add(el), true));
    }

    // ★追加：DIVが紛れていたら、上位にある<article>を辿る
    list = list.map(el => el.tagName === 'ARTICLE' ? el : el.closest('article') || el);
  
    const visible = list.filter(a => {
      try {
        const r = a.getBoundingClientRect();
        const disp = getComputedStyle(a).display;
        return r.height > 10 && disp !== 'none';
      } catch { return false; }
    });
//console.log("pickAllTurns 3 visible.length",visible.length);

    return visible;
  }

  // 役割取得: data-turn を最優先。なければ従来の role 属性でフォールバック
  function getTurnRole(el){
    const hint = el?.dataset?.turn;
    if (hint === 'user' || hint === 'assistant') return hint;
    if (el.matches?.('[data-message-author-role="user"], div [data-message-author-role="user"]')) return 'user';
    if (el.matches?.('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]')) return 'assistant';
    return ''; // 不明
  }

  function sortByY(list){
    const sc = getTrueScroller();
    try{
      return list.map(el => ({ el, y: articleTop(sc, el) }))
                 .sort((a,b)=> a.y - b.y).map(x=>x.el);
    }catch{ return list; }
  }


  function isRealTurn(article){
    // === 軽い堅牢化 ===
    // ChatGPT の各発話は <article> 要素単位。
    // よって、記事ノードならそのまま「実ターン」とみなす。
    // （過剰フィルタで落とさないための早期リターン）

    if (article?.tagName === 'ARTICLE') return true;

    const head = headNodeOf(article);
    if (!head) return false;
    const r = head.getBoundingClientRect();

    if (r.height < 8 || !isVisible(head)) return false;
    const txt = (head.textContent || head.innerText || '').trim();
    const hasText  = txt.length > 0;
    const hasMedia = !!article.querySelector(
      'img,video,canvas,figure,' +
      '[data-testid*="download"],[data-testid*="attachment"],[data-testid*="file"],' +
      'a[download],a[href^="blob:"]'
    );
    const busy = head.getAttribute?.('aria-busy') === 'true';

    return (hasText || hasMedia) && !busy;
  }

  // ST: 現在ページ（チャット）内のターン情報を保持する状態オブジェクト。
  //   - all        : ページ中の全ターン（<article>）要素を上から順に格納
  //   - user       : ユーザーの発話ターンだけを抽出した配列
  //   - assistant  : アシスタントの発話ターンだけを抽出した配列
  //   - page       : 将来的にページ分割やリストのページングを想定した番号（現状は未使用）
  //
  // この ST は LG.rebuild() 実行時に毎回再構築され、ナビゲーションやリスト表示で
  // 「どの発話へスクロールするか」「どこまで描画済みか」を判断する基準として使われる。
  //
  // ─ 役割まとめ ─
  //   LG.rebuild() → ST.all / user / assistant を更新
  //   ナビボタン(goTop/goNext/...) → ST 参照してスクロール位置を決定
  //   リスト描画(renderList) → ST.all を元に各行を生成
  // 要するにST は 「ターン一覧のキャッシュ」 です。
  const ST = { all: [], user: [], assistant: [], page:1 };

  function rebuild(){
    NS._scroller = getTrueScroller();

    const t0 = performance.now();
    const allRaw = pickAllTurns().filter(isRealTurn);

    ST.all = sortByY(allRaw);
console.debug('[cgtn:rebuild] turns=', ST.all.length, 'in', (performance.now()-t0).toFixed(1), 'ms');

    // ★ 追加: <article>ゼロ件時は完全リセットモード
    if (ST.all.length === 0) {
      console.debug('[rebuild] no <article> found → reset list panel');
      // UIリセット
      CGTN_LOGIC.clearListPanelUI?.();
      return;
    }

    const isRole = (el, role) => {
      // ★改修：data-turn を優先、なければ従来セレクタで補完
      const dt = el?.dataset?.turn;
      if (dt) return dt === role;
      return el.matches?.(
        `[data-message-author-role="${role}"], div [data-message-author-role="${role}"]`
      );
    };

    ST.user      = ST.all.filter(a => getTurnRole(a) === 'user');
    ST.assistant = ST.all.filter(a => getTurnRole(a) === 'assistant');


    // 可能なら Set も用意（描画側が速くなる）
    ST._userSet = new Set(ST.user);
    ST._asstSet = new Set(ST.assistant);
    NS.ST = ST; // ← デバッグ用に公開（本番運用でも副作用なし）
console.debug('[rebuild] turns:', ST.all.length, 'user:', ST.user.length, 'asst:', ST.assistant.length);

  }

  //ダウンロード文抽出ヘルパ（本文・画像・不明の3分岐）
  //これで PDF 例は ⭳（ChatGPT_Turn_Navigator_Promo.pdf）
  //画像系は ⭳（画像）
  //アシスタント発話で未検出なら （不明）
  function getDownloadLabelForTurn(el){
    try {
      const role = el?.dataset?.turn || (el.matches?.('[data-message-author-role="assistant"]') ? 'assistant' :
                                         el.matches?.('[data-message-author-role="user"]') ? 'user' : 'unknown');
console.log("getDownloadLabelForTurn role:",role);

      // headNodeOf() で主要ノードを取得し、そのテキストをtrimして本文扱いとする。
      const head = headNodeOf(el);
      const text = (head?.textContent || head?.innerText || '').trim();
//console.log("getDownloadLabelForTurn test:",text);
      // 「〇〇をダウンロード」 or 「この〇〇をダウンロード」の検出
      const m = text.match(/(.+?)をダウンロード/);
      if (m) {
        let name = (m[1] || '').trim();
        name = name.replace(/^この/, '').trim(); // 「この」をトリミング
        if (/画像/.test(name)) name = T('image');
        return `⭳（${name || T('unknown')}）`;
      }

      // アシスタントターンでダウンロードが無い場合
      if (role === 'assistant') return T('unknown');

      // ユーザー/不明は空ラベル
      return '';
   
    } catch {
console.log("getDownloadLabelForTurn catch");
      return ''; 
    }
  }

  // 追加：パネルを完全クリア（タイトル/バッジ/本文）
  CGTN_LOGIC.clearListPanelUI = function clearListPanelUI(){
    try {
console.log("clearListPanelUI*1");
      const body  = document.getElementById('cgpt-list-body');
      if (body) body.innerHTML = '';
      const el = document.getElementById('cgpt-chat-title');
      if (el) {
console.log("clearListPanelUI el.textContent:",el.textContent);
        el.textContent = '';
        el.title = ''; 
      }
      const badge = document.querySelector('#cgpt-pin-filter .cgtn-badge');
      if (badge) { badge.textContent = ''; badge.hidden = true; }
    } catch(e){
      console.warn('[clearListPanelUI] failed', e); 
    }
    // 状態も空に
    try {
console.log("clearListPanelUI*2");
      const ST = CGTN_LOGIC.ST || (CGTN_LOGIC.ST = {});
      ST.all = []; ST.user = []; ST.assistant = [];
    } catch {
console.log("clearListPanelUI catch");

    }
  };


  CGTN_LOGIC.updateListChatTitle = function updateListChatTitle(){
    const el = document.getElementById('cgpt-chat-title');
    if (!el) return;

    if ((CGTN_LOGIC.ST?.all?.length ?? 0) === 0) { el.textContent = ''; el.title=''; return; }

    // ★ ターンゼロ時は強制リセット
    const turns = window.CGTN_LOGIC?.ST?.all?.length ?? 0;
    if (turns === 0) {
      el.textContent = '';
      el.title = '';
      return;
    }

    const cfg   = CGTN_SHARED.getCFG?.() || {};
    const cid   = CGTN_SHARED.getChatId?.();
    const t1    = CGTN_SHARED.getChatTitle?.() || '';                  // document.title（最優先）
    const t2    = cfg?.chatIndex?.ids?.[cid]?.title || '';
    const t3    = (cfg?.pinsByChat?.[cid]?.title) || '';
    const title = t1 || t2 || t3 || '(No Title)';
    el.textContent = title;
    el.title = title;
  };

  // --- list panel ---
  let listBox = null;

  function ensureListBox(){
    if (listBox && document.body.contains(listBox)) return listBox;
    listBox = document.createElement('div');
    listBox.id = 'cgpt-list-panel';

    listBox.innerHTML = `
      <div id="cgpt-list-head"
           style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;
                  padding:2px 6px 3px;
                  border-bottom:1px solid rgba(0,0,0,0.15);
                  background:rgba(255,255,255,0.95);backdrop-filter:blur(4px);
                  position:sticky;top:0;z-index:1;">        <div id="cgpt-list-grip"></div>
        <!-- ★ チャット名（つまみの下＝ヘッダ中央）。幅はパネル内に収めて…省略 -->
        <div id="cgpt-chat-title-wrap" style="order:2;flex:1 0 100%;min-width:0">
         <div id="cgpt-chat-title"
               style="max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                      text-align:center;font-weight:600;font-size:13px;opacity:.9;padding:2px 4px;">
         </div>
        </div>
        <!-- 上段右寄せにするため margin-left:auto を付与 -->
        <button id="cgpt-pin-filter" class="cgtn-badgehost" type="button" aria-pressed="false"
                style="cursor:pointer;margin-left:auto">🔖\uFE0E

          <span class="cgtn-badge" hidden>0</span>
        </button>
        <button id="cgpt-list-collapse" aria-expanded="true">▾</button>
      </div>
      <div id="cgpt-list-body"></div>
      <div id="cgpt-list-foot">
        <button id="cgpt-list-refresh" class="cgtn-mini-btn" type="button">↻</button>
        <div id="cgpt-list-foot-info" style="margin-left:auto;opacity:.8;font-size:12px;padding:4px 8px;"></div>
      </div>
    `;

    document.body.appendChild(listBox);

    // リスト幅 文字数から算出
    CGTN_LOGIC.applyPanelWidthByChars(SH.getCFG()?.list?.maxChars || 52);

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


    /* ここから追加：行番号（インデックス）をCSSカウンタで表示 */
    (function ensureIndexCounterStyle(){
      try{
        if (document.getElementById('cgtn-idx-style')) return;
        const st = document.createElement('style');
        st.id = 'cgtn-idx-style';
        st.textContent = `
          #cgpt-list-body { counter-reset: cgtn_turn; }

          /* 全行：左側に固定幅のダミーを置いて揃える */
          #cgpt-list-body .row { display:flex; align-items:flex-start; gap:6px; }
          #cgpt-list-body .row::before{
            content: "";                      /* デフォは空 */
            display: inline-block;
            min-width: 2.0em;                 /* 番号の幅 */
            margin-right: 8px;                /* 余白は今の見た目に合わせて */
            text-align: right;
            opacity: 0;                       /* 見えないだけで場所は確保 */
            font-size: 11px;
            line-height: 1;
          }
          /* アンカー行：カウンタを進め、数字を描画 */
          #cgpt-list-body .turn-idx-anchor { counter-increment: cgtn_turn; }
          #cgpt-list-body .turn-idx-anchor::before{
            content: counter(cgtn_turn);
            opacity: .75;
          }
        `;
        document.head.appendChild(st);
      }catch(_){}
    })();
    /* ここまで */

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
    // 付箋バッジ
    NS.updatePinOnlyBadge?.();
    // チャット名表示
    NS.updateListChatTitle?.()
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

    const cfg = SH.getCFG?.() || SH?.DEFAULTS || {};
    const enabled = forceOn ? true : !!cfg.list?.enabled;

    if (!enabled) return;

//    const T = (k)=> window.CGTN_I18N?.t?.(k) || k;

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

    uploads = 0, downloads = 0;// ダウンロードターン数・アップロードターン数


    // === 行生成 ===
    for (const art of turns){
      // “元の全体順”の1始まり index を算出して、行に刻む
      const index1 = ST.all.indexOf(art) + 1;

      const head        = listHeadNodeOf ? listHeadNodeOf(art) : headNodeOf(art);
      const attachLine  = buildAttachmentLine(art, maxChars); // 実体ありのときだけ非空
      const bodyLine    = extractBodySnippet(head, maxChars);

      // 🔖は「実体ありの添付行」か、なければ本文行に出す
      const hasRealAttach    = !!attachLine;  // ⭳/🖼/🎞 のいずれか
      const showClipOnAttach = hasRealAttach;
      const showClipOnBody   = !hasRealAttach && !!bodyLine;

      // ★追記: プレビュー用（長め）テキストを生成
      //   - 長さは 1200 文字を基準（設定があればそれを優先）
      //   - body優先、無ければattachを採用
      const PREVIEW_MAX   = Math.max(600, Math.min(2000, (SH?.getCFG?.()?.list?.previewMax || 1200)));
      const attachPreview = buildAttachmentLine(art, PREVIEW_MAX) || '';
      const bodyPreview   = extractBodySnippet(head, PREVIEW_MAX) || '';
      const previewText   = (bodyPreview || attachPreview).replace(/\s+\n/g, '\n').trim();

      // --- 役割判定（dataset.turn を優先し、旧属性をフォールバック） ---
      // row / row2 共通で使用するため attachLine より上に配置。
      const roleHint = art?.dataset?.turn;
      const isUser = roleHint
        ? roleHint === 'user'
        : art.matches('[data-message-author-role="user"], div [data-message-author-role="user"]');

      const isAsst = roleHint
        ? roleHint === 'assistant'
        : art.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]');

      let anchored = false;
      // 添付行：実体があるときだけ出す
      if (hasRealAttach){

        isUser ? uploads ++ : downloads ++;　//アップロードターン数　ダウンロードターン数
        const row = document.createElement('div');
        // 連番アンカー
        row.className = 'row';
        row.style.fontSize = fontPx;
        row.dataset.idx  = String(index1);
        row.dataset.kind = 'attach';
        if (!anchored){
          row.classList.add('turn-idx-anchor');
          anchored = true;
        }

        // 背景色はCSSクラスで定義（JS側はclassListで付与）
        if (isUser) row.classList.add('user-turn');
        if (isAsst) row.classList.add('asst-turn');

        // 本文行テンプレート
        row.innerHTML = `
          <div class="txt"></div>
          <div class="ops">
            <button class="cgtn-clip-pin cgtn-iconbtn off" title="${T('row.pin')}" aria-pressed ="false" aria-label="${T('row.pin')}">🔖\uFE0E</button>
            <button class="cgtn-preview-btn cgtn-iconbtn" title="${T('row.previewBtn')}" aria-label="${T('row.previewBtn')}">🔎\uFE0E</button>
          </div>
        `;
        row.querySelector('.txt').textContent = attachLine;
//        row.addEventListener('click', () => scrollToHead(art));
        row.addEventListener('click', (ev) =>{
           // 他のUIパーツやリンクはスルー
          if (ev.target.closest('.cgtn-preview-btn, .cgtn-clip-pin, a')) return;
          const txt = ev.target.closest('.txt');
          if (!txt) return;
          const row = txt.closest('.row');
          if (!row) return;
          scrollToHead(art);
        }); 
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
        // 連番アンカー
        if (!anchored){
          row2.classList.add('turn-idx-anchor'); // 添付が無いときだけ本文に番号
          anchored = true;
        }
        // 背景色はCSSクラスで定義（JS側はclassListで付与）
        if (isUser) row2.classList.add('user-turn');
        if (isAsst) row2.classList.add('asst-turn');

        // 本文行テンプレート（★右側に attach 表示欄あり）
        row2.innerHTML = `
          <div class="txt"></div><span class="attach" aria-label="attachment"></span>
          <div class="ops">
            ${showClipOnBody ? `<button class="cgtn-clip-pin cgtn-iconbtn off" title="${T('row.pin')}" aria-pressed ="false" aria-label="${T('row.pin')}" >🔖\uFE0E</button>` : ``}
            <button class="cgtn-preview-btn cgtn-iconbtn" title="${T('row.previewBtn')}" aria-label="${T('row.previewBtn')}">🔎\uFE0E</button>
          </div>
        `;

        row2.querySelector('.txt').textContent = bodyLine;
        // ③ 本文行末の attach は「添付行が無い場合のみ」表示
        let attach = !hasRealAttach ? attachLine : '';
        // ④ アシスタント本文の（不明）はフラグで制御
        if (!attach && isAsst && SHOW_UNKNOWN_ATTACH) attach = '（不明）';

        const attachEl = row2.querySelector('.attach');
        if (attach && attachEl) {
          attachEl.textContent = ' ' + attach;
          if(isAsst) downloads++; //←ダウンロードターン数
        }

//         row2.addEventListener('click', () => scrollToHead(art));
        row2.addEventListener('click', (ev) =>{
           // 他のUIパーツやリンクはスルー
          if (ev.target.closest('.cgtn-preview-btn, .cgtn-clip-pin, a')) return;
          //const txt = ev.target.closest('.txt');
          const txt = ev.target.closest('.txt, .attach'); // ★ .attach もクリックでジャンプ
          if (!txt) return;
          const row = txt.closest('.row');
          if (!row) return;
          scrollToHead(art);
        }); 
        row2.dataset.preview = previewText || bodyLine || '';

        const on2 = !!pinsArr[index1 - 1];
        paintPinRow(row2, on2);

        if (showClipOnBody) bindClipPinByIndex(row2.querySelector('.cgtn-clip-pin'), row2, chatId);

        body.appendChild(row2);

      /* ここから追加：このターンの「付箋ボタンのある要素」に連番アンカーを付与 */
//      try{
//        const preferAttach = !!hasRealAttach;  // 本文+添付なら添付側を優先
//        const pickPinCell = (root) => root?.querySelector?.('.pin-col,.pincell,.pin,[data-role="pin-col"]');
//        const pinCellAttach = preferAttach ? pickPinCell(row2) : null;
//        const pinCellBody   = pickPinCell(row);
//        const anchorEl      = pinCellAttach || pinCellBody;
//        if (anchorEl) anchorEl.classList.add('turn-idx-anchor');
//     }catch(_){
//
//      }
      /* ここまで */

      }
    }

    // 付箋有無チェック（pinOnly中で0件なら空表示）
    let madeRows = body.querySelectorAll('.row').length;
    if (madeRows === 0 && pinOnly) {
//      const T = window.CGTN_I18N?.t || ((k) => k);

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
    // 付箋バッジ
    NS.updatePinOnlyBadge?.();
    // チャット名
    NS.updateListChatTitle?.();
    //注目ターンのキー行へスクロール
//    scrollListToTurn(NS._currentTurnKey);
//console.debug('[renderList 末尾] NS._currentTurnKey:',NS._currentTurnKey);
  }

  function setListEnabled(on){
    const cfg = SH.getCFG();
    SH.saveSettingsPatch({ list:{ ...(cfg.list||{}), enabled: !!on } });

    const panel = ensureListBox();
    panel.style.display = on ? 'flex' : 'none';

    // リストが開いているかどうか
    NS._panelOpen = !!on;

    // 一覧ON時は必ず展開＆再構築→描画、付箋UIも有効化
    if (on) {
      ensurePinsCache();  // ← 追加
      // リスト幅 文字数から算出
      CGTN_LOGIC.applyPanelWidthByChars(SH.getCFG()?.list?.maxChars || 52);

console.debug('[setListEnabled*0]再アタッチ ');
      try { installAutoSyncForTurns(); } catch {}//再アタッチ

      // ①まず即時スキャン（ある程度は出る）★★★
console.debug('[setListEnabled*1]LG.rebuild() ');
      rebuild();
      panel.classList.remove('collapsed');
      const btn = panel.querySelector('#cgpt-list-collapse');
      if (btn) { btn.textContent = '▴'; btn.setAttribute('aria-expanded','true'); }
  
      NS.renderList(true);
      // ②遅延スキャン（添付UIが後から差し込まれる分を回収）★★★
      //    rAF×2 でペイント後、さらに少し待ってから確定
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
console.debug('[setListEnabled*2]LG.rebuild() ');
        setTimeout(()=>{ rebuild(); NS.renderList(true); }, 180);
      }));
    } else {
console.debug('[setListEnabled*3]一覧OFF');
    }
    //付箋バッジ・チャット名
    NS.updatePinOnlyBadge?.();
    NS.updateListChatTitle?.();
  }

  function updatePinOnlyBadge(){
    try {
      const btn = document.getElementById('cgpt-pin-filter');
      if (!btn) return;
      const badge = btn?.querySelector('.cgtn-badge');
      if (!badge) return;

      if ((CGTN_LOGIC.ST?.all?.length ?? 0) === 0) {
        badge.hidden = true;
        badge.textContent='';
        return; 
      }

      // ★ articleゼロ件なら非表示
      const turns = window.CGTN_LOGIC?.ST?.all?.length ?? 0;
      if (turns === 0) {
        badge.hidden = true;
        badge.textContent = '';
        return;
      }

      const cid = SH.getChatId?.();
      const count = cid ? SH.getPinsCountByChat?.(cid) : 0;
console.log("updatePinOnlyBadge count:",count);
      // 表示制御
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }

      // 付箋ON/OFFモードの視覚強調（既存クラス利用）
      const cfg = SH.getCFG?.() || {};
      const pinOnly = !!cfg.list?.pinOnly;
      btn.classList.toggle('active', pinOnly);

    } catch (e) {
      console.warn('[updatePinOnlyBadge]', e);
    }
  }


  function updateListFooterInfo() {
    const total = ST.all.length;
    const cfg = SH.getCFG?.() || {};
    const listCfg = cfg.list || {};
    const pinOnly = !!listCfg.pinOnly;   // ← これを追加！

    const info = document.getElementById('cgpt-list-foot-info');
    if (!info) return;

    const fmt = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_,k)=> (vars?.[k] ?? ''));

    /* ここから追加：アップロード/ダウンロード件数の計測（1ターン1カウント） */
    //let uploads = 0, downloads = 0;
/*
    try {
      const rows = Array.isArray(ST.all) ? ST.all : [];
      rows.forEach(rows => {
console.log("updateListFooterInfo rows:",rows);
        const up = rows.querySelector('[data-filename], [data-testid*="attachment"], .text-token-file') ? 1 : 0;
        const dl = rows.querySelector('a[download], [data-testid*="download"]') ? 1 : 0;
        uploads   += up;
        downloads += dl;
      });
    } catch(e) { console.warn('[footer-stats]', e); }
    /* ここまで */

    if (pinOnly) {
      // 付箋ターン数で数える
      const chatId = SH.getChatId?.();
      const pins = SH.getPinsForChat?.(chatId);
      const pinnedCount = Array.isArray(pins)
        ? pins.filter(Boolean).length
        : Object.values(pins || {}).filter(Boolean).length;
      /* ここから追加：i18n 置換子に uploads / downloads を追加 */
      info.textContent = fmt(T('list.footer.pinOnly'), {
        count: pinnedCount, total, uploads, downloads
      });
      /* ここまで */
    } else {
      info.textContent = fmt(T('list.footer.all'), {
        total, uploads, downloads
      });
    }
  }

  //付箋バッジ/チャット名更新
  document.addEventListener('cgtn:pins-updated', () => {
    try { NS?.updatePinOnlyBadge?.(); } catch {}
    try { NS?.updateListChatTitle?.(); } catch {}
  });

  /* ここから追加：③ 保存失敗時のロールバック（再読込→再描画） */
  window.addEventListener('cgtn:save-error', (ev)=>{
    try{
      const cid = ev?.detail?.chatId || SH.getChatId?.();
      if (cid) hydratePinsCache?.(cid);
      if (SH.isListOpen?.()) renderList?.(true);
      UI?.toast?.('保存に失敗しました（容量または通信エラー）', 'error');
    }catch{}
  });
  /* ここまで */

  window.addEventListener('cgtn:pins-updated', (ev) => {
    const { chatId, count } = ev.detail || {};

    // 件数表示などの小物を同期
    try { updateListFooterInfo?.(); } catch {}

    // 「付箋のみ表示」モード中は見た目も即時反映
    const pinOnly = document.querySelector('#cgpt-pin-filter[aria-pressed="true"]');
    if (pinOnly) {
      // いちばん堅いのは全体再描画
      NS.renderList?.(true);

    }
    //付箋バッジ更新
    NS?.updatePinOnlyBadge?.();
    //チャット名
    NS?.updateListChatTitle?.();
  });

  // リストの内部作業状態を軽く初期化（必要なものだけ）
  CGTN_LOGIC.onChatSwitched = function(newCid){
    try {
      // もし内部に「前回の chatId を覚えている」変数があれば更新
      CGTN_LOGIC._lastChatId = newCid;

      // リスト作成用の一時キャッシュをクリア（名前は実装に合わせて）
      CGTN_LOGIC._turnCache = {};           // ← 存在すれば
      CGTN_LOGIC._lastRenderSig = '';       // ← 変化検知用のシグネチャ類
    } catch {}
  };

  // logic.js（UI初期化後どこでも）
  // charsPerLine は設定値（例: 48, 64 など）
  CGTN_LOGIC.applyPanelWidthByChars = function(charsPerLine){
    const panel = document.getElementById('cgpt-list-panel');
    if (!panel) return;
    const em = parseFloat(getComputedStyle(panel).fontSize) || 14; // px
    const charW = 0.62 * em;   // だいたいの平均字幅
    const padding = 24 + 32;   // 左右パディング + 内部アイコン余白の概算
    const minW = 280, maxW = 680;
    const width = Math.max(minW, Math.min(maxW, Math.round(charsPerLine * charW + padding)));
    panel.style.width = width + 'px';
  };


  // --- expose ---
  window.CGTN_LOGIC = Object.assign(window.CGTN_LOGIC || {}, {
    updateListFooterInfo,                // ← ここはローカル名で参照できる
    getTurnKey: (NS.getTurnKey || getTurnKey),
    isPinnedByKey
  });

  // --- navigation ---
  function goTop(role){
    if (!ST?.all?.length) {
      console.debug('[nav-guard] ST.all empty → rebuild()');
      rebuild?.();
    }
    const L = role==='user' ? ST.user : role==='assistant' ? ST.assistant : ST.all;
    if (!L.length) return;
    scrollToHead(L[0]);
  }
  function goBottom(role){
    if (!ST?.all?.length) {
      console.debug('[nav-guard] ST.all empty → rebuild()');
      rebuild?.();
    }
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
    if (!ST?.all?.length) {
      console.debug('[nav-guard] ST.all empty → rebuild()');
      rebuild?.();
    }

    /* ここから追加：⑤-A STが古ければ即再構築 */
    try{
      const cur = pickAllTurns().filter(isRealTurn).length;
      if (cur !== (ST?.all?.length || 0)) rebuild?.();
    }catch{}
    /* ここまで */

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
    if (!ST?.all?.length) {
      console.debug('[nav-guard] ST.all empty → rebuild()');
      rebuild?.();
    }

    /* ここから追加：⑤-A STが古ければ即再構築 */
    try{
      const cur = pickAllTurns().filter(isRealTurn).length;
      if (cur !== (ST?.all?.length || 0)) rebuild?.();
    }catch{}
    /* ここまで */

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
  NS.updatePinOnlyBadge = updatePinOnlyBadge;
  NS.updateListFooterInfo = updateListFooterInfo;
  NS.rebuild = rebuild;
  NS.setListEnabled = setListEnabled;
  NS.goTop = goTop; 
  NS.goBottom = goBottom;
  NS.goPrev = goPrev;
  NS.goNext = goNext;
  NS.getTurnKey = getTurnKey;
  NS.pickAllTurns = pickAllTurns;
  NS.isRealTurn   = isRealTurn;
})();
