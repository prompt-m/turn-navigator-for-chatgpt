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
  #cgpt-nav input[type=checkbox] {cursor: pointer;}
  .cgpt-viz-toggle,.cgpt-list-toggle{margin-top:6px;display:flex;gap:8px;align-items:center;justify-content:flex-start;font-size:12px;cursor:pointer}
  .cgpt-viz-toggle:hover,.cgpt-list-toggle:hover{cursor:pointer;opacity:.9}
#cgpt-list-panel{
  position:fixed;right:120px;bottom:140px;
  display:none;flex-direction:column;
  z-index:2147483646;width:360px;max-width:min(92vw,420px);
  max-height:min(62vh,680px); border:1px solid rgba(0,0,0,.12);
  border-radius:16px;background:rgba(255,255,255,.98);
  box-shadow:0 18px 56px rgba(0,0,0,.25); overflow:hidden;
}
  #cgpt-list-head{display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(0,0,0,.1);padding:6px 10px}
  #cgpt-list-grip{height:12px;border-radius:10px;background:linear-gradient(90deg,#aaa 18%,#d0d0d0 50%,#aaa 82%);opacity:.6;cursor:grab;flex:1}
  #cgpt-list-close{all:unset;border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:6px 8px;cursor:pointer}
  #cgpt-list-body{overflow:auto;padding:6px 8px}
  #cgpt-list-body .row{display:flex;gap:8px;align-items:center;padding:8px 6px;border-bottom:1px dashed rgba(0,0,0,.08);cursor:pointer}
  #cgpt-list-body .row:hover{background:rgba(0,0,0,.04)}
  #cgpt-list-body .txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
  #cgpt-bias-line,#cgpt-bias-band{pointer-events:none!important}
  .cgpt-nav-group[data-role="user"]{ background:rgba(240,246,255,.96); }
  .cgpt-nav-group[data-role="assistant"]{ background:rgba(234,255,245,.96); }
  /* つまみ（両パネルで統一） */
  #cgpt-drag,#cgpt-list-grip{
    background:linear-gradient(90deg,#aaa 18%,#d0d0d0 50%,#aaa 82%);
  }
  #cgpt-list-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 8px;border-top:1px solid rgba(0,0,0,.08)}
/* パネルは縦フレックスで head / body / foot を上下に配置 */
#cgpt-list-head{
  display:flex; align-items:center; gap:8px;
  border-bottom:1px solid rgba(0,0,0,.1); padding:6px 10px;
}
#cgpt-list-grip{ height:12px; border-radius:10px; flex:1;
  background:linear-gradient(90deg,#aaa 18%,#d0d0d0 50%,#aaa 82%); opacity:.6; cursor:grab;
}

/* 畳む/開くボタン（閉じるの代わりに） */
#cgpt-list-collapse{
  all:unset; border:1px solid rgba(0,0,0,.12); border-radius:8px;
  padding:6px 8px; cursor:pointer; display:inline-grid; place-items:center;
}

/* 本文は可変。ここだけスクロールさせる */
#cgpt-list-body{ flex:1; overflow:auto; padding:6px 8px; }  /* ← flex:1 を追加 */
#cgpt-list-body .row{ display:flex; gap:8px; align-items:center;
  padding:8px 6px; border-bottom:1px dashed rgba(0,0,0,.08); cursor:pointer }
#cgpt-list-body .row:hover{ background:rgba(0,0,0,.04) }
#cgpt-list-body .txt{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1 }

/* フッターは常に最下部に見える（パネルがflex縦なのでsticky不要） */
#cgpt-list-foot{
  display:flex; gap:8px; align-items:center; justify-content:flex-end;
  flex-wrap:wrap;                                   /* ← ページャ折返し */
  padding:6px 8px; border-top:1px solid rgba(0,0,0,.08);
}

/* パネルを畳んだ見た目（ヘッダだけ残す） */
#cgpt-list-panel.collapsed { max-height: 48px; }
#cgpt-list-panel.collapsed #cgpt-list-body,
#cgpt-list-panel.collapsed #cgpt-list-foot { display:none; }

