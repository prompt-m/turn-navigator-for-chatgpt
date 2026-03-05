// logic.ts
(() => {
    //  const UI = window.CGTN_UI;
    const SH = window.CGTN_SHARED;
    const NS = (window.CGTN_LOGIC = window.CGTN_LOGIC || {});
    //  const TURN_SEL = 'div[data-testid^="conversation-turn-"]'; // keep (legacy)
    const TURN_SEL = "article"; // 1 <article> = 1 turn
    const SHOW_UNKNOWN_ATTACH = false; // trueにすると従来表示
    // ===== debug =====
    const TNDBG = true;
    function dbg(...a) {
        if (!TNDBG)
            return;
        console.log("[TNDBG]", ...a);
    }
    function now() {
        return Math.floor(performance.now());
    }
    const titleEscape = SH.titleEscape;
    let uploads = 0, downloads = 0; // ダウンロードターン数・アップロードターン数
    // 集計結果の置き場
    NS.metrics = {
        all: { uploads: 0, downloads: 0 },
        pins: { uploads: 0, downloads: 0 },
    };
    // let PINS: string[] = []; // "turn:1" みたいなキー集合（JS版互換）!!!!
    let PINS = new Set(); // "turn:1" みたいなキー集合（Setで保持）
    const _delegatedClipBound = new WeakSet(); // !!!!
    NS.viewRole = "all"; // ここだけ追加
    const T = (k) => window.CGTN_I18N?.t?.(k) ?? k;
    // --- ヘルパー: 自作UI内かどうかの判定 (AutoSyncで使用) ---
    function inOwnUI(node) {
        if (!node || node.nodeType !== 1)
            return false;
        // data-cgtn-ui 属性、または主要ID内かどうか
        if (node.closest?.("[data-cgtn-ui]"))
            return true;
        const nav = document.getElementById("cgpt-nav");
        const list = document.getElementById("cgpt-list-panel");
        return ((nav && (node === nav || nav.contains(node))) ||
            (list && (node === list || list.contains(node))));
    }
    // stateに対応する表示切替え
    NS.updateStatus = function updateStatus() {
        const SH = window.CGTN_SHARED;
        const UI = window.CGTN_UI;
        const app = window.CGTN_APP;
        const state = app?.getState ? app.getState() : "OFF";
        // ▼▼▼ 電源トグルの「起動中」見た目制御 追加 ▼▼▼
        const powerWrap = document.querySelector(".cgtn-power-wrapper");
        if (powerWrap) {
            powerWrap.classList.toggle("loading", state === "LOADING");
        }
        // ▼▼▼ 物理バリア等既存コード維持 ▼▼▼
        const ids = ["cgpt-nav", "cgpt-list-panel"];
        const isBusy = state === "LOADING";
        for (const id of ids) {
            const host = document.getElementById(id);
            if (!host)
                continue;
            host.classList.toggle("loading", isBusy);
            let mask = host.querySelector(":scope > .cgtn-mask");
            if (isBusy && !mask) {
                mask = document.createElement("div");
                mask.className = "cgtn-mask";
                host.appendChild(mask);
            }
            else if (!isBusy && mask) {
                mask.remove();
            }
        }
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
        if (state === "OFF") {
            UI?.setPanelOffState?.();
            return;
        }
        const nav = document.getElementById("cgpt-nav");
        if (nav) {
            nav.classList.remove("disabled", "cgtn-standby");
        }
        if (state === "LOADING") {
            const msg = typeof app?.getLoadingMsg === "function"
                ? app.getLoadingMsg()
                : "Loading...";
            UI?.updateStatusDisplay?.(msg);
            return;
        }
        if (state === "STANDBY") {
            UI?.updateStatusDisplay?.("Standby");
            return;
        }
        // 状態④：ACTIVE（ターン有・ナビゲートON）
        if (state === "ACTIVE") {
            const list = NS.ST?.all || [];
            const total = list.length;
            // フェールセーフ：万が一ACTIVEなのにDOMが0件ならStandby表示に落とす
            if (total === 0) {
                UI?.updateStatusDisplay?.("Standby");
                return;
            }
            // =======================================================
            // ★改善: 絶対座標と相対座標のハイブリッド最強判定
            // =======================================================
            const sc = typeof getTrueScroller === "function"
                ? getTrueScroller()
                : NS._scroller || document.scrollingElement;
            const cfg = SH.getCFG?.() || {};
            const bias = Number(cfg.centerBias) || 0.4;
            const eps = Number(cfg.eps) || 20;
            let current = 1;
            let isBottom = false;
            // --- 1. 一番下にいるかどうかの絶対判定（これで1に戻るバグを物理的に封殺！） ---
            // 判定A: スクロールコンテナの計算上、一番下にいるか
            if (sc && sc.scrollHeight > 0 && sc.clientHeight > 0) {
                if (sc.scrollHeight - Math.ceil(sc.scrollTop) <= sc.clientHeight + 10) {
                    isBottom = true;
                }
            }
            // 判定B: 最後のターン(要素)が画面内に直接見えているか
            const lastEl = list[total - 1];
            if (lastEl) {
                const r = lastEl.getBoundingClientRect();
                // 上端が画面内にある、あるいは下端が画面の底辺付近にあるなら一番下とみなす
                if ((r.top >= 0 && r.top <= window.innerHeight) ||
                    (r.bottom >= 0 && r.bottom <= window.innerHeight + 50)) {
                    isBottom = true;
                }
            }
            // --- 2. 現在地の計算 ---
            if (isBottom) {
                // ★ 一番下にいるなら、途中の計算をすっ飛ばして問答無用でMAXにする！
                current = total;
            }
            else {
                // ★改善：Universal版と同じ絶対座標(getBoundingClientRect)ベースの計算！
                // スクロールコンテナの scrollTop や offsetTop の一時的な狂いに影響されません。
                const vh = window.innerHeight;
                const targetY = vh * bias; // 判定の基準線
                for (let i = 0; i < total; i++) {
                    const rect = list[i].getBoundingClientRect();
                    // 要素の上端が「基準線＋遊び(eps)」より上にあれば、それを現在地とする
                    if (rect.top <= targetY + eps) {
                        current = i + 1;
                    }
                    else {
                        break; // 基準線を越えたら探索終了
                    }
                }
                // ガタつきで1件も見つからなかった時のための保護
                if (current === 0)
                    current = 1;
            }
            UI?.updateStatusDisplay?.(`${current} / ${total}`);
        }
    };
    // ★最適化: 二分探索で現在地を探す（計算量 O(N) -> O(log N)） 2026.02.01
    function calcCurrentTurnIndex(sc) {
        if (!sc || !NS.ST.all.length)
            return 0;
        const cfg = SH.getCFG() || {};
        const bias = Number(cfg.centerBias) || 0.5;
        const viewportH = sc.clientHeight || window.innerHeight;
        const scrollTop = sc.scrollTop || 0;
        // 判定基準ライン
        const baselineY = scrollTop + viewportH * bias;
        let low = 0;
        let high = NS.ST.all.length - 1;
        let found = 0;
        // 二分探索
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const el = NS.ST.all[mid];
            const y = articleTop(sc, el);
            if (y <= baselineY + 10) {
                // 基準線より上にある（通過済み）→ もっと下にあるかも
                found = mid + 1; // 1始まりの番号として候補保存
                low = mid + 1;
            }
            else {
                // 基準線より下にある（まだ来てない）→ もっと上を探す
                high = mid - 1;
            }
        }
        return found || 1;
    }
    // スクロール監視 (数値更新用)
    function bindScrollSpy() {
        const handler = (e) => {
            // =========================================================
            // ★爆速化: 超絶重かった querySelector を削除！
            // =========================================================
            const target = e.target;
            if (!NS._scroller && target instanceof HTMLElement) {
                // body や main などの大きな枠がスクロールした時だけ軽く採用
                if (target.tagName === "MAIN" ||
                    target.tagName === "BODY" ||
                    target.tagName === "HTML") {
                    NS._scroller = target;
                }
            }
            if (NS._spyTimer)
                return;
            NS._spyTimer = window.setTimeout(() => {
                NS._spyTimer = null;
                if (typeof NS.updateStatus === "function")
                    NS.updateStatus();
            }, 200);
        };
        if (!NS._scrollSpy) {
            window.addEventListener("scroll", handler, {
                passive: true,
                capture: true,
            });
            NS._scrollSpy = { el: window, fn: handler };
        }
    }
    // =================================================================
    // ★スクロール監視を強制停止
    // =================================================================
    NS.stopScrollSpy = function () {
        if (NS._scrollSpy) {
            try {
                // ★修正: capture: true を指定して確実に監視を解除する
                NS._scrollSpy.el.removeEventListener("scroll", NS._scrollSpy.fn, {
                    capture: true,
                });
            }
            catch { }
            NS._scrollSpy = null;
        }
        if (NS._spyTimer) {
            clearTimeout(NS._spyTimer);
            NS._spyTimer = null;
        }
        NS._scroller = null;
    };
    // ★チャット別ピン・キャッシュ
    let _pinsCache = null; // { [turnId]: true }
    NS._pinsCache = _pinsCache; // デバッグ用
    function hydratePinsCache(chatId) {
        const cfg = SH.getCFG() || {};
        const pinsArr = cfg.pinsByChat?.[chatId]?.pins || [];
        _pinsCache = {};
        for (let i = 0; i < pinsArr.length; i++) {
            if (pinsArr[i])
                _pinsCache["turn:" + (i + 1)] = true;
        }
    }
    function isPinnedByKey(turnId) {
        return !!(_pinsCache && _pinsCache[String(turnId)]);
    }
    NS.isPinnedByKey = isPinnedByKey;
    // 互換：従来の _savePinsSet 等を使っていた呼び出しを内部移譲
    NS.isPinned = function (art) {
        return isPinnedByKey(NS.getTurnKey?.(art));
    };
    // --- util ---
    function isVisible(el) {
        if (!el)
            return false;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden")
            return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }
    // src/logic.ts の isScrollable 関数
    // ★差し替え: Universal版のスクロール特定ロジック
    function isScrollable(el) {
        if (!el)
            return false;
        const style = window.getComputedStyle(el);
        if (!/(auto|scroll)/.test(style.overflowY))
            return false;
        if (style.display === "none")
            return false;
        if (style.overflowY === "hidden" || style.overflowY === "visible")
            return false;
        // ▼▼▼ 修正: 高さの判定を削除！CSSの定義だけで信じる！ ▼▼▼
        // return el.scrollHeight > el.clientHeight + 1; // ←この行を消す
        return true;
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
    }
    // src/logic.ts の getTrueScroller をまるごと置き換え 2026.02.20
    function getTrueScroller() {
        // 1) キャッシュが「本物」で、まだ画面に存在していればそれを返す
        if (NS._scroller &&
            NS._scroller !== document.documentElement &&
            NS._scroller !== document.scrollingElement &&
            document.body.contains(NS._scroller)) {
            return NS._scroller;
        }
        // 2) 会話要素の親を辿ってスクロール要素を探す
        let found = null;
        const clue = document.querySelector("main article") ||
            document.querySelector("main [data-message-author-role]") ||
            document.querySelector("article") ||
            document.querySelector("[data-message-author-role]");
        if (clue) {
            let node = clue;
            while (node && node !== document.body) {
                node = node.parentNode;
                if (node instanceof HTMLElement && isScrollable(node)) {
                    found = node;
                    break;
                }
            }
        }
        // 3) main要素自体
        if (!found) {
            const main = document.querySelector("main");
            if (main && isScrollable(main)) {
                found = main;
            }
        }
        // 4) 結果の判定
        if (found) {
            // ★本物が見つかった場合のみキャッシュに保存する！
            NS._scroller = found;
            return found;
        }
        else {
            // ★見つからなかった場合は、キャッシュ(NS._scroller)を汚さずに
            // その場限りのフォールバック(0を返すためのダミー)を返す！
            return document.scrollingElement || document.documentElement;
        }
    }
    // ★スクロール用 厳しめ（安定版のまま）
    function headNodeOf(article) {
        if (article?.tagName === "ARTICLE")
            return article;
        if (!article)
            return null;
        const pick = (root, sel) => {
            const n = (root || article).querySelector(sel);
            return n && isVisible(n) ? n : null;
        };
        const isAssistant = article.matches('[data-message-author-role="assistant"]') ||
            !!article.querySelector('[data-message-author-role="assistant"]');
        const isUser = article.matches('[data-message-author-role="user"]') ||
            !!article.querySelector('[data-message-author-role="user"]');
        if (isAssistant) {
            return (pick(article, ":scope > div") ||
                pick(article, "div.text-base") ||
                pick(article, "div.markdown") ||
                article);
        }
        if (isUser) {
            const wrap = pick(article, "div.flex.justify-end") ||
                pick(article, "div.items-end") ||
                article;
            const firstVisibleChild = Array.from(wrap.children).find(isVisible);
            return firstVisibleChild || article;
        }
        return article;
    }
    // 行へスクロールする関数（修正版）
    function scrollListToTurn(turnKey) {
        const sc = document.getElementById("cgpt-list-body");
        if (!sc)
            return;
        // ★追加: turnKey が未指定（null/undefined/空）なら末尾にスクロール
        if (!turnKey) {
            // 最後の行を探す
            const last = sc.querySelector(".row:last-of-type");
            if (last) {
                last.scrollIntoView({ block: "end", inline: "nearest" });
            }
            else {
                // 行がなくてもとりあえずスクロール位置を一番下へ
                sc.scrollTop = sc.scrollHeight;
            }
            return;
        }
        // 指定がある場合はその行へ
        const row = sc.querySelector(`.row[data-idx="${CSS.escape(String(getIndex1FromTurnKey(turnKey)))}"]`);
        // ※ data-idx で探す方が確実ですが、JS版に合わせて data-turn 検索が必要なら適宜調整してください
        // 今回のTS版は .row[data-idx="..."] で統一しているので上記でOKです
        if (!row)
            return;
        // 行をパネル中央付近に出す
        const top = row.offsetTop -
            (sc.clientHeight / 2 - row.clientHeight / 2);
        sc.scrollTo({ top: Math.max(0, top), behavior: "auto" }); // 初回は instant/auto でパッと移動
    }
    // === List Panel 専用（ゆるめ） ===
    function listHeadNodeOf(article) {
        if (!article)
            return null;
        const q = [
            ":scope [data-message-author-role]",
            ":scope div.markdown",
            ":scope div.text-base",
            ":scope .user-message-bubble",
            ":scope article",
            ":scope section",
            ":scope > div",
        ];
        for (const sel of q) {
            const n = article.matches(sel) ? article : article.querySelector(sel);
            if (n && isVisible(n))
                return n;
        }
        return article;
    }
    // 共通トランケータ
    function truncate(s, max) {
        if (!max || !s)
            return s || "";
        return s.length > max ? s.slice(0, max) + "" : s;
    }
    function pickPdfNames(names) {
        return (names || []).filter((n) => /\.pdf(\b|$)/i.test(String(n)));
    }
    // 2) 種別マーク（🖼/🎞/📝）
    function detectAttachmentKinds(root) {
        const el = root || document;
        const kinds = new Set();
        // 実体から判定
        if (el.querySelector("img, picture img"))
            kinds.add("🖼");
        if (el.querySelector('video, source[type^="video/"]'))
            kinds.add("🎞");
        // 名前から拡張子推定
        const names = collectAttachmentNames(el);
        const imgRe = /\.(png|jpe?g|gif|webp|svg)$/i;
        const vidRe = /\.(mp4|mov|webm|mkv|avi)$/i;
        const docRe = /\.(pdf|md|txt|csv|tsv|docx?|xlsx?|pptx?|js|ts|gs|json|htm|html)$/i;
        for (const n of names) {
            const s = String(n);
            if (imgRe.test(s))
                kinds.add("🖼");
            else if (vidRe.test(s))
                kinds.add("🎞");
            else if (docRe.test(s))
                kinds.add("📝");
        }
        if (!kinds.size && names.length)
            kinds.add("📝"); // 名前だけある場合
        return [...kinds];
    }
    // 3) 見出しテキスト（ファイル名優先）
    // 見出しテキスト：ファイル名＋本文を両方出す（両方ある場合は「 | 」で連結）
    function extractSummaryText(head, maxChars) {
        const names = collectAttachmentNames(head);
        let filePart = names.length ? names.join("、 ") : "";
        // 本文候補
        let textPart = "";
        if (head) {
            const aDownload = head.querySelector("a[download]");
            const aLabel = head.querySelector("a[aria-label]");
            const figcap = head.querySelector("figcaption");
            const imgAlt = head.querySelector("img[alt]");
            textPart =
                aDownload?.getAttribute("download")?.trim() ||
                    aLabel?.getAttribute("aria-label")?.trim() ||
                    figcap?.innerText?.trim() ||
                    imgAlt?.getAttribute("alt")?.trim() ||
                    (head.innerText || "").replace(/\s+/g, " ").trim() ||
                    "";
        }
        // file と text の統合
        let picked = "";
        if (filePart && textPart) {
            picked = filePart + " | " + textPart;
        }
        else {
            picked = filePart || textPart;
        }
        if (maxChars && picked.length > maxChars)
            picked = picked.slice(0, maxChars) + "";
        return picked || "（内容なし）";
    }
    // 「…をダウンロード」抽出 → ラベル化（⭳（…））
    function _extractDownloadLabelFromText(el) {
        if (!el)
            return "";
        const raw = (el.innerText || "").replace(/\s+/g, " ").trim();
        // 「この」を任意化し、全角半角の「 をダウンロード 」を吸収
        const m = raw.match(/(?:この)?\s*([^。\n\r]+?)\s*をダウンロード/);
        let name = ((m && m[1]) || "").trim();
        if (!name)
            return "";
        // 先頭の「この」を除去
        name = name.replace(/^この\s*/, "");
        return `⭳（${name}）`;
    }
    // ===== 添付ファイル検出（Article.txt対応） =====
    // 添付UIの実在判定（本文の単語では反応しない）
    function hasAttachmentUI(root) {
        const el = root || document;
        return !!el.querySelector('a[download], a[href^="blob:"], ' +
            ".border.rounded-xl .truncate.font-semibold, " +
            'img, picture img, video, source[type^="video/"]');
    }
    // ★画像生成テキストを後ろに足すための簡易検出
    function getAttachmentTailMessage(el) {
        try {
            // 1) 画像キャプションを表す要素を探す
            const captionEl = el.querySelector(".text-token-text-secondary, .text-sm.text-token-text-secondary, figcaption");
            if (captionEl) {
                const text = captionEl.innerText.trim();
                // 不要な語句を含む場合はスキップ
                if (text.length && !/click|open|download/i.test(text)) {
                    return text;
                }
            }
            // 2) 画像の直近にある補足テキストを探す（DOM変化対応）
            const img = el.querySelector("img, picture img");
            if (img) {
                const next = img
                    .closest("figure")
                    ?.querySelector(".text-token-text-secondary");
                if (next)
                    return next.innerText.trim();
            }
            return "";
        }
        catch (e) {
            SH.logError("getAttachmentTailMessage failed", e);
            return "";
        }
    }
    // 添付ファイル名をまとめて抽出
    // - a[download], a[href] … 通常のリンク
    // - a.cursor-pointer      … ChatGPT の「Download XXX」ボタン
    // - それでも見つからなければ、同じ article 内のテキストから拡張子付き単語を拾う
    // 添付ファイル名の抽出ロジック（リスト表示用）
    // 添付ファイル名を収集
    function collectAttachmentNames(root) {
        const el = root || document;
        const names = new Set();
        el.querySelectorAll("a[download], a[href]").forEach((a) => {
            const dn = (a.getAttribute("download") || "").trim();
            const href = a.getAttribute("href") || "";
            const tail = href.split("/").pop()?.split("?")[0] || "";
            let txt = "";
            const chip = a.querySelector(".text-token-link") ||
                a.querySelector(".truncate.font-semibold");
            if (chip) {
                txt = (chip.textContent || "").trim();
            }
            else {
                txt = (a.textContent || "").trim();
            }
            const picked = dn || (txt && /\S/.test(txt) ? txt : tail);
            if (picked)
                names.add(picked);
        });
        el.querySelectorAll(".border.rounded-xl .truncate.font-semibold").forEach((n) => {
            const tx = (n.textContent || "").trim();
            if (tx)
                names.add(tx);
        });
        return [...names];
    }
    // --- logic.js: buildAttachmentLine 置き換え版 -------------------------------
    // 目的：
    // ・アシスタント：非PDFファイルを添付行に列挙（複数時は ⭳（<本文から抽出したFileラベル>）a b c）
    //                  単数時は ⭳（a）
    // ・ユーザー：PDFは ⭳ ではなく 📄 を添付行に出す（例：📄 Spec.pdf）
    // ・PDFのみのアシスタント配布時は添付行は空（本文側の処理は別途）
    // ・画像/動画の既存処理は維持
    function buildAttachmentLine(root, maxChars) {
        const el = root || document;
        const role = (typeof getTurnRole === "function" ? getTurnRole(el) : "unknown") ||
            "unknown";
        // 1) 既存抽出でファイル名を取得
        const names = Array.from(new Set(collectAttachmentNames(el))).filter(Boolean);
        if (names.length) {
            // ローカル小ヘルパ：PDF抽出
            const pickPdfNames = (arr) => (arr || []).filter((n) => /\.pdf(\b|$)/i.test(String(n)));
            const pdfs = pickPdfNames(names);
            const nonPdf = names.filter((n) => !pdfs.includes(n));
            // ローカル小ヘルパ：アシスタント本文の「File」ラベル抽出
            // - 近傍の chip/attachment っぽい要素から "File" / "ファイル" を拾う
            // - 見つからなければ 'File' をフォールバック
            const extractAssistantFileLabel = () => {
                // 1) よくある data-testid / class 名称を総当りで捜索
                const candidates = el.querySelectorAll('[data-testid*="file"],[data-testid*="attachment"],[class*="file"],[class*="attachment"]');
                for (const c of candidates) {
                    const t = (c.textContent || "").trim();
                    const m = t.match(/\b(File|ファイル)\b/i);
                    if (m)
                        return m[0]; // 本文で使われている表記をそのまま採用
                }
                // 2) <a download> の親周辺（2〜3階層）からテキストノードを捜索
                const a = el.querySelector("a[download], a[href]");
                if (a) {
                    let p = a.parentElement;
                    for (let hop = 0; hop < 3 && p; hop++, p = p.parentElement) {
                        const t = (p.textContent || "").trim();
                        const m = t.match(/\b(File|ファイル)\b/i);
                        if (m)
                            return m[0];
                    }
                }
                return "File";
            };
            // 役割ごとの分岐
            if (role === "user") {
                // ユーザー投稿PDFは ⭳ ではなく 📄 を添付行に出す（複数なら空白区切り）
                if (pdfs.length)
                    return `📄 ${pdfs.join(" ")}`;
                // 非PDFは従来どおり（必要なら別仕様に差し替え）
                if (nonPdf.length > 1)
                    return `⭳（${nonPdf.join(" ")}）`;
                if (nonPdf.length === 1)
                    return `⭳（${nonPdf[0]}）`;
                return "";
            }
            if (role === "assistant") {
                // アシスタント：非PDFのみ添付行に列挙。PDFは本文側（別処理）に任せる
                if (nonPdf.length > 1) {
                    const label = extractAssistantFileLabel();
                    return `⭳（${label}）${nonPdf.join(" ")}`;
                }
                if (nonPdf.length === 1) {
                    return `⭳（${nonPdf[0]}）`;
                }
                // PDFのみ → 添付行は空（本文側で ⭳(pdf) を出す想定／本文が無い場合）
                return "";
            }
            // 未知の役割：無難に非PDFを列挙
            if (nonPdf.length > 1)
                return `⭳（${nonPdf.join(" ")}）`;
            if (nonPdf.length === 1)
                return `⭳（${nonPdf[0]}）`;
            return "";
        }
        // 2) 実体メディア（画像/動画）検出は従来維持
        const hasImg = !!el.querySelector("img, picture img");
        const hasVid = !!el.querySelector('video, source[type^="video/"]');
        if (hasImg || hasVid) {
            const kind = hasImg && hasVid ? T("media") : hasImg ? T("image") : T("video");
            // ここは従来仕様：アシスタントは ⭳、ユーザーはアイコンなど別処理にしたい場合は適宜拡張
            const role = getTurnRole?.(el) || "unknown";
            if (role === "assistant") {
                // アシスタントはダウンロード可として扱う
                return `⭳${kind}`;
            }
            else if (role === "user") {
                // ユーザー投稿は送信アイコンに変更
                if (hasImg)
                    return `🖼 ${T("image")}`;
                if (hasVid)
                    return `🎞 ${T("video")}`;
            }
            return "";
        }
        return "";
    }
    // ★メモリ最適化版（No Clone）: DOMコピーを作らずにテキストを抽出
    function extractBodySnippet(head, maxChars) {
        if (!head)
            return "";
        let result = "";
        // TreeWalkerを使ってテキストノードだけを高速に渡り歩く
        const walker = document.createTreeWalker(head, NodeFilter.SHOW_TEXT, null);
        let node;
        while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            if (!parent)
                continue;
            // 除外したい要素（コードブロック、数式、ボタンなど）
            const tag = parent.tagName;
            if (tag === "CODE" || tag === "MATH" || tag === "svg" || tag === "path")
                continue;
            if (parent.closest("button, [role='button'], .border.rounded-xl"))
                continue;
            let text = node.textContent?.trim() || "";
            if (text) {
                // 必要な文字数だけ取得
                const remaining = maxChars - result.length;
                if (remaining <= 0)
                    break;
                // 連結
                result += (result ? " " : "") + text.slice(0, remaining);
                if (result.length >= maxChars)
                    break;
            }
        }
        return result.trim();
    }
    function articleTop(sc, article) {
        if (!article || !sc)
            return 0;
        const a = article.getBoundingClientRect();
        const c = sc.getBoundingClientRect
            ? sc.getBoundingClientRect()
            : { top: 0 };
        const base = (sc.scrollTop || 0) - (sc.clientTop || 0);
        return base + (a.top - c.top);
    }
    const currentAnchorY = () => SH.computeAnchor(SH.getCFG()).y;
    // ターンキー安定化。DOMに無ければ連番を割り当てて保持。
    const _turnKeyMap = new WeakMap();
    // [追記] 本文からプレビュー用テキストを抽出（改行・空白を整理、長すぎるときはカット）
    function extractPreviewText(node) {
        try {
            const raw = (node?.innerText || node?.textContent || "").trim();
            // 行頭・行末の連続空白を整理し、内部の過剰連続空白も縮める
            const norm = raw
                .replace(/\r/g, "")
                .replace(/[ \t]+\n/g, "\n")
                .replace(/\n{3,}/g, "\n\n")
                .replace(/[ \t]{2,}/g, " ");
            return norm.length > 2000 ? norm.slice(0, 2000) + "" : norm;
        }
        catch {
            return "";
        }
    }
    // 互換の薄ラッパー（他所で使っていても安心・未使用なら残すだけ）
    // --- 互換の薄ラッパー（index方式 → 'turn:n' 文字列）---
    function getTurnKey(article) {
        const rows = ST?.all || NS?.ST?.all || [];
        let target = article;
        // 引数が article 直下の子要素のことがあるので、closest で補正
        if (target && !target.matches?.("article")) {
            target =
                target.closest?.('article,[data-testid^="conversation-turn-"]') ||
                    target;
        }
        let idx = rows.indexOf(target);
        if (idx < 0 && target?.dataset?.turnId) {
            // もし内部で turnId を振っているなら、そのIDで探索（任意）
            idx = rows.findIndex((n) => n?.dataset?.turnId === target.dataset.turnId);
        }
        return idx >= 0 ? "turn:" + (idx + 1) : "";
    }
    // 行のインデックス取得ヘルパ
    function getIndex1FromRow(row) {
        const v = Number(row?.dataset?.idx);
        return Number.isFinite(v) && v > 0 ? v : null;
    }
    function getIndex1FromTurnKey(turnKey) {
        const m = /^turn:(\d+)$/.exec(String(turnKey) || "");
        return m ? Number(m[1]) : null;
    }
    // === PINS: sync cache ===
    let _pinsInited = false;
    function _pinsSetFromCFG(cfg) {
        const arr = cfg && cfg.list && Array.isArray(cfg.list.pins) ? cfg.list.pins : [];
        // return new Set(arr.map(String)); !!!!
        return new Set(arr.map((v) => String(v)));
    }
    function _savePinsSet(set) {
        // ★ Set<string> を明示（new Set(set) が Set<unknown> と推論されるのを防ぐ）
        PINS = new Set(Array.from(set, (v) => String(v)));
        //PINS = new Set(set); !!!!
        const cur = SH.getCFG() || {};
        SH.saveSettingsPatch({
            list: { ...(cur.list || {}), pins: Array.from(PINS) },
        });
    }
    // ★ここを置換：毎回initしない。初回だけCFGを読み込む。
    function ensurePinsCache() {
        if (_pinsInited)
            return;
        PINS = _pinsSetFromCFG(SH.getCFG() || {});
        _pinsInited = true;
    }
    function isPinned(artOrKey) {
        const k = typeof artOrKey === "string" ? artOrKey : getTurnKey(artOrKey);
        return PINS.has(String(k));
    }
    function setPinned(artOrKey, val) {
        const k = typeof artOrKey === "string" ? artOrKey : getTurnKey(artOrKey);
        const s = new Set(PINS);
        const ks = String(k);
        if (val)
            s.add(ks);
        else
            s.delete(ks);
        _savePinsSet(s);
        return !!val;
    }
    function qListBody() {
        return document.getElementById("cgpt-list-body");
    }
    function rowsByTurn(turnKey) {
        const body = qListBody();
        if (!body)
            return [];
        return Array.from(body.querySelectorAll(`.row[data-turn="${CSS.escape(turnKey)}"]`));
    }
    function paintPinRow(row, pinned) {
        const clip = row.querySelector(".cgtn-clip-pin");
        if (!clip)
            return;
        const on = !!pinned;
        clip.setAttribute("aria-pressed", String(on));
        clip.classList.toggle("off", !on);
        clip.classList.toggle("on", on);
        // SVG が入っていない時だけ差し込む（毎回 innerHTML しない）
        if (!clip.querySelector("svg.cgtn-pin-svg")) {
            clip.innerHTML = PIN_ICON_SVG;
        }
    }
    // === 付箋ボタン（🔖）のイベント委譲版 === '25.11.27
    function bindDelegatedClipPinHandler() {
        const body = document.getElementById("cgpt-list-body");
        if (!body)
            return;
        // 二重バインド防止（WeakSet）
        if (_delegatedClipBound.has(body))
            return;
        _delegatedClipBound.add(body);
        body.addEventListener("click", async (ev) => {
            // EventTarget は Element とは限らないので、まず型を絞る
            const t = ev.target;
            if (!(t instanceof Element))
                return;
            const clipEl = t.closest(".cgtn-clip-pin");
            if (!clipEl)
                return; // 付箋ボタン以外は無視
            ev.preventDefault();
            ev.stopPropagation();
            // const rowEl = clipEl.closest(".row"); !!!!
            const rowEl = clipEl.closest(".row");
            if (!rowEl)
                return;
            const idx1 = Number(rowEl.dataset.idx);
            if (!Number.isFinite(idx1) || idx1 < 1)
                return;
            const chatId = SH.getChatId?.();
            if (!chatId)
                return;
            // --- ここからは bindClipPinByIndex と同じロジック ---
            const ret = await SH.togglePinByIndex?.(idx1, chatId);
            let next;
            if (typeof ret === "boolean") {
                next = ret;
            }
            else if (ret && typeof ret === "object") {
                // {on:true}/{pinned:true} などにも対応
                next =
                    "on" in ret ? !!ret.on : "pinned" in ret ? !!ret.pinned : undefined;
            }
            // フォールバック：ストレージ反映後の実状態を読む
            if (typeof next === "undefined") {
                next = !!(await SH.isPinnedByIndex?.(idx1, chatId));
            }
            // そのターンに属する全行を ON/OFF（添付行＋本文行） '25.12.3 改
            try {
                const listBody = document.getElementById("cgpt-list-body");
                const sameIdxRows = listBody
                    ? Array.from(listBody.querySelectorAll(`.row[data-idx="${idx1}"]`))
                    : [];
                const targets = sameIdxRows.length ? sameIdxRows : [rowEl];
                targets.forEach((r) => {
                    const rr = r; // !!!!
                    if (next)
                        rr.dataset.pin = "1";
                    else
                        rr.removeAttribute("data-pin");
                    paintPinRow(rr, next); // 添付行/本文行まとめて更新
                });
            }
            catch (e) {
                SH.logError("[bindDelegatedClipPinHandler] sync data-pin failed", e);
            }
            // 付箋数とフッターの同期もここで安全側更新
            try {
                const SHX = window.CGTN_SHARED || {};
                let pinsArr = SHX.getPinsForChat?.(chatId);
                if (!pinsArr)
                    pinsArr = SHX.getCFG?.()?.pinsByChat?.[chatId]?.pins;
                const pinsCount = Array.isArray(pinsArr)
                    ? pinsArr.filter(Boolean).length
                    : pinsArr
                        ? Object.values(pinsArr).filter(Boolean).length
                        : 0;
                NS.pinsCount = pinsCount;
                NS.updateListFooterInfo?.();
                NS.updatePinOnlyBadge?.();
            }
            catch { }
        }, { passive: false });
    }
    // ★ legacy: 以前の行ごとバインド方式（現在は未使用／参考用）
    // 個別の🔖クリック処理
    function bindClipPinByIndex(clipEl, rowEl, chatId) {
        clipEl.addEventListener("click", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const idx1 = Number(rowEl?.dataset?.idx);
            if (!Number.isFinite(idx1) || idx1 < 1)
                return;
            // Promise の可能性があるので await。戻り形式の差異にも耐性を持たせる
            // togglePinByIndex() は Promise を返す（await 必須）
            // 返り値が boolean 以外でも動くように型ガード
            // 付箋データ更新
            const ret = await SH.togglePinByIndex?.(idx1, chatId);
            let next;
            if (typeof ret === "boolean") {
                next = ret;
            }
            else if (ret && typeof ret === "object") {
                // {on:true}/{pinned:true} などにも対応
                next =
                    "on" in ret ? !!ret.on : "pinned" in ret ? !!ret.pinned : undefined;
            }
            // フォールバック：ストレージ反映後の実状態を読む
            if (typeof next === "undefined") {
                next = !!(await SH.isPinnedByIndex?.(idx1, chatId));
            }
            // data-pin を個別クリック時にも同期 '25.11.29
            if (next)
                rowEl.dataset.pin = "1";
            else
                rowEl.removeAttribute("data-pin");
            // pinOnly モード中なら、表示も更新
            try {
                const cfg = SH.getCFG?.() || {};
                if (cfg.list?.pinOnly) {
                    NS.updatePinOnlyView?.();
                }
            }
            catch { }
            // ボタン色などを更新
            paintPinRow(rowEl, next);
            // バッジ・フッターの再計算
            try {
                const SHX = window.CGTN_SHARED || {};
                let pinsArr = SHX.getPinsForChat?.(chatId);
                if (!pinsArr)
                    pinsArr = SHX.getCFG?.()?.pinsByChat?.[chatId]?.pins;
                const pinsCount = Array.isArray(pinsArr)
                    ? pinsArr.filter(Boolean).length
                    : pinsArr
                        ? Object.values(pinsArr).filter(Boolean).length
                        : 0;
                NS.pinsCount = pinsCount;
                NS.updateListFooterInfo?.();
            }
            catch { }
        }, { passive: false });
    }
    // 相方行のUI更新（強制値を優先）
    function refreshPinUIForTurn(turnKey, forcedState) {
        const state = typeof forcedState === "boolean" ? forcedState : isPinnedByKey(turnKey);
        rowsByTurn(turnKey).forEach((row) => {
            const clipEl = row.querySelector(".cgtn-clip-pin");
            if (clipEl) {
                clipEl.setAttribute("aria-pressed", String(!!state));
                clipEl.classList.toggle("off", !state); // ←★ 同期
            }
        });
    }
    // 現在ロールに対応する「ターン番号 idx1 の配列」を返すだけ
    // '25.12.3 変更
    function collectTargetsForBulk(role, ST) {
        let rows;
        switch (role) {
            case "user":
                rows = ST.user || [];
                break;
            case "assistant":
                rows = ST.assistant || [];
                break;
            default:
                rows = ST.all || [];
                break; // 'all'
        }
        const targets = [];
        const seen = new Set(); // 念のため重複防止
        for (const article of rows) {
            const key = NS.getTurnKey(article);
            const idx1 = getIndex1FromTurnKey(key);
            if (!idx1 || seen.has(idx1))
                continue;
            seen.add(idx1);
            targets.push(idx1);
        }
        return targets;
    }
    // --- 付箋一括 ON / OFF ---
    // 1) ST.* に基づいて pinsArr を更新
    // 2) DOM(.row) 側の data-pin / 🔖 を同期
    async function bulkSetPins(mode, opts) {
        const SH = window.CGTN_SHARED || {};
        const ST = NS.ST || {};
        const cid = SH.getChatId?.();
        if (!cid)
            return;
        // true / 'on' → ALL ON, false / 'off' → ALL OFF
        //    const doPinOn = mode === "on" || mode === true;
        // ★修正: ここで明確に 1 か 0 に変換しておく 2026.02.07
        // true / 'on' → 1,  false / 'off' → 0
        const val = mode === "on" || mode === true ? 1 : 0;
        const doPinOn = !!val; // DOM操作用には boolean も持っておく
        // --- 現在ロール（全体 / ユーザー / アシスタント） ---
        let role = NS.viewRole || "all";
        try {
            const filterBox = document.getElementById("cgpt-list-filter");
            const checked = filterBox?.querySelector('input[name="cgtn-lv"]:checked');
            if (checked) {
                if (checked.id === "lv-user")
                    role = "user";
                else if (checked.id === "lv-assist")
                    role = "assistant";
                else
                    role = "all";
            }
        }
        catch (_) { }
        // --- 付箋のみ表示フラグ ---
        const cfg = SH.getCFG?.() || {};
        // '25.12.3 変更
        const targets = collectTargetsForBulk(role, ST);
        if (!targets.length) {
            return;
        }
        // --- pinsArr をストレージから取得して書き換え ---
        let pinsArr = await SH.getPinsArrAsync?.(cid);
        if (!Array.isArray(pinsArr))
            pinsArr = [];
        // ★ 付箋データが 1件以上ある時のみ confirm 対象
        const hasAnyPin = pinsArr.some(Boolean);
        const maxIdx = Math.max(...targets);
        if (pinsArr.length < maxIdx) {
            const oldLen = pinsArr.length;
            pinsArr.length = maxIdx;
            //      pinsArr.fill(false, oldLen);
            // ★修正: false ではなく 0 で埋める 2026.02.07
            pinsArr.fill(0, oldLen);
        }
        // ★ 変更が発生するか（no-op 判定）
        const willChange = targets.some((idx1) => {
            const idx0 = idx1 - 1;
            const cur = !!pinsArr[idx0];
            return doPinOn ? !cur : cur;
        });
        // 変更がないなら何もしない（保存・DOM更新も無し）
        if (!willChange) {
            SH.addLog?.(`[bulkSetPins] no-op (role=${role}, mode=${doPinOn ? "on" : "off"})`, "DEBUG");
            return;
        }
        // ★ confirm（要求：pinsが1件以上ある時だけ）
        if (opts?.confirm && hasAnyPin) {
            const I18N = window.CGTN_I18N || {};
            const msg = doPinOn
                ? I18N.t?.("confirmAllPinsOn") || "Enable all pins?"
                : I18N.t?.("confirmAllPinsOff") || "Disable all pins?";
            const ok = window.confirm(msg);
            SH.addLog?.(`bulkPins confirm ${doPinOn ? "ON" : "OFF"} -> ${ok ? "OK" : "Cancel"}`);
            if (!ok)
                return;
        }
        for (const idx1 of targets) {
            const idx0 = idx1 - 1;
            pinsArr[idx0] = doPinOn;
        }
        const pinsCount = pinsArr.filter(Boolean).length;
        try {
            const ret = await SH.savePinsArrAsync?.(pinsArr, cid);
            if (!ret?.ok) {
                SH.logError("[bulkSetPins] savePinsArrAsync failed", ret);
            }
        }
        catch (e) {
            SH.logError("[bulkSetPins] savePinsArrAsync error", e);
        }
        try {
            const body = qListBody();
            if (body) {
                const rows = body.querySelectorAll(".row[data-idx]");
                const targetSet = new Set(targets.map(String)); // "1","2",...
                for (const rowEl of rows) {
                    // Element -> HTMLElement に型を絞る（dataset対策）
                    if (!(rowEl instanceof HTMLElement))
                        continue;
                    const idx1 = rowEl.dataset.idx;
                    if (!idx1 || !targetSet.has(idx1))
                        continue; // 対象外のターンは触らない
                    // role=全体の時は全行、role=user/asst の時は
                    // data-role で既に ST 側で絞り込み済みなので、そのまま適用
                    if (doPinOn)
                        rowEl.dataset.pin = "1";
                    else
                        rowEl.removeAttribute("data-pin");
                    try {
                        paintPinRow(rowEl, doPinOn);
                    }
                    catch (_) { }
                }
            }
        }
        catch (e) {
            SH.logError("[bulkSetPins] sync DOM failed", e);
        }
        // --- バッジ・フッター更新 ---
        try {
            // ★修正: 最新のピン配列から、有効なピン(valid)と孤児(orphan)を正確に数え直す
            const totalTurns = NS.ST?.all?.length || 0;
            let valid = 0;
            let orphan = 0;
            for (let i = 0; i < pinsArr.length; i++) {
                if (pinsArr[i]) {
                    if (i < totalTurns)
                        valid++;
                    else
                        orphan++;
                }
            }
            NS.validPinsCount = valid;
            NS.orphanPinsCount = orphan;
            NS.pinsCount = valid + orphan;
            // ★修正: 再計算した数字を渡してバッジを即時更新
            NS.updatePinOnlyBadge?.(valid, orphan);
        }
        catch (_) { }
        try {
            NS.updateListFooterInfo?.();
        }
        catch (_) { }
        // ★ pinOnly の時だけ、DOMをその場でフィルタして見た目を合わせる（renderListしない）
        try {
            const cfgNow = SH.getCFG?.() || {};
            const pinOnly = !!cfgNow?.list?.pinOnly;
            if (pinOnly &&
                typeof window.CGTN_SHARED?.isListOpen === "function" &&
                window.CGTN_SHARED.isListOpen()) {
                const body = qListBody(); // ※Mikiさんの環境のリスト取得関数に合わせてください
                if (body) {
                    const rows = body.querySelectorAll(".row[data-idx]");
                    let visibleCount = 0; // 見える行数をカウントする
                    rows.forEach((r) => {
                        if (!(r instanceof HTMLElement))
                            return;
                        const pinned = r.dataset.pin === "1";
                        // pinOnly なら pinned だけ表示
                        r.style.display = pinned ? "" : "none";
                        if (pinned)
                            visibleCount++;
                    });
                    // ★Gemの追加：もし全部OFFにして見える行が「0」になったら、
                    // 「付箋がありません」のメッセージを出すために、そこだけ例外的にrenderListを呼ぶ！
                    if (visibleCount === 0) {
                        NS.renderList?.(true);
                    }
                }
            }
        }
        catch (e) {
            SH.logError("[bulkSetPins] quick filter failed", e);
        }
    }
    NS.bulkSetPins = bulkSetPins;
    const NAV_SNAP = { smoothMs: 220, idleFrames: 2, maxTries: 5, epsPx: 0.75 };
    const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
    async function waitIdleFrames(n) {
        while (n-- > 0)
            await nextFrame();
    }
    async function scrollToHead(article) {
        if (!article || NS._navBusy)
            return;
        NS._navBusy = true;
        try {
            const sc = getTrueScroller();
            const anchor = currentAnchorY();
            const desired = articleTop(sc, article) - anchor;
            const maxScr = Math.max(0, sc.scrollHeight - sc.clientHeight);
            const clamp = Math.min(maxScr, Math.max(0, desired));
            lockFor(SH.getCFG().lockMs);
            sc.scrollTo({ top: Math.round(clamp), behavior: "smooth" });
            // レイアウト揺れが落ち着くのを待つ
            await new Promise((r) => setTimeout(r, NAV_SNAP.smoothMs));
            let tries = NAV_SNAP.maxTries;
            while (tries-- > 0) {
                await waitIdleFrames(NAV_SNAP.idleFrames);
                const anchor2 = currentAnchorY();
                const want = Math.min(maxScr, Math.max(0, articleTop(sc, article) - anchor2));
                const err = Math.abs((sc.scrollTop || 0) - want);
                if (err <= NAV_SNAP.epsPx)
                    break;
                sc.scrollTo({ top: Math.round(want), behavior: "auto" }); // 最終スナップ
            }
            NS._currentTurnKey = getTurnKey(article);
        }
        finally {
            NS._navBusy = false;
        }
    }
    // --- scroll core ---
    let _lockUntil = 0;
    const isLocked = () => performance.now() < _lockUntil;
    function lockFor(ms) {
        _lockUntil = performance.now() + (Number(ms) || 0);
    }
    // ターン検出<article>
    function pickAllTurns() {
        const seen = new Set();
        // まずは TURN_SEL を素直に拾う（<article> 前提）
        let list = Array.from(document.querySelectorAll(TURN_SEL));
        // フォールバック：roleノードから article を辿る
        if (!list.length) {
            const nodes = Array.from(document.querySelectorAll("[data-message-author-role]"));
            list = nodes
                .map((n) => n.closest("article") || n)
                .filter((el) => {
                if (!el)
                    return false;
                if (seen.has(el))
                    return false;
                seen.add(el);
                return true;
            });
        }
        // ★追加：DIVが紛れていたら、上位にある<article>を辿る（戻りも HTMLElement に寄せる）
        list = list
            .map((el) => {
            const art = el.tagName === "ARTICLE"
                ? el
                : el.closest("article") || el;
            return art;
        })
            .filter((el) => el instanceof HTMLElement);
        // 表示中だけ返す
        const visible = list.filter((a) => {
            try {
                const r = a.getBoundingClientRect();
                const disp = getComputedStyle(a).display;
                return r.height > 10 && disp !== "none";
            }
            catch {
                return false;
            }
        });
        return visible;
    }
    // 役割取得: data-turn を最優先。なければ従来の role 属性でフォールバック
    function getTurnRole(el) {
        const hint = el?.dataset?.turn;
        if (hint === "user" || hint === "assistant")
            return hint;
        if (el.matches?.('[data-message-author-role="user"], div [data-message-author-role="user"]'))
            return "user";
        if (el.matches?.('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]'))
            return "assistant";
        return ""; // 不明
    }
    function sortByY(list) {
        const sc = getTrueScroller();
        try {
            return list
                .map((el) => ({ el, y: articleTop(sc, el) }))
                .sort((a, b) => a.y - b.y)
                .map((x) => x.el);
        }
        catch {
            return list;
        }
    }
    function isRealTurn(article) {
        // === 軽い堅牢化 ===
        // ChatGPT の各発話は <article> 要素単位。
        // よって、記事ノードならそのまま「実ターン」とみなす。
        // （過剰フィルタで落とさないための早期リターン）
        if (article?.tagName === "ARTICLE")
            return true;
        const head = headNodeOf(article);
        if (!head)
            return false;
        const r = head.getBoundingClientRect();
        if (r.height < 8 || !isVisible(head))
            return false;
        const txt = (head.textContent || head.innerText || "").trim();
        const hasText = txt.length > 0;
        const hasMedia = !!article.querySelector("img,video,canvas,figure," +
            '[data-testid*="download"],[data-testid*="attachment"],[data-testid*="file"],' +
            'a[download],a[href^="blob:"]');
        const busy = head.getAttribute?.("aria-busy") === "true";
        return (hasText || hasMedia) && !busy;
    }
    // --- wait until turns ready ---
    async function ensureTurnsReady({ maxMs = 15000, idle = 300, tick = 120, } = {}) {
        const sc = getTrueScroller?.();
        let prevN = -1, prevH = -1, stable = 0, t0 = performance.now();
        let seenAny = false; // ★最初の1件が出るまで「安定」を始めない
        while (performance.now() - t0 < maxMs) {
            await new Promise((r) => setTimeout(r, tick));
            const arts = pickAllTurns?.().filter(isRealTurn) || [];
            const n = arts.length;
            const h = sc?.scrollHeight || 0;
            if (n > 0)
                seenAny = true;
            if (seenAny && n === prevN && Math.abs(h - prevH) <= 1) {
                stable += tick;
                if (stable >= idle)
                    break;
            }
            else {
                stable = 0;
                prevN = n;
                prevH = h;
            }
        }
    }
    // ST: 現在ページ内のターン情報
    const ST = { all: [], user: [], assistant: [], page: 1 };
    let _rebuildTicket = 0;
    let _rebuildCid = null;
    // ★修正: エラーハンドリングとリトライ機能を追加した rebuild
    NS.rebuild = function (cidFromMsg) {
        try {
            // ===== 既存の処理 =====
            const my = ++_rebuildTicket;
            const startCid = cidFromMsg || SH.getChatId?.();
            _rebuildCid = startCid || _rebuildCid;
            // ▼▼▼ 追加: 毎回必ずスクローラーの記憶を消し、最新のDOMから探し直す！
            NS._scroller = null;
            getTrueScroller(); // ←これだけにする！2026.02.20
            // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
            // 型チェックを緩和するために : any をつけます
            const nextST = { all: [], user: [], assistant: [], page: 1 };
            // 1. 取得部分を安全にガード
            let allRaw = [];
            try {
                allRaw = pickAllTurns().filter(isRealTurn);
            }
            catch (e) {
                SH.logError("pickAllTurns temporary error", e);
            }
            nextST.all = sortByY(allRaw);
            // 0件の場合はクリア処理
            if (nextST.all.length === 0) {
                NS.clearListPanelUI?.();
            }
            else {
                const roleOf = (a) => getTurnRole(a);
                nextST.user = nextST.all.filter((a) => roleOf(a) === "user");
                nextST.assistant = nextST.all.filter((a) => roleOf(a) === "assistant");
                try {
                    nextST._userSet = new Set(nextST.user);
                    nextST._asstSet = new Set(nextST.assistant);
                }
                catch { }
            }
            if (my !== _rebuildTicket)
                return;
            const curCid = SH.getChatId?.();
            if (startCid && curCid && startCid !== curCid)
                return;
            // コミット
            ST.all = nextST.all;
            ST.user = nextST.user;
            ST.assistant = nextST.assistant;
            ST._userSet = nextST._userSet ?? new Set(ST.user);
            ST._asstSet = nextST._asstSet ?? new Set(ST.assistant);
            NS.ST = ST;
            bindScrollSpy();
            NS.updateStatus(); // ここまで来れば Loading... が消えて数字になる
            // ★追加：DOM再構築が終わったら、裏でバッジを最新化する！2026.02.23
            NS.syncPinCounts?.();
        }
        catch (err) {
            // ★ ここが重要！ エラーが起きても死なずにリトライ予約をする
            SH.logError("[rebuild] crashed, retrying...", err);
            setTimeout(() => {
                // まだデータが取れていなければ再挑戦
                if (!NS.ST.all.length) {
                    NS.rebuild?.(); // 自分をもう一度呼ぶ
                    // 必要なら renderList も呼ぶ
                    // NS.renderList?.(true);
                }
            }, 1000); // 1秒後に再挑戦
        }
    };
    //ダウンロード文抽出ヘルパ（本文・画像・不明の3分岐）
    //これで PDF 例は ⭳（ChatGPT_Turn_Navigator_Promo.pdf）
    //画像系は ⭳（画像）
    //アシスタント発話で未検出なら （不明）
    function getDownloadLabelForTurn(el) {
        try {
            const role = el?.dataset?.turn ||
                (el.matches?.('[data-message-author-role="assistant"]')
                    ? "assistant"
                    : el.matches?.('[data-message-author-role="user"]')
                        ? "user"
                        : "unknown");
            // headNodeOf() で主要ノードを取得し、そのテキストをtrimして本文扱いとする。
            const head = headNodeOf(el);
            const text = (head?.textContent || head?.innerText || "").trim();
            // 「〇〇をダウンロード」 or 「この〇〇をダウンロード」の検出
            const m = text.match(/(.+?)をダウンロード/);
            if (m) {
                let name = (m[1] || "").trim();
                name = name.replace(/^この/, "").trim(); // 「この」をトリミング
                if (/画像/.test(name))
                    name = T("image");
                return `⭳（${name || T("unknown")}）`;
            }
            // アシスタントターンでダウンロードが無い場合
            if (role === "assistant")
                return T("unknown");
            // ユーザー/不明は空ラベル
            return "";
        }
        catch {
            return "";
        }
    }
    NS.clearListPanelUI = function clearListPanelUI() {
        // ★追加1: スクロール監視を即座に停止 (チラつきの主犯を止める)
        if (NS._scrollSpy) {
            try {
                NS._scrollSpy.el.removeEventListener("scroll", NS._scrollSpy.fn);
            }
            catch { }
            NS._scrollSpy = null;
        }
        if (NS._spyRaf) {
            cancelAnimationFrame(NS._spyRaf);
            NS._spyRaf = null;
        }
        try {
            const body = document.getElementById("cgpt-list-body");
            if (body)
                body.innerHTML = "";
            const el = document.getElementById("cgpt-chat-title");
            if (el) {
                el.textContent = "";
                el.title = "";
            }
            // バッジの場所を変更 '25.11.28
            const host = document.getElementById("lv-lab-pin");
            if (host) {
                host.removeAttribute("aria-pressed");
                host.classList.remove("active");
            }
            // フッターは DOM を壊さず「空状態」にする
            try {
                NS.clearListFooterInfo?.();
            }
            catch { }
        }
        catch (e) {
            SH.logError("[clearListPanelUI] failed", e);
        }
        // 状態も空に
        try {
            const ST = NS.ST || (NS.ST = {});
            ST.all = [];
            ST.user = [];
            ST.assistant = [];
            // ★追加：チャット切り替え時に現在地記憶もリセットする
            NS._lastCalculatedTurn = 1;
            // ★追加：ピンカウントのキャッシュも確実に 0 にクリア！
            NS.validPinsCount = 0;
            // ★追加：ピンカウントのキャッシュも確実に 0 にクリア！
            NS.validPinsCount = 0;
            NS.orphanPinsCount = 0;
            NS.pinsCount = 0;
            // 付箋バッジ/フッターの表示状態も同期
            try {
                NS.updatePinOnlyBadge?.();
            }
            catch { }
        }
        catch { }
        // ★追加2: ステータスを更新 (データが空なので "Loading..." になる)
        if (typeof NS.updateStatus === "function") {
            NS.updateStatus();
        }
        else {
            window.CGTN_UI?.updateStatusDisplay?.("Loading...");
        }
    };
    NS.updateListChatTitle = function updateListChatTitle() {
        const el = document.getElementById("cgpt-chat-title");
        if (!el)
            return;
        if ((NS.ST?.all?.length ?? 0) === 0) {
            el.textContent = "";
            el.title = "";
            return;
        }
        // ★ ターンゼロ時は強制リセット
        const turns = window.CGTN_LOGIC?.ST?.all?.length ?? 0;
        if (turns === 0) {
            el.textContent = "";
            el.title = "";
            return;
        }
        const cfg = SH.getCFG?.() || {};
        const cid = SH.getChatId?.();
        const t1 = SH.getChatTitle?.() || ""; // document.title（最優先）
        const t2 = cfg?.chatIndex?.ids?.[cid]?.title || "";
        const t3 = cfg?.pinsByChat?.[cid]?.title || "";
        const title = t1 || t2 || t3 || "(No Title)";
        el.textContent = title;
        el.title = title;
    };
    // --- list panel ---
    let listBox = null;
    function ensureListBox() {
        if (listBox && document.body.contains(listBox))
            return listBox;
        listBox = document.createElement("div");
        listBox.id = "cgpt-list-panel";
        listBox.innerHTML = `
      <div id="cgpt-list-head">
        <button id="cgpt-list-collapse" aria-expanded="true">▴</button>
        <div id="cgpt-chat-title"></div>
        <button id="cgpt-list-close" class="cgtn-dock-close" aria-label="Close">✕</button>

      </div>

      <!-- ★ 表示切替（CSSだけで絞り込み） -->
      <div id="cgpt-list-filter" role="group" aria-label="Filter">
        <label id="lv-lab-all"><input type="radio" name="cgtn-lv" id="lv-all" checked><span class="cgpt-filter-pill"></span></label>
        <label id="lv-lab-user"><input type="radio" name="cgtn-lv" id="lv-user"><span class="cgpt-filter-pill"></span></label>
        <label id="lv-lab-asst"><input type="radio" name="cgtn-lv" id="lv-assist"><span class="cgpt-filter-pill"></span></label>
        <label id="lv-lab-pin" class="cgtn-badgehost">
          <input type="radio" name="cgtn-lv" id="lv-pin"><span class="cgpt-filter-pill"></span><span class="cgtn-badge"></span>
        </label>

      </div>
      <div id="cgpt-list-body"></div>
      <div id="cgpt-list-foot">
        <!-- ★ 最新にする -->
        <button id="cgpt-list-refresh" class="cgtn-mini-btn" type="button"
                title="${T("list.refresh")}" aria-label="${T("list.refresh")}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <!-- 円弧：320°、中央ぴったり -->
            <circle
              cx="12" cy="12" r="7.5"
              fill="none"
              stroke="#111827"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-dasharray="40 7"
              transform="rotate(-50 12 12)"
            />

            <!-- 先端の矢印（三角形） -->
            <g transform="translate(-1,1)">
            <path
              d="M16.5 3.6 L21.2 5.4 L17.4 9.4 Z"
              fill="#111827"
            />
            </g>

          </svg>
        </button>

        <!-- ★ 付箋 全ON -->
        <button id="cgpt-pin-all-on" class="cgtn-mini-btn" type="button"
                title="${T("list.pinAllOn")}" aria-label="${T("list.pinAllOn")}">
          <svg class="cgtn-all-pin-on" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <g transform="translate(0,3)">
            <!-- ALL の文字：真ん中寄せ、太め -->
            <text x="16" y="11"
                  text-anchor="middle"
                  font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
                  font-size="20" font-weight="700">
              ALL
            </text>

            <!-- ブックマーク本体（ちょっと縦長） -->
            <path d="M9 13.5C9 12.6716 9.6716 12 10.5 12H21.5C22.3284 12 23 12.6716 23 13.5V29L16 21.5L9 29Z"
                  fill="#ff3b30"
                  stroke="#111827"
                  stroke-width="1.4"
                  stroke-linejoin="round"/>
            </g>
          </svg>
        </button>

        <!-- ★ 付箋 全OFF -->
        <button id="cgpt-pin-all-off" class="cgtn-mini-btn" type="button"
                title="${T("list.pinAllOff")}" aria-label="${T("list.pinAllOff")}">
          <svg class="cgtn-all-pin-off" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <g transform="translate(0,3)">
            <text x="16" y="11"
                  text-anchor="middle"
                  font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
                  font-size="20" font-weight="700">
              ALL
            </text>

            <path d="M9 13.5C9 12.6716 9.6716 12 10.5 12H21.5C22.3284 12 23 12.6716 23 13.5V29L16 21.5L9 29Z"
                  fill="none"
                  stroke="#111827"
                  stroke-width="1.4"
                  stroke-linejoin="round"/>
          </g>
          </svg>
        </button>

        <div id="cgpt-list-foot-info"
             style="margin-left:auto;opacity:.8;font-size:12px;padding:4px 8px;"></div>
      </div>
    `;
        document.body.appendChild(listBox);
        // リスト幅 文字数から算出
        NS.applyPanelWidthByChars(SH.getCFG()?.list?.maxChars || 52);
        try {
            NS.applyListFilterLang();
        }
        catch { }
        // ツールチップ用titleを登録 '25.11.23
        if (!listBox._tipsBound) {
            window.CGTN_SHARED?.applyTooltips?.({
                "#cgpt-list-collapse": "list.collapse",
                "#cgpt-pin-filter": "list.pinonly",
                "#cgpt-list-grip": "nav.drag",
                "#cgpt-list-refresh": "list.refresh",
                "#cgpt-pin-all-on": "list.pinAllOn",
                "#cgpt-pin-all-off": "list.pinAllOff",
                "#lv-lab-all": "listFilter.all",
                "#lv-lab-user": "listFilter.user",
                "#lv-lab-asst": "listFilter.asst",
                "#lv-lab-pin": "listFilter.pin",
            }, listBox);
            listBox._tipsBound = true; // ★重複登録防止
        }
        // ↻ クリックで再描画（重複バインド防止）
        const refreshBtn = listBox.querySelector("#cgpt-list-refresh");
        if (refreshBtn && !refreshBtn._cgtnBound) {
            refreshBtn._cgtnBound = true;
            refreshBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    NS.renderList?.(true);
                }
                catch { }
            });
        }
        // =======================================================
        // ★ 追加: リストパネルの「×閉じる」ボタン処理
        // =======================================================
        const closeBtn = listBox.querySelector("#cgpt-list-close");
        if (closeBtn && !closeBtn._cgtnBound) {
            closeBtn._cgtnBound = true;
            closeBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                // ナビパネル側の一覧トグル（裏に隠れているチェックボックス）を取得
                const chk = document.getElementById("cgpt-list-toggle");
                if (chk instanceof HTMLInputElement && chk.checked) {
                    // 1. チェックを外す
                    chk.checked = false;
                    // 2. 「ユーザーがマウスクリックでOFFにした」のと同じ変更イベントを人工的に発火させる
                    // これにより、events.ts が反応してパネルを閉じ、ボタンの色を戻し、設定を保存してくれます！
                    chk.dispatchEvent(new Event("change", { bubbles: true }));
                }
            });
        }
        // ★ 全ON/全OFF ボタン（バルク付箋切替）'25.11.23
        (function bindBulkPinButtons() {
            const onBtn = listBox.querySelector("#cgpt-pin-all-on");
            const offBtn = listBox.querySelector("#cgpt-pin-all-off");
            if (!onBtn && !offBtn)
                return;
            if (listBox._bulkPinsBound)
                return;
            listBox._bulkPinsBound = true;
            if (onBtn) {
                onBtn.addEventListener("click", (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    try {
                        NS.bulkSetPins?.(true, { confirm: true });
                    }
                    catch (e) {
                        SH.logError("[bulkPins on]", e);
                    }
                });
            }
            if (offBtn) {
                offBtn.addEventListener("click", (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    try {
                        NS.bulkSetPins?.(false, { confirm: true });
                    }
                    catch (e) {
                        SH.logError("[bulkPins off]", e);
                    }
                });
            }
            try {
                NS.updateBulkPinButtonsState?.();
            }
            catch { }
        })();
        // 行番号（インデックス）をCSSカウンタで表示
        (function ensureIndexCounterStyle() {
            try {
                if (document.getElementById("cgtn-idx-style"))
                    return;
                const st = document.createElement("style");
                st.id = "cgtn-idx-style";
                // 旧: align-items:flex-start だと本文と微ズレが出ることがある
                st.textContent = `
          /* --- 絞り込み（CSSのみ）--- */
          #cgpt-list-filter:has(#lv-all:checked)    + #cgpt-list-body .row{ display:flex; }
          #cgpt-list-filter:has(#lv-user:checked)   + #cgpt-list-body .row:not([data-role="user"])      { display:none; }
          #cgpt-list-filter:has(#lv-assist:checked) + #cgpt-list-body .row:not([data-role="assistant"]) { display:none; }
          #cgpt-list-filter:has(#lv-pin:checked)    + #cgpt-list-body .row:not([data-pin="1"]) { display:none; }
          /*#cgpt-list-body { counter-reset: cgtn_turn; } '25.12.12*/
          /* 付箋のみ表示（ピン無し行を非表示） '25.11.28
           パネルに .pinonly が付いている間だけ、
           data-pin="1" 以外の .row が全部 display:none になる。*/
          #cgpt-list-panel.pinonly #cgpt-list-body .row:not([data-pin="1"]) {
            display:none;
          }
          /* ▼▼▼ 追加：ピンタブ選択中で、かつピン付き行が1件も無い時だけ Emptyメッセージを出す ▼▼▼ */
          #cgpt-list-filter:has(#lv-pin:checked) + #cgpt-list-body:not(:has(.row[data-pin="1"])) .cgtn-empty {
            display: block !important;
          }            

          `;
                /* ここまで */
                document.head.appendChild(st);
            }
            catch (_) { }
        })();
        /* ensureIndexCounterStyle ここまで */
        // -------------------------------------------------------
        // ★★★ 修正版コード（ここから） ★★★
        // イベント委譲: 行クリックとピン留めをここで一括管理
        (function bindListEvents(panel) {
            const body = panel.querySelector("#cgpt-list-body");
            // 型エラー回避のため any キャストでチェック
            if (!body || body._cgtnClickBound)
                return;
            body._cgtnClickBound = true;
            body.addEventListener("click", (e) => {
                // ★修正1: target を HTMLElement として扱う
                const target = e.target;
                if (!(target instanceof Element))
                    return;
                // --- 1. ピンボタンのクリック処理 ---
                const pinBtn = target.closest(".cgtn-clip-pin");
                if (pinBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    // ★修正2: row も HTMLElement として扱う
                    const row = pinBtn.closest(".row");
                    if (!row)
                        return;
                    const idx = Number(row.dataset.idx); // 1始まり
                    if (!idx)
                        return;
                    const turn = NS.ST?.all?.[idx - 1];
                    // ★修正3: NS.togglePin を使用 (名前が見つからないエラー対策)
                    if (turn && typeof NS.togglePin === "function") {
                        NS.togglePin(turn);
                    }
                    return;
                }
                // --- 2. 行クリック（ジャンプ）処理 ---
                if (target.closest("button, a, input, label"))
                    return;
                const row = target.closest(".row");
                if (row) {
                    const idx = Number(row.dataset.idx);
                    if (idx) {
                        const turn = NS.ST?.all?.[idx - 1];
                        // ★修正4: NS.scrollToHead を使用
                        if (turn && typeof NS.scrollToHead === "function") {
                            NS.scrollToHead(turn);
                        }
                    }
                }
            });
        })(listBox); // ← ここで ensureListBox 内の変数 listBox を渡しています
        // ★★★ 修正版コード（ここまで） ★★★
        // -------------------------------------------------------
        // === リスト側：モダリティ + パーキングでフォーカス完全排除 ===
        (function enforceNoFocusList(panel) {
            if (!panel || panel._cgtnFocusGuard)
                return;
            panel._cgtnFocusGuard = true;
            let lastWasKeyboard = false;
            window.addEventListener("keydown", () => {
                lastWasKeyboard = true;
            }, { capture: true });
            window.addEventListener("pointerdown", () => {
                lastWasKeyboard = false;
            }, { capture: true });
            let park = document.getElementById("cgtn-focus-park");
            if (!(park instanceof HTMLButtonElement)) {
                const btn = document.createElement("button");
                btn.id = "cgtn-focus-park";
                btn.type = "button";
                btn.tabIndex = -1;
                btn.style.cssText =
                    "position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none;";
                document.body.appendChild(btn);
                park = btn;
            }
            // ここ以降、park は HTMLButtonElement として扱える
            const INTERACTIVE = "button, label, input[type=checkbox]";
            panel.addEventListener("focusin", (e) => {
                const el = e.target && e.target.closest(INTERACTIVE);
                if (el && !lastWasKeyboard) {
                    try {
                        el.blur();
                    }
                    catch { }
                    try {
                        park.focus({ preventScroll: true });
                    }
                    catch { }
                }
            }, true);
            panel.addEventListener("mouseup", () => {
                try {
                    if (document.activeElement &&
                        panel.contains(document.activeElement)) {
                        park.focus({ preventScroll: true });
                    }
                }
                catch { }
            }, { capture: true });
        })(listBox);
        // enforceNoFocusList ここまで
        // === リスト側：マウス操作のフォーカス残りを抑止 ===
        (function suppressMouseFocusInList() {
            const root = listBox;
            if (!root || root._cgtnNoMouseFocus)
                return;
            root._cgtnNoMouseFocus = true;
            // マウス押下時にフォーカス移動を阻止
            root.addEventListener("mousedown", (e) => {
                const el = e.target && e.target.closest("button, label, input[type=checkbox]");
                if (el)
                    e.preventDefault();
            }, { passive: false });
            // クリック後は念のため blur（キーボード操作には影響なし）
            root.addEventListener("click", (e) => {
                const el = e.target && e.target.closest("button, label, input[type=checkbox]");
                if (el && el.blur)
                    el.blur();
            }, { passive: true });
            // マウスアップ捕捉で“今フォーカス中”も外す（より強固に）
            root.addEventListener("mouseup", () => {
                try {
                    const ae = document.activeElement;
                    if (ae instanceof HTMLElement) {
                        ae.blur();
                    }
                }
                catch { }
            }, { capture: true });
        })();
        // suppressMouseFocusInList ここまで
        // リストパネル内でもクリックでフォーカスを残さない
        (function suppressMouseFocusInList(panel) {
            if (!panel || panel._cgtnNoMouseFocus)
                return;
            panel._cgtnNoMouseFocus = true;
            panel.addEventListener("mousedown", (e) => {
                const el = e.target.closest("button, label, input[type=checkbox]");
                if (el)
                    e.preventDefault();
            }, { passive: false });
            panel.addEventListener("click", (e) => {
                const el = e.target.closest("button, label, input[type=checkbox]");
                if (el && el.blur)
                    el.blur();
            }, { passive: true });
        })(listBox);
        // suppressMouseFocusInList ここまで
        // パネルDOM生成の直後に追加：bottom固定からtop固定へ切替
        const r = listBox.getBoundingClientRect();
        listBox.style.top = `${Math.max(8, r.top)}px`;
        listBox.style.bottom = "auto";
        // ドラッグ保存
        (function enableDrag() {
            // ★修正: つまみ(grip)ではなく、ヘッダー全体(head)をドラッグ対象にする
            const grip = listBox.querySelector("#cgpt-list-head");
            if (!grip)
                return; // ← 念のため追加
            let dragging = false, offX = 0, offY = 0;
            grip.addEventListener("pointerdown", (e) => {
                // ★追加: 押した場所が「ボタン」なら、ドラッグは開始しない！
                if (e.target.closest("button"))
                    return;
                dragging = true;
                const r = listBox.getBoundingClientRect();
                offX = e.clientX - r.left;
                offY = e.clientY - r.top;
                grip.setPointerCapture(e.pointerId);
            });
            window.addEventListener("pointermove", (e) => {
                if (!dragging)
                    return;
                listBox.style.left = e.clientX - offX + "px";
                listBox.style.top = e.clientY - offY + "px";
            }, { passive: true });
            window.addEventListener("pointerup", (e) => {
                if (!dragging)
                    return;
                dragging = false;
                grip.releasePointerCapture(e.pointerId);
                // ★追加：ドロップした瞬間に画面内に押し戻す（リストはtop固定なので false）
                if (typeof window.CGTN_UI?.clampPanelWithinViewport === "function") {
                    window.CGTN_UI.clampPanelWithinViewport(listBox, false);
                }
                // ★修正：押し戻されたあとの「正しい座標」を取り直してから保存する
                const r = listBox.getBoundingClientRect();
                const cfg = SH.getCFG();
                SH.saveSettingsPatch({
                    list: { ...(cfg.list || {}), x: r.left, y: r.top },
                });
            });
        })();
        // enableDrag ここまで
        // ★ ロール切り替え（全体 / ユーザー / アシスタント）のバインド
        (function bindRoleFilter(panel) {
            const box = panel.querySelector("#cgpt-list-filter");
            if (!box || box._cgtnBound)
                return;
            box._cgtnBound = true;
            // ★修正：ユーザー操作かどうかを判定する引数(isUserAction)を追加
            const applyFromChecked = (isUserAction = false) => {
                const checked = box.querySelector('input[name="cgtn-lv"]:checked');
                if (!checked)
                    return;
                let role = "all";
                if (checked.id === "lv-user")
                    role = "user";
                if (checked.id === "lv-assist")
                    role = "assistant";
                NS.viewRole = role;
                let pinOnlyChanged = false; // ★追加：付箋状態が変わったかのフラグ
                try {
                    const cfg = SH.getCFG?.() || {};
                    const pinOnly = checked.id === "lv-pin";
                    // ★追加：前回と状態が変わったかチェック
                    if (!!cfg.list?.pinOnly !== pinOnly) {
                        pinOnlyChanged = true;
                    }
                    SH.saveSettingsPatch?.({
                        list: { ...(cfg.list || {}), pinOnly },
                    });
                }
                catch (_) { }
                try {
                    window.CGTN_LOGIC?.updateListFooterInfo?.();
                }
                catch (_) { }
            };
            box.addEventListener("change", (e) => {
                const input = e.target && e.target.closest('input[name="cgtn-lv"]');
                if (!input)
                    return;
                applyFromChecked(true); // ★修正：ユーザー操作として実行
            });
            // 初期状態の反映（初期化時は再構築を呼ばない）
            applyFromChecked(false);
        })(listBox);
        // 畳み/開きのバインドを安全に一度だけ行う
        function bindCollapseOnce(panel) {
            const btn = panel.querySelector("#cgpt-list-collapse");
            if (!btn)
                return;
            if (btn._cgtnBound)
                return; // 二重バインド防止
            btn._cgtnBound = true;
            btn.addEventListener("click", () => {
                const collapsed = panel.classList.toggle("collapsed");
                const on = !collapsed; // 展開=true
                btn.textContent = on ? "▴" : "▾"; // 開=▴ / 閉=▾
                btn.setAttribute("aria-expanded", String(on));
            });
        }
        // ensureListBox() の末尾あたり（listBox を生成した直後でOK）
        if (!document.getElementById("cgtn-pinonly-style")) {
            const st = document.createElement("style");
            st.id = "cgtn-pinonly-style";
            st.textContent = `
        /* 付箋モードONのとき、ラベル文字を強調 */
        #lv-lab-pin.active > span:first-of-type{
          font-weight:600;
        }
      `;
            document.head.appendChild(st);
        }
        bindCollapseOnce(listBox);
        // 付箋バッジ
        NS.updatePinOnlyBadge?.();
        // チャット名表示
        NS.updateListChatTitle?.();
        return listBox;
    }
    // ensureListBox ここまで
    // ★ ロールフィルタのラベル言語適用（新クラス対応版） 2026.01.31
    NS.applyListFilterLang = function () {
        try {
            const panel = document.getElementById("cgpt-list-panel");
            if (!panel)
                return;
            // 翻訳関数（SH.T がなければそのままで）
            //      const T = (key) =>
            //        window.CGTN_SHARED?.T ? window.CGTN_SHARED.T(key) : key;
            const T = SH.T || SH?.t || ((k) => k);
            // ★修正点: 新しいクラス .cgpt-filter-pill を指定します
            const sAll = panel.querySelector("#lv-lab-all .cgpt-filter-pill");
            const sUser = panel.querySelector("#lv-lab-user .cgpt-filter-pill");
            const sAsst = panel.querySelector("#lv-lab-asst .cgpt-filter-pill");
            const sPin = panel.querySelector("#lv-lab-pin .cgpt-filter-pill");
            // テキスト更新 (キー名は辞書に合わせてください)
            if (sAll)
                sAll.textContent = T("all"); // 全体
            if (sUser)
                sUser.textContent = T("user"); // ユーザー
            if (sAsst)
                sAsst.textContent = T("assistant"); // アシスタント
            if (sPin)
                sPin.textContent = T("list.pinonly"); // 付箋
        }
        catch (e) {
            SH.logError("[applyListFilterLang] failed", e);
        }
    };
    // 行右端🗒️のイベントを二重で拾い、誤クリック防止
    function addPinHandlers(btn, art) {
        if (!btn)
            return;
        btn.type = "button";
        btn.style.pointerEvents = "auto";
        btn.style.cursor = "pointer";
        btn.style.padding = "2px 6px"; // ヒットボックス拡大
        const handler = (ev) => {
            // storage仕様変更により置換
            ev.stopPropagation();
            // 1) ターンキー → 1始まり index へ
            const k = getTurnKey(art);
            if (!k)
                return;
            const idx1 = Number(String(k).replace("turn:", ""));
            if (!Number.isFinite(idx1) || idx1 < 1)
                return;
            // 2) 事前状態（pinOnlyでの削除判定用）
            const cfg = SH.getCFG?.() || {};
            const pinOnly = !!cfg.list?.pinOnly;
            // 3) トグル（保存は SH.togglePinByIndex → pinsByChat 配列に確定）
            const chatId = SH.getChatId?.();
            const nextOn = !!SH.togglePinByIndex?.(idx1, chatId); // true: ON後 / false: OFF後
            // 4) pinOnly のとき、OFF になったターン行は即削除
            if (pinOnly && !nextOn) {
                rowsByTurn(k).forEach((n) => n.remove());
                return;
            }
            // 5) 同ターンの相方行を含め UI 同期（強制状態で反映）
            refreshPinUIForTurn(k, nextOn);
        };
        btn.addEventListener("pointerdown", handler, { passive: true });
        btn.addEventListener("click", handler, { passive: true });
    }
    // ★ 付箋ボタン用アイコン（アウトラインだけ／色は currentColor で制御）'25.12.2
    const PIN_ICON_SVG = '<svg class="cgtn-pin-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
        '<path d="M4 2.75C4 2.33579 4.33579 2 4.75 2H11.25C11.6642 2 12 2.33579 12 2.75V12.5L8 10L4 12.5Z"' +
        ' stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
        "</svg>";
    let _renderTicket = 0;
    // 最後に描画したチャットID（チャット遷移時のST使い回し事故を防ぐ）
    let _lastRenderedChatId = "";
    NS.renderList = async function renderList(forceOn = false, opts = {}) {
        console.log("[TN] renderList start", {
            time: Date.now(),
            forceOn,
            ticket: _renderTicket + 1,
        });
        const SH = window.CGTN_SHARED, LG = window.CGTN_LOGIC;
        // ★現在のチャットID（遷移検知に使う）
        const cid = SH?.getChatId?.() || "";
        // 0) Shared 初期化待ち（最大4秒で打ち切り）
        if (SH?.whenLoaded) {
            try {
                await Promise.race([
                    SH.whenLoaded(),
                    new Promise((r) => setTimeout(r, 4000)),
                ]);
            }
            catch (_) { }
        }
        // 1) チャットページかどうか
        const info = SH?.getPageInfo?.() || {};
        const kind = info.kind || (location.pathname.includes("/c/") ? "chat" : "other");
        if (kind !== "chat") {
            LG?.clearListPanelUI?.();
            return;
        }
        // forceOn または スイッチがONなら描画する
        // 2026.02.22 isListToggleOn
        /*
        const enabled = forceOn ? true : SH.isListToggleOn?.();
        if (!enabled) {
          NS._panelOpen = false;
          return;
        }
    */
        // 2026.03.04 isListToggleOn
        const toggleOn = !!SH.isListToggleOn?.();
        const enabled = forceOn ? true : toggleOn;
        if (!enabled) {
            NS._panelOpen = false;
            return;
        }
        // ★ 追加：トグルOFFのときはパネル再表示は禁止
        if (!toggleOn) {
            return;
        }
        // 2) UI準備
        NS._panelOpen = true;
        const panel = ensureListBox();
        panel.classList.remove("collapsed");
        const btn = panel.querySelector("#cgpt-list-collapse");
        if (btn) {
            btn.textContent = "▴";
            btn.setAttribute("aria-expanded", "true");
        }
        panel.style.display = "flex";
        /*
        // ★ 逐次表示する場合は visible にしても良いですが、
        //    今回は「ジャンプ位置のズレ」を防ぐため、完了まで隠す方針（hidden）を維持します
        panel.style.visibility = "hidden";
    */
        // ★再入ガード：描画中に呼ばれたら、今回は何もしない（ちらつき防止）
        // ただし「描画が終わったらもう一度だけ更新したい」ので pending を立てる
        NS._listRenderPending = NS._listRenderPending || false;
        if (NS._listRendering) {
            NS._listRenderPending = true;
            return;
        }
        NS._listRendering = true;
        // ★重要：ここから先は try/finally で _listRendering を必ず解除する
        try {
            // ★チャット遷移検知：ST を使い回さない（前チャットの一覧が出る事故防止）
            if (cid && _lastRenderedChatId && cid !== _lastRenderedChatId) {
                try {
                    // ST はこのファイルの module-scope の const ST を指す
                    ST.all.length = 0;
                    ST.user.length = 0;
                    ST.assistant.length = 0;
                }
                catch { }
            }
            // ★ 今回は「ジャンプ位置のズレ」を防ぐため、完了まで隠す
            //      panel.style.visibility = "hidden";
            // 3) 競合キャンセル用チケット
            const my = ++_renderTicket;
            // 4) ST が空なら再構築（チャット遷移後は上で ST を空にしているので必ず入る）
            if (!LG?.ST?.all?.length) {
                LG?.rebuild?.();
                if (!LG?.ST?.all?.length)
                    return;
            }
            const cidAtStart = cid || SH.getChatId?.();
            const body = panel.querySelector("#cgpt-list-body");
            body.style.maxHeight = "min(75vh, 700px)";
            body.style.overflowY = "auto";
            //body.innerHTML = ""; // クリア
            body.replaceChildren(); // クリア
            const cfg = SH.getCFG?.() || SH?.DEFAULTS || {};
            // pinOnly 判定
            const pinOnly = opts && Object.prototype.hasOwnProperty.call(opts, "pinOnlyOverride")
                ? !!opts.pinOnlyOverride
                : !!cfg.list?.pinOnly;
            const chatId = cid || SH.getChatId?.();
            const pinsArr = (await SH.getPinsArrAsync(chatId)) || [];
            // キャンセルチェック (await明け)
            if (my !== _renderTicket)
                return;
            let turns = ST.all.slice();
            // 2026.02.24
            //if (pinOnly) turns = turns.filter((_, i) => !!pinsArr[i]);
            const maxChars = Math.max(10, Number(cfg.list?.maxChars) || 60);
            const fontPx = (cfg.list?.fontSize || 12) + "px";
            // カウンタリセット
            ((uploads = 0), (downloads = 0));
            // ============================================================
            // ★ Time Slicing (コマ切れ実行) の実装
            // ============================================================
            const CHUNK_SIZE = 50; // 1回に処理する件数 (PC性能に合わせて調整可)
            const totalItems = turns.length;
            for (let i = 0; i < totalItems; i += CHUNK_SIZE) {
                // 1. 割り込みチェック
                if (my !== _renderTicket)
                    return;
                if (cidAtStart !== SH.getChatId?.())
                    return;
                // 2. チャンク切り出し
                const chunk = turns.slice(i, i + CHUNK_SIZE);
                const fragment = document.createDocumentFragment(); // 高速化のためフラグメント使用
                // 3. チャンク内ループ (同期処理)
                for (const art of chunk) {
                    // --- 既存の行生成ロジック ---
                    const index1 = ST.all.indexOf(art) + 1;
                    const head = listHeadNodeOf ? listHeadNodeOf(art) : headNodeOf(art);
                    const attachLine = buildAttachmentLine(art, maxChars);
                    let bodyLine = extractBodySnippet(head, maxChars);
                    const hasRealAttach = !!attachLine;
                    const showClipOnAttach = hasRealAttach;
                    let showClipOnBody = !hasRealAttach && !!bodyLine;
                    const PREVIEW_MAX = Math.max(600, Math.min(2000, SH?.getCFG?.()?.list?.previewMax || 1200));
                    const attachPreview = buildAttachmentLine(art, PREVIEW_MAX) || "";
                    let bodyPreview = extractBodySnippet(head, PREVIEW_MAX) || "";
                    let previewText = (bodyPreview || attachPreview)
                        .replace(/\s+\n/g, "\n")
                        .trim();
                    if (!attachLine && !bodyLine) {
                        const nf = T("row.notFound") || "(not found)";
                        bodyLine = nf;
                        bodyPreview = nf;
                        previewText = nf;
                        showClipOnBody = false;
                    }
                    const roleHint = art?.dataset?.turn;
                    const isUser = roleHint
                        ? roleHint === "user"
                        : art.matches('[data-message-author-role="user"], div [data-message-author-role="user"]');
                    const isAsst = roleHint
                        ? roleHint === "assistant"
                        : art.matches('[data-message-author-role="assistant"], div [data-message-author-role="assistant"]');
                    let anchored = false;
                    // 添付行
                    if (hasRealAttach) {
                        isUser ? uploads++ : downloads++;
                        const row = document.createElement("div");
                        row.className = "row";
                        row.style.fontSize = fontPx;
                        row.dataset.idx = String(index1);
                        row.dataset.kind = "attach";
                        if (!anchored) {
                            row.classList.add("turn-idx-anchor");
                            anchored = true;
                        }
                        if (isUser)
                            row.classList.add("user-turn");
                        if (isAsst)
                            row.classList.add("asst-turn");
                        row.innerHTML = `
            <div class="txt"></div>
            <div class="ops">
              <button class="cgtn-clip-pin cgtn-iconbtn off" title="${T("row.pin")}" aria-pressed="false" aria-label="${T("row.pin")}">${PIN_ICON_SVG}</button>
              <button class="cgtn-preview-btn cgtn-iconbtn" title="${T("row.previewBtn")}" aria-label="${T("row.previewBtn")}">🔎\uFE0E</button>
            </div>
          `;
                        row.querySelector(".txt").textContent = attachLine;
                        row.dataset.preview = previewText || attachLine || "";
                        row.dataset.role = isUser ? "user" : "assistant";
                        const on = !!pinsArr[index1 - 1];
                        paintPinRow(row, on);
                        if (on)
                            row.dataset.pin = "1";
                        else
                            row.removeAttribute("data-pin");
                        fragment.appendChild(row); // fragmentへ
                    }
                    // 本文行
                    if (bodyLine) {
                        const row2 = document.createElement("div");
                        row2.className = "row";
                        row2.style.fontSize = fontPx;
                        row2.dataset.idx = String(index1);
                        row2.dataset.kind = "body";
                        row2.dataset.role = isUser ? "user" : "assistant";
                        if (!anchored) {
                            row2.classList.add("turn-idx-anchor");
                            anchored = true;
                        }
                        if (isPinned(art))
                            row2.dataset.pin = "1";
                        if (isUser)
                            row2.classList.add("user-turn");
                        if (isAsst)
                            row2.classList.add("asst-turn");
                        row2.innerHTML = `
            <div class="txt"></div><span class="attach" aria-label="attachment"></span>
            <div class="ops">
              ${showClipOnBody ? `<button class="cgtn-clip-pin cgtn-iconbtn off" title="${T("row.pin")}" aria-pressed="false" aria-label="${T("row.pin")}">${PIN_ICON_SVG}</button>` : ``}
              <button class="cgtn-preview-btn cgtn-iconbtn" title="${T("row.previewBtn")}" aria-label="${T("row.previewBtn")}">🔎\uFE0E</button>
            </div>
          `;
                        row2.querySelector(".txt").textContent = bodyLine;
                        let attach = !hasRealAttach ? attachLine : "";
                        if (!attach && isAsst && SHOW_UNKNOWN_ATTACH)
                            attach = "（不明）";
                        const attachEl = row2.querySelector(".attach");
                        if (attach && attachEl) {
                            attachEl.textContent = " " + attach;
                            if (isAsst)
                                downloads++;
                        }
                        row2.dataset.preview = previewText || bodyLine || "";
                        const on2 = !!pinsArr[index1 - 1];
                        paintPinRow(row2, on2);
                        if (on2)
                            row2.dataset.pin = "1";
                        else
                            row2.removeAttribute("data-pin");
                        fragment.appendChild(row2); // fragmentへ
                    }
                } // chunk loop end
                // 4. まとめてDOMに追加
                body.appendChild(fragment);
                // 5. ★休憩: UIスレッドをブロックしないよう、次のタスクへ譲る
                await new Promise((r) => setTimeout(r, 0));
            }
            // ============================================================
            // ============================================================
            // ★修正：孤児付箋のレスキューUI生成
            // ============================================================
            // ★罠修正：turns.length ではなく、絶対的な総ターン数を使う！
            const totalTurnsForOrphan = NS.ST?.all?.length || 0;
            const orphanPins = [];
            for (let i = totalTurnsForOrphan; i < pinsArr.length; i++) {
                if (pinsArr[i])
                    orphanPins.push(i + 1);
            }
            let validPinsCountForRender = 0;
            for (let i = 0; i < totalTurnsForOrphan; i++) {
                if (pinsArr[i])
                    validPinsCountForRender++;
            }
            NS.validPinsCount = validPinsCountForRender;
            NS.orphanPinsCount = orphanPins.length;
            // ★罠修正：pinOnly の時だけでなく、孤児がいればいつでも警告UIを出す！
            if (orphanPins.length > 0) {
                const orphanDiv = document.createElement("div");
                orphanDiv.className = "cgtn-orphan-row";
                orphanDiv.style.cssText =
                    "padding:12px; margin:8px; border:1px dashed #f57c00; background:#fff3e0; border-radius:6px;";
                orphanDiv.innerHTML = `
        <div style="color:#e65100; font-weight:bold; font-size:12px; margin-bottom:8px;">
          ⚠ 見つからない付箋が ${orphanPins.length} 件保護されています
        </div>
        <div style="display:flex; gap:8px;">
          <button id="btn-rescue-orphan" class="cgtn-mini-btn" style="flex:1; padding:6px; background:#fff; border:1px solid #f57c00; color:#e65100; cursor:pointer; border-radius:4px;">末尾に付け直す</button>
          <button id="btn-delete-orphan" class="cgtn-mini-btn" style="flex:1; padding:6px; background:#fff; border:1px solid #ccc; cursor:pointer; border-radius:4px;">削除</button>
        </div>
      `;
                orphanDiv
                    .querySelector("#btn-delete-orphan")
                    ?.addEventListener("click", async () => {
                    const arr = await SH.getPinsArrAsync(chatId);
                    arr.length = totalTurnsForOrphan;
                    await SH.savePinsArrAsync(arr, chatId);
                    NS.syncPinCounts?.(); // ★バッジ即時更新
                    NS.renderList(true);
                });
                orphanDiv
                    .querySelector("#btn-rescue-orphan")
                    ?.addEventListener("click", async () => {
                    const arr = await SH.getPinsArrAsync(chatId);
                    const rescueCount = orphanPins.length; // ★孤児ONの件数
                    arr.length = totalTurnsForOrphan;
                    if (totalTurnsForOrphan > 0 && rescueCount > 0) {
                        const n = Math.min(rescueCount, totalTurnsForOrphan);
                        for (let i = 0; i < n; i++) {
                            arr[totalTurnsForOrphan - 1 - i] = 1; // 末尾からn件ON
                        }
                    }
                    await SH.savePinsArrAsync(arr, chatId);
                    NS.syncPinCounts?.(); // ★バッジ即時更新
                    NS.renderList(true);
                });
                body.appendChild(orphanDiv);
            }
            // ★ `if` の条件判定を完全に削除し、常に empty を追加する！
            const empty = document.createElement("div");
            empty.className = "cgtn-empty";
            // ★ style に `display: none;` を追加して普段は隠しておく
            empty.style.cssText =
                "padding:16px;opacity:.85;font-size:13px; display:none;";
            empty.innerHTML = `
      <div class="msg" data-kind="msg">${T("list.noPins")}</div>
    `;
            body.appendChild(empty);
            const rowsCount = body.querySelectorAll(".row").length;
            NS._lastVisibleRows = rowsCount;
            const box = pinOnly ? NS.metrics.pins : NS.metrics.all;
            box.uploads = uploads;
            box.downloads = downloads;
            NS.uploads = uploads;
            NS.downloads = downloads;
            NS.pinsCount = Object.values(pinsArr).filter(Boolean).length;
            updateListFooterInfo();
            NS.updatePinOnlyBadge?.();
            NS.updateListChatTitle?.();
            if (my !== _renderTicket)
                return;
            if (cidAtStart !== SH.getChatId?.())
                return;
            if (my === _renderTicket && NS._panelOpen) {
                panel.style.display = "flex";
                // 計測可能になったのでスクロール
                scrollListToTurn(NS._currentTurnKey);
                // 最後に表示！
                //        panel.style.visibility = "visible";
                // ★この描画が有効に完了したチャットIDを記録
                if (cidAtStart)
                    _lastRenderedChatId = String(cidAtStart);
            }
        }
        finally {
            // ★描画中フラグを必ず解除
            NS._listRendering = false;
            // ★保留が立っていたら 1回だけ追いかける
            if (NS._listRenderPending) {
                NS._listRenderPending = false;
                setTimeout(() => {
                    try {
                        // トグル状態は renderList 内で確認される
                        void NS.renderList(false);
                    }
                    catch { }
                }, 0);
            }
        }
    };
    // renderList ここまで
    // ======================================================
    // 一覧パネル ON / OFF
    // ======================================================
    // ★追加: 実行待ちのタスクを覚えておく変数（関数の外に置いてください）
    let _pendingListGen = null;
    NS.setListEnabled = function setListEnabled(on) {
        const SHX = window.CGTN_SHARED || {};
        const cfg = SHX.getCFG?.() || {};
        const curList = cfg.list || {};
        const panel = document.getElementById("cgpt-list-panel");
        // 1. もし「前の処理」が待機中なら、それを強制キャンセル！
        if (_pendingListGen) {
            clearTimeout(_pendingListGen.timer);
            _pendingListGen.resolve(false); // 「キャンセル」として終わらせる
            _pendingListGen = null;
        }
        if (on) {
            // --- ON処理 ---
            const nextList = { ...curList, enabled: true, pinOnly: false };
            SHX.saveSettingsPatch?.({ list: nextList });
            if (panel)
                panel.style.display = "";
            // 各種初期化
            try {
                NS.ensurePinsCache?.();
            }
            catch (e) { }
            try {
                const maxChars = SHX.getCFG?.()?.list?.maxChars || 52;
                NS.applyPanelWidthByChars?.(maxChars);
            }
            catch (e) { }
            try {
                NS.installAutoSyncForTurns?.();
            }
            catch (e) { }
            // ★修正: キャンセル可能なPromiseを返す
            return new Promise((resolve) => {
                const timer = setTimeout(async () => {
                    _pendingListGen = null; // 実行開始したのでクリア
                    // 念のため、実行直前にもう一度コンフィグを確認
                    // (ページ遷移などで裏でOFFにされている場合があるため)
                    // 2026.02.22 isListToggleOn
                    if (!SH.isListToggleOn?.()) {
                        resolve(false);
                        return;
                    }
                    try {
                        // rebuildは同期処理でステータスを更新してしまうため、
                        // Loading表示を維持するために一旦実行してから...
                        NS.rebuild?.();
                        // リスト生成直前にもう一度 "List Gen..." を出す
                        window.CGTN_UI?.updateStatusDisplay?.("List Gen...");
                        // renderList (async) をしっかり待つ
                        await NS.renderList?.(true);
                        resolve(true); // 成功
                    }
                    catch (e) {
                        SH.logError("[setListEnabled] failed", e);
                        resolve(false);
                    }
                }, 180);
                // キャンセル用にタイマーIDと解決関数を保存
                _pendingListGen = { timer, resolve };
            });
        }
        else {
            // --- OFF処理 ---
            const nextList = { ...curList, enabled: false, pinOnly: false };
            SHX.saveSettingsPatch?.({ list: nextList });
            if (panel) {
                panel.style.display = "none";
                panel.classList.remove("pinonly");
            }
            try {
                NS.detachTurnObserver?.();
            }
            catch (e) { }
            try {
                NS.clearListFooterInfo?.();
            }
            catch (e) { }
            try {
                NS.updatePinOnlyBadge?.();
            }
            catch (e) { }
            try {
                NS.updatePinOnlyView?.();
            }
            catch (e) { }
            // OFF時は即完了
            return Promise.resolve(false);
        }
    };
    // === pinOnly DOMフィルタ（renderList禁止版）'25.11.28 ===
    function updatePinOnlyView() {
        const panel = document.getElementById("cgpt-list-panel");
        const btn = document.getElementById("cgpt-pin-filter");
        const on = !!SH.getCFG()?.list?.pinOnly;
        if (!panel || !btn)
            return;
        // ボタンの押下状態（アクセシビリティ用＆見た目）
        btn.setAttribute("aria-pressed", String(on));
        // パネル本体に pinonly クラスを付け外し
        panel.classList.toggle("pinonly", on);
    }
    NS.updatePinOnlyView = updatePinOnlyView;
    // === 付箋バッジ更新（唯一の正規処理）=== '25.12.2 2026.02.23
    /*
    function updatePinOnlyBadge(forceCount?: number) {
      try {
        const cfg = SH.getCFG?.() || {};
        const cid = SH.getChatId?.();
        if (!cid) return;
  
        let pinsCount = 0;
        // =======================================================
        // ★修正: 先取り数字(forceCount)が渡されたら、絶対にそれを信じる！
        // =======================================================
        if (typeof forceCount === "number") {
          pinsCount = forceCount;
          NS.pinsCount = pinsCount;
        } else {
          // 渡されなかった時だけ、ストレージ(旧データ)を見に行く
          pinsCount =
            typeof window.CGTN_SHARED?.getPinsCountByChat === "function"
              ? window.CGTN_SHARED.getPinsCountByChat(cid)
              : 0;
          NS.pinsCount = pinsCount;
        }
  
        // 付箋ボタン（label）とバッジを取得
        const btn = document.getElementById("lv-lab-pin");
        const badge = btn?.querySelector(".cgtn-badge");
  
        if (!btn || !badge) {
          return;
        }
  
        if (!(badge instanceof HTMLElement)) {
          return;
        }
  
        // --- バッジ表示制御 ---
        if (pinsCount > 0) {
          badge.textContent = String(pinsCount);
          badge.hidden = false;
          // 色は CSS で固定するのでここでは触らない
        } else {
          badge.textContent = "";
          badge.hidden = true;
        }
  
        // --- ボタンの「選択中」状態 ---
        const pinOnly = !!cfg.list?.pinOnly;
        btn.classList.toggle("active", pinOnly);
      } catch (e) {
        SH.logError("updatePinOnlyBadge failed", e);
      }
    }
  */
    // 引数に forceOrphan を追加
    function updatePinOnlyBadge(forceValid, forceOrphan) {
        try {
            const cfg = window.CGTN_SHARED?.getCFG?.() || {};
            const cid = window.CGTN_SHARED?.getChatId?.();
            if (!cid)
                return;
            let validCount = 0;
            let orphanCount = 0;
            // 先取り数字があれば信じる、なければメモリのキャッシュを見る
            if (typeof forceValid === "number" && typeof forceOrphan === "number") {
                validCount = forceValid;
                orphanCount = forceOrphan;
            }
            else {
                validCount = NS.validPinsCount || 0;
                orphanCount = NS.orphanPinsCount || 0;
                // （※初期ロード時などのために、厳密には shared 側から読み込む処理が必要ですが、
                // ひとまずは renderList の中で初期計算されるのでこれで動きます）
            }
            const btn = document.getElementById("lv-lab-pin");
            const badge = btn?.querySelector(".cgtn-badge");
            if (!btn || !badge)
                return;
            if (!(badge instanceof HTMLElement))
                return;
            if (validCount > 0 || orphanCount > 0) {
                // ★ 孤児がいる場合は (+1) をくっつける
                badge.textContent =
                    orphanCount > 0
                        ? `${validCount} (+${orphanCount})`
                        : String(validCount);
                badge.hidden = false;
            }
            else {
                badge.textContent = "";
                badge.hidden = true;
            }
            const pinOnly = !!cfg.list?.pinOnly;
            btn.classList.toggle("active", pinOnly);
        }
        catch (e) {
            window.CGTN_SHARED?.logError?.("updatePinOnlyBadge failed", e);
        }
    }
    NS.updatePinOnlyBadge = updatePinOnlyBadge;
    // ★追加：裏で正確なピン数を計算してバッジを更新する関数
    NS.syncPinCounts = async function () {
        const cid = window.CGTN_SHARED?.getChatId?.();
        if (!cid)
            return;
        const pinsArr = await window.CGTN_SHARED.getPinsArrAsync(cid);
        const totalTurns = NS.ST?.all?.length || 0;
        let valid = 0, orphan = 0;
        for (let i = 0; i < pinsArr.length; i++) {
            if (pinsArr[i]) {
                if (i < totalTurns)
                    valid++;
                else
                    orphan++;
            }
        }
        NS.validPinsCount = valid;
        NS.orphanPinsCount = orphan;
        NS.pinsCount = valid + orphan;
        NS.updatePinOnlyBadge?.(valid, orphan);
    };
    // ★ 全ON/全OFFボタンの活性/非活性制御 '25.11.23
    function updateBulkPinButtonsState() {
        try {
            const cfg = SH.getCFG?.() || {};
            const enabled = SH.isListToggleOn?.();
            const pinOnly = !!cfg.list?.pinOnly;
            const onBtn = document.getElementById("cgpt-pin-all-on");
            const offBtn = document.getElementById("cgpt-pin-all-off");
            if (onBtn instanceof HTMLButtonElement) {
                // リストOFF か pinOnly 中は All ON 無効
                onBtn.disabled = !enabled || pinOnly;
            }
            if (offBtn instanceof HTMLButtonElement) {
                // リストOFF のときだけ無効。pinOnly中は OFF だけ有効。
                offBtn.disabled = !enabled;
            }
        }
        catch (e) {
            SH.logError("[updateBulkPinButtonsState]", e);
        }
    }
    NS.updateBulkPinButtonsState = updateBulkPinButtonsState;
    // === フッターの件数を即時クリア（リスト無し表示） ===
    // ===== フッター：状態セーフに更新 =====
    function clearListFooterInfo() {
        const foot = document.getElementById("cgpt-list-foot-info");
        if (!foot)
            return;
        foot.dataset.state = "empty";
        foot.textContent = T("list.empty") || "リストはありません";
    }
    // フッター更新 '25.11.28変更
    function updateListFooterInfo() {
        const foot = document.getElementById("cgpt-list-foot-info");
        if (!foot)
            return;
        const ST = NS?.ST || {};
        const allTurns = Array.isArray(ST.all) ? ST.all.length : 0;
        const userTurns = Array.isArray(ST.user) ? ST.user.length : 0;
        const asstTurns = Array.isArray(ST.assistant) ? ST.assistant.length : 0;
        // 0件：メッセージのみ（リフレッシュボタンは別要素なので残る）
        if (!allTurns) {
            foot.dataset.state = "empty";
            foot.textContent = T("list.empty") || "リストはありません";
            return;
        }
        // 設定（pinOnly）
        const cfg = window.CGTN_SHARED?.getCFG?.() || {};
        const pinOnly = !!cfg.list?.pinOnly;
        // ---- 集計値の取得（renderList が詰めた NS.metrics を使う） ----
        const m = NS.metrics || {};
        const box = pinOnly ? m.pins || {} : m.all || {};
        let uploads = typeof box.uploads === "number" ? box.uploads : Number(NS?.uploads || 0);
        let downloads = typeof box.downloads === "number"
            ? box.downloads
            : Number(NS?.downloads || 0);
        // ---- 現在のロール（全体 / ユーザー / アシスタント） ----
        let role = NS?.viewRole || "all";
        try {
            const filterBox = document.getElementById("cgpt-list-filter");
            const checked = filterBox?.querySelector('input[name="cgtn-lv"]:checked');
            if (checked) {
                if (checked.id === "lv-user")
                    role = "user";
                else if (checked.id === "lv-assist")
                    role = "assistant";
                else
                    role = "all";
            }
        }
        catch (e) {
            SH.logError("[updateListFooterInfo] role detection failed", e);
        }
        NS.viewRole = role;
        // ---- DOM から「ロール別 / 付箋別」の件数を数える ----
        let visibleForRole = 0; // ロール条件だけ満たす可視ターン数（pinOnly=OFF のときに使う）
        let pinsForRole = 0; // ロール条件＋付箋あり のターン数（pinOnly=ON の分子）
        try {
            const body = document.getElementById("cgpt-list-body");
            if (body) {
                const anchors = body.querySelectorAll(".turn-idx-anchor");
                anchors.forEach((el) => {
                    const row = el.closest(".row");
                    if (!(row instanceof HTMLElement))
                        return;
                    if (row.offsetParent === null)
                        return; // 非表示行は除外
                    const r = row.getAttribute("data-role"); // user / assistant
                    const isPin = row.getAttribute("data-pin") === "1";
                    const roleMatch = role === "all" ||
                        (role === "user" && r === "user") ||
                        (role === "assistant" && r === "assistant");
                    if (!roleMatch)
                        return;
                    visibleForRole++;
                    if (isPin)
                        pinsForRole++;
                });
            }
        }
        catch (e) {
            SH.logError("[updateListFooterInfo] visible count failed", e);
        }
        // ---- 会話数（分母）の決め方 ----
        const totalByRole = {
            all: allTurns,
            user: userTurns,
            assistant: asstTurns,
        };
        let totalDisplay;
        let countDisplay;
        if (pinOnly) {
            // 付箋のみ表示：
            //   分母 = ロール別の総ターン数（全体 / user / assistant）
            //   分子 = 付箋付きターン数（ロール条件も適用）
            totalDisplay = totalByRole[role] || allTurns;
            if (totalDisplay <= 0)
                totalDisplay = allTurns;
            countDisplay = pinsForRole;
        }
        else {
            // 通常表示：
            //   全体表示 → 「6」
            //   ユーザー/アシスタント → 「3/6」 のような分数表示
            const denom = allTurns;
            if (role === "all" || !denom) {
                // 全体表示 → 分母だけ（例: 6）
                countDisplay = denom;
                totalDisplay = denom;
            }
            else {
                // ユーザー/アシスタント → 分子/分母（例: 3/6）
                countDisplay = visibleForRole;
                totalDisplay = denom;
            }
        }
        // ---- uploads / downloads をロールに合わせて整形 ----
        if (role === "user") {
            downloads = 0;
        }
        else if (role === "assistant") {
            uploads = 0;
        }
        // ★ pinOnly のときはアップ／ダウンロード件数は常に「ー」表示にする
        if (pinOnly) {
            uploads = "ー";
            downloads = "ー";
        }
        // ---- テンプレート適用 ----
        foot.dataset.state = "normal";
        if (pinOnly) {
            const tpl = T("list.footer.pinOnly") || "{count}/{total}";
            foot.textContent = tpl
                .replace("{count}", String(countDisplay)) // 付箋付きターン数（分子）
                .replace("{total}", String(totalDisplay)) // ロール別総ターン数（分母）
                .replace("{uploads}", String(uploads))
                .replace("{downloads}", String(downloads));
        }
        else {
            const tpl = T("list.footer.all") || "{total}";
            let totalText;
            if (role === "all" || !totalDisplay) {
                // 全体表示 → 「6」
                totalText = String(countDisplay);
            }
            else {
                // ユーザー/アシスタント → 「3/6」
                totalText = `${countDisplay}/${totalDisplay}`;
            }
            foot.textContent = tpl
                .replace("{count}", String(countDisplay))
                .replace("{total}", totalText)
                .replace("{uploads}", String(uploads))
                .replace("{downloads}", String(downloads));
        }
        // ★ フッター更新タイミングでボタン状態も同期 '25.11.23
        try {
            NS.updateBulkPinButtonsState?.();
        }
        catch { }
    }
    NS.updateListFooterInfo = updateListFooterInfo;
    // ファイルの末尾や適当な場所に追加
    // =================================================================
    // ★追加: Idle時用サイレント更新 (UIを出さずに集計だけ行う)
    // =================================================================
    NS.updateFooterOnly = async function () {
        // 1. DOM要素スキャン (fast scan)
        const articles = document.querySelectorAll(TURN_SEL);
        const total = articles.length;
        if (total === 0)
            return;
        // 2. ピン情報をロード
        const cid = SH.getChatId?.();
        let pins = [];
        if (cid) {
            pins = await SH.getPinsArrAsync(cid);
        }
        // 3. 集計
        let userCount = 0;
        let aiCount = 0;
        let pinCount = 0;
        articles.forEach((art, idx) => {
            // role判定 (簡易版)
            const isUser = art.getAttribute("data-message-author-role") === "user";
            if (isUser)
                userCount++;
            else
                aiCount++;
            // pin判定
            if (pins[idx] === 1)
                pinCount++;
        });
        // 4. ナビパネルの表示更新
        // (通常モードの updateListFooterInfo のロジックを部分的に利用)
        // ここではナビパネル上のバッジやステータス表示を更新する関数を呼ぶか、直接更新します。
        // もし updateListFooterInfo が UI依存している場合は、
        // 以下のように専用の更新処理を書きます。
        // ナビパネルのステータス更新 (例: "User: 5 / AI: 5")
        if (typeof NS.updateStatusDisplay === "function") {
            // 簡易表示
            // UI.updateStatusDisplay(`${userCount}/${aiCount} (📌${pinCount})`);
            // または既存の updateListFooterInfo を流用できるなら呼ぶ
            // NS.updateListFooterInfo(); // ※これがパネル依存してないか確認が必要
        }
        // もし既存の updateListFooterInfo がパネル(#cgpt-list-panel)がないと動かない場合は
        // ↓この関数を使ってナビパネル側の数字だけ更新してください
        NS.updateNavStats?.(userCount, aiCount, pinCount);
    };
    //付箋バッジ/チャット名更新
    document.addEventListener("cgtn:pins-updated", () => {
        try {
            NS?.updatePinOnlyBadge?.();
        }
        catch { }
        try {
            NS?.updateListChatTitle?.();
        }
        catch { }
    });
    // 保存失敗時のロールバック（再読込→再描画）
    window.addEventListener("cgtn:save-error", (ev) => {
        try {
            const cev = ev;
            const cid = cev.detail?.chatId || SH.getChatId?.();
            if (cid)
                hydratePinsCache?.(cid);
            if (SH.isListOpen?.())
                NS.renderList?.(true);
            window.CGTN_UI?.toast?.("保存に失敗しました（容量または通信エラー）", "error");
        }
        catch { }
    });
    window.addEventListener("cgtn:pins-updated", (ev) => {
        if (!(ev instanceof CustomEvent))
            return;
        const { chatId, count } = ev.detail || {};
        // renderListは呼ばない '25.11.27
        // 付箋モード変更時も、DOM 再描画はせずバッジ/タイトルだけ更新
        // （data-pin と aria-pressed に基づき CSS 側で表示が切り替わる）
        //付箋バッジ更新
        NS?.updatePinOnlyBadge?.();
        //チャット名
        NS?.updateListChatTitle?.();
    });
    // リストの内部作業状態を軽く初期化（必要なものだけ）
    NS.onChatSwitched = function (newCid) {
        try {
            // もし内部に「前回の chatId を覚えている」変数があれば更新
            NS._lastChatId = newCid;
            // リスト作成用の一時キャッシュをクリア（名前は実装に合わせて）
            NS._turnCache = {}; // ← 存在すれば
            NS._lastRenderSig = ""; // ← 変化検知用のシグネチャ類
        }
        catch { }
    };
    // logic.js（UI初期化後どこでも）
    // charsPerLine は設定値（例: 48, 64 など）
    NS.applyPanelWidthByChars = function (charsPerLine) {
        const panel = document.getElementById("cgpt-list-panel");
        if (!panel)
            return;
        const em = parseFloat(getComputedStyle(panel).fontSize) || 14; // px
        const charW = 0.62 * em; // だいたいの平均字幅
        const padding = 24 + 32; // 左右パディング + 内部アイコン余白の概算
        const minW = 280, maxW = 680;
        const width = Math.max(minW, Math.min(maxW, Math.round(charsPerLine * charW + padding)));
        panel.style.width = width + "px";
    };
    // 2026.02.23
    NS.togglePin = async function (article) {
        if (!article)
            return;
        const cid = SH.getChatId?.();
        if (!cid)
            return;
        const key = NS.getTurnKey(article);
        const idx1 = Number(String(key).replace("turn:", ""));
        if (!idx1)
            return;
        // 1. 現在のデータ配列を取得 (メモリ読み込みなので一瞬)
        const arr = await SH.getPinsArrAsync(cid);
        const totalTurns = NS.ST?.all?.length || 0;
        if (arr.length < totalTurns) {
            const oldLen = arr.length;
            arr.length = totalTurns;
            arr.fill(0, oldLen);
        }
        // 3. トグル処理
        const current = arr[idx1 - 1] ? 1 : 0;
        const next = current ? 0 : 1;
        arr[idx1 - 1] = next;
        const nextState = !!next;
        // =======================================================
        // ★追加: メモリ上の PINS (Set) も忘れずに更新する！
        // =======================================================
        if (nextState) {
            PINS.add(String(key));
        }
        else {
            PINS.delete(String(key));
        }
        // =======================================================
        // ★ 爆速化: 保存を待たずに、先にUIをパッと変えてしまう！
        // =======================================================
        const body = document.getElementById("cgpt-list-body");
        if (body) {
            const rows = body.querySelectorAll(`.row[data-idx="${idx1}"]`);
            rows.forEach((r) => {
                const row = r;
                if (nextState)
                    row.dataset.pin = "1";
                else
                    row.removeAttribute("data-pin");
                const clip = row.querySelector(".cgtn-clip-pin");
                if (clip) {
                    clip.setAttribute("aria-pressed", String(nextState));
                    clip.classList.toggle("off", !nextState);
                    clip.classList.toggle("on", nextState);
                }
            });
        }
        // 2026.02.23
        // ★爆速化＆孤児対応：有効な数と孤児の数を分けて先取り計算する！
        let validCount = 0;
        let orphanCount = 0;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i]) {
                if (i < totalTurns)
                    validCount++;
                else
                    orphanCount++;
            }
        }
        // 全体の数と個別の数を記憶しておく
        NS.pinsCount = validCount + orphanCount;
        NS.validPinsCount = validCount;
        NS.orphanPinsCount = orphanCount;
        try {
            // 両方の数字をバッジ更新関数に渡す
            NS.updatePinOnlyBadge?.(validCount, orphanCount);
        }
        catch { }
        // =======================================================
        // ★ その後、裏でこっそり保存する（awaitしない！）
        // =======================================================
        SH.savePinsArrAsync(arr, cid).catch((e) => SH.logError("Optimistic save failed", e));
    };
    // --- expose ---
    window.CGTN_LOGIC = Object.assign(window.CGTN_LOGIC || {}, {
        getTurnKey: NS.getTurnKey || getTurnKey,
        isPinnedByKey,
    });
    function goTop(role) {
        const L = role === "user" ? ST.user : role === "assistant" ? ST.assistant : ST.all;
        if (!L?.length)
            return;
        scrollToHead(L[0]);
    }
    function goBottom(role) {
        const sc = getTrueScroller();
        // 末尾へ「確実に」到達させる（scrollHeightが途中で伸びても追従）
        const scrollBottomReliable = () => {
            const maxTry = 12;
            let n = 0;
            const kick = () => {
                const target = sc.scrollHeight;
                // 最初は smooth、以降は auto にして取りこぼしを潰す
                sc.scrollTo({ top: target, behavior: n < 2 ? "smooth" : "auto" });
                n++;
                if (n >= maxTry)
                    return;
                // まだ末尾に届いていなければ追い打ち
                const remain = sc.scrollHeight - (sc.scrollTop + sc.clientHeight);
                if (remain > 2) {
                    setTimeout(kick, 120);
                }
            };
            kick();
        };
        if (role === "all") {
            lockFor(SH.getCFG().lockMs);
            scrollBottomReliable();
            return;
        }
        const L = role === "user" ? ST.user : ST.assistant;
        if (!L?.length)
            return;
        // role別は scrollToHead 側に「安定するまで追う」処理があるので任せる
        scrollToHead(L[L.length - 1]);
    }
    function goPrev(role) {
        const L = role === "user" ? ST.user : role === "assistant" ? ST.assistant : ST.all;
        if (!L?.length || NS._navBusy)
            return;
        const sc = getTrueScroller();
        const yStar = sc.scrollTop + currentAnchorY();
        const eps = Number(SH.getCFG().eps) || 2; // 少しだけ余裕
        for (let i = L.length - 1; i >= 0; i--) {
            if (articleTop(sc, L[i]) < yStar - eps) {
                scrollToHead(L[i]);
                return;
            }
        }
    }
    function goNext(role) {
        const L = role === "user" ? ST.user : role === "assistant" ? ST.assistant : ST.all;
        if (!L?.length || NS._navBusy)
            return;
        const sc = getTrueScroller();
        const yStar = sc.scrollTop + currentAnchorY();
        const eps = Number(SH.getCFG().eps) || 2;
        for (const el of L) {
            if (articleTop(sc, el) > yStar + eps) {
                scrollToHead(el);
                return;
            }
        }
    }
    // === ★追加: 自動更新ロジックの移植 ===
    let _turnObs = null;
    let _observedRoot = null;
    NS.detachTurnObserver = function () {
        try {
            _turnObs?.disconnect();
        }
        catch { }
        _turnObs = null;
        _observedRoot = null;
    };
    NS.installAutoSyncForTurns = function installAutoSyncForTurns() {
        const root = document.querySelector("main") || document.body;
        if (_observedRoot === root && _turnObs)
            return;
        NS.detachTurnObserver();
        let to = 0;
        // ★: これを true にすると理由ログが出る（普段は false 推奨）
        const DBG = true;
        const now = () => Date.now();
        const dbg = (...a) => {
            if (DBG)
                console.log(...a);
        };
        // ★ composer(入力欄周り) を雑に除外
        const inComposer = (node) => {
            if (!node)
                return false;
            const el = node.nodeType === 1
                ? node
                : node.parentElement;
            if (!el)
                return false;
            // ChatGPTのUI差し替えに強めに対応（ゆるく広めに弾く）
            return !!el.closest([
                "form", // 入力フォーム配下
                "#composer", // ある環境
                "[data-testid='composer']", // ある環境
                "[data-testid='composer-footer']",
                "#prompt-textarea",
                "[contenteditable='true']",
                "button#composer-submit-button",
                "[data-state]", // 送信/音声切替がこれ系を触ることが多い
            ].join(","));
        };
        // ★ 理由付きkick
        const kick = (reason, detail) => {
            dbg("[TN] kick scheduled", { t: now(), reason, detail });
            clearTimeout(to);
            to = window.setTimeout(() => {
                dbg("[TN] kick fired", { t: now(), reason });
                try {
                    if (typeof NS.rebuild === "function")
                        NS.rebuild();
                    const open = typeof SH.isListOpen === "function" ? SH.isListOpen() : false;
                    dbg("[TN] list open =", open);
                    if (open) {
                        if (typeof NS.renderList === "function")
                            NS.renderList(false);
                    }
                    else {
                        if (typeof NS.updateStatus === "function")
                            NS.updateStatus();
                    }
                }
                catch (e) {
                    SH.logError("auto-sync kick failed", e);
                }
            }, 300);
        };
        _turnObs = new MutationObserver((muts) => {
            for (const m of muts) {
                // 自前UIは無視
                if (inOwnUI(m.target))
                    continue;
                // ★ composer周りの変化は丸ごと無視（typingノイズを止める）
                if (inComposer(m.target))
                    continue;
                if (m.type === "childList") {
                    // 追加ノードを軽く見る
                    let hit = false;
                    let why = null;
                    const added = m.addedNodes?.length || 0;
                    for (let i = 0; i < added; i++) {
                        const n = m.addedNodes[i];
                        if (n.nodeType !== 1)
                            continue;
                        const el = n;
                        // ★ composer由来の追加は除外（added側も念押し）
                        if (inComposer(el))
                            continue;
                        if (el.tagName === "ARTICLE") {
                            hit = true;
                            why = "added ARTICLE";
                            break;
                        }
                        if (el.hasAttribute("data-message-author-role")) {
                            hit = true;
                            why = "added [data-message-author-role]";
                            break;
                        }
                        // ★ 追加された要素の配下に article がいるケース（必要なら）
                        // if (el.querySelector?.("article,[data-message-author-role]")) { ... }
                    }
                    if (hit) {
                        dbg("[TNDBG] MO hit(childList)", { t: now(), added, why });
                        kick("MO childList", { added, why });
                        break;
                    }
                    // ★ hitしてないときはログ出さない（ここがノイズ削減の肝）
                    continue;
                }
                // あなたの observe 設定では characterData/attributes は false なのでここは基本来ない
                // もし将来ONにしたら、ここも同様に inComposer 除外と reason を付ければOK
            }
        });
        try {
            _turnObs.observe(root, {
                childList: true,
                subtree: true,
                characterData: false,
                attributes: false,
            });
            _observedRoot = root;
        }
        catch (e) {
            SH.logError("[auto-sync] observe failed", e);
        }
    };
    // 2. 初期化時に一度テーマを適用する（少し遅延させて設定ロードを待つ）
    setTimeout(() => {
        try {
            const cfg = window.CGTN_SHARED?.getCFG?.() || {};
            window.CGTN_UI.applyLang(cfg.theme);
        }
        catch (e) {
            window.CGTN_SHARED?.logError?.("Theme init failed", e);
        }
    }, 200);
    // 3. OSのテーマ設定変更をリアルタイム監視して自動切り替え
    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", () => {
        try {
            const cfg = window.CGTN_SHARED?.getCFG?.() || {};
            const mode = cfg.theme?.mode || "auto";
            if (mode === "auto") {
                window.CGTN_UI.applyLang({ mode: "auto" });
            }
        }
        catch { }
    });
    // 4. ストレージの変更を監視して、リアルタイムで設定を反映する
    if (chrome.storage?.onChanged && !window.__CGTN_ONCHG_BOUND__) {
        window.__CGTN_ONCHG_BOUND__ = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "sync")
                return;
            const SH = window.CGTN_SHARED;
            const LG = window.CGTN_LOGIC;
            // cgNavSettings が変わった時だけ
            const ch = changes.cgNavSettings;
            if (!ch || !ch.newValue)
                return;
            const oldVal = (ch.oldValue || {});
            const newVal = (ch.newValue || {});
            // メモリCFGを storage.get なしで更新（DEFAULTS + newVal）
            try {
                const base = structuredClone(SH?.DEFAULTS || {});
                const nextCfg = Object.assign(base, newVal);
                SH?.setCFG?.(nextCfg);
            }
            catch { }
            // 変更判定（必要なキーだけ）
            const oldThemeMode = oldVal.theme?.mode ?? "auto";
            const newThemeMode = newVal.theme?.mode ?? "auto";
            const themeChanged = oldThemeMode !== newThemeMode;
            const oldMaxChars = oldVal.list?.maxChars;
            const newMaxChars = newVal.list?.maxChars;
            const widthChanged = oldMaxChars !== newMaxChars;
            const vizChanged = (oldVal.showViz ?? false) !== (newVal.showViz ?? false);
            const oldSend = oldVal.sendKeyMethod ?? "enter";
            const newSend = newVal.sendKeyMethod ?? "enter";
            const sendKeyChanged = oldSend !== newSend;
            // 即時反映（必要なものだけ）
            if (themeChanged)
                window.CGTN_UI.applyLang({ mode: newThemeMode });
            if (widthChanged && typeof newMaxChars === "number")
                LG?.applyPanelWidthByChars?.(newMaxChars);
            if (vizChanged && typeof newVal.showViz === "boolean")
                SH?.renderViz?.(newVal, newVal.showViz);
            if (sendKeyChanged) {
                const skVal = document.getElementById("cgpt-sendkey-val");
                if (skVal) {
                    const t = window.CGTN_I18N?.t || ((k) => k);
                    let key = "nav.sk_enter";
                    if (newSend === "ctrl_enter")
                        key = "nav.sk_ctrl";
                    else if (newSend === "alt_enter")
                        key = "nav.sk_alt";
                    skVal.textContent = t(key);
                }
            }
        });
    }
    // --- expose ---
    NS.ensureTurnsReady = ensureTurnsReady;
    NS.clearListFooterInfo = clearListFooterInfo;
    NS.updatePinOnlyBadge = updatePinOnlyBadge;
    NS.goTop = goTop;
    NS.goBottom = goBottom;
    NS.goPrev = goPrev;
    NS.goNext = goNext;
    NS.getTurnKey = getTurnKey;
    NS.pickAllTurns = pickAllTurns;
    NS.isRealTurn = isRealTurn;
    NS.scrollToHead = scrollToHead;
})();
