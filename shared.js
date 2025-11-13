// shared.js — 設定の既定値/保存、基準線API、グローバル公開
(() => {
  const t = (key) => window.CGTN_I18N?.t?.(key) || key;
  window.CGTN_SHARED = Object.assign(window.CGTN_SHARED || {}, { t });
  const SH = (window.CGTN_SHARED = window.CGTN_SHARED || {});

  // メモリCFG
  let CFG = window.CGTN_SHARED?._BOOT_CFG || {};


  // 公開アクセサ
  function setCFG(next){ CFG = (next && typeof next === 'object') ? next : {}; return CFG; }
  function getCFG(){ return CFG; }

  SH.getCFG = getCFG;
  SH.setCFG = setCFG;

  // === loadSettings（単一の実装に統一：await 可能）===
  async function loadSettings(cb){
    const all = await new Promise(res => chrome.storage.sync.get(null, res));
    const fileCfg = (all && all.cgNavSettings) ? all.cgNavSettings : {};
    // ここで既定値とマージ（DEFAULTS はこの時点で定義済み）
    CFG = Object.assign(structuredClone(DEFAULTS), fileCfg);
    try { cb && cb(CFG); } catch {}
    try { SH.markLoaded?.(); } catch {}
    return CFG;
 }

  // --- boot loaded gate ---
  let _loaded = false;
//  const _onLoadedResolvers = [];
// 読み込み完了を待つ（完了済みなら即解決）
//  SH.whenLoaded = () => _loaded ? Promise.resolve() : new Promise(r => _onLoadedResolvers.push(r));
  // ---- load 完了の通知仕組み ----
  const _resolves = [];
  SH.whenLoaded = () => _loaded ? Promise.resolve() : new Promise(r => _resolves.push(r));

  // 読み込み完了を宣言（1回だけ）
  SH.markLoaded = () => {
    if (_loaded) return;
    _loaded = true;
    const list = _onLoadedResolvers.splice(0);
    for (const fn of list) { try{ fn(); }catch{} }
  };

  // ======= 「死に際」フラグ（storage書き込み抑止） =======
  let _dying = false;
  addEventListener('pagehide', () => { _dying = true; }, { once:true });
  addEventListener('unload',   () => { _dying = true; }, { once:true });

  const canUseStorage = () =>
    !!(chrome?.runtime?.id && chrome?.storage?.sync) && !_dying;

  let __PAGE_INFO = { kind:'other', cid:'', hasTurns:false };
  SH.setPageInfo = (x) => { __PAGE_INFO = Object.assign({}, __PAGE_INFO, x||{}); };
  SH.getPageInfo = () => __PAGE_INFO;

  // === 既定値（options / content と完全一致） ===
  const DEFAULTS = Object.freeze({
    centerBias: 0.40,
    headerPx: 0,
    eps: 20,
    lockMs: 700,
    showViz: false,
    panel: { x: null, y: null },
    list: {
      enabled: false,
      maxItems: 30,
      maxChars: 40,
      fontSize: 12,
      pinOnly:false,
      // 将来のためのサイズ保存（なければ null）
      w: null, 
      h: null,
      x: null,
      y: null
    },
    pins: {}// ← 付箋（key: true）
  });

  // ---- storage util（拡張リロード中ガード）----
  async function syncGet(keys) {
    if (!chrome?.runtime?.id || !chrome?.storage?.sync) throw new Error('ext-context-lost');
    return await new Promise((res, rej) => chrome.storage.sync.get(keys ?? null, v => {
      const e = chrome.runtime.lastError; if (e) rej(e); else res(v);
    }));
  }
  async function syncSet(obj) {
    if (!chrome?.runtime?.id || !chrome?.storage?.sync) throw new Error('ext-context-lost');
    return await new Promise((res, rej) => chrome.storage.sync.set(obj, () => {
      const e = chrome.runtime.lastError; if (e) rej(e); else res();
    }));
  }

  // === keys & wrappers ===
  const KEY_CFG  = 'cgNavSettings';
  const KEY_PINS = (id) => `cgtn:pins:${id}`;

  async function syncGetAsync(keys){
    return await new Promise((res, rej)=>{
      chrome.storage.sync.get(keys, obj=>{
        const err = chrome.runtime?.lastError;
        if (err) return rej(err);
        res(obj || {});
      });
    });
  }
  async function syncSetAsync(obj){
    return await new Promise((res, rej)=>{
      chrome.storage.sync.set(obj, ()=>{
        const err = chrome.runtime?.lastError;
        if (err) return rej(err);
        res();
      });
    });
  }
  async function syncRemoveAsync(keys){
    return await new Promise((res, rej)=>{
      chrome.storage.sync.remove(keys, ()=>{
        const err = chrome.runtime?.lastError;
        if (err) return rej(err);
        res();
      });
    });
  }

  // ===== Pins split storage (schema v2) =====
  const PINS_KEY_PREFIX = 'cgtnPins::';
  const pinKeyOf = (chatId) => `${PINS_KEY_PREFIX}${chatId}`;

  // storage.sync.set/get を Promise 化（lastError 準拠）
  async function syncGet(keys){
    return await new Promise((resolve, reject)=>{
      chrome.storage.sync.get(keys, (obj)=>{
        const err = chrome.runtime?.lastError;
        if (err) return reject(err);
        resolve(obj || {});
      });
    });
  }

  SH.syncSetAsync = syncSetAsync; // 既存の名前空間にあわせて

  // === sync から最新を強制ロードしてメモリCFGに反映 ===
  SH.reloadFromSync = async function(){
    if (!chrome?.storage?.sync) return SH.getCFG?.() || {};
    const all = await new Promise(res => chrome.storage.sync.get(null, res));
    const cfg = (all && all.cgNavSettings) ? all.cgNavSettings : {};
    try { setCFG(cfg); } catch {}
    return cfg;
  };


  // いまのタブのチャットIDとタイトルを保存（pinsByChat / chatIndex を同時に更新）
  SH.setChatTitleForId = function(chatId, title){
    if (!chatId) return;
    const cfg = SH.getCFG() || {};
    const byChat = cfg.pinsByChat || {};
    const rec    = byChat[chatId] || {};
    const now    = Date.now();

    // pinsByChat 側のタイトルを“最新で”上書き（空なら残ってしまうので newTitle→oldTitle の順）
    const newTitle = (title || '').trim();
    const oldTitle = (rec.title || '').trim();
    const nextTitle = newTitle || oldTitle || '(No Title)';

    byChat[chatId] = {
      ...rec,
      title: nextTitle,
      updatedAt: now,
      pins: rec.pins || {}     // 既存ピンは維持
    };

    // chatIndex（設定画面で参照する“現在の一覧”）も同期
    const idx = cfg.chatIndex || {};
    const ids = idx.ids || {};
    ids[chatId] = { title: nextTitle, updatedAt: now };

    SH.saveSettingsPatch({ pinsByChat: byChat, chatIndex: { ...idx, ids } });
    // 付箋バッジ・チャット名
    window.CGTN_LOGIC?.updatePinOnlyBadge?.();
    window.CGTN_LOGIC?.updateListChatTitle?.();
  };
  // ドキュメントタイトルを使って現在チャットの名前を更新
  SH.refreshCurrentChatTitle = function(){
    try{
      const id = SH.getChatId && SH.getChatId();
      const title = (document.title || '').trim();
      if (id && title && title !== 'ChatGPT') SH.setChatTitleForId(id, title);
    }catch{}
  };

  // shared.js に追記（削除しない）
  SH.normalizePinsByChat = function (pinsByChat, { dropZero=true, preferNewTitle=true } = {}){
    const map = { ...(pinsByChat || {}) };
    for (const id of Object.keys(map)){
      const pins = map[id]?.pins || [];
      // 1) ゼロ件は削除
      if (dropZero && pins.length === 0) {
        delete map[id];
        continue;
      }
      // 2) タイトルの最新化（savePinsArrの順序に合わせて同等の優先度）
      if (preferNewTitle) {
        const oldTitle = map[id]?.title || '';
        const newTitle = SH.getChatTitle?.(id) || ''; // 取れない環境なら '' のまま
        const title    = newTitle || oldTitle || '(No Title)';
        map[id] = { ...map[id], title };
      }
    }
    return map;
  };

  SH.dumpPinsIndex = function(){
    const cfg = SH.getCFG?.() || {};
    const map = cfg.pinsByChat || {};
    const out = Object.entries(map).map(([id, rec]) => ({
      id, title: rec?.title, pinCount: Array.isArray(rec?.pins) ? rec.pins.filter(Boolean).length
               : Object.values(rec?.pins||{}).filter(Boolean).length,
      updatedAt: rec?.updatedAt
    }));
    console.table(out);
    return out;
  };

  // === pinsByChat 保存レイヤ ===
  // chatId の抽出（/c/<id> を最優先、なければパス全体をフォールバック）
  SH.getChatId = function(){
    try {
      const m = (location.pathname||'').match(/\/c\/([a-z0-9-]+)/i);
      if (m) return m[1];
      // Copilot/Gemini 等への将来拡張のための素朴フォールバック
      return (location.host + location.pathname).toLowerCase();
    } catch { return 'unknown'; }
  };

  SH.getChatTitle = function(){
    try {
      const docTitle = (document.title || '').trim();
      return docTitle;
    } catch(e) {
      console.warn('[getChatTitle] error', e);
      return '';
    }
  };

  function _ensurePinsByChat(cfg){
    cfg.pinsByChat = cfg.pinsByChat || {};
    return cfg.pinsByChat;
  }

  // 取得
  SH.getPinsForChat = function(chatId = SH.getChatId()){
    const cfg = SH.getCFG?.() || {};
    const map = _ensurePinsByChat(cfg);
    return map[chatId]?.pins || {};
  };

  // 上書き保存

  SH.setPinsForChat = function(pinsObj, chatId = SH.getChatId()){
    const pinsCount = Object.values(pinsObj || {}).filter(Boolean).length;
    if (pinsCount === 0) return;  // ← 空なら保存しない

    const cfg = SH.getCFG?.() || {};
    const map = cfg.pinsByChat || {};
    const title = SH.getChatTitle?.() || map[chatId]?.title || '';

    map[chatId] = {
      pins: { ...(pinsObj||{}) },
      title,
      updatedAt: Date.now()
    };
    SH.saveSettingsPatch?.({ pinsByChat: map });
  };

  // 件数
  SH.countPinsForChat = function(chatId = SH.getChatId()){
    const cur = SH.getPinsForChat(chatId);
//console.debug('[getPinsForChat] chat=%s count=%d',chatId, Object.keys((CFG.pinsByChat?.[chatId]?.pins)||{}).length);
    return Object.keys(cur).length;
  };

  // メタだけ更新（タイトル刷新等）
  SH.touchChatMeta = function(chatId = SH.getChatId(), title = SH.getChatTitle()){
    const cfg = SH.getCFG?.() || {};
    const map = cfg.pinsByChat || {};
    const rec = map[chatId];
    if (!rec) {
      console.debug('[touchChatMeta] skipped: no record', { chatId, title });
      return;
    }

    const oldTitle = rec.title || '';
    //const picked   = oldTitle || title || '(No Title)';
    const picked   = (title && title.trim()) || oldTitle || '(No Title)';

    // ★計測ログ：上書き検知
    if (picked !== oldTitle) {
      console.debug('[touchChatMeta] title change intent', {
        chatId, oldTitle, titleCandidate: title, result: picked, path: location.pathname,
        time: new Date().toISOString()
      }, new Error('trace').stack?.split('\n').slice(1,4).join('\n'));
    } else {
      console.debug('[touchChatMeta] keep title', { chatId, oldTitle });
    }

    map[chatId] = { pins: rec.pins || {}, title: picked, updatedAt: Date.now() };

    SH.saveSettingsPatch?.({ pinsByChat: map });
  };

  // 言語判定の委譲（UI側で変えられるようフックを用意）
  let langResolver = null;
  SH.setLangResolver = (fn) => { langResolver = fn; };
  SH.setLang = (lang) => window.CGTN_I18N?.setLang?.(lang);

  function curLang(){
    try {
      // ★ 最優先：拡張UIが公開する現在言語
      const u = SH.getLang?.();
      const ur = String(u).toLowerCase();
      if (u) return ur;

      // 互換：従来の resolver もサポート
      const r = langResolver?.();
      if (r) return String(r).toLowerCase();

      const cfg = SH.getCFG?.() || {};
      if (cfg.lang){
        return String(cfg.lang).toLowerCase();
      }
      if (cfg.english) {
        return 'en';
      }
      return String(document.documentElement.lang || 'ja').toLowerCase();
    } catch {
      return 'ja';
    }
  }

  // 言語切替フックの登録先
  const _langHooks = new Set();

  /** 言語切替時に再実行したい処理を登録 */
  SH.onLangChange = function onLangChange(fn){
    if (typeof fn === 'function') _langHooks.add(fn);
  };

  // 直近の登録を覚えておいて、言語切替時に再適用
  const _registrations = [];
  SH.applyTooltips = function(pairs, root = document){
    const L = (SH.curLang?.() || 'ja');
    if (!pairs) return;
    // 保存（同一root+keysは上書き）
    _registrations.push({ root, pairs });

    Object.entries(pairs).forEach(([sel, key])=>{
      root.querySelectorAll(sel).forEach(el => {
        const s = t(key);
        if (s) el.title = s; 
      });
    });
  };

  /** 既存: ツールチップの再適用 */
  SH.updateTooltips = function(){
    const L = (SH.curLang?.() || 'ja');

    // 既存のツールチップ再適用
    _registrations.forEach(({ root, pairs }) => {
      Object.entries(pairs||{}).forEach(([sel, key]) => {
        root.querySelectorAll(sel).forEach(el => {
          const s = t(key);
          if (s) el.title = s;
        });
      });
    });

    // ★ 新規：言語切替フックを一斉実行
    _langHooks.forEach(fn => {
      try { fn(); } catch(e){ console.warn('onLangChange hook failed', e); }
    });
  };


  const isNum = v => Number.isFinite(Number(v));
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
  function deepMerge(dst, src){
    for (const k in src){
      if (src[k] && typeof src[k]==='object' && !Array.isArray(src[k])) dst[k] = deepMerge(dst[k]||{}, src[k]);
      else if (src[k] !== undefined) dst[k] = src[k];
    }
    return dst;
  }

  // 旧 pinsByChat → 分割キーへ一度だけ移行(content.js initialize)
  SH.migratePinsStorageOnce = async function(){
    const cfg = SH.getCFG?.() || {};
    if (!cfg.pinsByChat) return;// 既に移行済み

    const map = cfg.pinsByChat || {};
    const idx = cfg.pinsIndex = (cfg.pinsIndex || {});
    for (const [cid, rec] of Object.entries(map)){
      const arr = Array.isArray(rec?.pins) ? rec.pins : [];
      const pins = arr.map(v=>!!v ? 1 : 0);
      const k = KEY_PINS(cid);
      await syncSetAsync({ [k]: pins });
      idx[cid] = { count: pins.filter(Boolean).length, updatedAt: Date.now() };
    }
    // 旧データを設定から削除
    delete cfg.pinsByChat;
    SH.setCFG?.(cfg);
    await syncSetAsync({ [KEY_CFG]: cfg });
  };

 function cleanupZeroPinRecords() {
    const cfg = SH.getCFG() || {};
    const map = { ...(cfg.pinsByChat || {}) };
    let changed = false;
    for (const [cid, rec] of Object.entries(map)) {
      const pins = Array.isArray(rec?.pins) ? rec.pins : Object.values(rec?.pins || {});
      if (!pins.some(Boolean)) { delete map[cid]; changed = true; }
    }
    if (changed) SH.saveSettingsPatch({ pinsByChat: map });
  };


   // ===== 新仕様 =====
   // ===== Pins storage helpers (options画面・管理用) =====
   async function _loadCfgRaw(){
     return new Promise(res=>{
       try{
         chrome.storage.sync.get('cgNavSettings', ({ cgNavSettings })=>{
           res(cgNavSettings || {});
         });
       }catch{ res({}); }
     });
   }
   async function _saveCfgRaw(next){
     return new Promise((res,rej)=>{
       try{
         chrome.storage.sync.set({ cgNavSettings: next }, ()=>res(true));
       }catch(e){ rej(e); }
     });
   }
 
   SH.loadPinsMapAsync = async function loadPinsMapAsync(){
     const cfg = await _loadCfgRaw();
     const map = cfg.pinsByChat || {};
     return map; // { [chatId]: boolean[] }
   };
 
   SH.savePinsMapAsync = async function savePinsMapAsync(nextMap){
     const cfg = await _loadCfgRaw();
     cfg.pinsByChat = nextMap || {};
     await _saveCfgRaw(cfg);
     return true;
   };
 
   SH.setPinsArrAsync = async function setPinsArrAsync(chatId, pinsArr){
     const map = await SH.loadPinsMapAsync();
     if (pinsArr && pinsArr.length) map[chatId] = pinsArr;
     else delete map[chatId];
     await SH.savePinsMapAsync(map);
     return true;
   };
 
   SH.deletePinsForChatAsync = async function deletePinsForChatAsync(chatId){
     const map = await SH.loadPinsMapAsync();
     if (map[chatId]){ delete map[chatId]; await SH.savePinsMapAsync(map); }
     return true;
   };


  // 読み出しは同期しても良いけど、呼び元の都合上 sync版も提供
  SH.getPinsArr = function getPinsArr(chatId = SH.getChatId?.()) {
    // 非同期を使えない箇所のためのフォールバック（空配列）
    console.warn('[getPinsArr] sync path returns empty if not cached; prefer getPinsArrAsync');
    return [];
  };

  SH.getPinsArrAsync = async function(chatId = SH.getChatId?.()){
    if (!chatId) return [];
    try{
      const obj = await syncGet(pinKeyOf(chatId));
      const rec = obj?.[pinKeyOf(chatId)];
      const arr = Array.isArray(rec?.pins) ? rec.pins : [];
      return arr.slice();
    }catch(_){ return []; }
  };

  // 付箋データ保存
  SH.savePinsArr = async function savePinsArr(arr, chatId = SH.getChatId?.()) {
    if (!chatId) return { ok:false, err:'no-chat-id' };
//    const pins = Array.isArray(arr) ? arr.slice() : [];
    const title = await SH.resolveTitleFor(chatId);
    await syncSet({ [pinKeyOf(chatId)] : { pins, updatedAt: Date.now(), title } });

    try{
      await syncSet({ [pinKeyOf(chatId)] : { pins } });
      // インデックスの pinCount だけ更新
      const cfg = SH.getCFG() || {};
      const cnt = pins.filter(Boolean).length;
      const idx = cfg.chatIndex?.map || (cfg.chatIndex = { ids:[], map:{} }).map;
      idx[chatId] = { ...(idx[chatId]||{}), pinCount: cnt, updated: Date.now() };
      await syncSet({ cgNavSettings: cfg });

      // ★計測ログ
      console.debug('[savePinsArr] about to save', {
        chatId,
        pinsCount: cnt,
        path: location.pathname,
        time: new Date().toISOString()
      }, new Error('trace').stack?.split('\n').slice(1,4).join('\n'));

      return { ok:true };
    }catch(err){
      console.warn('[savePinsArr] failed:', err);
      return { ok:false, err };
    }
  };

  // 付箋データ保存
  SH.savePinsArrAsync = async (arr, chatId = SH.getChatId?.()) => {
    if (!chatId) return { ok:false };
    const key = pinKeyOf(chatId);
    try{
//      await syncSet({ [key]: { pins: arr } });
    const title = await SH.resolveTitleFor(chatId);
    await syncSet({ [key]: { pins: arr, updatedAt: Date.now(), title } });

      // インデックスの件数も更新
      const cfg = SH.getCFG() || {};
      const map = { ...(cfg.chatIndex?.map || {}) };
      const cnt = (arr || []).filter(Boolean).length;
      map[chatId] = { ...(map[chatId] || {}), pinCount: cnt, updated: Date.now() };
      await SH.saveSettingsPatch?.({ chatIndex: { ...(cfg.chatIndex||{}), map } });
      return { ok:true };
    }catch(e){
      // 拡張リロード中などは失敗しても致命ではない
      console.warn('[savePinsArrAsync] failed:', e?.message || e);
      return { ok:false, err:e };
    }
  };

  SH.deletePinsForChat = async function(chatId){
    try{
      await syncRemoveAsync(pinKeyOf(chatId));
      // インデックスを 0 件に
      const cfg = SH.getCFG() || {};
      const idx = cfg.chatIndex?.map || (cfg.chatIndex = { ids:[], map:{} }).map;
      if (idx[chatId]) idx[chatId] = { ...idx[chatId], pinCount: 0, updated: Date.now() };
      await syncSet({ cgNavSettings: cfg });
      return true;
    }catch(err){
      console.warn('[deletePinsForChat] failed:', err);
      return false;
    }
  };

  // トグル（1始まり）
//  SH.togglePinByIndex = function togglePinByIndex(index1, chatId = SH.getChatId?.()) {
  SH.togglePinByIndex = async function togglePinByIndex(index1, chatId = SH.getChatId?.()) {
    if (!Number.isFinite(index1) || index1 < 1) return false;
//    const arr = SH.getPinsArr(chatId).slice();
    const arr = await SH.getPinsArrAsync(chatId);
    if (arr.length < index1) { const old = arr.length; arr.length = index1; arr.fill(0, old, index1); }
    const next = arr[index1 - 1] ? 0 : 1;
    arr[index1 - 1] = next;
//    SH.savePinsArr(arr, chatId);
    const { ok } = await SH.savePinsArrAsync(arr, chatId);
    if (!ok){
      // 失敗→UIロールバック：元に戻す 
      arr[index1 - 1] = next ? 0 : 1;
      try{ window.CGTN_UI?.toastNearPointer?.(SH.t?.('options.saveFailed') || 'Failed to save'); }catch(_){}
      return false;
    }
    // 付箋バッジ
    try{ document.dispatchEvent(new CustomEvent('cgtn:pins-updated',{detail:{chatId}})); }catch{}

    return !!next;
  };

  // 件数ヘルパ（配列方式に合わせて修正）
  SH.countPinsForChat = function(chatId = SH.getChatId()){
    try{
      const arr = SH.getCFG?.()?.pinsByChat?.[chatId]?.pins || [];
      return arr.reduce((a,b)=> a + (b ? 1 : 0), 0);
    }catch{ return 0; }
  };

  // 付箋バッジなどで使う：チャットごとの付箋数
  SH.getPinsCountByChat = function getPinsCountByChat(chatId){
    try{
      const cid = chatId || SH.getChatId?.();
      if (!cid) return 0;

      const cfg = SH.getCFG?.() || {};
      const map = cfg.chatIndex?.map || {};

      // 新仕様：chatIndex.map に pinCount をキャッシュしている
      const rec = map[cid];
      if (rec && typeof rec.pinCount === 'number') {
        return rec.pinCount;
      }

      // フォールバック（旧データ／移行中対策）
      const pinsRec = cfg.pinsByChat?.[cid];
      let arr;
      if (Array.isArray(pinsRec?.pins)) {
        arr = pinsRec.pins;
      } else if (Array.isArray(pinsRec)) {
        arr = pinsRec;
      } else if (pinsRec && typeof pinsRec === 'object') {
        arr = Object.values(pinsRec);
      } else {
        arr = [];
      }
      return arr.filter(Boolean).length;

    } catch (e){
      console.warn('[getPinsCountByChat] failed', e);
      return 0;
    }
  };

  // ========= saveSettingsPatch（書き込みガード付き）=========
  SH.saveSettingsPatch = async function saveSettingsPatch(patch = {}, cb){
    const before = SH.getCFG?.() || {};
//console.log("saveSettingsPatch");
    const merged = deepMerge(structuredClone(before), patch);
//console.log("saveSettingsPatch merged:",merged);
    SH.setCFG?.(merged);
    try{
      if (canUseStorage()){
//console.log("saveSettingsPatch canUseStorage true");
        await syncSetAsync({ [KEY_CFG]: merged });
      } else {
        // 破棄中はメモリ反映のみで良し（警告は残さない）
        return { ok:true, cfg:merged, warn:'memory-only' };
      }
      try{ cb && cb(merged); }catch{}
      return { ok:true, cfg:merged };
    }catch(err){
      console.warn('[saveSettingsPatch] failed:', err?.message || err);
      try{ SH.setCFG?.(before); }catch{}
      return { ok:false, err, before };
    }
  };


  function computeAnchor(cfg){
    const s = { ...DEFAULTS, ...(cfg||{}) };
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const centerBias = clamp(Number(s.centerBias), 0, 1);
    const headerPx   = Math.max(0, Number(s.headerPx)||0);
    const eps        = Math.max(0, Number(s.eps)||0);
    const y = Math.round(vh * centerBias - headerPx);
    return { y, eps, centerBias, headerPx };
  }

  function ensureVizElements(){
    const mk = (id, css) => {
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('div'); el.id = id; Object.assign(el.style, css); document.body.appendChild(el); }
      return el;
    };
    const line = mk('cgpt-bias-line', {
      position:'fixed', left:0, right:0, height:'0',
      borderTop:'3px solid red', zIndex:2147483647,
      pointerEvents:'none', display:'none', boxSizing:'content-box', margin:0, padding:0
    });
    const band = mk('cgpt-bias-band', {
      position:'fixed', left:0, right:0, height:'0',
      zIndex:2147483647, pointerEvents:'none', display:'none',
      boxSizing:'content-box', margin:0, padding:0,
      background:'linear-gradient(to bottom, rgba(255,0,0,0.08), rgba(255,0,0,0.22), rgba(255,0,0,0.08))'
    });
    return { line, band };
  }

  function redrawBaseline(){
    const { y } = computeAnchor(CFG);
    const { line, band } = ensureVizElements();
    line.style.top = `${y}px`;
    const eps = CFG.eps ?? DEFAULTS.eps;
    band.style.top = `${y - eps}px`;
    band.style.height = `${eps * 2}px`;
  }

  function renderViz(cfg, visible = undefined){
    const { y, eps } = computeAnchor(cfg || CFG);
    const { line, band } = ensureVizElements();
    line.style.top = `${y}px`;
    band.style.top = `${y - eps}px`;
    band.style.height = `${eps * 2}px`;
    if (typeof visible === 'boolean') {
      const disp = visible ? '' : 'none';
      line.style.display = disp;
      band.style.display = disp;
    }
  }

  let _visible = false;

  function toggleViz(on){
    _visible = (typeof on === 'boolean') ? on : !_visible;
    renderViz(CFG, _visible);
  }

/*
  (function(NS){
    SH.titleEscape = function(s){
      return String(s || '').replace(/[&<>"']/g, c => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
      }[c]));
    };
  })(window.CGTN_SHARED);
*/

  SH.titleEscape = function(s){
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  };


  try {
    chrome?.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== 'sync' || !changes.cgNavSettings) return;
      const next = structuredClone(DEFAULTS);
      deepMerge(next, changes.cgNavSettings.newValue || {});
      if (!next.list) next.list = structuredClone(DEFAULTS.list);
      CFG = next;
      renderViz(CFG, undefined);
    });
  } catch {}

  // === UIの実状態: 今まさにリストが開いているか？ ===
  /** UI(checkbox) → ランタイムフラグ → 保存値 の順で判定 */
  SH.isListOpen = function isListOpen(){
console.log("***isListOpen***");
    try{
      const cb = document.getElementById('cgpt-list-toggle');
      if (cb) return !!cb.checked;
      if (window.CGTN_LOGIC && typeof window.CGTN_LOGIC._panelOpen === 'boolean') {
        return !!window.CGTN_LOGIC._panelOpen;
      }
      return !!(SH.getCFG?.()?.list?.enabled);
    }catch{
      return !!(SH.getCFG?.()?.list?.enabled);
    }
  };

  // タイトル解決（副作用なし / DOM非依存）
  SH.resolveTitleFor = async function resolveTitleFor(chatId, fallback=''){
    try{
      const cfg   = SH.getCFG?.() || {};
      const ids   = (cfg.chatIndex && cfg.chatIndex.ids) || {};
      const map   = (cfg.chatIndex && cfg.chatIndex.map) || {};
      const live  = ids[chatId] || map[chatId] || {};

      // ① 現在のチャット画面で同一CIDなら live title を最優先
      let liveTitle = '';
      try{
        if (SH.getChatId?.() === chatId) liveTitle = (SH.getChatTitle?.() || '').trim();
      }catch{}

      // ② インデックスの title、③ 既存保存の title、④ fallback、⑤ CID
      const key   = `cgtnPins::${chatId}`;
      const prev  = (await SH.syncGet?.(key))?.[key] || {};
      const t2    = (live.title || '').trim();
      const t3    = (prev.title || '').trim();
      let   base  = liveTitle || t2 || t3 || (fallback || '').trim() || chatId;

      // プロジェクト接頭辞
      const proj  = (live.project || live.folder || live.group || '').trim();
      if (proj && !base.startsWith(proj)) base = `${proj} - ${base}`;

      return base.replace(/\s+/g, ' ');
    }catch{
      return fallback || chatId;
    }
  };

  //チャットID→表示用タイトル関数
  SH.getTitleForChatId = function getTitleForChatId(cid, fallback=''){
    try{
      const cfg    = SH.getCFG?.() || {};
      const ids    = (cfg.chatIndex && cfg.chatIndex.ids)  || {};
      const map    = (cfg.chatIndex && cfg.chatIndex.map)  || {};
      const live   = ids[cid] || map[cid] || {};
  
      // タイトル候補の優先度：
      // 1) chatIndex（ids/map）にある title
      // 2) pinsByChat に保存済みの title
      // 3) 引数 fallback
      // 4) 何も無ければ CID
      const t2 = (live.title || '').trim();
      const t3 = (cfg.pinsByChat?.[cid]?.title || '').trim();
      let base = t2 || t3 || (fallback || '').trim();

      // プロジェクト名/フォルダ名などの接頭辞
      const proj = (live.project || live.folder || live.group || '').trim();

      if (!base) base = cid;
      if (proj && !base.startsWith(proj)) base = `${proj} - ${base}`;

      return base.replace(/\s+/g, ' ');
    }catch{
      return (fallback || cid);
    }
  };

  SH.DEFAULTS = DEFAULTS;
//  SH.getCFG       = () => CFG;
//  SH.setCFG       = setCFG;
  SH.loadSettings = loadSettings;
  SH.computeAnchor = computeAnchor;
  SH.renderViz = renderViz;
  SH.redrawBaseline = redrawBaseline;
  SH.toggleViz = toggleViz;
  SH.renderViz  = renderViz;
  SH.cleanupZeroPinRecords = cleanupZeroPinRecords;

})();
