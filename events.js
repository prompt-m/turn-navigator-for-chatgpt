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
      box.querySelector('#cgpt-viz').checked  = !!SH.getCFG()?.showViz;
      box.querySelector('#cgpt-list-toggle').checked = !!(SH.getCFG()?.list?.enabled);
      const pinOnlyChk = document.getElementById('cgpt-pinonly');
      if (pinOnlyChk){
        pinOnlyChk.checked  = !!(SH.getCFG()?.list?.pinOnly);
        pinOnlyChk.disabled = !SH.getCFG()?.list?.enabled;
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

      // --- 「付箋のみ」ボタン（上部トグル） ---
      if (el.closest('#cgpt-pin-filter')) {
        const btn  = el.closest('#cgpt-pin-filter');
        const cur  = !!(SH.getCFG()?.list?.pinOnly);
        const next = !cur;

        // 1) cfg 更新（メモリ先更新なので、この時点で CFG は新値）
        SH.saveSettingsPatch({ list: { ...(SH.getCFG()?.list||{}), pinOnly: next } }, () => {
          // 2) 描画（新CFGを読む）
          window.CGTN_LOGIC?.renderList?.(true);
          // 3) フッター（新CFGを読む）
          window.CGTN_LOGIC?.updateListFooterInfo?.();
        });

        // UI状態（ARIA）は即時反映でOK
        btn.setAttribute('aria-pressed', String(next));
        return;
      }

      // --- 一覧トグル ---
      if (el.closest('#cgpt-list-toggle')) {
        const on = el.closest('#cgpt-list-toggle').checked;
//console.debug('bindEvents 一覧トグル [forceListPanelOffOnBoot] LG?.setListEnabled on: ',on);
        LG.setListEnabled?.(on);

        // 一覧OFFなら付箋もOFF & 無効化
        const pinOnlyChk = document.getElementById('cgpt-pinonly');
        if (!on && pinOnlyChk){
          const cur = SH.getCFG() || {};
          SH.saveSettingsPatch({ list:{ ...(cur.list||{}), pinOnly:false } });
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
        // 1) 正規ルート：options_ui に従ってタブで開く
        if (chrome.runtime?.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        } else {
          // 2) 古い環境などのフォールバックは SW に委譲（window.open は使わない）
          chrome.runtime.sendMessage({ cmd: 'openOptions' });
        }
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
//console.log("event.js bindEvents");
  NS.bindEvents = bindEvents;
})();
