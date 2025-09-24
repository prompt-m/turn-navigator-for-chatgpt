// shared.js  —  設定の既定値/保存、基準線API、グローバル公開
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
      enabled: false,   // ← 追加：リスト表示ON/OFFを保存
      maxItems: 30,     // 一覧件数（1ページ分）
      maxChars: 40,     // 1行の文字数
      fontSize: 12      // px
    }
  });

  let CFG = structuredClone(DEFAULTS);

  // --- 小物 ---
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const int = (v, d) => (Number.isFinite(parseInt(v,10)) ? parseInt(v,10) : d);
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

  function deepMerge(dst, src){
    for (const k in src){
      if (src[k] && typeof src[k]==='object' && !Array.isArray(src[k])) {
        dst[k] = deepMerge(dst[k] || {}, src[k]);
      } else {
        dst[k] = src[k];
      }
    }
    return dst;
  }

  // === 設定のロード/保存 ===
  function loadSettings(cb){
    try {
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings }) => {
        CFG = structuredClone(DEFAULTS);
        if (cgNavSettings) deepMerge(CFG, cgNavSettings);
        // list が無ければデフォルトを補う
        if (!CFG.list) CFG.list = structuredClone(DEFAULTS.list);
        cb?.();
      });
    } catch {
      CFG = structuredClone(DEFAULTS);
      cb?.();
    }
  }

  function saveSettingsPatch(patch){
    try {
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings }) => {
        const next = structuredClone(DEFAULTS);
        if (cgNavSettings) deepMerge(next, cgNavSettings);
        // list が無ければデフォルトを補う
        if (!CFG.list) CFG.list = structuredClone(DEFAULTS.list);
        deepMerge(next, patch);
        CFG = next;
        try { chrome?.storage?.sync?.set?.({ cgNavSettings: next }); } catch {}
      });
    } catch {
      deepMerge(CFG, patch);
    }
  }

  // === 基準線の計算・描画 ===
  function computeAnchor(cfg){
    const s = { ...DEFAULTS, ...(cfg||{}) };
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const centerBias = clamp(num(s.centerBias, DEFAULTS.centerBias), 0, 1);
    const headerPx   = clamp(int(s.headerPx,   DEFAULTS.headerPx),   0, 2000);
    const eps        = clamp(int(s.eps,        DEFAULTS.eps),        0, 120);
    const y          = Math.round(vh * centerBias - headerPx);
    return { y, eps, centerBias, headerPx };
  }

  function ensureVizElements(){
    const mk = (id, css) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        Object.assign(el.style, css);
        document.body.appendChild(el);
      }
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
      background:'linear-gradient(to bottom, rgba(255,0,0,0.08) 0%, rgba(255,0,0,0.22) 50%, rgba(255,0,0,0.08) 100%)'
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

  let _visible = false;
  function toggleViz(on){
    _visible = (typeof on === 'boolean') ? on : !_visible;
    renderViz(CFG, _visible);
  }

  // 他タブ保存の反映（表示/非表示は維持）
  try {
    chrome?.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== 'sync' || !changes.cgNavSettings) return;
      const next = structuredClone(DEFAULTS);
      deepMerge(next, changes.cgNavSettings.newValue || {});
      CFG = next;
      renderViz(CFG, undefined);
      // ロジック側の再構築も（在れば）
      try { window.CGTN_LOGIC?.rebuild?.(); } catch {}
    });
  } catch {}

  // === グローバル公開 ===
  NS.DEFAULTS = DEFAULTS;
  NS.getCFG = () => CFG;
  NS.loadSettings = loadSettings;
  NS.saveSettingsPatch = saveSettingsPatch;
  NS.computeAnchor = computeAnchor;
  NS.renderViz = renderViz;
  NS.toggleViz = toggleViz;
})();
