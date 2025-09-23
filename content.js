// content.js — Entry Point（グローバル公開APIで呼ぶ）
(function(){
  'use strict';
  if (document.getElementById('cgpt-nav')) return;

  const SH = window.CGTN_SHARED;
  const UI = window.CGTN_UI;
  const EV = window.CGTN_EVENTS;
  const LG = window.CGTN_LOGIC;

  let mo = null;

  function initialize(){
    SH.loadSettings(() => {
      UI.installUI();
      UI.applyLang();
      UI.clampPanelWithinViewport();

//      LG.rebuild();
      (window.CGTN_APP?.rebuildAndMaybeRenderList || rebuild)();

      EV.bindEvents();

//      mo = new MutationObserver(() => LG.rebuild());
      mo = new MutationObserver(() => {
        (window.CGTN_APP?.rebuildAndMaybeRenderList || rebuild)();
      });
      mo.observe(document.body, { childList:true, subtree:true });

      window.addEventListener('resize', () => UI.clampPanelWithinViewport(), { passive:true });
      window.addEventListener('orientationchange', () => UI.clampPanelWithinViewport());
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once:true });
  } else {
    initialize();
  }
})();
