// options.js — 設定画面（i18n.js/ shared.js に統一）
(() => {
  "use strict";

  const SH = window.CGTN_SHARED || {};
  const T = (k) => window.CGTN_I18N?.t?.(k) || k;

  const $ = (id) => document.getElementById(id);
  const exists = (id) => !!$(id);
  const clamp = (n, lo, hi) => Math.min(Math.max(Number(n), lo), hi);

  // !!!! ヘルパ追加
  const $inp = (id: string) =>
    document.getElementById(id) as HTMLInputElement | null;

  const val = (id: string) => $inp(id)?.value ?? "";
  const num = (id: string) => Number(val(id) || 0);
  const chk = (id: string) => !!$inp(id)?.checked;

  // 既定値（shared側の DEFAULTS があれば尊重）
  const DEF = SH.DEFAULTS || {
    centerBias: 0.4,
    eps: 20,
    lockMs: 700,
    showViz: false,
    list: { maxChars: 60, fontSize: 12 /* 他は不要 */ },
  };

  /* sync.set の Promise ラッパ（lastError を reject） */
  /* !!!!
  function syncSetAsync(obj){
    return new Promise((resolve, reject)=>{
      chrome.storage.sync.set(obj, ()=>{
        const err = chrome.runtime?.lastError;
        if (err) return reject(err);
        resolve();
      });
    });
  }
*/

  /* sync.set の Promise ラッパ（lastError を reject） */
  function syncSetAsync(obj: Record<string, unknown>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.sync.set(obj, () => {
        const err = chrome.runtime?.lastError;
        if (err) return reject(err);
        resolve(); // OK
      });
    });
  }

  /* 使用量（KB）＋アイテム数 を同時表示。i18n対応 */
  /* 使用量（KB）＋付箋付きチャット数 を同時表示。i18n対応 */
  async function updateSyncUsageLabel() {
    try {
      const el = document.getElementById("sync-usage");
      if (!el) return;

      // Promise化ヘルパ
      const getBytes = () =>
        new Promise((res) =>
          chrome.storage.sync.getBytesInUse(null, (b) => res(b || 0))
        );
      const getAll = () =>
        new Promise((res) =>
          chrome.storage.sync.get(null, (obj) => res(obj || {}))
        );

      const [bytesInUse, allItems] = await Promise.all([getBytes(), getAll()]);

      // const usedKB = (bytesInUse / 1024).toFixed(1); !!!!
      const bytes = typeof bytesInUse === "number" ? bytesInUse : 0;
      const usedKB = (bytes / 1024).toFixed(1);

      const totalKB = 100; // sync 全体上限=約100KB
      const itemsMax = 512 - 1; // sync のキー上限（共通キー除外）

      // ★ 付箋付きチャット数を正しく数える
      const pinKeys = Object.keys(allItems).filter((k) =>
        k.startsWith("cgtnPins::")
      );
      const pinChats = pinKeys.filter((k) => {
        const pins = allItems[k]?.pins;
        return Array.isArray(pins) && pins.some(Boolean);
      }).length;

      // i18n（無ければフォールバック）
      const t = window.CGTN_I18N?.t || ((s) => s);
      const usageLabel = t("options.syncUsage"); // 例: "sync使用量"
      const itemsLabel =
        t("options.itemsLabel") || // フォールバック
        "付箋付きチャット数";

      // 表示テキスト例:
      // "sync使用量 8.0KB / 100KB ・ 付箋付きチャット数 5 / 511"
      el.textContent = `${usageLabel} ${usedKB}KB / ${totalKB}KB ・ ${itemsLabel} ${pinChats} / ${itemsMax}`;
    } catch (e) {
      // 取れない場合は静かにスキップ
      console.warn("updateSyncUsageLabel failed", e);
    }
  }

  function sanitize(raw) {
    const base = JSON.parse(JSON.stringify(DEF));
    const v = {
      centerBias: clamp(raw?.centerBias ?? base.centerBias, 0, 1),
      headerPx: clamp(raw?.headerPx ?? base.headerPx, 0, 2000),
      eps: clamp(raw?.eps ?? base.eps, 0, 120),
      lockMs: clamp(raw?.lockMs ?? base.lockMs, 0, 3000),
      showViz: !!raw?.showViz,
      panel: raw?.panel || base.panel,
      list: {
        enabled: !!(raw?.list?.enabled ?? base.list.enabled),
        pinOnly: !!(raw?.list?.pinOnly ?? base.list.pinOnly),
        maxItems: clamp(raw?.list?.maxItems ?? base.list.maxItems, 1, 200),
        maxChars: clamp(raw?.list?.maxChars ?? base.list.maxChars, 10, 400),
        fontSize: clamp(raw?.list?.fontSize ?? base.list.fontSize, 8, 24),
        w: raw?.list?.w ?? base.list.w,
        h: raw?.list?.h ?? base.list.h,
        x: raw?.list?.x ?? base.list.x,
        y: raw?.list?.y ?? base.list.y,
      },
    };
    return v;
  }

  /* ボタンbusy制御（スピナー+タイムアウト） */
  /* !!!!  
  function setBusy(btn, on, { timeoutMs = 12000, onTimeout } = {}) {
    if (!btn) return;
    if (on) {
      if (btn.classList.contains("is-busy")) return;
      btn.dataset.base = (btn.textContent || "").trim();
      btn.classList.add("is-busy");
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      // タイムアウト保険
      const id = setTimeout(() => {
        clearBusy(btn);
        try {
          onTimeout?.();
        } catch (_) {}
      }, timeoutMs);
      btn.dataset.busyTimer = String(id);
    } else {
      clearBusy(btn);
    }
  }
*/
  type BusyOpts = {
    timeoutMs?: number;
    onTimeout?: () => void;
  };

  function setBusy(
    btn: HTMLButtonElement | null,
    on: boolean,
    { timeoutMs = 12000, onTimeout }: BusyOpts = {}
  ) {
    if (!btn) return;

    if (on) {
      if (btn.classList.contains("is-busy")) return;
      btn.dataset.base = (btn.textContent || "").trim();
      btn.classList.add("is-busy");
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");

      const id = window.setTimeout(() => {
        clearBusy(btn);
        try {
          onTimeout?.();
        } catch (_) {}
      }, timeoutMs);

      btn.dataset.busyTimer = String(id);
    } else {
      clearBusy(btn);
    }
  }
  function clearBusy(btn) {
    if (!btn) return;
    btn.classList.remove("is-busy");
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    const t = btn.dataset.busyTimer;
    if (t) {
      clearTimeout(Number(t));
      delete btn.dataset.busyTimer;
    }
    if (btn.dataset.base) btn.textContent = btn.dataset.base;
  }

  /* ここから追加：アクティブ ChatGPT タブへ送信 */
  function sendToActive(payload) {
    return new Promise((resolve) => {
      const urls = ["*://chatgpt.com/*", "*://chat.openai.com/*"];
      chrome.tabs.query(
        { url: urls, active: true, lastFocusedWindow: true },
        (tabs) => {
          const t = tabs?.[0];
          if (!t?.id) return resolve({ ok: false, reason: "no-tab" });
          chrome.tabs.sendMessage(t.id, payload, (res) => {
            if (chrome.runtime.lastError)
              return resolve({ ok: false, reason: "no-response" });
            resolve(res || { ok: false, reason: "empty" });
          });
        }
      );
    });
  }
  /* ここまで */

  /* !!!!
  function applyToUI(cfg) {
    const v = sanitize(cfg || {});
    try {
      if (exists("centerBias")) $("centerBias").value = v.centerBias;
      if (exists("headerPx")) $("headerPx").value = v.headerPx;
      if (exists("eps")) $("eps").value = v.eps;
      if (exists("lockMs")) $("lockMs").value = v.lockMs;
      if (exists("showViz")) $("showViz").checked = !!v.showViz;

      if (exists("listEnabled")) $("listEnabled").checked = !!v.list.enabled;
      if (exists("pinOnly")) $("pinOnly").checked = !!v.list.pinOnly;
      if (exists("listMaxItems")) $("listMaxItems").value = v.list.maxItems;
      if (exists("listMaxChars")) $("listMaxChars").value = v.list.maxChars;
      if (exists("listFontSize")) $("listFontSize").value = v.list.fontSize;
    } catch (e) {
      console.warn("applyToUI failed", e);
    }
  }
*/
  function applyToUI(cfg: unknown) {
    const v = sanitize(cfg || {});
    try {
      const setVal = (id: string, val: unknown) => {
        const el = $(id) as HTMLInputElement | null;
        if (el) el.value = String(val ?? "");
      };

      const setChk = (id: string, val: unknown) => {
        const el = $(id) as HTMLInputElement | null;
        if (el) el.checked = !!val;
      };

      setVal("centerBias", v.centerBias);
      setVal("headerPx", v.headerPx);
      setVal("eps", v.eps);
      setVal("lockMs", v.lockMs);
      setChk("showViz", v.showViz);

      setChk("listEnabled", v.list?.enabled);
      setChk("pinOnly", v.list?.pinOnly);
      setVal("listMaxItems", v.list?.maxItems);
      setVal("listMaxChars", v.list?.maxChars);
      setVal("listFontSize", v.list?.fontSize);
    } catch (e) {
      console.warn("applyToUI failed", e);
    }
  }
  /*
  function uiToCfg() {
    return sanitize({
      centerBias: $("centerBias")?.value,
      headerPx: $("headerPx")?.value,
      eps: $("eps")?.value,
      lockMs: $("lockMs")?.value,
      showViz: $("showViz")?.checked,
      list: {
        enabled: $("listEnabled")?.checked,
        pinOnly: $("pinOnly")?.checked,
        maxItems: $("listMaxItems")?.value,
        maxChars: $("listMaxChars")?.value,
        fontSize: $("listFontSize")?.value,
      },
    });
  }
*/

  function uiToCfg() {
    const val = (id: string) => ($(id) as HTMLInputElement | null)?.value;

    const chk = (id: string) => ($(id) as HTMLInputElement | null)?.checked;

    return sanitize({
      centerBias: val("centerBias"),
      headerPx: val("headerPx"),
      eps: val("eps"),
      lockMs: val("lockMs"),
      showViz: chk("showViz"),
      list: {
        enabled: chk("listEnabled"),
        pinOnly: chk("pinOnly"),
        maxItems: val("listMaxItems"),
        maxChars: val("listMaxChars"),
        fontSize: val("listFontSize"),
      },
    });
  }

  /* !!!!
  function applyI18N() {
    const T = window.CGTN_I18N?.t || ((s) => s);
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      const target = el.dataset.i18nTarget || "text"; // 'text' | 'placeholder' | 'title' | 'aria-label'
      const v = T(key);
      if (target === "placeholder") el.placeholder = v;
      else if (target === "title") el.title = v;
      else if (target === "aria-label") el.setAttribute("aria-label", v);
      else el.textContent = v;
    });
  }
  */
  function applyI18N() {
    const T = window.CGTN_I18N?.t || ((s: string) => s);

    document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n || "";
      const target = el.dataset.i18nTarget || "text"; // 'text' | 'placeholder' | 'title' | 'aria-label'
      const v = T(key);

      if (target === "placeholder") {
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          el.placeholder = v;
        } else {
          // 念のため：placeholder を持たない要素なら title に逃がす等
          el.setAttribute("title", v);
        }
      } else if (target === "title") {
        el.title = v;
      } else if (target === "aria-label") {
        el.setAttribute("aria-label", v);
      } else {
        el.textContent = v;
      }
    });
  }

  // --- pointer tracker（マウス/タッチの最後の位置を保持） ---
  let _lastPt = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  window.addEventListener(
    "mousemove",
    (e) => (_lastPt = { x: e.clientX, y: e.clientY }),
    { passive: true }
  );
  window.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches?.[0];
      if (t) _lastPt = { x: t.clientX, y: t.clientY };
    },
    { passive: true }
  );

  // --- near-pointer toast ---
  function toastNearPointer(msg, { ms = 1400, dx = 18, dy = -22 } = {}) {
    const host = document.getElementById("cgtn-floater");
    if (!host) return;

    // 画面端でははみ出さない程度にクランプ
    const x = Math.max(12, Math.min(window.innerWidth - 12, _lastPt.x + dx));
    const y = Math.max(12, Math.min(window.innerHeight - 12, _lastPt.y + dy));

    const el = document.createElement("div");
    el.className = "cgtn-toast";
    el.textContent = msg;
    el.style.left = x + "px";
    el.style.top = y + "px";
    host.appendChild(el);

    // フェードイン → 一定時間後フェードアウト＆削除
    requestAnimationFrame(() => el.classList.add("show"));
    const t1 = setTimeout(() => el.classList.remove("show"), ms);
    const t2 = setTimeout(() => {
      el.remove();
    }, ms + 220);
    // 参照持っておくなら el._timers = [t1,t2];
  }

  /* !!!!
  function flashMsgPins(key = "options.deleted") {
    const T = window.CGTN_I18N?.t || ((s) => s);
    const el = document.getElementById("msg-pins");
    if (!el) return;
    el.textContent = T(key);
    el.classList.add("show");
    clearTimeout(el._to);
    el._to = setTimeout(() => el.classList.remove("show"), 1600);
  }

  function flashMsgInline(id, key = "options.saved") {
    const T = window.CGTN_I18N?.t || ((s) => s);
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = T(key);
    el.classList.add("show");
    clearTimeout(el._to);
    el._to = setTimeout(() => el.classList.remove("show"), 1600);
  }
*/
  const flashTimers = new WeakMap<HTMLElement, number>();

  function flashMsgPins(key: string = "options.deleted") {
    const T = window.CGTN_I18N?.t || ((s: string) => s);
    const el = document.getElementById("msg-pins") as HTMLElement | null;
    if (!el) return;

    el.textContent = T(key);
    el.classList.add("show");

    const prev = flashTimers.get(el);
    if (prev) window.clearTimeout(prev);

    const id = window.setTimeout(() => el.classList.remove("show"), 1600);
    flashTimers.set(el, id);
  }

  function flashMsgInline(id: string, key: string = "options.saved") {
    const T = window.CGTN_I18N?.t || ((s: string) => s);
    const el = document.getElementById(id) as HTMLElement | null;
    if (!el) return;

    el.textContent = T(key);
    el.classList.add("show");

    const prev = flashTimers.get(el);
    if (prev) window.clearTimeout(prev);

    const tid = window.setTimeout(() => el.classList.remove("show"), 1600);
    flashTimers.set(el, tid);
  }

  /* 未使用  
  //エクスポート直前での正規化
  function onExportPinsClick() {
    const cfg = SH.getCFG() || {};
    //const pins = cfg.pinsByChat || {};
    const pins = getNormalizedPinsForOptions(cfg); // ★ゼロ件除去＋タイトル最新化
    //const norm = SH.normalizePinsByChat?.(raw, { dropZero: true, preferNewTitle: true }) || raw;

    const payload = { pinsByChat: pins };
    const blob = new Blob([JSON.stringify({ pinsByChat: pins }, null, 2)], {
      type: "application/json",
    });
    // 既存のダウンロード処理へ
    triggerDownload(blob, "pins_backup.json");
  }
*/
  //正規化ヘルパ
  // === pinsByChat を設定画面向けに正規化 ===
  // ・ゼロ件ピンは除外
  // ・タイトルは可能なら最新（getChatTitle or chatIndex.titles）に更新
  /* !!!!  
  function getNormalizedPinsForOptions(cfg) {
    const raw = (cfg && cfg.pinsByChat) || {};
    const out = {};
    const getTitle = (cid, rec) => {
      return (
        SH.getChatTitle?.(cid) ||
        cfg?.chatIndex?.titles?.[cid]?.title ||
        rec?.title ||
        "(No Title)"
      );
    };

    for (const [cid, rec] of Object.entries(raw)) {
      const pinsObj = rec?.pins || {};
      const count = Object.values(pinsObj).filter(Boolean).length;
      if (count === 0) continue; // ★ 0件は削除（表示・エクスポート対象外）
      out[cid] = { ...rec, title: getTitle(cid, rec) }; // ★ タイトルを最新へ
    }
    return out;
  }
*/

  function getNormalizedPinsForOptions(cfg: any) {
    const raw: Record<string, unknown> = (cfg && cfg.pinsByChat) || {};
    const out: Record<string, any> = {};

    const getTitle = (cid: string, rec: any) => {
      return (
        SH.getChatTitle?.(cid) ||
        cfg?.chatIndex?.titles?.[cid]?.title ||
        rec?.title ||
        "(No Title)"
      );
    };

    for (const [cid, recU] of Object.entries(raw)) {
      const rec = recU && typeof recU === "object" ? (recU as any) : null;
      if (!rec) continue;

      const pinsObj =
        rec.pins && typeof rec.pins === "object"
          ? (rec.pins as Record<string, unknown>)
          : {};

      const count = Object.values(pinsObj).filter(Boolean).length;
      if (count === 0) continue;

      out[cid] = { ...rec, title: getTitle(cid, rec) };
    }
    return out;
  }

  // 表示直前に“最新タイトルへ置換”してから描画
  async function renderPinsManager() {
    // 設定ロード（await で確実に完了させる）
    if (SH.loadSettings) await SH.loadSettings();

    // 新仕様：chatIdごとの分割キーを走査してmapを構築
    const all = await new Promise((res) => {
      try {
        chrome.storage.sync.get(null, (items) => res(items || {}));
      } catch {
        res({});
      }
    });
    const cfg = SH.getCFG?.() || {};
    const map = {};

    for (const [key, val] of Object.entries(all)) {
      if (!key.startsWith("cgtnPins::")) continue;

      const chatId = key.slice("cgtnPins::".length);
      const pinsArr = Array.isArray(val?.pins) ? val.pins : [];

      // ★ 実際の付箋数（1が立っている数）
      const pinsCount = pinsArr.filter(Boolean).length;

      // ★ pins 配列はあるが 1 が一つも無い = 付箋 0 件
      //   → 設定画面に出さず、ストレージからも削除しておく
      if (pinsCount === 0) {
        try {
          // 新方式のマップからも削除
          await SH.deletePinsForChatAsync?.(chatId);
        } catch (e) {
          console.warn(
            "[renderPinsManager] cleanup zero pins failed",
            chatId,
            e
          );
        }
        continue; // 一覧にも出さない
      }

      // ① 付箋データに保存されたタイトルを最優先
      const savedTitle = (val.title || "").trim();

      // ② インデックス（chatIndex.ids/map）にも同じCIDがあれば補完
      const live =
        cfg.chatIndex?.ids?.[chatId] || cfg.chatIndex?.map?.[chatId] || {};
      const proj = (live.project || live.folder || live.group || "").trim();
      const idxTitle = (live.title || "").trim();

      // ③ 優先度：savedTitle > idxTitle > fallback(CID)
      let title = savedTitle || idxTitle || chatId;
      if (proj) title = `[${proj}] ${title}`;

      map[chatId] = {
        pins: pinsArr,
        title,
        updatedAt: val.updatedAt || null,
      };
    }

    const tbody = document.getElementById("pins-tbody");
    if (!tbody) return;

    // サイドバーの“生存チャット索引”があれば補助で使う（無ければ空でOK）
    const liveIdx =
      (cfg.chatIndex && (cfg.chatIndex.ids || cfg.chatIndex.map)) || {};

    // 今開いているチャットID（options では基本 null でOK）
    const nowOpen = cfg.currentChatId ?? null;

    // ★ rows は配列のまま保持
    /* !!!!
    const rows = Object.entries(map)
      .map(([cid, rec]) => {
        const pinsArr = Array.isArray(rec?.pins) ? rec.pins : [];
        const turns = pinsArr.length; // ★ pinsArr の要素数が「会話数」
        const pinsCount = pinsArr.filter(Boolean).length;
        const t = SH.getTitleForChatId(cid, rec?.title || "");
        return {
          cid,
          title: t.slice(0, 120),
          turns,
          count: pinsCount,
          date: rec?.updatedAt ? new Date(rec.updatedAt).toLocaleString() : "",
        };
      })
      .sort((a, b) => b.count - a.count || (a.title > b.title ? 1 : -1));
    */

    // ★ rows は配列のまま保持
    const rows = Object.entries(map as Record<string, unknown>)
      .map(([cid, recU]) => {
        const rec = recU && typeof recU === "object" ? (recU as any) : {};

        const pinsArr = Array.isArray(rec.pins) ? (rec.pins as any[]) : [];
        const turns = pinsArr.length; // ★ pinsArr の要素数が「会話数」
        const pinsCount = pinsArr.filter(Boolean).length;

        const titleRaw = typeof rec.title === "string" ? rec.title : "";
        const t = SH.getTitleForChatId(cid, titleRaw);

        const date = rec.updatedAt
          ? new Date(rec.updatedAt as any).toLocaleString()
          : "";

        return {
          cid,
          title: t.slice(0, 120),
          turns,
          count: pinsCount,
          date,
        };
      })
      .sort((a, b) => b.count - a.count || (a.title > b.title ? 1 : -1));

    // 空
    if (!rows.length) {
      tbody.innerHTML = `
        <tr class="empty">
          <td colspan="4" style="padding:12px;color:var(--muted);">
            ${T("options.emptyPinsDesc") || "No pinned data."}
          </td>
        </tr>`;
      return;
    }

    // 新: tbody だけ差し替え
    const rowHtml = rows
      .map((r, i) => {
        const esc = (s) =>
          String(s ?? "").replace(
            /[&<>"']/g,
            (m) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              }[m])
          );
        const del =
          r.count > 0
            ? `<button class="btn del inline" data-cid="${esc(
                r.cid
              )}" title="${T("options.delBtn")}">🗑</button>`
            : "";
        return `
        <tr data-cid="${esc(r.cid)}">
          <td class="no">${i + 1}</td>
          <td class="title" title="${esc(r.title)}">${esc(r.title)}</td>
          <td class="turns" style="text-align:right">${r.turns}</td>
          <td class="count" style="text-align:right">${r.count}${del}</td>
          <td class="updated">${esc(r.date || "")}</td>
        </tr>`;
      })
      .join("");

    const pinsDelBound = new WeakSet<HTMLElement>(); // !!!!
    /* 
    tbody.innerHTML = rowHtml;

    // ← box 未定義対策＋スクロール
    const box = document.getElementById("pins-table");
    const wrap = box?.parentElement;
    if (wrap) wrap.classList.add("cgtn-pins-scroll");

    // 削除（tbody に委譲） — 二重バインド防止
    if (!tbody._cgtnDelBound) {
      tbody._cgtnDelBound = true;
      tbody.addEventListener("click", async (e) => {
        const btn = e.target.closest("button.del");
        if (!btn) return;
        const cid = btn.getAttribute("data-cid");
        if (!cid) return;
        // 共通の通知/再描画ロジックへ一本化
        deletePinsFromOptions(cid);
      });
    }

    // 「最新にします」（id=pins-refresh）
    const refreshBtn = document.getElementById("pins-refresh");
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        if (refreshBtn.classList.contains("is-busy")) return;
        setBusy(refreshBtn, true, {
          onTimeout: () =>
            flashMsgInline?.("pins-msg", "options.refreshTimeout"),
        });
        try {
          const meta = await sendToActive({ type: "cgtn:get-chat-meta" });
          if (meta?.ok) {
            const tr = box?.querySelector(`tr[data-cid="${meta.chatId}"]`);
            if (tr)
              tr.querySelector(".title").textContent =
                meta.title || meta.chatId;
          }
          try {
            updateSyncUsageLabel();
          } catch {}
          flashMsgInline?.("pins-msg", "options.refreshed");
        } catch (e) {
          console.warn(e);
          flashMsgInline?.("pins-msg", "options.refreshFailed");
        } finally {
          setBusy(refreshBtn, false);
        }
      };
    }*/
    tbody.innerHTML = rowHtml;

    // ← box 未定義対策＋スクロール
    const box = document.getElementById("pins-table") as HTMLElement | null;
    const wrap = box?.parentElement;
    if (wrap) wrap.classList.add("cgtn-pins-scroll");

    // 削除（tbody に委譲） — 二重バインド防止
    if (!pinsDelBound.has(tbody)) {
      pinsDelBound.add(tbody);

      tbody.addEventListener("click", async (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;

        const btn = target.closest("button.del") as HTMLButtonElement | null;
        if (!btn) return;

        const cid = btn.getAttribute("data-cid");
        if (!cid) return;

        // 共通の通知/再描画ロジックへ一本化
        deletePinsFromOptions(cid);
      });
    }

    // 「最新にします」（id=pins-refresh）
    const refreshBtn = document.getElementById(
      "pins-refresh"
    ) as HTMLButtonElement | null;
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        if (refreshBtn.classList.contains("is-busy")) return;

        setBusy(refreshBtn, true, {
          onTimeout: () =>
            flashMsgInline?.("pins-msg", "options.refreshTimeout"),
        });

        try {
          const metaU = await sendToActive({ type: "cgtn:get-chat-meta" });

          // meta は unknown 扱いなのでガード
          const meta =
            metaU && typeof metaU === "object" ? (metaU as any) : null;

          if (meta?.ok) {
            const chatId = typeof meta.chatId === "string" ? meta.chatId : "";
            const title = typeof meta.title === "string" ? meta.title : "";

            if (chatId) {
              const tr = box?.querySelector(
                `tr[data-cid="${chatId}"]`
              ) as HTMLElement | null;
              const titleEl = tr?.querySelector(".title") as HTMLElement | null;
              if (titleEl) titleEl.textContent = title || chatId;
            }
          }

          try {
            updateSyncUsageLabel();
          } catch {}

          flashMsgInline?.("pins-msg", "options.refreshed");
        } catch (e) {
          console.warn(e);
          flashMsgInline?.("pins-msg", "options.refreshFailed");
        } finally {
          setBusy(refreshBtn, false);
        }
      };
    }

    /* renderPinsManager ここまで */
  }

  function titleEscape(s) {
    return String(s || "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  }

  document.getElementById("lang-ja")?.addEventListener("click", () => {
    SH.setLang?.("ja"); // i18n.js にある setter を想定（無ければ自前で保持）
    applyI18N();
    // applyToUI(); !!!!
    applyToUI({});
    renderPinsManager();
    try {
      updateSyncUsageLabel();
    } catch (_) {}
  });
  document.getElementById("lang-en")?.addEventListener("click", () => {
    SH.setLang?.("en");
    applyI18N();
    // applyToUI(); !!!!
    applyToUI({});
    renderPinsManager();
    try {
      updateSyncUsageLabel();
    } catch (_) {}
  });

  /* !!!!
  document.getElementById("showViz")?.addEventListener("change", (ev) => {
    const on = !!ev.target.checked;

    // 1) 設定画面自身へ即時反映
    try {
      const cfgNow = (SH.getCFG && SH.getCFG()) || DEF;
      SH.renderViz?.(cfgNow, on);
    } catch {}
    // 2) 設定も保存（他と整合）
    //    SH.saveSettingsPatch?.({ showViz: on });
    // 3) ChatGPT タブにも反映を通知
    chrome.tabs.query(
      { url: ["*://chatgpt.com/*", "*://chat.openai.com/*"] },
      (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: "cgtn:viz-toggle", on });
        });
      }
    );
  });
  */

  document.getElementById("showViz")?.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;

    const on = !!t.checked;

    // 1) 設定画面自身へ即時反映
    try {
      const cfgNow = (SH.getCFG && SH.getCFG()) || DEF;
      SH.renderViz?.(cfgNow, on);
    } catch {}

    // 3) ChatGPT タブにも反映を通知
    chrome.tabs.query(
      { url: ["*://chatgpt.com/*", "*://chat.openai.com/*"] },
      (tabs) => {
        tabs.forEach((tab) => {
          if (!tab.id) return;
          chrome.tabs.sendMessage(tab.id, { type: "cgtn:viz-toggle", on });
        });
      }
    );
  });

  // 付箋データ削除
  async function deletePinsFromOptions(chatId) {
    const yes = confirm(
      T("options.delConfirm") || "Delete pins for this chat?"
    );
    if (!yes) return;

    /* 成功/失敗の分岐でUI処理を強化 */
    const ok = await SH.deletePinsForChat(chatId);
    //const ok = await SH.deletePinsForChatAsync(chatId);

    if (ok) {
      // ChatGPTタブへ同期通知（chatgpt.com と chat.openai.com の両方）
      try {
        const targets = ["*://chatgpt.com/*", "*://chat.openai.com/*"];
        chrome.tabs.query({ url: targets }, (tabs) => {
          tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, {
              type: "cgtn:pins-deleted",
              chatId,
            });
          });
        });
      } catch {}

      await renderPinsManager();

      // 使用量の再描画（KB/アイテム数）
      try {
        updateSyncUsageLabel?.();
      } catch (_) {}

      // 近くにポワン
      toastNearPointer(T("options.deleted") || "Deleted");
    } else {
      // 保存失敗（lastError など）→ UI でアラート/トースト
      try {
        toastNearPointer(T("options.saveFailed") || "Failed to save");
      } catch (_) {}
    }
  }

  // 初期化
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      // まず視覚ちらつき防止：showViz を一旦OFFにしてからロード
      /* !!!!
      const vizBox = document.getElementById("showViz");
      if (vizBox) vizBox.checked = false;
*/
      const vizBox = $inp("showViz");
      if (vizBox) vizBox.checked = false;

      // 設定ロード→UI反映
      //      await new Promise(res => (SH.loadSettings ? SH.loadSettings(res) : res()));
      // 設定ロード→UI反映（★まず sync から強制取得）
      if (SH.reloadFromSync) {
        await SH.reloadFromSync();
      } else {
        /*
        await new Promise((res) =>
          SH.loadSettings ? SH.loadSettings(res) : res()
        );
        */
        await new Promise<void>((res) =>
          SH.loadSettings ? SH.loadSettings(res) : res()
        );
      }

      const cfg = (SH.getCFG && SH.getCFG()) || DEF;
      applyToUI(cfg);
      applyI18N();
      try {
        SH.renderViz?.(cfg, !!cfg.showViz);
      } catch {}

      // 付箋テーブル
      await renderPinsManager();

      // 他タブ（content）からの更新通知を受けたら最新化
      if (chrome?.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener((msg) => {
          if (!msg || typeof msg.type !== "string") return;
          if (
            msg.type === "cgtn:pins-deleted" ||
            msg.type === "cgtn:pins-updated"
          ) {
            (async () => {
              try {
                await SH.reloadFromSync?.();
                await renderPinsManager();
                await updateSyncUsageLabel?.();
              } catch {}
            })();
          }
        });
      }

      try {
        await updateSyncUsageLabel();
      } catch {}

      /* 初期描画時に使用量ラベルを反映 */
      try {
        updateSyncUsageLabel();
      } catch (_) {}
      /* 言語切替で再描画（両対応） */
      if (window.CGTN_SHARED?.onLangChange) {
        window.CGTN_SHARED.onLangChange(updateSyncUsageLabel);
      } else {
        window.addEventListener("cgtn:lang-changed", updateSyncUsageLabel, {
          passive: true,
        });
      }

      const form = $("cgtn-options");
      // 入力で即保存
      /* !!!!
      form?.addEventListener("input", (ev) => {
        try {
          const c2 = uiToCfg();
          SH.saveSettingsPatch?.(c2);
          try {
            SH.renderViz?.(c2, undefined);
          } catch {}

          // 入力元に応じて表示箇所を切り替え
          const id = ev.target.id || "";
          if (id.startsWith("list")) {
            flashMsgInline("msg-list", "options.saved");
          } else if (["showViz", "centerBias", "eps", "lockMs"].includes(id)) {
            flashMsgInline("msg-adv", "options.saved");
          }
        } catch (e) {
          console.warn("input handler failed", e);
        }
      });*/

      form?.addEventListener("input", (ev) => {
        try {
          const c2 = uiToCfg();
          SH.saveSettingsPatch?.(c2);
          try {
            SH.renderViz?.(c2, undefined);
          } catch {}

          const t = ev.target;
          const id = t instanceof HTMLElement ? t.id || "" : "";
          if (id.startsWith("list")) {
            flashMsgInline("msg-list", "options.saved");
          } else if (["showViz", "centerBias", "eps", "lockMs"].includes(id)) {
            flashMsgInline("msg-adv", "options.saved");
          }
        } catch (e) {
          console.warn("input handler failed", e);
        }
      });

      // タブ復帰で再描画
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") renderPinsManager();
      });

      // 一覧セクションの保存
      /* !!!!
      document.getElementById("saveList")?.addEventListener("click", () => {
        const cur = SH.getCFG() || {};
        const patch = {
          list: {
            ...(cur.list || {}),
            maxChars: +document.getElementById("listMaxChars").value,
            fontSize: +document.getElementById("listFontSize").value,
          },
        };
        SH.saveSettingsPatch?.(patch, () =>
          flashMsgInline("msg-list", "options.saved")
        );
        // リスト幅　文字数から算出
        window.CGTN_LOGIC?.applyPanelWidthByChars?.(newMaxChars);
      });
      */
      document.getElementById("saveList")?.addEventListener("click", () => {
        const cur = SH.getCFG() || {};
        const newMaxChars = num("listMaxChars");
        const newFontSize = num("listFontSize");

        const patch = {
          list: {
            ...(cur.list || {}),
            maxChars: newMaxChars,
            fontSize: newFontSize,
          },
        };

        SH.saveSettingsPatch?.(patch, () =>
          flashMsgInline("msg-list", "options.saved")
        );

        // リスト幅　文字数から算出
        window.CGTN_LOGIC?.applyPanelWidthByChars?.(newMaxChars);
      });

      // 一覧セクション：規定に戻す（値を戻して保存）
      /* !!!!
      document.getElementById("resetList")?.addEventListener("click", () => {
        const cur = SH.getCFG() || {};
        const patch = {
          list: {
            ...(cur.list || {}),
            maxChars: DEF.list.maxChars,
            fontSize: DEF.list.fontSize,
          },
        };
        // UIも戻す
        document.getElementById("listMaxChars").value = patch.list.maxChars;
        document.getElementById("listFontSize").value = patch.list.fontSize;

        SH.saveSettingsPatch?.(patch, () =>
          flashMsgInline("msg-list", "options.reset")
        );
        // リスト幅　文字数から算出
        window.CGTN_LOGIC?.applyPanelWidthByChars?.(newMaxChars);
      });
      */

      document.getElementById("resetList")?.addEventListener("click", () => {
        const cur = SH.getCFG() || {};
        const patch = {
          list: {
            ...(cur.list || {}),
            maxChars: DEF.list.maxChars,
            fontSize: DEF.list.fontSize,
          },
        };

        // UIも戻す
        const maxCharsEl = $inp("listMaxChars");
        const fontSizeEl = $inp("listFontSize");
        if (maxCharsEl) maxCharsEl.value = String(patch.list.maxChars);
        if (fontSizeEl) fontSizeEl.value = String(patch.list.fontSize);

        SH.saveSettingsPatch?.(patch, () =>
          flashMsgInline("msg-list", "options.reset")
        );

        window.CGTN_LOGIC?.applyPanelWidthByChars?.(patch.list.maxChars);
      });

      // 詳細セクションの保存
      /* !!!!
      document.getElementById("saveAdv")?.addEventListener("click", () => {
        const patch = {
          showViz: !!document.getElementById("showViz").checked,
          centerBias: +document.getElementById("centerBias").value,
          eps: +document.getElementById("eps").value,
          lockMs: +document.getElementById("lockMs").value,
        };
        SH.saveSettingsPatch?.(patch, () => {
          try {
            SH.renderViz?.(patch, patch.showViz);
          } catch {}
          flashMsgInline("msg-adv", "options.saved");
        });
      });
      */

      document.getElementById("saveAdv")?.addEventListener("click", () => {
        const patch = {
          showViz: chk("showViz"),
          centerBias: num("centerBias"),
          eps: num("eps"),
          lockMs: num("lockMs"),
        };

        SH.saveSettingsPatch?.(patch, () => {
          try {
            SH.renderViz?.(patch, patch.showViz);
          } catch {}
          flashMsgInline("msg-adv", "options.saved");
        });
      });

      /* !!!!
      document.getElementById("resetAdv")?.addEventListener("click", () => {
        // 値戻し→保存…
        flashMsgInline("msg-adv", "options.reset");
      });

      // 詳細セクション：規定に戻す（値を戻して保存）
      document.getElementById("resetAdv")?.addEventListener("click", () => {
        // UIを既定に
        document.getElementById("showViz").checked = !!DEF.showViz;
        document.getElementById("centerBias").value = DEF.centerBias;
        document.getElementById("eps").value = DEF.eps;
        document.getElementById("lockMs").value = DEF.lockMs;

        const patch = {
          showViz: !!DEF.showViz,
          centerBias: DEF.centerBias,
          eps: DEF.eps,
          lockMs: DEF.lockMs,
        };
        SH.saveSettingsPatch?.(patch, () => {
          try {
            SH.renderViz?.(patch, patch.showViz);
          } catch {}
          flashMsgInline("msg-adv", "options.reset");
        });
      });
      */

      document.getElementById("resetAdv")?.addEventListener("click", () => {
        // UIを既定に
        const sv = $inp("showViz");
        if (sv) sv.checked = !!DEF.showViz;
        const cb = $inp("centerBias");
        if (cb) cb.value = String(DEF.centerBias);
        const ep = $inp("eps");
        if (ep) ep.value = String(DEF.eps);
        const lm = $inp("lockMs");
        if (lm) lm.value = String(DEF.lockMs);

        const patch = {
          showViz: !!DEF.showViz,
          centerBias: DEF.centerBias,
          eps: DEF.eps,
          lockMs: DEF.lockMs,
        };

        SH.saveSettingsPatch?.(patch, () => {
          try {
            SH.renderViz?.(patch, patch.showViz);
          } catch {}
          flashMsgInline("msg-adv", "options.reset");
        });
      });

      // Extension version 表示
      try {
        const m = chrome.runtime.getManifest();
        //         const ver = `${m.name} v${m.version}`;
        const ver = `${m.name} v${m.version} ${
          m.version_name ? "(" + m.version_name + ")" : ""
        }`.trim();

        const info = document.getElementById("buildInfo");
        if (info) info.textContent = ver;
      } catch (e) {
        console.warn("buildInfo failed", e);
      }

      const devFlashTimers = new WeakMap<HTMLElement, number>();

      // 開発用の軽いフラッシュ（本番ロジックがあれば不要）
      /*
      function devFlash(id, txt) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = txt;
        el.classList.add("show");
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove("show"), 1500);
      }
      */

      function devFlash(id: string, txt: string) {
        const el = document.getElementById(id) as HTMLElement | null;
        if (!el) return;
        el.textContent = txt;
        el.classList.add("show");

        const prev = devFlashTimers.get(el);
        if (prev) window.clearTimeout(prev);

        const tid = window.setTimeout(() => el.classList.remove("show"), 1500);
        devFlashTimers.set(el, tid);
      }

      //      document.addEventListener("DOMContentLoaded", () => {
      // 既存の save / reset ハンドラに組み込む or なければ仮で紐付け
      const L = (k) => window.CGTN_I18N?.t(k) || "";
      const msgSaved = L("options.saved") || "保存しました";
      const msgReset = L("options.reset") || "規定に戻しました";

      document
        .getElementById("saveList")
        ?.addEventListener("click", () => devFlash("msg-list", msgSaved));
      document
        .getElementById("resetList")
        ?.addEventListener("click", () => devFlash("msg-list", msgReset));
      document
        .getElementById("saveAdv")
        ?.addEventListener("click", () => devFlash("msg-adv", msgSaved));
      document
        .getElementById("resetAdv")
        ?.addEventListener("click", () => devFlash("msg-adv", msgReset));
      //      });
    } catch (e) {
      console.error("options init failed", e);
    }
  });
})();
