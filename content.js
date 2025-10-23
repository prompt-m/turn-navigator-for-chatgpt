// content.js — Entry (refactor skeleton)
(function(){
  'use strict';
  if (document.getElementById('cgpt-nav')) return;

  const SH = window.CGTN_SHARED;
  const UI = window.CGTN_UI;
  const EV = window.CGTN_EVENTS;
  const LG = window.CGTN_LOGIC;


  // --- 自動同期フラグ（最小差分用） ---
  // リスト開状態なら「チャット切替時」に中身だけ差し替える
  const AUTO_SYNC_OPEN_LIST = true;
  // URL切替はインジェクト方式で受ける（コンテンツ側ポーリング無効化）
  const USE_INJECT_URL_HOOK = true;
  const URL_HOOK_EVENT = 'cgtn:url-change';

  // ========= 小さなユーティリティ =========
  function inOwnUI(node){
    if (node?.closest?.('[data-cgtn-ui]')) return true;
    const nav  = document.getElementById('cgpt-nav');
    const list = document.getElementById('cgpt-list-panel');
    return (nav  && (node===nav  || nav.contains(node))) ||
           (list && (node===list || list.contains(node)));
  }
  function _L(){ return (SH?.getLang?.() || '').toLowerCase().startsWith('en') ? 'en':'ja'; }

  // ========= 1) フォーカス系 =========
  function ensureFocusPark(){
    let park = document.getElementById('cgtn-focus-park');
    if (park) return;
    park = document.createElement('button');
    park.id = 'cgtn-focus-park';
    park.type = 'button';
    park.tabIndex = -1;
    park.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none;';
    document.body.appendChild(park);
  }
  function installFocusStealGuard(){
    const nav  = document.getElementById('cgpt-nav');
    const list = document.getElementById('cgpt-list-panel');
    const inUI = el => !!(el && ((nav && nav.contains(el)) || (list && list.contains(el))));
    let fromUI = false;

    document.addEventListener('mousedown', e => { fromUI = inUI(e.target); }, { capture:true });
    document.addEventListener('mouseup', () => {
      if (!fromUI) return; fromUI = false;
      try { const sel = getSelection(); sel && sel.removeAllRanges(); } catch{}
      const park = document.getElementById('cgtn-focus-park'); if (!park) return;
      setTimeout(()=>{ try { park.focus({ preventScroll:true }); } catch{} }, 0);
      requestAnimationFrame(()=>{ try { park.focus({ preventScroll:true }); } catch{} });
    }, { capture:true });
  }

  // ========= 2) プレビュードック =========
  function bindPreviewDockOnce(){
    if (document._cgtnPreviewDockBound) return;
    document._cgtnPreviewDockBound = true;

    const LIST_SEL = '#cgpt-list-panel';
    const BTN_SEL  = '.cgtn-preview-btn';   // 既存・新設どちらも拾える想定

    let dock, body, title;
    let pinned = false;                     
    let dragging = false, dragDX = 0, dragDY = 0;
    let resizing = false, baseW = 0, baseH = 0, baseX = 0, baseY = 0;

    function ensureDock(){
      if (dock) return dock;
      dock = document.createElement('div');
      dock.className = 'cgtn-dock';
      dock.setAttribute('data-cgtn-ui','1'); // ← 自作UIフラグ
      dock.innerHTML = `
        <div class="cgtn-dock-head">
          <span class="cgtn-dock-title"></span>
          <button class="cgtn-dock-close" aria-label="Close">✕</button>
        </div>
        <div class="cgtn-dock-body"></div>
        <div class="cgtn-dock-resize" title="Resize">⤡</div>
      `;
      document.body.appendChild(dock);
       // 位置/サイズ/固定フラグを保存
      function saveDockState() {
        if (!dock) return;
        const r = dock.getBoundingClientRect();

        // ★最小ガード：0や極端な値は保存しない
        const MIN_W = 260, MIN_H = 180;
        const w = Math.round(r.width),  h = Math.round(r.height);
        const x = Math.round(window.scrollX + r.left);
        const y = Math.round(window.scrollY + r.top);
        if (w < MIN_W || h < MIN_H) return; // ← この条件が効けば0pxは二度と保存されない

        SH?.saveSettingsPatch?.({
          previewDock: {
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
            pinned: !!pinned
          }
        });
//console.log("saveDockState pinned:",pinned," w:",dock.style.width," h:",dock.style.height," x:",dock.style.left," y:",dock.style.top);
      }

      // 保存済み状態を復元（呼ぶだけで反映）
      function restoreDockState() {
//            const st = SH?.getCFG?.()?.previewDock || {};
        const st = SH?.getCFG?.()?.previewDockPlace || {};
        const DEF = { w: 420, h: 260, x: 40, y: 40 };

        // ★初期デフォルト（設定が無い／ゼロ値っぽい時の下支え）
        let w = Number.isFinite(st.w) && st.w > 0 ? st.w : DEF.w;
        let h = Number.isFinite(st.h) && st.h > 0 ? st.h : DEF.h;
        let x = Number.isFinite(st.x) && st.x > 0 ? st.x : DEF.x;
        let y = Number.isFinite(st.y) && st.y > 0 ? st.y : DEF.y;

        dock.style.width  = w + 'px';
        dock.style.height = h + 'px';
        dock.style.left   = x + 'px';
        dock.style.top    = y + 'px';

        if (st.pinned) {
//              pinned = true;
          dock.setAttribute('data-pinned','1');
        }

// デバッグ
//console.log("restoreDock pinned:",pinned," w:",dock.style.width," h:",dock.style.height," x:",dock.style.left," y:",dock.style.top);
      }


      body  = dock.querySelector('.cgtn-dock-body');
      title = dock.querySelector('.cgtn-dock-title');

      restoreDockState(); // ★ここで復元

      // 閉じる
      dock.querySelector('.cgtn-dock-close').addEventListener('click', () => {
        _savePlace(dock);
        dock.removeAttribute('data-show');
        dock.removeAttribute('data-pinned');
        pinned = false;
      });

      // 移動（ヘッダー掴み）
      const head = dock.querySelector('.cgtn-dock-head');
      head.addEventListener('mousedown', (e) => {
//            if (!pinned) return;           // 固定中のみ移動
        dragging = true;
        const r = dock.getBoundingClientRect();
        dragDX = e.clientX - r.left;
        dragDY = e.clientY - r.top;
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const left = window.scrollX + e.clientX - dragDX;
        const top  = window.scrollY + e.clientY - dragDY;
        dock.style.left = left + 'px';
        dock.style.top  = top  + 'px';
      }, { passive: true });

      window.addEventListener('mouseup', () => {
        if (dragging||resizing){
          dragging = false;
          resizing = false; 
          _savePlace(dock);
        }             
      });

      // リサイズ（右下グリップ）
      const grip = dock.querySelector('.cgtn-dock-resize');
      grip.addEventListener('mousedown', (e) => {
        resizing = true;
        const r = dock.getBoundingClientRect();
        baseW = r.width; baseH = r.height;
        baseX = e.clientX; baseY = e.clientY;
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!resizing) return;
        const dx = e.clientX - baseX;
        const dy = e.clientY - baseY;
        const w = Math.max(260, baseW + dx);
        const h = Math.max(180, baseH + dy);
        dock.style.width  = w + 'px';
        dock.style.height = h + 'px';
      }, { passive: true });

      // === 言語切り替え対応：タイトルを再翻訳 ===
      (function setupDockTitleI18N(){
        const titleEl = dock.querySelector('.cgtn-dock-title');
        if (!titleEl) return;

        const applyDockTitle = () => {
          const t = window.CGTN_I18N?.t || (k=>k);
          titleEl.textContent = t('preview.title');
        };

        // 初期設定
        applyDockTitle();

        // 言語切替時の再反映
        window.CGTN_SHARED?.onLangChange?.(applyDockTitle);
      })();

      return dock;
    }

    // ★ content.js / bindPreviewDockOnce() 内（ensureDock() の下あたり）
    function hideDock(reason){
      const box = ensureDock();
//          box.style.display = 'none';
      // 位置・サイズを安全に保存（0値は保存しない実装ならそのままでOK）
      try { _savePlace?.(box); } catch {}
      box.removeAttribute('data-show');
      box.removeAttribute('data-pinned');
      pinned = false;
    }

    // 外部から呼べるように公開
    window.CGTN_PREVIEW = Object.assign(window.CGTN_PREVIEW || {}, {
      hide: hideDock
    });


    // === 配置判断用のシグネチャ ===
    function _listRect(){
      const list = document.getElementById('cgpt-list-panel');
      if (!list) return null;
      const r = list.getBoundingClientRect();
      return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    }
    function _vp(){ return { vw: innerWidth, vh: innerHeight }; }

    // 誤差吸収（DevTools開閉などの±1〜2pxズレで無駄に再配置しない）
    function _near(a, b, eps=4){ return Math.abs((a||0)-(b||0)) <= eps; }
    function _sameRect(a, b){ return a && b && _near(a.l,b.l) && _near(a.t,b.t) && _near(a.w,b.w) && _near(a.h,b.h); }
    function _sameVP(a, b){ return a && b && a.vw===b.vw && a.vh===b.vh; }

    // 保存・読込（cfg.previewDockPlace に格納）
    function _loadPlace(){
      return (window.CGTN_SHARED?.getCFG?.()?.previewDockPlace) || null;
    }

    function _savePlace(dock){
      if (!dock) return;
      const r = _measureRect(dock);
      const minW = 260, minH = 180;

      // まるごと 0（= 非表示/未レイアウト）なら、既存値を壊さないため保存スキップ
      if (!r.width && !r.height) return;

      const place = {
        // position:fixed を想定。もし absolute なら scrollX/Y を加算する
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.max(minW, Math.round(r.width)),
        h: Math.max(minH, Math.round(r.height)),
        sig: { vp: _vp(), lr: _listRect() }
      };
//        console.log("_savePlace pinned:",pinned," w:",Math.round(r.width)," h:",Math.round(r.height)," x:",Math.round(r.left)," y:",Math.round(r.top));
      window.CGTN_SHARED?.saveSettingsPatch?.({ previewDockPlace: place });
    }


    function placeDockNearList(dock){
      const list = document.getElementById('cgpt-list-panel'); if (!dock || !list) return;
      const vw = innerWidth, vh = innerHeight;
      const pad = 12;          // 画面端との安全マージン
      const minGap = 10;       // リストとドックの最小離隔 ← これがキモ

      const w = Math.max(260, dock.offsetWidth  || 420);
      const h = Math.max(180, dock.offsetHeight || 260);

      const r = list.getBoundingClientRect();

      // 置けるスペース（minGap込みで判定）
      const spaceRight = (vw - r.right) - (pad + minGap);
      const spaceLeft  = (r.left)       - (pad + minGap);
      const spaceBelow = (vh - r.bottom)- (pad + minGap);
      const spaceAbove = (r.top)        - (pad + minGap);

      // 位置候補を順に試す（右 → 左 → 下 → 上 → 中央）
      const tryRight = () => {
        if (spaceRight < w) return false;
        dock.style.left = (scrollX + r.right + minGap) + 'px';
        dock.style.top  = (scrollY + Math.min(Math.max(r.top, pad), vh - h - pad)) + 'px';
        return true;
      };
      const tryLeft = () => {
        if (spaceLeft < w) return false;
        dock.style.left = (scrollX + r.left - w - minGap) + 'px';
        dock.style.top  = (scrollY + Math.min(Math.max(r.top, pad), vh - h - pad)) + 'px';
        return true;
      };
      const tryBelow = () => {
        if (spaceBelow < h) return false;
        dock.style.left = (scrollX + Math.min(Math.max(r.left, pad), vw - w - pad)) + 'px';
        dock.style.top  = (scrollY + r.bottom + minGap) + 'px';
        return true;
      };
      const tryAbove = () => {
        if (spaceAbove < h) return false;
        dock.style.left = (scrollX + Math.min(Math.max(r.left, pad), vw - w - pad)) + 'px';
        dock.style.top  = (scrollY + r.top - h - minGap) + 'px';
        return true;
      };
      const center = () => {
        dock.style.left = (scrollX + Math.max(pad, (vw - w)/2)) + 'px';
        dock.style.top  = (scrollY + Math.max(pad, (vh - h)/2)) + 'px';
      };

      // 右→左→下→上→中央
      if (tryRight()) return;
      if (tryLeft())  return;
      if (tryBelow()) return;
      if (tryAbove()) return;
      center();
    }

    function _measureRect(el){
      if (!el) return {left:0, top:0, width:0, height:0};
      const cs = getComputedStyle(el);
      let restore = null;
      if (cs.display === 'none') {
        // 一時的に見えない状態で表示(block)にして測る
        restore = { display: el.style.display, visibility: el.style.visibility };
        el.style.visibility = 'hidden';
        el.style.display    = 'block';
      }
      const r = el.getBoundingClientRect();
      if (restore){
        el.style.display    = restore.display ?? '';
        el.style.visibility = restore.visibility ?? '';
      }
      return r;
    }

    // 行からプレビュー文字列を受け取る（renderList で row.dataset.preview を仕込んでいる前提）
    function textFromRow(row){
      return row?.dataset?.preview || '（内容なし）';
    }

    // 非表示のまま「中身と座標」を更新
    function updateDock(btn){
      const row = btn.closest('.row'); if (!row) return;
      const text = textFromRow(row);

      const box = ensureDock();
      // 中身は常時更新（固定中でも内容は切り替える仕様）
      body.textContent = text;
      body.scrollTop = 0;
 
//console.log("updateDock pinned:",pinned);
    }

    // A) マウスムーブ：常時差し替え（見せない）
    //    → プレビューボタンクラスに当たったときだけ更新
    let raf = 0;
    document.addEventListener('mousemove', (e) => {
      const btn = e.target.closest?.(BTN_SEL);
      if (!btn) return;
      cancelAnimationFrame(raf);
//console.log("mousemove pinned:",pinned);
      raf = requestAnimationFrame(() => updateDock(btn));
    }, true);

    // B) クリック：表示/非表示トグル（固定ON/OFF）
    document.addEventListener('click', (e) => {
      const btn = e.target.closest?.(BTN_SEL);
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();

      const box = ensureDock();
      const showing = box.getAttribute('data-show') === '1';
      if (showing){
        box.removeAttribute('data-show');
        box.removeAttribute('data-pinned');
        _savePlace(box);              // 非表示時も最終位置を保存
      } else {
        updateDock(btn);              // ★中身だけ更新（位置は弄らない）
        const saved = _loadPlace();
        const nowSig = { vp:_vp(), lr:_listRect() };
        if (saved && _sameVP(saved.sig?.vp, nowSig.vp) && _sameRect(saved.sig?.lr, nowSig.lr)) {
          if (Number.isFinite(saved.w)) box.style.width  = saved.w + 'px';
          if (Number.isFinite(saved.h)) box.style.height = saved.h + 'px';
          if (Number.isFinite(saved.x)) box.style.left   = saved.x + 'px';
          if (Number.isFinite(saved.y)) box.style.top    = saved.y + 'px';
        } else {
          placeDockNearList(box);     // ★ヒューリスティック
          _savePlace(box);            // 新基準で保存
        }
        box.setAttribute('data-show','1');
        box.setAttribute('data-pinned','1');
      }
    }, true);

    // ★Escだけは残して、外側クリックでのクローズは無効化
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') {
//          pinned = false;
      ensureDock().removeAttribute('data-show');
      ensureDock().removeAttribute('data-pinned');
    }});

  };

  // ========= 3) 基準線の自動追従 =========
  function bindBaselineAutoFollow(){
    // 軽いデバウンス（連続イベントをまとめる）
    const debounce = (fn, ms=60)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
    // 基準線を再配置（shared.js の公開API）
    const redraw = debounce(()=>{ try{ SH?.redrawBaseline?.(); }catch{} }, 60);

    // ウィンドウサイズ・画面回転・タブ可視状態
    window.addEventListener('resize', redraw, { passive:true });
    window.addEventListener('orientationchange', redraw);
    document.addEventListener('visibilitychange', redraw);

    // スクロールコンテナの高さ変化（DevTools ドッキング変更等も検知）
    try{
      const sc = LG?._scroller || document.scrollingElement || document.documentElement;
      const ro = new ResizeObserver(redraw);
      ro.observe(sc);
      // ページ離脱でクリーンアップ（念のため）
      window.addEventListener('pagehide', () => {
        window.CGTN_PREVIEW?.hide?.('pagehide');
        try{ ro.disconnect(); }catch{}
      }, { once:true });
    }catch{}
    // 初回も一度呼ぶ（初期描画）
    requestAnimationFrame(redraw); // 初期描画
  }
