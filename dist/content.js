// content.ts — Entry (refactor skeleton)
(function () {
    "use strict";
    if (document.getElementById("cgpt-nav"))
        return;
    if (window.__CGTN_RUNNING__) {
        console.warn("[CGTN] duplicate injection blocked");
    }
    else {
        window.__CGTN_RUNNING__ = true;
    }
    const CGTN_BUILD = "1.1.0-20260227";
    const SH = window.CGTN_SHARED;
    const UI = window.CGTN_UI;
    const EV = window.CGTN_EVENTS;
    const LG = window.CGTN_LOGIC;
    // ★復活: 待機用 sleep 関数
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // ★復活: 画面の「指紋」を作成（件数 + 最初の要素のIDやテキスト）
    //2026.02.02
    function getDomSignature() {
        const turns = document.querySelectorAll("article");
        if (!turns.length)
            return "empty";
        const first = turns[0];
        // ID または テキストの先頭30文字で識別
        const sig = first.id || first.textContent?.slice(0, 30).trim() || "";
        return `${turns.length}:${sig}`;
    }
    // ★復活: チャットが安定するまで待つ関数（指紋チェック付き）
    //2026.02.02
    async function waitForChatSettled(args) {
        const { mustNotMatch, maxMs = 12000 } = args;
        const start = Date.now();
        while (Date.now() - start < maxMs) {
            // 1. 指紋チェック（前の画面と同じなら待つ）
            if (mustNotMatch) {
                const nowSig = getDomSignature();
                if (nowSig === mustNotMatch) {
                    await sleep(100);
                    continue;
                }
            }
            // 2. 要素存在チェック
            const turns = document.querySelectorAll("article");
            if (turns.length > 0) {
                // 要素があれば安定とみなしてループを抜ける
                // (より厳密にするなら前回の件数と比較するロジックも入れられますが、
                //  今回は指紋が変わればOKとします)
                return true;
            }
            await sleep(100);
        }
        return false; // タイムアウト
    }
    function makeBag() {
        const bag = [];
        return {
            add(fn) {
                bag.push(fn);
            },
            flush() {
                for (const fn of bag.splice(0)) {
                    try {
                        fn();
                    }
                    catch { }
                }
            },
        };
    }
    // 状態番号の定義（組み込み流ステータスコード）
    // ★ 変更：Mikiの状態遷移表に合わせたステータスコード
    const STATE_CODE = {
        OFF: 0, // 表の①、③（監視停止・スリープ状態）
        STANDBY: 2, // 表の②（ターン無・ナビON）
        ACTIVE: 4, // 表の④（ターン有・ナビON）
        LOADING: 99, // 遷移状態（表の「Loading...」）
    };
    const RUN = {
        gen: 0,
        timer: 0,
        bag: makeBag(),
        prevListEnabled: null,
        // ★ 追加：STANDBYフォールバックを初回だけにするフラグ
        didStandbyFallback: false,
        _state: "OFF",
        _loadingMsg: "Loading...", // ★ 追加：LOADING中の表示文字
        // ★ 第3引数(customMsg)を追加
        changeState(newState, reason, customMsg) {
            if (this._state === newState && newState !== "LOADING")
                return;
            if (newState === "LOADING") {
                this._loadingMsg = customMsg || "Loading...";
            }
            const codeOld = STATE_CODE[this._state] ?? this._state;
            const codeNew = STATE_CODE[newState] ?? newState;
            const logStr = `State: [${codeOld}]${this._state} -> [${codeNew}]${newState} (${reason})`;
            this._state = newState;
            if (typeof window.CGTN_LOGIC?.updateStatus === "function") {
                window.CGTN_LOGIC.updateStatus();
            }
        },
        get state() {
            return this._state;
        },
        getLoadingMsg() {
            return this._loadingMsg;
        },
        get idle() {
            return this._state === "OFF";
        },
        set idle(v) {
            if (v)
                this.changeState("OFF", "legacy-idle-setter");
        },
    };
    // CSS（ローディング用スタイル）
    (function ensureBusyStyle() {
        if (document.getElementById("cgtn-busy-style"))
            return;
        const st = document.createElement("style");
        st.id = "cgtn-busy-style";
        // 2026.01.26
        // ★修正: opacity: 0.9 を削除しました
        st.textContent = `
      #cgpt-nav.loading, #cgpt-list-panel.loading { pointer-events: none;}
    `;
        document.head.appendChild(st);
    })();
    // === wait helpers ===
    function cgtnCountTurns() {
        return document.querySelectorAll('article,[data-testid^="conversation-turn"]').length;
    }
    function cgtnRoot() {
        return document.querySelector("main") || document.body;
    }
    // 1) 最初の turn-added を待つ Promise
    function waitForFirstTurnAdded(timeout = 15000) {
        return new Promise((resolve) => {
            const to = setTimeout(() => {
                window.removeEventListener("message", onMsg, true);
                resolve("timeout");
            }, timeout);
            const onMsg = (ev) => {
                const d = ev?.data;
                if (d && d.source === "cgtn" && d.type === "turn-added") {
                    window.removeEventListener("message", onMsg, true);
                    clearTimeout(to);
                    resolve("turn-added");
                }
            };
            window.addEventListener("message", onMsg, true);
        });
    }
    let __buildGen = 0;
    // =================================================================
    // 4. rebuildAndRenderSafely (非同期ガード付き)
    // =================================================================
    async function rebuildAndRenderSafely({ forceList = false, appGen, } = {}, oldSig = null) {
        const LG = window.CGTN_LOGIC;
        const SH = window.CGTN_SHARED;
        const myBuildGen = ++__buildGen;
        const myAppGen = appGen ?? RUN.gen;
        SH.addLog?.("[rebuild] start", {
            state: RUN.state,
            myBuildGen,
            currentBuildGen: __buildGen,
            myAppGen,
            currentAppGen: RUN.gen,
            turns: window.CGTN_LOGIC?.ST?.all?.length || 0,
        });
        const guard = (where) => {
            const invalid = myBuildGen !== __buildGen ||
                myAppGen !== RUN.gen ||
                RUN.state === "OFF";
            if (invalid && where) {
                SH.addLog?.("[rebuild] guard-return", {
                    where,
                    state: RUN.state,
                    myBuildGen,
                    currentBuildGen: __buildGen,
                    myAppGen,
                    currentAppGen: RUN.gen,
                });
            }
            return invalid;
        };
        if (RUN.state !== "OFF") {
            RUN.changeState("LOADING", "rebuild-start", "Loading...");
        }
        if (oldSig) {
            const kind = SH.getPageInfo?.()?.kind || "other";
            if (kind === "chat") {
                await waitForChatSettled({ mustNotMatch: oldSig });
            }
            if (guard("after waitForChatSettled"))
                return;
        }
        try {
            if (guard("before LG.rebuild"))
                return;
            LG.rebuild?.();
            const kind = SH.getPageInfo?.()?.kind || "other";
            const listToggle = document.getElementById("cgpt-list-toggle");
            const isListToggleOn = listToggle ? listToggle.checked : false;
            const needList = RUN.state !== "OFF" && kind === "chat" && (forceList || isListToggleOn);
            if (needList) {
                await new Promise((r) => requestAnimationFrame(r));
                if (guard("after RAF before renderList"))
                    return;
                await LG.renderList?.(true);
                if (guard("after renderList"))
                    return;
            }
            if (guard("before state resolution"))
                return;
            if (RUN.state === "OFF") {
                UI?.setPanelOffState?.();
            }
            else {
                const turnsCount = window.CGTN_LOGIC?.ST?.all?.length || 0;
                if (kind === "chat" && turnsCount > 0) {
                    RUN.changeState("ACTIVE", "rebuild-complete");
                    SH.addLog?.("[rebuild] ACTIVE", {
                        turns: turnsCount,
                    });
                    setTimeout(() => {
                        if (RUN.state === "ACTIVE") {
                            window.CGTN_LOGIC?.updateStatus?.();
                        }
                    }, 1500);
                }
                else {
                    RUN.changeState("STANDBY", "rebuild-complete-empty");
                    SH.addLog?.("[rebuild] STANDBY", {
                        turns: turnsCount,
                    });
                    const retryBuildGen = myBuildGen;
                    const retryAppGen = myAppGen;
                    SH.addLog?.("[standby-retry] scheduled", {
                        retryBuildGen,
                        retryAppGen,
                    });
                    setTimeout(() => {
                        SH.addLog?.("[standby-retry] fired", {
                            state: RUN.state,
                            currentBuildGen: __buildGen,
                            retryBuildGen,
                            turns: window.CGTN_LOGIC?.ST?.all?.length || 0,
                        });
                        if (RUN.state === "OFF")
                            return;
                        if (__buildGen !== retryBuildGen)
                            return;
                        if (RUN.state !== "STANDBY")
                            return;
                        rebuildAndRenderSafely({ appGen: retryAppGen }).catch(() => { });
                    }, 700);
                }
                try {
                    if (typeof LG.detachTurnObserver === "function")
                        LG.detachTurnObserver();
                    if (typeof LG.stopScrollSpy === "function")
                        LG.stopScrollSpy();
                    if (typeof LG.installAutoSyncForTurns === "function")
                        LG.installAutoSyncForTurns();
                }
                catch (err) {
                    SH.logError("Observer re-attach failed", err);
                }
            }
            SH.addLog?.("[rebuild] exit", {
                state: RUN.state,
                turns: window.CGTN_LOGIC?.ST?.all?.length || 0,
            });
        }
        catch (e) {
            SH.logError("rebuild failed", e);
            if (forceList) {
                LG?.setListEnabled?.(false);
            }
        }
    }
    // =================================================================
    // 修正版: onMessage (ちらつき防止・起動ロジック)
    // =================================================================
    (function bindCgtnMessageOnce() {
        if (window.__CGTN_MSG_BOUND__)
            return;
        window.__CGTN_MSG_BOUND__ = true;
        let __lastCid = null;
        let __debTo = 0;
        let __gen = 0;
        let __pageInfo = { kind: "other", cid: "", hasTurns: false };
        const onMessage = (ev) => {
            (async () => {
                // ▼▼▼ 追加: 初期化が終わるまで処理を待つ（フライング防止） 2026.02.20
                if (!__isInitialized && __initPromise) {
                    await __initPromise;
                }
                // ▲▲▲
                const d = ev && ev.data;
                if (!d || d.source !== "cgtn")
                    return;
                const SH = window.CGTN_SHARED, LG = window.CGTN_LOGIC;
                const kind = d.kind || "other";
                const cidNow = d.cid || SH?.getChatId?.();
                __pageInfo = { kind, cid: cidNow || "", hasTurns: !!d.hasTurns };
                try {
                    SH.setPageInfo?.(__pageInfo);
                }
                catch { }
                if (["home", "project", "other", "new"].includes(kind)) {
                    LG?.clearListPanelUI?.();
                    // ここでアプリの状態を確認する！
                    const app = window.CGTN_APP;
                    // ★修正：直接UIを書き換えるのではなく、状態を確定させる（Loading完了・ターン無へ遷移）
                    if (RUN.state !== "OFF") {
                        RUN.changeState("STANDBY", `not-chat-page:${kind}`);
                    }
                    else {
                        UI?.setPanelOffState?.();
                    }
                    __lastCid = null;
                    __gen++;
                    return;
                }
                if (d.type === "url-change" || d.type === "turn-added") {
                    const prev = __lastCid;
                    __lastCid = cidNow;
                    const myGen = ++__gen;
                    const currentSig = getDomSignature();
                    // A. URL変更
                    // A. URL変更
                    if (d.type === "url-change") {
                        // =========================================================
                        // ★ 新設計1：OFFの時はデータをクリアするだけで、状態遷移はしない（内部遷移）
                        // =========================================================
                        if (RUN.state === "OFF") {
                            LG?.clearListPanelUI?.(); // 古いターン情報を捨てる
                            // Idle時のサイレント更新（フッターの数字だけ計算するなどの裏処理）
                            waitForChatSettled({ maxMs: 5000 })
                                .then(() => LG.updateFooterOnly?.())
                                .catch(() => { });
                            return; // ！！絶対にLOADINGやONに遷移させない！！
                        }
                        // =========================================================
                        // ★ 新設計2：以下は ON (STANDBY, ACTIVE, LOADING) の時の処理
                        // =========================================================
                        // チャット以外のページ（HomeやNewなど）に遷移した場合
                        if (["home", "project", "other", "new"].includes(kind)) {
                            LG?.clearListPanelUI?.();
                            RUN.changeState("STANDBY", `not-chat-page:${kind}`);
                            return;
                        }
                        // --- チャット画面での変化（新しいチャットを開いた等） ---
                        // 何よりも先にスクロール監視とターン監視を止める！
                        LG.stopScrollSpy?.();
                        LG.detachTurnObserver?.();
                        try {
                            window.CGTN_PREVIEW?.hide?.("url-change");
                        }
                        catch (e) { }
                        // ★ ここでLOADING状態へ遷移！
                        RUN.changeState("LOADING", "url-change", "Loading...");
                        const panel = document.getElementById("cgpt-list-panel");
                        const wasListOpen = panel &&
                            panel.style.display !== "none" &&
                            !panel.classList.contains("collapsed");
                        clearTimeout(__debTo);
                        __debTo = window.setTimeout(() => {
                            requestAnimationFrame(() => {
                                (async () => {
                                    if (myGen !== __gen)
                                        return;
                                    await rebuildAndRenderSafely({ forceList: !!wasListOpen }, currentSig);
                                })().catch((err) => SH.logError("[cgtn] rebuild error:", err));
                            });
                        }, 80);
                    }
                    // B. 会話追加
                    else {
                        if (RUN.state !== "OFF") {
                            // 会話中は Loading 表示にしない（スムーズに追従）
                            // setUiBusy(true, "Sync...");
                            clearTimeout(__debTo);
                            __debTo = window.setTimeout(() => {
                                requestAnimationFrame(() => {
                                    (async () => {
                                        if (myGen !== __gen)
                                            return;
                                        await rebuildAndRenderSafely({});
                                    })().catch((err) => SH.logError("[cgtn] turn-added error:", err));
                                });
                            }, 80);
                        }
                        else {
                            LG.updateFooterOnly?.();
                        }
                    }
                }
            })();
        };
        window.addEventListener("message", onMessage, true);
        // ★EventListenerは閉じずに開けっ放しにする！ 2026.02.22
        RUN.bag.add(() => {
            try {
                if (__debTo)
                    window.clearTimeout(__debTo);
            }
            catch { }
            // removeEventListener とフラグ折りの処理は完全に削除！
        });
    })();
    const USE_INJECT_URL_HOOK = true;
    // ========= 1) フォーカス系 =========
    function ensureFocusPark() {
        const el = document.getElementById("cgtn-focus-park");
        if (el instanceof HTMLButtonElement)
            return;
        const park = document.createElement("button");
        park.id = "cgtn-focus-park";
        park.type = "button";
        park.tabIndex = -1;
        park.style.cssText =
            "position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none;";
        document.body.appendChild(park);
    }
    // 2026.1.22 解除できる形に置き換え
    /*
    function installFocusStealGuard() {
      const nav = document.getElementById("cgpt-nav");
      const list = document.getElementById("cgpt-list-panel");
      const inUI = (el: any) =>
        !!(el && ((nav && nav.contains(el)) || (list && list.contains(el))));
  
      let fromUI = false;
      let to = 0;
  
      const onDown = (e: MouseEvent) => {
        fromUI = inUI((e as any).target);
      };
  
      const onUp = () => {
        if (!fromUI) return;
        fromUI = false;
  
        try {
          const sel = getSelection();
          sel && sel.removeAllRanges();
        } catch {}
  
        const park = document.getElementById("cgtn-focus-park") as any;
        if (!park) return;
  
        try {
          if (to) window.clearTimeout(to);
        } catch {}
        to = window.setTimeout(() => {
          try {
            park.focus({ preventScroll: true });
          } catch {}
        }, 0);
      };
  
      document.addEventListener("mousedown", onDown, { capture: true });
      document.addEventListener("mouseup", onUp, { capture: true });
  
      RUN.bag.add(() => {
        try {
          document.removeEventListener("mousedown", onDown, {
            capture: true,
          } as any);
        } catch {}
        try {
          document.removeEventListener("mouseup", onUp, { capture: true } as any);
        } catch {}
        try {
          if (to) window.clearTimeout(to);
        } catch {}
      });
    }
  */
    function installFocusStealGuard() {
        const nav = document.getElementById("cgpt-nav");
        const list = document.getElementById("cgpt-list-panel");
        const inUI = (el) => !!(el && ((nav && nav.contains(el)) || (list && list.contains(el))));
        let fromUI = false;
        let to = 0;
        const onDown = (e) => {
            fromUI = inUI(e.target);
        };
        const onUp = () => {
            if (!fromUI)
                return;
            fromUI = false;
            try {
                const sel = getSelection();
                sel && sel.removeAllRanges();
            }
            catch { }
            const park = document.getElementById("cgtn-focus-park");
            if (!park)
                return;
            // ★追加：すでに park にフォーカスがあるなら何もしない（無駄focus削減）
            try {
                if (document.activeElement === park)
                    return;
            }
            catch { }
            // ★追加：UI要素がフォーカス中なら、無理に奪わない（好み。嫌なら消してOK）
            try {
                const ae = document.activeElement;
                if (ae && (nav?.contains(ae) || list?.contains(ae)))
                    return;
            }
            catch { }
            try {
                if (to)
                    window.clearTimeout(to);
            }
            catch { }
            to = window.setTimeout(() => {
                try {
                    // ★変更：まず preventScroll を外して reflow を減らす
                    park.focus();
                }
                catch { }
            }, 0);
        };
        document.addEventListener("mousedown", onDown, { capture: true });
        document.addEventListener("mouseup", onUp, { capture: true });
        RUN.bag.add(() => {
            try {
                document.removeEventListener("mousedown", onDown, {
                    capture: true,
                });
            }
            catch { }
            try {
                document.removeEventListener("mouseup", onUp, { capture: true });
            }
            catch { }
            try {
                if (to)
                    window.clearTimeout(to);
            }
            catch { }
        });
    }
    // ========= 2) プレビュードック =========
    function bindPreviewDockOnce() {
        if (document._cgtnPreviewDockBound)
            return;
        document._cgtnPreviewDockBound = true;
        const LIST_SEL = "#cgpt-list-panel";
        const BTN_SEL = ".cgtn-preview-btn"; // 既存・新設どちらも拾える想定
        let dock, body, title;
        let pinned = false;
        let dragging = false, dragDX = 0, dragDY = 0;
        let resizing = false, baseW = 0, baseH = 0, baseX = 0, baseY = 0;
        function ensureDock() {
            if (dock)
                return dock;
            dock = document.createElement("div");
            dock.className = "cgtn-dock";
            dock.setAttribute("data-cgtn-ui", "1"); // ← 自作UIフラグ
            dock.innerHTML = `
        <div class="cgtn-dock-head">
          <span class="cgtn-dock-title"></span>
          <div style="margin-left: auto; display: flex; gap: 16px; align-items: center;">
            <button class="cgtn-dock-copy" aria-label="Copy" title="テキストをコピー" style="all: unset; cursor: pointer; font-size: 14px; opacity: 0.9;">📋</button>
            <button class="cgtn-dock-close" aria-label="Close" style="margin: 0;">✕</button>
          </div>
        </div>
        <div class="cgtn-dock-body"></div>
        <div class="cgtn-dock-resize" title="Resize">⤡</div>
      `;
            document.body.appendChild(dock);
            // 位置/サイズ/固定フラグを保存
            function saveDockState() {
                if (!dock)
                    return;
                const r = dock.getBoundingClientRect();
                // ★最小ガード：0や極端な値は保存しない
                const MIN_W = 260, MIN_H = 180;
                const w = Math.round(r.width), h = Math.round(r.height);
                const x = Math.round(window.scrollX + r.left);
                const y = Math.round(window.scrollY + r.top);
                if (w < MIN_W || h < MIN_H)
                    return; // ← この条件が効けば0pxは二度と保存されない
                SH?.saveSettingsPatch?.({
                    previewDock: {
                        x: Math.round(r.left),
                        y: Math.round(r.top),
                        w: Math.round(r.width),
                        h: Math.round(r.height),
                        pinned: !!pinned,
                    },
                });
            }
            // 保存済み状態を復元（呼ぶだけで反映）
            function restoreDockState() {
                //            const st = SH?.getCFG?.()?.previewDock || {};
                const st = SH?.getCFG?.()?.previewDockPlace || {};
                const DEF = { w: 420, h: 260, x: 40, y: 40 };
                // ★初期デフォルト（設定が無い／ゼロ値っぽい時の下支え）
                let w = Number.isFinite(st.w) && st.w > 0 ? st.w : DEF.w;
                let h = Number.isFinite(st.h) && st.h > 0 ? st.h : DEF.h;
                let x = Number.isFinite(st.x) && st.x > 0 ? st.x : DEF.x;
                let y = Number.isFinite(st.y) && st.y > 0 ? st.y : DEF.y;
                dock.style.width = w + "px";
                dock.style.height = h + "px";
                dock.style.left = x + "px";
                dock.style.top = y + "px";
                if (st.pinned) {
                    //              pinned = true;
                    dock.setAttribute("data-pinned", "1");
                }
            }
            body = dock.querySelector(".cgtn-dock-body");
            title = dock.querySelector(".cgtn-dock-title");
            restoreDockState(); // ★ここで復元
            // 閉じる
            dock.querySelector(".cgtn-dock-close").addEventListener("click", () => {
                _savePlace(dock);
                dock.removeAttribute("data-show");
                dock.removeAttribute("data-pinned");
                pinned = false;
            });
            // =======================================================
            // ★追加: コピーボタンの処理
            // =======================================================
            dock
                .querySelector(".cgtn-dock-copy")
                .addEventListener("click", async (e) => {
                const btn = e.currentTarget;
                try {
                    // ドックのボディ（テキストが入っている部分）の中身をコピー
                    await navigator.clipboard.writeText(body.textContent || "");
                    // 一瞬だけチェックマークにして成功を伝える
                    btn.textContent = "✅";
                    setTimeout(() => {
                        btn.textContent = "📋";
                    }, 1500);
                }
                catch (err) {
                    SH.logError("Copy failed", err);
                }
            });
            // 移動（ヘッダー掴み）
            const head = dock.querySelector(".cgtn-dock-head");
            head.addEventListener("mousedown", (e) => {
                //            if (!pinned) return;           // 固定中のみ移動
                dragging = true;
                const r = dock.getBoundingClientRect();
                dragDX = e.clientX - r.left;
                dragDY = e.clientY - r.top;
                e.preventDefault();
            });
            window.addEventListener("mousemove", (e) => {
                if (!dragging)
                    return;
                const left = window.scrollX + e.clientX - dragDX;
                const top = window.scrollY + e.clientY - dragDY;
                dock.style.left = left + "px";
                dock.style.top = top + "px";
            }, { passive: true });
            window.addEventListener("mouseup", () => {
                if (dragging || resizing) {
                    dragging = false;
                    resizing = false;
                    // =======================================================
                    // ★ 追加: ドロップ・リサイズした瞬間に、画面内にクランプ（押し戻す）！
                    // =======================================================
                    if (typeof window.CGTN_UI?.clampPanelWithinViewport === "function") {
                        // プレビューパネルも上端(top)固定なので第2引数は false
                        window.CGTN_UI.clampPanelWithinViewport(dock, false);
                    }
                    // ★ 修正: クランプで押し戻された「後」の正しい座標を保存する
                    _savePlace(dock);
                }
            });
            // リサイズ（右下グリップ）
            const grip = dock.querySelector(".cgtn-dock-resize");
            grip.addEventListener("mousedown", (e) => {
                resizing = true;
                const r = dock.getBoundingClientRect();
                baseW = r.width;
                baseH = r.height;
                baseX = e.clientX;
                baseY = e.clientY;
                e.preventDefault();
            });
            window.addEventListener("mousemove", (e) => {
                if (!resizing)
                    return;
                const dx = e.clientX - baseX;
                const dy = e.clientY - baseY;
                const w = Math.max(260, baseW + dx);
                const h = Math.max(180, baseH + dy);
                dock.style.width = w + "px";
                dock.style.height = h + "px";
            }, { passive: true });
            // === 言語切り替え対応：タイトルを再翻訳 ===
            (function setupDockTitleI18N() {
                const titleEl = dock.querySelector(".cgtn-dock-title");
                const copyBtn = dock.querySelector(".cgtn-dock-copy"); // ★追加
                const applyDockTitle = () => {
                    const t = window.CGTN_I18N?.t || ((k) => k);
                    if (titleEl)
                        titleEl.textContent = t("preview.title");
                    if (copyBtn)
                        copyBtn.title = t("preview.copy"); // ★追加
                };
                // 初期設定
                applyDockTitle();
                // 言語切替時の再反映
                window.CGTN_SHARED?.onLangChange?.(applyDockTitle);
            })();
            return dock;
        }
        // ★ content.js / bindPreviewDockOnce() 内（ensureDock() の下あたり）
        function hideDock(reason) {
            const box = ensureDock();
            //          box.style.display = 'none';
            // 位置・サイズを安全に保存（0値は保存しない実装ならそのままでOK）
            try {
                _savePlace?.(box);
            }
            catch { }
            box.removeAttribute("data-show");
            box.removeAttribute("data-pinned");
            pinned = false;
        }
        // 外部から呼べるように公開
        window.CGTN_PREVIEW = Object.assign(window.CGTN_PREVIEW || {}, {
            hide: hideDock,
        });
        // === 配置判断用のシグネチャ ===
        function _listRect() {
            const list = document.getElementById("cgpt-list-panel");
            if (!list)
                return null;
            const r = list.getBoundingClientRect();
            return {
                l: Math.round(r.left),
                t: Math.round(r.top),
                w: Math.round(r.width),
                h: Math.round(r.height),
            };
        }
        function _vp() {
            return { vw: innerWidth, vh: innerHeight };
        }
        // 誤差吸収（DevTools開閉などの±1〜2pxズレで無駄に再配置しない）
        function _near(a, b, eps = 4) {
            return Math.abs((a || 0) - (b || 0)) <= eps;
        }
        function _sameRect(a, b) {
            return (a &&
                b &&
                _near(a.l, b.l) &&
                _near(a.t, b.t) &&
                _near(a.w, b.w) &&
                _near(a.h, b.h));
        }
        function _sameVP(a, b) {
            return a && b && a.vw === b.vw && a.vh === b.vh;
        }
        // 保存・読込（cfg.previewDockPlace に格納）
        function _loadPlace() {
            return window.CGTN_SHARED?.getCFG?.()?.previewDockPlace || null;
        }
        function _savePlace(dock) {
            if (!dock)
                return;
            const r = _measureRect(dock);
            const minW = 260, minH = 180;
            // まるごと 0（= 非表示/未レイアウト）なら、既存値を壊さないため保存スキップ
            if (!r.width && !r.height)
                return;
            const place = {
                // position:fixed を想定。もし absolute なら scrollX/Y を加算する
                x: Math.round(r.left),
                y: Math.round(r.top),
                w: Math.max(minW, Math.round(r.width)),
                h: Math.max(minH, Math.round(r.height)),
                sig: { vp: _vp(), lr: _listRect() },
            };
            window.CGTN_SHARED?.saveSettingsPatch?.({ previewDockPlace: place });
        }
        function placeDockNearList(dock) {
            const list = document.getElementById("cgpt-list-panel");
            if (!dock || !list)
                return;
            const vw = innerWidth, vh = innerHeight;
            const pad = 12; // 画面端との安全マージン
            const minGap = 10; // リストとドックの最小離隔 ← これがキモ
            const w = Math.max(260, dock.offsetWidth || 420);
            const h = Math.max(180, dock.offsetHeight || 260);
            const r = list.getBoundingClientRect();
            // 置けるスペース（minGap込みで判定）
            const spaceRight = vw - r.right - (pad + minGap);
            const spaceLeft = r.left - (pad + minGap);
            const spaceBelow = vh - r.bottom - (pad + minGap);
            const spaceAbove = r.top - (pad + minGap);
            // 位置候補を順に試す（右 → 左 → 下 → 上 → 中央）
            const tryRight = () => {
                if (spaceRight < w)
                    return false;
                dock.style.left = scrollX + r.right + minGap + "px";
                dock.style.top =
                    scrollY + Math.min(Math.max(r.top, pad), vh - h - pad) + "px";
                return true;
            };
            const tryLeft = () => {
                if (spaceLeft < w)
                    return false;
                dock.style.left = scrollX + r.left - w - minGap + "px";
                dock.style.top =
                    scrollY + Math.min(Math.max(r.top, pad), vh - h - pad) + "px";
                return true;
            };
            const tryBelow = () => {
                if (spaceBelow < h)
                    return false;
                dock.style.left =
                    scrollX + Math.min(Math.max(r.left, pad), vw - w - pad) + "px";
                dock.style.top = scrollY + r.bottom + minGap + "px";
                return true;
            };
            const tryAbove = () => {
                if (spaceAbove < h)
                    return false;
                dock.style.left =
                    scrollX + Math.min(Math.max(r.left, pad), vw - w - pad) + "px";
                dock.style.top = scrollY + r.top - h - minGap + "px";
                return true;
            };
            const center = () => {
                dock.style.left = scrollX + Math.max(pad, (vw - w) / 2) + "px";
                dock.style.top = scrollY + Math.max(pad, (vh - h) / 2) + "px";
            };
            // 右→左→下→上→中央
            if (tryRight())
                return;
            if (tryLeft())
                return;
            if (tryBelow())
                return;
            if (tryAbove())
                return;
            center();
        }
        function _measureRect(el) {
            if (!el)
                return { left: 0, top: 0, width: 0, height: 0 };
            const cs = getComputedStyle(el);
            let restore = null;
            if (cs.display === "none") {
                // 一時的に見えない状態で表示(block)にして測る
                restore = {
                    display: el.style.display,
                    visibility: el.style.visibility,
                };
                el.style.visibility = "hidden";
                el.style.display = "block";
            }
            const r = el.getBoundingClientRect();
            if (restore) {
                el.style.display = restore.display ?? "";
                el.style.visibility = restore.visibility ?? "";
            }
            return r;
        }
        // 行からプレビュー文字列を受け取る（renderList で row.dataset.preview を仕込んでいる前提）
        function textFromRow(row) {
            return row?.dataset?.preview || "（内容なし）";
        }
        // 非表示のまま「中身と座標」を更新
        function updateDock(btn) {
            const row = btn.closest(".row");
            if (!row)
                return;
            const text = textFromRow(row);
            const box = ensureDock();
            // 中身は常時更新（固定中でも内容は切り替える仕様）
            body.textContent = text;
            body.scrollTop = 0;
        }
        // A) マウスムーブ：常時差し替え（見せない）
        //    → プレビューボタンクラスに当たったときだけ更新
        let raf = 0;
        document.addEventListener("mousemove", (e) => {
            const t = e.target;
            if (!(t instanceof Element))
                return;
            const btn = t.closest?.(BTN_SEL);
            if (!btn)
                return;
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => updateDock(btn));
        }, true);
        // B) クリック：表示/非表示トグル（固定ON/OFF）
        document.addEventListener("click", (e) => {
            const t = e.target;
            if (!(t instanceof Element))
                return;
            const btn = t.closest?.(BTN_SEL);
            if (!btn)
                return;
            e.preventDefault();
            e.stopPropagation();
            const box = ensureDock();
            const showing = box.getAttribute("data-show") === "1";
            if (showing) {
                box.removeAttribute("data-show");
                box.removeAttribute("data-pinned");
                _savePlace(box); // 非表示時も最終位置を保存
            }
            else {
                updateDock(btn); // ★中身だけ更新（位置は弄らない）
                const saved = _loadPlace();
                const nowSig = { vp: _vp(), lr: _listRect() };
                if (saved &&
                    _sameVP(saved.sig?.vp, nowSig.vp) &&
                    _sameRect(saved.sig?.lr, nowSig.lr)) {
                    if (Number.isFinite(saved.w))
                        box.style.width = saved.w + "px";
                    if (Number.isFinite(saved.h))
                        box.style.height = saved.h + "px";
                    if (Number.isFinite(saved.x))
                        box.style.left = saved.x + "px";
                    if (Number.isFinite(saved.y))
                        box.style.top = saved.y + "px";
                }
                else {
                    placeDockNearList(box); // ★ヒューリスティック
                    _savePlace(box); // 新基準で保存
                }
                box.setAttribute("data-show", "1");
                box.setAttribute("data-pinned", "1");
            }
        }, true);
        // ★Escだけは残して、外側クリックでのクローズは無効化
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                //          pinned = false;
                ensureDock().removeAttribute("data-show");
                ensureDock().removeAttribute("data-pinned");
            }
        });
    }
    // ========= 3) 基準線の自動追従 =========
    function bindBaselineAutoFollow() {
        // 軽いデバウンス（連続イベントをまとめる）
        const debounce = (fn, ms = 60) => {
            let t;
            return (...a) => {
                clearTimeout(t);
                t = setTimeout(() => fn(...a), ms);
            };
        };
        // 基準線を再配置（shared.js の公開API）
        const redraw = debounce(() => {
            try {
                SH?.redrawBaseline?.();
            }
            catch { }
        }, 60);
        // ウィンドウサイズ・画面回転・タブ可視状態
        window.addEventListener("resize", redraw, { passive: true });
        window.addEventListener("orientationchange", redraw);
        document.addEventListener("visibilitychange", redraw);
        // スクロールコンテナの高さ変化（DevTools ドッキング変更等も検知）
        try {
            const sc = LG?._scroller || document.scrollingElement || document.documentElement;
            const ro = new ResizeObserver(redraw);
            ro.observe(sc);
            // ページ離脱でクリーンアップ（念のため）
            window.addEventListener("pagehide", () => {
                window.CGTN_PREVIEW?.hide?.("pagehide");
                try {
                    ro.disconnect();
                }
                catch { }
            }, { once: true });
        }
        catch { }
        // 初回も一度呼ぶ（初期描画）
        requestAnimationFrame(redraw); // 初期描画
    }
    // 基準線の表示ON/OFF 設定画面より受信
    // === options.html からの即時反映メッセージを受ける ===
    try {
        chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
            //      SH.addLog("onMessage addlog", "DEBUG"); //log
            if (!msg || !msg.type)
                return;
            if (msg.type === "cgtn:get-chat-meta") {
                try {
                    const chatId = SH.getChatId?.() || "";
                    const title = SH.getChatTitle?.() || "";
                    sendResponse({ ok: true, chatId, title });
                }
                catch (e) {
                    sendResponse({ ok: false, error: String(e) });
                }
                return true; // ★これ重要
            }
            if (msg.type === "cgtn:get-chat-stats") {
                try {
                    const ST = window.ST || {};
                    const rows = Array.isArray(ST.all) ? ST.all : [];
                    const chatId = SH.getChatId?.() || "";
                    const turns = rows.length;
                    let uploads = 0, downloads = 0;
                    rows.forEach((article) => {
                        if (article.querySelector('[data-testid*="attachment"], .text-token-file, [data-filename]'))
                            uploads++;
                        if (article.querySelector('a[download], button[aria-label*="Download"], [data-testid*="download"]'))
                            downloads++;
                    });
                    sendResponse({ ok: true, chatId, turns, uploads, downloads });
                }
                catch (e) {
                    SH.logError("catch ", e); //log
                    sendResponse({ ok: false, error: String(e) });
                }
                return true;
            }
            // 設定画面でピン削除 付箋データ削除　メッセージ受信
            if (msg.type === "cgtn:pins-deleted") {
                //        SH.addLog("cgtn:pins-deleted addlog", "DEBUG"); //log
                const cid = SH.getChatId?.();
                if (!cid || (msg.chatId && msg.chatId !== cid))
                    return;
                LG.hydratePinsCache?.(cid);
                if (SH.isListOpen?.()) {
                    window.CGTN_LOGIC?.renderList?.(false);
                }
                // ★追加: 削除通知を受け取ったら、バッジとタイトルも即座に更新する
                try {
                    window.CGTN_LOGIC?.updatePinOnlyBadge?.();
                    window.CGTN_LOGIC?.updateListChatTitle?.();
                }
                catch (e) {
                    SH.logError("catch cgtn:pins-deleted バッジとタイトル", e); //log
                }
                return true;
            }
            if (msg.type === "cgtn:viz-toggle") {
                //        SH.addLog(":viz-toggle addlog", "DEBUG"); //log
                const on = !!msg.on;
                SH.toggleViz?.(on);
                const cb = document.querySelector("#cgpt-viz");
                if (cb)
                    cb.checked = on;
                SH.saveSettingsPatch?.({ showViz: on });
            }
            // ========================================================
            // ★追加: 設定変更の受信処理 2026.02.11
            // ========================================================
            if (msg.type === "cgtn:settings-updated") {
                // 1. 受け取ったパッチでメモリ内の設定(CFG)を即時更新
                if (msg.patch && SH.setCFG) {
                    const cur = SH.getCFG() || {};
                    // 簡易マージ（deepMergeがあればそれを使っても良いですが、ここではシンプルに）
                    const next = { ...cur, ...msg.patch };
                    SH.setCFG(next);
                }
                else {
                    // パッチがなければストレージから読み直す
                    SH.reloadFromSync?.();
                }
                // 2. ナビパネルの表示を更新
                // (ui.tsのapplyLangが、現在の設定値を見て [Enter] などを書き換えます)
                window.CGTN_UI?.applyLang?.();
                // 3. 基準線の再描画なども念のため
                if (msg.patch && typeof msg.patch.showViz !== "undefined") {
                    SH.toggleViz?.(!!msg.patch.showViz);
                }
            }
            // ========================================================
        });
    }
    catch (e) {
        SH.logError("catch chrome.runtime.onMessage", e);
    }
    // ======== URL変化をフックして postMessage させる＋再構築タイミングを遅延 ========
    function injectUrlChangeHook() {
        try {
            // すでに差し込まれていればスキップ
            if (document.getElementById("cgtn-url-hook")) {
                return;
            }
            // すでにIIFEが起動済みならスキップ（page側フラグを拾えない場合もあるので二段ガード）
            if (window.__CGTN_URL_HOOKED__ === true) {
                return;
            }
            const url = chrome.runtime.getURL("inject_url_hook.js");
            const s = document.createElement("script");
            s.id = "cgtn-url-hook";
            s.src = url;
            s.async = false; // 実行順の安定化
            s.onerror = (e) => SH.logError("[cgtn] inject_url_hook failed:", e);
            (document.documentElement || document.head || document.body).appendChild(s);
        }
        catch (e) {
            SH.logError("injectUrlChangeHook failed", e);
        }
    }
    // ★追加：ページ情報を能動的に初期化するヘルパー 2026.01.26
    // ロード時OFF→ONの場合、onMessageによる通知がまだ来ていない（または逃した）可能性があるため
    function manualInitPageInfo() {
        try {
            const p = location.pathname || "/";
            let kind = "other";
            if (/^\/c\/[^/]+$/.test(p))
                kind = "chat";
            else if (p === "/" || p === "/new")
                kind = "new"; // or home
            let cid = "";
            const m = p.match(/\/c\/([^/?#]+)/);
            if (m)
                cid = m[1];
            // SHにセット（onMessageが来るまでの仮の値として機能する）
            SH.setPageInfo?.({ kind, cid, hasTurns: true });
        }
        catch (e) {
            SH.logError("[cgtn] manualInitPageInfo failed", e);
        }
    }
    // =================================================================
    // ★決定版: Enterキー送信制御 (送信・改行ともにイベント変換方式)
    // =================================================================
    function enableEnterKeyGuard() {
        if (window.__CGTN_ENTER_GUARD__)
            return;
        window.__CGTN_ENTER_GUARD__ = true;
        window.addEventListener("keydown", (e) => {
            // 1. 拡張機能が発行した「偽のイベント」は無視（無限ループ防止）
            if (!e.isTrusted)
                return;
            const cfg = SH.getCFG?.() || {};
            const method = cfg.sendKeyMethod || "enter";
            // Enter送信(標準)モードなら何もしない
            if (method === "enter")
                return;
            if (e.isComposing)
                return;
            if (e.key !== "Enter")
                return;
            const target = e.target;
            if (!target.closest('textarea, [contenteditable="true"]'))
                return;
            // 2. Shift+Enter は「改行」として通す (サイト標準)
            if (e.shiftKey)
                return;
            // 3. 送信キーかどうかの判定
            let isSendKey = false;
            if (method === "ctrl_enter") {
                if (e.ctrlKey || e.metaKey)
                    isSendKey = true;
            }
            else if (method === "alt_enter") {
                if (e.altKey)
                    isSendKey = true;
            }
            // 4. アクション実行
            // どのような場合でも、元のイベントはいったん消します
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (isSendKey) {
                // ★送信アクション
                // Alt+Enterなどはサイトが理解できないので、「修飾キーなしのEnter」に変換して送信させる
                dispatchFakeEnter(target, false);
            }
            else {
                // ★改行アクション
                // ただのEnterなどをブロックしたので、「Shift+Enter」に変換して改行させる
                dispatchFakeEnter(target, true);
            }
        }, { capture: true });
    }
    // イベント発行ヘルパー
    function dispatchFakeEnter(target, asNewline) {
        const event = new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            // trueならShift+Enter(改行)、falseならEnter(送信)として振る舞う
            shiftKey: asNewline,
            ctrlKey: false,
            altKey: false,
            metaKey: false,
        });
        target.dispatchEvent(event);
    }
    // =================================================================
    // 修正後: initialize (起動遅延を極限まで短縮)
    // =================================================================
    let __isInitialized = false;
    let __initPromise = null;
    async function initialize() {
        if (__isInitialized)
            return;
        if (__initPromise)
            return __initPromise;
        __initPromise = (async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            try {
                await SH.migrateStorageIfNeeded?.();
            }
            catch (e) { }
            await SH.loadSettings();
            try {
                SH.addLog?.(`[INIT] build=${CGTN_BUILD}`);
            }
            catch { }
            const cfg = SH.getCFG?.() || {};
            const isEnabled = cfg.navEnabled !== false;
            // =========================================================
            // ★修正1：RUN.idleの直接代入を廃止し、まずは安全な「OFF」で初期化
            // =========================================================
            RUN.changeState("OFF", "init-boot", "OFF");
            try {
                await SH.migratePinsStorageOnce?.();
            }
            catch { }
            enableEnterKeyGuard();
            // ★ RUN.state が OFF なので、最初はスッキリしたOFFの姿でUIが生成される
            UI.installUI();
            // =========================================================
            // ★修正2：UI生成直後に、一覧(リスト)トグルを必ずOFFにする(短期記憶リセット)
            // =========================================================
            const listToggle = document.getElementById("cgpt-list-toggle");
            if (listToggle)
                listToggle.checked = false;
            ensureFocusPark();
            installFocusStealGuard();
            UI.applyLang();
            UI.clampPanelWithinViewport();
            try {
                SH?.renderViz?.(cfg, !!cfg?.showViz);
            }
            catch { }
            EV.bindEvents();
            bindPreviewDockOnce();
            bindBaselineAutoFollow();
            if (USE_INJECT_URL_HOOK)
                injectUrlChangeHook();
            manualInitPageInfo();
            try {
                SH.cleanupZeroPinRecords?.();
            }
            catch { }
            window.addEventListener("resize", () => UI.clampPanelWithinViewport(), {
                passive: true,
            });
            window.addEventListener("orientationchange", () => UI.clampPanelWithinViewport());
            // ★ 初期化完了フラグを立てる
            __isInitialized = true;
            // =========================================================
            // ★修正3：ストレージ設定(isEnabled)がONなら、最後に自動起動させる！
            // =========================================================
            const powerToggle = document.getElementById("cgtn-power-toggle");
            if (isEnabled) {
                if (powerToggle)
                    powerToggle.checked = true;
                // すでに __isInitialized = true なので、スムーズに起動処理が走る
                startApp("auto-start-from-storage");
            }
            else {
                if (powerToggle)
                    powerToggle.checked = false;
            }
        })();
        return __initPromise;
    }
    // 2026.01.22 2026.02.20 2026.02.22
    // =================================================================
    //  アプリの本当の入り口 (boot)
    // =================================================================
    const boot = async () => {
        // 1. 初期化、DOM生成、および設定に応じた自動起動(startApp)まで、
        // 新しくなった initialize() がすべて一手に引き受けてくれます！
        await initialize();
        // ※以前ここに書かれていた RUN.idle の判定や、startApp("boot") の呼び出しは、
        // initialize() の内部に吸収されたため完全に不要（削除）になりました。
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => boot(), { once: true });
    }
    else {
        boot();
    }
    // =================================================================
    // 2. startApp (純粋にONにするだけの機能)
    // =================================================================
    // content.ts
    async function startApp(reason = "start") {
        if (!__isInitialized && __initPromise)
            await __initPromise;
        else if (!__isInitialized)
            await initialize();
        if (RUN.state !== "OFF")
            return;
        // =========================================================
        // ★修正の核心: ここで状態をLOADINGにし、UI表示もすべて任せる！
        // (旧 RUN.idle = false や UIの直接操作は全削除)
        // =========================================================
        RUN.changeState("LOADING", `app-start:${reason}`, "Loading...");
        const myGen = ++RUN.gen;
        const nav = document.getElementById("cgpt-nav");
        if (nav) {
            nav.classList.remove("disabled", "cgtn-standby");
        }
        try {
            UI?.setIdleMode?.(false);
        }
        catch { }
        if (typeof window.CGTN_LOGIC?.installAutoSyncForTurns === "function") {
            window.CGTN_LOGIC.installAutoSyncForTurns();
        }
        try {
            LG?.setListEnabled?.(false);
            const chk = document.getElementById("cgpt-list-toggle");
            if (chk instanceof HTMLInputElement)
                chk.checked = false;
            // 一覧ボタンの見た目（色）も確実にOFFに戻す！
            const listBtn = document.getElementById("cgpt-list-btn");
            if (listBtn)
                listBtn.classList.remove("active");
            LG?.updatePinOnlyBadge?.();
            LG?.updateListChatTitle?.();
        }
        catch { }
        if (RUN.timer) {
            clearTimeout(RUN.timer);
            RUN.timer = 0;
        }
        SH.addLog?.("[startApp] schedule rebuild", {
            reason,
            myGen,
            state: RUN.state,
        });
        RUN.timer = window.setTimeout(() => {
            RUN.timer = 0;
            rebuildAndRenderSafely({ appGen: myGen }).catch(() => { });
        }, 50);
    }
    // =================================================================
    // 3. stopApp (OFFにする)
    // =================================================================
    function stopApp(reason = "stop") {
        // 1. すでにOFFなら何もしない（ガード節）
        if (RUN.state === "OFF")
            return;
        // 2. 状態をOFFに確定させる
        RUN.changeState("OFF", `app-stop:${reason}`);
        // 3. 予約済みタイマーがあれば即キャンセル
        if (RUN.timer) {
            clearTimeout(RUN.timer);
            RUN.timer = 0;
        }
        // ★重要: 世代を進めて、過去のON/非同期処理をすべて無効化
        RUN.gen++;
        try {
            LG?.stopScrollSpy?.();
        }
        catch { }
        try {
            // 2026.02.22
            RUN.prevListEnabled = window.CGTN_SHARED?.isListToggleOn?.() ?? false;
        }
        catch {
            RUN.prevListEnabled = null;
        }
        try {
            window.CGTN_PREVIEW?.hide?.("idle");
        }
        catch { }
        try {
            LG?.setListEnabled?.(false);
            LG?.clearListPanelUI?.();
        }
        catch { }
        try {
            const chk = document.getElementById("cgpt-list-toggle");
            if (chk instanceof HTMLInputElement)
                chk.checked = false;
            // OFFにする時もボタンの色を確実に剥がしておく！
            const listBtn = document.getElementById("cgpt-list-btn");
            if (listBtn)
                listBtn.classList.remove("active");
        }
        catch { }
        try {
            LG?.detachTurnObserver?.();
        }
        catch { }
        try {
            UI?.setIdleMode?.(true);
        }
        catch { }
        const nav = document.getElementById("cgpt-nav");
        // 最小化＋OFF表示
        UI?.setPanelOffState?.();
        RUN.bag.flush();
    }
    // 2026.02.20 ２度目の大手術（★修正版）
    window.CGTN_APP = {
        start: startApp, // ← 本物の startApp 関数をストレートに呼ぶ！
        stop: stopApp, // ← 本物の stopApp 関数をストレートに呼ぶ！
        isRunning: () => RUN.state !== "OFF",
        isIdle: () => RUN.state === "OFF",
        getState: () => RUN.state,
        changeState: (s, reason, msg) => RUN.changeState(s, reason, msg),
        getLoadingMsg: () => RUN.getLoadingMsg(),
    };
    let _turnObs = null;
    let _observedRoot = null;
    LG.detachTurnObserver = function () {
        try {
            _turnObs?.disconnect();
        }
        catch { }
        _turnObs = null;
        _observedRoot = null;
    };
})();
