// events.ts
(() => {
    "use strict";
    const SH = window.CGTN_SHARED || {};
    const UI = window.CGTN_UI || {};
    const LG = window.CGTN_LOGIC || {};
    const NS = (window.CGTN_EVENTS = window.CGTN_EVENTS || {});
    // ★追加: 世代管理カウンター（関数の外に置いてください）
    let listToggleGen = 0;
    function bindEvents() {
        const box = document.getElementById("cgpt-nav");
        if (!box)
            return;
        // Changeイベント (トグルスイッチ) - 変更なし
        box.addEventListener("change", (e) => {
            const t = e.target;
            if (!(t instanceof HTMLInputElement))
                return;
            // ★追加: 重複イベント防止
            e.stopImmediatePropagation();
            const app = window.CGTN_APP; // content.tsで公開している実体
            // 1. 電源スイッチ (ON/OFF)
            // events.ts (電源スイッチの部分)
            if (t.id === "cgtn-power-toggle") {
                const on = t.checked;
                if (on) {
                    if (typeof SH.saveSettingsPatch === "function") {
                        SH.saveSettingsPatch({ navEnabled: true }); // ★ power を navEnabled に！
                    }
                    if (typeof app?.start === "function")
                        app.start("toggle-on");
                    // =========================================================
                    // ★追加: パネルが展開して高さが変わった後、上に突き抜けたヘッダを
                    // 画面内に押し戻す（クランプ処理を呼ぶ）
                    // =========================================================
                    setTimeout(() => {
                        if (typeof UI.clampPanelWithinViewport === "function") {
                            UI.clampPanelWithinViewport();
                        }
                    }, 150); // DOMが展開されて高さが確定するのを少しだけ待つ
                }
                else {
                    if (typeof SH.saveSettingsPatch === "function") {
                        SH.saveSettingsPatch({ navEnabled: false }); // ★ power を navEnabled に！
                    }
                    if (typeof app?.stop === "function")
                        app.stop("toggle-off");
                }
            }
            // ▼ 一覧表示トグル (#cgpt-list-toggle)
            // events.ts (一覧表示トグルの部分)
            if (t.id === "cgpt-list-toggle") {
                const on = t.checked;
                const btn = document.getElementById("cgpt-list-btn");
                if (btn)
                    btn.classList.toggle("active", on);
                const myGen = ++listToggleGen;
                if (on) {
                    // ★ サブステート開始：生成中（ボタンにblinkingクラスをつける）
                    if (btn)
                        btn.classList.add("blinking");
                    setTimeout(async () => {
                        if (myGen !== listToggleGen)
                            return;
                        try {
                            if (typeof LG.setListEnabled === "function") {
                                await LG.setListEnabled(true);
                            }
                        }
                        catch (err) {
                            LG.logError?.("List Gen Failed", err);
                        }
                        finally {
                            // ★ サブステート終了：完了（ブリンク解除）
                            if (myGen === listToggleGen && btn) {
                                btn.classList.remove("blinking");
                            }
                        }
                        // メインの状態(ACTIVE等)に従って数字などを再描画
                        if (myGen === listToggleGen &&
                            typeof LG.updateStatus === "function") {
                            LG.updateStatus();
                        }
                    }, 50);
                }
                else {
                    if (typeof LG.setListEnabled === "function")
                        LG.setListEnabled(false);
                    if (typeof LG.updateStatus === "function")
                        LG.updateStatus();
                }
            }
            if (t.id === "cgpt-viz") {
                const on = t.checked;
                if (typeof SH.toggleViz === "function")
                    SH.toggleViz(on);
                SH.saveSettingsPatch?.({ showViz: on });
            }
        });
        // Clickイベント
        box.addEventListener("click", (e) => {
            const t = e.target;
            const el = t instanceof Element
                ? t.closest("button, label, input, .cgtn-ver")
                : null;
            if (!el)
                return;
            // ★追加: バージョン番号(.cgtn-ver)をクリックでログ表示
            if (el.classList.contains("cgtn-ver")) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof LG.showLogs === "function")
                    LG.showLogs();
                return;
            }
            // 設定ボタン
            if (el.id === "cgtn-open-settings") {
                if (typeof UI.openSettingsModal === "function") {
                    e.preventDefault();
                    UI.openSettingsModal();
                }
                else {
                    try {
                        chrome.runtime.sendMessage({ cmd: "openOptions" });
                    }
                    catch (_) {
                        window.open(chrome.runtime.getURL("options.html"), "_blank");
                    }
                }
                return;
            }
            // ★修正: 更新ボタン
            if (el.id === "cgpt-navi-refresh") {
                e.preventDefault();
                // 1. "Refresh..." と表示
                //console.log(" updateStatusDisplay Refresh...");
                //        UI.updateStatusDisplay?.("Refresh...");
                // ★ 1. 状態をLOADINGへ。表示文字を "Refresh..." にする。
                const app = window.CGTN_APP;
                app?.changeState?.("LOADING", "click-refresh", "Refresh...");
                // 2. UI描画をブロックしないよう少し待ってから処理開始
                setTimeout(async () => {
                    try {
                        if (typeof LG.rebuild === "function")
                            LG.rebuild();
                        if (SH.isListOpen?.() && typeof LG.renderList === "function") {
                            await LG.renderList(true);
                        }
                    }
                    catch (err) {
                        LG.logError?.("Refresh Failed", err);
                    }
                    // ★ 2. 終わったら、実際のターン数を見て状態を確定（Loading完了イベント）
                    const total = LG.ST?.all?.length || 0;
                    app?.changeState?.(total > 0 ? "ACTIVE" : "STANDBY", "refresh-complete");
                }, 50);
                return;
            }
            // ナビゲーションボタン
            if (el instanceof HTMLElement && el.dataset.act) {
                const act = el.dataset.act;
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
        // ★ここに追加: 隠し機能「ターン数をダブルクリックでログ表示」
        // ナビパネルが後から描画されても確実に動くように、bodyで待ち受けます
        document.body.addEventListener("dblclick", (e) => {
            const target = e.target;
            // クリックされた場所が「モニター(数字部分)」の内側かどうか判定
            //const monitor = target.closest("#cgtn-status-monitor");
            // 修正: ターゲットを「モニター」から「その他ラベル」に変更
            // "others" という i18n属性を持つ要素を探す
            const trigger = target.closest('[data-i18n="others"]');
            if (trigger) {
                e.preventDefault();
                e.stopPropagation();
                // shared.ts の showLogs を呼び出す
                const SH = window.CGTN_SHARED;
                if (typeof SH.showLogs === "function") {
                    SH.showLogs();
                }
                else {
                    alert("Log viewer is not available.");
                }
            }
        });
    }
    // ============================================================
    // ★追加: Universal版ロジックの移植 (簡易高速スキャン) 2026.01.30
    // ============================================================
    NS.runFastUniversalScan = function () {
        // 1. 記事要素を単純取得 (Universal版と同じアプローチ)
        const articles = document.querySelectorAll("article");
        const total = articles.length;
        if (total === 0)
            return false; // まだDOMがない
        // 2. 現在地をざっくり計算 (スクロール位置から推定)
        //    Universal版が行っている「中央付近の要素を探す」処理の簡易版です
        let current = 0;
        const center = window.innerHeight / 2;
        // 全要素ループは重いので、バイナリサーチや軽量探索が理想ですが
        // Universal版同様、単純ループでもDOM操作よりは遥かに速いです
        for (let i = 0; i < total; i++) {
            const rect = articles[i].getBoundingClientRect();
            // 画面内に入ってきたらそれを現在地とする
            if (rect.top < center && rect.bottom > 0) {
                current = i + 1;
            }
            // 画面より下に行ったら終了
            if (rect.top > window.innerHeight)
                break;
        }
        // 見つからなければ最後尾または1
        if (current === 0)
            current = total;
        // 3. UIを直接更新 (正規のデータ構築を待たない)
        window.CGTN_UI?.updateStatusDisplay?.(`${current} / ${total}`);
        // スクロール連動用に簡易的にスパイを登録しておく（チラつき防止）
        // (正規のLogicが走るまでの繋ぎです)
        return true;
    };
    NS.bindEvents = bindEvents;
})();
