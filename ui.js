// ui.js — パネルUI生成 / 言語 / 位置クランプ
(() => {
  'use strict';

  const NS = (window.CGTN_UI = window.CGTN_UI || {});
  const SH = window.CGTN_SHARED || {};
  const LG = window.CGTN_LOGIC || {};
  const T  = (k)=> window.CGTN_I18N?.t?.(k) || k;

  // 初期言語をブラウザの設定から決める
  let LANG = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  // いつでも <html lang> を真とする（fallback は LANG）
  document.documentElement.lang = LANG;

  // 外部から現在言語を取得できるように公開
  NS.getLang = () => LANG;
  SH.getLang = () => LANG;
  SH.setLangResolver?.(SH.getLang);   // shared.js 側の言語解決に供給

  // ★ curLang() がこれを拾えるように resolver にも設定
  SH.setLangResolver?.(SH.getLang);

// === Cursor assets ===
const pinCurURL = chrome.runtime.getURL('assets/cursor_pin.cur');
const prvCurURL = chrome.runtime.getURL('assets/cursor_preview.cur');


// CSS変数（ここだけはJSで注入）
(function injectRuntimeVars(){
  const s = document.createElement('style');
  s.textContent = `
    #cgpt-root{
      --accent: #003a9b;
      --danger: #e60033;
      --pin-cur: url("${pinCurURL}");
      --prv-cur: url("${prvCurURL}");
    }
  `;
  document.head.appendChild(s);
})();

async function injectCssFile(path){
  const url = chrome.runtime.getURL(path);
  const css = await fetch(url).then(r => r.text());
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}

(async function injectAllCss(){
  // 順序が大事：NAV → LIST → PREVIEW → MISC
  await injectCssFile('styles/nav.css');
  await injectCssFile('styles/list.css');
  await injectCssFile('styles/preview.css');
  await injectCssFile('styles/misc.css');
})();


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

      <!-- === ユーザー === -->
      <div class="cgpt-nav-group" data-role="user">
        <div class="cgpt-nav-label" data-i18n="user"></div>
        <button data-act="top" data-i18n="top"></button>
        <button data-act="prev" data-i18n="prev"></button>
        <button data-act="next" data-i18n="next"></button>
        <button data-act="bottom" data-i18n="bottom"></button>
      </div>

      <!-- === アシスタント === -->
      <div class="cgpt-nav-group" data-role="assistant">
        <div class="cgpt-nav-label" data-i18n="assistant"></div>
        <button data-act="top" data-i18n="top"></button>
        <button data-act="prev" data-i18n="prev"></button>
        <button data-act="next" data-i18n="next"></button>
        <button data-act="bottom" data-i18n="bottom"></button>
      </div>

      <!-- === 全体ナビ + 設定 === -->
      <div class="cgpt-nav-group" data-role="all">
        <div class="cgpt-nav-label" data-i18n="all"></div>

        <div class="cgpt-grid2">
          <button data-act="top">▲</button>
          <button data-act="bottom">▼</button>
        </div>

        <!-- 言語切替 -->
        <button class="cgpt-lang-btn"></button>

        <!-- 基準線トグル（非表示） -->
        <label class="cgpt-viz-toggle" style="display:none !important;">
          <input id="cgpt-viz" type="checkbox" style="accent-color:#888;">
          <span data-i18n="line"></span>
        </label>

        <!-- 一覧表示 -->
        <label class="cgpt-list-toggle">
          <input id="cgpt-list-toggle" type="checkbox" style="accent-color:#888;">
          <span data-i18n="list"></span>
        </label>

        <!-- 設定ボタン -->
        <button id="cgtn-open-settings" class="cgtn-open-settings" title="設定を開く">⚙</button>
      </div>
    `;


    document.body.appendChild(box);
console.debug('appendChild[nav:init] before-restore', {
  style: nav.getAttribute('style'),
  rect: nav.getBoundingClientRect()
});

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
      '#cgpt-list-toggle'        : 'nav.list',
      '#cgtn-open-settings'      : 'nav.openSettings'
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
        const el = e.target && e.target.closest(INTERACTIVE);
        if (el && !lastWasKeyboard) {
          // クリック・ドラッグ等で入ったフォーカスは排除
          try { el.blur(); } catch {}
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

    // どこかの初期化で:
//    const nav = document.getElementById('cgpt-nav');
//    if (nav) placeNav(nav);


  }

  function applyLang(){
    const box = document.getElementById('cgpt-nav');
    if (!box) return;
    const cur = (SH.getCFG?.() || {}).lang;
//console.log("applyLang cur:",cur);
    // 共通翻訳関数を取得
    const t = window.CGTN_I18N?.t || ((k)=>k);

    // data-i18n属性を持つ要素すべてに適用
    box.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const txt = t(key);
      if (!key || !txt) return;
      // テキスト＆タイトルを同時更新（title不要な要素は上書きしても無害）
      el.textContent = txt;
      el.title = txt;
    });

    // 言語ボタン
    const langBtn = box.querySelector('.cgpt-lang-btn');
    if (langBtn) langBtn.textContent = T('langBtn');
    // ドラッグタイトル
    const drag = box.querySelector('#cgpt-drag');
    if (drag) drag.title = T('nav.drag');

    // プレビュータイトル
    const h = document.querySelector('#cgtn-preview-title');
    if (h) h.textContent = T('preview');
  }


function toggleLang() {
  // 現在の言語を取得（設定がなければ ja をデフォルトに）
  const cur = (SH.getCFG?.() || {}).lang || 'ja';
  const next = (cur && String(cur).toLowerCase().startsWith('en')) ? 'ja' : 'en';

  // --- 言語設定の共有と即時反映 ---
  try {
    SH.saveSettingsPatch?.({ lang: next }); // ← LANG ではなく next
    if (window.CGTN_I18N) {
      window.CGTN_I18N._forceLang = next; // ← 即反映
    }
  } catch (e) {
    console.warn("toggleLang error", e);
  }

  // --- UI反映 ---
  applyLang();

  // --- ツールチップ再翻訳 ---
  SH.updateTooltips?.();

  // --- 必要な場合のみリスト再描画 ---
  const isListVisible = window.CGTN_LOGIC?.isListVisible?.();
  const isPinOnly = !!(window.CGTN_SHARED?.getCFG?.()?.list?.pinOnly);

  window.CGTN_LOGIC?.updateListFooterInfo?.();
  if (isListVisible || isPinOnly) {
    window.CGTN_LOGIC.renderList(true);
  }
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

  // 公開API
  NS.installUI = installUI;
  NS.clampPanelWithinViewport = clampPanelWithinViewport;
  NS.applyLang = applyLang;
  NS.toggleLang = toggleLang;

// ui.js — ナビの座標適用まわり（作成直後に呼ぶ）
function placeNav(navEl){
  // まずは余計な inline を掃除（今回の主因）
  navEl.style.left   = '';
  navEl.style.top    = '';
  navEl.style.inset  = '';

  // 右下デフォルト（CSSと一致）
  navEl.style.right  = '12px';
  navEl.style.bottom = '140px';

  // もし「保存済みパネル位置（CFG.panel）」があれば画面内に収めて適用
  const cfg = window.CGTN_SHARED?.getCFG?.() || {};
  const p   = cfg.panel || {};
  if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
    const vw = innerWidth, vh = innerHeight;
    const x  = Math.max(8, Math.min(vw - 100, Math.round(p.x)));
    const y  = Math.max(8, Math.min(vh - 100, Math.round(p.y)));
    // left/top で固定するなら right/bottom を解除してからセット
    navEl.style.right  = 'auto';
    navEl.style.bottom = 'auto';
    navEl.style.left   = `${x}px`;
    navEl.style.top    = `${y}px`;
  }
}



  // 起動直後に一度だけ適用（navがまだ無ければ無害）
  document.addEventListener('DOMContentLoaded', applyLang);

})();