/*
  // ========= 4) DOM変化→rebuild（自作UIは無視） =========
  function observeAndRebuild(){
    // 自前UIの変化は無視してループを断つ
    const mo = new MutationObserver(muts=>{
      for (const m of muts){ if (inOwnUI(m.target)) return; }
      // 既存の「再初期化」フローに便乗して閉じる（併用可）
      window.CGTN_PREVIEW?.hide?.('reinit');
//console.debug('[observeAndRebuild]LG.rebuild() ');
      //LG.rebuild();
    });
    mo.observe(document.body, { childList:true, subtree:true });
    return mo;
  }
*/
  // ========= 5) URL変化でのクローズ・再描画 =========

  function closeDockOnUrlChange(){

    if (!USE_INJECT_URL_HOOK){
     // ここに既存の popstate/hashchange/setInterval(check, …) などを有効のまま
    // インジェクト方式を使う場合は発火源が二重になるのでバイパス

console.log("＊＊＊＊closeDockOnUrlChange＊＊＊＊");
      let last = location.pathname + location.search;

      // リスト開状態なら自動で中身を新チャットへ差し替える
      const AUTO_SYNC_OPEN_LIST = true; // ← ここでON/OFFできる

      const check = () => {
        const cur = location.pathname + location.search;
console.log("＊＊＊＊closeDockOnUrlChange 1＊＊＊＊ cur:",cur);
        if (cur === last) return;

console.log("＊＊＊＊closeDockOnUrlChange 2＊＊＊＊");
        last = cur;
        window.CGTN_PREVIEW?.hide?.('url-change');

        // ★ 開いている時だけ自動更新（閉じているなら何もしない）
        if (AUTO_SYNC_OPEN_LIST && SH.isListOpen?.()) {
          try {
console.log("＊＊＊＊closeDockOnUrlChange 3 open＊＊＊＊");
            const cid = SH.getChatId?.();
            // pins → 新チャットへ切替（引数省略版でもOK）
            if (cid) LG?.hydratePinsCache?.(cid); else LG?.hydratePinsCache?.();
            LG?.rebuild?.('auto:chat-switch');
            LG?.renderList?.(true);
          } catch (e) {
            console.debug('[auto-sync] chat switch update failed:', e);
          }
        }
console.log("＊＊＊＊closeDockOnUrlChange 4 close＊＊＊＊");
        // ※ 閉じている時は描画しない＝無駄コストをかけない
      };

console.log("＊＊＊＊closeDockOnUrlChange 5 ＊＊＊＊");

      window.addEventListener('popstate', check);
      window.addEventListener('hashchange', check);

      // SPA用: pushState / replaceState をフック
      const _push = history.pushState;
      history.pushState = function(...args){
        const ret = _push.apply(this, args);
        try { check(); } catch {}
console.log("＊＊＊＊closeDockOnUrlChange 6 ＊＊＊＊");
        return ret;
      };
      const _repl = history.replaceState;
      history.replaceState = function(...args){
        const ret = _repl.apply(this, args);
        try { check(); } catch {}
console.log("＊＊＊＊closeDockOnUrlChange 7 ＊＊＊＊");
        return ret;
      };
    }
}

  // ========= 6) 一覧パネルの初期状態をOFFに強制 =========
  function forceListPanelOffOnBoot(){
    try {
      const cur = SH.getCFG() || {};
      SH.saveSettingsPatch({ list: { ...(cur.list||{}), enabled:false, pinOnly:false } });
      document.getElementById('cgpt-list-toggle').checked = false;
      const pinOnlyChk = document.getElementById('cgpt-pinonly');
      if (pinOnlyChk){ pinOnlyChk.checked = false; pinOnlyChk.disabled = true; }
console.debug('[forceListPanelOffOnBoot] LG?.setListEnabled false ');
      LG?.setListEnabled?.(false, /*save*/ false);
    } catch {}
  }

  // ========= 7) リスト「最新にする」ボタン =========
  function bindListRefreshButton(){
    document.addEventListener('click', (e) => {
      const btn = e.target.closest?.('#cgpt-list-refresh'); if (!btn) return;
      e.preventDefault(); e.stopPropagation();

      const sc   = document.querySelector('#cgpt-list-body');
      const rows = sc ? [...sc.querySelectorAll('.row')] : [];
      const top  = sc ? sc.scrollTop : 0;
      // 1) フォーカス中の行を最優先
      let anchor = document.activeElement?.closest?.('#cgpt-list-body .row') || null;

      // 2) なければ _currentTurnKey を採用
      if (!anchor) {
        const k = LG?._currentTurnKey; if (k) anchor = sc?.querySelector(`.row[data-turn="${k}"]`) || null;
      }

      // 3) それでも無ければ可視領域の先頭行
      if (!anchor) anchor = rows.find(r => (r.offsetTop + r.offsetHeight) > top) || rows[0] || null;

      // 相対オフセット（行先頭からの距離）
      const delta = anchor ? (top - anchor.offsetTop) : 0;
      const aKey  = anchor?.dataset?.turn || null;
      const aKind = anchor?.dataset?.kind || null;

      // 再スキャン & 再描画
console.debug('[bindListRefreshButton]LG.rebuild() ');
      LG?.rebuild?.();
      LG?.renderList?.(true);
      // 復元
      requestAnimationFrame(() => {
        const sc2 = document.querySelector('#cgpt-list-body'); if (!sc2) return;
        let target = null;
        // まずはフォーカス/選択と同じ行を探す（turn+kind が取れていればそれで特定）
        if (aKey && aKind) target = sc2.querySelector(`.row[data-turn="${aKey}"][data-kind="${aKind}"]`);
       // だめなら turn だけで探す
        if (!target && aKey) target = sc2.querySelector(`.row[data-turn="${aKey}"]`);
        if (target) sc2.scrollTop = Math.max(0, target.offsetTop + delta);
        else {
          // 最後の保険：現在ターンへ
          const k = LG?._currentTurnKey; if (k) LG?.scrollListToTurn?.(k);
        }
      });
    }, true);
  }

