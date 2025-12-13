// content.js — Entry (refactor skeleton)
(function(){
  'use strict';
  if (document.getElementById('cgpt-nav')) return;

  const SH = window.CGTN_SHARED;
  const UI = window.CGTN_UI;
  const EV = window.CGTN_EVENTS;
  const LG = window.CGTN_LOGIC;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 既存の waitForChatSettled を開いて中を少しだけ強化（ログと0↔N検出）
  // 補助：現在のターン数とスクロール情報
  function _cgtnCountTurns() {
    return document.querySelectorAll('article,[data-testid^="conversation-turn"]').length;
  }

  function cgtnScrollStats(){
    const el = document.scrollingElement || document.documentElement || document.body;
    return { h: el?.scrollHeight|0, y: el?.scrollTop|0, vh: window.innerHeight|0 };
  }

  // === wait helpers (lightweight) ==========================
  function cgtnCountTurns(){
    return document.querySelectorAll('article,[data-testid^="conversation-turn"]').length;
  }
  function cgtnRoot(){ return document.querySelector('main') || document.body; }

  async function waitForChatSettled({ cid, expectZeroFirst=false, idleMs=350, tickMs=120, maxMs=12000 } = {}){
    const SH = window.CGTN_SHARED;
    const start = performance.now();
    const root  = cgtnRoot();
    if (!root) return false;

    // 監視対象（childList + attributes で十分に軽い）
    let lastCnt = cgtnCountTurns();
    let lastH   = cgtnScrollStats().h;
    let lastAt  = performance.now();
    let sawZero = (lastCnt === 0);     // すでに 0 の場合もある
    let sawPos  = (lastCnt > 0);
    let printed0toN = false;           // 転換ログの多重出力防止
    let printedNto0 = false;

    const turnsQ = 'article,[data-testid^="conversation-turn"]';
    const isTurnNode = (n) => n?.nodeType === 1 && (n.matches?.('article,[data-testid^="conversation-turn"]') || n.querySelector?.(turnsQ));

    const mo = new MutationObserver((muts)=>{
      for (const m of muts){
        if (m.type === 'childList'){
          // turnノードの増減があれば即チェック
          if ([...m.addedNodes, ...m.removedNodes].some(isTurnNode)){
            const cnt = cgtnCountTurns();
            const h   = cgtnScrollStats().h;
            if (cnt !== lastCnt || h !== lastH){

              if (!printed0toN && lastCnt === 0 && cnt > 0) {
                printed0toN = true;
              }
              if (!printedNto0 && lastCnt > 0 && cnt === 0) {
                printedNto0 = true;
              }
              lastCnt = cnt; lastH = h; lastAt = performance.now();
              if (cnt === 0) sawZero = true;
              if (cnt  > 0)  sawPos  = true;
            }
          }
        }else if (m.type === 'attributes'){
          // スクロール高さの変化も idle 判定に効かせる
          const h = cgtnScrollStats().h;
          if (h !== lastH){ lastH = h; lastAt = performance.now(); }
        }
      }
    });
    mo.observe(root, { subtree:true, childList:true, attributes:true });

    if (cid && SH?.getChatId?.() && SH.getChatId() !== cid) {
      return false; // 逆戻り/別タブ割込み
    }
    const now = performance.now();

    try{
      // フェーズA：URL切替直後は「0 → 正」の連鎖を優先
      //   - expectZeroFirst のときは 0 を一度見るまで A を継続
      //   - 低ターンの小チャットでは 0 を見ずに >0 へ行くこともあるので許容
      while (performance.now() - start < maxMs){
        if (cid && SH?.getChatId?.() && SH.getChatId() !== cid) return false; // 逆戻り/別タブ割込み
        const now = performance.now();
  
        if (expectZeroFirst){
          // 「0 を一度見る」→ その後「>0 を見る」を狙う
          if (!sawZero){ 
            // 0 を待つ間も timeout は進む
          }else if (sawPos){
            // フェーズBへ
            break;
          }
        }else{
          // 0 を見ていなくても、すでに可視化（>0）されていれば B へ
          if (sawPos) break;
        }

        while (performance.now() - start < maxMs){
          if (cid && SH?.getChatId?.() && SH.getChatId() !== cid) {
            return false;
          }
          const h   = cgtnScrollStats().h;
          const cnt = cgtnCountTurns();
          if (cnt !== lastCnt || h !== lastH){
            lastCnt = cnt; lastH = h; lastAt = performance.now();
          }
          if (performance.now() - lastAt >= idleMs) {
            return true; // 静穏
          }

        await new Promise(r => setTimeout(r, tickMs));
      }
  
      // フェーズB：変化が idleMs 止まるのを待つ（安定化）
        await new Promise(r => setTimeout(r, tickMs));
      }
      return false; // タイムアウト
    } finally {
      try{ mo.disconnect(); }catch{}
    }
  }

  // --- cgtnメッセージ受信（url-change / turn-added を一本化）---
  (function bindCgtnMessageOnce(){
    if (window.__CGTN_MSG_BOUND__) return;
    window.__CGTN_MSG_BOUND__ = true;

    let __lastCid  = null;  // 直近のchatId
    let __debTo    = 0;     // デバウンス用タイマ
    let __gen      = 0;     // 世代トークン（逆戻り防止）
    let __pageInfo = { kind:'other', cid:'', hasTurns:false }; // 直近のページ情報

    window.addEventListener('message', (ev) => {
      (async () => {  // ← async ラッパーで await が使えるように
        const d = ev && ev.data;
        if (!d || d.source !== 'cgtn') return;

        const SH = window.CGTN_SHARED, LG = window.CGTN_LOGIC;
        const kind   = d.kind   || 'other';
        const cidNow = d.cid    || SH?.getChatId?.();
        const fKind  = d.fromKind || 'other';
        const fCid   = d.fromCid  || '';

        __pageInfo = { kind, cid: cidNow || '', hasTurns: !!d.hasTurns };
        try { SH.setPageInfo?.(__pageInfo); } catch {}

        // ログ（どこから→どこへ）
        try {
          console.debug('[cgtn] nav', `${fKind}:${fCid || '-'}`, '→', `${kind}:${cidNow || '-'}`, 'hasTurns=', !!d.hasTurns);
        } catch {}

        // --- 非チャット系：クリアのみ（ONならメッセージA）
        if (kind === 'home' || kind === 'project' || kind === 'other' || kind === 'new') {
          LG?.clearListPanelUI?.();
          try {
            if (SH.getCFG?.()?.list?.enabled) {
              window.CGTN_UI?.toast?.('ここにはチャットがありません（リストは表示できません）'); // メッセージA
            }
          } catch {}
          __lastCid = null;
          __gen++;
          return;
        }

        // ---- 既存チャット（/c/...）でイベントが来た場合 ----
        if (d.type === 'url-change' || d.type === 'turn-added') {
          const prev   = __lastCid;
          __lastCid    = cidNow;
          const changed= (prev !== null && cidNow !== prev);
          const myGen  = ++__gen;

          // 先にプレビューは畳む
          try { if (d.type === 'url-change') window.CGTN_PREVIEW?.hide?.('url-change'); } catch {}

          // マスクをすばやくON（視覚フィードバック）
          try { setUiBusy?.(true); } catch {}

          clearTimeout(__debTo);
          __debTo = setTimeout(() => {
            requestAnimationFrame(() => {
              (async () => {
                if (myGen !== __gen) return; // 競合キャンセル
                // 一括待機＋rebuild＋必要ならrenderList（一覧OFFなら内部でスキップ）
                await rebuildAndRenderSafely({ /* forceList:false */ });
              })().catch(err => console.warn('[cgtn] rebuildAndRenderSafely error:', err))
                .finally(() => { try { setUiBusy?.(false); } catch {} });
            });
          }, 80); // 軽デバウンス
        }

      })();
    }, true);
  })();

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
 
    }

    // A) マウスムーブ：常時差し替え（見せない）
    //    → プレビューボタンクラスに当たったときだけ更新
    let raf = 0;
    document.addEventListener('mousemove', (e) => {
      const btn = e.target.closest?.(BTN_SEL);
      if (!btn) return;
      cancelAnimationFrame(raf);
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
  // ========= 5) URL変化でのクローズ・再描画 =========

  function closeDockOnUrlChange(){

    if (!USE_INJECT_URL_HOOK){
     // ここに既存の popstate/hashchange/setInterval(check, …) などを有効のまま
    // インジェクト方式を使う場合は発火源が二重になるのでバイパス

      let last = location.pathname + location.search;

      // リスト開状態なら自動で中身を新チャットへ差し替える
      const AUTO_SYNC_OPEN_LIST = true; // ← ここでON/OFFできる

      const check = () => {
        const cur = location.pathname + location.search;
        if (cur === last) return;

        last = cur;
        window.CGTN_PREVIEW?.hide?.('url-change');

        // ★ 開いている時だけ自動更新（閉じているなら何もしない）
        if (AUTO_SYNC_OPEN_LIST && SH.isListOpen?.()) {
          try {
            const cid = SH.getChatId?.();
            // pins → 新チャットへ切替（引数省略版でもOK）
            if (cid) LG?.hydratePinsCache?.(cid); else LG?.hydratePinsCache?.();
            LG?.rebuild?.('auto:chat-switch');
            LG?.renderList?.(true);
          } catch (e) {
            console.debug('[auto-sync] chat switch update failed:', e);
          }
        }
        // ※ 閉じている時は描画しない＝無駄コストをかけない
      };

      window.addEventListener('popstate', check);
      window.addEventListener('hashchange', check);

      // SPA用: pushState / replaceState をフック
      const _push = history.pushState;
      history.pushState = function(...args){
        const ret = _push.apply(this, args);
        try { check(); } catch {}
        return ret;
      };
      const _repl = history.replaceState;
      history.replaceState = function(...args){
        const ret = _repl.apply(this, args);
        try { check(); } catch {}
        return ret;
      };
    }
}

// 基準線の表示ON/OFF 設定画面より受信
  // === options.html からの即時反映メッセージを受ける ===
  try{
    chrome.runtime.onMessage.addListener((msg)=>{
      if (!msg || !msg.type) return;

      /* ここから追加：② タイトル問い合わせに応答（取得できなければ空文字） */
      if (msg.type === 'cgtn:get-chat-meta') {
        try {
          const chatId = SH.getChatId?.() || '';
          const title  = SH.getChatTitle?.() || '';  // document.title ベース
          sendResponse({ ok:true, chatId, title });
        } catch(e) {
          sendResponse({ ok:false, error:String(e) });
        }
        return true; // async-friendly
      }
      /* ここまで */

      /* ここから追加：② 現在チャットの集計：ターン数／アップありターン数／DLありターン数 */
      /* ここは使っていない筈 */
      if (msg.type === 'cgtn:get-chat-stats') {
        try {
          const ST = window.ST || {};
          const rows = Array.isArray(ST.all) ? ST.all : [];
          const chatId = SH.getChatId?.() || '';
          const turns = rows.length;
          let uploads = 0, downloads = 0;
          rows.forEach(article=>{
            const up = article.querySelector('[data-testid*="attachment"], .text-token-file, [data-filename]') ? 1 : 0;
            const dl = article.querySelector('a[download], button[aria-label*="Download"], [data-testid*="download"]') ? 1 : 0;
            uploads   += up;
            downloads += dl;
          });
          sendResponse({ ok:true, chatId, turns, uploads, downloads });
        } catch(e) {
          sendResponse({ ok:false, error:String(e) });
        }
        return true;
      }
      /* ここまで */

      if (msg.type === 'cgtn:pins-deleted'){
        // 表示中のチャットなら一覧をリフレッシュ
        const cid = SH.getChatId?.();
        if (!cid || (msg.chatId && msg.chatId !== cid)) return;
        LG.hydratePinsCache?.(cid);
        //const wasOpen = !!window.CGTN_SHARED?.getCFG?.()?.list?.enabled;
        //if (wasOpen) window.CGTN_LOGIC?.renderList?.(false);
        // isListOpen === true のときだけ描画（閉じていれば何もしない）
        //　設定画面で付箋データが削除されたとき、リストを更新する処理
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
      // すでに差し込まれていればスキップ
      if (document.getElementById('cgtn-url-hook')) {
        return;
      }
      // すでにIIFEが起動済みならスキップ（page側フラグを拾えない場合もあるので二段ガード）
      if (window.__CGTN_URL_HOOKED__ === true) {
        return;
      }

      const url = chrome.runtime.getURL('inject_url_hook.js');
      const s   = document.createElement('script');
      s.id      = 'cgtn-url-hook';
      s.src     = url;
      s.async   = false; // 実行順の安定化
      s.onload  = () => {
        // 読み込み完了後に掃除したい場合はここで remove する（実行済みだからOK）
        // s.remove();
      };
      s.onerror = (e) => console.warn('[cgtn] inject_url_hook failed:', e);

      (document.documentElement || document.head || document.body).appendChild(s);

    } catch (e) {
      console.warn('injectUrlChangeHook failed', e);
    }
  }

  let _lastUrlSig = '';
  let _navSeq = 0; // 遷移の世代カウンタ

  function handleUrlChangeMessage(){
    const cur = location.pathname + location.search;
    if (cur === _lastUrlSig){
      return;
    }
    _lastUrlSig = cur;
    const mySeq = ++_navSeq;

    try{
      const LG = window.CGTN_LOGIC, SH = window.CGTN_SHARED;
      window.CGTN_PREVIEW?.hide?.('url-change');

      // 1) まず確実に閉じて残像を消す
      LG?.setListEnabled?.(false);
      LG?.clearListPanelUI?.();

      // 2) 旧mainを監視していたObserverは切る（後述③のensureが再アタッチ）
      LG?.detachTurnObserver?.();

      // 3) すぐ再アタッチしてもOK（idempotent：後述③）
      LG?.installAutoSyncForTurns?.();

      // 4) バッジとタイトルは空に
      LG?.updatePinOnlyBadge?.();
      LG?.updateListChatTitle?.();

      // （任意の追加）“一覧チェックはONのまま”なら、描画準備完了後に自動再オープン★★★★
      // ※ 自動再構築はここではせず、setListEnabled(true) に任せる
      const wantReopen = !!(SH.getCFG?.().list?.enabled);

      if (wantReopen){
        waitForChatMain(()=>{ if (mySeq===_navSeq) LG?.setListEnabled?.(true); });
      }
    }catch(e){
      console.warn('[cgtn:url] close-on-nav failed', e);
    }
  }

  // 成功したら onReady、タイムアウトしたら onIdle を呼ぶ
  /* UNUSED */ 
  function waitForChatMain(onReady, onIdle, timeout = 4000) {
    const started = performance.now();
    const ok = () => {
      onReady?.();
    };
    const idle = () => {
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

  /* UNUSED */ 
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


//  let _turnObs = null;
//  let _observedRoot = null;

//  CGTN_LOGIC.detachTurnObserver = function(){
  let _turnObs = null;
  let _observedRoot = null;

  LG.detachTurnObserver = function(){
    try { _turnObs?.disconnect(); } catch {}
    _turnObs = null;
    _observedRoot = null;
  };

  // ========= リスト表示中の「ターン追加」自動更新（MOは1本のみ） =========
  //  function installAutoSyncForTurns(){
  CGTN_LOGIC.installAutoSyncForTurns = function installAutoSyncForTurns(){
    const LG = CGTN_LOGIC, SH = CGTN_SHARED;

    // 自作UI除外（無限ループ防止）
    const inOwnUI = (node) => {
      if (!node || node.nodeType !== 1) return false;
      return node.closest?.('[data-cgtn-ui]') ||
         document.getElementById('cgpt-nav')?.contains(node) ||
         document.getElementById('cgpt-list-panel')?.contains(node);
    };

    const root = document.querySelector('main') || document.body;

    if (_observedRoot === root && _turnObs) return; // 既に最新を監視中
    // 旧rootを解除 → 新rootに張替え
    CGTN_LOGIC.detachTurnObserver();

    let to = 0;
    const kick = () => {
      if (!SH.isListOpen?.()) return;        // 閉じている間は完全ノーオペ
      clearTimeout(to);
      to = setTimeout(() => {
        try{
          LG.rebuild?.();
          LG.renderList?.(true);
        }catch(e){}
      }, 300); // 300msデバウンス
    };
    _turnObs = new MutationObserver((muts)=>{

      // リストが閉じていてもナビの ST 更新が必要なので常に監視する '25.11.20
      //if (!SH.isListOpen?.()) return;
      for (const m of muts){
        if (inOwnUI(m.target)) continue;

        // childList 追加・削除で article / role を検知
        if (m.type === 'childList'){
          const arr = [...m.addedNodes, ...m.removedNodes];
          const hit = arr.some(n => n?.nodeType===1 && (
            n.matches?.('article,[data-message-author-role]') ||
            n.querySelector?.('article,[data-message-author-role]')
          ));
          if (hit){ kick(); break; }
        } else if (m.type === 'characterData' || m.type === 'attributes'){
          // ストリーミングの文字更新や属性変更でも近傍が会話ならトリガ
          const host = m.target?.nodeType===3 ? m.target.parentElement : m.target;
          if (host?.closest?.('article,[data-message-author-role]')) { kick(); break; }
        }
      }
    });

    try {
      _turnObs.observe(root, {
        childList:true,
        subtree:true,
        characterData:false,
        attributes:false
      });
      _observedRoot = root;
    } catch(e) {
      console.warn('[auto-sync] observe failed', e);
    }
  }

  // 1) 最初の turn-added を待つ Promise
  function waitForFirstTurnAdded(timeout = 15000){
    return new Promise(resolve => {
      const to = setTimeout(() => {
        window.removeEventListener('message', onMsg, true);
        resolve('timeout');
      }, timeout);
      const onMsg = (ev) => {
        const d = ev?.data;
        if (d && d.source === 'cgtn' && d.type === 'turn-added') {
          window.removeEventListener('message', onMsg, true);
          clearTimeout(to);
          resolve('turn-added');
        }
      };
      window.addEventListener('message', onMsg, true);
    });
  }


  // 画面操作を一時的にブロック
  function setUiBusy(busy = true) {
    const ids = ['cgpt-nav', 'cgpt-list-panel']; // 必要なら増やす
    for (const id of ids) {
      const host = document.getElementById(id);
      if (!host) continue;

      // CSS-only 無効化
      host.classList.toggle('loading', busy);

      // 半透明マスク（見た目も分かりやすく）
      let mask = host.querySelector(':scope > .cgtn-mask');
      if (busy) {
        if (!mask) {
          mask = document.createElement('div');
          mask.className = 'cgtn-mask';
          Object.assign(mask.style, {
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(2px)', cursor: 'wait', zIndex: 9999, pointerEvents: 'auto'
          });
          // relative が無いと被せられない
          if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
          host.appendChild(mask);
        }
      } else {
        mask?.remove();
      }
    }
  }

  // CSS（どこかで1回注入）
  (function ensureBusyStyle(){
    if (document.getElementById('cgtn-busy-style')) return;
    const st = document.createElement('style');
    st.id = 'cgtn-busy-style';
    st.textContent = `
      #cgpt-nav.loading, #cgpt-list-panel.loading { pointer-events: none; opacity: .6; cursor: not-allowed; }
    `;
    document.head.appendChild(st);
  })();

  let __buildGen = 0;

  async function rebuildAndRenderSafely({ forceList = false } = {}) {
    const LG = window.CGTN_LOGIC, SH = window.CGTN_SHARED;
    const myGen = ++__buildGen;
    setUiBusy(true);
    try {
      // どちらか早い方（turn-added or ensureTurnsReady）
      await Promise.race([ waitForFirstTurnAdded(15000), LG.ensureTurnsReady?.() ]);
      // もう一度だけ安定待ち
      await LG.ensureTurnsReady?.();
      // 競合キャンセル
      if (myGen !== __buildGen) return;

      LG.rebuild?.();
      if (myGen !== __buildGen) return;

      const kind = SH.getPageInfo?.()?.kind || 'other';
      const on   = forceList || !!(SH.getCFG?.()?.list?.enabled);
      if (kind === 'chat' && on) {
        await LG.renderList?.(forceList);
      }
    } finally {
      if (myGen === __buildGen) setUiBusy(false);
    }
  }


  // ========= 9) 初期セットアップ ========= '25.12.6 改

  async function initialize(){

    // ★ 初期処理を 1 秒遅らせる（ChatGPT 本体のロード完了を待つ） '25.12.6
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 設定ロード & v2 ストレージ移行
    await SH.loadSettings();
    try {
      // v2 移行を使う場合はここで 1 回だけ（無ければ無視される）
      await SH.migratePinsStorageOnce?.();
    } catch {}

    // UI 構築 & フォーカス保護まわり
    UI.installUI();
    ensureFocusPark();
    installFocusStealGuard();

    // 言語・位置などの初期反映
    UI.applyLang();
    UI.clampPanelWithinViewport();

    // 基準線の初期表示（保存 showViz を尊重）
    try {
      const cfg = SH?.getCFG?.();
      SH?.renderViz?.(cfg, !!cfg?.showViz);
    } catch {}

    // イベント系のバインド
    EV.bindEvents();
    bindPreviewDockOnce();
    bindBaselineAutoFollow();

    // URL 変更フック（必要な場合のみ）
    if (USE_INJECT_URL_HOOK) {
      injectUrlChangeHook();
    }

    // ゴミになったゼロ件レコードの掃除
    try {
      SH.cleanupZeroPinRecords?.();
    } catch {}

    // ★ 初回 rebuild は「UI とイベントが一通り整ったあと」で、
    //   かつ ChatGPT 本体の初期化とも競合しないよう 1.2 秒遅らせて実行 '25.12.6
    setTimeout(() => {
      rebuildAndRenderSafely({ forceList:true })
        .catch(e => console.warn('[init-delayed] rebuildAndRenderSafely failed', e));
    }, 1200);

    // viewport 変化でナビ位置クランプ
    window.addEventListener(
      'resize',
      () => UI.clampPanelWithinViewport(),
      { passive:true }
    );
    window.addEventListener(
      'orientationchange',
      () => UI.clampPanelWithinViewport()
    );
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
