// options.js — 自動保存 & 基準線プレビュー（ロード時は非表示）
(function(){
  'use strict';

  const SH = window.CGTN_SHARED;
  const DEF = SH?.DEFAULTS || {
    centerBias: 0.40, headerPx: 0, eps: 20, lockMs: 700, showViz: false,
    panel:{ x:null, y:null },
    list:{ enabled:false, maxItems:30, maxChars:40, fontSize:12 }
  };

  const clamp = (n, lo, hi) => Math.min(Math.max(Number(n), lo), hi);

  function sanitize(raw){
    const v = {
      centerBias : clamp(raw.centerBias ?? DEF.centerBias, 0, 1),
      headerPx   : clamp(raw.headerPx   ?? DEF.headerPx,   0, 2000),
      eps        : clamp(raw.eps        ?? DEF.eps,        0, 120),
      lockMs     : clamp(raw.lockMs     ?? DEF.lockMs,     0, 3000),
      showViz    : !!raw.showViz,
      panel      : raw.panel || DEF.panel,
      list: {
        enabled : raw.list?.enabled ?? DEF.list.enabled,
        maxItems: clamp(raw.listMaxItems ?? DEF.list.maxItems, 1, 200),
        maxChars: clamp(raw.listMaxChars ?? DEF.list.maxChars, 10, 400),
        fontSize: clamp(raw.listFontSize ?? DEF.list.fontSize, 8, 24)
      }
    };
    return v;
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

  function applyToUI(form, cfg){
    const v = sanitize({ ...DEF, ...cfg, ...cfg?.list });
    form.centerBias.value   = v.centerBias;
    form.headerPx.value     = v.headerPx;
    form.eps.value          = v.eps;
    form.lockMs.value       = v.lockMs;
    form.showViz.checked    = !!v.showViz;
    form.listMaxItems.value = v.list.maxItems;
    form.listMaxChars.value = v.list.maxChars;
    form.listFontSize.value = v.list.fontSize;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('cgtn-options');
    if (!form) return;

    SH.loadSettings(() => {
      applyToUI(form, SH.getCFG());
      try { SH.renderViz(SH.getCFG(), false); } catch {}
    });

    const showMsg = (txt="保存しました") => {
      const box = document.getElementById('msg');
      if (!box) return;
      box.textContent = txt;
      box.style.display = 'block';
      setTimeout(()=> box.style.display = 'none', 1200);
    };

    form.addEventListener('input', () => {
      const cfg = uiToCfg(form);
      SH.saveSettingsPatch(cfg);
      try { SH.renderViz(cfg, undefined); } catch {}
      showMsg();
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
      const def = structuredClone(SH.DEFAULTS);
      applyToUI(form, def);
      SH.saveSettingsPatch(def);
      SH.renderViz(def, false);
      showMsg("規定値に戻しました");
    });

    form.addEventListener('blur', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      const cfg = uiToCfg(form);
      applyToUI(form, cfg);
      SH.saveSettingsPatch(cfg);
      try { SH.renderViz(cfg, undefined); } catch {}
    }, true);

    form.addEventListener('change', (e) => {
      if (e.target?.id !== 'showViz') return;
      const cfg = uiToCfg(form);
      SH.saveSettingsPatch(cfg);
      try { SH.renderViz(cfg, !!cfg.showViz); } catch {}
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cfg = uiToCfg(form);
      applyToUI(form, cfg);
      SH.saveSettingsPatch(cfg);
      try { SH.renderViz(cfg, !!cfg.showViz); } catch {}
    });

    // バージョン表示（version_name優先）
    try {
      const mf = chrome.runtime.getManifest?.() || {};
      const ver = mf.version_name || mf.version || '';
      const el = document.getElementById('buildInfo');
      if (el && ver) el.textContent = `Extension Version: ${ver}`;
    } catch {}
  });
})();