#cgpt-list-head{display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(0,0,0,.1);padding:6px 10px;position:sticky;top:0;background:rgba(255,255,255,.98)}
#cgpt-list-close{all:unset;border:1px solid rgba(0,0,0,.12);border-radius:8px;cursor:pointer}
#cgpt-list-collapse{all:unset;border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:4px 8px;cursor:pointer}
#cgpt-list-grip{height:12px;border-radius:10px;background:linear-gradient(90deg,#aaa 18%,#d0d0d0 50%,#aaa 82%);opacity:.6;cursor:grab;flex:1}

/* === pins color === */
/* 行右端の付箋ボタン（操作用） */
#cgpt-list-panel .row .pin-btn[aria-pressed="false"] { color:#f8bcd0; } /* 薄ピンク：OFF */
#cgpt-list-panel .row .pin-btn[aria-pressed="true"]  { color:#e60033; } /* 赤：ON */
#cgpt-list-panel .row .pin-btn { cursor:pointer; }

/* 行頭の状態マーク（表示用）——薄めに */
#cgpt-list-panel .row .clip { opacity:.85; }


/* つまみ横の付箋のみボタン（通常は薄ピンク、ONで赤） */
#cgpt-list-head #cgpt-pin-filter { color:#f8bcd0; }
#cgpt-list-head #cgpt-pin-filter[aria-pressed="true"] { color:#e60033; }
#cgpt-list-head #cgpt-pin-filter:hover { filter:brightness(1.08); }

/* つまみ横：Alt+クリックでゴールド“実験モード” */
#cgpt-list-head #cgpt-pin-filter.golden { color:#b8860b; } /* OFF時の金系ブラウン */
#cgpt-list-head #cgpt-pin-filter.golden[aria-pressed="true"] {
  color:#FFD700; text-shadow:0 0 4px rgba(255,215,0,.7);
  animation: cgpt-gold-pulse 1.2s ease-in-out infinite alternate;
}
@keyframes cgpt-gold-pulse { from { filter:brightness(1.0); } to { filter:brightness(1.25); } }

/* 付箋ボタンのヒットボックスを少し広げ、誤クリックを減らす */
#cgpt-list-panel .row .pin-btn { padding:2px 8px; }
#cgpt-list-panel .row .clip { cursor:default; }

/* ここ変えたよ：左側🔖の色（OFF=グレー, ON=赤） */
#cgpt-list-panel .row .clip[aria-pressed="false"] { color:#979797; }
#cgpt-list-panel .row .clip[aria-pressed="true"]  { color:#e60033; }

/* ホバー時の見た目（押せる感は出すが控えめ） */
#cgpt-list-panel .row .clip:hover { filter: brightness(1.1); }

/* 左側🔖のON/OFF色（確実に命中させるためクラス指定） */
#cgpt-list-panel .row .cgtn-clip-pin[aria-pressed="false"] { color:#979797; } /* グレー（OFF） */
#cgpt-list-panel .row .cgtn-clip-pin[aria-pressed="true"]  { color:#e60033; } /* 赤（ON） */

/* hoverで押せる感だけ少し強調 */
#cgpt-list-panel .row .cgtn-clip-pin:hover { filter: brightness(1.1); }

/* 左🔖は色をはっきり見せる */
#cgpt-list-panel .row .cgtn-clip-pin { opacity:1; }

