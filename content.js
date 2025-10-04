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


//    return (nav && (node===nav || nav.contains(node))) ||
//           (list && (node===list || list.contains(node)));
    // どれかの“自作UI”内なら監視対象外
    if (node?.closest?.('[data-cgtn-ui]')) return true;
    return (nav  && (node===nav  || nav.contains(node))) ||
           (list && (node===list || list.contains(node)));
  }

  function initialize(){
    SH.loadSettings(() => {
      UI.installUI();
      // メタ更新
      try { window.CGTN_SHARED?.touchChatMeta?.(); } catch {}

      // 1回だけ作る不可視パーキング
      (function ensureFocusPark(){
        let park = document.getElementById('cgtn-focus-park');
        if (park) return;
        park = document.createElement('button');
        park.id = 'cgtn-focus-park';
        park.type = 'button';
        park.tabIndex = -1;
        park.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none;';
        document.body.appendChild(park);
      })();

      // content.js（initialize() の ensureFocusPark の直後あたりでOK）
      (function installFocusStealGuard(){
        const nav  = document.getElementById('cgpt-nav');
        const list = document.getElementById('cgpt-list-panel');
        const inUI = el => !!(el && ((nav && nav.contains(el)) || (list && list.contains(el))));

        let fromUI = false;

        document.addEventListener('mousedown', e => {
          fromUI = inUI(e.target);
        }, { capture:true });

        document.addEventListener('mouseup', () => {
          if (!fromUI) return;
          fromUI = false;

          // キャレット（選択範囲）を削除
          try { const sel = getSelection(); sel && sel.removeAllRanges(); } catch{}

          const park = document.getElementById('cgtn-focus-park');
          if (!park) return;

          // ページ側の focus が走り終わった後で park に移す
          setTimeout(() => {
            try { park.focus({ preventScroll:true }); } catch {}
          }, 0);
          requestAnimationFrame(() => {
            try { park.focus({ preventScroll:true }); } catch {}
          });
        }, { capture:true });
      })();


      UI.applyLang();
      UI.clampPanelWithinViewport();
      LG.rebuild();

      // === 基準線の初期表示（保存された showViz を尊重） ===
      try {
        const cfg = window.CGTN_SHARED?.getCFG?.();
        window.CGTN_SHARED?.renderViz?.(cfg, !!cfg?.showViz); // ← trueなら表示まで
      } catch {}
      // === 基準線の初期表示 ここまで ===


      EV.bindEvents();

      // === 常駐プレビュードック（非表示で常に更新、クリックで表示 & 固定） ===
      (function bindPreviewDockOnce(){
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
              <span class="cgtn-dock-title">Preview</span>
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
          const kind = row.getAttribute('data-kind') === 'attach' ? 'Attachments' : 'Preview';

          const box = ensureDock();
          // 中身は常時更新（固定中でも内容は切り替える仕様）
          body.textContent = text;
          title.textContent = kind;

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

      })();

      // === 基準線の自動追従（リサイズ/DevTools開閉/回転/可視状態変更） ===
      // 軽いデバウンス（連続イベントをまとめる）
      const _cgtnDebounce = (fn, ms = 60) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a      ), ms); }; };

      // 基準線を再配置（shared.js の公開API）
      const _cgtnRedrawBaseline = _cgtnDebounce(() => {
        try { window.CGTN_SHARED?.redrawBaseline?.(); } catch {}
      }, 60);

      // ウィンドウサイズ・画面回転・タブ可視状態
      window.addEventListener('resize', _cgtnRedrawBaseline, { passive: true });
      window.addEventListener('orientationchange', _cgtnRedrawBaseline);
      document.addEventListener('visibilitychange', _cgtnRedrawBaseline);

      // スクロールコンテナの高さ変化（DevTools ドッキング変更等も検知）
      try {
        const sc = window.CGTN_LOGIC?._scroller || document.scrollingElement || document.documentElement;
        const _cgtnRO = new ResizeObserver(_cgtnRedrawBaseline);
        _cgtnRO.observe(sc);

        // ページ離脱でクリーンアップ（念のため）
        window.addEventListener('pagehide', () => {
          window.CGTN_PREVIEW?.hide?.('pagehide');//ここ？
          try { _cgtnRO.disconnect(); } catch {} 
        }, { once: true });
      } catch {}

      // 初回も一度呼ぶ（初期描画）
      requestAnimationFrame(_cgtnRedrawBaseline);
      // === 基準線の自動追従 ここまで===

      // 自前UIの変化は無視してループを断つ
      mo = new MutationObserver((muts)=>{
        for (const m of muts){
          if (isOwnUI(m.target)) return; // ← 重要：自前UIなら短絡 return
        }
        // 既存の「再初期化」フローに便乗して閉じる（併用可）
        window.CGTN_PREVIEW?.hide?.('reinit');
        LG.rebuild();

        // list は OFF 初期なので描画は呼ばない（ON時のみ logic 側で描画）
      });
      mo.observe(document.body, { childList:true, subtree:true });

      window.addEventListener('resize', () => UI.clampPanelWithinViewport(), { passive:true });
      window.addEventListener('orientationchange', () => UI.clampPanelWithinViewport());

      // setListEnabled(false) を initialize 最後に一度だけ強制
      try {
        const chk = document.getElementById('cgpt-list-toggle');
        if (chk) chk.checked = false;
        window.CGTN_LOGIC?.setListEnabled?.(false);
      } catch {}

      // 一覧は必ずOFF、pinOnlyも必ずOFFでスタート（保存込み）
      try {
        const cur = SH.getCFG() || {};
        SH.saveSettingsPatch({
          list: { ...(cur.list||{}), enabled: false, pinOnly: false }
        });
        const listChk = document.getElementById('cgpt-list-toggle');
        if (listChk) listChk.checked = false;
        const pinOnlyChk = document.getElementById('cgpt-pinonly');
        if (pinOnlyChk) { pinOnlyChk.checked = false; pinOnlyChk.disabled = true; }
        window.CGTN_LOGIC?.setListEnabled?.(false, /*save*/ false);
      } catch {}
    });

    //リストを最新にする
    document.addEventListener('click', (e) => {
      const btn = e.target.closest?.('#cgpt-list-refresh');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();

      const sc   = document.querySelector('#cgpt-list-body');
      const rows = sc ? [...sc.querySelectorAll('.row')] : [];
      const top  = sc ? sc.scrollTop : 0;

      // 1) フォーカス中の行を最優先
      let anchor = document.activeElement?.closest?.('#cgpt-list-body .row') || null;

      // 2) なければ _currentTurnKey を採用
      if (!anchor) {
        const k = window.CGTN_LOGIC?._currentTurnKey;
        if (k) anchor = sc?.querySelector(`.row[data-turn="${k}"]`) || null;
      }

      // 3) それでも無ければ可視領域の先頭行
      if (!anchor) {
        anchor = rows.find(r => (r.offsetTop + r.offsetHeight) > top) || rows[0] || null;
      }

      // 相対オフセット（行先頭からの距離）
      const delta = anchor ? (top - anchor.offsetTop) : 0;
      const aKey  = anchor?.dataset?.turn || null;
      const aKind = anchor?.dataset?.kind || null;

      // 再スキャン & 再描画
      window.CGTN_LOGIC?.rebuild?.();
      window.CGTN_LOGIC?.renderList?.(true);

      // 復元
      requestAnimationFrame(() => {
        const sc2 = document.querySelector('#cgpt-list-body');
        if (!sc2) return;

        let target = null;

        // まずはフォーカス/選択と同じ行を探す（turn+kind が取れていればそれで特定）
        if (aKey && aKind) {
          target = sc2.querySelector(`.row[data-turn="${aKey}"][data-kind="${aKind}"]`);
        }
        // だめなら turn だけで探す
        if (!target && aKey) {
          target = sc2.querySelector(`.row[data-turn="${aKey}"]`);
        }

        if (target) {
          sc2.scrollTop = Math.max(0, target.offsetTop + delta);
        } else {
          // 最後の保険：現在ターンへ
          const k = window.CGTN_LOGIC?._currentTurnKey;
          if (k) window.CGTN_LOGIC?.scrollListToTurn?.(k);
        }
      });
    }, true);