// 基準線の表示ON/OFF 設定画面より受信
  // === options.html からの即時反映メッセージを受ける ===
  try{
    chrome.runtime.onMessage.addListener((msg)=>{
      if (!msg || !msg.type) return;
      if (msg.type === 'cgtn:pins-deleted'){
        // 表示中のチャットなら一覧をリフレッシュ
        const cid = SH.getChatId?.();
        if (!cid || (msg.chatId && msg.chatId !== cid)) return;
        LG.hydratePinsCache?.(cid);
        //const wasOpen = !!window.CGTN_SHARED?.getCFG?.()?.list?.enabled;
        //if (wasOpen) window.CGTN_LOGIC?.renderList?.(false);
        // isListOpen === true のときだけ描画（閉じていれば何もしない）
        //　設定画面で付箋データが削除されたとき、リストを更新する処理
console.log("設定画面で付箋データが削除されたとき、リストを更新する処理");
        if (SH.isListOpen?.()) window.CGTN_LOGIC?.renderList?.(false);

      }
      if (msg.type === 'cgtn:viz-toggle'){
        const on = !!msg.on;
        SH.toggleViz?.(on);                       // 基準線の実表示を切替
        const cb = document.querySelector('#cgpt-viz');
        if (cb) cb.checked = on;                  // ナビパネルのチェックを同期
        SH.saveSettingsPatch?.({ showViz: on });  // 状態も保存
      }
    });
  }catch{}


  function watchChatIdChange(){
    let prev = null;
    setInterval(() => {
      const cur = SH.getChatId?.();
//console.debug('[watch] chat switch ->', cur);
      if (cur && cur !== prev) {
        prev = cur;
        //チャットを切り替えたらリストを閉じる処理
        // チャット切替時は一旦リストOFF（勝手に開かない）
        SH.saveSettingsPatch({ list:{ enabled:false } });

        // チャット切替で強制OFFする旧挙動（残しつつフラグでガード）
        if (!AUTO_SYNC_OPEN_LIST){
          SH.saveSettingsPatch({ list:{ enabled:false } });
          // （既存のチェックボックス連動処理もこの if 内に残す）
        }

      }
    }, 800);
  }

  // ======== URL変化をフックして postMessage させる＋再構築タイミングを遅延 ========
  function injectUrlChangeHook() {
    try {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('inject_url_hook.js');
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } catch (e) {
      console.warn('injectUrlChangeHook failed', e);
    }
  }

  let _lastUrlSig = location.pathname + location.search;
  let _switchSeq  = 0;

  function handleUrlChangeMessage() {
    const cur = location.pathname + location.search;
    if (cur === _lastUrlSig){ 
      console.debug('[cgtn:url] same-url ignored:', cur);
      return;
    }
    _lastUrlSig = cur;

    window.CGTN_PREVIEW?.hide?.('url-change');
    const mySeq = ++_switchSeq;

    //console.groupCollapsed('[cgtn:url] switched!', { cur, mySeq, t: performance.now().toFixed(1) });

    console.debug('[cgtn:url] mySeq:',mySeq);

    // ★ここで先に消す
//    window.CGTN_LOGIC?.clearListPanelUI?.();

    // ★ここが肝：まず即クリア（先に前の表示を消す）
    try { window.CGTN_LOGIC?.clearListPanelUI?.(); } catch {}
    console.debug('[cgtn:url] pre-clear UI');

    // 少し遅らせて、ChatGPTのmainが再描画されてから実行
    waitForChatMain(
      // onReady
      () => {
        if (mySeq !== _switchSeq) return; // 古い通知は破棄
        const LG = window.CGTN_LOGIC, SH = window.CGTN_SHARED;
        LG?.hydratePinsCache?.(SH.getChatId?.());
        if (SH.isListOpen?.()) {
          console.debug('[auto-sync1] chat switch (list open) → rebuild+render');
          LG?.rebuild?.();
          LG?.renderList?.(true);
        } else {
          console.debug('[auto-sync2] chat switch (list closed) → state only');
        }
        LG?.updatePinOnlyBadge?.(); LG?.updateListChatTitle?.();
      },
      // onIdle (timeout)
      () => {
        // ここでは rebuild しない。空のまま待つ
        watchFirstArticleOnce(() => {
          // URLがまた変わっていたらやめる
          if (mySeq !== _switchSeq){
            console.debug('[auto-sync3]mySeq !== _switchSeq return ');
            return;
          }
          const LG = window.CGTN_LOGIC, SH = window.CGTN_SHARED;
          LG?.hydratePinsCache?.(SH.getChatId?.());
          if (SH.isListOpen?.()) {
            console.debug('[auto-sync4] (list open)→ rebuild+render');
            LG?.rebuild?.();
            LG?.renderList?.(true);
          }
          // 付箋バッジ
          LG?.updatePinOnlyBadge?.();
          // チャット名
          LG?.updateListChatTitle?.();
console.debug('＊＊＊[auto-sync5]location.pathname:',location.pathname);
console.debug('＊＊＊[auto-sync6]LG?._lastRenderSig:', LG?._lastRenderSig, 'pins=', Object.keys(CGTN_SHARED.getCFG?.().pinsByChat||{}).length);

        });
      }
    );



  }

  // 成功したら onReady、タイムアウトしたら onIdle を呼ぶ
  function waitForChatMain(onReady, onIdle, timeout = 4000) {
    const started = performance.now();
    const ok = () => {
      console.debug('[waitForChatMain] ready in', (performance.now()-started).toFixed(1), 'ms');
      onReady?.();
    };
    const idle = () => {
      console.debug('[waitForChatMain] timeout, will watch for first article');
      onIdle?.();
    };

    const check = () => {
      const main = document.querySelector('main');
      if (main && (main.querySelector('[data-testid*="conversation"], article'))) return ok();
      if (performance.now() - started < timeout) return setTimeout(check, 200);
      idle();
    };
    check();
  }

  // <article>が出てきた瞬間に一度だけ実行
  function watchFirstArticleOnce(cb) {
    const main = document.querySelector('main');
    if (!main) return;
    const mo = new MutationObserver(() => {
      if (main.querySelector('[data-testid*="conversation"], article')) {
        mo.disconnect();
        cb?.();
      }
    });
    mo.observe(main, { childList: true, subtree: true });
  }


  // ========= リスト表示中の「ターン追加」自動更新（MOは1本のみ） =========
  function installAutoSyncForTurns(){
console.log("installAutoSyncForTurns top");
    if (document._cgtnAutoSyncBound) return;
    document._cgtnAutoSyncBound = true;

//console.log("installAutoSyncForTurns 1");
  
    // 自作UI除外（無限ループ防止）
    const inOwnUI = (node) => {
      if (!node || node.nodeType !== 1) return false;
      return node.closest?.('[data-cgtn-ui]') ||
             document.getElementById('cgpt-nav')?.contains(node) ||
             document.getElementById('cgpt-list-panel')?.contains(node);
    };
//console.log("installAutoSyncForTurns 2");
  
    const root = document.querySelector('main') || document.body;
    let to = 0;
    const kick = () => {
      if (!SH.isListOpen?.()) return;        // 閉じている間は完全ノーオペ
      clearTimeout(to);
      to = setTimeout(() => {
        try{
          LG.rebuild?.();
          LG.renderList?.(true);
          console.debug('[auto-sync] turns+ (list open) → rebuild+render');
        }catch(e){}
      }, 300); // 300msデバウンス
    };
//console.log("installAutoSyncForTurns 3");

    const mo = new MutationObserver((muts)=>{
      if (!SH.isListOpen?.()) return;        // リスト閉なら処理しない
      for (const m of muts){
        if (inOwnUI(m.target)) continue;     // 自作UIは無視
        // 追加ノードに会話要素が含まれるか
        const hit = [...m.addedNodes].some(n =>
          n?.nodeType===1 && (
            n.matches?.('article,[data-message-author-role]') ||
            n.querySelector?.('article,[data-message-author-role]')
          )
        );
        if (hit){ kick(); break; }
      }
    });
//console.log("installAutoSyncForTurns 4");
    try{ mo.observe(root, { childList:true, subtree:true }); }catch(e){}
  }

  // ========= 9) 初期セットアップ =========
  function initialize(){
    SH.loadSettings(() => {
      UI.installUI();
      ensureFocusPark();
      installFocusStealGuard();
      UI.applyLang();
      UI.clampPanelWithinViewport();

      // 基準線の初期表示（保存 showViz を尊重）
      try {
        const cfg = SH?.getCFG?.();
        SH?.renderViz?.(cfg, !!cfg?.showViz);
      } catch {}

//console.log("initialize bindEvents");
      EV.bindEvents();
      bindPreviewDockOnce();
      bindBaselineAutoFollow();
//★★★もしかしたら不要？★★★
//      observeAndRebuild();
//console.log("initialize closeDockOnUrlChange");
      closeDockOnUrlChange();
      bindListRefreshButton();
      forceListPanelOffOnBoot();

      if (USE_INJECT_URL_HOOK){
        injectUrlChangeHook();
        window.addEventListener('message', (e)=>{
          const d = e && e.data;
          console.debug('[cgtn:url-msg*1] recv', d.href, performance.now().toFixed(1));
          if (!d || d.source !== 'cgtn' || d.type !== 'url-change') return;
          console.debug('[cgtn:url-msg*2] recv', d.href, performance.now().toFixed(1));
          handleUrlChangeMessage();
        });
      }
      installAutoSyncForTurns(); // MOは1本のみ

      watchChatIdChange();

      // ★ここで一発クリーンアップ！
      SH.cleanupZeroPinRecords();
    });
    // ナビが動かなくなったので、入れてみる
    LG.rebuild?.();

    // リスト自動更新処理
    //installAutoSyncForTurns();

    // viewport 変化でナビ位置クランプ
    window.addEventListener('resize', () => UI.clampPanelWithinViewport(), { passive:true });
    window.addEventListener('orientationchange', () => UI.clampPanelWithinViewport());

    // タイトル変更を監視→保存（1回だけバインド）
    (function watchDocTitle(){
      if (document._cgtnTitleWatch) return;
      document._cgtnTitleWatch = true;
      let last = (document.title || '');
      const mo = new MutationObserver(()=>{
        const cur = (document.title || '');
        if (cur !== last) {
          last = cur;
          // ここで最新タイトルを保存（pinsByChat / chatIndex 同期）
          try { window.CGTN_SHARED?.refreshCurrentChatTitle?.(); } catch {}
        }
      });
      mo.observe(document.querySelector('title') || document.head, { subtree:true, characterData:true, childList:true });
    })();

    
  }
  // ========= 10) DOM Ready =========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once:true });
  } else {
    initialize();
    // 付箋バッジ
    window.CGTN_LOGIC?.updatePinOnlyBadge?.();
    // チャット名
    window.CGTN_LOGIC.updateListChatTitle?.();
  }
})();
