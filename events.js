// events.js — パネルUIのイベント束ね
(() => {
  const LG = window.CGTN_LOGIC;
  const SH = window.CGTN_SHARED;
  const NS = (window.CGTN_EVENTS = window.CGTN_EVENTS || {});

  function bindEvents(){
    const box = document.getElementById('cgpt-nav');
    if (!box) return;

    box.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act], #cgpt-viz, #cgpt-list-toggle, .cgpt-lang-btn');
      if (!t) return;

      // 基準線トグル
      if (t.id === 'cgpt-viz') {
        const on = t.checked;
        try { SH.toggleViz(on); } catch {}
        SH.saveSettingsPatch({ showViz: !!on });
        return;
      }

      // 言語切替（UI側で実装している場合はそちらで）
      if (t.classList?.contains('cgpt-lang-btn')) {
        try { window.CGTN_UI?.toggleLang?.(); } catch {}
        return;
      }

      // ナビゲーション
      if (t.dataset.act) {
        const act = t.dataset.act;                  // top / prev / next / bottom
        const role = t.closest('.cgpt-nav-group')?.dataset.role; // user / assistant / all
        if (!role) return;
        const fn = {
          top:    LG.goTop,
          prev:   LG.goPrev,
          next:   LG.goNext,
          bottom: LG.goBottom,
        }[act];
        try { fn?.(role); } catch {}
      }
    });
  }

  NS.bindEvents = bindEvents;
})();