/* 操作対象としてのカーソル（左🔖のみ） */
#cgpt-list-panel .row .cgtn-clip-pin { cursor:pointer; }

  `;

  injectCss(BASE_CSS);

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
          <input id="cgpt-list-toggle" type="checkbox" style="accent-color:#888;">
          <span data-i18n="list"></span>
        </label>

        <label class="cgpt-list-toggle">
          <input id="cgpt-pinonly" type="checkbox" style="accent-color:#888;">
          <span>付箋のみ</span>
        </label>
      </div>
    `;
    document.body.appendChild(box);

    // ドラッグ移動（保存は shared 側）
    (function enableDragging(){
      const grip = box.querySelector('#cgpt-drag');
      let dragging=false,offX=0,offY=0;
      grip.addEventListener('pointerdown',e=>{
        dragging=true;
        const r=box.getBoundingClientRect();
        offX=e.clientX-r.left; offY=e.clientY-r.top;
        grip.setPointerCapture(e.pointerId);
      });
      window.addEventListener('pointermove',e=>{
        if(!dragging) return;
        box.style.left=(e.clientX-offX)+'px';
        box.style.top=(e.clientY-offY)+'px';
      },{passive:true});
      window.addEventListener('pointerup',e=>{
        if(!dragging) return;
        dragging=false; grip.releasePointerCapture(e.pointerId);
        clampPanelWithinViewport();
        const r=box.getBoundingClientRect();
        SH.saveSettingsPatch({ panel:{ x:r.left, y:r.top } });
      });
    })();

    applyLang();

    // 初期チェック状態の反映
    const cfg = SH.getCFG() || {};
    const vizChk     = box.querySelector('#cgpt-viz');
    const listChk    = box.querySelector('#cgpt-list-toggle');
    const pinOnlyChk = box.querySelector('#cgpt-pinonly');
    try {
      vizChk.checked      = !!cfg.showViz;
      listChk.checked     = !!cfg.list?.enabled;
      pinOnlyChk.checked  = !!cfg.list?.pinOnly;
      pinOnlyChk.disabled = !listChk.checked;   // 一覧OFFなら操作不可
    } catch {}

    // 折りたたみ（パネルDOMは logic 側で生成されるので存在すればバインド）
    (function bindCollapse(){
      const panel = document.getElementById('cgpt-list-panel');
      const btn   = document.getElementById('cgpt-list-collapse');
      if (!panel || !btn) return;
      btn.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        const on = !panel.classList.contains('collapsed');
        btn.textContent = on ? '▴' : '▾';
        btn.setAttribute('aria-expanded', String(on));
      });
    })();

    // ==== チェックの相互連動 ====

    // 「付箋のみ」トグル（置換）
    pinOnlyChk.addEventListener('change', () => {
      const cur = SH.getCFG() || {};
      const val = !!pinOnlyChk.checked;

      // 保存
      SH.saveSettingsPatch({ list:{ ...(cur.list||{}), pinOnly: val } });

      // 一覧がOFFならONにして表示を保証
      const listOn = !!(SH.getCFG()?.list?.enabled);
      if (!listOn) window.CGTN_LOGIC?.setListEnabled?.(true);

      // ★ 即時に新状態で再描画（保存反映待ちを回避）
      window.CGTN_LOGIC?.renderList?.(true, { pinOnlyOverride: val });

      // フォーカスを外して“カーソル残り”を防ぐ
      try { pinOnlyChk.blur(); } catch {}
    });

    // 「一覧」トグル
    listChk.addEventListener('change', () => {
      const on  = listChk.checked;
      const cur = SH.getCFG() || {};
      const patch = on
        ? { list:{ ...(cur.list||{}), enabled:true } }
        : { list:{ ...(cur.list||{}), enabled:false, pinOnly:false } }; // OFFならpinOnlyもOFF
      SH.saveSettingsPatch(patch);

      // 付箋のみの活性/非活性を即時反映
      pinOnlyChk.disabled = !on;
      if (!on) pinOnlyChk.checked = false;

      // 描画更新
      window.CGTN_LOGIC?.setListEnabled?.(on);
      // フォーカスを外して“カーソル残り”を防ぐ
      try{ listChk.blur(); }catch{}
    });

    // 基準線トグル（従来どおり）
    vizChk.addEventListener('change', () => {
      const on = vizChk.checked;
      SH.toggleViz(on);
      SH.saveSettingsPatch({ showViz: !!on });
    });

    // ナビエリア内のクリック後、フォーカスを外す（カーソル残り対策）
    box.addEventListener('click', () => {
      const ae = document.activeElement;
      if (ae && typeof ae.blur === 'function') {
        // チェックボックスやボタンの残留フォーカスを除去
        ae.blur();
      }
    }, {capture:true});

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
