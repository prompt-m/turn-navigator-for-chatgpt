// events.js — クリック配線 / チェック連動（UIのdata-act / data-roleに対応）
(() => {
  const SH = window.CGTN_SHARED;
  const UI = window.CGTN_UI;
  const LG = window.CGTN_LOGIC;

  const NS = (window.CGTN_EVENTS = window.CGTN_EVENTS || {});

  function bindEvents(){
    const box = document.getElementById('cgpt-nav');
    if (!box) return;

    // 初期チェック状態を反映
    try {
      box.querySelector('#cgpt-viz').checked  = !!SH.getCFG().showViz;
      box.querySelector('#cgpt-list-toggle').checked = !!(SH.getCFG().list?.enabled);
      const pinOnlyChk = document.getElementById('cgpt-pinonly');
      if (pinOnlyChk){
        pinOnlyChk.checked  = !!(SH.getCFG().list?.pinOnly);
        pinOnlyChk.disabled = !SH.getCFG().list?.enabled;
      }
    } catch {}

    box.addEventListener('click', (e) => {
      const t = e.target.closest('*');
      if (!t) return;

      // 一覧トグル
      if (t.closest('#cgpt-list-toggle')) {
        const on = t.closest('#cgpt-list-toggle').checked;
        LG.setListEnabled(on);

        // 一覧をOFFにしたら付箋もOFF & 無効化
        const pinOnlyChk = document.getElementById('cgpt-pinonly');
        if (!on && pinOnlyChk){
          const cur = SH.getCFG() || {};
          SH.saveSettingsPatch({ list:{ ...(cur.list||{}), pinOnly:false } });
          pinOnlyChk.checked = false;
          pinOnlyChk.disabled = true;
        }
        return;
      }

      // 基準線トグル
      if (t.closest('#cgpt-viz')) {
        const on = t.closest('#cgpt-viz').checked;
        SH.toggleViz(on);
        SH.saveSettingsPatch({ showViz: !!on });
        return;
      }

      // 言語トグル
      if (t.closest('.cgpt-lang-btn')) {
        UI.toggleLang();
        window.CGTN_SHARED?.updateTooltips?.();   // ← 言語切替に追随
        return;
      }

      // ナビボタン（Top/Bottom/Prev/Next）
      const btn = t.closest('button[data-act]');
      if (btn) {
        const act = btn.dataset.act;
        const role = btn.closest('.cgpt-nav-group')?.dataset.role || 'all';
        switch (act) {
          case 'top':    LG.goTop(role);    break;
          case 'bottom': LG.goBottom(role); break;
          case 'next':   LG.goNext(role);   break;
          case 'prev':   LG.goPrev(role);   break;
        }
      }
    }, false);
  }

  NS.bindEvents = bindEvents;
})();
