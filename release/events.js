// events.js — クリック配線 / チェック連動（UIのdata-act / data-roleに対応）
(() => {
    "use strict";
    const SH = window.CGTN_SHARED || {};
    const UI = window.CGTN_UI || {};
    const LG = window.CGTN_LOGIC || {};
    const NS = (window.CGTN_EVENTS = window.CGTN_EVENTS || {});
    function bindEvents() {
        const box = document.getElementById("cgpt-nav");
        if (!box)
            return;
        // --- 変更監視（トグルスイッチ類） ---
        box.addEventListener("change", (e) => {
            const t = e.target;
            if (!(t instanceof HTMLInputElement))
                return;
            // ▼ 一覧表示トグル (#cgpt-list-toggle)
            if (t.id === "cgpt-list-toggle") {
                const on = t.checked;
                const btn = document.getElementById("cgpt-list-btn");
                if (btn)
                    btn.classList.toggle("active", on);
                // Logic側に命令を送る
                if (typeof LG.setListEnabled === "function") {
                    LG.setListEnabled(on);
                }
            }
            // ▼ 基準線トグル (#cgpt-viz)
            if (t.id === "cgpt-viz") {
                const on = t.checked;
                if (typeof SH.toggleViz === "function") {
                    SH.toggleViz(on);
                }
                SH.saveSettingsPatch?.({ showViz: on });
            }
        });
        // --- クリック監視（ボタン類） ---
        box.addEventListener("click", (e) => {
            const t = e.target;
            // ボタン、またはその内部要素をクリックした場合
            const el = t instanceof Element ? t.closest("button, label, input") : null;
            if (!el)
                return;
            // 設定ボタン
            if (el.id === "cgtn-open-settings") {
                if (typeof UI.openSettingsModal === "function") {
                    e.preventDefault();
                    UI.openSettingsModal();
                }
                else {
                    // フォールバック: 拡張機能の設定ページを開く
                    try {
                        chrome.runtime.sendMessage({ cmd: "openOptions" });
                    }
                    catch (_) {
                        window.open(chrome.runtime.getURL("options.html"), "_blank");
                    }
                }
                return;
            }
            // 更新ボタン
            if (el.id === "cgpt-navi-refresh") {
                e.preventDefault();
                // UIの再構築とリストの再描画
                try {
                    if (typeof LG.rebuild === "function")
                        LG.rebuild();
                    if (SH.isListOpen?.() && typeof LG.renderList === "function") {
                        LG.renderList(true);
                    }
                }
                catch (err) {
                    console.warn(err);
                }
                return;
            }
            // ナビゲーションボタン (data-actを持つもの)
            if (el instanceof HTMLElement && el.dataset.act) {
                const act = el.dataset.act;
                // 親グループから役割(role)を取得 (user/assistant/all)
                const grp = el.closest(".cgpt-nav-group");
                const role = (grp instanceof HTMLElement ? grp.dataset.role : null) || "all";
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
