// ui.js — パネルUI生成 / 言語 / 位置クランプ
(() => {
  'use strict';

  const NS = (window.CGTN_UI = window.CGTN_UI || {});
  const SH = window.CGTN_SHARED || {};
  const LG = window.CGTN_LOGIC || {};
  const T  = (k)=> window.CGTN_I18N?.t?.(k) || k;

  // 初期言語をブラウザの設定から決める
  let LANG = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  // いつでも <html lang> を真とする（fallback は LANG）
  document.documentElement.lang = LANG;

  // 外部から現在言語を取得できるように公開
  NS.getLang = () => LANG;
  SH.getLang = () => LANG;
  SH.setLangResolver?.(SH.getLang);   // shared.js 側の言語解決に供給

  // ★ curLang() がこれを拾えるように resolver にも設定
  SH.setLangResolver?.(SH.getLang);


// === Cursor assets ===
const pinCurURL = chrome.runtime.getURL('assets/pin16.png');
const prvCurURL = chrome.runtime.getURL('assets/prev16.png');



/* 4ブロック：NAV / LIST / PREVIEW / MISC（補助） */
const NAV_CSS = `
/* === 共通：丸いピル型ボタン === */
.cgtn-pill-btn{
  font:12px/1.1 system-ui,-apple-system,sans-serif;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:4px 12px;
  border-radius:999px;
  background:#fff;
  border:1px solid rgba(0,0,0,.06);
  box-shadow:0 4px 14px rgba(0,0,0,.12);
  transition:
    background-color .15s ease,
    box-shadow       .15s ease,
    transform        .08s ease;
  cursor:pointer;
}

/* ホバーで色＆影だけ少し強く */
.cgtn-pill-btn:hover{
  background:#f3f4f6;
  box-shadow:0 6px 18px rgba(0,0,0,.16);
}

/* 押したときの沈み込み */
.cgtn-pill-btn:active{
  transform:translateY(1px);
  box-shadow:
    0 2px 6px rgba(0,0,0,.18) inset,
    0 2px 6px rgba(0,0,0,.08);
}

@media (prefers-color-scheme: dark){
  .cgtn-pill-btn{
    background:#1d1f23;
    border-color:rgba(255,255,255,.06);
    box-shadow:0 6px 18px rgba(0,0,0,.35);
    color:#e8eaed;
  }
  .cgtn-pill-btn:hover{
    background:#262931;
    box-shadow:0 8px 22px rgba(0,0,0,.45);
  }
}
/* =========================
   1) NAV (ナビパネル)
========================= */
#cgpt-nav{
  position:fixed; right:12px; bottom:140px;
  display:flex; flex-direction:column; gap:12px;
  z-index:2147483647
}

.cgpt-nav-group{
  width:92px; border-radius:14px; padding:10px;
  border:1px solid rgba(0,0,0,.12);
  background:rgba(255,255,255,.95);
  box-shadow:0 6px 24px rgba(0,0,0,.18);
  display:flex; flex-direction:column; gap:6px
}
.cgpt-nav-label{
  text-align:center; font-weight:600; opacity:.9;
  margin-bottom:2px; font-size:12px; color:#000
}
/*
#cgpt-nav button{
  all:unset;
  height:34px;
  border-radius:10px;
  display:grid;
  place-items:center;
  cursor:pointer;
  background:#f2f2f7;
  color:#111;
  border:1px solid rgba(0,0,0,.08)
}
#cgpt-nav button:hover{ background:#fff }
*/
.cgpt-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:0px }
#cgpt-nav .cgpt-lang-btn{ height:22px; margin-top:16px; color:#000 }
#cgpt-nav input[type=checkbox] { cursor: pointer; }
#cgpt-nav .cgpt-list-toggle input:checked + .cgtn-pill-btn{
  background:#111;
  color:#fff;
  box-shadow:0 4px 14px rgba(0,0,0,.25);
}

/* 一覧トグルを pill ボタン化（ロールボタンと同じ仕様） */
#cgpt-nav .cgpt-list-toggle{
  display:flex;
  justify-content:center;
  align-items:center;
  margin-top:6px;
}

#cgpt-nav .cgpt-list-toggle > input[type="checkbox"]{
  position:absolute;
  opacity:0;
  pointer-events:none;
}

/* OFF（ロールボタンOFFと同じ） */
#cgpt-nav .cgpt-list-toggle > span{
  height:22px;
  min-width:60px;
  padding:6px 14px;
  border-radius:999px;
  background:#fff;
  color:#111;
  font-size:12px;
  box-shadow:0 3px 10px rgba(0,0,0,.12);
  display:flex;
  justify-content:center;
  align-items:center;
  cursor:pointer;
  transition:
    background .18s ease,
    color .18s ease,
    box-shadow .18s ease,
    transform .08s ease;
}

/* hover（ロールボタンと統一） */
#cgpt-nav .cgpt-list-toggle > span:hover{
  box-shadow:0 6px 18px rgba(0,0,0,.16);
  background:#f3f4f6;
  transform:translateY(-1px);
}

/* ON（ロールボタンONと完全一致） */
#cgpt-nav .cgpt-list-toggle > input[type="checkbox"]:checked + span{
  background:#111;
  color:#fff;
  box-shadow:0 3px 10px rgba(0,0,0,.25);
}

/*
.cgpt-viz-toggle,
.cgpt-list-toggle{
  margin-top:6px;
  display:flex;
  gap:8px;
  align-items:center;
  justify-content:flex-start;
  font-size:12px;
  cursor:pointer
}
.cgpt-viz-toggle:hover,
.cgpt-list-toggle:hover{
  cursor:pointer;
  opacity:.9 
}
*/
/* --- 設定ボタン（ナビ内：枠なし・中央寄せ） --- */
#cgtn-open-settings.cgtn-open-settings{
  all: unset;                              /* ブラウザ標準のボタン装飾を全部消す */
  cursor: pointer;
/*  font: 16px/1 system-ui,-apple-system,sans-serif;*/
  color: #666;                             /* 通常時のギア色 */

  padding: 4px;                            /* クリックしやすいように少しだけヒットエリアを広げる */
  border-radius: 999px;                    /* hover で背景を付けるときのための丸形 */

  align-self: center;                      /* ナビパネル内で中央寄せ */
  transition:
    color 0.15s ease,
    background-color 0.15s ease,
    transform 0.10s ease;
}

#cgtn-open-settings.cgtn-open-settings:hover{
  color: #111;                             /* 文字色だけ少し濃く */
  background-color: rgba(0,0,0,.04);      /* うっすら丸いハイライト（完全に消したければ行ごと削除） */
  transform: translateY(-1px);            /* 軽く浮かせる */
}

#cgtn-open-settings.cgtn-open-settings:active{
  transform: translateY(0);               /* クリック時は元の位置に戻す */
}
/* ダークモード調整 */
@media (prefers-color-scheme: dark){
  #cgtn-open-settings.cgtn-open-settings{
    background: #1d1f23;
    border-color: rgba(255,255,255,.10);
    color: #e8eaed !important;
    box-shadow: 0 6px 18px rgba(0,0,0,.35);
  }
  #cgtn-open-settings.cgtn-open-settings:hover{
    /* 暗い背景を少しだけ明るくするイメージ */
    background: color-mix(in srgb, #1d1f23 70%, #ffffff 30%);
  }
}

`;

const LIST_CSS = `
/* =========================
   2) LIST PANEL（外枠/配置）
========================= */
#cgpt-list-panel{
  position:fixed; right:120px; bottom:140px;
  display:none; flex-direction:column;
  z-index:2147483646; width:360px; max-width:min(92vw,420px);
  max-height:min(62vh,680px); border:1px solid rgba(0,0,0,.12);
  border-radius:16px; background:rgba(255,255,255,.98);
  box-shadow:0 18px 56px rgba(0,0,0,.25); overflow:hidden;
  resize: horizontal;   /* つまみで横方向にリサイズ */
  overflow: auto;       /* resize を効かせるため必要 */
  min-width: 260px;
  max-width: 720px;
}

#cgpt-list-panel.no-anim * {
  transition: none !important;
}

/* =========================
   3) LIST: ヘッダ/本文/フッタ
========================= */
/* ヘッダ（定義が複数回あるため順序を保持しつつ集約） */
#cgpt-list-head{ display:flex; align-items:center; gap:8px; border-bottom:1px solid rgba(0,0,0,.1); padding:6px 10px }
/* DUPLICATE: 下に同じセレクタの再定義あり（position:sticky 含む） */

/*#cgpt-list-close{ all:unset; border:1px solid rgba(0,0,0,.12); border-radius:8px; padding:6px 8px; cursor:pointer }
*/
#cgpt-list-close{ all:unset; border:1px solid rgba(0,0,0,.12); border-radius:8px; padding:6px 8px }
#cgpt-bias-line,#cgpt-bias-band{ pointer-events:none!important }
.cgpt-nav-group[data-role="user"]{ background:rgba(240,246,255,.96); }
.cgpt-nav-group[data-role="assistant"]{ background:rgba(234,255,245,.96); }

#cgpt-list-grip{
  height:12px; border-radius:10px;
  background:linear-gradient(90deg,#aaa 18%,#d0d0d0 50%,#aaa 82%);
  opacity:.6; cursor:grab; flex:1
}
#cgpt-list-grip.dragging .drag-handle { cursor: grabbing; }

#cgpt-drag{
  width:92px; height:12px; border-radius:10px;
  background:linear-gradient(90deg,#aaa 18%,#d0d0d0 50%,#aaa 82%);
  opacity:.55; cursor:grab; box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)
}
#cgpt-drag.dragging .drag-handle { cursor: grabbing; }

#cgpt-list-foot{
  display:flex; gap:8px; align-items:center; flex-wrap:wrap;
  padding:6px 8px; border-top:1px solid rgba(0,0,0,.08)
}
#cgpt-pin-all-on,
#cgpt-pin-all-off{
  padding:2px 6px;
  font-size:11px;
  line-height:1.4;
}
#cgpt-list-foot[data-state="empty"] .ja,
#cgpt-list-foot[data-state="empty"] .en{
  opacity:.8; 
}
/* パネルは縦フレックスで head / body / foot を上下に配置（再定義） */
#cgpt-list-head{
  display:flex; align-items:center; gap:8px;
  border-bottom:1px solid rgba(0,0,0,.1); padding:6px 10px;
}
#cgpt-list-collapse{
  all:unset; border:1px solid rgba(0,0,0,.12); border-radius:8px; color:#000;
  padding:6px 8px; display:inline-grid; place-items:center;
}

/* 本文は可変。ここだけスクロールさせる（再定義） */
#cgpt-list-body{ flex:1; overflow:auto; padding:6px 8px; }

#cgpt-list-body .row { 
  display:flex;
  align-items:stretch; 
  gap:6px; 
  line-height:1.7;         /* 本文のline-heightと合わせる */
}
#cgpt-list-body .row::before{
  content: "";
  display:inline-block;
  min-width:2.0em;
  margin-right:8px;
  text-align:right;
  opacity:0;
  font-size:11px;
  line-height:inherit;      /* 本文行に合わせる */
  vertical-align:middle;    /* ベースラインずれ対策 */
}
/* 行の右端のアイコン列（付箋 + プレビュー） */
#cgpt-list-body .ops{
  display:flex;
  flex-direction: row;   /* ★ 横並びに戻す */
  align-items: center;   /* ★ アイコン同士を縦中央揃え */
  justify-content: flex-end;
  gap:4px;
}
/* .row の中で .ops 自体を縦中央にする */
#cgpt-list-body .row .ops{
  align-self: center;    /* ★ 行全体の高さの中で中央寄せ */
}
#cgpt-list-body .turn-idx-anchor { counter-increment: cgtn_turn; }
#cgpt-list-body .turn-idx-anchor::before{
  content: counter(cgtn_turn);
  opacity:.75;
  color:#333;
  vertical-align:middle;
}

#cgpt-list-body .txt{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1 }
#cgpt-list-body .txt:hover {background: skyblue;}



#cgpt-list-foot{
  display:flex; gap:8px; align-items:center; justify-content:flex-end;
  flex-wrap:wrap; padding:6px 8px; border-top:1px solid rgba(0,0,0,.08);
}
/* フッター常時最下（sticky不要） */

/* パネルを畳んだ見た目（ヘッダだけ残す） */
#cgpt-list-panel.collapsed { max-height: 38px; }
#cgpt-list-panel.collapsed #cgpt-list-body,
#cgpt-list-panel.collapsed #cgpt-list-foot { display:none; }

/* ヘッダ sticky 版（DUPLICATE: 上の #cgpt-list-head と重複） */
#cgpt-list-head{
  display:flex; align-items:center; gap:8px;
  border-bottom:1px solid rgba(0,0,0,.1); padding:6px 10px;
  position:sticky; top:0; background:rgba(255,255,255,.98)
}
#cgpt-list-close{ all:unset; border:1px solid rgba(0,0,0,.12); border-radius:8px; }
#cgpt-list-collapse{ all:unset; border:1px solid rgba(0,0,0,.12); border-radius:8px; padding:4px 8px;}

/* =========================
   4) LIST: 行/ピン/操作子
========================= */
#cgpt-list-panel .row .clip-dummy { visibility:hidden; pointer-events:none; }
#cgpt-list-panel .row .cgtn-clip-pin[aria-pressed="false"] { color:#979797; }
#cgpt-list-panel .row .cgtn-clip-pin[aria-pressed="true"]  { color:#e60033; }
/* pinOnly=ON のとき、ピンが無い行を非表示にする '25.11.27 */
#cgpt-list-panel.pinonly .row:not([data-pin="1"]) {
    display: none !important;
}

/* ★ 添付ラベルの視認性（最小差分） */
#cgpt-list-panel .row .attach {
  margin-left: .5em;
  opacity: .75;
  font-size: 0.92em;
  white-space: nowrap;
}

#cgpt-list-panel .row.user-turn  { background: #F2F5F8; }
#cgpt-list-panel .row.asst-turn  { background: #F2FFF9; }

/*#cgpt-nav button:focus,*/
#cgpt-nav label:focus,
#cgpt-list-panel button:focus,
#cgpt-list-panel label:focus {
  outline: none !important;
  box-shadow: none !important;
}
/*#cgpt-nav button:focus-visible,*/
#cgpt-list-panel button:focus-visible {
  outline: 2px solid rgba(0,0,0,.25);
  outline-offset: 2px;
}
#cgpt-nav :where(button,label,input[type=checkbox]):focus:not(:focus-visible),
#cgpt-list-panel :where(button,label,input[type=checkbox]):focus:not(:focus-visible) {
  outline: none !important;
  box-shadow: none !important;
}

/* 行、無しにすると違和感あるので 
#cgpt-list-body .row { cursor: pointer; }
*/

/* 本文のみ */
#cgpt-list-body .txt { cursor: pointer; }

/* プレビュー領域の専用カーソル */
#cgpt-list-body .cgtn-preview-btn {cursor:url("${prvCurURL}"), pointer; }

/* 付箋クリック領域の専用カーソル（ON=赤 / OFF=赤） */
#cgpt-list-body .cgtn-clip-pin {cursor:url("${pinCurURL}"), pointer; }

/* リストを最新にする（ミニボタン） 
#cgpt-list-refresh.cgtn-mini-btn{
  all: unset; cursor: pointer; padding: 2px 6px; border-radius: 6px;
}
#cgpt-list-refresh.cgtn-mini-btn:hover{ background: rgba(0,0,0,.08); }
*/
.cgtn-mini-btn {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:28px;
  height:28px;
  border-radius:999px;
  border:none;
  background:transparent;
  cursor:pointer;
  padding:0;
}

.cgtn-mini-btn svg {
  width:20px;
  height:20px;
}

/* ホバーで薄いグレー丸（既存リロードと同じ感じに） */
.cgtn-mini-btn:hover {
  background:rgba(0,0,0,.06);
}

/* リストパネル内の行（ライト読みやすさ重視） */
#cgpt-list-panel .row{ background: #fafafa; color: #0b0d12; }
/* 交互やホバーがあれば微差で */
/*#cgpt-list-panel .row:hover{ background:#f2f5f8; }//要修正　緑系*/
#cgpt-list-panel .row.user-turn:hover  { background: #D9E2EB; }
#cgpt-list-panel .row.asst-turn:hover  { background: #DDFFF0; }
#cgpt-list-panel .cgtn-iconbtn svg {
  vertical-align: middle;
}

#cgpt-chat-title {
  max-width:100%;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  text-align:center;
  font-weight:600;
  font-size:13px;
  opacity:.9;
  padding:1px 6px 0;
  line-height:1.2;
}
/* =========================
   5) PREVIEW（ポップ/吹き出し）
========================= */
.cgtn-preview-popup {
  position: absolute;
  background: #fff;
  border: 1px solid rgba(0,0,0,.15);
  border-radius: 6px;
  padding: 8px 10px;
  max-width: 320px;
  max-height: 240px;
  overflow: auto;
  box-shadow: 0 6px 24px rgba(0,0,0,.18);
  font-size: 12px;
  z-index: 2147483647;
  white-space: normal;
}

.cgtn-preview-btn,
.cgtn-clip-pin {
  all: unset;
  font-size: 12px;
  padding: 3px 5px;
}
.cgtn-preview-btn:hover,
.cgtn-clip-pin:hover {
  color: White;
  background: lightgray;
/*  filter:brightness(1.1);*/
}

/* 追加のプレビュー吹き出し（ポップオーバー） */
.cgtn-popover {
  position: fixed;
  z-index: 2147483647 !important;  /* ほぼ最大。モーダルより前面へ */
  max-width: 520px; max-height: 320px;
  padding: 10px 12px; border-radius: 10px;
  background: rgba(20,20,20,.96); color: #fff;
  box-shadow: 0 10px 28px rgba(0,0,0,.35);
  overflow: auto; display: none;
  font-size: 12px; line-height: 1.5;
  transform: translate(10px, 14px); /* マウスから少し離す */
  white-space: pre-wrap;             /* 改行保持しつつ折返し */
  will-change: left, top, transform; /* 位置追従を滑らかに */
  pointer-events: none;              /* ホバー中にポップに引っかからない */
}
.cgtn-popover[data-show="1"] { display: block; }

/* =========================
   6) PREVIEW DOCK（常駐プレビュー）
   ※ 同じ .cgtn-dock の定義が2回あり → 下が最終適用
========================= */
.cgtn-dock {
  position: absolute;
  z-index: 2147483647 !ント;
  width: 460px; max-width: 80vw;
  height: 300px; max-height: 80vh;
  background: rgba(20,20,20,.96);
  color: #fff;
  box-shadow: 0 10px 28px rgba(0,0,0,.35);
  border-radius: 10px;
  display: none;                /* クリックで表示に切り替え */
  overflow: hidden;             /* ヘッダー/ボディを内側で制御 */
  user-select: none;
}
.cgtn-dock[data-show="1"] { display: block; }

.cgtn-dock-head {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; background: rgba(255,255,255,.08);
  cursor: move;                 /* ドラッグで移動 */
}
.cgtn-dock-title { font-weight: 600; font-size: 12px; opacity: .9; }
.cgtn-dock-close {
  margin-left: auto; border: none; background: transparent;
  color: #fff; cursor: pointer; font-size: 14px;
}
.cgtn-dock-body {
  height: calc(100% - 40px);    /* だいたいヘッダー分 */
  overflow: auto; padding: 10px 12px; white-space: pre-wrap; user-select: text;
}
.cgtn-dock-resize { position: absolute; right: 6px; bottom: 6px; width: 14px; height: 14px; cursor: nwse-resize; opacity: .7; }
.cgtn-dock[data-pinned="1"] .cgtn-dock-head { background: rgba(255,255,255,.16); }

/* CONFLICT: ここで .cgtn-dock が「ライト基調」に再定義される（上を上書き） */
.cgtn-dock{
  /* ライト基調（少し濃いめのグレー） */
  background: #eceff3;              /* ← 上の rgba(20,20,20,.96) を上書き */
  color: #0b0d12;
  border: 1px solid #cfd6de;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08);
  backdrop-filter: none;
}
.cgtn-dock .cgtn-dock-head{
  background: #dfe5ec; color: #0b0d12; font-weight: 600;
  padding: 6px 8px; border-bottom: 1px solid #cfd6de;
}
.cgtn-dock .cgtn-dock-body{
  padding: 10px 12px; line-height: 1.6; overflow: auto; max-height: 60vh;
}
.cgtn-dock .cgtn-dock-close,
.cgtn-dock .cgtn-dock-resize{ color: #2c313a; opacity: .9; }
.cgtn-dock .cgtn-dock-close:hover,
.cgtn-dock .cgtn-dock-resize:hover{ opacity: 1; }

/* ダーク環境でも読める最低限（影は弱めに） */
@media (prefers-color-scheme: dark){
  .cgtn-dock{
    background: #1e2126; color: #eef2f6;
    border-color: #313842; box-shadow: 0 8px 20px rgba(0,0,0,.35);
  }
  .cgtn-dock .cgtn-dock-head{
    background:#2a2f36; color:#eef2f6; border-bottom-color:#313842;
  }
  .cgtn-dock .cgtn-dock-close,
  .cgtn-dock .cgtn-dock-resize{ color:#cfd8e3; }
}
`;

const MISC_CSS = `
/* =========================
   7) リスト補助（情報/色/スクロールバー）
========================= */
  #cgpt-list-filter{
    display:flex;
    gap:8px;
    padding:6px 8px;
    position:sticky;
    top:34px;
    z-index:1;
    background:rgba(255,255,255,.85);
    backdrop-filter:blur(4px);
    justify-content: center;
    align-items: center;
  }
  /* === リストフィルタ: ラベル見た目 === */
  #cgpt-list-filter label{
    user-select: none;
    cursor: pointer;
  }

  #cgpt-list-filter label:has(input:checked) .cgtn-pill-btn{
    background:#222;
    color:#fff;
    border-color:#222;
  }
  #cgpt-list-filter label:hover .cgtn-pill-btn{
    background: rgba(0,0,0,.06);
  }

  /* リストフィルタのラジオ本体は隠す（ラベルで操作） */
  #cgpt-list-filter input[type="radio"]{
    position:absolute;
    opacity:0;
    pointer-events:none;
    margin:0;
  }

#cgpt-list-foot { display:flex; align-items:center; gap:2px; }
#cgpt-list-foot-info { margin-left:auto; }

/* トグルラベルの文字色を黒固定 
.cgpt-viz-toggle span[data-i18n="line"] { color: #000; }
.cgpt-list-toggle span[data-i18n="list"] { color: #000; }
*/

/* フッタ系ボタンの色 */
#cgpt-list-foot,      /* リストパネルのフッタ */
#cgpt-list-refresh,   /* 最新にする */
#cgpt-pin-filter,     /* 付箋のみ釦 */
#cgpt-list-collapse { /* 付箋フィルターボタン */
  color:#000
}

.cgtn-badgehost { position: relative; } 

.cgtn-badge {
  position: absolute;
  top: -4px; right: -4px;
  min-width: 14px; height: 14px;
  padding: 0 4px;
  border-radius: 999px;
  background: #e11; color: #fff;
  font-size: 10px; font-weight: 700;
  text-align: center;
  box-shadow: 0 0 0 2px #fff; /* 背景と縁切り */

  /* ★ ここから追加：数字をきっちり中央に */
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
} 

/* スクロールバー（WebKit系） */
.cgtn-dock-body::-webkit-scrollbar,
#cgpt-list-body::-webkit-scrollbar{ width: 10px; }
.cgtn-dock-body::-webkit-scrollbar,
#cgpt-list-body::-webkit-scrollbar-track{
  background: rgba(0,0,0,.05); border-radius: 10px;
}
.cgtn-dock-body::-webkit-scrollbar,
#cgpt-list-body::-webkit-scrollbar-thumb{
  background: rgba(0,0,0,.28); border-radius: 10px;
  border: 1px solid transparent; background-clip: padding-box;
}
.cgtn-dock-body::-webkit-scrollbar,
#cgpt-list-body::-webkit-scrollbar-thumb:hover{ background: rgba(0,0,0,.45); }
`;

/* 注入ヘルパ */
function injectCss(css){
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}
function injectCssMany(...chunks){
  injectCss(chunks.join('\n'));
}

// 4) Preview: プレビューウィンドウ
const PREVIEW_CSS = `
/* ---------- Preview window ---------- */
#cgpt-preview{ border-radius:var(--cgtn-radius); }
#cgpt-preview .header .cgtn-iconbtn{ /* 共通ボタン */ }

/* 一覧パネルのアイコンボタン共通 */
#cgpt-list-panel .cgtn-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

/* ボタン自体の基本色 */
#cgpt-list-body .cgtn-clip-pin{
  color:#444;
}

/* 未ピン時はちょっと薄くする（既存の .off があればそれで OK） */
#cgpt-list-body .cgtn-clip-pin.off{
  opacity:.45;
}

/* SVG のサイズと線の太さ */
#cgpt-list-body .cgtn-clip-pin svg.cgtn-pin-svg{
  width:16px;
  height:16px;
  display:block;
  stroke:currentColor;
  fill:none;
}


/* ピン ON 時：ボタン色を赤にし、中身も塗りつぶす */
#cgpt-list-body .cgtn-clip-pin.on{
  color:#e53935;        /* 好きな赤に調整してOK */
}

#cgpt-list-body .cgtn-clip-pin.on svg.cgtn-pin-svg{
  fill:currentColor;
}
/* ナビ下部のミニボタン行（⟳ と ⚙） */
#cgpt-nav .cgtn-mini-row{
  display:flex;
  justify-content:center;
  align-items:center;
  gap:6px;
  margin:4px 0 2px;
}

/* ミニボタン本体を丸く中央寄せ */
#cgpt-nav .cgtn-mini-btn{
  width:26px;
  height:26px;
  border-radius:999px;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:0;
}

/* リフレッシュのアイコンサイズを揃える */
#cgpt-nav .cgtn-mini-btn svg{
  width:16px;
  height:16px;
}


`;

/* ここで一括注入（順序固定） */
injectCssMany(NAV_CSS, LIST_CSS, PREVIEW_CSS /*←上で宣言*/, MISC_CSS);


/*ｺｺｶﾗ*/
// いちばん最後に差すフォーカス無効CSS（:focus-visible は保持）
(function injectFocusKillerCss(){
  if (document.getElementById('cgtn-focus-css')) return;
  const s = document.createElement('style');
  s.id = 'cgtn-focus-css';
  s.textContent = `
#cgpt-nav :where(button,label,input[type=checkbox]):focus:not(:focus-visible),
#cgpt-list-panel :where(button,label,input[type=checkbox]):focus:not(:focus-visible){
  outline: none !important;
  box-shadow: none !important;
}
#cgpt-nav :where(button,label,input[type=checkbox])::-moz-focus-inner,
#cgpt-list-panel :where(button,label,input[type=checkbox])::-moz-focus-inner{
  border:0 !important;

}
  `;
  document.head.appendChild(s);
})();
/*ｺｺﾏﾃﾞ*/

  function installUI(){
    if (document.getElementById('cgpt-nav')) return;

    const box = document.createElement('div');
    box.id = 'cgpt-nav';
    box.innerHTML = `
      <div id="cgpt-drag" title=""></div>

      <!-- === ユーザー === -->
      <div class="cgpt-nav-group" data-role="user">
        <div class="cgpt-nav-label" data-i18n="user"></div>
        <button class="cgtn-pill-btn" data-act="top" data-i18n="top"></button>
        <button class="cgtn-pill-btn" data-act="prev" data-i18n="prev"></button>
        <button class="cgtn-pill-btn" data-act="next" data-i18n="next"></button>
        <button class="cgtn-pill-btn" data-act="bottom" data-i18n="bottom"></button>
      </div>

      <!-- === アシスタント === -->
      <div class="cgpt-nav-group" data-role="assistant">
        <div class="cgpt-nav-label" data-i18n="assistant"></div>
        <button class="cgtn-pill-btn" data-act="top" data-i18n="top"></button>
        <button class="cgtn-pill-btn" data-act="prev" data-i18n="prev"></button>
        <button class="cgtn-pill-btn" data-act="next" data-i18n="next"></button>
        <button class="cgtn-pill-btn" data-act="bottom" data-i18n="bottom"></button>
      </div>

      <!-- === 全体ナビ + 設定 === -->
      <div class="cgpt-nav-group" data-role="all">
        <div class="cgpt-nav-label" data-i18n="all"></div>

        <div class="cgpt-grid2">
          <button class="cgtn-pill-btn" data-act="top">▲</button>
          <button class="cgtn-pill-btn" data-act="bottom">▼</button>
        </div>

        <!-- 言語切替 -->
        <button class="cgtn-pill-btn cgpt-lang-btn"></button>

        <!-- 基準線トグル（非表示） -->
        <label class="cgpt-viz-toggle" style="display:none !important;">
          <input id="cgpt-viz" type="checkbox" style="accent-color:#888;">
          <span data-i18n="line"></span>
        </label>

        <!-- 一覧表示 -->
        <label class="cgpt-list-toggle">
          <input id="cgpt-list-toggle" type="checkbox">
          <span class="cgtn-pill-btn" data-i18n="list"></span>
        </label>
        <div class="cgtn-mini-row">
        <!-- 最新にするボタン（ナビパネル） -->
        <button id="cgpt-navi-refresh" class="cgtn-mini-btn" type="button"
                title="${T('navi.refresh')}" aria-label="${T('navi.refresh')}">
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
        <!-- 設定ボタン -->
        <button id="cgtn-open-settings" class="cgtn-mini-btn " 
                title="設定を開く">⚙</button>
      </div>
      </div>
    `;


    document.body.appendChild(box);

    // 言語リゾルバ（tooltipsの言語切替に使用）
    window.CGTN_SHARED?.setLangResolver?.(() =>
      window.CGTN_UI?.getLang?.()
      || (window.CGTN_SHARED?.getCFG?.()?.lang || (window.CGTN_SHARED?.getCFG?.()?.english ? 'en' : 'ja'))
    );

    // ドラッグ移動（保存は shared 側）
    (function enableDragging(){
      const grip = box.querySelector('#cgpt-drag');
      let dragging=false, offX=0, offY=0;
      grip.addEventListener('pointerdown',e=>{
        dragging=true; const r=box.getBoundingClientRect();
        offX=e.clientX-r.left; offY=e.clientY-r.top;
        try{ grip.setPointerCapture(e.pointerId); }catch{}
      });
      window.addEventListener('pointermove',e=>{
        if(!dragging) return;
        box.style.left=(e.clientX-offX)+'px';
        box.style.top =(e.clientY-offY)+'px';
      },{passive:true});
      window.addEventListener('pointerup',e=>{
        if(!dragging) return;
        dragging=false;
        try{ grip.releasePointerCapture(e.pointerId); }catch{}
        clampPanelWithinViewport();
        const r=box.getBoundingClientRect();
        SH.saveSettingsPatch({ panel:{ x:r.left, y:r.top } });
      });
    })();

    // 初期表示：文言と保存状態
    applyLang();
    try { box.querySelector('#cgpt-viz').checked = !!SH.getCFG().showViz; } catch {}

    // === チェック群の初期反映とイベント ===
    try {
      const cfg = SH.getCFG() || {};
      const listChk = box.querySelector('#cgpt-list-toggle');

      listChk.checked = !!cfg.list?.enabled;

      // 一覧トグル：保存 → 表示切替
      listChk.addEventListener('change', () => {
        const on  = listChk.checked;
        const cur = SH.getCFG() || {};
        const patch = on
          ? { list:{ ...(cur.list||{}), enabled:true } }
          : { list:{ ...(cur.list||{}), enabled:false,  Only:false } };

        SH.saveSettingsPatch(patch);
//★★★もしかしたら不要？★★★
//console.debug('[installUI] window.CGTN_LOGIC?.setListEnabled on: ',on);
//        window.CGTN_LOGIC?.setListEnabled?.(on);

        // フォーカスを外して“カーソル残り”を防ぐ ★★★★
        try{ listChk.blur(); }catch{}
      });
    } catch {}

    // 既定値反映（復唱：念のため）
    try {
      box.querySelector('#cgpt-viz').checked  = !!SH.getCFG().showViz;
      box.querySelector('#cgpt-list-toggle').checked = !!(SH.getCFG().list?.enabled);
    } catch {}

    window.CGTN_SHARED?.applyTooltips?.({
      '#cgpt-nav [data-role="user"]      [data-act="top"]'    : 'nav.top',
      '#cgpt-nav [data-role="user"]      [data-act="bottom"]' : 'nav.bottom',
      '#cgpt-nav [data-role="user"]      [data-act="prev"]'   : 'nav.prev',
      '#cgpt-nav [data-role="user"]      [data-act="next"]'   : 'nav.next',
      '#cgpt-nav [data-role="assistant"] [data-act="top"]'    : 'nav.top',
      '#cgpt-nav [data-role="assistant"] [data-act="bottom"]' : 'nav.bottom',
      '#cgpt-nav [data-role="assistant"] [data-act="prev"]'   : 'nav.prev',
      '#cgpt-nav [data-role="assistant"] [data-act="next"]'   : 'nav.next',
      '#cgpt-drag'               : 'nav.drag',
      '#cgpt-nav .cgpt-lang-btn' : 'nav.lang',
      '#cgpt-viz'                : 'nav.viz',
      '#cgpt-list-toggle'        : 'nav.list',
      '#cgpt-navi-refresh'       : 'nav.refresh',
      '#cgtn-open-settings'      : 'nav.openSettings'
    }, document);

    // === 手動リフレッシュ（ナビパネル） ===
    (function bindNaviRefresh(){
      const btn = box.querySelector('#cgpt-navi-refresh');
      if (!btn) return;
    
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    
        try {
          // 内部状態を完全再構築
          LG.rebuild?.();
    
          // 一覧パネルが開いていれば再描画
          if (SH.isListOpen?.()) {
            LG.renderList?.(true);
          }
    
          console.debug('[CGTN] manual refresh (nav): rebuild + optional renderList');
        } catch (e) {
          console.warn('[CGTN] nav refresh failed', e);
        }
      });
    })();

    // === フォーカスが残らない最終防御（モダリティ + パーキング） ===
    (function enforceNoFocusNav(){
      const root = document.getElementById('cgpt-nav');
      if (!root || root._cgtnFocusGuard) return;
      root._cgtnFocusGuard = true;

      // 直近入力モダリティを覚える（キーボード:true / ポインタ:false）
      let lastWasKeyboard = false;
      window.addEventListener('keydown',  () => { lastWasKeyboard = true;  }, {capture:true});
      window.addEventListener('pointerdown', () => { lastWasKeyboard = false; }, {capture:true});

      // フォーカスの逃がし先（画面外・不可視）
      let park = document.getElementById('cgtn-focus-park');
      if (!park) {
        park = document.createElement('button');
        park.id = 'cgtn-focus-park';
        park.type = 'button';
        park.tabIndex = -1;
        park.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none;';
        document.body.appendChild(park);
      }

      const INTERACTIVE = 'button, label, input[type=checkbox]';

      // マウス系で root 内に focusin したら即座に追い出す
      root.addEventListener('focusin', (e) => {
        const el = e.target && e.target.closest(INTERACTIVE);
        if (el && !lastWasKeyboard) {
          // クリック・ドラッグ等で入ったフォーカスは排除
          try { el.blur(); } catch {}
          try { park.focus({ preventScroll:true }); } catch {}
        }
      }, true); // ← capture

      // 念押し：マウスアップで常にパークへ
      root.addEventListener('mouseup', () => {
        try {
          // activeElement がまだ残ってたらパーキングに移す
          if (document.activeElement && root.contains(document.activeElement)) {
            park.focus({ preventScroll:true });
          }
        } catch {}
      }, { capture:true });
    })();

  }
