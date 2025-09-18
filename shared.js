// shared.js
// 可視ライン（赤線とEPS帯）の計算・生成・反映・トグルを一元化

(() => {
  const NS = (window.CGTN = window.CGTN || {});

  // 設定の既定値（必要に応じて調整OK）
  const DEFAULTS = Object.freeze({
    centerBias: 0.40,
    headerPx: 0,
    eps: 20,
    lockMs: 700,
  });

  // ユーティリティ
  const num   = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const int   = (v, d) => (Number.isFinite(parseInt(v,10)) ? parseInt(v,10) : d);
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

  // 画面内の基準線Yと帯厚を計算（これが“正”）
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
      display: 'none',
      boxSizing: 'content-box',
      margin: 0, padding: 0,
    });

    // 帯は中央対称のグラデーション（content-boxで高さ=帯厚）
    const band = mk('cgpt-bias-band', {
      position: 'fixed',
      left: 0, right: 0,
      height: '0',
      zIndex: 2147483647,
      pointerEvents: 'none',
      display: 'none',
      boxSizing: 'content-box',
      margin: 0, padding: 0,
      background: 'linear-gradient(to bottom, rgba(255,0,0,0.08) 0%, rgba(255,0,0,0.22) 50%, rgba(255,0,0,0.08) 100%)',
    });

    return { line, band };
  }

  // 位置反映（visible = 表示/非表示）
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

  // ON/OFF トグル（Ctrl+Alt+Shift+V）
  let _visible = false;
  function toggleVizLines(force) {
    if (typeof force === 'boolean') _visible = force;
    else _visible = !_visible;

    try {
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings }) => {
        renderViz(cgNavSettings || {}, _visible);
      });
    } catch {
      renderViz({}, _visible); // options.html などでも動くように
    }
  }

  // ホットキー登録（キャプチャで先取り）
  function installHotkey() {
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'KeyV' || e.key?.toLowerCase() === 'v') && e.ctrlKey && e.altKey && e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation?.();
        toggleVizLines();
      }
    }, true);
  }

  // 設定変更の追随（他タブ変更も即反映）
  try {
    chrome?.storage?.onChanged?.addListener?.((c, area) => {
      if (area === 'sync' && c.cgNavSettings) {
        const cfg = c.cgNavSettings.newValue || {};
        renderViz(cfg, _visible); // 表示状態は維持
      }
    });
  } catch {}

  // 公開（Console からも叩けるように）
  NS.computeAnchor  = computeAnchor;
  NS.renderViz      = renderViz;
  NS.toggleVizLines = toggleVizLines;
  NS.installHotkey  = installHotkey;

  // 互換API（過去名）
  window.debugShowLines = () => toggleVizLines(true);
  window.toggleVizLines = toggleVizLines;
})();
