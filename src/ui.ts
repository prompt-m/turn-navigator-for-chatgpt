// ui.ts — パネルUI生成 / 言語 / 位置クランプ

(() => {
  "use strict";

  const NS = (window.CGTN_UI = window.CGTN_UI || {});
  const SH = window.CGTN_SHARED || {};
  const LG = window.CGTN_LOGIC || {};

  const T = (k) => window.CGTN_I18N?.t?.(k) || k;

  // 初期言語設定
  let LANG = (navigator.language || "").toLowerCase().startsWith("ja")
    ? "ja"
    : "en";
  document.documentElement.lang = LANG;

  NS.getLang = () => LANG;
  SH.getLang = () => LANG;
  SH.setLangResolver?.(SH.getLang);

  const pinCurURL = chrome.runtime.getURL("assets/pin16.png");
  const prvCurURL = chrome.runtime.getURL("assets/prev16.png");

  /* ==========================================================================
     CSS 定義 (幅100px & 12pxフォント対応)
     ========================================================================== */
  const ALL_CSS = `
/* === ベースパネル === */
#cgpt-nav {
  position: fixed;
  right: 12px;
  bottom: 80px;
  display: flex;
  flex-direction: column;
  z-index: 2147483647;
  background: #fcfcfc;
  border: 1px solid rgba(0,0,0,.15);
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,.25);
  /* ★修正: 90px -> 100px にして余裕を持たせる */
  width: 100px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
  transition: opacity 0.2s;
  font-size: 11px;
}

@media (prefers-color-scheme: dark){
  #cgpt-nav{
    border-color: rgba(255,255,255,.15);
    background: #1a1a1a;
  }
}

/* === 統一ヘッダー === */
.cgtn-unified-header {
  background: #000;
  color: #fff;
  padding: 16px 8px 14px 8px; 
  display: flex;
  flex-direction: column;
  gap: 14px;
  cursor: grab;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.cgtn-unified-header:active { cursor: grabbing; }

/* ヘッダー上段 */
.cgtn-header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
}
.cgtn-brand-group {
  display: flex;
  flex-direction: column;
  line-height: 1;
}
.cgtn-title-main {
  font-size: 14px;
  font-weight: 800;
  color: #EBFFF5;
  letter-spacing: 0.5px;
}
.cgtn-title-sub {
  font-size: 10px;
  font-weight: 600;
  color: #bbb;
  margin-top: 3px;
}
.cgtn-ver {
  font-size: 9px;
  color: #bbb;
  font-family: monospace;
  margin-top: 1px;
}

/* ヘッダー下段 */
.cgtn-header-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* トグルスイッチ */
.cgtn-power-wrapper {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
  pointer-events: auto;
  z-index: 10;
}
.cgtn-power-wrapper input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #555;
  transition: .3s;
  border-radius: 18px;
  border: 1px solid #666;
}
.slider:before {
  position: absolute;
  content: "";
  height: 14px; width: 14px;
  left: 1px; bottom: 1px;
  background-color: #ddd;
  transition: .3s;
  border-radius: 50%;
}
input:checked + .slider { background-color: #AC0000; border-color: #AC0000; }
input:checked + .slider:before {
  background-color: #fff;
  transform: translateX(10px);
}

/* デジタルスクリーン (数値・状態表示) */
.digital-screen {
  text-align: right;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  pointer-events: none;
  flex: 1; /* 残りのスペースを埋める */
  overflow: hidden;
}
.digital-screen .screen-value {
  /* ★修正: 12pxで見やすく。桁が多くても収まるように */
  font-size: 12px; 
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
}
/* ローディング中は少し小さくしても良いかも */
.digital-screen .screen-value.loading { font-size: 10px; opacity: 0.8; }

.digital-screen .off-text { 
  color: #aaa; font-size: 12px; font-weight: 600; 
}

/* === ボディ === */
.cgtn-body {
  padding: 12px 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  background: #444;
}
.cgtn-body::-webkit-scrollbar { width: 0; height: 0; }

/* グループ枠 */
.cgpt-nav-group {
  border-radius: 10px;
  padding: 8px 4px;
  background: #fff;
  border: 1px solid #eee;
  display: flex;
  flex-direction: column;
  gap: 5px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.03);
}
.cgpt-nav-group[data-role="user"] { color:#555; background: #2A2A2A; border-color: #2A2A2A; }
.cgpt-nav-group[data-role="assistant"] { background: #2A2A2A; border-color: #2A2A2A; }
.cgpt-nav-group[data-role="all"]{ background: #2A2A2A; border-color: #2A2A2A; }
.cgpt-nav-group[data-role="tools"]{ background: #2A2A2A; border-color: #2A2A2A; }
.cgpt-nav-group[data-role="others"] { background: #2A2A2A; border-color: #2A2A2A; }

@media (prefers-color-scheme: dark){
  .cgpt-nav-group { background: #222; border-color: #333; }
  .cgpt-nav-group[data-role="user"] { background: #1e293b; border-color: #334155; }
  .cgpt-nav-group[data-role="assistant"] { background: #14532d; border-color: #166534; }
}

.cgpt-nav-label {
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  opacity: 0.6;
}
@media (prefers-color-scheme: dark){ .cgpt-nav-label { color: #ccc; } }

.cgpt-nav-group[data-role="user"] {.cgpt-nav-label{color:#fff;}} 
.cgpt-nav-group[data-role="assistant"] {.cgpt-nav-label{color:#fff;}} 
.cgpt-nav-group[data-role="all"] {.cgpt-nav-label{color:#fff;}} 
.cgpt-nav-group[data-role="tools"] {.cgpt-nav-label{color:#fff;}} 
.cgpt-nav-group[data-role="others"] {.cgpt-nav-label{color:#fff;}} 

.cgpt-nav-group[data-role="user"] {.cgtn-pill-btn:hover{background:#4E95D9;}} 
.cgpt-nav-group[data-role="assistant"] {.cgtn-pill-btn:hover{background:#F59599;}} 
.cgpt-nav-group[data-role="all"] {.cgtn-pill-btn:hover{background:#FF4343;}} 
.cgpt-nav-group[data-role="tools"] {#cgpt-list-btn:hover{background:#EDEDED;color:#000;}} 
.cgpt-nav-group[data-role="others"] {.cgtn-pill-btn:hover{background:#EDEDED;color:#000;}} 

/* ピル型ボタン */
.cgtn-pill-btn {
  /* ★修正: 幅を100pxにしたので、文字サイズを12pxに上げても大丈夫 */
  font-size: 12px;
  font-weight: 500;
  padding: 0 4px;
  width: 100%;
  border-radius: 6px;
  border: 1px solid rgba(0,0,0,0.08);
  background: #444;
  cursor: pointer;
  color: #fff;
  height: 24px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.1s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  white-space: nowrap;
}
.cgtn-pill-btn:active { 
  transform: translateY(0);
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
}

#cgpt-list-btn.active {
  background: #fff;
  color: #222;
  font-weight: 700;
  border-color: #fff;
}

/* 2列グリッド */
.cgpt-grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}

/* Idle モード */
#cgpt-nav.cgtn-idle .cgtn-body {
  display: none;
}

/* フォーカスリング消し */
#cgpt-nav :where(button,label,input[type=checkbox]):focus:not(:focus-visible),
#cgpt-list-panel :where(button,label,input[type=checkbox]):focus:not(:focus-visible){
  outline: none !important;
  box-shadow: none !important;
}

/* === 既存CSS (LIST等) === */
#cgpt-list-panel{position:fixed; right:120px; bottom:140px; display:none; flex-direction:column; z-index:2147483646; width:360px; max-width:min(92vw,420px); max-height:min(62vh,680px); border:1px solid rgba(0,0,0,.12); border-radius:16px; background:rgba(255,255,255,.98); box-shadow:0 18px 56px rgba(0,0,0,.25); overflow:hidden; resize: horizontal; overflow: auto; min-width: 260px; max-width: 720px;}
#cgpt-list-panel.no-anim * {transition: none !important;}
#cgpt-list-head{display:flex; align-items:center; gap:8px; border-bottom:1px solid rgba(0,0,0,.1); padding:6px 10px; position:sticky; top:0; background:rgba(255,255,255,.98);}
#cgpt-list-close{all:unset; border:1px solid rgba(0,0,0,.12); border-radius:8px; padding:6px 8px;}
#cgpt-list-grip{height:12px; border-radius:10px; background:linear-gradient(90deg,#aaa 18%,#d0d0d0 50%,#aaa 82%); opacity:.6; cursor:grab; flex:1;}
#cgpt-list-grip.dragging .drag-handle {cursor: grabbing;}
#cgpt-list-body{flex:1; overflow:auto; padding:6px 8px;}
#cgpt-list-body .row {display:flex; align-items:stretch; gap:6px; line-height:1.7;}
#cgpt-list-body .row::before{content: ""; display:inline-block; min-width:2.0em; margin-right:8px; text-align:right; opacity:0; font-size:11px; line-height:inherit; vertical-align:middle;}
#cgpt-list-body .ops{display:flex; flex-direction: row; align-items: center; justify-content: flex-end; gap:4px; align-self: center;}
#cgpt-list-body .turn-idx-anchor::before{content: attr(data-idx); opacity:.75; color:#333; vertical-align:middle;}
#cgpt-list-body .txt{white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; cursor: pointer;}
#cgpt-list-body .txt:hover {background: skyblue;}
#cgpt-list-foot{display:flex; gap:8px; align-items:center; justify-content:flex-end; flex-wrap:wrap; padding:6px 8px; border-top:1px solid rgba(0,0,0,.08); color:#000;}
#cgpt-list-panel.collapsed {max-height: 38px;}
#cgpt-list-panel.collapsed #cgpt-list-body, #cgpt-list-panel.collapsed #cgpt-list-foot {display:none;}
#cgpt-list-collapse{all:unset; border:1px solid rgba(0,0,0,.12); border-radius:8px; padding:4px 8px; color:#000; display:inline-grid; place-items:center;}
#cgpt-list-panel .row .clip-dummy {visibility:hidden; pointer-events:none;}
#cgpt-list-panel .row .cgtn-clip-pin[aria-pressed="false"] {color:#979797;}
#cgpt-list-panel .row .cgtn-clip-pin[aria-pressed="true"] {color:#e60033;}
#cgpt-list-panel.pinonly .row:not([data-pin="1"]) {display: none !important;}
#cgpt-list-panel .row .attach {margin-left: .5em; opacity: .75; font-size: 0.92em; white-space: nowrap;}
#cgpt-list-panel .row.user-turn {background: #F2F5F8;}
#cgpt-list-panel .row.asst-turn {background: #F2FFF9;}
#cgpt-list-panel .row.user-turn:hover {background: #D9E2EB;}
#cgpt-list-panel .row.asst-turn:hover {background: #DDFFF0;}
#cgpt-chat-title {max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:center; font-weight:600; font-size:13px; opacity:.9; padding:1px 6px 0; line-height:1.2;}
.cgtn-preview-popup {position: absolute; background: #fff; border: 1px solid rgba(0,0,0,.15); border-radius: 6px; padding: 8px 10px; max-width: 320px; max-height: 240px; overflow: auto; box-shadow: 0 6px 24px rgba(0,0,0,.18); font-size: 12px; z-index: 2147483647; white-space: normal;}
.cgtn-preview-btn, .cgtn-clip-pin {all: unset; font-size: 12px; padding: 3px 5px;}
.cgtn-preview-btn:hover, .cgtn-clip-pin:hover {color: White; background: lightgray;}
.cgtn-popover {position: fixed; z-index: 2147483647 !important; max-width: 520px; max-height: 320px; padding: 10px 12px; border-radius: 10px; background: rgba(20,20,20,.96); color: #fff; box-shadow: 0 10px 28px rgba(0,0,0,.35); overflow: auto; display: none; font-size: 12px; line-height: 1.5; transform: translate(10px, 14px); white-space: pre-wrap; will-change: left, top, transform; pointer-events: none;}
.cgtn-popover[data-show="1"] {display: block;}
.cgtn-dock {position: absolute; z-index: 2147483647; width: 460px; max-width: 80vw; height: 300px; max-height: 80vh; background: #eceff3; color: #0b0d12; border: 1px solid #cfd6de; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.18); display: none; overflow: hidden; user-select: none;}
.cgtn-dock[data-show="1"] {display: block;}
.cgtn-dock-head {display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: #dfe5ec; border-bottom: 1px solid #cfd6de; cursor: move; font-weight: 600; color: #0b0d12;}
.cgtn-dock-title {font-weight: 600; font-size: 12px; opacity: .9;}
.cgtn-dock-close {margin-left: auto; border: none; background: transparent; color: #2c313a; cursor: pointer; font-size: 14px; opacity: .9;}
.cgtn-dock-body {height: calc(100% - 40px); overflow: auto; padding: 10px 12px; white-space: pre-wrap; user-select: text; line-height: 1.6; max-height: 60vh;}
.cgtn-dock-resize {position: absolute; right: 6px; bottom: 6px; width: 14px; height: 14px; cursor: nwse-resize; opacity: .7; color: #2c313a;}
#cgpt-list-filter {display:flex; gap:8px; padding:6px 8px; position:sticky; top:34px; z-index:1; background:rgba(255,255,255,.85); backdrop-filter:blur(4px); justify-content: center; align-items: center;}
#cgpt-list-filter label {user-select: none; cursor: pointer;}
#cgpt-list-filter label:has(input:checked) .cgtn-pill-btn {background:#222; color:#fff; border-color:#222;}
#cgpt-list-filter label:hover .cgtn-pill-btn {background: rgba(0,0,0,.06);}
#cgpt-list-filter input[type="radio"] {position:absolute; opacity:0; pointer-events:none; margin:0;}
.cgtn-badge {position: absolute; top: -4px; right: -4px; min-width: 14px; height: 14px; padding: 0 4px; border-radius: 999px; background: #e11; color: #fff; font-size: 10px; font-weight: 700; text-align: center; box-shadow: 0 0 0 2px #fff; display: flex; align-items: center; justify-content: center; line-height: 1;}
.cgtn-dock-body::-webkit-scrollbar, #cgpt-list-body::-webkit-scrollbar{width: 10px;}
.cgtn-dock-body::-webkit-scrollbar-track, #cgpt-list-body::-webkit-scrollbar-track{background: rgba(0,0,0,.05); border-radius: 10px;}
.cgtn-dock-body::-webkit-scrollbar-thumb, #cgpt-list-body::-webkit-scrollbar-thumb{background: rgba(0,0,0,.28); border-radius: 10px; border: 1px solid transparent; background-clip: padding-box;}
.cgtn-dock-body::-webkit-scrollbar-thumb:hover, #cgpt-list-body::-webkit-scrollbar-thumb:hover{background: rgba(0,0,0,.45);}
#cgpt-list-panel .cgtn-iconbtn {display: inline-flex; align-items: center; justify-content: center; padding: 0;}
#cgpt-list-body .cgtn-clip-pin svg.cgtn-pin-svg {width:16px; height:16px; display:block; stroke:currentColor; fill:none;}
#cgpt-list-body .cgtn-clip-pin.on svg.cgtn-pin-svg {fill:currentColor;}
  `;

  const injectCss = (css) => {
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  };
  injectCss(ALL_CSS);

  /* ==========================================================================
     installUI
     ========================================================================== */
  function installUI() {
    if (document.getElementById("cgpt-nav")) return;

    const box = document.createElement("div");
    box.id = "cgpt-nav";

    box.innerHTML = `
      <div class="cgtn-unified-header" id="cgpt-drag" title="${T("headerDrag")}">
        <div class="cgtn-header-top">
          <div class="cgtn-brand-group">
            <div class="cgtn-title-main">Turn</div>
            <div class="cgtn-title-sub">Navigator</div>
          </div>
          <div class="cgtn-ver">v...</div>
        </div>
        <div class="cgtn-header-bottom">
          <label class="cgtn-power-wrapper">
             <input id="cgtn-power-toggle" type="checkbox">
             <span class="slider"></span>
          </label>
          <div class="digital-screen" id="cgtn-status-monitor">
            <span class="off-text">OFF</span>
          </div>
        </div>
      </div>

      <div class="cgtn-body">
        
        <div class="cgpt-nav-group" data-role="user">
          <div class="cgpt-nav-label" data-i18n="user">User</div>
          <button class="cgtn-pill-btn" data-act="top" data-i18n="top">Top</button>
          <div class="cgpt-grid2">
             <button class="cgtn-pill-btn" data-act="prev" data-i18n="prev">Prev</button>
             <button class="cgtn-pill-btn" data-act="next" data-i18n="next">Next</button>
          </div>
          <button class="cgtn-pill-btn" data-act="bottom" data-i18n="bottom">End</button>
        </div>

        <div class="cgpt-nav-group" data-role="assistant">
          <div class="cgpt-nav-label" data-i18n="assistant">AI</div>
          <button class="cgtn-pill-btn" data-act="top" data-i18n="top">Top</button>
          <div class="cgpt-grid2">
             <button class="cgtn-pill-btn" data-act="prev" data-i18n="prev">Prev</button>
             <button class="cgtn-pill-btn" data-act="next" data-i18n="next">Next</button>
          </div>
          <button class="cgtn-pill-btn" data-act="bottom" data-i18n="bottom">End</button>
        </div>

        <div class="cgpt-nav-group" data-role="all">
          <div class="cgpt-nav-label" data-i18n="all">All</div>
          <div class="cgpt-grid2">
            <button class="cgtn-pill-btn" data-act="top">▲</button>
            <button class="cgtn-pill-btn" data-act="bottom">▼</button>
          </div>
        </div>

        <div class="cgpt-nav-group" data-role="tools">
          <div class="cgpt-nav-label" data-i18n="tools">Tool</div>
          <button id="cgpt-list-btn" class="cgtn-pill-btn" data-i18n="list">List</button>
        </div>

        <div class="cgpt-nav-group" data-role="others">
          <div class="cgpt-nav-label" data-i18n="others">Other</div>
          <button id="cgpt-navi-refresh" class="cgtn-pill-btn" data-i18n="refresh">Refresh</button>
          <button id="cgtn-open-settings" class="cgtn-pill-btn" data-i18n="settings">Settings</button>
          <button id="cgpt-lang-btn" class="cgtn-pill-btn" data-i18n="langBtn">EN/JP</button>
        </div>

        <input id="cgpt-viz" type="checkbox" style="display:none">
        <input id="cgpt-list-toggle" type="checkbox" style="display:none">

      </div>`;

    document.body.appendChild(box);

    // バージョン取得
    try {
      const mf = chrome.runtime.getManifest();
      const v = box.querySelector(".cgtn-ver");
      if (v) v.textContent = "v" + (mf.version || "1.0");
    } catch {}

    // Power Toggle
    const cb = box.querySelector("#cgtn-power-toggle");
    if (cb instanceof HTMLInputElement) {
      const idle = (window as any).CGTN_APP?.isIdle?.() ?? false;
      cb.checked = !idle;
      setIdleMode(!!idle);

      cb.addEventListener("change", () => {
        if (cb.checked) {
          (window as any).CGTN_APP?.start?.("ui-power-on");
        } else {
          (window as any).CGTN_APP?.stop?.("ui-power-off");
        }
      });
    }

    // ドラッグ機能
    setupDrag(box);

    // 言語設定反映
    applyLang();

    // 既存設定の反映
    const viz = box.querySelector("#cgpt-viz");
    if (viz instanceof HTMLInputElement) viz.checked = !!SH.getCFG().showViz;

    const listChk = box.querySelector("#cgpt-list-toggle");
    const listBtn = box.querySelector("#cgpt-list-btn");

    if (listChk instanceof HTMLInputElement) {
      listChk.checked = !!SH.getCFG().list?.enabled;
      if (listBtn && listChk.checked) listBtn.classList.add("active");
    }

    // --- イベントリスナー ---
    if (listBtn && listChk instanceof HTMLInputElement) {
      listBtn.addEventListener("click", () => {
        listChk.checked = !listChk.checked;
        listBtn.classList.toggle("active", listChk.checked);
        listChk.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    const langBtn = box.querySelector("#cgpt-lang-btn");
    if (langBtn) {
      langBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleLang();
      });
    }

    const settingsBtn = box.querySelector("#cgtn-open-settings");
    if (settingsBtn) {
      settingsBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        window.CGTN_UI.openSettingsModal?.();
      });
    }

    const refreshBtn = box.querySelector("#cgpt-navi-refresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          LG.rebuild?.();
          if (SH.isListOpen?.()) LG.renderList?.(true);
        } catch (e) {
          console.warn(e);
        }
      });
    }

    // ツールチップ
    window.CGTN_SHARED?.applyTooltips?.(
      {
        '#cgpt-nav [data-role="user"] [data-act="top"]': "nav.top",
        '#cgpt-nav [data-role="user"] [data-act="bottom"]': "nav.bottom",
        '#cgpt-nav [data-role="user"] [data-act="prev"]': "nav.prev",
        '#cgpt-nav [data-role="user"] [data-act="next"]': "nav.next",
        '#cgpt-nav [data-role="assistant"] [data-act="top"]': "nav.top",
        '#cgpt-nav [data-role="assistant"] [data-act="bottom"]': "nav.bottom",
        '#cgpt-nav [data-role="assistant"] [data-act="prev"]': "nav.prev",
        '#cgpt-nav [data-role="assistant"] [data-act="next"]': "nav.next",
        "#cgpt-lang-btn": "nav.lang",
        "#cgpt-list-btn": "nav.list",
        "#cgpt-navi-refresh": "nav.refresh",
        "#cgtn-open-settings": "nav.openSettings",
      },
      document,
    );
  }

  // --- ヘルパー関数群 ---
  function toggleLang() {
    const cur = (SH.getCFG?.() || {}).lang || "ja";
    const next =
      cur && String(cur).toLowerCase().startsWith("en") ? "ja" : "en";

    try {
      SH.saveSettingsPatch?.({ lang: next });
      if (window.CGTN_I18N) window.CGTN_I18N._forceLang = next;
    } catch (e) {}

    applyLang();
    SH.updateTooltips?.();

    if (
      window.CGTN_LOGIC?.isListVisible?.() ||
      !!window.CGTN_SHARED?.getCFG?.()?.list?.pinOnly
    ) {
      window.CGTN_LOGIC.renderList(true);
    }
  }

  function applyLang() {
    const box = document.getElementById("cgpt-nav");
    if (!box) return;

    box.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const txt = T(key);
      if (key && txt) {
        el.textContent = txt;
        if (el instanceof HTMLElement) {
          el.title = txt;
        }
      }
    });

    const dragHeader = box.querySelector("#cgpt-drag");
    if (dragHeader instanceof HTMLElement) dragHeader.title = T("headerDrag");

    const cb = box.querySelector("#cgtn-power-toggle");
    if (cb instanceof HTMLInputElement) updateSwitchTooltip(cb);
  }

  function updateSwitchTooltip(cb) {
    if (!cb) return;
    const label = cb.parentElement;
    if (label) {
      label.title = cb.checked ? T("tipOff") : T("tipOn");
    }
  }

  // ★修正: テキストをそのまま表示 (Loading.. や 999/999 対応)
  NS.updateStatusDisplay = (text, subLabel) => {
    const screen = document.getElementById("cgtn-status-monitor");
    if (!screen) return;
    const cb = document.getElementById(
      "cgtn-power-toggle",
    ) as HTMLInputElement | null;
    if (cb && !cb.checked) return;

    // Loading... の場合はクラスを付けて少し小さくするなどの調整も可能
    const isLong = text.length > 8;
    const cls = isLong ? "screen-value loading" : "screen-value";
    screen.innerHTML = `<div class="${cls}">${text}</div>`;
  };

  function setIdleMode(idle) {
    const box = document.getElementById("cgpt-nav");
    if (!box) return;

    box.classList.toggle("cgtn-idle", !!idle);
    const cb = box.querySelector(
      "#cgtn-power-toggle",
    ) as HTMLInputElement | null;
    if (cb) {
      cb.checked = !idle;
      updateSwitchTooltip(cb);
    }

    const screen = document.getElementById("cgtn-status-monitor");
    if (screen) {
      if (idle) {
        screen.innerHTML = `<span class="off-text">OFF</span>`;
      } else {
        screen.innerHTML = `<div class="screen-value" style="color:#aaa">READY</div>`;
      }
    }
  }

  function setupDrag(box) {
    const grip = box.querySelector("#cgpt-drag");
    if (!grip) return;
    let dragging = false,
      offX = 0,
      offY = 0;

    grip.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest(".cgtn-power-wrapper")) {
        return;
      }

      dragging = true;
      const r = box.getBoundingClientRect();
      offX = e.clientX - r.left;
      offY = e.clientY - r.top;
      try {
        (grip as Element).setPointerCapture(e.pointerId);
      } catch {}
    });
    window.addEventListener(
      "pointermove",
      (e) => {
        if (!dragging) return;
        box.style.left = e.clientX - offX + "px";
        box.style.top = e.clientY - offY + "px";
      },
      { passive: true },
    );
    window.addEventListener("pointerup", (e) => {
      if (!dragging) return;
      dragging = false;
      try {
        (grip as Element).releasePointerCapture(e.pointerId);
      } catch {}
      clampPanelWithinViewport();
      SH.saveSettingsPatch({
        panel: {
          x: box.getBoundingClientRect().left,
          y: box.getBoundingClientRect().top,
        },
      });
    });
  }

  function clampPanelWithinViewport() {
    const box = document.getElementById("cgpt-nav");
    if (!box) return;
    const margin = 8;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const r = box.getBoundingClientRect();
    box.style.right = "auto";
    box.style.bottom = "auto";
    let x = Number.isFinite(r.left) ? r.left : vw - r.width - 12;
    let y = Number.isFinite(r.top) ? r.top : vh - r.height - 140;
    x = Math.min(vw - r.width - margin, Math.max(margin, x));
    y = Math.min(vh - r.height - margin, Math.max(margin, y));
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
  }

  // 公開API
  NS.installUI = installUI;
  NS.clampPanelWithinViewport = clampPanelWithinViewport;
  NS.applyLang = applyLang;
  NS.toggleLang = toggleLang;
  NS.setIdleMode = setIdleMode;
  NS.updateStatusDisplay = NS.updateStatusDisplay;

  document.addEventListener("DOMContentLoaded", applyLang);
})();
