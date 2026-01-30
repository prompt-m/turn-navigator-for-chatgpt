// events.js
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
        // Changeイベント (トグルスイッチ) - 変更なし
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
                if (on) {
                    // 1. まず表示を変える
                    UI.updateStatusDisplay?.("List Gen...");
                    // 2. 描画の更新を待ってから処理開始 (setTimeout 50ms)
                    setTimeout(async () => {
                        try {
                            if (typeof LG.setListEnabled === "function") {
                                // setListEnabled が Promise を返さなくても、
                                // renderList が重ければここでスレッドが占有されます。
                                // もし renderList が async なら await できます。
                                await LG.setListEnabled(true);
                                // ★追加: もし setListEnabled が非同期待機せずに戻ってくる仕様の場合、
                                // 強制的にリスト要素ができるまで少し待つロジックを入れても良いですが、
                                // まずは単純な await で試します。
                            }
                        }
                        catch (err) {
                            console.error(err);
                            LG.logError?.("List Gen Failed", err);
                        }
                        finally {
                            // 3. 処理が終わったら確実に数値に戻す
                            if (typeof LG.updateStatus === "function")
                                LG.updateStatus();
                        }
                    }, 50);
                }
                else {
                    // OFFにする時は一瞬でOK
                    if (typeof LG.setListEnabled === "function") {
                        LG.setListEnabled(false);
                    }
                    // 即座に数値更新（またはOFF表示）
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
                console.log(" updateStatusDisplay Refresh...");
                UI.updateStatusDisplay?.("Refresh...");
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
                        // エラー時はログに保存
                        LG.logError?.("Refresh Failed", err);
                    }
                    finally {
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