/* installUI ｺｺﾏﾃﾞ*/

  function applyLang(){
    const box = document.getElementById('cgpt-nav');
    if (!box) return;
    const cur = (SH.getCFG?.() || {}).lang;
//console.log("applyLang cur:",cur);
    // 共通翻訳関数を取得
    const t = window.CGTN_I18N?.t || ((k)=>k);

    // data-i18n属性を持つ要素すべてに適用
    box.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const txt = t(key);
      if (!key || !txt) return;
      // テキスト＆タイトルを同時更新（title不要な要素は上書きしても無害）
      el.textContent = txt;
      el.title = txt;
    });

    // 言語ボタン
    const langBtn = box.querySelector('.cgpt-lang-btn');
    if (langBtn) langBtn.textContent = T('langBtn');
    // ドラッグタイトル
    const drag = box.querySelector('#cgpt-drag');
    if (drag) drag.title = T('nav.drag');

    // プレビュータイトル
    const h = document.querySelector('#cgtn-preview-title');
    if (h) h.textContent = T('preview');

    // リストパネルのロールフィルタも言語を反映 '25.11.20
    try { window.CGTN_LOGIC?.applyListFilterLang?.(); } catch {}
    // リストパネルのフッターも言語を反映 '25.11.20
    try { window.CGTN_LOGIC?.updateListFooterInfo?.(); } catch(_) {}
    // リストパネルのタイトル
    try { window.CGTN_LOGIC?.updateListChatTitle?.(); } catch(_){}
  }

  function toggleLang() {
    // 現在の言語を取得（設定がなければ ja をデフォルトに）
    const cur = (SH.getCFG?.() || {}).lang || 'ja';
    const next = (cur && String(cur).toLowerCase().startsWith('en')) ? 'ja' : 'en';

    // --- 言語設定の共有と即時反映 ---
    try {
      SH.saveSettingsPatch?.({ lang: next }); // ← LANG ではなく next
      if (window.CGTN_I18N) {
        window.CGTN_I18N._forceLang = next; // ← 即反映
      }
    } catch (e) {
      console.warn("toggleLang error", e);
    }

    // --- UI反映 ---
    applyLang();

    // --- ツールチップ再翻訳 ---
    SH.updateTooltips?.();

    // --- 必要な場合のみリスト再描画 ---
    const isListVisible = window.CGTN_LOGIC?.isListVisible?.();
    const isPinOnly = !!(window.CGTN_SHARED?.getCFG?.()?.list?.pinOnly);

//    window.CGTN_LOGIC?.updateListFooterInfo?.();
    if (isListVisible || isPinOnly) {
      window.CGTN_LOGIC.renderList(true);
    }
  }


  function clampPanelWithinViewport(){
    const box = document.getElementById('cgpt-nav'); if (!box) return;
    const margin = 8;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const r = box.getBoundingClientRect();
    box.style.right = 'auto'; box.style.bottom = 'auto';
    let x = Number.isFinite(r.left) ? r.left : vw - r.width - 12;
    let y = Number.isFinite(r.top)  ? r.top  : vh - r.height - 140;
    x = Math.min(vw - r.width - margin, Math.max(margin, x));
    y = Math.min(vh - r.height - margin, Math.max(margin, y));
    box.style.left = `${x}px`;
    box.style.top  = `${y}px`;
  }

  // 公開API
  NS.installUI = installUI;
  NS.clampPanelWithinViewport = clampPanelWithinViewport;
  NS.applyLang = applyLang;
  NS.toggleLang = toggleLang;

  // 起動直後に一度だけ適用（navがまだ無ければ無害）
  document.addEventListener('DOMContentLoaded', applyLang);

})();
