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
      try {
        const cur = SH.getCFG() || {};
        if (cur.list?.enabled) {
          SH.saveSettingsPatch({ list:{ ...(cur.list||{}), enabled:false } });
        }
        const chk = document.getElementById('cgpt-list-toggle');
        if (chk) chk.checked = false;
      } catch {}

      LG.rebuild();
      EV.bindEvents();

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
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once:true });
  } else {
    initialize();
  }
})();
