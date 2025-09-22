// options.js – 自動保存 & 可視ガイドのプレビュー
(function () {
  'use strict';

  const DEF = {                       // content.js では DEFAULTS で同内容に
    centerBias: 0.40,
    headerPx: 0,
    eps: 20,
    lockMs: 700,
    showViz: false,
    panel: { x: null, y: null },
    list: {
      enabled: false,     // パネル表示ON/OFF（ナビのチェックボックスと連動）
      maxItems: 30,       // 表示件数
      maxChars: 40,       // 1行の文字数
      fontSize: 12,       // 1行のフォントサイズ(px)
      theme: 'mint',      // 将来の色テーマ用
      width: 320,         // パネル幅
      x: null, y: null    // パネル位置（ドラッグで保存）
    }
  };

  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

  // 正規化
  function sanitize(raw) {
    const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
    let centerBias = Number(raw.centerBias);
    let headerPx   = parseInt(raw.headerPx, 10);
    let eps        = parseInt(raw.eps, 10);
    let lockMs     = parseInt(raw.lockMs, 10);
    const showViz  = !!raw.showViz;
  
    centerBias = clamp(Number.isFinite(centerBias) ? centerBias : DEF.centerBias, 0, 1);
    headerPx   = clamp(Number.isFinite(headerPx)   ? headerPx   : DEF.headerPx,   0, 2000);
    eps        = clamp(Number.isFinite(eps)        ? eps        : DEF.eps,        0, 120);
    lockMs     = clamp(Number.isFinite(lockMs)     ? lockMs     : DEF.lockMs,     0, 3000);
  
    const L = raw.list || {};
    let maxItems = parseInt(L.maxItems, 10);
    let maxChars = parseInt(L.maxChars, 10);
    let fontSize = parseInt(L.fontSize, 10);
    maxItems = clamp(Number.isFinite(maxItems) ? maxItems : DEF.list.maxItems, 3, 100);
    maxChars = clamp(Number.isFinite(maxChars) ? maxChars : DEF.list.maxChars, 10, 200);
    fontSize = clamp(Number.isFinite(fontSize) ? fontSize : DEF.list.fontSize, 10, 20);
  
    return {
      centerBias, headerPx, eps, lockMs, showViz,
      list: { ...DEF.list, maxItems, maxChars, fontSize }
    };
  }
  
  // 入力値 → 設定（保存フォーマット）
  function uiToCfg(form) {
    const v = {
      centerBias: form.centerBias.value,
      headerPx:   form.headerPx.value,
      eps:        form.eps.value,
      lockMs:     form.lockMs.value,
      showViz:    form.showViz.checked,
      list: {
        maxItems:  form.listMaxItems.value,
        maxChars:  form.listMaxChars.value,
        fontSize:  form.listFontSize.value,
        enabled:   undefined,  // オプション画面ではON/OFFは扱わない（ナビ側で操作）
      }
    };
    return sanitize(v);
  }
  
  // 設定 → UI
  function applyToUI(form, cfg) {
    const v = structuredClone(DEF);
    Object.assign(v, cfg);
    Object.assign(v.list, (cfg && cfg.list) || {});
    form.centerBias.value = v.centerBias;
    form.headerPx.value   = v.headerPx;
    form.eps.value        = v.eps;
    form.lockMs.value     = v.lockMs;
    form.showViz.checked  = !!v.showViz;
    form.listMaxItems.value = v.list.maxItems;
    form.listMaxChars.value = v.list.maxChars;
    form.listFontSize.value = v.list.fontSize;
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
    if (!form) return;

    // 初期ロード：表示は常にオフ
    loadCfg((stored) => {
      const cur = sanitize({ ...DEF, ...stored });
      applyToUI(form, cur);
      try { window.CGTN?.renderViz?.(cur, false); } catch {}
    });

    // 入力のたび保存＋（表示中なら）ガイド線の位置だけ更新
    form.addEventListener('input', () => {
      const cfg = uiToCfg(form);
      saveCfg(cfg);
      try { window.CGTN?.renderViz?.(cfg, undefined); } catch {}
    });

    // blur 補正：丸め/クランプして保存→位置だけ更新
    form.addEventListener('blur', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      const cfg = uiToCfg(form);
      applyToUI(form, cfg);
      saveCfg(cfg);
      try { window.CGTN?.renderViz?.(cfg, undefined); } catch {}
    }, true);

    // showViz トグル → 表示/非表示を即反映
    form.showViz.addEventListener('change', () => {
      const cfg = uiToCfg(form);
      saveCfg(cfg);
      try { window.CGTN?.renderViz?.(cfg, !!cfg.showViz); } catch {}
    });

    // 「保存」ボタン（任意）：保存後、現在の showViz に合わせて表示/非表示
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cfg = uiToCfg(form);
      applyToUI(form, cfg);
      saveCfg(cfg);
      try { window.CGTN?.toggleViz?.(cfg.showViz); } catch {}
    });

    // 既定に戻す：既定値を保存 → 非表示（既定は showViz: false）
    document.getElementById('resetBtn')?.addEventListener('click', () => {
      applyToUI(form, DEF);
      saveCfg({ ...DEF });
      try { window.CGTN?.renderViz?.(DEF, DEF.showViz); } catch {} // false で隠す
    });

    // 画面離脱時は強制的に隠す（保険）
    window.addEventListener('beforeunload', () => {
      try { window.CGTN?.renderViz?.(null, false); } catch {}
    });
  });
})();
