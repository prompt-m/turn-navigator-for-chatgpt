// ui.js — パネルUI生成 / 言語 / 位置クランプ
(() => {
  const SH = window.CGTN_SHARED;
  const NS = (window.CGTN_UI = window.CGTN_UI || {});

  const I18N = {
    ja: { user:'ユーザー', assistant:'アシスタント', all:'全体', top:'先頭', prev:'前へ', next:'次へ', bottom:'末尾', langBtn:'English', dragTitle:'ドラッグで移動', line:'基準線', list:'一覧' },
    en: { user:'User', assistant:'Assistant', all:'All', top:'Top', prev:'Prev', next:'Next', bottom:'Bottom', langBtn:'日本語', dragTitle:'Drag to move', line:'Guide', list:'List' }
  };
  let LANG = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';

  function injectCss(css){
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  // 最低限の見た目（以前のCSSを凝縮）
  const BASE_CSS = `
  #cgpt-nav{position:fixed;right:12px;bottom:140px;display:flex;flex-direction:column;gap:12px;z-index:2147483647}
  #cgpt-drag{width:92px;height:12px;border-radius:10px;background:linear-gradient(90deg,#aaa 18%,#d0d0d0 50%,#aaa 82%);opacity:.55;cursor:grab;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
  .cgpt-nav-group{width:92px;border-radius:14px;padding:10px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.95);box-shadow:0 6px 24px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:6px}
  .cgpt-nav-label{text-align:center;font-weight:600;opacity:.9;margin-bottom:2px;font-size:12px}
  #cgpt-nav button{all:unset;height:34px;border-radius:10px;font:12px/1.1 system-ui,-apple-system,sans-serif;display:grid;place-items:center;cursor:pointer;background:#f2f2f7;color:#111;border:1px solid rgba(0,0,0,.08)}
  #cgpt-nav button:hover{background:#fff}
  .cgpt-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  #cgpt-nav .cgpt-lang-btn{height:28px;margin-top:4px}
  .cgpt-viz-toggle,.cgpt-list-toggle{margin-top:6px;display:flex;gap:8px;align-items:center;justify-content:flex-start;font-size:12px;cursor:pointer}
  .cgpt-viz-toggle:hover,.cgpt-list-toggle:hover{cursor:pointer;opacity:.9}
  /* リストパネル（簡易版） */
  #cgpt-list-panel{position:fixed;right:120px;bottom:140px;display:none;flex-direction:column;z-index:2147483646;width:360px;max-width:min(92vw,420px);max-height:min(62vh,680px);border:1px solid rgba(0,0,0,.12);border-radius:16px;background:rgba(255,255,255,.98);box-shadow:0 18px 56px rgba(0,0,0,.25)}
  #cgpt-list-head{display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(0,0,0,.1);padding:6px 10px}
  #cgpt-list-grip{height:12px;border-radius:10px;background:linear-gradient(90deg,#aaa 18%,#d0d0d0 50%,#aaa 82%);opacity:.6;cursor:grab;flex:1}
  #cgpt-list-close{all:unset;border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:6px 8px;cursor:pointer}
  #cgpt-list-body{overflow:auto;padding:6px 8px}
  #cgpt-list-body .row{display:flex;gap:8px;align-items:center;padding:8px 6px;border-bottom:1px dashed rgba(0,0,0,.08);cursor:pointer}
  #cgpt-list-body .row:hover{background:rgba(0,0,0,.04)}
  #cgpt-list-body .txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
  #cgpt-bias-line,#cgpt-bias-band{pointer-events:none!important}
  `;

  injectCss(BASE_CSS);
/*
  // 最低限のスタイル（必要ならお使いのCSSに差し替えOK）
  injectCss(`
    #cgpt-nav{position:fixed;right:12px;bottom:140px;display:flex;flex-direction:column;gap:12px;z-index:2147483647}
    #cgpt-drag{width:92px;height:12px;cursor:grab;border-radius:10px;background:linear-gradient(90deg,#aaa 20%,#ccc 50%,#aaa 80%);opacity:.55;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
    .cgpt-nav-group{position:relative;width:92px;border-radius:14px;padding:10px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.95);box-shadow:0 6px 24px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:6px;align-items:stretch}
    .cgpt-nav-label{text-align:center;font-weight:600;opacity:.9;margin-bottom:2px;font-size:12px}
    #cgpt-nav button{all:unset;height:34px;border-radius:10px;font:12px/1.1 system-ui,-apple-system,sans-serif;display:grid;place-items:center;cursor:pointer;user-select:none;background:#f2f2f7;color:#111;border:1px solid rgba(0,0,0,.08)}
    #cgpt-nav .cgpt-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    #cgpt-nav .cgpt-lang-btn{height:28px;margin-top:4px}
    #cgpt-bias-line,#cgpt-bias-band{pointer-events:none!important}
  `);
*/
  function installUI(){
    if (document.getElementById('cgpt-nav')) return;
    const box = document.createElement('div');
    box.id = 'cgpt-nav';
    box.innerHTML = `
      <div id="cgpt-drag" title=""></div>
      <div class="cgpt-nav-group" data-role="user">
        <div class="cgpt-nav-label" data-i18n="user"></div>
        <button data-act="top" data-i18n="top"></button>
        <button data-act="prev" data-i18n="prev"></button>
        <button data-act="next" data-i18n="next"></button>
        <button data-act="bottom" data-i18n="bottom"></button>
      </div>
      <div class="cgpt-nav-group" data-role="assistant">
        <div class="cgpt-nav-label" data-i18n="assistant"></div>
        <button data-act="top" data-i18n="top"></button>
        <button data-act="prev" data-i18n="prev"></button>
        <button data-act="next" data-i18n="next"></button>
        <button data-act="bottom" data-i18n="bottom"></button>
      </div>
      <div class="cgpt-nav-group" data-role="all">
        <div class="cgpt-nav-label" data-i18n="all"></div>
        <div class="cgpt-grid2">
          <button data-act="top">▲</button>
          <button data-act="bottom">▼</button>
        </div>
        <button class="cgpt-lang-btn"></button>
        <label class="cgpt-viz-toggle">
          <input id="cgpt-viz" type="checkbox" style="accent-color:#888;">
          <span data-i18n="line"></span>
        </label>
        <label class="cgpt-list-toggle">
          <input id="cgpt-list-toggle" type="checkbox" style="accent-color:#888;" disabled>
          <span data-i18n="list"></span>
        </label>
      </div>`;
    document.body.appendChild(box);

    // ドラッグ移動（保存は shared 側）
    (function enableDragging(){
      const grip = box.querySelector('#cgpt-drag');
      let dragging=false,offX=0,offY=0;
      grip.addEventListener('pointerdown',e=>{ dragging=true; const r=box.getBoundingClientRect(); offX=e.clientX-r.left; offY=e.clientY-r.top; grip.setPointerCapture(e.pointerId); });
      window.addEventListener('pointermove',e=>{ if(!dragging) return; box.style.left=(e.clientX-offX)+'px'; box.style.top=(e.clientY-offY)+'px'; },{passive:true});
      window.addEventListener('pointerup',e=>{ if(!dragging) return; dragging=false; grip.releasePointerCapture(e.pointerId); clampPanelWithinViewport(); const r=box.getBoundingClientRect(); SH.saveSettingsPatch({ panel:{ x:r.left, y:r.top } }); });
    })();

    applyLang();
    try { box.querySelector('#cgpt-viz').checked = !!SH.getCFG().showViz; } catch {}
  }

  function applyLang(){
    const box = document.getElementById('cgpt-nav'); if (!box) return;
    const t = I18N[LANG] || I18N.ja;
    box.querySelectorAll('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); if (t[k]) el.textContent = t[k]; });
    box.querySelector('#cgpt-drag').title = t.dragTitle;
    box.querySelector('.cgpt-lang-btn').textContent = t.langBtn;
  }
  function toggleLang(){ LANG = LANG === 'ja' ? 'en' : 'ja'; applyLang(); }

  function clampPanelWithinViewport(){
    const box = document.getElementById('cgpt-nav'); if (!box) return;
    const margin = 8;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const r = box.getBoundingClientRect();
    box.style.right = 'auto'; box.style.bottom = 'auto';
    let x = Number.isFinite(r.left) ? r.left : vw - r.width - 12;
    let y = Number.isFinite(r.top)  ? r.top  : vh - r.height - 140;
    x = Math.min(vw - r.width - margin, Math.max(margin, x));
    y = Math.min(vh - r.height - margin, Math.max(margin, y));
    box.style.left = `${x}px`;
    box.style.top  = `${y}px`;
  }

  NS.installUI = installUI;
  NS.applyLang = applyLang;
  NS.toggleLang = toggleLang;
  NS.clampPanelWithinViewport = clampPanelWithinViewport;
})();
