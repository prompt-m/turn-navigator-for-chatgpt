// options.js — 設定画面（多言語＋空表示対応 版）
(function(){
  'use strict';
  const SH  = window.CGTN_SHARED;

  // ====== 言語判定 & 辞書 ======
  // ui 側と同じリゾルバを使う（なければブラウザ言語を簡易採用）
  const curLang = () =>
    (typeof SH?.getLang === 'function' && SH.getLang())
    || ((navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en');

  const I18N = {
    ja: {
      pinsTitle: '付箋データ管理',
      pinsHint: '各チャットの付箋（pinsByChat）を一覧。不要になったチャットは削除できます。',
      thChat: 'チャット',
      thCount: '付箋数',
      thUpdated: '更新',
      thOps: '',
      delBtn: '削除',
      delConfirm: 'このチャットの付箋データを削除します。よろしいですか？',
      emptyPinsTitle: '付箋データはまだありません',
      emptyPinsDesc: '拡張の一覧パネルで🔖アイコンを押すと、ここに表示されます。',
      saved: '保存しました',
      reset: '規定値に戻しました',
    },
    en: {
      pinsTitle: 'Pinned Data',
      pinsHint: 'List of pins (pinsByChat) per chat. You can delete data for a specific chat.',
      thChat: 'Chat',
      thCount: 'Pins',
      thUpdated: 'Updated',
      thOps: '',
      delBtn: 'Delete',
      delConfirm: 'Delete pin data for this chat. Are you sure?',
      emptyPinsTitle: 'No pinned data yet',
      emptyPinsDesc: 'Turn on the 🔖 icon in the list panel and chats will appear here.',
      saved: 'Saved',
      reset: 'Reset to defaults',
    }
  };
  const t = (k)=> (I18N[curLang()]||I18N.ja)[k] || k;

  const DEF = SH?.DEFAULTS || {
    centerBias: 0.40, headerPx: 0, eps: 20, lockMs: 700, showViz: false,
    panel:{ x:null, y:null },
    list:{ enabled:false, maxItems:30, maxChars:40, fontSize:12, w:null, h:null, x:null, y:null }
  };

  const clamp = (n, lo, hi) => Math.min(Math.max(Number(n), lo), hi);

  // ====== 付箋テーブル描画 ======
  async function renderPinsManager(){
    const box = document.getElementById('pins-table'); if (!box) return;

    // 最新をロードしてから描画（キャッシュずれ防止）
    await new Promise(res => SH.loadSettings?.(res));
    const cfg = SH.getCFG?.() || {};
    const map = cfg.pinsByChat || {};

    const rows = Object.entries(map).map(([cid, rec]) => {
      const title = (rec?.title || '(No Title)').replace(/\s+/g,' ').slice(0,120);
      const count = rec?.pins ? Object.keys(rec.pins).length : 0;
      const date  = rec?.updatedAt ? new Date(rec.updatedAt).toLocaleString() : '';
      return { cid, title, count, date };
    }).sort((a,b)=> b.count - a.count || (a.title>b.title?1:-1));

    // 空状態
    if (!rows.length){
      box.innerHTML = `
        <div class="empty" style="padding:14px 8px; color:var(--muted);">
          <div style="font-weight:700; margin-bottom:4px;">${t('emptyPinsTitle')}</div>
          <div>${t('emptyPinsDesc')}</div>
        </div>
      `;
      return;
    }

    // テーブル
    const html = [
      '<table class="cgtn-pins-table">',
      `<thead><tr><th>${t('thChat')}</th><th>${t('thCount')}</th><th>${t('thUpdated')}</th><th>${t('thOps')}</th></tr></thead>`,
      '<tbody>',
      ...rows.map(r => `
        <tr data-cid="${r.cid}" data-count="${r.count}">
          <td class="title">${escapeHtml(r.title)}</td>
          <td class="count" style="text-align:right">${r.count}</td>
          <td class="date">${r.date}</td>
          <td class="ops"><button class="del" data-cid="${r.cid}">${t('delBtn')}</button></td>
        </tr>
      `),
      '</tbody></table>'
    ].join('');
    box.innerHTML = html;

    // 削除ボタン
    box.querySelectorAll('button.del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cid = btn.getAttribute('data-cid');
        if (!cid) return;
        if (!confirm(t('delConfirm'))) return;
        SH.deletePinsForChat?.(cid);
        await renderPinsManager();
      });
    });
  }

  // ====== ユーティリティ ======
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ====== 設定フォーム同期 ======
  function sanitize(raw){
    const base = structuredClone(DEF);
    const v = {
      centerBias : clamp(raw.centerBias ?? base.centerBias, 0, 1),
      headerPx   : clamp(raw.headerPx   ?? base.headerPx,   0, 2000),
      eps        : clamp(raw.eps        ?? base.eps,        0, 120),
      lockMs     : clamp(raw.lockMs     ?? base.lockMs,     0, 3000),
      showViz    : !!raw.showViz,
      panel      : raw.panel || base.panel,
      list: {
        enabled : raw.list?.enabled ?? base.list.enabled,
        maxItems: clamp(raw.listMaxItems ?? raw.list?.maxItems ?? base.list.maxItems, 1, 200),
        maxChars: clamp(raw.listMaxChars ?? raw.list?.maxChars ?? base.list.maxChars, 10, 400),
        fontSize: clamp(raw.listFontSize ?? raw.list?.fontSize ?? base.list.fontSize, 8, 24),
        w: raw.list?.w ?? base.list.w,
        h: raw.list?.h ?? base.list.h,
        x: raw.list?.x ?? base.list.x,
        y: raw.list?.y ?? base.list.y
      }
    };
    return v;
  }

  function applyToUI(form, cfg){
    const v = sanitize(cfg || {});
    form.centerBias.value   = v.centerBias;
    form.headerPx.value     = v.headerPx;
    form.eps.value          = v.eps;
    form.lockMs.value       = v.lockMs;
    form.showViz.checked    = !!v.showViz;
    form.listMaxItems.value = v.list.maxItems;
    form.listMaxChars.value = v.list.maxChars;
    form.listFontSize.value = v.list.fontSize;
  }

  function uiToCfg(form){
    return sanitize({
      centerBias: form.centerBias.value,
      headerPx  : form.headerPx.value,
      eps       : form.eps.value,
      lockMs    : form.lockMs.value,
      showViz   : form.showViz.checked,
      listMaxItems: form.listMaxItems.value,
      listMaxChars: form.listMaxChars.value,
      listFontSize: form.listFontSize.value
    });
  }

  function showMsg(txt=t('saved')){
    const box = document.getElementById('msg');
    if (!box) return;
    box.textContent = txt;
    box.style.display = 'block';
    setTimeout(()=> box.style.display = 'none', 1200);
  }

  // ====== 初期化 ======
  document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('cgtn-options');
    if (!form) return;

    // 言語に応じて静的文言を更新（HTML側は日本語でもOK）
    try {
      // 見出しや説明は options.html 側の日本語で十分。必要ならここで差し替えも可能。
      // 今回は pins セクションのタイトル・ヒントのみ上書き
      const sec = document.getElementById('pins-manager') || form;
      sec.querySelector('h3') && (sec.querySelector('h3').textContent = t('pinsTitle'));
      const hint = sec.querySelector('.hint');
      if (hint) hint.textContent = t('pinsHint');
    } catch {}

    // 初期ロード：DEFAULTS → 保存値 の順で反映
    await new Promise(res => SH.loadSettings(() => res()));
    const cfg = SH.getCFG();
    applyToUI(form, cfg);
    try { SH.renderViz(cfg, false); } catch {}

    // 付箋テーブル（初回 & 言語表示）
    await renderPinsManager();

    // 入力で即保存
    form.addEventListener('input', async () => {
      const cfg2 = uiToCfg(form);
      SH.saveSettingsPatch(cfg2);
      try { SH.renderViz(cfg2, undefined); } catch {}
      showMsg();
    });

    // showViz 切替は即時反映
    form.addEventListener('change', (e) => {
      if (e.target?.id !== 'showViz') return;
      const cfg3 = uiToCfg(form);
      SH.saveSettingsPatch(cfg3);
      try { SH.renderViz(cfg3, !!cfg3.showViz); } catch {}
    });

    // 保存ボタン
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cfg4 = uiToCfg(form);
      applyToUI(form, cfg4);
      SH.saveSettingsPatch(cfg4);
      try { SH.renderViz(cfg4, !!cfg4.showViz); } catch {}
      showMsg();
    });

    // 既定に戻す
    document.getElementById('resetBtn')?.addEventListener('click', async () => {
      const def = structuredClone(DEF);
      applyToUI(form, def);
      SH.saveSettingsPatch(def);
      SH.renderViz(def, false);
      showMsg(t('reset'));
      await renderPinsManager();
    });

    // タブの可視状態が戻ったら最新化（別タブでピン操作された場合の追従）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') renderPinsManager();
    });
  });

  // 外部から再描画したいとき用
  window.CGTN_OPTIONS = Object.assign(window.CGTN_OPTIONS||{}, { renderPinsManager });
})();
