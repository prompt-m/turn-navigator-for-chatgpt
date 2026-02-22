// shared.ts — 設定の既定値/保存、基準線API、グローバル公開
(() => {
  "use strict";

  // 公開用オブジェクト
  const SH = (window.CGTN_SHARED = window.CGTN_SHARED || {});

  // =================================================================
  // ★追加: 共通ログシステム (Flight Recorder)
  // =================================================================
  const MAX_LOGS = 100;
  const logs = []; // ローカル変数としても保持
  SH.logs = logs; // 公開

  /**
   * ログ追加 (どこからでも SH.addLog(...) で呼べます)
   */
  SH.addLog = function (msg, level = "INFO") {
    const now = new Date();
    const time =
      now.toLocaleTimeString("ja-JP", { hour12: false }) +
      "." +
      String(now.getMilliseconds()).padStart(3, "0");

    // コンソール出力
    if (level === "ERROR") console.error(`[CGTN] ${msg}`);
    else if (level === "WARN") console.warn(`[CGTN] ${msg}`);
    else if (level === "DEBUG")
      console.debug(`[CGTN] ${msg}`); // ★追加: debug出力
    else console.log(`[CGTN] ${msg}`);

    // 保存
    const prefix =
      level === "ERROR"
        ? "❌ [ERROR]"
        : level === "WARN"
          ? "⚠️ [WARN]"
          : level === "DEBUG"
            ? "🐛 [DEBUG]" // ★追加: デバッグ用アイコン
            : `[${level}]`;

    const entry = `[${time}] ${prefix} ${msg}`;

    SH.logs.push(entry);
    // MAX_LOGS は shared.ts 内で定義されている前提です
    if (SH.logs.length > (typeof MAX_LOGS !== "undefined" ? MAX_LOGS : 200)) {
      SH.logs.shift();
    }
  };

  const t = (key) => window.CGTN_I18N?.t?.(key) || key;
  window.CGTN_SHARED = Object.assign(window.CGTN_SHARED || {}, { t });

  // メモリCFG
  let CFG = window.CGTN_SHARED?._BOOT_CFG || {};

  // 公開アクセサ
  function setCFG(next) {
    CFG = next && typeof next === "object" ? next : {};
    return CFG;
  }
  function getCFG() {
    return CFG;
  }

  SH.getCFG = getCFG;
  SH.setCFG = setCFG;

  type StorageAll = { cgNavSettings?: any } & Record<string, any>;

  async function loadSettings(cb?: (cfg: any) => void) {
    const all = await new Promise<StorageAll>((resolve) =>
      chrome.storage.sync.get(null, resolve),
    );

    const fileCfg = all?.cgNavSettings ?? {};
    CFG = Object.assign(structuredClone(DEFAULTS), fileCfg);
    try {
      //cb && cb(CFG); !!!!
      cb?.(CFG);
    } catch {}
    try {
      SH.markLoaded?.();
    } catch {}
    return CFG;
  }

  // --- boot loaded gate ---
  let _loaded = false;
  const _resolves: Array<() => void> = [];
  SH.whenLoaded = (): Promise<void> =>
    _loaded ? Promise.resolve() : new Promise<void>((r) => _resolves.push(r));

  SH.markLoaded = () => {
    if (_loaded) return;
    _loaded = true;
    const list = _resolves.splice(0);
    for (const fn of list) {
      try {
        fn();
      } catch {}
    }
  };

  // ======= 「死に際」フラグ（storage書き込み抑止） =======
  let _dying = false;
  addEventListener(
    "pagehide",
    () => {
      _dying = true;
    },
    { once: true },
  );
  addEventListener(
    "unload",
    () => {
      _dying = true;
    },
    { once: true },
  );

  const canUseStorage = () =>
    !!(chrome?.runtime?.id && chrome?.storage?.sync) && !_dying;

  let __PAGE_INFO = { kind: "other", cid: "", hasTurns: false };
  SH.setPageInfo = (x) => {
    __PAGE_INFO = Object.assign({}, __PAGE_INFO, x || {});
  };
  SH.getPageInfo = () => __PAGE_INFO;

  // === 既定値（options / content と完全一致） ===
  const DEFAULTS = Object.freeze({
    // ★追加: Navigate機能のON/OFF記憶 (true=ON)
    navEnabled: true,
    centerBias: 0.4,
    headerPx: 0,
    eps: 20,
    lockMs: 700,
    showViz: false,
    panel: { x: null, y: null },
    list: {
      //      enabled: false,
      maxItems: 30,
      maxChars: 40,
      fontSize: 12,
      pinOnly: false,
      // 将来のためのサイズ保存（なければ null）
      w: null,
      h: null,
      x: null,
      y: null,
    },
    //    pins: {}, // ← 付箋（key: true）
    // 入力設定表示 2026.02.11
    // "enter" | "ctrl_enter" | "shift_enter"
    sendKeyMethod: "enter",
  });

  // ---- storage util（拡張リロード中ガード）----
  async function syncGet(keys: any) {
    if (!chrome?.runtime?.id || !chrome?.storage?.sync)
      throw new Error("ext-context-lost");
    return await new Promise<any>((res, rej) =>
      chrome.storage.sync.get(keys ?? null, (v) => {
        const e = chrome.runtime.lastError;
        if (e) rej(e);
        else res(v);
      }),
    );
  }

  //async function syncSet(obj) { !!!!
  async function syncSet(obj: any): Promise<void> {
    if (!chrome?.runtime?.id || !chrome?.storage?.sync)
      throw new Error("ext-context-lost");
    return await new Promise((res, rej) =>
      chrome.storage.sync.set(obj, () => {
        const e = chrome.runtime.lastError;
        if (e) rej(e);
        else res();
      }),
    );
  }

  // === keys & wrappers ===
  const KEY_CFG = "cgNavSettings";
  const KEY_PINS = (id) => `cgtn:pins:${id}`;
  const PINS_KEY_PREFIX = "cgtnPins::";
  const pinKeyOf = (chatId) => `${PINS_KEY_PREFIX}${chatId}`;

  async function syncGetAsync(keys) {
    return await new Promise((res, rej) => {
      chrome.storage.sync.get(keys, (obj) => {
        const err = chrome.runtime?.lastError;
        if (err) return rej(err);
        res(obj || {});
      });
    });
  }

  //async function syncSetAsync(obj) { !!!!
  async function syncSetAsync(obj: any): Promise<void> {
    return await new Promise((res, rej) => {
      chrome.storage.sync.set(obj, () => {
        const err = chrome.runtime?.lastError;
        if (err) return rej(err);
        res();
      });
    });
  }

  //async function syncRemoveAsync(keys) { !!!!
  async function syncRemoveAsync(keys: any): Promise<void> {
    return await new Promise((res, rej) => {
      chrome.storage.sync.remove(keys, () => {
        const err = chrome.runtime?.lastError;
        if (err) return rej(err);
        res();
      });
    });
  }

  SH.syncSetAsync = syncSetAsync; // 既存の名前空間にあわせて

  // === sync から最新を強制ロードしてメモリCFGに反映 ===
  SH.reloadFromSync = async function () {
    if (!chrome?.storage?.sync) return SH.getCFG?.() || {};

    const all = await new Promise<StorageAll>((resolve) =>
      chrome.storage.sync.get(null, resolve),
    );

    const cfg = all?.cgNavSettings ?? {};
    try {
      setCFG(cfg);
    } catch {}
    return cfg;
  };

  // いまのタブのチャットIDとタイトルを保存（pinsByChat / chatIndex を同時に更新）
  SH.setChatTitleForId = function (chatId, title) {
    if (!chatId) return;
    const cfg = SH.getCFG() || {};
    const byChat = cfg.pinsByChat || {};
    const rec = byChat[chatId] || {};
    const now = Date.now();

    // pinsByChat 側のタイトルを“最新で”上書き（空なら残ってしまうので newTitle→oldTitle の順）
    const newTitle = (title || "").trim();
    const oldTitle = (rec.title || "").trim();
    const nextTitle = newTitle || oldTitle || "(No Title)";

    byChat[chatId] = {
      ...rec,
      title: nextTitle,
      updatedAt: now,
      pins: rec.pins || {}, // 既存ピンは維持
    };

    // chatIndex（設定画面で参照する“現在の一覧”）も同期
    const idx = cfg.chatIndex || {};
    const ids = idx.ids || {};
    ids[chatId] = { title: nextTitle, updatedAt: now };

    SH.saveSettingsPatch({ pinsByChat: byChat, chatIndex: { ...idx, ids } });
    // 付箋バッジ・チャット名
    window.CGTN_LOGIC?.updatePinOnlyBadge?.();
    window.CGTN_LOGIC?.updateListChatTitle?.();
  };
  // ドキュメントタイトルを使って現在チャットの名前を更新
  SH.refreshCurrentChatTitle = function () {
    try {
      const id = SH.getChatId && SH.getChatId();
      const title = (document.title || "").trim();
      if (id && title && title !== "ChatGPT") SH.setChatTitleForId(id, title);
    } catch {}
  };

  // shared.js に追記（削除しない）
  SH.normalizePinsByChat = function (
    pinsByChat,
    { dropZero = true, preferNewTitle = true } = {},
  ) {
    const map = { ...(pinsByChat || {}) };
    for (const id of Object.keys(map)) {
      const pins = map[id]?.pins || [];
      // 1) ゼロ件は削除
      if (dropZero && pins.length === 0) {
        delete map[id];
        continue;
      }
      // 2) タイトルの最新化
      if (preferNewTitle) {
        const oldTitle = map[id]?.title || "";
        const newTitle = SH.getChatTitle?.(id) || ""; // 取れない環境なら '' のまま
        const title = newTitle || oldTitle || "(No Title)";
        map[id] = { ...map[id], title };
      }
    }
    return map;
  };
  /* !!!!
  SH.dumpPinsIndex = function () {
    const cfg = SH.getCFG?.() || {};
    const map = cfg.pinsByChat || {};
    const out = Object.entries(map).map(([id, rec]) => ({
      id,
      title: rec?.title,
      pinCount: Array.isArray(rec?.pins)
        ? rec.pins.filter(Boolean).length
        : Object.values(rec?.pins || {}).filter(Boolean).length,
      updatedAt: rec?.updatedAt,
    }));
    console.table(out);
    return out;
  };
*/

  SH.dumpPinsIndex = function () {
    const cfg: any = SH.getCFG?.() || {};
    const map: Record<string, any> = cfg.pinsByChat || {};

    const out = Object.entries(map).map(([id, rec]) => {
      const r = rec as any;
      return {
        id,
        title: r?.title,
        pinCount: Array.isArray(r?.pins)
          ? r.pins.filter(Boolean).length
          : Object.values(r?.pins || {}).filter(Boolean).length,
        updatedAt: r?.updatedAt,
      };
    });

    console.table(out);
    return out;
  };

  // === pinsByChat 保存レイヤ ===
  // chatId の抽出（/c/<id> を最優先、なければパス全体をフォールバック）
  SH.getChatId = function () {
    try {
      const m = (location.pathname || "").match(/\/c\/([a-z0-9-]+)/i);
      if (m) return m[1];
      // Copilot/Gemini 等への将来拡張のための素朴フォールバック
      return (location.host + location.pathname).toLowerCase();
    } catch {
      return "unknown";
    }
  };

  SH.getChatTitle = function () {
    try {
      const docTitle = (document.title || "").trim();
      return docTitle;
    } catch (e) {
      SH.logError("[getChatTitle] error", e);
      return "";
    }
  };

  function _ensurePinsByChat(cfg) {
    cfg.pinsByChat = cfg.pinsByChat || {};
    return cfg.pinsByChat;
  }

  // 取得
  SH.getPinsForChat = function (chatId = SH.getChatId()) {
    const cfg = SH.getCFG?.() || {};
    const map = _ensurePinsByChat(cfg);
    return map[chatId]?.pins || {};
  };

  // 上書き保存

  SH.setPinsForChat = function (pinsObj, chatId = SH.getChatId()) {
    const pinsCount = Object.values(pinsObj || {}).filter(Boolean).length;
    if (pinsCount === 0) return; // ← 空なら保存しない

    const cfg = SH.getCFG?.() || {};
    const map = cfg.pinsByChat || {};
    const title = SH.getChatTitle?.() || map[chatId]?.title || "";

    map[chatId] = {
      pins: { ...(pinsObj || {}) },
      title,
      updatedAt: Date.now(),
    };
    SH.saveSettingsPatch?.({ pinsByChat: map });
  };

  // 件数
  SH.countPinsForChat = function (chatId = SH.getChatId()) {
    const cur = SH.getPinsForChat(chatId);
    //console.debug('[getPinsForChat] chat=%s count=%d',chatId, Object.keys((CFG.pinsByChat?.[chatId]?.pins)||{}).length);
    return Object.keys(cur).length;
  };

  // メタだけ更新（タイトル刷新等）
  SH.touchChatMeta = function (
    chatId = SH.getChatId(),
    title = SH.getChatTitle(),
  ) {
    const cfg = SH.getCFG?.() || {};
    const map = cfg.pinsByChat || {};
    const rec = map[chatId];
    if (!rec) {
      console.debug("[touchChatMeta] skipped: no record", { chatId, title });
      return;
    }

    const oldTitle = rec.title || "";
    //const picked   = oldTitle || title || '(No Title)';
    const picked = (title && title.trim()) || oldTitle || "(No Title)";

    // ★計測ログ：上書き検知
    if (picked !== oldTitle) {
      console.debug(
        "[touchChatMeta] title change intent",
        {
          chatId,
          oldTitle,
          titleCandidate: title,
          result: picked,
          path: location.pathname,
          time: new Date().toISOString(),
        },
        new Error("trace").stack?.split("\n").slice(1, 4).join("\n"),
      );
    } else {
      console.debug("[touchChatMeta] keep title", { chatId, oldTitle });
    }

    map[chatId] = {
      pins: rec.pins || {},
      title: picked,
      updatedAt: Date.now(),
    };

    SH.saveSettingsPatch?.({ pinsByChat: map });
  };

  // 言語判定の委譲（UI側で変えられるようフックを用意）
  let langResolver = null;
  SH.setLangResolver = (fn) => {
    langResolver = fn;
  };
  SH.setLang = (lang) => window.CGTN_I18N?.setLang?.(lang);

  function curLang() {
    try {
      // ★ 最優先：拡張UIが公開する現在言語
      const u = SH.getLang?.();
      const ur = String(u).toLowerCase();
      if (u) return ur;

      // 互換：従来の resolver もサポート
      const r = langResolver?.();
      if (r) return String(r).toLowerCase();

      const cfg = SH.getCFG?.() || {};
      if (cfg.lang) {
        return String(cfg.lang).toLowerCase();
      }
      if (cfg.english) {
        return "en";
      }
      return String(document.documentElement.lang || "ja").toLowerCase();
    } catch {
      return "ja";
    }
  }

  // --- 内部変数 ---
  const _registrations = []; // ツールチップの登録場所
  const _langHooks = new Set<() => void>();

  /** 言語切替時に再実行したい処理を登録 (content.tsなどが使用) */
  SH.onLangChange = function onLangChange(fn) {
    if (typeof fn === "function") _langHooks.add(fn);
  };

  /** 内部用: 指定されたルート以下のツールチップを一括適用 */
  SH.applyTooltipsToRoot = function (root, pairs) {
    // 翻訳関数 (無ければキーをそのまま返す)
    const T = SH.T || SH.t || ((k) => k);

    Object.entries(pairs || {}).forEach(([sel, key]) => {
      // セレクタに一致する要素をすべて探す
      const targets = root.querySelectorAll ? root.querySelectorAll(sel) : [];

      targets.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;

        const txt = T(key);
        if (txt) {
          // 1. title属性（マウスホバー用）
          el.title = txt;

          // 2. aria-label属性（読み上げ用）
          // もともと持っている要素なら更新してあげる
          if (el.hasAttribute("aria-label")) {
            el.setAttribute("aria-label", txt);
          }
        }
      });
    });
  };

  /** 新規登録 & 初回適用 (installUIなどで使用) */
  SH.applyTooltips = function (pairs, root = document) {
    if (!pairs) return;
    // 履歴に保存（あとで言語切替時に使うため）
    _registrations.push({ root, pairs });
    // 今すぐ適用
    SH.applyTooltipsToRoot(root, pairs);
  };

  /** 再適用 (言語切替時に ui.ts から呼ばれる) */
  SH.updateTooltips = function () {
    // 1. 登録済みツールチップの一斉更新
    _registrations.forEach(({ root, pairs }) => {
      SH.applyTooltipsToRoot(root, pairs);
    });

    // 2. ★重要: 登録されたフック処理を実行 (SetなのでforEachでOK)
    if (_langHooks && _langHooks.size > 0) {
      _langHooks.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          SH.logError("onLangChange hook failed", e);
        }
      });
    }
  };

  const isNum = (v) => Number.isFinite(Number(v));
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
  function deepMerge(dst, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k]))
        dst[k] = deepMerge(dst[k] || {}, src[k]);
      else if (src[k] !== undefined) dst[k] = src[k];
    }
    return dst;
  }

  SH.migratePinsStorageOnce = async function () {
    const cfg: any = SH.getCFG?.() || {};
    if (!cfg.pinsByChat) return; // 既に移行済み

    const map: Record<string, any> = cfg.pinsByChat || {};
    const idx = (cfg.pinsIndex = cfg.pinsIndex || {});

    for (const [cid, rec] of Object.entries(map)) {
      const r = rec as any;

      const arr = Array.isArray(r?.pins) ? r.pins : [];
      const pins = arr.map((v: any) => (!!v ? 1 : 0));

      const k = KEY_PINS(cid);
      await syncSetAsync({ [k]: pins });
      idx[cid] = { count: pins.filter(Boolean).length, updatedAt: Date.now() };
    }

    delete cfg.pinsByChat;
    SH.setCFG?.(cfg);
    await syncSetAsync({ [KEY_CFG]: cfg });
  };

  function cleanupZeroPinRecords() {
    const cfg: any = SH.getCFG() || {};
    const map: Record<string, any> = { ...(cfg.pinsByChat || {}) };

    let changed = false;
    for (const [cid, rec] of Object.entries(map)) {
      const r = rec as any;

      const pins = Array.isArray(r?.pins)
        ? r.pins
        : Object.values(r?.pins || {});

      if (!pins.some(Boolean)) {
        delete map[cid];
        changed = true;
      }
    }

    if (changed) SH.saveSettingsPatch({ pinsByChat: map });
  }

  // ===== 新仕様 =====
  // ===== Pins storage helpers (options画面・管理用) =====
  async function _loadCfgRaw() {
    return new Promise((res) => {
      try {
        chrome.storage.sync.get("cgNavSettings", ({ cgNavSettings }) => {
          res(cgNavSettings || {});
        });
      } catch {
        res({});
      }
    });
  }
  async function _saveCfgRaw(next) {
    return new Promise((res, rej) => {
      try {
        chrome.storage.sync.set({ cgNavSettings: next }, () => res(true));
      } catch (e) {
        rej(e);
      }
    });
  }

  SH.loadPinsMapAsync = async function loadPinsMapAsync() {
    const cfg: any = await _loadCfgRaw();
    const map = cfg?.pinsByChat || {};
    return map; // { [chatId]: boolean[] }
  };

  SH.savePinsMapAsync = async function savePinsMapAsync(nextMap: any) {
    const cfg: any = await _loadCfgRaw();
    cfg.pinsByChat = nextMap || {};
    await _saveCfgRaw(cfg);
    return true;
  };

  SH.setPinsArrAsync = async function setPinsArrAsync(chatId, pinsArr) {
    //console.log("◎setPinsArrAsync◎ :chatId", chatId, " pinsArr:", pinsArr);
    const map = await SH.loadPinsMapAsync();
    if (pinsArr && pinsArr.length) map[chatId] = pinsArr;
    else delete map[chatId];
    await SH.savePinsMapAsync(map);
    return true;
  };

  // 読み出しは同期しても良いけど、呼び元の都合上 sync版も提供
  SH.getPinsArr = function getPinsArr(chatId = SH.getChatId?.()) {
    // 非同期を使えない箇所のためのフォールバック（空配列）
    SH.logError(
      "[getPinsArr] sync path returns empty if not cached; prefer getPinsArrAsync",
    );
    return [];
  };

  SH.getPinsArrAsync = async function (chatId = SH.getChatId?.()) {
    if (!chatId) return [];
    try {
      const obj = await syncGet(pinKeyOf(chatId));
      const rec = obj?.[pinKeyOf(chatId)];
      const arr = Array.isArray(rec?.pins) ? rec.pins : [];
      return arr.slice();
    } catch (_) {
      return [];
    }
  };

  // 付箋データ保存
  SH.savePinsArr = async function savePinsArr(arr, chatId = SH.getChatId?.()) {
    if (!chatId) return { ok: false, err: "no-chat-id" };
    const pins = Array.isArray(arr) ? arr.slice() : [];
    const title = await SH.resolveTitleFor(chatId);
    await syncSet({
      [pinKeyOf(chatId)]: { pins, updatedAt: Date.now(), title },
    });

    try {
      await syncSet({ [pinKeyOf(chatId)]: { pins } });
      // インデックスの pinCount だけ更新
      const cfg = SH.getCFG() || {};
      const cnt = pins.filter(Boolean).length;
      const idx =
        cfg.chatIndex?.map || (cfg.chatIndex = { ids: [], map: {} }).map;
      idx[chatId] = {
        ...(idx[chatId] || {}),
        pinCount: cnt,
        updated: Date.now(),
      };
      await syncSet({ cgNavSettings: cfg });

      // ★計測ログ
      console.debug(
        "[savePinsArr] about to save",
        {
          chatId,
          pinsCount: cnt,
          path: location.pathname,
          time: new Date().toISOString(),
        },
        new Error("trace").stack?.split("\n").slice(1, 4).join("\n"),
      );

      return { ok: true };
    } catch (err) {
      SH.logError("[savePinsArr] failed:", err);
      return { ok: false, err };
    }
  };

  // 付箋データ保存
  SH.savePinsArrAsync = async (arr, chatId = SH.getChatId?.()) => {
    if (!chatId) return { ok: false };
    const key = pinKeyOf(chatId);
    try {
      //      await syncSet({ [key]: { pins: arr } });
      // ★安全策: 受け取った配列を必ず 0/1 に整形する
      // (logic.ts が修正されていれば不要ですが、保険として残します)
      const pins = Array.isArray(arr) ? arr.map((v) => (v ? 1 : 0)) : [];
      const title = await SH.resolveTitleFor(chatId);
      await syncSet({ [key]: { pins: pins, updatedAt: Date.now(), title } });

      // インデックスの件数も更新
      const cfg = SH.getCFG() || {};
      const map = { ...(cfg.chatIndex?.map || {}) };
      const cnt = (arr || []).filter(Boolean).length; // 1の数をカウント
      map[chatId] = {
        ...(map[chatId] || {}),
        pinCount: cnt,
        updated: Date.now(),
      };
      await SH.saveSettingsPatch?.({
        chatIndex: { ...(cfg.chatIndex || {}), map },
      });
      return { ok: true };
    } catch (e) {
      // 拡張リロード中などは失敗しても致命ではない
      SH.logError("[savePinsArrAsync] failed:", e?.message || e);
      return { ok: false, err: e };
    }
  };

  // ピン削除関数（修正版: TypeScriptエラー対応）
  SH.deletePinsForChat = async function (chatId) {
    if (!chatId) return false;

    // 1. cgtnPins:: キーを削除
    const key = `cgtnPins::${chatId}`;

    // ★修正1: resolve を直接渡さず、アロー関数で包む
    await new Promise<void>((resolve) => {
      chrome.storage.sync.remove(key, () => resolve());
    });

    // 2. cgNavSettings 内の chatIndex からも削除
    const cfg = SH.getCFG(); // (getCFGは同期関数なので await は外してもOKです)

    if (cfg.chatIndex && cfg.chatIndex.map && cfg.chatIndex.map[chatId]) {
      delete cfg.chatIndex.map[chatId];

      // 保存 (cgNavSettings全体を更新)
      // ★修正2: ここも同様にアロー関数で包む
      await new Promise<void>((resolve) => {
        chrome.storage.sync.set({ cgNavSettings: cfg }, () => resolve());
      });
    }

    return true;
  };

  // ★修正: 新仕様に対応した削除関数 2026.02.07
  SH.deletePinsForChatAsync = async function deletePinsForChatAsync(chatId) {
    if (!chatId) return false;

    // 古い map 形式ではなく、直接キーを指定して消す！
    const key = `cgtnPins::${chatId}`;

    return new Promise((resolve) => {
      chrome.storage.sync.remove(key, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          SH.logError("deletePinsForChatAsync failed", err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  };

  // トグル（1始まり）付箋データ更新
  SH.togglePinByIndex = async function togglePinByIndex(
    index1,
    chatId = SH.getChatId?.(),
  ) {
    if (!Number.isFinite(index1) || index1 < 1) return false;
    const arr = await SH.getPinsArrAsync(chatId);
    if (arr.length < index1) {
      const old = arr.length;
      arr.length = index1;
      arr.fill(0, old, index1);
    }
    const next = arr[index1 - 1] ? 0 : 1;
    arr[index1 - 1] = next;
    const { ok } = await SH.savePinsArrAsync(arr, chatId);
    if (!ok) {
      // 失敗→UIロールバック：元に戻す
      arr[index1 - 1] = next ? 0 : 1;
      try {
        window.CGTN_UI?.toastNearPointer?.(
          SH.t?.("options.saveFailed") || "Failed to save",
        );
      } catch (_) {}
      return false;
    }
    // 付箋バッジ
    try {
      document.dispatchEvent(
        new CustomEvent("cgtn:pins-updated", { detail: { chatId } }),
      );
    } catch {}

    return !!next;
  };

  // 件数ヘルパ（配列方式に合わせて修正）
  SH.countPinsForChat = function (chatId = SH.getChatId()) {
    try {
      const arr = SH.getCFG?.()?.pinsByChat?.[chatId]?.pins || [];
      return arr.reduce((a, b) => a + (b ? 1 : 0), 0);
    } catch {
      return 0;
    }
  };

  // 付箋バッジなどで使う：チャットごとの付箋数
  SH.getPinsCountByChat = function getPinsCountByChat(chatId) {
    try {
      const cid = chatId || SH.getChatId?.();
      if (!cid) return 0;

      const cfg = SH.getCFG?.() || {};
      const map = cfg.chatIndex?.map || {};

      // 新仕様：chatIndex.map に pinCount をキャッシュしている
      const rec = map[cid];
      if (rec && typeof rec.pinCount === "number") {
        return rec.pinCount;
      }

      // フォールバック（旧データ／移行中対策）
      const pinsRec = cfg.pinsByChat?.[cid];
      let arr;
      if (Array.isArray(pinsRec?.pins)) {
        arr = pinsRec.pins;
      } else if (Array.isArray(pinsRec)) {
        arr = pinsRec;
      } else if (pinsRec && typeof pinsRec === "object") {
        arr = Object.values(pinsRec);
      } else {
        arr = [];
      }
      return arr.filter(Boolean).length;
    } catch (e) {
      SH.logError("[getPinsCountByChat] failed", e);
      return 0;
    }
  };

  // ========= saveSettingsPatch（書き込みガード付き）=========
  SH.saveSettingsPatch = async function saveSettingsPatch(patch = {}, cb) {
    const before = SH.getCFG?.() || {};
    //console.log("saveSettingsPatch");
    const merged = deepMerge(structuredClone(before), patch);
    //console.log("saveSettingsPatch merged:",merged);
    SH.setCFG?.(merged);
    try {
      if (canUseStorage()) {
        //console.log("saveSettingsPatch canUseStorage true");
        await syncSetAsync({ [KEY_CFG]: merged });
      } else {
        // 破棄中はメモリ反映のみで良し（警告は残さない）
        return { ok: true, cfg: merged, warn: "memory-only" };
      }
      try {
        cb && cb(merged);
      } catch {}
      return { ok: true, cfg: merged };
    } catch (err) {
      SH.logError("[saveSettingsPatch] failed:", err?.message || err);
      try {
        SH.setCFG?.(before);
      } catch {}
      return { ok: false, err, before };
    }
  };

  function computeAnchor(cfg) {
    const s = { ...DEFAULTS, ...(cfg || {}) };
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const centerBias = clamp(Number(s.centerBias), 0, 1);
    const headerPx = Math.max(0, Number(s.headerPx) || 0);
    const eps = Math.max(0, Number(s.eps) || 0);
    const y = Math.round(vh * centerBias - headerPx);
    return { y, eps, centerBias, headerPx };
  }

  function ensureVizElements() {
    const mk = (id, css) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        Object.assign(el.style, css);
        document.body.appendChild(el);
      }
      return el;
    };
    const line = mk("cgpt-bias-line", {
      position: "fixed",
      left: 0,
      right: 0,
      height: "0",
      borderTop: "3px solid red",
      zIndex: 2147483647,
      pointerEvents: "none",
      display: "none",
      boxSizing: "content-box",
      margin: 0,
      padding: 0,
    });
    const band = mk("cgpt-bias-band", {
      position: "fixed",
      left: 0,
      right: 0,
      height: "0",
      zIndex: 2147483647,
      pointerEvents: "none",
      display: "none",
      boxSizing: "content-box",
      margin: 0,
      padding: 0,
      background:
        "linear-gradient(to bottom, rgba(255,0,0,0.08), rgba(255,0,0,0.22), rgba(255,0,0,0.08))",
    });
    return { line, band };
  }

  function redrawBaseline() {
    const { y } = computeAnchor(CFG);
    const { line, band } = ensureVizElements();
    line.style.top = `${y}px`;
    const eps = CFG.eps ?? DEFAULTS.eps;
    band.style.top = `${y - eps}px`;
    band.style.height = `${eps * 2}px`;
  }

  function renderViz(cfg, visible = undefined) {
    const { y, eps } = computeAnchor(cfg || CFG);
    const { line, band } = ensureVizElements();
    line.style.top = `${y}px`;
    band.style.top = `${y - eps}px`;
    band.style.height = `${eps * 2}px`;
    if (typeof visible === "boolean") {
      const disp = visible ? "" : "none";
      line.style.display = disp;
      band.style.display = disp;
    }
  }

  let _visible = false;

  function toggleViz(on) {
    _visible = typeof on === "boolean" ? on : !_visible;
    renderViz(CFG, _visible);
  }

  SH.titleEscape = function (s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  try {
    chrome?.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== "sync" || !changes.cgNavSettings) return;
      const next: any = structuredClone(DEFAULTS); // !!!!
      deepMerge(next, changes.cgNavSettings.newValue || {});
      if (!next.list) next.list = structuredClone(DEFAULTS.list);
      CFG = next;
      renderViz(CFG, undefined);
    });
  } catch {}

  // ★新設: スイッチがONかどうかを判定する共通関数
  SH.isListToggleOn = function (): boolean {
    const listToggle = document.getElementById(
      "cgpt-list-toggle",
    ) as HTMLInputElement;
    return listToggle ? listToggle.checked : false;
  };

  // ★既存の isListOpen を上書き（パネルが見えているか＆スイッチがONか）
  SH.isListOpen = function (): boolean {
    const panel = document.getElementById("cgpt-list-panel");
    const isVisible =
      panel &&
      panel.style.display !== "none" &&
      !panel.classList.contains("collapsed");
    return !!(isVisible && SH.isListToggleOn());
  };

  // タイトル解決（副作用なし / DOM非依存）
  SH.resolveTitleFor = async function resolveTitleFor(chatId, fallback = "") {
    try {
      const cfg = SH.getCFG?.() || {};
      const ids = (cfg.chatIndex && cfg.chatIndex.ids) || {};
      const map = (cfg.chatIndex && cfg.chatIndex.map) || {};
      const live = ids[chatId] || map[chatId] || {};

      // ① 現在のチャット画面で同一CIDなら live title を最優先
      let liveTitle = "";
      try {
        if (SH.getChatId?.() === chatId)
          liveTitle = (SH.getChatTitle?.() || "").trim();
      } catch {}

      // ② インデックスの title、③ 既存保存の title、④ fallback、⑤ CID
      const key = `cgtnPins::${chatId}`;
      const prev = (await SH.syncGet?.(key))?.[key] || {};
      const t2 = (live.title || "").trim();
      const t3 = (prev.title || "").trim();
      let base = liveTitle || t2 || t3 || (fallback || "").trim() || chatId;

      // プロジェクト接頭辞
      const proj = (live.project || live.folder || live.group || "").trim();
      if (proj && !base.startsWith(proj)) base = `${proj} - ${base}`;

      return base.replace(/\s+/g, " ");
    } catch {
      return fallback || chatId;
    }
  };

  //チャットID→表示用タイトル関数
  SH.getTitleForChatId = function getTitleForChatId(cid, fallback = "") {
    try {
      const cfg = SH.getCFG?.() || {};
      const ids = (cfg.chatIndex && cfg.chatIndex.ids) || {};
      const map = (cfg.chatIndex && cfg.chatIndex.map) || {};
      const live = ids[cid] || map[cid] || {};

      // タイトル候補の優先度：
      // 1) chatIndex（ids/map）にある title
      // 2) pinsByChat に保存済みの title
      // 3) 引数 fallback
      // 4) 何も無ければ CID
      const t2 = (live.title || "").trim();
      const t3 = (cfg.pinsByChat?.[cid]?.title || "").trim();
      let base = t2 || t3 || (fallback || "").trim();

      // プロジェクト名/フォルダ名などの接頭辞
      const proj = (live.project || live.folder || live.group || "").trim();

      if (!base) base = cid;
      if (proj && !base.startsWith(proj)) base = `${proj} - ${base}`;

      return base.replace(/\s+/g, " ");
    } catch {
      return fallback || cid;
    }
  };

  // =================================================================
  // Data Migration & Backup (Fix: Nested Settings & Cleanup)
  // =================================================================

  // v1データをv2へ変換・正規化する関数
  function migrateV1toV2(raw: any) {
    // 1. 設定データの取り出し（入れ子対策）
    let rootSettings: any = {};

    if (raw.cgNavSettings) {
      // 既に cgNavSettings がある場合
      if (raw.cgNavSettings.settings) {
        // ★修正: 二重ネスト (cgNavSettings.settings) になっていたら中身を取り出す
        rootSettings = { ...raw.cgNavSettings.settings };
      } else {
        rootSettings = { ...raw.cgNavSettings };
      }
    } else if (raw.settings) {
      // エクスポートデータ (data.settings) からの場合
      rootSettings = { ...raw.settings };
    } else {
      // v1 (直下) の場合
      rootSettings = { ...raw };
    }

    const newPinsByChat: Record<string, any> = {};

    // 2. ピンデータの回収
    // (A) pinsByChat (Exportデータ由来 or 直下)
    if (raw.pinsByChat) {
      Object.assign(newPinsByChat, raw.pinsByChat);
    }
    // (B) list.pinsByChat (v1由来)
    if (rootSettings.list && rootSettings.list.pinsByChat) {
      Object.assign(newPinsByChat, rootSettings.list.pinsByChat);
      try {
        delete rootSettings.list.pinsByChat;
      } catch {}
    }
    // (C) cgtnPins:: (Storage由来)
    Object.keys(raw).forEach((k) => {
      if (k.startsWith("cgtnPins::")) {
        const cid = k.replace("cgtnPins::", "");
        newPinsByChat[cid] = raw[k];
      }
    });

    // 3. ゴミ掃除
    // 設定オブジェクトの中に pinsByChat や pins が紛れ込んでいたら消す
    delete rootSettings.pinsByChat;
    delete rootSettings.pins;
    delete rootSettings.meta; // versionは下記で注入するので消す

    // ★バージョン注入
    rootSettings.version = 2;

    return {
      settings: rootSettings,
      pinsByChat: newPinsByChat,
    };
  }

  // ★ インポート機能（修正版）
  SH.importData = async function (jsonObj: any) {
    if (!jsonObj) throw new Error("Empty data");

    // dataラッパーを剥がす
    let candidate = jsonObj.data || jsonObj;

    const v2Data = migrateV1toV2(candidate);

    // 保存用オブジェクト
    const toSave: Record<string, any> = {
      cgNavSettings: v2Data.settings, // ここがフラットな設定オブジェクトになる
    };

    // ピンを展開
    const pinsMap = v2Data.pinsByChat || {};
    for (const [cid, val] of Object.entries(pinsMap)) {
      if (cid && val) {
        // ★修正: pins配列を 0/1 に統一して保存（容量節約）
        if (val.pins && Array.isArray(val.pins)) {
          val.pins = val.pins.map((p) => (p ? 1 : 0));
        }
        toSave[`cgtnPins::${cid}`] = val;
      }
    }

    // 全クリアして保存
    await new Promise<void>((resolve, reject) => {
      chrome.storage.sync.clear(() => {
        chrome.storage.sync.set(toSave, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });
    });

    await SH.loadSettings();
    return true;
  };

  // ★ 自動マイグレーション（起動時にチェック）
  SH.migrateStorageIfNeeded = async function () {
    return new Promise<void>((resolve) => {
      chrome.storage.sync.get(null, (raw: any) => {
        if (!raw || Object.keys(raw).length === 0) {
          resolve();
          return;
        }

        // バージョンチェック (cgNavSettings.version を優先確認)
        const currentVer = raw.cgNavSettings?.version || raw.meta?.version || 0;

        // ゴミチェック（ルートに meta や pinsByChat があるか）
        const hasGarbage =
          raw.meta !== undefined || raw.pinsByChat !== undefined;

        // v2以上で、かつゴミもなければ終了
        if (currentVer >= 2 && !hasGarbage) {
          resolve();
          return;
        }

        //        console.log(`[AutoMigrate] Optimizing storage (v${currentVer})...`);
        const v2Data = migrateV1toV2(raw);

        // ★保存用オブジェクトの構築
        // v2Data.meta は存在しないので参照しません
        const toSave: Record<string, any> = {
          cgNavSettings: v2Data.settings, // ここに version:2 が含まれる
        };

        // ピンをバラして追加
        for (const [cid, val] of Object.entries(v2Data.pinsByChat || {})) {
          toSave[`cgtnPins::${cid}`] = val;
        }

        // 全クリアして保存（これでルートの meta や pinsByChat は消える）
        chrome.storage.sync.clear(() => {
          chrome.storage.sync.set(toSave, () => {
            //console.log("[AutoMigrate] Done. Storage optimized.");
            resolve();
          });
        });
      });
    });
  };

  // ★ エクスポート機能
  SH.exportAllData = async function () {
    const raw = await new Promise<any>((r) => chrome.storage.sync.get(null, r));
    const v2Data = migrateV1toV2(raw);

    // ファイル出力用に、設定内の version を meta にコピーしてあげる（親切設計）
    // ※ settings.version はそのままでもOK

    return {
      meta: {
        appName: "TurnNavigator",
        version: 2,
        exportedAt: Date.now(),
      },
      data: {
        settings: v2Data.settings, // cgNavSettings に相当
        pinsByChat: v2Data.pinsByChat, // 全ピンを含む (Import時にまたバラされる)
      },
    };
  };

  // =================================================================
  // Log Viewer (Data source: Shared.ts)
  // =================================================================

  // ★注意: ここで logs = [] や addLog を定義する必要はありません。
  // すべて window.CGTN_SHARED (SH) にあるものを使います。

  /**
   * エラーログ用ショートカット (UI連携)
   */
  SH.logError = function (msg, err) {
    const text = err ? String(err.message || err) : "";
    const stack = err && err.stack ? `\nStack: ${err.stack}` : "";

    // 自分自身(SH)のレコーダーに記録
    if (SH.addLog) {
      SH.addLog(`${msg} ${text}${stack}`, "ERROR");
    } else {
      SH.logError(msg, err);
    }

    // トースト通知 (UIモジュールがいれば)
    window.CGTN_UI?.toast?.(`Error: ${msg}`, "error");
  };

  /**
   * ログビューア表示
   */
  SH.showLogs = function () {
    // ログ配列を取得
    const currentLogs = SH.logs ? SH.logs : [];

    const old = document.getElementById("cgtn-log-viewer");
    if (old) old.remove();

    const box = document.createElement("div");
    box.id = "cgtn-log-viewer";
    Object.assign(box.style, {
      position: "fixed",
      inset: "40px",
      zIndex: "2147483647",
      background: "rgba(0,0,0,0.95)",
      color: "#0f0",
      fontFamily: "Consolas, Menlo, monospace",
      fontSize: "13px",
      padding: "16px",
      borderRadius: "8px",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 0 30px rgba(0,0,0,0.8)",
      backdropFilter: "blur(4px)",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "10px",
      borderBottom: "1px solid #333",
      paddingBottom: "8px",
    });

    // ★変更: Clearボタンを追加し、タイトルにID(cgtn-log-title)を付与（更新用）
    header.innerHTML = `
      <div id="cgtn-log-title" style="font-weight:bold; font-size:14px;">
        ✈️ Flight Recorder (Last ${currentLogs.length})
      </div>
      <div>
        <button id="cgtn-log-copy" style="cursor:pointer; margin-right:8px; padding:4px 12px; background:#333; color:#fff; border:1px solid #555;">Copy</button>
        <button id="cgtn-log-clear" style="cursor:pointer; margin-right:8px; padding:4px 12px; background:#333; color:#fff; border:1px solid #555;">Clear</button>
        <button id="cgtn-log-close" style="cursor:pointer; padding:4px 12px; background:#c33; color:#fff; border:1px solid #555;">Close</button>
      </div>
    `;
    box.appendChild(header);

    const ta = document.createElement("textarea");
    ta.readOnly = true;
    ta.value = currentLogs.join("\n");
    Object.assign(ta.style, {
      flex: "1",
      background: "transparent",
      color: "#0f0",
      border: "none",
      resize: "none",
      outline: "none",
      lineHeight: "1.4",
      whiteSpace: "pre",
    });
    box.appendChild(ta);

    document.body.appendChild(box);

    // --- イベント設定 ---

    // Close
    box
      .querySelector("#cgtn-log-close")
      .addEventListener("click", () => box.remove());

    // Copy
    box.querySelector("#cgtn-log-copy").addEventListener("click", async (e) => {
      const btn = e.target as HTMLButtonElement;
      try {
        await navigator.clipboard.writeText(ta.value);
        const originalText = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = originalText), 1000);
      } catch (err) {
        alert("Copy failed");
      }
    });

    // ★追加: Clear
    box.querySelector("#cgtn-log-clear").addEventListener("click", () => {
      if (confirm("Clear all logs?")) {
        // 配列を空にする
        if (SH.logs) SH.logs.length = 0;

        // "Logs cleared" だけ記録して表示
        SH.addLog("Logs cleared manually.", "INFO");
        ta.value = SH.logs.join("\n");

        // タイトルの件数も更新
        const titleEl = box.querySelector("#cgtn-log-title");
        if (titleEl)
          titleEl.textContent = `✈️ Flight Recorder (Last ${SH.logs.length})`;
      }
    });

    ta.scrollTop = ta.scrollHeight;
  };

  // 初期化ログ
  SH.addLog("Shared module initialized.");

  SH.DEFAULTS = DEFAULTS;
  SH.loadSettings = loadSettings;
  SH.computeAnchor = computeAnchor;
  SH.renderViz = renderViz;
  SH.redrawBaseline = redrawBaseline;
  SH.toggleViz = toggleViz;
  SH.renderViz = renderViz;
  SH.cleanupZeroPinRecords = cleanupZeroPinRecords;
})();
