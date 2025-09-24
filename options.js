// options.js — 設定画面
(function(){
  'use strict';
  const SH  = window.CGTN_SHARED;
  const DEF = SH?.DEFAULTS || {
    centerBias: 0.40, headerPx: 0, eps: 20, lockMs: 700, showViz: false,
    panel:{ x:null, y:null },
    list:{ enabled:false, maxItems:30, maxChars:40, fontSize:12, w:null, h:null, x:null, y:null }
  };

  const clamp = (n, lo, hi) => Math.min(Math.max(Number(n), lo), hi);

  function sanitize(raw){
    // DEFAULTS をベースに安全マージ
    const base = structuredClone(DEF);
    const v = {
      centerBias : clamp(raw.centerBias ?? base.centerBias, 0, 1),
      headerPx   : clamp(raw.headerPx   ?? base.headerPx,   0, 2000),
      eps        : clamp(raw.eps        ?? base.eps,        0, 120),
      lockMs     : clamp(raw.lockMs     ?? base.lockMs,     0, 3000),
      showViz    : !!raw.showViz,
      panel      : raw.panel || base.panel,
      list: {
        enabled : raw.list?.enabled ?? base.list.enabled,
        maxItems: clamp(raw.listMaxItems ?? raw.list?.maxItems ?? base.list.maxItems, 1, 200),
        maxChars: clamp(raw.listMaxChars ?? raw.list?.maxChars ?? base.list.maxChars, 10, 400),
        fontSize: clamp(raw.listFontSize ?? raw.list?.fontSize ?? base.list.fontSize, 8, 24),
        w: raw.list?.w ?? base.list.w,
        h: raw.list?.h ?? base.list.h,
        x: raw.list?.x ?? base.list.x,
        y: raw.list?.y ?? base.list.y
      }
    };
    return v;
  }

  function applyToUI(form, cfg){
    const v = sanitize(cfg || {});
    form.centerBias.value   = v.centerBias;
    form.headerPx.value     = v.headerPx;
    form.eps.value          = v.eps;
    form.lockMs.value       = v.lockMs;
    form.showViz.checked    = !!v.showViz;
    form.listMaxItems.value = v.list.maxItems;
    form.listMaxChars.value = v.list.maxChars;
    form.listFontSize.value = v.list.fontSize;
  }

  function uiToCfg(form){
    return sanitize({
      centerBias: form.centerBias.value,
      headerPx  : form.headerPx.value,
      eps       : form.eps.value,
      lockMs    : form.lockMs.value,
      showViz   : form.showViz.checked,
      listMaxItems: form.listMaxItems.value,
      listMaxChars: form.listMaxChars.value,
      listFontSize: form.listFontSize.value
    });
  }

  function showMsg(txt="保存しました"){
    const box = document.getElementById('msg');
    if (!box) return;
    box.textContent = txt;
    box.style.display = 'block';
    setTimeout(()=> box.style.display = 'none', 1200);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('cgtn-options');
    if (!form) return;

    // 初期ロード：DEFAULTS → 保存値 の順で反映
    SH.loadSettings(() => {
      const cfg = SH.getCFG();
      applyToUI(form, cfg);
      try { SH.renderViz(cfg, false); } catch {}
    });

    // 入力で即保存
    form.addEventListener('input', () => {
      const cfg = uiToCfg(form);
      SH.saveSettingsPatch(cfg);
      try { SH.renderViz(cfg, undefined); } catch {}
      showMsg();
    });

    // チェック切替は即時反映
    form.addEventListener('change', (e) => {
      if (e.target?.id !== 'showViz') return;
      const cfg = uiToCfg(form);
      SH.saveSettingsPatch(cfg);
      try { SH.renderViz(cfg, !!cfg.showViz); } catch {}
    });

    // 送信（保存ボタン）
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cfg = uiToCfg(form);
      applyToUI(form, cfg);
      SH.saveSettingsPatch(cfg);
      try { SH.renderViz(cfg, !!cfg.showViz); } catch {}
      showMsg();
    });

    // 既定に戻す
    document.getElementById('resetBtn')?.addEventListener('click', () => {
      const def = structuredClone(DEF);
      applyToUI(form, def);
      SH.saveSettingsPatch(def);
      SH.renderViz(def, false);
      showMsg("規定値に戻しました");
    });

    // バージョン表示（version_name 優先）
    try {
      const mf = chrome.runtime.getManifest?.() || {};
      const ver = mf.version_name || mf.version || '';
      const el = document.getElementById('buildInfo');
      if (el && ver) el.textContent = `Extension Version: ${ver}`;
    } catch {}
  });
})();
