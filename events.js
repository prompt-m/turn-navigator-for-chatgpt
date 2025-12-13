// events.js — クリック配線 / チェック連動（UIのdata-act / data-roleに対応）
(() => {
  'use strict';

  const SH = window.CGTN_SHARED || {};
  const UI = window.CGTN_UI || {};
  const LG = window.CGTN_LOGIC || {};
  const NS = (window.CGTN_EVENTS = window.CGTN_EVENTS || {});

  function bindEvents(){
    const box = document.getElementById('cgpt-nav');
    if (!box) return;

    // 初期チェック状態を反映
    try {
      box.querySelector('#cgpt-viz').checked  = !!(SH.getCFG()?.showViz);
      // 保存済みCFGをそのまま反映（強制OFF禁止）
      const on = !!(SH.getCFG()?.list?.enabled);
      const chk = box.querySelector('#cgpt-list-toggle');
      if (chk) chk.checked = on;

       const pinOnlyChk = document.getElementById('cgpt-pinonly');
       if (pinOnlyChk){
        pinOnlyChk.checked  = !!(SH.getCFG()?.list?.pinOnly);
        pinOnlyChk.disabled = !on;
      }
    } catch {}

    box.addEventListener('click', (e) => {
      // プレビューボタンは行内で処理（ここでは素通りにせず即終了）
      if (e.target.closest('.cgtn-preview-btn')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const el = e.target.closest('*');
      if (!el) return;

      // --- 一覧トグル ---
      const chk = el && el.closest ? el.closest('#cgpt-list-toggle') : null;
      if (chk) {
        const on = chk.checked;

        LG.setListEnabled?.(on);

        // フォーカスを外して“カーソル残り”を防ぐ
        try { chk.blur(); } catch {}

        // 一覧OFFなら付箋もOFF & 無効化
        const pinOnlyChk = document.getElementById('cgpt-pinonly');
        if (!on && pinOnlyChk) {
          const cur = SH.getCFG() || {};
          SH.saveSettingsPatch({ list: { ...(cur.list || {}), pinOnly: false } });
          pinOnlyChk.checked = false;
          pinOnlyChk.disabled = true;
        }
        return;
      }

      // --- 基準線トグル ---
      if (el.closest('#cgpt-viz')) {
        const on = el.closest('#cgpt-viz').checked;
        SH.toggleViz?.(on);
        SH.saveSettingsPatch?.({ showViz: !!on });
        return;
      }

      // --- 言語トグル ---
      if (el.closest('.cgpt-lang-btn')) {
        UI.toggleLang?.();
        return;
      }

      // --- 設定を開く ---
      if (el.closest('#cgtn-open-settings')) {
        /* ここから追加：堅牢版 openOptions */
        const openOptionsSafe = () => {
          try {
            if (chrome?.runtime?.openOptionsPage) {
              chrome.runtime.openOptionsPage(() => {
                // 稀に openOptionsPage 自体が lastError を返すことがある
                if (chrome.runtime.lastError) {
                  try { window.open(chrome.runtime.getURL('options.html'), '_blank'); } catch (_) {}
                }
              });
              return;
            }
          } catch (_) {}
          // SW 経由（MV3想定）。失敗しても最後に window.open へ
          try {
            chrome.runtime.sendMessage({ cmd: 'openOptions' }, () => {
              if (chrome.runtime.lastError) {
                try { window.open(chrome.runtime.getURL('options.html'), '_blank'); } catch (_) {}
              }
            });
          } catch (_) {
            try { window.open(chrome.runtime.getURL('options.html'), '_blank'); } catch (__){ }
          }
        };
        openOptionsSafe();
        /* ここまで追加 */
        return;
      }

      // --- ナビゲーション（Top/Bottom/Prev/Next） ---
      const btn = el.closest('button[data-act]');
      if (btn) {
        const act = btn.dataset.act;
        const role = btn.closest('.cgpt-nav-group')?.dataset.role || 'all';
        switch (act) {
          case 'top':    LG.goTop?.(role);    break;
          case 'bottom': LG.goBottom?.(role); break;
          case 'next':   LG.goNext?.(role);   break;
          case 'prev':   LG.goPrev?.(role);   break;
        }
      }
    }, false);
  }
  NS.bindEvents = bindEvents;
})();
