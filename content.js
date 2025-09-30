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
    return (nav && (node===nav || nav.contains(node))) ||
           (list && (node===list || list.contains(node)));
  }

  function initialize(){
    SH.loadSettings(() => {
      UI.installUI();

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

          // ★ここに選択範囲削除を入れる
          try { const sel = getSelection(); sel && sel.removeAllRanges(); } catch{}

          const park = document.getElementById('cgtn-focus-park');
          if (!park) return;

          // 1) キャレット（選択範囲）を削除
          try {
            const sel = getSelection();
            if (sel) sel.removeAllRanges();
          } catch {}

          // 2) ページ側の focus が走り終わった後で park に移す
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

      // [追記] リスト「…」プレビューのイベント委譲（1回だけ）
      (function bindRowPreviewOnce(){
        if (document._cgtnPreviewBound) return;
        document._cgtnPreviewBound = true;
      
        let pop = null, raf = 0;

        function ensurePop(){
          if (pop) return pop;
          pop = document.createElement('div');
          pop.className = 'cgtn-popover';
          document.body.appendChild(pop);
          return pop;
        }
        function position(x, y){
          if (!pop) return;
          const pad = 8;
          const w = pop.offsetWidth, h = pop.offsetHeight;
          let left = x + 10, top = y + 14;
          if (left + w + pad > innerWidth)  left = innerWidth  - w - pad;
          if (top  + h + pad > innerHeight) top  = innerHeight - h - pad;
          pop.style.left = left + 'px';
          pop.style.top  = top  + 'px';
        }
        function show(btn, e){
          const row = btn.closest('.row'); if (!row) return;
          const text = row.dataset.preview || '(内容なし)';
          const box = ensurePop();
          box.textContent = text;
          box.setAttribute('data-show', '1');
          position(e.clientX, e.clientY);
        }
        function hide(){ if (pop) pop.removeAttribute('data-show'); }

        // マウスオーバーで表示
        document.addEventListener('mouseenter', (e) => {
          const btn = e.target.closest?.('.cgtn-more[data-act="preview"]');
          if (!btn) return;
          show(btn, e);
        }, true);

        // マウス移動で追従（rAFで負荷軽減）
        document.addEventListener('mousemove', (e) => {
          if (!pop || pop.getAttribute('data-show') !== '1') return;
          cancelAnimationFrame(raf);
          const x = e.clientX, y = e.clientY;
          raf = requestAnimationFrame(() => position(x, y));
        }, true);

        // マウスが外れたら閉じる
        document.addEventListener('mouseleave', (e) => {
          if (e.target.closest?.('.cgtn-more[data-act="preview"]')) hide();
        }, true);

        // スクロール・ウィンドウ外れ・Esc で閉じる（任意）
        document.addEventListener('scroll', hide, {capture:true, passive:true});
        window.addEventListener('blur', hide);
        document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') hide(); });
      })();

      // content.js initialize() 内、EV.bindEvents(); の直後あたり
      (function bindPreviewEvents(){
        if (document._cgtnPreviewBound) return;
        document._cgtnPreviewBound = true;

        document.addEventListener('mouseover', (e) => {
          const btn = e.target.closest('.cgtn-preview-btn');
          if (!btn) return;

          // 既存popupを消す
          document.querySelectorAll('.cgtn-preview-popup').forEach(n => n.remove());

          const row = btn.closest('.row');
          if (!row) return;

          // 本文を取得
          const turnKey = row.dataset.turn;
          const art = window.CGTN_LOGIC?.ST?.all?.find(a => window.CGTN_LOGIC?.getTurnKey?.(a) === turnKey);
          if (!art) return;
          const head = window.CGTN_LOGIC?.listHeadNodeOf?.(art) || art;
          const text = (head.innerText || '').replace(/\s+/g,' ').trim();

          // popup生成
          const popup = document.createElement('div');
          popup.className = 'cgtn-preview-popup';
          popup.textContent = text || '（内容なし）';

          document.body.appendChild(popup);

          // ボタンの位置に配置
          const r = btn.getBoundingClientRect();
          popup.style.left = (window.scrollX + r.right + 8) + 'px';
          popup.style.top  = (window.scrollY + r.top) + 'px';
        });

        document.addEventListener('mouseout', (e) => {
          if (e.target.closest('.cgtn-preview-btn')) {
            setTimeout(() => {
              document.querySelectorAll('.cgtn-preview-popup').forEach(n => n.remove());
            }, 200);
          }
        });
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
        window.addEventListener('pagehide', () => { try { _cgtnRO.disconnect(); } catch {} }, { once: true });
      } catch {}

      // 初回も一度呼ぶ（初期描画）
      requestAnimationFrame(_cgtnRedrawBaseline);
      // === 基準線の自動追従 ここまで===

      // 自前UIの変化は無視してループを断つ
      mo = new MutationObserver((muts)=>{
        for (const m of muts){
          if (isOwnUI(m.target)) return; // ← 重要：自前UIなら短絡 return
        }
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
  }

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once:true });
  } else {
    initialize();
  }
})();
