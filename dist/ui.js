// ui.ts — パネルUI生成 / 言語 / 位置クランプ
import "./ui.css"; // ★CSSファイルをインポート
(() => {
    "use strict";
    const NS = (window.CGTN_UI = window.CGTN_UI || {});
    const SH = window.CGTN_SHARED || {};
    const LG = window.CGTN_LOGIC || {};
    const T = (k) => window.CGTN_I18N?.t?.(k) || k;
    // 初期言語設定
    let LANG = (navigator.language || "").toLowerCase().startsWith("ja")
        ? "ja"
        : "en";
    document.documentElement.lang = LANG;
    NS.getLang = () => LANG;
    SH.getLang = () => LANG;
    SH.setLangResolver?.(SH.getLang);
    const pinCurURL = chrome.runtime.getURL("assets/pin16.png");
    const prvCurURL = chrome.runtime.getURL("assets/prev16.png");
    // ★CSS注入ロジック（injectCssManyなど）は削除し、import "./ui.css" に任せます
    /* ==========================================================================
       installUI (新レイアウト)
       ========================================================================== */
    function installUI() {
        if (document.getElementById("cgpt-nav"))
            return;
        const box = document.createElement("div");
        box.id = "cgpt-nav";
        box.innerHTML = `
      <div class="cgtn-head" id="cgpt-drag">
        <div class="cgtn-brand">
          <div class="cgtn-title-main">Turn</div>
          <div class="cgtn-title-sub">Navigator</div>
          <div class="cgtn-ver">v...</div>
        </div>
      </div>

      <div class="status-cockpit">
        <label class="cgtn-power-wrapper">
          <input id="cgtn-power-toggle" type="checkbox">
          <span class="slider"></span>
        </label>
        <div class="digital-screen" id="cgtn-status-monitor">
          <span class="off-text">OFF</span>
        </div>
      </div>

      <div class="cgtn-body">
        
        <div class="cgpt-nav-group" data-role="user">
          <div class="cgpt-nav-label" data-i18n="user">User</div>
          <button class="cgtn-pill-btn" data-act="top" data-i18n="top">Top</button>
          <div class="cgpt-grid2">
             <button class="cgtn-pill-btn" data-act="prev" data-i18n="prev">Prev</button>
             <button class="cgtn-pill-btn" data-act="next" data-i18n="next">Next</button>
          </div>
          <button class="cgtn-pill-btn" data-act="bottom" data-i18n="bottom">End</button>
        </div>

        <div class="cgpt-nav-group" data-role="assistant">
          <div class="cgpt-nav-label" data-i18n="assistant">AI</div>
          <button class="cgtn-pill-btn" data-act="top" data-i18n="top">Top</button>
          <div class="cgpt-grid2">
             <button class="cgtn-pill-btn" data-act="prev" data-i18n="prev">Prev</button>
             <button class="cgtn-pill-btn" data-act="next" data-i18n="next">Next</button>
          </div>
          <button class="cgtn-pill-btn" data-act="bottom" data-i18n="bottom">End</button>
        </div>

        <div class="cgpt-nav-group" data-role="all">
          <div class="cgpt-nav-label" data-i18n="all">All</div>
          <div class="cgpt-grid2">
            <button class="cgtn-pill-btn" data-act="top">▲</button>
            <button class="cgtn-pill-btn" data-act="bottom">▼</button>
          </div>
          
          <button id="cgpt-list-btn" class="cgtn-pill-btn" data-i18n="list" style="margin-top:4px;">List</button>

          <div class="cgtn-mini-row">
             <button id="cgpt-lang-btn" class="cgtn-pill-btn" style="width:auto; padding:0 8px;">EN</button>
             <button id="cgtn-open-settings" class="cgtn-mini-btn" title="Settings">⚙</button>
             <button id="cgpt-navi-refresh" class="cgtn-mini-btn" title="Refresh">↻</button>
          </div>

          <input id="cgpt-viz" type="checkbox" style="display:none">
          <input id="cgpt-list-toggle" type="checkbox" style="display:none">
        </div>

      </div>`;
        document.body.appendChild(box);
        // バージョン取得 & 表示
        try {
            const mf = chrome.runtime.getManifest();
            const v = box.querySelector(".cgtn-ver");
            if (v)
                v.textContent = "v" + (mf.version || "1.0");
        }
        catch { }
        // Power Toggle
        const cb = box.querySelector("#cgtn-power-toggle");
        if (cb instanceof HTMLInputElement) {
            const idle = window.CGTN_APP?.isIdle?.() ?? false;
            cb.checked = !idle;
            setIdleMode(!!idle);
            cb.addEventListener("change", () => {
                if (cb.checked) {
                    window.CGTN_APP?.start?.("ui-power-on");
                }
                else {
                    window.CGTN_APP?.stop?.("ui-power-off");
                }
            });
        }
        // 言語リゾルバ
        window.CGTN_SHARED?.setLangResolver?.(() => window.CGTN_UI?.getLang?.() ||
            window.CGTN_SHARED?.getCFG?.()?.lang ||
            (window.CGTN_SHARED?.getCFG?.()?.english ? "en" : "ja"));
        // ドラッグ機能初期化
        setupDrag(box);
        // 言語設定反映
        applyLang();
        // 既存設定の反映
        const viz = box.querySelector("#cgpt-viz");
        if (viz instanceof HTMLInputElement)
            viz.checked = !!SH.getCFG().showViz;
        // リストトグルの連動 (ボタンの状態も初期化)
        const listChk = box.querySelector("#cgpt-list-toggle");
        const listBtn = box.querySelector("#cgpt-list-btn");
        if (listChk instanceof HTMLInputElement) {
            listChk.checked = !!SH.getCFG().list?.enabled;
            if (listBtn && listChk.checked)
                listBtn.classList.add("active");
        }
        // --- イベントリスナー登録 ---
        // 1. 一覧ボタン (List)
        if (listBtn && listChk instanceof HTMLInputElement) {
            listBtn.addEventListener("click", () => {
                listChk.checked = !listChk.checked;
                listBtn.classList.toggle("active", listChk.checked);
                // changeイベントを発火させて既存ロジック(shared/content.js等)に検知させる
                listChk.dispatchEvent(new Event("change", { bubbles: true }));
            });
        }
        // 2. 言語切り替え (English)
        const langBtn = box.querySelector("#cgpt-lang-btn");
        if (langBtn) {
            langBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleLang();
            });
        }
        // 3. 設定ボタン
        const settingsBtn = box.querySelector("#cgtn-open-settings");
        if (settingsBtn) {
            settingsBtn.addEventListener("click", (ev) => {
                ev.preventDefault();
                window.CGTN_UI.openSettingsModal?.();
            });
        }
        // 4. リフレッシュ
        const refreshBtn = box.querySelector("#cgpt-navi-refresh");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                try {
                    LG.rebuild?.();
                    if (SH.isListOpen?.())
                        LG.renderList?.(true);
                }
                catch (e) {
                    console.warn(e);
                }
            });
        }
        // ツールチップ適用
        window.CGTN_SHARED?.applyTooltips?.({
            '#cgpt-nav [data-role="user"] [data-act="top"]': "nav.top",
            '#cgpt-nav [data-role="user"] [data-act="bottom"]': "nav.bottom",
            '#cgpt-nav [data-role="user"] [data-act="prev"]': "nav.prev",
            '#cgpt-nav [data-role="user"] [data-act="next"]': "nav.next",
            '#cgpt-nav [data-role="assistant"] [data-act="top"]': "nav.top",
            '#cgpt-nav [data-role="assistant"] [data-act="bottom"]': "nav.bottom",
            '#cgpt-nav [data-role="assistant"] [data-act="prev"]': "nav.prev",
            '#cgpt-nav [data-role="assistant"] [data-act="next"]': "nav.next",
            "#cgpt-drag": "nav.drag",
            "#cgpt-lang-btn": "nav.lang", // ← 追加
            "#cgpt-list-btn": "nav.list", // ← 追加
            "#cgpt-navi-refresh": "nav.refresh",
            "#cgtn-open-settings": "nav.openSettings",
        }, document);
    }
    // --- ヘルパー関数群 ---
    function toggleLang() {
        const cur = (SH.getCFG?.() || {}).lang || "ja";
        const next = cur && String(cur).toLowerCase().startsWith("en") ? "ja" : "en";
        // 設定保存
        try {
            SH.saveSettingsPatch?.({ lang: next });
            if (window.CGTN_I18N)
                window.CGTN_I18N._forceLang = next;
        }
        catch (e) { }
        // UI更新
        applyLang();
        SH.updateTooltips?.();
        // リスト再描画
        if (window.CGTN_LOGIC?.isListVisible?.() ||
            !!window.CGTN_SHARED?.getCFG?.()?.list?.pinOnly) {
            window.CGTN_LOGIC.renderList(true);
        }
    }
    function applyLang() {
        const box = document.getElementById("cgpt-nav");
        if (!box)
            return;
        const t = window.CGTN_I18N?.t || ((k) => k);
        // data-i18n 属性を持つ要素を一括更新
        box.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            const txt = t(key);
            if (key && txt) {
                el.textContent = txt;
                // ★修正: Element型にはtitleがないため、HTMLElementか確認してから代入
                if (el instanceof HTMLElement) {
                    el.title = txt;
                }
            }
        });
        // 個別ボタンの更新
        const langBtn = box.querySelector("#cgpt-lang-btn");
        if (langBtn)
            langBtn.textContent = T("langBtn") || "EN/JP";
    }
    /* ==========================================================================
       updateStatusDisplay (外部API)
       ========================================================================== */
    NS.updateStatusDisplay = (text, subLabel = "READY") => {
        const screen = document.getElementById("cgtn-status-monitor");
        if (!screen)
            return;
        const cb = document.getElementById("cgtn-power-toggle");
        if (cb && !cb.checked)
            return;
        screen.innerHTML = `
      <div class="screen-label">${subLabel}</div>
      <div class="screen-value">${text}</div>
    `;
    };
    /* ==========================================================================
       setIdleMode (OFF表示)
       ========================================================================== */
    function setIdleMode(idle) {
        const box = document.getElementById("cgpt-nav");
        if (!box)
            return;
        box.classList.toggle("cgtn-idle", !!idle);
        const cb = box.querySelector("#cgtn-power-toggle");
        if (cb)
            cb.checked = !idle;
        const screen = document.getElementById("cgtn-status-monitor");
        if (screen) {
            if (idle) {
                screen.innerHTML = `<span class="off-text">OFF</span>`;
            }
            else {
                screen.innerHTML = `
          <div class="screen-label">STATUS</div>
          <div class="screen-value" style="color:#aaa">READY</div>
        `;
            }
        }
    }
    // ドラッグ機能
    function setupDrag(box) {
        const grip = box.querySelector("#cgpt-drag");
        if (!grip)
            return;
        let dragging = false, offX = 0, offY = 0;
        grip.addEventListener("pointerdown", (e) => {
            dragging = true;
            const r = box.getBoundingClientRect();
            offX = e.clientX - r.left;
            offY = e.clientY - r.top;
            try {
                grip.setPointerCapture(e.pointerId);
            }
            catch { }
        });
        window.addEventListener("pointermove", (e) => {
            if (!dragging)
                return;
            box.style.left = e.clientX - offX + "px";
            box.style.top = e.clientY - offY + "px";
        }, { passive: true });
        window.addEventListener("pointerup", (e) => {
            if (!dragging)
                return;
            dragging = false;
            try {
                grip.releasePointerCapture(e.pointerId);
            }
            catch { }
            clampPanelWithinViewport();
            SH.saveSettingsPatch({
                panel: {
                    x: box.getBoundingClientRect().left,
                    y: box.getBoundingClientRect().top,
                },
            });
        });
    }
    function clampPanelWithinViewport() {
        const box = document.getElementById("cgpt-nav");
        if (!box)
            return;
        const margin = 8;
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;
        const r = box.getBoundingClientRect();
        box.style.right = "auto";
        box.style.bottom = "auto";
        let x = Number.isFinite(r.left) ? r.left : vw - r.width - 12;
        let y = Number.isFinite(r.top) ? r.top : vh - r.height - 140;
        x = Math.min(vw - r.width - margin, Math.max(margin, x));
        y = Math.min(vh - r.height - margin, Math.max(margin, y));
        box.style.left = `${x}px`;
        box.style.top = `${y}px`;
    }
    // 公開API
    NS.installUI = installUI;
    NS.clampPanelWithinViewport = clampPanelWithinViewport;
    NS.applyLang = applyLang;
    NS.toggleLang = toggleLang;
    NS.setIdleMode = setIdleMode;
    NS.updateStatusDisplay = NS.updateStatusDisplay;
    document.addEventListener("DOMContentLoaded", applyLang);
})();
