// shared.js — 設定の既定値/保存、基準線API、グローバル公開
(() => {
  const NS = (window.CGTN_SHARED = window.CGTN_SHARED || {});

  const t = (key) => window.CGTN_I18N?.t?.(key) || key;
  window.CGTN_SHARED = Object.assign(window.CGTN_SHARED || {}, { t });
  const SH = (window.CGTN_SHARED = window.CGTN_SHARED || {});

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

  // === storage.sync.set の Promise ラッパ（lastError 検知） ===
  // === 投げない版 syncSetAsync: 常に resolve({ok, err}) を返す ===
  function syncSetAsync(obj){
    return new Promise((resolve) => {
      // 拡張が直後に再起動/無効化されたケース
      if (!chrome?.runtime?.id || !chrome?.storage?.sync) {
        return resolve({ ok:false, err: new Error('ext-dead') });
      }
      try{
        chrome.storage.sync.set(obj, () => {
          const err = chrome.runtime?.lastError;
          if (err) return resolve({ ok:false, err });
          resolve({ ok:true });
        });
      }catch(e){
        resolve({ ok:false, err: e });
      }
    });
  }
  SH.syncSetAsync = syncSetAsync; // 既存の名前空間にあわせて

  // === sync から最新を強制ロードしてメモリCFGに反映 ===
  NS.reloadFromSync = async function(){
    if (!chrome?.storage?.sync) return NS.getCFG?.() || {};
    const all = await new Promise(res => chrome.storage.sync.get(null, res));
    const cfg = (all && all.cgNavSettings) ? all.cgNavSettings : {};
    try { NS.setCFG?.(cfg); } catch {}
    return cfg;
  };

  // いまのタブのチャットIDとタイトルを保存（pinsByChat / chatIndex を同時に更新）
  NS.setChatTitleForId = function(chatId, title){
    if (!chatId) return;
    const cfg = NS.getCFG() || {};
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

    NS.saveSettingsPatch({ pinsByChat: byChat, chatIndex: { ...idx, ids } });
    // 付箋バッジ・チャット名
    window.CGTN_LOGIC?.updatePinOnlyBadge?.();
    window.CGTN_LOGIC?.updateListChatTitle?.();
  };
  // ドキュメントタイトルを使って現在チャットの名前を更新
  NS.refreshCurrentChatTitle = function(){
    try{
      const id = NS.getChatId && NS.getChatId();
      const title = (document.title || '').trim();
      if (id && title && title !== 'ChatGPT') NS.setChatTitleForId(id, title);
    }catch{}
  };

  // shared.js に追記（削除しない）
  NS.normalizePinsByChat = function (pinsByChat, { dropZero=true, preferNewTitle=true } = {}){
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
        const newTitle = NS.getChatTitle?.(id) || ''; // 取れない環境なら '' のまま
        const title    = newTitle || oldTitle || '(No Title)';
        map[id] = { ...map[id], title };
      }
    }
    return map;
  };

  NS.dumpPinsIndex = function(){
    const cfg = NS.getCFG?.() || {};
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
  NS.getChatId = function(){
    try {
      const m = (location.pathname||'').match(/\/c\/([a-z0-9-]+)/i);
      if (m) return m[1];
      // Copilot/Gemini 等への将来拡張のための素朴フォールバック
      return (location.host + location.pathname).toLowerCase();
    } catch { return 'unknown'; }
  };

  NS.getChatTitle = function(){
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

  // 件数
  NS.countPinsForChat = function(chatId = NS.getChatId()){
    const cur = NS.getPinsForChat(chatId);
//console.debug('[getPinsForChat] chat=%s count=%d',chatId, Object.keys((CFG.pinsByChat?.[chatId]?.pins)||{}).length);
    return Object.keys(cur).length;
  };

  // メタだけ更新（タイトル刷新等）
  NS.touchChatMeta = function(chatId = NS.getChatId(), title = NS.getChatTitle()){
    const cfg = NS.getCFG?.() || {};
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

    NS.saveSettingsPatch?.({ pinsByChat: map });
  };

  /* sync.set の Promise ラッパ（lastError を確実に捕捉） */
  (function(){
    const SH = (window.CGTN_SHARED = window.CGTN_SHARED || {});
    SH.syncSetAsync = function(obj){
      return new Promise((resolve, reject)=>{
        chrome.storage.sync.set(obj, ()=>{
          const err = chrome.runtime?.lastError;
          if (err) return reject(err);
          resolve();
        });
      });
    };
  })();

  /* 保存失敗時にロールバックする安全版 */
  (function(){
    const SH = (window.CGTN_SHARED = window.CGTN_SHARED || {});
    SH.deletePinsForChat = async function(chatId){
      const cfg = SH.getCFG?.() || {};
      const before = JSON.parse(JSON.stringify(cfg)); // ロールバック用スナップショット

      try{
        cfg.pinsByChat = cfg.pinsByChat || {};
        // 0件なら完全削除（ミキさん方針どおり）
        if (cfg.pinsByChat[chatId]) delete cfg.pinsByChat[chatId];
         // ★ 保存（lastError を確実に検出する Promise 版）
        await new Promise((resolve, reject) => {
          chrome.storage.sync.set({ cgNavSettings: cfg }, () => {
            const err = chrome.runtime?.lastError;
            if (err) return reject(err);
            resolve(true);
          });
        });

        return true;

      }catch(err){
        // 失敗→ロールバック
        try{ Object.assign(cfg, before); }catch(_){}
        console.warn('deletePinsForChat failed:', err);
        return false;
      }
    };
  })();

/*
  // チャット別の付箋データを削除（ストレージ直叩き／競合に強い）
  NS.deletePinsForChat = function deletePinsForChat(chatId){
    return new Promise((resolve) => {
      try {
        if (!chatId) return resolve(false);
        chrome.storage.sync.get('cgNavSettings', (store)=>{
          const st   = store?.cgNavSettings || {};
          const map  = { ...(st.pinsByChat || {}) };
          if (!map[chatId]) return resolve(false);   // そもそも無い

          delete map[chatId];
          const next = { ...st, pinsByChat: map };

          chrome.storage.sync.set({ cgNavSettings: next }, ()=>{
            // メモリキャッシュも即同期（DEFAULTS を基に安全に再構成）
            const cfg = structuredClone(DEFAULTS);
            (function deepMerge(dst, src){
              for (const k in src){
                if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) dst[k] = deepMerge(dst[k]||{}, src[k]);
                else if (src[k] !== undefined) dst[k] = src[k];
              }
              return dst;
            })(cfg, next);
            CFG = cfg;
            resolve(true);
          });
        });
      } catch(e){
        console.warn('deletePinsForChat failed', e);
        resolve(false);
      }
    });
  };
*/
  // 言語判定の委譲（UI側で変えられるようフックを用意）
  let langResolver = null;
  NS.setLangResolver = (fn) => { langResolver = fn; };
  NS.setLang = (lang) => window.CGTN_I18N?.setLang?.(lang);

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
//console.debug('[loadSettings] pinsByChat keys=%o',Object.keys((CFG.pinsByChat||{})));
      });
    }catch{
      CFG = structuredClone(DEFAULTS);
      _loaded = true; _resolves.splice(0).forEach(r=>r());
      cb?.();
    }
  }

  NS.cleanupZeroPinRecords = function () {
    const cfg = NS.getCFG() || {};
    const map = { ...(cfg.pinsByChat || {}) };
    let changed = false;
    for (const [cid, rec] of Object.entries(map)) {
      const pins = Array.isArray(rec?.pins) ? rec.pins : Object.values(rec?.pins || {});
      if (!pins.some(Boolean)) { delete map[cid]; changed = true; }
    }
    if (changed) NS.saveSettingsPatch({ pinsByChat: map });
  };

  NS.getPinsArr = function getPinsArr(chatId = NS.getChatId?.()) {
    const cfg  = NS.getCFG() || {};
    const rec  = (cfg.pinsByChat || {})[chatId] || {};
    const raw  = Array.isArray(rec.pins) ? rec.pins : [];
    // 0/1 の稠密配列に正規化（"1"やtrue等は 1 に揃える）
    return raw.map(v => (v ? 1 : 0));
  };


  NS.savePinsArr = function savePinsArr(arr, chatId = NS.getChatId?.()) {
    const cfg = NS.getCFG() || {};
    const map = { ...(cfg.pinsByChat || {}) };
    if (!chatId) { console.debug('[savePinsArr] skip: no chatId'); return; }

    const safeArr = Array.isArray(arr) ? arr.map(v => (v ? 1 : 0)) : [];
    const hasAny  = safeArr.some(Boolean);

    // タイトルは保存しない（strage.syncの容量節約のため）
    //const oldTitle = map[chatId]?.title || '';
    //const newTitle = NS.getChatTitle?.() || '';
    //const title    = newTitle || oldTitle || '(No Title)';

    // ★計測ログ：ここが肝

    console.debug('[savePinsArr] about to save', {
      chatId,
      pinsCount: safeArr.filter(Boolean).length,
      path: location.pathname,
      time: new Date().toISOString()
    }, new Error('trace').stack?.split('\n').slice(1,4).join('\n'));


    //map[chatId] = { pins: safeArr, title, updatedAt: Date.now() };
    map[chatId] = { pins: safeArr, updatedAt: Date.now() };

    //NS.saveSettingsPatch({ pinsByChat: map });

     // 保存後の一致検証（③仕様：失敗ならロールバック用イベント通知）
     /* ここから追加 */
     NS.saveSettingsPatch({ pinsByChat: map }, (nextCfg) => {
       try{
         const saved = nextCfg?.pinsByChat?.[chatId]?.pins;
         const ok = Array.isArray(saved) && JSON.stringify(saved) === JSON.stringify(safeArr);
         if (!ok) {
           window.dispatchEvent(new CustomEvent('cgtn:save-error', { detail:{ chatId } }));
         }
       }catch(e){
         window.dispatchEvent(new CustomEvent('cgtn:save-error', { detail:{ chatId, error:String(e) } }));
       }
     });
     /* ここまで */
  };



  // トグル（1始まり）←この実装でOK
  NS.togglePinByIndex = function togglePinByIndex(index1, chatId = NS.getChatId?.()) {
    if (!Number.isFinite(index1) || index1 < 1) return false;
    const arr = NS.getPinsArr(chatId).slice();
    if (arr.length < index1) { const old = arr.length; arr.length = index1; arr.fill(0, old, index1); }
    const next = arr[index1 - 1] ? 0 : 1;
    arr[index1 - 1] = next;
    NS.savePinsArr(arr, chatId);
    // 付箋バッジ
    try{ document.dispatchEvent(new CustomEvent('cgtn:pins-updated',{detail:{chatId}})); }catch{}

    return !!next;
  };

  // 件数ヘルパ（配列方式に合わせて修正）
  NS.countPinsForChat = function(chatId = NS.getChatId()){
    try{
      const arr = NS.getCFG?.()?.pinsByChat?.[chatId]?.pins || [];
      return arr.reduce((a,b)=> a + (b ? 1 : 0), 0);
    }catch{ return 0; }
  };

  NS.getPinsCountByChat = function(chatId){
    try{
      const cfg = NS.getCFG?.() || {};
      const pinsObj = cfg?.pinsByChat?.[chatId]?.pins || {};
      return Object.values(pinsObj).filter(Boolean).length;
    }catch{ return 0; }
  };

  // 旧: NS.saveSettingsPatch = function(patch, cb){ ... chrome.storage.sync.set(...); cb?.(); }
  // 新: Promise を返す／lastError時はロールバックして {ok:false, err, before} を返す
  NS.saveSettingsPatch = async function(patch, cb){
    try{
      const base = SH.getCFG?.() || {};
      const before = structuredClone(base);// ← ロールバック用スナップショット

      // deepMerge(base, patch) 相当（既存の deepMerge があればそれを使用）
      const merged = structuredClone(before);
      (function deepMerge(dst, src){
        for (const k in src){
          if (src[k] && typeof src[k]==='object' && !Array.isArray(src[k])){
            dst[k] = deepMerge(dst[k]||{}, src[k]);
          }else if (src[k] !== undefined){
            dst[k] = src[k];
          }
        }
        return dst;
      })(merged, patch);

      // ★ 拡張のコンテキストが死んでいる（直後の set で "Extension context invalidated."）ケースを回避
      // ★ 拡張の生存チェック（早期スキップ）
     if (!chrome?.runtime?.id || !chrome?.storage?.sync) {
       // ここは「よくある状態」なので warn は出さない（ノイズ抑制）
       //console.warn('[saveSettingsPatch] skipped: extension context invalidated');
       // メモリCFGは「楽観反映前」なのでロールバック不要。呼び元で {ok:false} 判定み。
       return { ok:false, err:{ message:'ext-dead' }, before };
     }

      // 先にローカルCFGへ反映（楽観）— 失敗時は below で before に戻す
      NS.setCFG?.(merged);

      //await syncSetAsync({ cgNavSettings: merged });
      const res = await syncSetAsync({ cgNavSettings: merged });
      if (!res.ok){
        // 失敗 → メモリCFGをロールバック
        try{ NS.setCFG?.(before); }catch{}
        return { ok:false, err: res.err, before };
      }
      try{ cb && cb(merged); }catch{}
      return { ok:true, cfg: merged };

    }catch(err){
      // ここに来るのは想定外の例外だけ。ログは message を優先
      console.warn('[saveSettingsPatch] failed:', err?.message || err);
      // try ブロック先頭で保存した before を使ってロールバック
      try{ NS.setCFG?.(before); }catch{}
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

  (function(NS){
    NS.titleEscape = function(s){
      return String(s || '').replace(/[&<>"']/g, c => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
      }[c]));
    };
  })(window.CGTN_SHARED);


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
  NS.isListOpen = function isListOpen(){
    try{
      const cb = document.getElementById('cgpt-list-toggle');
      if (cb) return !!cb.checked;
      if (window.CGTN_LOGIC && typeof window.CGTN_LOGIC._panelOpen === 'boolean') {
        return !!window.CGTN_LOGIC._panelOpen;
      }
      return !!(NS.getCFG?.()?.list?.enabled);
    }catch{
      return !!(NS.getCFG?.()?.list?.enabled);
    }
  };

  NS.DEFAULTS = DEFAULTS;
  NS.getCFG = () => CFG;
  NS.loadSettings = loadSettings;
//  NS.saveSettingsPatch = saveSettingsPatch;
  NS.computeAnchor = computeAnchor;
  NS.renderViz = renderViz;
  NS.redrawBaseline = redrawBaseline;
  NS.toggleViz = toggleViz;
  NS.renderViz  = renderViz;
})();
