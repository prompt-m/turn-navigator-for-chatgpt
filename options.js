// options.js – 自動保存 & 可視ガイドのプレビュー

(function () {
  'use strict';

  const DEF = { centerBias: 0.40, headerPx: 0, eps: 20, lockMs: 700, showViz: false };
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

  function sanitize(raw) {
    let centerBias = Number(raw.centerBias);
    let headerPx   = parseInt(raw.headerPx, 10);
    let eps        = parseInt(raw.eps, 10);
    let lockMs     = parseInt(raw.lockMs, 10);

    centerBias = clamp(Number.isFinite(centerBias) ? centerBias : DEF.centerBias, 0, 1);
    headerPx   = clamp(Number.isFinite(headerPx)   ? headerPx   : DEF.headerPx,   0, 2000);
    eps        = clamp(Number.isFinite(eps)        ? eps        : DEF.eps,        0, 120);
    lockMs     = clamp(Number.isFinite(lockMs)     ? lockMs     : DEF.lockMs,     0, 3000);

    const showViz   = !!raw.showViz;
    return { centerBias, headerPx, eps, lockMs, showViz };
  }

  function uiToCfg(form) {
    return sanitize({
      centerBias: form.centerBias.value,
      headerPx:   form.headerPx.value,
      eps:        form.eps.value,
      lockMs:     form.lockMs.value,
    });
  }

  function applyToUI(form, cfg) {
    const v = { ...DEF, ...(cfg || {}) };
    form.centerBias.value = v.centerBias;
    form.headerPx.value   = v.headerPx;
    form.eps.value        = v.eps;
    form.lockMs.value     = v.lockMs;
    form.showViz.checked  = !!v.showViz;
  }

  function loadCfg(cb){
    try {
      chrome?.storage?.sync?.get?.('cgNavSettings', ({ cgNavSettings }) => cb(cgNavSettings || {}));
    } catch {
      const ls = localStorage.getItem('cgNavSettings');
      cb(ls ? JSON.parse(ls) : {});
    }
  }

  function saveCfg(cfg, cb){
    try {
      chrome?.storage?.sync?.set?.({ cgNavSettings: cfg }, cb);
    } catch {
      localStorage.setItem('cgNavSettings', JSON.stringify(cfg));
      cb && cb();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('cgtn-options');
    if (!form) return; // 念のため

    // 初期ロード
    loadCfg((stored) => {
      const cur = sanitize({ ...DEF, ...stored });
      applyToUI(form, cur);

      // 仕様：ロード時は非表示固定
      try { window.CGTN?.renderViz?.(cur, false); } catch {}
    });

    // 自動保存（input 複数タイプ対応）
    form.addEventListener('input', () => {
      const cfg = uiToCfg(form);
      saveCfg(cfg);
      // 数値変更時は「表示中なら」位置だけ更新、非表示なら何もしない
      try { window.CGTN?.renderViz?.(cfg, undefined); } catch {}
    });

    // blur 時は補正してから保存
    form.addEventListener('blur', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      const cfg = uiToCfg(form);
      applyToUI(form, cfg); // 値を補正してUIへ反映
      saveCfg(cfg);
      try { window.CGTN?.renderViz?.(cfg, undefined); } catch {}
    }, true);

    // ガイド線トグル：押した時だけ表示/非表示
    form.showViz.addEventListener('change', () => {
      const cfg = uiToCfg(form);
      saveCfg(cfg);
      try { window.CGTN?.renderViz?.(cfg, !!cfg.showViz); } catch {}
    });

    // 既存「保存」ボタン（念のため残す）
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cfg = uiToCfg(form);
      applyToUI(form, cfg);
      saveCfg(cfg);
      try { window.CGTN?.renderViz?.(cfg, !!cfg.showViz); } catch {}
    });

    // 既定に戻す
    document.getElementById('resetBtn')?.addEventListener('click', () => {
      applyToUI(form, DEF);
      saveCfg({ ...DEF });
      try { window.CGTN?.renderViz?.(DEF, true); } catch {}
    });
    // 画面離脱時は強制的に隠す（念のため）
    window.addEventListener('beforeunload', () => {
      try { window.CGTN?.renderViz?.(null, false); } catch {}
    });
  });
})();
