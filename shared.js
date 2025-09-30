// shared.js — 設定の既定値/保存、基準線API、グローバル公開
(() => {
  const NS = (window.CGTN_SHARED = window.CGTN_SHARED || {});

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



  // 言語判定の委譲（UI側で変えられるようフックを用意）
  let langResolver = null;
  NS.setLangResolver = (fn) => { langResolver = fn; };

function curLang(){
  try {
    // ★ 最優先：拡張UIが公開する現在言語
    const u = NS.getLang?.();
    const ur = String(u).toLowerCase();
//    console.log("◆◆◆ ★ 最優先",ur,"◆◆◆")
    if (u) return ur;

    // 互換：従来の resolver もサポート
    const r = langResolver?.();
//    console.log("◆◇◇互換：従来の resolver:",r,"◆◇◇")
    if (r) return String(r).toLowerCase();

    const cfg = NS.getCFG?.() || {};
    if (cfg.lang){
//      console.log("◆◇◇CFG")
      return String(cfg.lang).toLowerCase();
    }
    if (cfg.english) {
//      console.log("◆◇◇EG")
      return 'en';
    }
//    console.log("◆◇◇JA")
    return String(document.documentElement.lang || 'ja').toLowerCase();
  } catch {
//    console.log("◆◇◇Catch JA")
    return 'ja';
  }
}

  // 辞書（必要に応じて増やしてください）
  const TIPS = {
    'nav.top'      : { ja:'先頭へ',                    en:'Go to top' },
    'nav.bottom'   : { ja:'末尾へ',                    en:'Go to bottom' },
    'nav.prev'     : { ja:'前へ',                      en:'Previous' },
    'nav.next'     : { ja:'次へ',                      en:'Next' },
    'nav.lang'     : { ja:'English / 日本語',          en:'English / 日本語' },
    'nav.viz'      : { ja:'基準線の表示/非表示',        en:'Show/Hide guide line' },
    'nav.list'     : { ja:'一覧の表示/非表示',          en:'Show/Hide list' },
    'nav.drag'     : { ja:'ドラッグで移動',             en:'Drag to move' },
    'list.collapse': { ja:'畳む / 開く',                en:'Collapse / Expand' },
    'list.pinonly' : { ja:'付箋のみ表示（Altでテーマ）', en:'Pinned only (Alt for theme)' },
    'row.pin'      : { ja:'このターンを付箋 ON/OFF',    en:'Toggle pin for this turn' },
    'row.preview'  : { ja:'プレビュー',                 en:'Preview' },
  };


  function t(key){
    const entry = TIPS[key];
    if (!entry) return '';
    const L = (curLang() || 'ja').startsWith('en') ? 'en' : 'ja';
//    console.log("◆◇◆ t(key) L: ",L," entry:",entry);
    return entry[L] || entry.ja || '';
  }

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
//        console.log("***applyTooltips sel:",sel," key:",key," LANG:",L," s:",s);
        if (s) el.title = s; 
      });
    });
  };

  NS.updateTooltips = function(key){
    const L = (NS.curLang?.() || 'ja');
    for (const reg of _registrations){
      Object.entries(reg.pairs).forEach(([sel, key])=>{
        reg.root.querySelectorAll(sel).forEach(el => {
          const s = t(key);
//          console.log("***updateTooltips sel:",sel," key:",key," LANG:",L," s:",s);
          if (s) el.title = s; 
        });
      });
    }
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

  function loadSettings(cb){
    try{
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings })=>{
        const next = structuredClone(DEFAULTS);
        if (cgNavSettings) deepMerge(next, cgNavSettings);
        if (!next.list) next.list = structuredClone(DEFAULTS.list);
        CFG = next;
        cb?.();
      });
    }catch{
      CFG = structuredClone(DEFAULTS);
      cb?.();
    }
  }

  function saveSettingsPatch(patch){
    try{
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings })=>{
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

  function redrawBaseline(){
    const { y } = computeAnchor(CFG);
    const { line, band } = ensureVizElements();
    line.style.top = `${y}px`;
    const eps = CFG.eps ?? DEFAULTS.eps;
    band.style.top = `${y - eps}px`;
    band.style.height = `${eps * 2}px`;
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
})();
