// options.js — 自動保存 & 基準線プレビュー（ロード時は非表示）
(function(){
  'use strict';

  const SH = window.CGTN_SHARED;
  const DEF = SH?.DEFAULTS || {
    centerBias:0.40, headerPx:0, eps:20, lockMs:700, showViz:false,
    list:{ maxItems:30, maxChars:40, fontSize:12 }
  };

  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

  function sanitize(raw){
    const centerBias = clamp(Number(raw.centerBias ?? DEF.centerBias), 0, 1);
    const headerPx   = clamp(parseInt(raw.headerPx ?? DEF.headerPx, 10), 0, 2000);
    const eps        = clamp(parseInt(raw.eps ?? DEF.eps, 10), 0, 120);
    const lockMs     = clamp(parseInt(raw.lockMs ?? DEF.lockMs, 10), 0, 3000);
    const showViz    = !!raw.showViz;

    const listMaxItems = clamp(parseInt(raw.listMaxItems ?? DEF.list.maxItems, 10), 1, 200);
    const listMaxChars = clamp(parseInt(raw.listMaxChars ?? DEF.list.maxChars, 10), 10, 400);
    const listFontSize = clamp(parseInt(raw.listFontSize ?? DEF.list.fontSize, 10), 8, 24);

    return {
      centerBias, headerPx, eps, lockMs, showViz,
      list: { maxItems:listMaxItems, maxChars:listMaxChars, fontSize:listFontSize }
    };
  }

  function uiToCfg(form){
    return sanitize({
      centerBias: form.centerBias.value,
      headerPx:   form.headerPx.value,
      eps:        form.eps.value,
      lockMs:     form.lockMs.value,
      showViz:    form.showViz.checked,
      listMaxItems: form.listMaxItems.value,
      listMaxChars: form.listMaxChars.value,
      listFontSize: form.listFontSize.value
    });
  }

  function applyToUI(form, cfg){
    const v = sanitize({ ...DEF, ...cfg, ...cfg?.list });
    form.centerBias.value  = v.centerBias;
    form.headerPx.value    = v.headerPx;
    form.eps.value         = v.eps;
    form.lockMs.value      = v.lockMs;
    form.showViz.checked   = !!v.showViz;
    form.listMaxItems.value= v.list.maxItems;
    form.listMaxChars.value= v.list.maxChars;
    form.listFontSize.value= v.list.fontSize;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('cgtn-options');
    if (!form) return;

    // 初期ロード
    SH.loadSettings(() => {
      applyToUI(form, SH.getCFG());
      // 仕様：ロード直後は非表示に固定（プレビューはチェック時のみ）
      try { SH.renderViz(SH.getCFG(), false); } catch {}
    });

    // 入力ですぐ保存（値はblurでクランプ）
    form.addEventListener('input', () => {
      const cfg = uiToCfg(form);
      SH.saveSettingsPatch(cfg);
      // 表示中なら位置だけ更新
      try { SH.renderViz(cfg, undefined); } catch {}
      showMsg();
    });

    // 規定に戻す
    document.getElementById('resetBtn').addEventListener('click', () => {
      const def = structuredClone(SH.DEFAULTS);
      applyToUI(form, def);
      SH.saveSettingsPatch(def);
      SH.renderViz(def, false);
      showMsg("規定値に戻しました");
    });

   function showMsg(txt="保存しました"){
      const box = document.getElementById('msg');
      if(!box) return;
      box.textContent = txt;
      box.style.display = 'block';
      setTimeout(()=> box.style.display="none", 1500);
    }

    // blur 補正 → 保存
    form.addEventListener('blur', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      const cfg = uiToCfg(form);
      applyToUI(form, cfg);
      SH.saveSettingsPatch(cfg);
      try { SH.renderViz(cfg, undefined); } catch {}
    }, true);

    // 基準線トグル（押した時だけON/OFF）
    form.showViz.addEventListener('change', () => {
      const cfg = uiToCfg(form);
      SH.saveSettingsPatch(cfg);
      try { SH.renderViz(cfg, !!cfg.showViz); } catch {}
    });

    // 念のため「保存」ボタン対応（ある場合）
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cfg = uiToCfg(form);
      applyToUI(form, cfg);
      SH.saveSettingsPatch(cfg);
      try { SH.renderViz(cfg, !!cfg.showViz); } catch {}
    });
  });
})();
