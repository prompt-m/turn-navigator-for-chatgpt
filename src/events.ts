// events.js
(() => {
  "use strict";
  const SH = window.CGTN_SHARED || {};
  const UI = window.CGTN_UI || {};
  const LG = window.CGTN_LOGIC || {};
  const NS = (window.CGTN_EVENTS = window.CGTN_EVENTS || {});

  function bindEvents() {
    const box = document.getElementById("cgpt-nav");
    if (!box) return;

    // Changeイベント (トグルスイッチ) - 変更なし
    box.addEventListener("change", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.id === "cgpt-list-toggle") {
        const on = t.checked;
        const btn = document.getElementById("cgpt-list-btn");
        if (btn) btn.classList.toggle("active", on);
        if (typeof LG.setListEnabled === "function") LG.setListEnabled(on);
      }
      if (t.id === "cgpt-viz") {
        const on = t.checked;
        if (typeof SH.toggleViz === "function") SH.toggleViz(on);
        SH.saveSettingsPatch?.({ showViz: on });
      }
    });

    // Clickイベント
    box.addEventListener("click", (e) => {
      const t = e.target;
      const el =
        t instanceof Element
          ? t.closest("button, label, input, .cgtn-ver")
          : null;
      if (!el) return;

      // ★追加: バージョン番号(.cgtn-ver)をクリックでログ表示
      if (el.classList.contains("cgtn-ver")) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof LG.showLogs === "function") LG.showLogs();
        return;
      }

      // 設定ボタン
      if (el.id === "cgtn-open-settings") {
        if (typeof UI.openSettingsModal === "function") {
          e.preventDefault();
          UI.openSettingsModal();
        } else {
          try {
            chrome.runtime.sendMessage({ cmd: "openOptions" });
          } catch (_) {
            window.open(chrome.runtime.getURL("options.html"), "_blank");
          }
        }
        return;
      }

      // ★修正: 更新ボタン
      if (el.id === "cgpt-navi-refresh") {
        e.preventDefault();

        // 1. "Refresh..." と表示
        console.log(" updateStatusDisplay Refresh...");
        UI.updateStatusDisplay?.("Refresh...");

        // 2. UI描画をブロックしないよう少し待ってから処理開始
        setTimeout(async () => {
          try {
            if (typeof LG.rebuild === "function") LG.rebuild();
            if (SH.isListOpen?.() && typeof LG.renderList === "function") {
              await LG.renderList(true);
            }
          } catch (err) {
            // エラー時はログに保存
            LG.logError?.("Refresh Failed", err);
          } finally {
            // 3. 終わったら数値表示に戻す
            LG.updateStatus?.();
          }
        }, 50);
        return;
      }

      // ナビゲーションボタン
      if (el instanceof HTMLElement && el.dataset.act) {
        const act = el.dataset.act;
        const grp = el.closest(".cgpt-nav-group");
        const role =
          (grp instanceof HTMLElement ? grp.dataset.role : null) || "all";
        switch (act) {
          case "top":
            LG.goTop?.(role);
            break;
          case "bottom":
            LG.goBottom?.(role);
            break;
          case "next":
            LG.goNext?.(role);
            break;
          case "prev":
            LG.goPrev?.(role);
            break;
        }
      }
    });
  }
  NS.bindEvents = bindEvents;
})();