/*
    document.addEventListener('click', (e) => {
      const btn = e.target.closest?.('#cgpt-list-refresh');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();

    //NS.scrollListToTurn(NS._currentTurnKey);

      // スクロール位置・選択行のキーを温存してから再描画
      const curKey = window.CGTN_LOGIC?._currentTurnKey;
      window.CGTN_LOGIC?.rebuild?.();        // DOMの再スキャン
      window.CGTN_LOGIC?.renderList?.(true); // 再描画（必要なら pinOnlyOverride も）
      if (curKey) window.CGTN_LOGIC?.scrollListToTurn?.(curKey);
    }, true);
*/
    // ★ URL変化・履歴遷移でプレビューを閉じる
    (function closeDockOnUrlChange(){
      let last = location.pathname + location.search;

      const check = () => {
        const cur = location.pathname + location.search;
        if (cur !== last){
          last = cur;
          window.CGTN_PREVIEW?.hide?.('url-change');
          try {
            window.CGTN_LOGIC?.hydratePinsCache?.(); // 新しいチャットのピンをロード
            // pinOnly の状態は既存CFGを尊重
            window.CGTN_LOGIC?.rebuild?.();
            window.CGTN_LOGIC?.renderList?.(true);
          } catch {}
        }
      };

      // 履歴API/戻る進む/ハッシュ等
      window.addEventListener('popstate', check);
      window.addEventListener('hashchange', check);

      // pushState をフック（SPA遷移対策）
      const _push = history.pushState;
      history.pushState = function(...args){
        const ret = _push.apply(this, args);
        try { check(); } catch {}
        return ret;
      };
    })();

  }

  
  if (window._cgtnBaselineBound) { /* 二重バインド防止 */ } else {
    window._cgtnBaselineBound = true;
    //基準線の追従
    const debounce = (fn, ms=50) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
    const redraw = debounce(()=> window.CGTN_SHARED?.redrawBaseline?.(), 50);

    window.addEventListener('resize', redraw, { passive:true });
    window.addEventListener('orientationchange', redraw);
    document.addEventListener('visibilitychange', redraw);

    try{
      const sc = document.scrollingElement || document.documentElement;
      const ro = new ResizeObserver(redraw);
      ro.observe(sc);
    }catch{}
    //基準線の追従ここまで
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once:true });
  } else {
    initialize();
  }
})();
