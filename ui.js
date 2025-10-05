// ui.js — パネルUI生成 / 言語 / 位置クランプ
(() => {
  const SH = window.CGTN_SHARED;
  const NS = (window.CGTN_UI = window.CGTN_UI || {});

  const I18N = {
    ja: { user:'ユーザー', assistant:'アシスタント', all:'全体', top:'先頭', prev:'前へ', next:'次へ', bottom:'末尾', langBtn:'English', dragTitle:'ドラッグで移動', line:'基準線', list:'一覧' },
    en: { user:'User', assistant:'Assistant', all:'All', top:'Top', prev:'Prev', next:'Next', bottom:'Bottom', langBtn:'日本語', dragTitle:'Drag to move', line:'Guide', list:'List' }
  };

  // 初期言語をブラウザの設定から決める
  let LANG = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  // いつでも <html lang> を真とする（fallback は LANG）
  document.documentElement.lang = LANG;
//  SH.setLangResolver?.(() => LANG);
  SH.setLangResolver?.(SH.getLang);
  SH.getLang = () => LANG;

  // ★ curLang() がこれを拾えるように resolver にも設定
  SH.setLangResolver?.(SH.getLang);

  //付箋上にあるときのマウスポインタ＾
  const pinCurURL = chrome.runtime.getURL('assets/fpointer_32.cur');

  function injectCss(css){
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function _L(){ return (window.CGTN_SHARED?.getLang?.() || '').toLowerCase().startsWith('en') ? 'en':'ja'; }
  function tPreview(){ return _L()==='en' ? 'Preview' : 'プレビュー'; }
  function tAttachments(){ return _L()==='en' ? 'Attachments' : '添付'; }
  function tPinOnly(){ return _L()==='en' ? 'Pins only' : '付箋のみ'; }
  function tShowAll(){ return _L()==='en' ? 'Show all' : 'すべて表示'; }

  // 最低限の見た目（以前のCSSを凝縮）
  const BASE_CSS = `
  #cgpt-nav{position:fixed;right:12px;bottom:140px;display:flex;flex-direction:column;gap:12px;z-index:2147483647}
  .cgpt-nav-group{width:92px;border-radius:14px;padding:10px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.95);box-shadow:0 6px 24px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:6px}
  .cgpt-nav-label{text-align:center;font-weight:600;opacity:.9;margin-bottom:2px;font-size:12px;color:#000}
  #cgpt-nav button{all:unset;height:34px;border-radius:10px;font:12px/1.1 system-ui,-apple-system,sans-serif;display:grid;place-items:center;cursor:pointer;background:#f2f2f7;color:#111;border:1px solid rgba(0,0,0,.08)}
  #cgpt-nav button:hover{background:#fff}
  .cgpt-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  #cgpt-nav .cgpt-lang-btn{height:28px;margin-top:4px;color:#000}
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
  #cgpt-list-close{all:unset;border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:6px 8px;cursor:pointer}
  #cgpt-list-body{overflow:auto;padding:6px 8px}
  #cgpt-list-body .row{display:flex;gap:8px;align-items:center;padding:8px 6px;border-bottom:1px dashed rgba(0,0,0,.08);cursor:pointer}
  #cgpt-list-body .row:hover{background:rgba(0,0,0,.04)}
  #cgpt-list-body .txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
  #cgpt-bias-line,#cgpt-bias-band{pointer-events:none!important}
  .cgpt-nav-group[data-role="user"]{ background:rgba(240,246,255,.96); }
  .cgpt-nav-group[data-role="assistant"]{ background:rgba(234,255,245,.96); }
  .cgpt-nav-group button{box-shadow:0 6px 24px;}

#cgpt-list-grip{height:12px;border-radius:10px;background:linear-gradient(90deg,#aaa 18%,#d0d0d0 50%,#aaa 82%);opacity:.6;cursor:grab;flex:1}
#cgpt-list-grip.dragging .drag-handle { cursor: grabbing; }

#cgpt-drag{width:92px;height:12px;border-radius:10px;background:linear-gradient(90deg,#aaa 18%,#d0d0d0 50%,#aaa 82%);opacity:.55;cursor:grab;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
#cgpt-drag.dragging .drag-handle { cursor: grabbing; }

#cgpt-list-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 8px;border-top:1px solid rgba(0,0,0,.08)}
/* パネルは縦フレックスで head / body / foot を上下に配置 */
#cgpt-list-head{
  display:flex; align-items:center; gap:8px;
  border-bottom:1px solid rgba(0,0,0,.1); padding:6px 10px;
}

/* 畳む/開くボタン */
#cgpt-list-collapse{
  all:unset; border:1px solid rgba(0,0,0,.12); border-radius:8px;color:#000;
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
#cgpt-list-close{all:unset;border:1px solid rgba(0,0,0,.12);border-radius:8px;cursor:pointer;}
#cgpt-list-collapse{all:unset;border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:4px 8px;cursor:pointer;}

/* 1ターン1個の付箋：ダミー枠は幅だけ確保（table風の見た目） */
#cgpt-list-panel .row .clip-dummy { visibility:hidden; pointer-events:none; }
#cgpt-list-panel .row .cgtn-clip-pin[aria-pressed="false"] { color:#979797; }
#cgpt-list-panel .row .cgtn-clip-pin[aria-pressed="true"]  { color:#e60033; }
#cgpt-list-panel .row .cgtn-clip-pin { cursor:pointer; }
#cgpt-list-panel .row .cgtn-clip-pin:hover { filter:brightness(1.1); }

/* === マウス操作時のフォーカス枠を消す（キーボード操作の :focus-visible は維持） === */
#cgpt-nav button:focus,
#cgpt-nav label:focus,
#cgpt-list-panel button:focus,
#cgpt-list-panel label:focus {
  outline: none !important;
  box-shadow: none !important;
}
#cgpt-nav button:focus-visible,
#cgpt-list-panel button:focus-visible {
  outline: 2px solid rgba(0,0,0,.25);
  outline-offset: 2px;
}

/* マウス操作時のフォーカス枠を確実に消す（キーボードの :focus-visible は残す） */
#cgpt-nav :where(button,label,input[type=checkbox]):focus:not(:focus-visible),
#cgpt-list-panel :where(button,label,input[type=checkbox]):focus:not(:focus-visible) {
  outline: none !important;
  box-shadow: none !important;
}

/* 付箋クリック領域の専用カーソル（ON=赤 / OFF=赤） */
.cgtn-cursor-pin{
  cursor: url("${pinCurURL}"), pointer;
}
.cgtn-cursor-pin.off{
  cursor: url("${pinCurURL}"), pointer;
}

/* 行の本文は従来どおり“指” */
#cgpt-list-body .row { cursor: pointer; }

/* === 付箋カーソルを最優先で適用（!important で上書き） === */
#cgpt-list-body .row .cgtn-clip-pin.cgtn-cursor-pin {
  cursor: url("${pinCurURL}"), pointer !important;
}
#cgpt-list-body .row .cgtn-clip-pin.cgtn-cursor-pin.off {
  cursor: url("${pinCurURL}"), pointer !important;
}

/* === プレビュー吹き出し === */
.cgtn-preview-popup {
  position: absolute;
  background: #fff;
  border: 1px solid rgba(0,0,0,.15);
  border-radius: 6px;
  padding: 8px 10px;
  max-width: 320px;
  max-height: 240px;
  overflow: auto;
  box-shadow: 0 6px 24px rgba(0,0,0,.18);
  font-size: 12px;
  z-index: 2147483647;
  white-space: normal;
}
.cgtn-preview-btn {
  all: unset;
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  color: #555;
}
.cgtn-preview-btn:hover {
  color: #FFF;
  background: rgba(21,21,21,21);
}

/* === プレビュー吹き出し（追加） === */
.cgtn-popover {
  position: fixed;
  z-index: 2147483647 !important;  /* ほぼ最大。モーダルより前面へ */
  max-width: 520px;
  max-height: 320px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(20,20,20,.96);
  color: #fff;
  box-shadow: 0 10px 28px rgba(0,0,0,.35);
  overflow: auto;
  display: none;
  font-size: 12px;
  line-height: 1.5;
  transform: translate(10px, 14px); /* マウスから少し離す */
  white-space: pre-wrap; /* 改行を保持しつつ折り返し */
  will-change: left, top, transform; /* 位置追従を滑らかに */
  pointer-events: none;              /* ホバー中にポップに引っかからない */
}
.cgtn-popover[data-show="1"] { display: block; }

.cgtn-more {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 14px;
}
.cgtn-more:hover { background: rgba(255,255,255,.08); }

/* === 常駐プレビュー・ドック === */
.cgtn-dock {
  position: absolute;
  z-index: 2147483647 !important;
  width: 460px;
  max-width: 80vw;
  height: 300px;
  max-height: 80vh;
  background: rgba(20,20,20,.96);
  color: #fff;
  box-shadow: 0 10px 28px rgba(0,0,0,.35);
  border-radius: 10px;
  display: none;                /* クリックで表示に切り替え */
  overflow: hidden;             /* ヘッダー/ボディを内側で制御 */
  user-select: none;
}

.cgtn-dock[data-show="1"] { display: block; }

.cgtn-dock-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255,255,255,.08);
  cursor: move;                 /* ドラッグで移動 */
}
.cgtn-dock-title { font-weight: 600; font-size: 12px; opacity: .9; }
.cgtn-dock-close {
  margin-left: auto;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}

.cgtn-dock-body {
  height: calc(100% - 40px);    /* だいたいヘッダー分 */
  overflow: auto;
  padding: 10px 12px;
  white-space: pre-wrap;         /* 改行保持しつつ折返し */
  user-select: text;             /* 本文は選択可 */
}

/* 右下リサイズグリップ */
.cgtn-dock-resize {
  position: absolute;
  right: 6px; bottom: 6px;
  width: 14px; height: 14px;
  cursor: nwse-resize;
  opacity: .7;
}

/* 固定中の視覚フィードバック（任意） */
.cgtn-dock[data-pinned="1"] .cgtn-dock-head {
  background: rgba(255,255,255,.16);
}

/*リストを最新にする*/
#cgpt-list-refresh.cgtn-mini-btn{
  all: unset;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
#cgpt-list-refresh.cgtn-mini-btn:hover{
  background: rgba(0,0,0,.08);
}

/* リストパネル内の行（ライト読みやすさ重視） */
#cgpt-list-panel .row{
  background: #fafafa;     /* 真っ白よりわずかに落とす */
  color: #0b0d12;
}

/* 交互やホバーがあれば微差で */
#cgpt-list-panel .row:hover{
  background:#f2f5f8;
}

/* プレビュー本体 */
.cgtn-dock{
  /* ライト基調（少し濃いめのグレー） */
  background: #eceff3;              /* ← 前より一段濃く */
  color: #0b0d12;                   /* ほぼ黒 */
  border: 1px solid #cfd6de;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08);
  backdrop-filter: none;             /* 透過系を無効化（にじみ防止） */
}

/* タイトルバー：つまみ色に合わせる（少し濃いめ） */
.cgtn-dock .cgtn-dock-head{
  background: #dfe5ec;              /* つまみと同系でワントーン濃く */
  color: #0b0d12;
  font-weight: 600;
  padding: 6px 8px;
  border-bottom: 1px solid #cfd6de;
}

/* 本文とスクロール */
.cgtn-dock .cgtn-dock-body{
  padding: 10px 12px;
  line-height: 1.6;
  overflow: auto;
  max-height: 60vh;
}

/* 閉じる/リサイズアイコン */
.cgtn-dock .cgtn-dock-close,
.cgtn-dock .cgtn-dock-resize{
  color: #2c313a;
  opacity: .9;
}
.cgtn-dock .cgtn-dock-close:hover,
.cgtn-dock .cgtn-dock-resize:hover{
  opacity: 1;
}

/* トグルラベルの文字色を黒固定 */
.cgpt-viz-toggle span[data-i18n="line"] {
  color: #000;
}
.cgpt-list-toggle span[data-i18n="list"] {
  color: #000;
}
#cgpt-list-foot,      /* リストパネルのフッタ */
#cgpt-list-refresh,   /* 最新にする */
#cgpt-pin-filter,     /* 畳む/開くボタン */
#cgpt-list-collapse { /* 付箋フィルターボタン */
  color:#000
}

/* リスト本体のスクロールバー */
.cgtn-dock-body::-webkit-scrollbar,
#cgpt-list-body::-webkit-scrollbar{
  width: 10px;
}
.cgtn-dock-body::-webkit-scrollbar,
#cgpt-list-body::-webkit-scrollbar-track{
  background: rgba(0,0,0,.05);
  border-radius: 10px;
}
.cgtn-dock-body::-webkit-scrollbar,
#cgpt-list-body::-webkit-scrollbar-thumb{
  background: rgba(0,0,0,.28);
  border-radius: 10px;
  border: 1px solid transparent; /* ちょい細く見せる */
  background-clip: padding-box;
}
.cgtn-dock-body::-webkit-scrollbar,
#cgpt-list-body::-webkit-scrollbar-thumb:hover{
  background: rgba(0,0,0,.45);
}

/* ナビボタンに軽い立体感をつける */
#cgpt-nav .cgpt-nav-group > button{
  background: #fff;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 14px;
  box-shadow: 0 4px 14px rgba(0,0,0,.12);
}

/* 押下中の沈み込み */
#cgpt-nav .cgpt-nav-group > button:active{
  box-shadow: 0 2px 8px rgba(0,0,0,.18) inset, 0 2px 8px rgba(0,0,0,.08);
}

/* ダーク時だけ少し強め（必要なら） */
@media (prefers-color-scheme: dark){
  #cgpt-nav .cgpt-nav-group > button{
    background: #1d1f23;
    border-color: rgba(255,255,255,.06);
    box-shadow: 0 6px 18px rgba(0,0,0,.35);
    color: #e8eaed;
  }
}

/* ダーク環境でも読める最低限（影は弱めに） */
@media (prefers-color-scheme: dark){
  .cgtn-dock{
    background: #1e2126;
    color: #eef2f6;
    border-color: #313842;
    box-shadow: 0 8px 20px rgba(0,0,0,.35);  /* ダークで影が消えやすいので少し残す */
  }
  .cgtn-dock .cgtn-dock-head{
    background:#2a2f36;
    color:#eef2f6;
    border-bottom-color:#313842;
  }
  .cgtn-dock .cgtn-dock-close,
  .cgtn-dock .cgtn-dock-resize{
    color:#cfd8e3;
  }
}

  `;
  injectCss(BASE_CSS);

/*ｺｺｶﾗ*/
// いちばん最後に差すフォーカス無効CSS（:focus-visible は保持）
(function injectFocusKillerCss(){
  if (document.getElementById('cgtn-focus-css')) return;
  const s = document.createElement('style');
  s.id = 'cgtn-focus-css';
  s.textContent = `
#cgpt-nav :where(button,label,input[type=checkbox]):focus:not(:focus-visible),
#cgpt-list-panel :where(button,label,input[type=checkbox]):focus:not(:focus-visible){
  outline: none !important;
  box-shadow: none !important;
}
#cgpt-nav :where(button,label,input[type=checkbox])::-moz-focus-inner,
#cgpt-list-panel :where(button,label,input[type=checkbox])::-moz-focus-inner{
  border:0 !important;
}
  `;
  document.head.appendChild(s);
})();
/*ｺｺﾏﾃﾞ*/

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
        <!-- ※ ナビ側「付箋のみ」は完全削除 -->
      </div>
    `;
    document.body.appendChild(box);

    // 言語リゾルバ（tooltipsの言語切替に使用）
    window.CGTN_SHARED?.setLangResolver?.(() =>
      window.CGTN_UI?.getLang?.()
      || (window.CGTN_SHARED?.getCFG?.()?.lang || (window.CGTN_SHARED?.getCFG?.()?.english ? 'en' : 'ja'))
    );

    // ドラッグ移動（保存は shared 側）
    (function enableDragging(){
      const grip = box.querySelector('#cgpt-drag');
      let dragging=false, offX=0, offY=0;
      grip.addEventListener('pointerdown',e=>{
        dragging=true; const r=box.getBoundingClientRect();
        offX=e.clientX-r.left; offY=e.clientY-r.top;
        try{ grip.setPointerCapture(e.pointerId); }catch{}
      });
      window.addEventListener('pointermove',e=>{
        if(!dragging) return;
        box.style.left=(e.clientX-offX)+'px';
        box.style.top =(e.clientY-offY)+'px';
      },{passive:true});
      window.addEventListener('pointerup',e=>{
        if(!dragging) return;
        dragging=false;
        try{ grip.releasePointerCapture(e.pointerId); }catch{}
        clampPanelWithinViewport();
        const r=box.getBoundingClientRect();
        SH.saveSettingsPatch({ panel:{ x:r.left, y:r.top } });
      });
    })();

    // 初期表示：文言と保存状態
    applyLang();
    try { box.querySelector('#cgpt-viz').checked = !!SH.getCFG().showViz; } catch {}

    // クリックでフォーカスを残さない（ボタン/ラベル/チェックボックス対象）
    (function suppressMouseFocusInNav(){
      const root = document.getElementById('cgpt-nav');
      if (!root || root._cgtnNoMouseFocus) return;
      root._cgtnNoMouseFocus = true;

      root.addEventListener('mousedown', (e) => {
        const t = e.target.closest('button, label, input[type=checkbox]');
        if (t) e.preventDefault();
      }, { passive: false });

      root.addEventListener('click', (e) => {
        const t = e.target.closest('button, label, input[type=checkbox]');
        if (t && t.blur) t.blur();
      }, { passive: true });
    })();

    // クリック後のフォーカス残りを軽減（念押し）
    box.addEventListener('mouseup', () => {
      try {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      } catch {}
    }, {capture:true});

    // === チェック群の初期反映とイベント ===
    try {
      const cfg = SH.getCFG() || {};
      const listChk = box.querySelector('#cgpt-list-toggle');

      listChk.checked = !!cfg.list?.enabled;

      // 一覧トグル：保存 → 表示切替
      listChk.addEventListener('change', () => {
        const on  = listChk.checked;
        const cur = SH.getCFG() || {};
        const patch = on
          ? { list:{ ...(cur.list||{}), enabled:true } }
          : { list:{ ...(cur.list||{}), enabled:false, pinOnly:false } };
        SH.saveSettingsPatch(patch);
        window.CGTN_LOGIC?.setListEnabled?.(on);
        // フォーカスを外して“カーソル残り”を防ぐ ★★★★
        try{ listChk.blur(); }catch{}
      });
    } catch {}

    // 既定値反映（復唱：念のため）
    try {
      box.querySelector('#cgpt-viz').checked  = !!SH.getCFG().showViz;
      box.querySelector('#cgpt-list-toggle').checked = !!(SH.getCFG().list?.enabled);
    } catch {}

    window.CGTN_SHARED?.applyTooltips?.({
      '#cgpt-nav [data-role="user"]      [data-act="top"]'    : 'nav.top',
      '#cgpt-nav [data-role="user"]      [data-act="bottom"]' : 'nav.bottom',
      '#cgpt-nav [data-role="user"]      [data-act="prev"]'   : 'nav.prev',
      '#cgpt-nav [data-role="user"]      [data-act="next"]'   : 'nav.next',
      '#cgpt-nav [data-role="assistant"] [data-act="top"]'    : 'nav.top',
      '#cgpt-nav [data-role="assistant"] [data-act="bottom"]' : 'nav.bottom',
      '#cgpt-nav [data-role="assistant"] [data-act="prev"]'   : 'nav.prev',
      '#cgpt-nav [data-role="assistant"] [data-act="next"]'   : 'nav.next',
      '#cgpt-drag'               : 'nav.drag',
      '#cgpt-nav .cgpt-lang-btn' : 'nav.lang',
      '#cgpt-viz'                : 'nav.viz',
      '#cgpt-list-toggle'        : 'nav.list'
    }, document);

/*ｺｺｶﾗ*/
    // === フォーカスが残らない最終防御（モダリティ + パーキング） ===
    (function enforceNoFocusNav(){
      const root = document.getElementById('cgpt-nav');
      if (!root || root._cgtnFocusGuard) return;
      root._cgtnFocusGuard = true;

      // 直近入力モダリティを覚える（キーボード:true / ポインタ:false）
      let lastWasKeyboard = false;
      window.addEventListener('keydown',  () => { lastWasKeyboard = true;  }, {capture:true});
      window.addEventListener('pointerdown', () => { lastWasKeyboard = false; }, {capture:true});

      // フォーカスの逃がし先（画面外・不可視）
      let park = document.getElementById('cgtn-focus-park');
      if (!park) {
        park = document.createElement('button');
        park.id = 'cgtn-focus-park';
        park.type = 'button';
        park.tabIndex = -1;
        park.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none;';
        document.body.appendChild(park);
      }

      const INTERACTIVE = 'button, label, input[type=checkbox]';

      // マウス系で root 内に focusin したら即座に追い出す
      root.addEventListener('focusin', (e) => {
        const t = e.target && e.target.closest(INTERACTIVE);
        if (t && !lastWasKeyboard) {
          // クリック・ドラッグ等で入ったフォーカスは排除
          try { t.blur(); } catch {}
          try { park.focus({ preventScroll:true }); } catch {}
        }
      }, true); // ← capture

      // 念押し：マウスアップで常にパークへ
      root.addEventListener('mouseup', () => {
        try {
          // activeElement がまだ残ってたらパーキングに移す
          if (document.activeElement && root.contains(document.activeElement)) {
            park.focus({ preventScroll:true });
          }
        } catch {}
      }, { capture:true });
    })();
/*ｺｺﾏﾃﾞ*/

  }

  function applyLang(){
    const box = document.getElementById('cgpt-nav');
    if (!box) return;
    const t = I18N[LANG] || I18N.ja;
    // ラベルは text だけ更新
    box.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (t[k]){
        el.textContent = t[k]; 
        el.title = t[k]; 
       }
    });
    box.querySelector('.cgpt-lang-btn').textContent = t.langBtn;

    // ドラッグも I18N で title を直付け
    const drag = box.querySelector('#cgpt-drag');
    if (drag) drag.title = t.dragTitle || t.drag || '';

  }

  function toggleLang(){
    LANG = LANG === 'ja' ? 'en' : 'ja';
//console.log("★ui 日英切り替えクリックしました:LANG",LANG);
    applyLang();
    // リストパネルフッタ更新
    window.CGTN_LOGIC?.updateListFooterInfo();

    // 共有設定に保存（options 画面でも拾える）
    try { window.CGTN_SHARED?.saveSettingsPatch?.({ lang: LANG }); } catch {}
    //切替時に登録済みツールチップを一括再翻訳
    window.CGTN_SHARED?.updateTooltips?.();
  }

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
