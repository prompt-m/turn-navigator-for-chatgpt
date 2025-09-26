// content.js — Entry
(function(){
  'use strict';
  if (document.getElementById('cgpt-nav')) return;

  const SH = window.CGTN_SHARED;
  const UI = window.CGTN_UI;
  const EV = window.CGTN_EVENTS;
  const LG = window.CGTN_LOGIC;

  let mo = null;

  function isOwnUI(node){
    const nav  = document.getElementById('cgpt-nav');
    const list = document.getElementById('cgpt-list-panel');
    return (nav && (node===nav || nav.contains(node))) ||
           (list && (node===list || list.contains(node)));
  }

  function initialize(){
    SH.loadSettings(() => {
      UI.installUI();
      UI.applyLang();
      UI.clampPanelWithinViewport();

      // 初期状態は常に OFF（リロード/チャット切替とも）
//      try {
//        const cur = SH.getCFG() || {};
//        if (cur.list?.enabled) {
//          SH.saveSettingsPatch({ list:{ ...(cur.list||{}), enabled:false } });
//        }
//        const chk = document.getElementById('cgpt-list-toggle');
//        chk.checked = false;
//        LG?.setListEnabled?.(false, /*save*/ false);
//      } catch {}

      LG.rebuild();

// === 基準線の初期表示（保存された showViz を尊重） ===
try {
  const cfg = window.CGTN_SHARED?.getCFG?.();
  window.CGTN_SHARED?.renderViz?.(cfg, !!cfg?.showViz); // ← trueなら表示まで
} catch {}
// === 基準線の初期表示 ここまで ===


      EV.bindEvents();

      // === 基準線の自動追従（リサイズ/DevTools開閉/回転/可視状態変更） ===
      // 軽いデバウンス（連続イベントをまとめる）
      const _cgtnDebounce = (fn, ms = 60) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a      ), ms); }; };

      // 基準線を再配置（shared.js の公開API）
      const _cgtnRedrawBaseline = _cgtnDebounce(() => {
        try { window.CGTN_SHARED?.redrawBaseline?.(); } catch {}
      }, 60);

      // ウィンドウサイズ・画面回転・タブ可視状態
      window.addEventListener('resize', _cgtnRedrawBaseline, { passive: true });
      window.addEventListener('orientationchange', _cgtnRedrawBaseline);
      document.addEventListener('visibilitychange', _cgtnRedrawBaseline);

      // スクロールコンテナの高さ変化（DevTools ドッキング変更等も検知）
      try {
        const sc = window.CGTN_LOGIC?._scroller || document.scrollingElement || document.documentElement;
        const _cgtnRO = new ResizeObserver(_cgtnRedrawBaseline);
        _cgtnRO.observe(sc);

        // ページ離脱でクリーンアップ（念のため）
        window.addEventListener('pagehide', () => { try { _cgtnRO.disconnect(); } catch {} }, { once: true });
      } catch {}

      // 初回も一度呼ぶ（初期描画）
      requestAnimationFrame(_cgtnRedrawBaseline);
      // === 基準線の自動追従 ここまで===

      // 自前UIの変化は無視してループを断つ
      mo = new MutationObserver((muts)=>{
        for (const m of muts){
          if (isOwnUI(m.target)) return; // ← 重要：自前UIなら短絡 return
        }
        LG.rebuild();
        // list は OFF 初期なので描画は呼ばない（ON時のみ logic 側で描画）
      });
      mo.observe(document.body, { childList:true, subtree:true });

      window.addEventListener('resize', () => UI.clampPanelWithinViewport(), { passive:true });
      window.addEventListener('orientationchange', () => UI.clampPanelWithinViewport());

      // setListEnabled(false) を initialize 最後に一度だけ強制
      try {
        const chk = document.getElementById('cgpt-list-toggle');
        if (chk) chk.checked = false;
        window.CGTN_LOGIC?.setListEnabled?.(false);
      } catch {}

    });
  }

//基準線の追従
  const debounce = (fn, ms=50) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const redraw = debounce(()=> window.CGTN_SHARED?.redrawBaseline?.(), 50);

  window.addEventListener('resize', redraw, { passive:true });
  window.addEventListener('orientationchange', redraw);
  document.addEventListener('visibilitychange', redraw);

  try{
    const sc = document.scrollingElement || document.documentElement;
    const ro = new ResizeObserver(redraw);
    ro.observe(sc);
  }catch{}
//基準線の追従ここまで

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once:true });
  } else {
    initialize();
  }
})();
