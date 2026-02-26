// ui.ts — パネルUI生成 / 言語 / 位置クランプ
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
    // =======================================================
    // ★ マウスカーソルの動的適用（CSSファイル分離対応）
    // =======================================================
    const style = document.createElement("style");
    style.textContent = `
    .cgtn-clip-pin { cursor: url(${pinCurURL}), pointer !important; }
    .cgtn-preview-btn { cursor: url(${prvCurURL}), pointer !important; }
  `;
    document.head.appendChild(style);
    // ★ 追加: テーマ適用関数
    NS.applyTheme = function (themeObj) {
        const mode = themeObj?.mode || "auto";
        let isDark = false;
        if (mode === "dark") {
            isDark = true;
        }
        else if (mode === "auto") {
            // OSの設定がダークモードかどうかを判定
            isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        }
        if (isDark) {
            document.body.setAttribute("data-cgtn-theme", "dark");
        }
        else {
            document.body.removeAttribute("data-cgtn-theme");
        }
    };
    // OSのテーマ変更をリアルタイム監視して自動切り替え
    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", () => {
        const currentMode = SH.getCFG?.()?.theme?.mode || "auto";
        if (currentMode === "auto")
            NS.applyTheme({ mode: "auto" });
    });
    /* ==========================================================================
       installUI
       ========================================================================== */
    function installUI() {
        if (document.getElementById("cgpt-nav"))
            return;
        const box = document.createElement("div");
        box.id = "cgpt-nav";
        box.innerHTML = `
      <div class="cgtn-unified-header" id="cgpt-drag" title="${T("headerDrag")}">
        <div class="cgtn-header-top">
          <div class="cgtn-brand-group">
            <div class="cgtn-title-main">Turn</div>
            <div class="cgtn-title-sub">Navigator</div>
          </div>
          <div class="cgtn-ver">v...</div>
        </div>
        <div class="cgtn-header-bottom">
          <label class="cgtn-power-wrapper">
             <input id="cgtn-power-toggle" type="checkbox">
             <span class="slider"></span>
          </label>
          <div class="digital-screen" id="cgtn-status-monitor">
            <span class="off-text">OFF</span>
          </div>
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
        </div>

        <div class="cgpt-nav-group" data-role="tools">
          <div class="cgpt-nav-label" data-i18n="tools">Tool</div>
          <button id="cgpt-list-btn" class="cgtn-pill-btn" data-i18n="list">List</button>
        </div>

        <div class="cgpt-nav-group" data-role="others">
          <div class="cgpt-nav-label" data-i18n="others">Other</div>
          <button id="cgpt-navi-refresh" class="cgtn-pill-btn" data-i18n="refresh">Refresh</button>
          <button id="cgtn-open-settings" class="cgtn-pill-btn" data-i18n="settings">Settings</button>
          <button id="cgpt-lang-btn" class="cgtn-pill-btn" data-i18n="langBtn">EN/JP</button>
        </div>

        <input id="cgpt-viz" type="checkbox" style="display:none">
        <input id="cgpt-list-toggle" type="checkbox" style="display:none">

      </div>`;
        // ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
        // ★修正: 画面に出す「前」にアプリの状態を確認する
        const app = window.CGTN_APP;
        const isIdle = app?.isIdle?.() ?? false;
        // もしOFFなら、画面に出る前にあらかじめ「最小化」と「文字」をセットしておく
        if (isIdle) {
            box.classList.add("disabled");
            const monitor = box.querySelector("#cgtn-status-monitor");
            if (monitor)
                monitor.innerHTML = `<span class="off-text">OFF</span>`;
        }
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
        document.body.appendChild(box);
        // バージョン取得
        try {
            const mf = chrome.runtime.getManifest();
            const v = box.querySelector(".cgtn-ver");
            if (v)
                v.textContent = "v" + (mf.version || "1.0");
        }
        catch { }
        // Power Toggle 2026.02.16
        const cb = box.querySelector("#cgtn-power-toggle");
        if (cb instanceof HTMLInputElement) {
            // ★変更: 初期状態は「現在アプリがIdleかどうか」で決める
            const app = window.CGTN_APP;
            const isIdle = app?.isIdle?.() ?? false;
            cb.checked = !isIdle;
            // ★追加: スイッチだけでなく「パネル全体」の見た目も即座に同期する
            if (isIdle) {
                // パネル最小化＆「OFF」文字を即適用
                window.CGTN_UI?.setPanelOffState?.();
            }
            else {
                // ONの場合は、とりあえず「Standby」で初期化しておく
                // (直後に走る rebuild が、正しいターン数に上書きしてくれます)
                if (typeof window.CGTN_UI?.updateStatusDisplay === "function") {
                    window.CGTN_UI.updateStatusDisplay("Standby");
                }
            }
            // ★追加: 状態が変わったら保存する
            cb.addEventListener("change", () => {
                const isOn = cb.checked;
                // 設定保存
                const SH = window.CGTN_SHARED;
                SH.saveSettingsPatch?.({ navEnabled: isOn });
                // 動作切り替え
                if (isOn) {
                    app?.start?.("ui-power-on");
                }
                else {
                    app?.stop?.("ui-power-off");
                }
            });
        }
        // ドラッグ機能
        setupDrag(box);
        // 言語設定反映
        applyLang();
        // 既存設定の反映
        const viz = box.querySelector("#cgpt-viz");
        if (viz instanceof HTMLInputElement)
            viz.checked = !!SH.getCFG().showViz;
        const listChk = box.querySelector("#cgpt-list-toggle");
        const listBtn = box.querySelector("#cgpt-list-btn");
        if (listChk instanceof HTMLInputElement) {
            // 初期起動時は必ずリストOFFからスタートする
            listChk.checked = false;
            if (listBtn)
                listBtn.classList.remove("active");
        }
        // --- イベントリスナー ---
        if (listBtn && listChk instanceof HTMLInputElement) {
            listBtn.addEventListener("click", () => {
                listChk.checked = !listChk.checked;
                listBtn.classList.toggle("active", listChk.checked);
                listChk.dispatchEvent(new Event("change", { bubbles: true }));
            });
        }
        const langBtn = box.querySelector("#cgpt-lang-btn");
        if (langBtn) {
            langBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleLang();
            });
        }
        const settingsBtn = box.querySelector("#cgtn-open-settings");
        if (settingsBtn) {
            settingsBtn.addEventListener("click", (ev) => {
                ev.preventDefault();
                window.CGTN_UI.openSettingsModal?.();
            });
        }
        // =========================================================
        // ★追加: 入力設定の表示 (幅対策版: 2行表示) 2026.02.11
        // =========================================================
        const sendKeyDiv = document.createElement("div");
        sendKeyDiv.id = "cgpt-sendkey-info"; //
        sendKeyDiv.style.marginTop = "8px";
        sendKeyDiv.style.fontSize = "10px";
        sendKeyDiv.style.color = "#888";
        sendKeyDiv.style.lineHeight = "1.3";
        sendKeyDiv.style.textAlign = "center"; //
        const cfg = SH.getCFG?.() || {};
        const method = cfg.sendKeyMethod || "enter";
        // 短縮文言を取得
        const label = T("nav.sendKeyInfo"); // "入力設定："
        let valText = "";
        if (method === "ctrl_enter")
            valText = T("nav.sk_ctrl"); // "[Ctrl+Enter]"
        else if (method === "alt_enter")
            valText = T("nav.sk_alt"); // "[Alt+Enter]"
        else
            valText = T("nav.sk_enter"); // "[Enter]"
        // HTMLで2行にする
        // (SH.titleEscape がなければそのまま label/valText を使います)
        const safeLabel = SH.titleEscape ? SH.titleEscape(label) : label;
        const safeVal = SH.titleEscape ? SH.titleEscape(valText) : valText;
        // ★修正: HTML構造
        // ラベルにもIDを振り、値部分も中央揃えで見やすく調整
        sendKeyDiv.innerHTML = `
      <div data-i18n="nav.sendKeyInfo">${T("nav.sendKeyInfo")}</div>
      <div id="cgpt-sendkey-val" style="font-weight:bold; color:#ccc; margin-top:2px;">${SH.titleEscape ? SH.titleEscape(valText) : valText}</div>
    `;
        // その他グループ(data-role="others")に追加
        const grpOthers = box.querySelector('.cgpt-nav-group[data-role="others"]');
        if (grpOthers)
            grpOthers.appendChild(sendKeyDiv);
        // =========================================================
        // ツールチップ
        window.CGTN_SHARED?.applyTooltips?.({
            '#cgpt-nav [data-role="user"] [data-act="top"]': "nav.top",
            '#cgpt-nav [data-role="user"] [data-act="bottom"]': "nav.bottom",
            '#cgpt-nav [data-role="user"] [data-act="prev"]': "nav.prev",
            '#cgpt-nav [data-role="user"] [data-act="next"]': "nav.next",
            '#cgpt-nav [data-role="assistant"] [data-act="top"]': "nav.top",
            '#cgpt-nav [data-role="assistant"] [data-act="bottom"]': "nav.bottom",
            '#cgpt-nav [data-role="assistant"] [data-act="prev"]': "nav.prev",
            '#cgpt-nav [data-role="assistant"] [data-act="next"]': "nav.next",
            "#cgpt-lang-btn": "nav.lang",
            "#cgpt-list-btn": "nav.list",
            "#cgpt-navi-refresh": "nav.refresh",
            "#cgtn-open-settings": "nav.openSettings",
            "#cgpt-drag": "headerDrag",
        }, document);
    }
    // --- ヘルパー関数群 ---
    function toggleLang() {
        const cur = (SH.getCFG?.() || {}).lang || "ja";
        const next = cur && String(cur).toLowerCase().startsWith("en") ? "ja" : "en";
        try {
            SH.saveSettingsPatch?.({ lang: next });
            if (window.CGTN_I18N)
                window.CGTN_I18N._forceLang = next;
        }
        catch (e) { }
        applyLang();
        SH.updateTooltips?.();
        if (window.CGTN_LOGIC?.isListVisible?.() ||
            !!window.CGTN_SHARED?.getCFG?.()?.list?.pinOnly) {
            window.CGTN_LOGIC.renderList(true);
        }
    }
    function applyLang() {
        const box = document.getElementById("cgpt-nav");
        if (!box)
            return;
        // 1. ナビパネル内のテキスト更新
        // (title属性の更新は削除してOK -> SH.updateTooltipsにお任せ)
        box.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            const txt = T(key);
            if (key && txt) {
                el.textContent = txt;
                // el.title = txt; // ← ★削除OK！
            }
        });
        // =========================================================
        // ★追加: [Enter] などの値部分を現在の言語と設定で更新
        // =========================================================
        const skVal = document.getElementById("cgpt-sendkey-val");
        if (skVal) {
            const cfg = SH.getCFG?.() || {};
            const method = cfg.sendKeyMethod || "enter";
            // 設定値に合わせてキーを選び直す
            let key = "nav.sk_enter";
            if (method === "ctrl_enter")
                key = "nav.sk_ctrl";
            else if (method === "alt_enter")
                key = "nav.sk_alt";
            // 翻訳してセット
            skVal.textContent = T(key);
        }
        // =========================================================
        // 2. ドラッグヘッダー
        // ★ installUI の applyTooltips リストに "#cgpt-drag": "headerDrag" を追加して、
        //    ここの手動更新は削除してしまうのが一番スマートです。
        // const dragHeader = box.querySelector("#cgpt-drag");
        // if (dragHeader instanceof HTMLElement) dragHeader.title = T("headerDrag");
        // 3. 電源スイッチ (ON/OFFの状態によって文言が変わる特殊なやつ)
        // ★これだけは「状態」に依存するので、専用関数を呼ぶ今のまま残します
        const cb = box.querySelector("#cgtn-power-toggle");
        if (cb instanceof HTMLInputElement)
            updateSwitchTooltip(cb); // ← ★キープ！
        // 4. プレビュータイトル (テキスト更新)
        const h = document.querySelector("#cgtn-preview-title");
        // const T = ... (上で定義してあればOK)
        if (h) {
            h.textContent = T("preview");
        }
        // 5. リストパネル関連 (Logicにお任せ)
        try {
            window.CGTN_LOGIC?.applyListFilterLang?.();
            window.CGTN_LOGIC?.updateListFooterInfo?.();
            window.CGTN_LOGIC?.updateListChatTitle?.();
        }
        catch (e) {
            SH.logError("List panel lang update failed", e);
        }
        // 6. ツールチップ一括更新 (Sharedにお任せ)
        // これがリストパネル内のツールチップも含めて全部書き換えてくれます
        window.CGTN_SHARED?.updateTooltips?.();
    }
    function updateSwitchTooltip(cb) {
        if (!cb)
            return;
        const label = cb.parentElement;
        if (label) {
            label.title = cb.checked ? T("tipOff") : T("tipOn");
        }
    }
    // =================================================================
    // ★追加: ナビパネル上の統計情報更新 (Idle時用) 2026.02.12
    // =================================================================
    NS.updateNavStats = function (user, ai, pin) {
        const box = document.getElementById("cgpt-nav");
        if (!box)
            return;
        // デジタルスクリーンエリア (#cgtn-status-monitor) を更新
        const monitor = box.querySelector("#cgtn-status-monitor");
        if (monitor) {
            // 例: "U:10 A:10 P:2" のように短く表示
            // または既存のデザインに合わせて調整
            // monitor.textContent = `U:${user} A:${ai}`;
            // OFF表示を消して数字を出す場合:
            monitor.innerHTML = `
        <span style="font-size:10px; color:#ccc;">All:</span><span style="font-weight:bold; margin-left:2px;">${user + ai}</span>
        ${pin > 0 ? `<span style="font-size:10px; color:#ff9800; margin-left:4px;">📌${pin}</span>` : ""}
      `;
            monitor.classList.remove("off-text"); // "OFF" クラスがあれば外す
        }
    };
    // ★修正: "数字 / 数字" のパターンならHTMLタグで装飾する
    NS.updateStatusDisplay = (text, subLabel) => {
        const screen = document.getElementById("cgtn-status-monitor");
        if (!screen)
            return;
        const cb = document.getElementById("cgtn-power-toggle");
        if (cb && !cb.checked)
            return;
        let content = text;
        // 正規表現で "数字 / 数字" を検出
        const m = text.match(/^(\d+)\s*\/\s*(\d+)$/);
        if (m) {
            // ★修正: 2段組み（上が現在値、下が / 総数）
            content = `
        <div class="curr">${m[1]}</div>
        <div class="sub">
          <span class="sep">/</span><span class="total">${m[2]}</span>
        </div>`;
        }
        // Loading... の場合はクラスを付けて文字サイズ調整
        const isLong = text.length > 8;
        const cls = isLong ? "screen-value loading" : "screen-value";
        screen.innerHTML = `<div class="${cls}">${content}</div>`;
    };
    // ★追加: パネルを確実にOFF状態（最小化＋OFF表示）にする専用関数
    NS.setPanelOffState = function () {
        const nav = document.getElementById("cgpt-nav");
        if (nav) {
            nav.classList.add("disabled"); // 確実に見えなくする
        }
        // ==========================================
        // ★追加: スイッチの見た目も確実にOFF（左側）にする
        const powerToggle = document.getElementById("cgtn-power-toggle");
        if (powerToggle instanceof HTMLInputElement) {
            powerToggle.checked = false;
        }
        // ==========================================
        // 文字も確実にOFFにする（NSの中なので自身を呼ぶ）
        if (typeof NS.updateStatusDisplay === "function") {
            NS.updateStatusDisplay("OFF");
        }
    };
    function setIdleMode(idle) {
        const box = document.getElementById("cgpt-nav");
        if (!box)
            return;
        box.classList.toggle("cgtn-idle", !!idle);
        const cb = box.querySelector("#cgtn-power-toggle");
        if (cb) {
            cb.checked = !idle;
            updateSwitchTooltip(cb);
        }
        const screen = document.getElementById("cgtn-status-monitor");
        if (screen) {
            if (idle) {
                screen.innerHTML = `<span class="off-text">OFF</span>`;
            }
            else {
                screen.innerHTML = `<div class="screen-value" style="color:#aaa">Loading...</div>`;
            }
        }
    }
    function setupDrag(box) {
        const grip = box.querySelector("#cgpt-drag");
        if (!grip)
            return;
        let dragging = false, offX = 0, offY = 0;
        grip.addEventListener("pointerdown", (e) => {
            if (e.target.closest(".cgtn-power-wrapper")) {
                return;
            }
            dragging = true;
            const r = box.getBoundingClientRect();
            offX = e.clientX - r.left;
            offY = e.clientY - r.top;
            // ▼▼▼ 追加: ドラッグ中はマウスに追従させるため、一時的に top 制御にする ▼▼▼
            box.style.bottom = "auto";
            box.style.top = r.top + "px";
            // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
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
            // ここで再び bottom (下端) 制御に戻る　引数無しはナビパネル
            clampPanelWithinViewport();
            SH.saveSettingsPatch({
                panel: {
                    x: box.getBoundingClientRect().left,
                    y: box.getBoundingClientRect().top,
                },
            });
        });
    }
    // ★進化版: どのパネルでも画面内に収める万能クランプ関数
    function clampPanelWithinViewport(targetEl, useBottomAnchor) {
        // targetElが指定されなかった場合は従来のナビパネルとして動く（後方互換）
        const isNav = !targetEl || targetEl === "cgpt-nav";
        const box = typeof targetEl === "string"
            ? document.getElementById(targetEl)
            : targetEl || document.getElementById("cgpt-nav");
        if (!box)
            return;
        const margin = 8;
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;
        const r = box.getBoundingClientRect();
        // 画面の下端よりも「上端（ヘッダ）が常に画面内にいること」を最優先にする
        let x = Math.max(margin, Math.min(vw - r.width - margin, r.left));
        let y = Math.max(margin, Math.min(vh - r.height - margin, r.top));
        box.style.right = "auto";
        box.style.left = `${x}px`;
        // ナビパネルは下端(bottom)固定、リストやプレビューは上端(top)固定
        const anchorBottom = isNav || useBottomAnchor;
        if (anchorBottom) {
            const bottom = vh - (y + r.height);
            box.style.top = "auto";
            box.style.bottom = `${bottom}px`;
        }
        else {
            box.style.bottom = "auto";
            box.style.top = `${y}px`;
        }
    }
    // 公開API
    NS.installUI = installUI;
    NS.clampPanelWithinViewport = clampPanelWithinViewport;
    NS.applyLang = applyLang;
    NS.toggleLang = toggleLang;
    NS.setIdleMode = setIdleMode;
    NS.updateStatusDisplay = NS.updateStatusDisplay;
    NS.updateNavStats = NS.updateNavStats;
    document.addEventListener("DOMContentLoaded", applyLang);
})();
