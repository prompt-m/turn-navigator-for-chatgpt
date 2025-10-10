// i18n.js
(() => {
  const NS = (window.CGTN_I18N = {});

  const DICT = {
    ja: {
      // ===== 共通UI =====
      // === ナビパネルボタン関連 ===
      user: 'ユーザー',
      assistant: 'アシスタント',
      all: '全体',
      top: '先頭',
      prev: '前へ',
      next: '次へ',
      bottom: '末尾',
      langBtn: 'English',
      dragTitle: 'ドラッグで移動',
      line: '基準線',
      list: '一覧',
      // === リスト／プレビュー関連 ===
      image: '（image）',
      'list.showAll': "すべて表示",
      'list.noPins': "このチャットには付箋がありません。",
      'list.collapse': '畳む / 開く',
      'list.refresh': '一覧を最新にする',
      'listRows': "行",
      'listTurns': "ターン",
      'preview': "プレビュー",
      'preview.title': "プレビュー",
      'attachments': "添付",
      // ===== 設定画面（options.*） =====
      'options.pinsTitle': '付箋データ管理',
      'options.pinsHint': '各チャットの付箋を一覧。不要になったチャットは削除できます。',
      'options.thChat': 'チャット',
      'options.thCount': '付箋数',
      'options.thUpdated': '更新',
      'options.thOps': '操作',
      'options.delBtn': '削除',
      'options.delConfirm': 'このチャットの付箋データを削除します。よろしいですか？',
      'options.deleted': '削除しました',
      'options.emptyPinsTitle': '付箋データはまだありません',
      'options.emptyPinsDesc': '一覧パネルで🔖をONにすると、ここに表示されます。',
      'options.saved': '保存しました',
      'options.reset': '規定に戻しました',
      'options.nowOpen': '表示中のチャットは削除できません。',
      'options.stillExists': 'チャットがサイドバーに存在します（更新で反映）。',
      'options.listMaxItems': '最大表示件数（目安: 20–80）',
      'options.listMaxChars': '1行の最大文字数（目安: 30–80）',
      'options.listFontSize': 'フォントサイズ（px）',
      'options.detailTitle':  '詳細設定（基準線とスクロール挙動）',
      'options.centerBias':   '表示位置の基準 (Center Bias)',
      'options.centerBiasHint': '0=上端 / 0.5=中央（目安 0.40–0.55）',
      'options.eps':          'ゆらぎ幅 (EPS Hysteresis)',
      'options.epsHint':      '小さい=敏感 / 大きい=安定（目安 5–50）',
      'options.headerPx':     'ヘッダー補正 (px)',
      'options.lockMs':       'スクロールロック (ms)',
      // ===== ツールチップ =====
      'nav.top': '先頭へ',
      'nav.bottom': '末尾へ',
      'nav.prev': '前へ',
      'nav.next': '次へ',
      'nav.lang': 'English / 日本語',
      'nav.viz': '基準線の表示/非表示',
      'nav.list': '一覧の表示/非表示',
      'nav.drag': 'ドラッグで移動',
      'row.previewBtn': 'クリックでプレビューを表示／もう一度クリックで閉じます',
      'row.pin': 'このターンを付箋 ON/OFF',
      'list.pinonly': '付箋のみ表示（Altでテーマ）'
    },
    en: {
      // ===== Common UI =====
      // === Navigation panel ===
      user: 'User',
      assistant: 'Assistant',
      all: 'All',
      top: 'Top',
      prev: 'Prev',
      next: 'Next',
      bottom: 'Bottom',
      langBtn: '日本語',
      dragTitle: 'Drag to move',
      line: 'Guide',
      list: 'List',
      // === List / Preview ===
      image: '(image)',
      'list.showAll': "Show all",
      'list.noPins': "No pins in this chat.",
      'list.collapse': 'Collapse / Expand',
      'list.refresh': 'Refresh the list',
      'listRows': "rows",
      'listTurns': "turns",
      'preview': "Preview",
      'preview.title': "Preview",
      'attachments': "Attachments",
      // ===== Options (settings screen) =====
      'options.pinsTitle': 'Pinned Data',
      'options.pinsHint': 'List of pins (pinsByChat) per chat. You can delete data for a specific chat.',
      'options.thChat': 'Chat',
      'options.thCount': 'Pins',
      'options.thUpdated': 'Updated',
      'options.thOps': 'Operation',
      'options.delBtn': 'Delete',
      'options.delConfirm': 'Delete pin data for this chat. Are you sure?',
      'options.deleted': 'Deleted',
      'options.emptyPinsTitle': 'No pinned data yet',
      'options.emptyPinsDesc': 'Turn on the 🔖 icon in the list panel and chats will appear here.',
      'options.saved': 'Saved',
      'options.reset': 'Reset to defaults',
      'options.nowOpen': 'Now open chat cannot be deleted.',
      'options.stillExists': 'Chat still exists in the sidebar. Reload to update.',
      'options.listMaxItems': 'Max items (guide: 20–80)',
      'options.listMaxChars': 'Max chars per line (30–80)',
      'options.listFontSize': 'Font size (px)',
      'options.detailTitle':  'Advanced (guide line & scroll)',
      'options.centerBias':   'Center Bias',
      'options.centerBiasHint':'0=top / 0.5=center (0.40–0.55)',
      'options.eps':          'EPS Hysteresis',
      'options.epsHint':      'Small=sensitive / Large=stable (5–50)',
      'options.headerPx':     'Header offset (px)',
      'options.lockMs':       'Scroll lock (ms)',
      // ===== Tooltips =====
      'nav.top': 'Go to top',
      'nav.bottom': 'Go to bottom',
      'nav.prev': 'Previous',
      'nav.next': 'Next',
      'nav.lang': 'English / 日本語',
      'nav.viz': 'Show/Hide guide line',
      'nav.list': 'Show/Hide list',
      'nav.drag': 'Drag to move',
      'row.previewBtn': 'Click to show preview / Click again to close',
      'row.pin': 'Toggle pin for this turn',
      'list.pinonly': 'Pinned only (Alt for theme)'
    }
  };

  NS._forceLang = null;

  const getLang = () => {
    if (NS._forceLang) return NS._forceLang; // ← 即反映
    return (window.CGTN_SHARED?.getCFG?.()?.lang) ||
      ((navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en');
  };

  const t = (key) => {
    const L = getLang();
    const dict = DICT[L] || DICT.ja;
    return dict[key] || key;
  };

  NS.getLang = getLang;
  NS.t = t;
})();
