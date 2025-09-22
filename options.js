// options.js – 自動保存 & 可視ガイドのプレビュー
(function () {
  'use strict';

  const DEF = {
    centerBias: 0.40,
    headerPx: 0,
    eps: 20,
    lockMs: 700,
    showViz: false,
    list: {
      previewChars: 20,
      maxItems: 30,
      listMaxItems: 18,
      listMaxChars: 40, 
      listFontSize: 12,
    }
  };
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

  function sanitize(raw) {

    let listMaxItems = parseInt(raw.listMaxItems,10);
    let listMaxChars = parseInt(raw.listMaxChars,10);
    let listFontSize = parseInt(raw.listFontSize,10);
    listMaxItems = clamp(Number.isFinite(listMaxItems)?listMaxItems:DEF.listMaxItems, 3, 100);
    listMaxChars = clamp(Number.isFinite(listMaxChars)?listMaxChars:DEF.listMaxChars, 10, 200);
    listFontSize = clamp(Number.isFinite(listFontSize)?listFontSize:DEF.listFontSize, 10, 24);

    let centerBias = Number(raw.centerBias);
    let headerPx   = parseInt(raw.headerPx, 10);
    let eps        = parseInt(raw.eps, 10);
    let lockMs     = parseInt(raw.lockMs, 10);

    centerBias = clamp(Number.isFinite(centerBias) ? centerBias : DEF.centerBias, 0, 1);
    headerPx   = clamp(Number.isFinite(headerPx)   ? headerPx   : DEF.headerPx,   0, 2000);
    eps        = clamp(Number.isFinite(eps)        ? eps        : DEF.eps,        0, 120);
    lockMs     = clamp(Number.isFinite(lockMs)     ? lockMs     : DEF.lockMs,     0, 3000);

    const showViz = !!raw.showViz;            // ← ここは raw から正しく受ける
    const previewChars = Math.min(400, Math.max(10, parseInt(raw.previewChars ?? raw?.list?.previewChars ?? DEF.list.previewChars, 10) || DEF.list.previewChars));
    const listMax      = Math.min(200, Math.max(10, parseInt(raw.listMax ?? raw?.list?.maxItems ?? DEF.list.maxItems, 10) || DEF.list.maxItems));

    return {
      centerBias,
      headerPx,
      eps,
      lockMs,
      showViz,
      list: {
        listMaxItems,
        listMaxChars,
        listFontSize,
        showViz,
        previewChars,
        maxItems: listMax
      }
    };
  }

  function uiToCfg(form) {
    return sanitize({
      centerBias: form.centerBias.value,
      headerPx:   form.headerPx.value,
      eps:        form.eps.value,
      lockMs:     form.lockMs.value,
      showViz:    form.showViz.checked,       // ← 追加：UIのチェック状態を反映
      previewChars: form.previewChars.value,
      listMax:      form.listMax.value,
      listMaxItems: form.listMaxItems.value,
      listMaxChars: form.listMaxChars.value,
      listFontSize: form.listFontSize.value
    });
  }

  function applyToUI(form, cfg) {
    const v = { ...DEF, ...(cfg || {}) };
    form.centerBias.value = v.centerBias;
    form.headerPx.value   = v.headerPx;
    form.eps.value        = v.eps;
    form.lockMs.value     = v.lockMs;
    form.showViz.checked  = !!v.showViz;
    form.previewChars.value = v.list.previewChars;
    form.listMax.value      = v.list.maxItems;
    form.listMaxItems.value = v.list.listMaxItems;
    form.listMaxChars.value = v.list.listMaxChars;
    form.listFontSize.value = v.list.listFontSize;
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

    // 数値入力：自動保存＋表示中なら位置だけ更新（表示/非表示は維持）
    form.addEventListener('input', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      if (e.target.type === 'checkbox') return; // チェックボックスは別ハンドラで
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

    // ガイド線トグル：保存してから toggleViz で表示状態切替
    form.showViz.addEventListener('change', () => {
      const cfg = uiToCfg(form);
      saveCfg(cfg);
      try { window.CGTN?.toggleViz?.(cfg.showViz); } catch {}  // ← ここを toggleViz に
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
