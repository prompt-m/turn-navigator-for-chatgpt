// shared.js
// 可視ライン（赤線とEPS帯）の計算・生成・反映・トグルを一元化
(() => {
  const NS = (window.CGTN = window.CGTN || {});

  // 既定値（content/options と同じキーを保持）
  const DEFAULTS = Object.freeze({
    centerBias: 0.40,
    headerPx: 0,
    eps: 20,
    lockMs: 700,
  });

  // 小物
  const num   = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const int   = (v, d) => (Number.isFinite(parseInt(v,10)) ? parseInt(v,10) : d);
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

  // 画面内の基準線Yと帯厚を計算
  function computeAnchor(cfg) {
    const s = { ...DEFAULTS, ...(cfg || {}) };
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const centerBias = clamp(num(s.centerBias, DEFAULTS.centerBias), 0, 1);
    const headerPx   = clamp(int(s.headerPx,   DEFAULTS.headerPx),   0, 2000);
    const eps        = clamp(int(s.eps,        DEFAULTS.eps),        0, 120);
    const y          = Math.round(vh * centerBias - headerPx);
    return { y, eps, centerBias, headerPx };
  }

  // DOM を用意（なければ生成、あれば再利用）
  function ensureVizElements() {
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
      position: 'fixed',
      left: 0, right: 0,
      height: '0',
      borderTop: '3px solid red',
      zIndex: 2147483647,
      pointerEvents: 'none',
      display: 'none',            // 初期は非表示
      boxSizing: 'content-box',
      margin: 0, padding: 0,
    });

    const band = mk('cgpt-bias-band', {
      position: 'fixed',
      left: 0, right: 0,
      height: '0',
      zIndex: 2147483647,
      pointerEvents: 'none',
      display: 'none',            // 初期は非表示
      boxSizing: 'content-box',
      margin: 0, padding: 0,
      background: 'linear-gradient(to bottom, rgba(255,0,0,0.08) 0%, rgba(255,0,0,0.22) 50%, rgba(255,0,0,0.08) 100%)',
    });

    return { line, band };
  }

  // 位置反映（visible = 表示/非表示の指定。省略時は表示状態は維持）
  function renderViz(cfg, visible = undefined) {
    const { y, eps } = computeAnchor(cfg);
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

  // 表示状態を保持（デフォルト非表示）
  let _visible = false;

  // ON/OFF トグル（UI から呼び出す想定）
  function toggleViz(on) {
    if (typeof on === 'boolean') _visible = on;
    else _visible = !_visible;

    const apply = (cfg) => renderViz(cfg || {}, _visible);
    try {
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings }) => apply(cgNavSettings));
    } catch {
      apply({});
    }
  }

  // 設定変更の追随（他タブ保存 → その場で位置だけ更新。表示状態は維持）
  try {
    chrome?.storage?.onChanged?.addListener?.((c, area) => {
      if (area === 'sync' && c.cgNavSettings) {
        const cfg = c.cgNavSettings.newValue || {};
        renderViz(cfg, undefined); // 表示/非表示は変えない
      }
    });
  } catch {}

  // 公開API（content.js / options.js から使う）
  NS.computeAnchor = computeAnchor;
  NS.renderViz     = renderViz;
  NS.toggleViz     = toggleViz;
  NS.toggleVizLines = toggleViz;   // 互換別名（既存呼び出しのため残す）

  // 互換API（installHotkey は“空”にして残す：呼ばれても何もしない）
  NS.installHotkey = function () {};
  window.debugShowLines = () => toggleViz(true);
  window.toggleVizLines = toggleViz;
})();
