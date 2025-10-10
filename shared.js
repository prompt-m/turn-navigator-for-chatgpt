// shared.js — 設定の既定値/保存、基準線API、グローバル公開
(() => {
  const NS = (window.CGTN_SHARED = window.CGTN_SHARED || {});

  const t = (key) => window.CGTN_I18N?.t?.(key) || key;
  window.CGTN_SHARED = Object.assign(window.CGTN_SHARED || {}, { t });

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

  // === pinsByChat 保存レイヤ ===
  // chatId の抽出（/c/<id> を最優先、なければパス全体をフォールバック）
  NS.getChatId = function(){
    try {
      const m = (location.pathname||'').match(/\/c\/([a-z0-9-]+)/i);
      if (m) return m[1];
      // Copilot/Gemini 等への将来拡張のための素朴フォールバック
      return (location.host + location.pathname).toLowerCase();
    } catch { return 'unknown'; }
  };

  // 表示名（options 用に記録）
  NS.getChatTitle = function(){
    try {
      // ChatGPT系は document.title の先頭で十分
      return (document.title || '').trim().slice(0,120);
    } catch { return ''; }
  };

  function _ensurePinsByChat(cfg){
    cfg.pinsByChat = cfg.pinsByChat || {};
    return cfg.pinsByChat;
  }

  // 取得
  NS.getPinsForChat = function(chatId = NS.getChatId()){
    const cfg = NS.getCFG?.() || {};
    const map = _ensurePinsByChat(cfg);
    return map[chatId]?.pins || {};
  };

  // 上書き保存
  NS.setPinsForChat = function(pinsObj, chatId = NS.getChatId()){
    const pinsCount = Object.values(pinsObj || {}).filter(Boolean).length;
    if (pinsCount === 0) return;  // ← 空なら保存しない

    const cfg = NS.getCFG?.() || {};
    const map = cfg.pinsByChat || {};
    const title = NS.getChatTitle?.() || map[chatId]?.title || '';
    map[chatId] = {
      pins: { ...(pinsObj||{}) },
      title,
      updatedAt: Date.now()
    };
    NS.saveSettingsPatch?.({ pinsByChat: map });
  };

/*
  NS.setPinsForChat = function(pinsObj, chatId = NS.getChatId()){
    const cfg = NS.getCFG?.() || {};
    const map = _ensurePinsByChat(cfg);
    const title = NS.getChatTitle?.() || map[chatId]?.title || '';
    map[chatId] = {
      pins: { ...(pinsObj||{}) },
      title,
      updatedAt: Date.now()
    };
    NS.saveSettingsPatch?.({ pinsByChat: map });
  };
*/
  // 件数
  NS.countPinsForChat = function(chatId = NS.getChatId()){
    const cur = NS.getPinsForChat(chatId);
console.debug('[getPinsForChat] chat=%s count=%d',
  chatId, Object.keys((CFG.pinsByChat?.[chatId]?.pins)||{}).length);
    return Object.keys(cur).length;
  };

  // メタだけ更新（タイトル刷新等）
  NS.touchChatMeta = function(chatId = NS.getChatId(), title = NS.getChatTitle()){
    const cfg = NS.getCFG?.() || {};
    const map = _ensurePinsByChat(cfg);
    const rec = map[chatId] || {};
    map[chatId] = {
      pins: rec.pins || {},
      title: title || rec.title || '',
      updatedAt: Date.now()
    };
    NS.saveSettingsPatch?.({ pinsByChat: map });
  };
/*
  // エントリ削除（options の「削除」ボタン用）
  NS.deletePinsForChat = function(chatId){
console.log("deletePinsForChat chatId:",chatId);
    const cfg = NS.getCFG?.() || {};
    const map = _ensurePinsByChat(cfg);
    if (!map[chatId]) return;
console.log("deletePinsForChat cfg:",cfg," map",map);
    delete map[chatId];
    NS.saveSettingsPatch?.({ pinsByChat: map });
  };
*/
  // エントリ削除（options の「削除」ボタン用）
  NS.deletePinsForChat = function deletePinsForChat(chatId){
    try {
      const cfg = this.getCFG?.() || {};
      if (!cfg.pinsByChat || !cfg.pinsByChat[chatId]) return false;
      delete cfg.pinsByChat[chatId];
      this.saveSettingsPatch({ pinsByChat: cfg.pinsByChat });
      return true;
    } catch(e){
      console.warn('deletePinsForChat failed', e);
      return false;
    }
  };


  // 言語判定の委譲（UI側で変えられるようフックを用意）
  let langResolver = null;
  NS.setLangResolver = (fn) => { langResolver = fn; };

  function curLang(){
    try {
      // ★ 最優先：拡張UIが公開する現在言語
      const u = NS.getLang?.();
      const ur = String(u).toLowerCase();
      if (u) return ur;

      // 互換：従来の resolver もサポート
      const r = langResolver?.();
      if (r) return String(r).toLowerCase();

      const cfg = NS.getCFG?.() || {};
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
  NS.onLangChange = function onLangChange(fn){
    if (typeof fn === 'function') _langHooks.add(fn);
  };

  // 直近の登録を覚えておいて、言語切替時に再適用
  const _registrations = [];
  NS.applyTooltips = function(pairs, root = document){
    const L = (NS.curLang?.() || 'ja');
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
  NS.updateTooltips = function(){
    const L = (NS.curLang?.() || 'ja');

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

  let CFG = structuredClone(DEFAULTS);

  const isNum = v => Number.isFinite(Number(v));
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
  function deepMerge(dst, src){
    for (const k in src){
      if (src[k] && typeof src[k]==='object' && !Array.isArray(src[k])) dst[k] = deepMerge(dst[k]||{}, src[k]);
      else if (src[k] !== undefined) dst[k] = src[k];
    }
    return dst;
  }

  let _loaded = false, _resolves = [];
  NS.whenLoaded = () => _loaded ? Promise.resolve() : new Promise(r => _resolves.push(r));

  function loadSettings(cb){
    try{
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings })=>{
        const next = structuredClone(DEFAULTS);
        if (cgNavSettings) deepMerge(next, cgNavSettings);
        if (!next.list) next.list = structuredClone(DEFAULTS.list);
        CFG = next;
        _loaded = true; _resolves.splice(0).forEach(r=>r());
        cb?.();
console.debug('[loadSettings] pinsByChat keys=%o',Object.keys((CFG.pinsByChat||{})));
      });
    }catch{
      CFG = structuredClone(DEFAULTS);
      _loaded = true; _resolves.splice(0).forEach(r=>r());
      cb?.();
    }
  }

/*
// 取得（常に配列を返す）
NS.getPinsArr = function getPinsArr(chatId = NS.getChatId?.()) {
  const cfg  = NS.getCFG?.() || {};
  const rec  = cfg.pinsByChat?.[chatId] || { pins: [] };
  return Array.isArray(rec.pins) ? rec.pins : [];
};

// 保存（配列を丸ごと置く）
NS.savePinsArr = function savePinsArr(arr, chatId = NS.getChatId?.()) {
  const cfg = NS.getCFG?.() || {};
  cfg.pinsByChat = cfg.pinsByChat || {};
  const prev = cfg.pinsByChat[chatId] || {};
  cfg.pinsByChat[chatId] = {
    ...prev,
    pins: arr.slice(),
    title: prev.title || NS.getChatTitle?.() || '',
    updatedAt: Date.now()
  };
  NS.saveSettingsPatch?.({ pinsByChat: cfg.pinsByChat });
};

// トグル（index1は1始まり）
NS.togglePinByIndex = function togglePinByIndex(index1, chatId = NS.getChatId?.()) {
  if (!Number.isFinite(index1) || index1 < 1) return false;
  const arr = NS.getPinsArr(chatId).slice();
  if (arr.length < index1) { const old = arr.length; arr.length = index1; arr.fill(0, old, index1); }
  const next = arr[index1 - 1] ? 0 : 1;
  arr[index1 - 1] = next;
  NS.savePinsArr(arr, chatId);
  return !!next;
};
*/

  // すでにあればこのままでOK。なければ追加
  NS.getPinsArr = function getPinsArr(chatId = NS.getChatId?.()) {
    const cfg  = NS.getCFG() || {};
    const rec  = (cfg.pinsByChat || {})[chatId] || {};
    const raw  = Array.isArray(rec.pins) ? rec.pins : [];
    // 0/1 の稠密配列に正規化（"1"やtrue等は 1 に揃える）
    return raw.map(v => (v ? 1 : 0));
  };

  NS.savePinsArr = function savePinsArr(arr, chatId = NS.getChatId?.()) {
    const cfg = NS.getCFG() || {};
    const pinsByChat = { ...(cfg.pinsByChat || {}) };
    pinsByChat[chatId] = { pins: arr.map(v => (v ? 1 : 0)) };
    NS.saveSettingsPatch({ pinsByChat });
  };

  // トグル（1始まり）←この実装でOK
  NS.togglePinByIndex = function togglePinByIndex(index1, chatId = NS.getChatId?.()) {
    if (!Number.isFinite(index1) || index1 < 1) return false;
    const arr = NS.getPinsArr(chatId).slice();
    if (arr.length < index1) { const old = arr.length; arr.length = index1; arr.fill(0, old, index1); }
    const next = arr[index1 - 1] ? 0 : 1;
    arr[index1 - 1] = next;
    NS.savePinsArr(arr, chatId);
    return !!next;
  };

  // 件数ヘルパ（配列方式に合わせて修正）
  NS.countPinsForChat = function(chatId = NS.getChatId()){
    try{
      const arr = NS.getCFG?.()?.pinsByChat?.[chatId]?.pins || [];
      return arr.reduce((a,b)=> a + (b ? 1 : 0), 0);
    }catch{ return 0; }
  };

/*
  // --- 付箋ON/OFFをトグル保存（配列方式） ---
  NS.togglePinForChat = function togglePinForChat(turnKey, chatId) {
    try {
      const cfg = NS.getCFG() || {};
      const chat = cfg.pinsByChat?.[chatId] || { pins: [] };
      const arr = Array.isArray(chat.pins) ? chat.pins : [];

      // turnKey は "turn:12" のような形式を想定
      const idx = Number(String(turnKey).replace('turn:', '')) - 1;
      if (isNaN(idx)) return false;

      // 必要に応じて配列拡張
      if (arr.length <= idx) {
        const old = arr.length;
        arr.length = idx + 1;
        arr.fill(0, old, idx + 1);
      }

      // トグル
      const next = arr[idx] ? 0 : 1;
      arr[idx] = next;

      (cfg.pinsByChat || (cfg.pinsByChat = {}))[chatId] = { pins: arr };
      NS.saveSettingsPatch({ pinsByChat: cfg.pinsByChat });
      return !!next;
    } catch (e) {
      console.warn('togglePinForChat failed', e);
      return false;
    }
  }
*/

  function saveSettingsPatch(patch){
    try{
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings })=>{
//console.log("saveSettingsPatch patch:",patch);
        const next = structuredClone(DEFAULTS);
        if (cgNavSettings) deepMerge(next, cgNavSettings);
        if (!next.list) next.list = structuredClone(DEFAULTS.list);
        deepMerge(next, patch);
        CFG = next;
        chrome?.storage?.sync?.set?.({ cgNavSettings: next });
      });
    }catch{
      deepMerge(CFG, patch);
    }
  }

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
/*
  // どこかの描画関数と連携している前提
  function renderViz(cfg, on){
    // id固定の線/帯を用意して display を切り替える
    const line = document.getElementById('cgpt-bias-line');
    const band = document.getElementById('cgpt-bias-band');
    if (line) line.style.display = on ? 'block' : 'none';
    if (band) band.style.display = on ? 'block' : 'none';
  }

  let _visible = false;
  function toggleViz(on){
    _visible = (typeof on === 'boolean') ? on : !_visible;
    renderViz(CFG, _visible);
    NS.saveSettingsPatch?.({ showViz: _visible });
  }
*/

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

  NS.DEFAULTS = DEFAULTS;
  NS.getCFG = () => CFG;
  NS.loadSettings = loadSettings;
  NS.saveSettingsPatch = saveSettingsPatch;
  NS.computeAnchor = computeAnchor;
  NS.renderViz = renderViz;
  NS.redrawBaseline = redrawBaseline;
  NS.toggleViz = toggleViz;
  NS.renderViz  = renderViz;
})();
