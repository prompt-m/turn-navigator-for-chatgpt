// content.ts — Entry (refactor skeleton)
(function () {
    "use strict";
    if (document.getElementById("cgpt-nav"))
        return;
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
    const RUN = {
        running: false,
        bag: makeBag(),
        prevListEnabled: null,
        // タブ内Idle状態：デバッグ用途でリロードしても維持（sessionStorage優先）
        get idle() {
            try {
                if (sessionStorage.getItem("cgtnIdle") === "1")
                    return true;
            }
            catch { }
            return !!window.__CGTN_IDLE__;
        },
        set idle(v) {
            window.__CGTN_IDLE__ = !!v;
            try {
                if (v)
                    sessionStorage.setItem("cgtnIdle", "1");
                else
                    sessionStorage.removeItem("cgtnIdle");
            }
            catch { }
        },
    };
    // 画面操作を一時的にブロック
    // ★引数 label を追加 (デフォルトは "Loading...")
    function setUiBusy(busy = true, label = "Loading...") {
        const ids = ["cgpt-nav", "cgpt-list-panel"];
        for (const id of ids) {
            const host = document.getElementById(id);
            if (!host)
                continue;
            host.classList.toggle("loading", busy);
            // 膜（mask）の処理は前回削除したのでそのまま
            const mask = host.querySelector(":scope > .cgtn-mask");
            if (mask)
                mask.remove();
        }
        // ステータス表示
        if (busy) {
            // ★修正: 引数で渡された文字を表示する
            UI?.updateStatusDisplay?.(label);
        }
        else {
            if (RUN.idle) {
                UI?.updateStatusDisplay?.("OFF");
            }
            else {
                if (typeof LG.updateStatus === "function") {
                    LG.updateStatus();
                }
                else {
                    UI?.updateStatusDisplay?.("Loading...");
                }
            }
        }
    }
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
    // =================================================================
    // rebuildAndRenderSafely (待機順序の適正化)
    // =================================================================
    let __buildGen = 0;
    async function rebuildAndRenderSafely({ forceList = false } = {}, oldSig = null) {
        const LG = window.CGTN_LOGIC;
        const SH = window.CGTN_SHARED;
        const myGen = ++__buildGen;
        // 1. Loading開始
        // アプリがONのときだけ "Loading..." にする
        // OFFのときは "OFF" のまま変えない、あるいは Loading にしても最後に戻す
        if (!RUN.idle) {
            setUiBusy(true, "Loading...");
            UI?.updateStatusDisplay?.("Loading...");
        }
        // 2. 待機フェーズ
        if (oldSig) {
            await waitForChatSettled({ mustNotMatch: oldSig });
            if (myGen !== __buildGen)
                return;
        }
        try {
            // 3. 正規ロジック再構築
            LG.rebuild?.();
            const kind = SH.getPageInfo?.()?.kind || "other";
            const cfg = SH.getCFG?.() || {};
            // アプリがONの場合のみリスト表示を検討
            const needList = !RUN.idle && kind === "chat" && (forceList || !!cfg.list?.enabled);
            if (needList) {
                await new Promise((r) => requestAnimationFrame(r));
                if (myGen !== __buildGen)
                    return;
                await LG.renderList?.(true);
            }
            // 4. 最終更新
            if (myGen === __buildGen) {
                if (RUN.idle) {
                    // ★ アプリがOFFなら、計算結果に関わらず強制的に ①か③ の状態にする
                    const nav = document.getElementById("cgpt-nav");
                    if (nav)
                        nav.classList.add("disabled");
                    UI?.updateStatusDisplay?.("OFF");
                }
                else {
                    // ONなら updateStatus に任せる (②か④になる)
                    if (typeof LG.updateStatus === "function") {
                        LG.updateStatus();
                    }
                }
            }
        }
        catch (e) {
            SH.logError("rebuild failed", e);
            if (forceList) {
                LG?.setListEnabled?.(false);
            }
        }
        finally {
            if (myGen === __buildGen) {
                setUiBusy(false);
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
                    UI?.updateStatusDisplay?.("OFF");
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
                    if (d.type === "url-change") {
                        const shouldActivate = RUN.running ||
                            (!RUN.idle && (kind === "chat" || kind === "project"));
                        if (shouldActivate) {
                            if (!RUN.running)
                                startApp("auto-start");
                            // ★追加: 何よりも先にスクロール監視を止める！
                            // これで「前の数字」が亡霊のように復活するのを防ぎます
                            LG.stopScrollSpy?.();
                            try {
                                window.CGTN_PREVIEW?.hide?.("url-change");
                            }
                            catch (e) { }
                            setUiBusy(true, "Loading...");
                            // ★重要: ここではリストを消さず(clearListPanelUI削除)、
                            // 代わりにナビの数字だけクリアして「前の数字」が出ないようにする
                            UI?.updateStatusDisplay?.("Loading...");
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
                        else {
                            // Idle時のサイレント更新
                            waitForChatSettled({ maxMs: 5000 })
                                .then(() => LG.updateFooterOnly?.())
                                .catch(() => { });
                        }
                    }
                    // B. 会話追加
                    else {
                        if (RUN.running) {
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
        RUN.bag.add(() => {
            try {
                if (__debTo)
                    window.clearTimeout(__debTo);
            }
            catch { }
            try {
                window.removeEventListener("message", onMessage, true);
            }
            catch { }
            window.__CGTN_MSG_BOUND__ = false;
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
            try {
                if (to)
                    window.clearTimeout(to);
            }
            catch { }
            to = window.setTimeout(() => {
                try {
                    park.focus({ preventScroll: true });
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
          <button class="cgtn-dock-close" aria-label="Close">✕</button>
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
                if (!titleEl)
                    return;
                const applyDockTitle = () => {
                    const t = window.CGTN_I18N?.t || ((k) => k);
                    titleEl.textContent = t("preview.title");
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
            //      console.log("onMessage msg:", msg, "msg.type:", msg.type);
            if (!msg || !msg.type)
                return;
            //      console.log("onMessage2 msg:", msg, "msg.type:", msg.type);
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
                //        console.log("onMessage4 msg:", msg, "msg.type:", msg.type);
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
                //        console.log("onMessage3 msg:", msg, "msg.type:", msg.type);
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
        //    console.log("catch chrome.runtime.onMessage", e);
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
    async function initialize() {
        // ★変更点: 待機を100msに短縮 (1500msも待つ必要はありません)
        await new Promise((resolve) => setTimeout(resolve, 100));
        // ★追加: データ構造が古ければ自動変換して保存し直す 2026.02.03
        // (loadSettings の前にやるのがポイントです)
        try {
            await SH.migrateStorageIfNeeded?.();
        }
        catch (e) {
            SH.logError("Migration check failed", e);
        }
        await SH.loadSettings(); // ここで v2 データが読み込まれる
        // ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
        // ★追加: 保存された設定を確認し、OFFならアイドルモードにする
        // 2026.02.16
        // ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
        const cfg = SH.getCFG?.() || {};
        // 設定が無い(undefined)場合は true(ON) とみなす
        const isEnabled = cfg.navEnabled !== false;
        if (!isEnabled) {
            console.log("[cgtn] initialize: Starts in IDLE mode.");
            RUN.running = false;
            RUN.idle = true;
            // ※この後に実行される UI.installUI() が RUN.idle を見て
            // 自動的にスイッチをOFFにしてくれます。
        }
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
        try {
            await SH.migratePinsStorageOnce?.();
        }
        catch { }
        // 入力設定 2026.02.11
        enableEnterKeyGuard();
        UI.installUI();
        ensureFocusPark();
        installFocusStealGuard();
        UI.applyLang();
        UI.clampPanelWithinViewport();
        try {
            const cfg = SH?.getCFG?.();
            SH?.renderViz?.(cfg, !!cfg?.showViz);
        }
        catch { }
        EV.bindEvents();
        bindPreviewDockOnce();
        bindBaselineAutoFollow();
        if (USE_INJECT_URL_HOOK) {
            injectUrlChangeHook();
        }
        manualInitPageInfo();
        try {
            SH.cleanupZeroPinRecords?.();
        }
        catch { }
        // ★変更点: 初回スキャンの待機も100msに短縮
        setTimeout(() => {
            rebuildAndRenderSafely({ forceList: false }).catch((e) => SH.logError("[init-delayed] rebuildAndRenderSafely failed", e));
        }, 100);
        window.addEventListener("resize", () => UI.clampPanelWithinViewport(), {
            passive: true,
        });
        window.addEventListener("orientationchange", () => UI.clampPanelWithinViewport());
    }
    // 2026.1.22
    const boot = () => {
        // UI（ヘッダー）だけは常に出す：復帰手段
        try {
            UI?.installUI?.();
        }
        catch { }
        if (RUN.idle) {
            // 既にIdleなら軽量モードで待機
            try {
                UI?.setIdleMode?.(true);
            }
            catch { }
            return;
        }
        // 通常起動
        startApp("boot");
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    }
    else {
        boot();
    }
    /*
    async function startApp(reason: string = "start") {
      if (RUN.running) return;
      RUN.running = true;
      RUN.idle = false;
  
      // ★追加: まず見た目をONモードにする（disabledを外す）
      const nav = document.getElementById("cgpt-nav");
      if (nav) {
        nav.classList.remove("disabled");
        nav.classList.remove("cgtn-standby");
      }
  
      try {
        UI?.installUI?.();
        UI?.setIdleMode?.(false);
      } catch {}
  
      try {
        // 初期化処理（イベントリスナー登録など）
        await initialize();
  
        // 復帰時は常に一覧OFFで開始する
        try {
          LG?.setListEnabled?.(false); // 常にOFF
          const chk = document.getElementById("cgpt-list-toggle");
          if (chk instanceof HTMLInputElement) chk.checked = false;
        } catch {}
  
        try {
          LG?.updatePinOnlyBadge?.();
          LG?.updateListChatTitle?.();
        } catch {}
  
        // ★追加: 復帰直後にターン数を再取得して表示させる
        // (initialize が既に実行済みの場合、スキャンが走らないことがあるため)
        setTimeout(() => {
          rebuildAndRenderSafely().catch(() => {});
        }, 50);
      } catch (e) {
        SH.logError("[cgtn] start failed", reason, e);
        LG?.setListEnabled?.(false);
      }
    }
  
    // =================================================================
    // アプリ停止 (OFFにする)
    // =================================================================
    function stopApp(reason: string = "stop") {
      RUN.running = false;
      RUN.idle = true;
  
      // ★ Idleに入る直前の一覧状態を退避
      try {
        RUN.prevListEnabled = !!SH?.getCFG?.()?.list?.enabled;
      } catch {
        RUN.prevListEnabled = null;
      }
  
      // ★ 実体を閉じる
      try {
        window.CGTN_PREVIEW?.hide?.("idle");
      } catch {}
      try {
        LG?.setListEnabled?.(false);
        LG?.clearListPanelUI?.();
      } catch {}
  
      // ★ UIのチェックも外す
      try {
        const chk = document.getElementById("cgpt-list-toggle");
        if (chk instanceof HTMLInputElement) chk.checked = false;
      } catch {}
  
      // 監視停止
      try {
        LG?.detachTurnObserver?.();
      } catch {}
      try {
        UI?.setIdleMode?.(true);
      } catch {}
  
      // ★追加: 確実にパネルを閉じて「OFF」表示にする
      const nav = document.getElementById("cgpt-nav");
      if (nav) {
        nav.classList.add("disabled"); // これでCSSが効いてボディが消える
      }
      UI?.updateStatusDisplay?.("OFF");
  
      RUN.bag.flush();
    }
  */
    // 2026.02.18
    // src/content.ts
    // ONにする
    async function startApp(reason = "start") {
        if (RUN.running)
            return;
        RUN.running = true;
        RUN.idle = false;
        // ★遷移: ②または④へ向かう
        // まず見た目をONモード(最大化)にし、Loading表示
        const nav = document.getElementById("cgpt-nav");
        if (nav) {
            nav.classList.remove("disabled");
            nav.classList.remove("cgtn-standby");
        }
        UI?.updateStatusDisplay?.("Loading...");
        try {
            UI?.installUI?.();
            UI?.setIdleMode?.(false);
        }
        catch { }
        try {
            await initialize();
            // 復帰時は常に一覧OFF
            try {
                LG?.setListEnabled?.(false);
                const chk = document.getElementById("cgpt-list-toggle");
                if (chk instanceof HTMLInputElement)
                    chk.checked = false;
            }
            catch { }
            try {
                LG?.updatePinOnlyBadge?.();
                LG?.updateListChatTitle?.();
            }
            catch { }
            // ターン数再取得
            setTimeout(() => {
                rebuildAndRenderSafely().catch(() => { });
            }, 50);
        }
        catch (e) {
            SH.logError("[cgtn] start failed", reason, e);
            LG?.setListEnabled?.(false);
        }
    }
    // src/content.ts
    // OFFにする
    function stopApp(reason = "stop") {
        RUN.running = false;
        RUN.idle = true;
        const SH = window.CGTN_SHARED; // ログ用に取得
        SH?.addLog?.(`[stopApp] Called. reason: ${reason}`, "DEBUG");
        // ★ スクロール監視の停止
        try {
            LG?.stopScrollSpy?.();
            SH?.addLog?.(`[stopApp] stopScrollSpy success`, "DEBUG");
        }
        catch (e) {
            SH?.logError?.("stopApp stopScrollSpy", e);
        }
        try {
            RUN.prevListEnabled = !!SH?.getCFG?.()?.list?.enabled;
        }
        catch {
            RUN.prevListEnabled = null;
        }
        // ★ プレビューやリストの非表示処理
        try {
            window.CGTN_PREVIEW?.hide?.("idle");
        }
        catch { }
        try {
            LG?.setListEnabled?.(false);
            LG?.clearListPanelUI?.();
        }
        catch (e) {
            SH?.logError?.("stopApp clearListPanelUI", e);
        }
        try {
            const chk = document.getElementById("cgpt-list-toggle");
            if (chk instanceof HTMLInputElement)
                chk.checked = false;
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
        // ★ パネルを閉じて OFF 表示
        const nav = document.getElementById("cgpt-nav");
        if (nav) {
            nav.classList.add("disabled");
            SH?.addLog?.(`[stopApp] Added .disabled to nav`, "DEBUG");
        }
        else {
            SH?.addLog?.(`[stopApp] nav element NOT FOUND!`, "WARN");
        }
        try {
            UI?.updateStatusDisplay?.("OFF");
            SH?.addLog?.(`[stopApp] updateStatusDisplay("OFF") success`, "DEBUG");
        }
        catch (e) {
            SH?.logError?.("stopApp updateStatusDisplay", e);
        }
        RUN.bag.flush();
        SH?.addLog?.(`[stopApp] Finished`, "DEBUG");
    }
    window.CGTN_APP = {
        start: startApp,
        stop: stopApp,
        isRunning: () => RUN.running,
        isIdle: () => RUN.idle,
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
