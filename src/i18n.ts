// i18n.ts
(() => {
  // const NS = (window.CGTN_I18N = {}); !!!!
  const NS: any = (window.CGTN_I18N = {});

  const DICT = {
    ja: {
      // ===== 共通UI =====
      // === ナビパネルボタン関連 ===
      user: "ユーザー",
      assistant: "アシスタント",
      all: "全体",
      top: "先頭",
      prev: "前へ",
      next: "次へ",
      bottom: "末尾",
      langBtn: "English",
      dragTitle: "ドラッグで移動",
      line: "基準線",
      tools: "ツール",
      list: "一覧",
      others: "その他",
      settings: "設定",
      refresh: "更新",
      // ★追加：スイッチ用ツールチップ
      tipOn: "ONでナビゲート開始",
      tipOff: "OFFでナビゲート停止",
      headerDrag: "ドラッグで移動",
      // ★追加: 入力設定表示 2026.02.11
      "nav.sendKeyInfo": "送信キー設定：",
      "nav.sk_enter": "[Enter]",
      "nav.sk_ctrl": "[Ctrl+Enter]",
      "nav.sk_alt": "[Alt+Enter]",
      // === リスト／プレビュー関連 ===
      image: "（image）",
      video: "（video）",
      unknown: "（unknown）",
      media: "（media）",
      "list.showAll": "すべて表示",
      "list.noPins": "このチャットには付箋がありません。",
      "list.collapse": "畳む / 開く",
      "list.refresh": "一覧を最新にする",
      "list.empty": "リストはありません",
      "list.pinAllOn": "表示中の会話をすべて付箋ONにします",
      "list.pinAllOff": "表示中の会話をすべて付箋OFFにします",
      "list.footer.pinOnly":
        "会話数: {count}/{total}｜アップロード: {uploads}｜ダウンロード・リンク: {downloads}",
      "list.footer.all":
        "会話数: {total}｜アップロード: {uploads}｜ダウンロード・リンク: {downloads}",
      "listFilter.all": "すべての会話を表示します",
      "listFilter.user": "ユーザーの会話を表示します",
      "listFilter.asst": "アシスタントの会話を表示します",
      "listFilter.pin": "付箋ONの会話を表示します",
      listRows: "行",
      listTurns: "ターン",
      preview: "プレビュー",
      "preview.title": "プレビュー",
      attachments: "添付",
      "storage.saveFailed.title": "保存に失敗しました",
      "storage.saveFailed.body":
        "ストレージ上限に達しています。設定 → 付箋データ管理で不要な付箋を削除してください。",
      // ===== 設定画面（options.*） =====
      "options.pinsTitle": "付箋データ管理",
      "options.pinsHint":
        "各チャットの付箋を一覧。不要になったチャットは削除できます。",
      "options.thChat": "チャット",
      "options.thTurns": "会話数",
      "options.thCount": "付箋数",
      "options.thUpdated": "更新",
      "options.thOps": "操作",
      "options.delBtn": "削除",
      "options.delConfirm":
        "このチャットの付箋データを削除します。よろしいですか？\n(この操作は取り消せません)",
      "options.deleted": "削除しました",
      "options.emptyPinsTitle": "付箋データはまだありません",
      "options.emptyPinsDesc":
        "一覧パネルで🔖をONにすると、ここに表示されます。",
      "options.saved": "保存しました",
      "options.reset": "規定に戻しました",
      "options.nowOpen": "表示中のチャットは削除できません。",
      "options.stillExists": "チャットがサイドバーに存在します（更新で反映）。",
      "options.listTitle": "一覧パネルの表示設定",
      "options.listMaxItems": "最大表示件数（目安: 20–80）",
      "options.listMaxChars": "1行の最大文字数（目安: 30–80）",
      "options.listFontSize": "フォントサイズ（px）",
      "options.detailTitle": "詳細設定",
      "options.centerBias": "表示位置の基準 (Center Bias)",
      "options.centerBiasHint": "0=上端 / 0.5=中央（目安 0.40–0.55）",
      "options.eps": "ゆらぎ幅 (EPS Hysteresis)",
      "options.epsHint": "小さい=敏感 / 大きい=安定（目安 5–50）",
      "options.headerPx": "ヘッダー補正 (px)",
      "options.lockMs": "スクロールロック (ms)",
      // 入力設定 2026.02.11
      "options.sendKeyLabel": "送信キー設定",
      "options.sk_enter": "Enterで送信 (標準)",
      "options.sk_ctrl": "Ctrl + Enterで送信",
      "options.sk_alt": "Alt + Enterで送信",
      "options.saveBtn": "保存",
      "options.resetBtn": "規定に戻す",
      "options.refreshTimeout": "更新が時間内に終わりませんでした",
      "options.refreshed": "最新の情報に更新しました",
      "options.refreshFailed": "更新に失敗しました",
      "options.syncUsage": "sync使用量",
      "options.itemsLabel": "付箋付きチャット数",
      "opts.title": "ChatGPT Turn Navigator 設定",
      "opts.tips":
        "よく使うのは「付箋データ管理」と「一覧パネルの表示設定」です。その他の数値や基準線は詳細設定にまとめました。",
      "opts.lang.ja": "日本語",
      "opts.lang.en": "English",
      "opts.pins.section": "付箋データ管理",
      "opts.pins.col.chat": "チャット",
      "opts.pins.col.count": "付箋数",
      "opts.pins.col.updated": "更新",
      "opts.pins.col.action": "操作",
      "opts.pins.btn.delete": "削除",
      "opts.pins.note":
        "各チャットの付箋を一覧。不要になった付箋データは削除できます。",
      "opts.btnExport": "エクスポート",
      "opts.btnImport": "インポート",
      "opts.backupDesc":
        "付箋データをJSONファイルにエクスポートまたはバックアップから復元します。",
      "opts.importConfirm":
        "現在のデータを上書きしてインポートしますか？\n(この操作は取り消せません)",
      "opts.importSuccess": "インポート完了！ページをリロードします。",
      "options.refreshTitles": "再計算",
      "options.openChatAndRefresh":
        "チャット名を表示するには、ChatGPT画面を開いて［最新にする］を押してください。",
      "options.thUploads": "アップロード",
      "options.thDownloads": "ダウンロード・リンク",
      // ===== ツールチップ =====
      "nav.top": "先頭へ",
      "nav.bottom": "末尾へ",
      "nav.prev": "前へ",
      "nav.next": "次へ",
      "nav.lang": "English / 日本語",
      "nav.viz": "基準線の表示/非表示",
      "nav.list": "一覧の表示/非表示",
      "nav.refresh": "最新にする",
      "nav.openSettings": "設定を開く",
      "nav.drag": "ドラッグで移動",
      "row.previewBtn":
        "クリックでプレビューを表示／もう一度クリックで閉じます",
      "row.notFound": "（本文を取得できませんでした）",
      "row.pin": "このターンを付箋 ON/OFF",
      "list.pinonly": "付箋",
    },
    en: {
      // ===== Common UI =====
      // === Navigation panel ===
      user: "User",
      assistant: "Assistant",
      all: "All",
      top: "Top",
      prev: "Prev",
      next: "Next",
      bottom: "Bottom",
      dragTitle: "Drag to move",
      line: "Guide",
      tools: "Tool",
      list: "List",
      others: "Other",
      settings: "Settings",
      refresh: "Refresh",
      langBtn: "日本語",
      // ★追加
      tipOn: "Turn ON to start navigation",
      tipOff: "Turn OFF to stop navigation",
      headerDrag: "Drag to move",
      // ★追加: 入力設定表示 2026.02.11
      "nav.sendKeyInfo": "Send Key:",
      "nav.sk_enter": "[Enter]",
      "nav.sk_ctrl": "[Ctrl+Enter]",
      "nav.sk_alt": "[Alt+Enter]",
      // === List / Preview ===
      image: "(image)",
      video: "(video)",
      unknown: "(unknown)",
      media: "(media)",
      "list.showAll": "Show all",
      "list.noPins": "No pins in this chat.",
      "list.collapse": "Collapse / Expand",
      "list.refresh": "Refresh the list",
      "list.empty": "No items to show",
      "list.pinAllOn": "Turn pins ON for all visible turns",
      "list.pinAllOff": "Turn pins OFF for all visible turns",
      "list.footer.pinOnly":
        "Turns: {count}/{total} | Uploads: {uploads} | Downloads / Links: {downloads}",
      "list.footer.all":
        "Turns: {total} | Uploads: {uploads} | Downloads / Links: {downloads}",
      "listFilter.all": "Show all messages",
      "listFilter.user": "Show only user messages",
      "listFilter.asst": "Show only assistant messages",
      "listFilter.pin": "Show pinned messages",
      listRows: "rows",
      listTurns: "turns",
      preview: "Preview",
      "preview.title": "Preview",
      attachments: "Attachments",
      "storage.saveFailed.title": "Save failed",
      "storage.saveFailed.body":
        "Storage limit reached. Open Options → Pin Data Manager and delete unnecessary pins.",
      // ===== Options (settings screen) =====
      "options.pinsTitle": "Pinned Data",
      "options.pinsHint":
        "Displays pinned data per chat. You can delete unneeded pin data.",
      "options.thChat": "Chat",
      "options.thTurns": "Turns",
      "options.thCount": "Pins",
      "options.thUpdated": "Updated",
      "options.thOps": "Operation",
      "options.delBtn": "Delete",
      "options.delConfirm":
        "Delete pin data for this chat. Are you sure?\n(This action cannot be undone.)",
      "options.deleted": "Deleted",
      "options.emptyPinsTitle": "No pinned data yet",
      "options.emptyPinsDesc":
        "Turn on the 🔖 icon in the list panel and chats will appear here.",
      "options.saved": "Saved",
      "options.reset": "Reset to defaults",
      "options.nowOpen": "Now open chat cannot be deleted.",
      "options.stillExists":
        "Chat still exists in the sidebar. Reload to update.",
      "options.listTitle": "List Panel Display Settings",
      "options.listMaxItems": "Max items (guide: 20–80)",
      "options.listMaxChars": "Max chars per line (30–80)",
      "options.listFontSize": "Font size (px)",
      "options.detailTitle": "Advanced Settings",
      "options.centerBias": "Center Bias",
      "options.centerBiasHint": "0=top / 0.5=center (0.40–0.55)",
      "options.eps": "EPS Hysteresis",
      "options.epsHint": "Small=sensitive / Large=stable (5–50)",
      "options.headerPx": "Header offset (px)",
      "options.lockMs": "Scroll lock (ms)",
      // 入力設定 2026.02.11
      "options.sendKeyLabel": "Send Key",
      "options.sk_enter": "Enter to send(Default)",
      "options.sk_ctrl": "Ctrl + Enter to send",
      "options.sk_alt": "Alt + Enter to send",
      "options.saveBtn": "Save",
      "options.resetBtn": "Reset",
      "options.refreshTitles": "Refresh",
      "options.openChatAndRefresh":
        "To show chat titles, open a ChatGPT tab and press “Refresh”.",
      "options.thUploads": "Uploads",
      "options.thDownloads": "Downloads / Links",
      "options.refreshTimeout": "Refresh did not complete in time",
      "options.refreshed": "Refreshed successfully",
      "options.refreshFailed": "Refresh failed",
      "options.syncUsage": "sync usage",
      "options.itemsLabel": "Pinned chats",
      "opts.title": "ChatGPT Turn Navigator Settings",
      "opts.tips":
        "You’ll mostly use “Pin Data Manager” and “List Panel Display Settings.” Other numbers and the baseline live under Advanced.",
      "opts.lang.ja": "日本語",
      "opts.lang.en": "English",
      "opts.pins.section": "Pin Data Manager",
      "opts.pins.col.chat": "Chat",
      "opts.pins.col.count": "Pins",
      "opts.pins.col.updated": "Updated",
      "opts.pins.col.action": "Action",
      "opts.pins.btn.delete": "Delete",
      "opts.pins.note":
        "Displays pinned data per chat. You can delete unneeded pin data.",
      "opts.btnExport": "Export",
      "opts.btnImport": "Import",
      "opts.backupDesc":
        "Export your pins and settings to a JSON file, or restore from a backup.",
      "opts.importConfirm":
        "Do you want to overwrite current data and import?\n(This action cannot be undone.)",
      "opts.importSuccess": "Import complete! Reloading page...",
      // ===== Tooltips =====
      "nav.top": "Go to top",
      "nav.bottom": "Go to bottom",
      "nav.prev": "Previous",
      "nav.next": "Next",
      "nav.lang": "English / 日本語",
      "nav.viz": "Show/Hide guide line",
      "nav.list": "Show/Hide list",
      "nav.refresh": "Refresh",
      "nav.openSettings": "Open Settings",
      "nav.drag": "Drag to move",
      "row.previewBtn": "Click to show preview / Click again to close",
      "row.notFound": "(not found)",
      "row.pin": "Toggle pin for this turn",
      "list.pinonly": "Pinned",
    },
  };

  NS._forceLang = null;

  // 言語を強制切替する関数（全モジュール共通で使用）
  NS.setLang = function (lang) {
    NS._forceLang = lang === "en" ? "en" : "ja";
    document.documentElement.lang = NS._forceLang;
    // 共有モジュールにも伝播
    window.CGTN_SHARED?.updateTooltips?.(); // ツールチップ再翻訳
    window.CGTN_SHARED?._langHooks?.forEach?.((fn) => {
      try {
        fn();
      } catch {}
    });
  };

  const getLang = () => {
    if (NS._forceLang) return NS._forceLang; // ← 即反映
    return (
      window.CGTN_SHARED?.getCFG?.()?.lang ||
      ((navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "en")
    );
  };

  const t = (key) => {
    const L = getLang();
    const dict = DICT[L] || DICT.ja;
    return dict[key] || key;
  };

  NS.getLang = getLang;
  NS.t = t;
})();
