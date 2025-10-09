// options.js — 設定画面（i18n.js/ shared.js に統一）
(() => {
  'use strict';

  const SH = window.CGTN_SHARED || {};
  const T  = (k)=> window.CGTN_I18N?.t?.(k) || k;

  const $  = (id) => document.getElementById(id);
  const exists = (id) => !!$(id);
  const clamp = (n, lo, hi) => Math.min(Math.max(Number(n), lo), hi);

  // 既定値（shared側の DEFAULTS があれば尊重）
  const DEF = (SH.DEFAULTS) || {
    centerBias: 0.40, headerPx: 0, eps: 20, lockMs: 700, showViz: false,
    panel:{ x:null, y:null },
    list:{ enabled:false, pinOnly:false, maxItems:30, maxChars:40, fontSize:12, w:null, h:null, x:null, y:null }
  };

  function sanitize(raw){
    const base = JSON.parse(JSON.stringify(DEF));
    const v = {
      centerBias : clamp(raw?.centerBias ?? base.centerBias, 0, 1),
      headerPx   : clamp(raw?.headerPx   ?? base.headerPx,   0, 2000),
      eps        : clamp(raw?.eps        ?? base.eps,        0, 120),
      lockMs     : clamp(raw?.lockMs     ?? base.lockMs,     0, 3000),
      showViz    : !!raw?.showViz,
      panel      : raw?.panel || base.panel,
      list: {
        enabled : !!(raw?.list?.enabled ?? base.list.enabled),
        pinOnly : !!(raw?.list?.pinOnly ?? base.list.pinOnly),
        maxItems: clamp(raw?.list?.maxItems ?? base.list.maxItems, 1, 200),
        maxChars: clamp(raw?.list?.maxChars ?? base.list.maxChars, 10, 400),
        fontSize: clamp(raw?.list?.fontSize ?? base.list.fontSize, 8, 24),
        w: raw?.list?.w ?? base.list.w,
        h: raw?.list?.h ?? base.list.h,
        x: raw?.list?.x ?? base.list.x,
        y: raw?.list?.y ?? base.list.y
      }
    };
    return v;
  }

  function applyToUI(cfg){
    const v = sanitize(cfg||{});
    try{
      if (exists('centerBias'))   $('centerBias').value   = v.centerBias;
      if (exists('headerPx'))     $('headerPx').value     = v.headerPx;
      if (exists('eps'))          $('eps').value          = v.eps;
      if (exists('lockMs'))       $('lockMs').value       = v.lockMs;
      if (exists('showViz'))      $('showViz').checked    = !!v.showViz;

      if (exists('listEnabled'))  $('listEnabled').checked= !!v.list.enabled;
      if (exists('pinOnly'))      $('pinOnly').checked    = !!v.list.pinOnly;
      if (exists('listMaxItems')) $('listMaxItems').value = v.list.maxItems;
      if (exists('listMaxChars')) $('listMaxChars').value = v.list.maxChars;
      if (exists('listFontSize')) $('listFontSize').value = v.list.fontSize;
    }catch(e){ console.warn('applyToUI failed', e); }
  }

  function uiToCfg(){
    return sanitize({
      centerBias   : $('centerBias')?.value,
      headerPx     : $('headerPx')?.value,
      eps          : $('eps')?.value,
      lockMs       : $('lockMs')?.value,
      showViz      : $('showViz')?.checked,
      list: {
        enabled : $('listEnabled')?.checked,
        pinOnly : $('pinOnly')?.checked,
        maxItems: $('listMaxItems')?.value,
        maxChars: $('listMaxChars')?.value,
        fontSize: $('listFontSize')?.value
      }
    });
  }

  function migrateObsoleteKeys(cfg){
    // 使っていないキーは保存前に除去
    if (cfg?.list) {
      delete cfg.list.maxItems;   // 表示件数
      delete cfg.viz?.headOffset; // ヘッダ補正
    }
    return cfg;
  }

  function saveAll(){
    let cfg = uiToCfg();
    cfg = migrateObsoleteKeys(cfg);
    SH.saveSettings(cfg, showSavedToast);
  }

  function showMsg(txt){
    const box = $('msg'); if (!box) return;
    box.textContent = txt;
    box.style.display='block';
    setTimeout(()=> box.style.display='none', 1200);
  }

  function renderPinsManager(){
    const root = document.getElementById('pins-manager');
    const cfg  = SH.getCFG() || {};
    const by   = cfg.pinsByChat || {};
    const meta = cfg.chatMeta || {};

    const rows = Object.entries(by).map(([chatId, rec]) => {
      const title = meta?.[chatId]?.title || '（無題チャット）';
      const pins  = Array.isArray(rec?.pins) ? rec.pins : [];
      const count = pins.reduce((a,b)=>a+(b?1:0),0);
      const updated = rec?.updatedAt ? new Date(rec.updatedAt).toLocaleString() : '';
      return {chatId, title, count, updated};
    });

    root.innerHTML = `
      <div class="pins-table">
        <div class="hd">チャット</div>
        <div class="hd">付箋数</div>
        <div class="hd">更新</div>
        <div class="hd">操作</div>
        ${rows.map(r=>`
          <div class="row" data-chat="${r.chatId}">
            <div class="title">${SH.escapeHtml(r.title)}</div>
            <div class="count">${r.count}</div>
            <div class="updated">${r.updated}</div>
            <div class="ops"><button class="del">削除</button></div>
          </div>
        `).join('')}
      </div>
    `;

    root.querySelectorAll('.row .del').forEach(btn=>{
      btn.addEventListener('click', ev=>{
        const row   = ev.target.closest('.row');
        const chatId= row?.dataset?.chat;
        if (!chatId) return;
        deletePinsFromOptions(chatId);
      });
    });
  }

/*
  async function renderPinsManager(){
    const box = $('pins-table'); if (!box) return;
    await new Promise(res => (SH.loadSettings ? SH.loadSettings(res) : res()));
    const cfg = (SH.getCFG && SH.getCFG()) || {};
    const pins = cfg.pinsByChat || {};
    const aliveMap = (cfg.chatIndex && cfg.chatIndex.ids) || {};
    const nowOpen  = cfg.currentChatId || null;

    const rows = Object.entries(pins).map(([cid, rec])=>{
      const title = String(rec?.title || '(No Title)').replace(/\s+/g,' ').slice(0,120);
      const count = rec?.pins ? Object.keys(rec.pins).length : 0;
      const date  = rec?.updatedAt ? new Date(rec.updatedAt).toLocaleString() : '';
      const existsInSidebar = !!aliveMap[cid];
      const isNowOpen = (cid === nowOpen);
      const canDelete = !existsInSidebar && !isNowOpen;
      return { cid, title, count, date, canDelete, isNowOpen, existsInSidebar };
    }).sort((a,b)=> b.count - a.count || (a.title>b.title?1:-1));

    if (!rows.length){
      box.innerHTML = `
        <div class="empty" style="padding:14px 8px; color:var(--muted);">
          <div style="font-weight:700; margin-bottom:4px;">${T('options.emptyPinsTitle')}</div>
          <div>${T('options.emptyPinsDesc')}</div>
        </div>`;
      return;
    }

    const html = [
      '<table class="cgtn-pins-table">',
      `<thead><tr>
        <th>${T('options.thChat')}</th>
        <th>${T('options.thCount')}</th>
        <th>${T('options.thUpdated')}</th>
        <th>${T('options.thOps')}</th>
      </tr></thead>`,
      '<tbody>',
      ...rows.map(r => {
        const why = r.isNowOpen ? T('options.nowOpen') : (r.existsInSidebar ? T('options.stillExists') : '');
        return `
          <tr data-cid="${r.cid}" data-count="${r.count}">
            <td class="title">${titleEscape(r.title)}</td>
            <td class="count" style="text-align:right">${r.count}</td>
            <td class="date">${r.date}</td>
            <td class="ops">
              <button class="del" data-cid="${r.cid}" ${r.canDelete?'':`disabled title="${titleEscape(why)}"`}>${T('options.delBtn')}</button>
            </td>
          </tr>`;
      }),
      '</tbody></table>'
    ].join('');
    box.innerHTML = html;

    // 削除ボタン
    box.querySelectorAll('button.del').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const cid = btn.getAttribute('data-cid'); if (!cid) return;
        if (!confirm(T('options.delConfirm'))) return;
        try { SH.deletePinsForChat?.(cid); } catch(e){}
        await new Promise(r=>setTimeout(r, 80));
        await renderPinsManager();
      });
    });
  }
*/
  function titleEscape(s){
    return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.getElementById('lang-ja')?.addEventListener('click', ()=>{
    SH.setLang?.('ja'); // i18n.js にある setter を想定（無ければ自前で保持）
    applyToUI();        // 再レンダ
    renderPinsManager();
  });
  document.getElementById('lang-en')?.addEventListener('click', ()=>{
    SH.setLang?.('en');
    applyToUI();
    renderPinsManager();
  });

  document.getElementById('opt-viz-show')?.addEventListener('change', (ev)=>{
    const on = !!ev.target.checked;
    // 保存は通常フローでOK。即時反映の通知だけ投げる
    chrome.tabs.query({ url: '*://chatgpt.com/*' }, tabs=>{
      tabs.forEach(tab=>{
        chrome.tabs.sendMessage(tab.id, { type:'cgtn:viz-toggle', on });
      });
    });
  });

  async function deletePinsFromOptions(chatId){
    const yes = confirm('このチャットの付箋データを削除します。よろしいですか？');
    if (!yes) return;

    await SH.deletePinsForChat(chatId);

    // 現在開いているタブ側を即時同期（同じchatならローカルキャッシュを捨てて再描画）
    try {
      chrome.tabs.query({ url: '*://chatgpt.com/*' }, tabs=>{
        tabs.forEach(tab=>{
          chrome.tabs.sendMessage(tab.id, { type:'cgtn:pins-deleted', chatId });
        });
      });
    } catch {}

    renderPinsManager();
    showSavedToast('削除しました');
  }

  // 初期化
  document.addEventListener('DOMContentLoaded', async () => {
    try{
      // 見出し＆ヒント
      const sec = $('pins-manager') || document;
      const h3 = sec.querySelector('h3'); if (h3) h3.textContent = T('options.pinsTitle');
      const hint = sec.querySelector('.hint'); if (hint) hint.textContent = T('options.pinsHint');

      // 設定ロード→UI反映
      await new Promise(res => (SH.loadSettings ? SH.loadSettings(res) : res()));
      const cfg = (SH.getCFG && SH.getCFG()) || DEF;
      applyToUI(cfg);
      try { SH.renderViz?.(cfg, !!cfg.showViz); } catch {}

      // 付箋テーブル
      await renderPinsManager();

      // 入力で即保存
      const form = $('cgtn-options');
      form?.addEventListener('input', ()=>{
        try{
          const c2 = uiToCfg();
          SH.saveSettingsPatch?.(c2);
          try { SH.renderViz?.(c2, undefined); } catch {}
          showMsg(T('options.saved'));
        }catch(e){ console.warn('input handler failed', e); }
      });

      // submit（明示保存）
      form?.addEventListener('submit', (e)=>{
        e.preventDefault();
        try{
          const c3 = uiToCfg();
          applyToUI(c3);
          SH.saveSettingsPatch?.(c3);
          SH.renderViz?.(c3, !!c3.showViz);
          showMsg(T('options.saved'));
        }catch(e){ console.warn('submit failed', e); }
      });

      // 既定に戻す
      $('resetBtn')?.addEventListener('click', async ()=>{
        const def = sanitize(DEF);
        applyToUI(def);
        SH.saveSettingsPatch?.(def);
        SH.renderViz?.(def, false);
        showMsg(T('options.reset'));
        await renderPinsManager();
      });

      // タブ復帰で再描画
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') renderPinsManager();
      });

    }catch(e){
      console.error('options init failed', e);
    }
  });
})();
