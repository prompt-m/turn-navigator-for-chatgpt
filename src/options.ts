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

  // ★修正: 既定値にテーマ設定を追加
  const DEF = SH.DEFAULTS || {
    theme: { mode: "auto" }, // 追加
    centerBias: 0.4,
    eps: 20,
    lockMs: 700,
    showViz: false,
    list: { maxChars: 30, fontSize: 12 },
    sendKeyMethod: "enter",
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

  async function updateSyncUsageLabel() {
    try {
      const el = document.getElementById("sync-usage");
      if (!el) return;

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

      const totalKB = 100;
      const itemsMax = 512 - 1;

      const pinKeys = Object.keys(allItems).filter((k) =>
        k.startsWith("cgtnPins::"),
      );
      const pinChats = pinKeys.filter((k) => {
        const pins = allItems[k]?.pins;
        return Array.isArray(pins) && pins.some(Boolean);
      }).length;

      const t = window.CGTN_I18N?.t || ((s) => s);
      const usageLabel = t("options.syncUsage") || "sync使用量";
      const itemsLabel = t("options.itemsLabel") || "付箋付きチャット数";

      el.textContent = `${usageLabel} ${usedKB}KB / ${totalKB}KB ・ ${itemsLabel} ${pinChats} / ${itemsMax}`;
    } catch (e) {
      SH.logError("updateSyncUsageLabel failed", e);
    }
  }

  // ★修正: サニタイズ処理にテーマ設定を追加
  function sanitize(raw) {
    const base = JSON.parse(JSON.stringify(DEF));
    const v = {
      theme: { mode: raw?.theme?.mode || base.theme.mode }, // 追加
      centerBias: clamp(raw?.centerBias ?? base.centerBias, 0, 1),
      headerPx: clamp(raw?.headerPx ?? base.headerPx, 0, 2000),
      eps: clamp(raw?.eps ?? base.eps, 0, 120),
      lockMs: clamp(raw?.lockMs ?? base.lockMs, 0, 3000),
      sendKeyMethod: raw?.sendKeyMethod || base.sendKeyMethod,
      showViz: !!raw?.showViz,
      panel: raw?.panel || base.panel,
      list: {
        enabled: chk("listEnabled"),
        pinOnly: !!(raw?.list?.pinOnly ?? base.list.pinOnly),
        maxItems: clamp(raw?.list?.maxItems ?? base.list.maxItems, 1, 200),
        // ★修正: 文字数の上限下限を実用的な範囲(10〜100)に
        maxChars: clamp(raw?.list?.maxChars ?? base.list.maxChars, 10, 100),
        // ★修正: フォントサイズを 10〜18 に制限！
        fontSize: clamp(raw?.list?.fontSize ?? base.list.fontSize, 10, 18),
        w: raw?.list?.w ?? base.list.w,
        h: raw?.list?.h ?? base.list.h,
        x: raw?.list?.x ?? base.list.x,
        y: raw?.list?.y ?? base.list.y,
      },
    };
    return v;
  }

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
      setVal("sendKeyMethod", v.sendKeyMethod || "enter");
      // ★修正: UIにテーマ設定を反映
      setVal("themeMode", v.theme?.mode || "auto");
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
      theme: { mode: val("themeMode") || "auto" }, // ★追加
      centerBias: val("centerBias"),
      headerPx: val("headerPx"),
      eps: val("eps"),
      lockMs: val("lockMs"),
      sendKeyMethod: val("sendKeyMethod"),
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
      const target = el.dataset.i18nTarget || "text";
      const v = T(key);

      if (target === "placeholder") {
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          el.placeholder = v;
        } else {
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

  function toastNearPointer(msg, { ms = 1400, dx = 18, dy = -22 } = {}) {
    const host = document.getElementById("cgtn-floater");
    if (!host) return;

    const x = Math.max(12, Math.min(window.innerWidth - 12, _lastPt.x + dx));
    const y = Math.max(12, Math.min(window.innerHeight - 12, _lastPt.y + dy));

    const el = document.createElement("div");
    el.className = "cgtn-toast";
    el.textContent = msg;
    el.style.left = x + "px";
    el.style.top = y + "px";
    host.appendChild(el);

    requestAnimationFrame(() => el.classList.add("show"));
    const t1 = setTimeout(() => el.classList.remove("show"), ms);
    const t2 = setTimeout(() => {
      el.remove();
    }, ms + 220);
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

  async function renderPinsManager() {
    if (SH.loadSettings) await SH.loadSettings();

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
      const pinsArr = Array.isArray((val as any)?.pins)
        ? (val as any).pins
        : [];

      const pinsCount = pinsArr.filter(Boolean).length;

      if (pinsCount === 0) {
        try {
          await SH.deletePinsForChatAsync?.(chatId);
        } catch (e) {
          SH.logError(
            "[renderPinsManager] cleanup zero pins failed",
            chatId,
            e,
          );
        }
        continue;
      }

      const savedTitle = ((val as any).title || "").trim();
      const live =
        cfg.chatIndex?.ids?.[chatId] || cfg.chatIndex?.map?.[chatId] || {};
      const proj = (live.project || live.folder || live.group || "").trim();
      const idxTitle = (live.title || "").trim();

      let title = savedTitle || idxTitle || chatId;
      if (proj) title = `[${proj}] ${title}`;

      map[chatId] = {
        pins: pinsArr,
        title,
        updatedAt: (val as any).updatedAt || null,
      };
    }

    const tbody = document.getElementById("pins-tbody");
    if (!tbody) return;

    const liveIdx =
      (cfg.chatIndex && (cfg.chatIndex.ids || cfg.chatIndex.map)) || {};
    const nowOpen = cfg.currentChatId ?? null;

    const rows = Object.entries(map as Record<string, unknown>)
      .map(([cid, recU]) => {
        const rec = recU && typeof recU === "object" ? (recU as any) : {};
        const pinsArr = Array.isArray(rec.pins) ? (rec.pins as any[]) : [];
        const turns = pinsArr.length;
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

    if (!rows.length) {
      tbody.innerHTML = `
        <tr class="empty">
          <td colspan="4" style="padding:12px;color:var(--muted);">
            ${T("options.emptyPinsDesc") || "No pinned data."}
          </td>
        </tr>`;
      return;
    }

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

    tbody.innerHTML = rowHtml;

    const box = document.getElementById("pins-table") as HTMLElement | null;
    const wrap = box?.parentElement;
    if (wrap) wrap.classList.add("cgtn-pins-scroll");

    const delButtons = tbody.querySelectorAll("button.del");
    delButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLButtonElement;
        const cid = target.getAttribute("data-cid");
        if (cid) {
          deletePinsFromOptions(cid);
        }
      });
    });

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
    SH.setLang?.("ja");
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
    try {
      const cfgNow = (SH.getCFG && SH.getCFG()) || DEF;
      SH.renderViz?.(cfgNow, on);
    } catch {}

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
  // ★統合・整理済: プルダウン類の即時反映 (changeイベント)
  // ========================================================
  const broadcastSettingsUpdate = (patch) => {
    SH.saveSettingsPatch?.(patch, () => {
      flashMsgInline("msg-adv", "options.saved");
      chrome.tabs.query(
        { url: ["*://chatgpt.com/*", "*://chat.openai.com/*"] },
        (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: "cgtn:settings-updated",
                patch: patch,
              });
            }
          });
        },
      );
    });
  };

  document.getElementById("sendKeyMethod")?.addEventListener("change", (ev) => {
    const target = ev.target as HTMLSelectElement;
    broadcastSettingsUpdate({ sendKeyMethod: target.value });
  });

  document.getElementById("themeMode")?.addEventListener("change", (ev) => {
    const target = ev.target as HTMLSelectElement;
    broadcastSettingsUpdate({ theme: { mode: target.value } });
  });
  // ========================================================

  async function deletePinsFromOptions(chatId) {
    const yes = confirm(
      T("options.delConfirm") || "Delete pins for this chat?",
    );
    if (!yes) return;

    const ok = await SH.deletePinsForChat(chatId);

    if (ok) {
      try {
        const targets = ["*://chatgpt.com/*", "*://chat.openai.com/*"];
        chrome.tabs.query({ url: targets }, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: "cgtn:pins-deleted",
                chatId,
              });
            }
          });
        });
      } catch {}

      await renderPinsManager();

      try {
        updateSyncUsageLabel?.();
      } catch (_) {}

      toastNearPointer(T("options.deleted") || "Deleted");
    } else {
      try {
        toastNearPointer(T("options.saveFailed") || "Failed to save");
      } catch (_) {}
    }
  }

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
      inpFile.value = "";
      inpFile.click();
    }
  });

  // ファイルが選択されたら実行
  inpFile?.addEventListener("change", () => {
    const file = inpFile.files?.[0];
    if (!file) return;

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
        SH.logError("[option btn-import]import failed", err);
        alert("Import Error: " + err);
        setBusy(btn, false);
      }
    };
    reader.readAsText(file);
  });

  // 初期化
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const vizBox = $inp("showViz");
      if (vizBox) vizBox.checked = false;

      if (SH.reloadFromSync) {
        await SH.reloadFromSync();
      } else {
        await new Promise<void>((res) =>
          SH.loadSettings ? SH.loadSettings(res) : res(),
        );
      }

      const cfg = (SH.getCFG && SH.getCFG()) || DEF;

      // ★修正: 読み込み直後にここでUIへ反映させる
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

      /* 初期描画時に使用量ラベルを反映 */
      try {
        await updateSyncUsageLabel();
      } catch {}

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

        window.CGTN_LOGIC?.applyPanelWidthByChars?.(newMaxChars);
      });

      document.getElementById("resetList")?.addEventListener("click", () => {
        const cur = SH.getCFG() || {};
        const patch = {
          list: {
            ...(cur.list || {}),
            maxChars: DEF.list.maxChars,
            fontSize: DEF.list.fontSize,
          },
        };

        const maxCharsEl = $inp("listMaxChars");
        const fontSizeEl = $inp("listFontSize");
        if (maxCharsEl) maxCharsEl.value = String(patch.list.maxChars);
        if (fontSizeEl) fontSizeEl.value = String(patch.list.fontSize);

        SH.saveSettingsPatch?.(patch, () =>
          flashMsgInline("msg-list", "options.reset"),
        );

        window.CGTN_LOGIC?.applyPanelWidthByChars?.(patch.list.maxChars);
      });

      // ★修正: 詳細設定の保存ボタン
      document.getElementById("saveAdv")?.addEventListener("click", () => {
        const patch = {
          theme: { mode: val("themeMode") || "auto" }, // 追加
          showViz: chk("showViz"),
          centerBias: num("centerBias"),
          eps: num("eps"),
          lockMs: num("lockMs"),
          sendKeyMethod: val("sendKeyMethod"),
        };

        SH.saveSettingsPatch?.(patch, () => {
          try {
            SH.renderViz?.(patch, patch.showViz);
          } catch {}
          flashMsgInline("msg-adv", "options.saved");
        });
      });

      // ★修正: 詳細設定の規定に戻すボタン
      document.getElementById("resetAdv")?.addEventListener("click", () => {
        const sv = $inp("showViz");
        if (sv) sv.checked = !!DEF.showViz;
        const cb = $inp("centerBias");
        if (cb) cb.value = String(DEF.centerBias);
        const ep = $inp("eps");
        if (ep) ep.value = String(DEF.eps);
        const lm = $inp("lockMs");
        if (lm) lm.value = String(DEF.lockMs);
        const sk = $inp("sendKeyMethod");
        if (sk) sk.value = String(DEF.sendKeyMethod || "enter");
        const tm = $inp("themeMode"); // 追加
        if (tm) tm.value = "auto"; // 追加

        const patch = {
          theme: { mode: "auto" }, // 追加
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

      try {
        const m = chrome.runtime.getManifest();
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
    } catch (e) {
      SH.logError("options init failed", e);
    }
  });

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

    chrome.storage.sync.get(null, (data: any) => {
      const json = JSON.stringify(data, null, 2);
      debugOutput.textContent = json;

      const ver = data.meta?.version;
      if (ver === 2) {
        debugOutput.style.borderLeft = "3px solid #4caf50";
      } else {
        debugOutput.style.borderLeft = "3px solid #ff9800";
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
    e.stopPropagation();
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
