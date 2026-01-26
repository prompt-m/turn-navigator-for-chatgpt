// events.js — クリック配線 / チェック連動（UIのdata-act / data-roleに対応）
(() => {
    "use strict";
    const SH = window.CGTN_SHARED || {};
    const UI = window.CGTN_UI || {};
    const LG = window.CGTN_LOGIC || {};
    const NS = (window.CGTN_EVENTS = window.CGTN_EVENTS || {});
    /*
    function bindEvents() {
      const box = document.getElementById("cgpt-nav");
      if (!box) return;
  
      try {
        const viz = box.querySelector("#cgpt-viz");
        if (viz instanceof HTMLInputElement) {
          viz.checked = !!SH.getCFG()?.showViz;
        }
  
        // 保存済みCFGをそのまま反映（強制OFF禁止）
        const on = !!SH.getCFG()?.list?.enabled;
  
        const chk = box.querySelector("#cgpt-list-toggle");
        if (chk instanceof HTMLInputElement) {
          chk.checked = on;
        }
  
        const pinOnlyChk = document.getElementById("cgpt-pinonly");
        if (pinOnlyChk instanceof HTMLInputElement) {
          pinOnlyChk.checked = !!SH.getCFG()?.list?.pinOnly;
          pinOnlyChk.disabled = !on;
        }
      } catch {}
  
      box.addEventListener(
        "click",
        (e) => {
          // プレビューボタンは行内で処理（ここでは素通りにせず即終了）
          const t = e.target; // !!!!
          if (!(t instanceof Element)) return;
  
          // if (e.target.closest(".cgtn-preview-btn")) {
          if (t.closest(".cgtn-preview-btn")) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
  
          // const el = e.target.closest("*"); !!!!
          const el = t.closest("*");
          if (!el) return;
  
          // --- 一覧トグル ---
          const chk = el && el.closest ? el.closest("#cgpt-list-toggle") : null;
          if (chk instanceof HTMLInputElement) {
            const on = chk.checked;
  
            LG.setListEnabled?.(on);
  
            // フォーカスを外して“カーソル残り”を防ぐ
            try {
              chk.blur();
            } catch {}
  
            // 一覧OFFなら付箋もOFF & 無効化
            const pinOnlyChk = document.getElementById("cgpt-pinonly");
            if (!on && pinOnlyChk instanceof HTMLInputElement) {
              const cur = SH.getCFG() || {};
              SH.saveSettingsPatch({
                list: { ...(cur.list || {}), pinOnly: false },
              });
              pinOnlyChk.checked = false;
              pinOnlyChk.disabled = true;
            }
            return;
          }
  
          // --- 基準線トグル ---
          const viz = el.closest("#cgpt-viz");
          if (viz instanceof HTMLInputElement) {
            const on = viz.checked;
            SH.toggleViz?.(on);
            SH.saveSettingsPatch?.({ showViz: !!on });
            return;
          }
  
          // --- 言語トグル ---
          if (el.closest(".cgpt-lang-btn")) {
            UI.toggleLang?.();
            return;
          }
  
          // --- 設定を開く ---
          if (el.closest("#cgtn-open-settings")) {
            // ここから追加：堅牢版 openOptions
            const openOptionsSafe = () => {
              try {
                if (chrome?.runtime?.openOptionsPage) {
                  chrome.runtime.openOptionsPage(() => {
                    // 稀に openOptionsPage 自体が lastError を返すことがある
                    if (chrome.runtime.lastError) {
                      try {
                        window.open(
                          chrome.runtime.getURL("options.html"),
                          "_blank",
                        );
                      } catch (_) {}
                    }
                  });
                  return;
                }
              } catch (_) {}
              // SW 経由（MV3想定）。失敗しても最後に window.open へ
              try {
                chrome.runtime.sendMessage({ cmd: "openOptions" }, () => {
                  if (chrome.runtime.lastError) {
                    try {
                      window.open(
                        chrome.runtime.getURL("options.html"),
                        "_blank",
                      );
                    } catch (_) {}
                  }
                });
              } catch (_) {
                try {
                  window.open(chrome.runtime.getURL("options.html"), "_blank");
                } catch (__) {}
              }
            };
            openOptionsSafe();
            return;
          }
  
          // --- ナビゲーション（Top/Bottom/Prev/Next） ---
          const btn = el.closest("button[data-act]");
          // if (btn) { !!!!
          if (btn instanceof HTMLButtonElement) {
            const act = btn.dataset.act;
            //const role = btn.closest(".cgpt-nav-group")?.dataset.role || "all";
            const grp = btn.closest(".cgpt-nav-group");
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
        },
        false,
      );
    }
  */
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
