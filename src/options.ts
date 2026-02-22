// options.ts — 設定画面
(() => {
  "use strict";

  const SH = window.CGTN_SHARED || {};
  const T = (k) => window.CGTN_I18N?.t?.(k) || k;

  const $ = (id) => document.getElementById(id);
  const exists = (id) => !!$(id);
  const clamp = (n, lo, hi) => Math.min(Math.max(Number(n), lo), hi);

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
          chrome.storage.sync.getBytesInUse(null, (b) => res(b || 0)),
        );
      const getAll = () =>
        new Promise((res) =>
          chrome.storage.sync.get(null, (obj) => res(obj || {})),
        );

      const [bytesInUse, allItems] = await Promise.all([getBytes(), getAll()]);

      const bytes = typeof bytesInUse === "number" ? bytesInUse : 0;
      const usedKB = (bytes / 1024).toFixed(1);

      const totalKB = 100; // sync 全体上限=約100KB
      const itemsMax = 512 - 1; // sync のキー上限（共通キー除外）

      // ★ 付箋付きチャット数を正しく数える
      const pinKeys = Object.keys(allItems).filter((k) =>
        k.startsWith("cgtnPins::"),
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
      SH.logError("updateSyncUsageLabel failed", e);
    }
  }

  function sanitize(raw) {
    const base = JSON.parse(JSON.stringify(DEF));
    const v = {
      centerBias: clamp(raw?.centerBias ?? base.centerBias, 0, 1),
      headerPx: clamp(raw?.headerPx ?? base.headerPx, 0, 2000),
      eps: clamp(raw?.eps ?? base.eps, 0, 120),
      lockMs: clamp(raw?.lockMs ?? base.lockMs, 0, 3000),
      // ★追加 入力設定 2026.02.11
      sendKeyMethod: raw?.sendKeyMethod || base.sendKeyMethod,
      showViz: !!raw?.showViz,
      panel: raw?.panel || base.panel,
      list: {
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
  type BusyOpts = {
    timeoutMs?: number;
    onTimeout?: () => void;
  };

  function setBusy(
    btn: HTMLButtonElement | null,
    on: boolean,
    { timeoutMs = 12000, onTimeout }: BusyOpts = {},
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
        },
      );
    });
  }
  /* ここまで */
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
      // ★追加: 入力設定プルダウンへの反映 2026.02.11
      setVal("sendKeyMethod", v.sendKeyMethod || "enter");
      setChk("showViz", v.showViz);

      setChk("pinOnly", v.list?.pinOnly);
      setVal("listMaxItems", v.list?.maxItems);
      setVal("listMaxChars", v.list?.maxChars);
      setVal("listFontSize", v.list?.fontSize);
    } catch (e) {
      SH.logError("applyToUI failed", e);
    }
  }

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
    { passive: true },
  );
  window.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches?.[0];
      if (t) _lastPt = { x: t.clientX, y: t.clientY };
    },
    { passive: true },
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
          SH.logError(
            "[renderPinsManager] cleanup zero pins failed",
            chatId,
            e,
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
              })[m],
          );
        const del =
          r.count > 0
            ? `<button class="btn del inline" data-cid="${esc(
                r.cid,
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

    /*    const pinsDelBound = new WeakSet<HTMLElement>();*/
    tbody.innerHTML = rowHtml;

    // ← box 未定義対策＋スクロール
    const box = document.getElementById("pins-table") as HTMLElement | null;
    const wrap = box?.parentElement;
    if (wrap) wrap.classList.add("cgtn-pins-scroll");

    // ここでボタンにイベントを割り当て (これなら重複しません)
    const delButtons = tbody.querySelectorAll("button.del");
    delButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        // バブリング防止 (念のため)
        e.stopPropagation();

        const target = e.currentTarget as HTMLButtonElement; // button自身
        const cid = target.getAttribute("data-cid");

        if (cid) {
          deletePinsFromOptions(cid);
        }
      });
    });

    // 「最新にします」（id=pins-refresh）
    const refreshBtn = document.getElementById(
      "pins-refresh",
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
                `tr[data-cid="${chatId}"]`,
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
          SH.logError(e);
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
        })[c],
    );
  }

  document.getElementById("lang-ja")?.addEventListener("click", () => {
    SH.setLang?.("ja"); // i18n.js にある setter を想定（無ければ自前で保持）
    applyI18N();
    applyToUI({});
    renderPinsManager();
    try {
      updateSyncUsageLabel();
    } catch (_) {}
  });
  document.getElementById("lang-en")?.addEventListener("click", () => {
    SH.setLang?.("en");
    applyI18N();
    applyToUI({});
    renderPinsManager();
    try {
      updateSyncUsageLabel();
    } catch (_) {}
  });

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
      },
    );
  });

  // ========================================================
  // ★追加: 入力設定の即時反映 (changeイベント) 2026.02.11
  // ========================================================
  document.getElementById("sendKeyMethod")?.addEventListener("change", (ev) => {
    const target = ev.target as HTMLSelectElement;
    const val = target.value;

    // 1. パッチデータ作成
    const patch = { sendKeyMethod: val };

    // 2. ストレージへ保存
    SH.saveSettingsPatch?.(patch, () => {
      // 3. UIの「保存しました」メッセージを表示
      flashMsgInline("msg-adv", "options.saved");

      // 4. 開いているChatGPTタブへ即座に通知
      chrome.tabs.query(
        { url: ["*://chatgpt.com/*", "*://chat.openai.com/*"] },
        (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: "cgtn:settings-updated", // 汎用的な更新通知
                patch: patch,
              });
            }
          });
        },
      );
    });
  });
  // ========================================================

  // 付箋データ削除
  async function deletePinsFromOptions(chatId) {
    const yes = confirm(
      T("options.delConfirm") || "Delete pins for this chat?",
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

  // ========================================================
  // ★追加: 入力設定の即時反映 (changeイベント)
  // ========================================================
  document.getElementById("sendKeyMethod")?.addEventListener("change", (ev) => {
    const target = ev.target as HTMLSelectElement;
    const val = target.value;

    // 1. パッチデータ作成
    const patch = { sendKeyMethod: val };

    // 2. ストレージへ保存
    SH.saveSettingsPatch?.(patch, () => {
      // 3. UIの「保存しました」メッセージを表示
      flashMsgInline("msg-adv", "options.saved");

      // 4. 開いているChatGPTタブへ即座に通知
      chrome.tabs.query(
        { url: ["*://chatgpt.com/*", "*://chat.openai.com/*"] },
        (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: "cgtn:settings-updated", // 汎用的な更新通知
                patch: patch,
              });
            }
          });
        },
      );
    });
  });
  // ========================================================
  // =================================================================
  // ★追加: エクスポート・インポート (Backup / Restore)
  // =================================================================

  // --- Export ---
  document.getElementById("btn-export")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-export") as HTMLButtonElement;
    setBusy(btn, true);

    try {
      if (!SH.exportAllData) throw new Error("Export function missing");

      const data = await SH.exportAllData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;

      // ★修正: ローカル時間で日付文字列を作る
      // (new Date().toISOString() はUTCなので、日本だと9時間遅れて前日になりがち)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      a.download = `turn-navigator-backup-${dateStr}.json`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toastNearPointer(T("opts.exportSuccess") || "Exported!");
    } catch (e) {
      SH.logError("[option btn-export]export failed", e);
      alert("Export failed: " + e);
    } finally {
      setBusy(btn, false);
    }
  });

  // --- Import ---
  const inpFile = document.getElementById(
    "inp-import-file",
  ) as HTMLInputElement;
  const btnImport = document.getElementById("btn-import");

  // Importボタンを押したら、隠しファイル入力をクリックさせる
  btnImport?.addEventListener("click", () => {
    if (inpFile) {
      inpFile.value = ""; // 同じファイルを再度選べるようにリセット
      inpFile.click();
    }
  });

  // ファイルが選択されたら実行
  inpFile?.addEventListener("change", () => {
    const file = inpFile.files?.[0];
    if (!file) return;

    // 確認ダイアログ
    const msg =
      T("opts.importConfirm") ||
      "現在のデータを上書きしてインポートしますか？\n(この操作は取り消せません)";
    if (!confirm(msg)) return;

    const btn = document.getElementById("btn-import") as HTMLButtonElement;
    setBusy(btn, true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const json = JSON.parse(text);

        if (!SH.importData) {
          throw new Error("Import function not found in shared.js");
        }

        await SH.importData(json);

        alert(
          T("opts.importSuccess") || "インポート完了！ページをリロードします。",
        );
        location.reload();
      } catch (err) {
        SH.logError("[option btn-import]import failed", e);
        alert("Import Error: " + err);
        setBusy(btn, false);
      }
    };
    reader.readAsText(file);
  });

  // 初期化
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      // まず視覚ちらつき防止：showViz を一旦OFFにしてからロード
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
          SH.loadSettings ? SH.loadSettings(res) : res(),
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
          SH.logError("input handler failed", e);
        }
      });

      // タブ復帰で再描画
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") renderPinsManager();
      });

      // 一覧セクションの保存
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
          flashMsgInline("msg-list", "options.saved"),
        );

        // リスト幅　文字数から算出
        window.CGTN_LOGIC?.applyPanelWidthByChars?.(newMaxChars);
      });

      // 一覧セクション：規定に戻す（値を戻して保存）
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
          flashMsgInline("msg-list", "options.reset"),
        );

        window.CGTN_LOGIC?.applyPanelWidthByChars?.(patch.list.maxChars);
      });

      // 詳細セクションの保存
      document.getElementById("saveAdv")?.addEventListener("click", () => {
        const patch = {
          showViz: chk("showViz"),
          centerBias: num("centerBias"),
          eps: num("eps"),
          lockMs: num("lockMs"),
          // ★追加 入力設定 2026.02.11
          sendKeyMethod: val("sendKeyMethod"),
        };

        SH.saveSettingsPatch?.(patch, () => {
          try {
            SH.renderViz?.(patch, patch.showViz);
          } catch {}
          flashMsgInline("msg-adv", "options.saved");
        });
      });

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
        // ★追加 入力設定 2026.02.11
        const sk = $inp("sendKeyMethod");
        if (sk) sk.value = String(DEF.sendKeyMethod || "enter");

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
        SH.logError("buildInfo failed", e);
      }

      const devFlashTimers = new WeakMap<HTMLElement, number>();
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
      SH.logError("options init failed", e);
    }
  });

  // src/options.ts に追加

  // =================================================================
  // Debug Section
  // =================================================================
  const debugSection = document.getElementById("debug-section");
  const debugOutput = document.getElementById("debug-output");
  const btnRefresh = document.getElementById("btn-debug-refresh");
  const btnClear = document.getElementById("btn-debug-clear");

  // データ表示関数
  async function showDebugData() {
    if (!debugOutput) return;
    debugOutput.textContent = "Loading...";

    // ストレージから生データを取得
    chrome.storage.sync.get(null, (data: any) => {
      // 見やすく整形して表示
      const json = JSON.stringify(data, null, 2);
      debugOutput.textContent = json;

      // バージョンチェックのヒントを表示
      const ver = data.meta?.version;
      if (ver === 2) {
        debugOutput.style.borderLeft = "3px solid #4caf50"; // 緑線 (OK)
      } else {
        debugOutput.style.borderLeft = "3px solid #ff9800"; // オレンジ (古い)
      }
    });
  }

  // 展開したときにデータをロード
  debugSection?.addEventListener("toggle", (e) => {
    if ((debugSection as HTMLDetailsElement).open) {
      showDebugData();
    }
  });

  // リフレッシュボタン
  btnRefresh?.addEventListener("click", (e) => {
    e.stopPropagation(); // 閉じてしまわないように
    showDebugData();
  });

  // 全消去ボタン（Danger!）
  btnClear?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const msg =
      "【警告】\nストレージのデータを完全に消去します。\n設定も付箋もすべて初期状態に戻ります。\nよろしいですか？";
    if (confirm(msg)) {
      await new Promise<void>((r) => chrome.storage.sync.clear(r));
      alert("データを消去しました。\nページをリロードします。");
      location.reload();
    }
  });

  // Copyボタン
  document
    .getElementById("btn-debug-copy")
    ?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const text = document.getElementById("debug-output")?.textContent || "";
      try {
        await navigator.clipboard.writeText(text);
        const btn = e.target as HTMLButtonElement;
        const original = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = original), 1000);
      } catch (err) {
        SH.logError("Copy failed", err);
      }
    });
})();
