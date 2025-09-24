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
      // 将来のためのサイズ保存（なければ null）
      w: null, h: null, x: null, y: null
    }
  });

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
