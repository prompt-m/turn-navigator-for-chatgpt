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
            /*
            if (t.id === "cgpt-list-toggle") {
              const on = t.checked;
              const btn = document.getElementById("cgpt-list-btn");
              if (btn) btn.classList.toggle("active", on);
      
              // ONにする時だけ、重い処理が走る可能性がある 2026.01.29
              if (on) {
                // 1. ステータスを「生成中」にする
                UI.updateStatusDisplay?.("List Gen...");
      
                // 2. 描画をブロックしないよう非同期で実行
                setTimeout(async () => {
                  try {
                    if (typeof LG.setListEnabled === "function") {
                      // ここで renderList が走る
                      await LG.setListEnabled(true);
                    }
                  } finally {
                    // 3. 終わったら数値表示に戻す
                    if (typeof LG.updateStatus === "function") LG.updateStatus();
                  }
                }, 50);
              } else {
                // OFFにする時は一瞬なのでそのままでOK
                if (typeof LG.setListEnabled === "function") {
                  LG.setListEnabled(false);
                }
              }
            }
            */
            // ▼ 一覧表示トグル
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
    NS.bindEvents = bindEvents;
})();
