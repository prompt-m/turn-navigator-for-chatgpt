// options.js — using shared.js renderViz for common baseline
(function(){
  'use strict';

  const SH = window.CGTN_SHARED || {};
  const $  = (id) => document.getElementById(id);
  const exists = (id) => !!$(id);
  const escapeHtml = (s) => String(s||'').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));

  // --- Lang ---
  const curLang = () =>
    (typeof SH.getLang === 'function' && SH.getLang()) ||
    (SH.getCFG && SH.getCFG()?.lang) ||
    ((navigator.language||'').toLowerCase().startsWith('ja') ? 'ja' : 'en');

  const I18N = {
    ja: {
      pinsTitle:'付箋データ管理',
      pinsHint:'各チャットの付箋（pinsByChat）を一覧。不要になったチャットは削除できます。',
      thChat:'チャット', thCount:'付箋数', thUpdated:'更新', thOps:'',
      delBtn:'削除', delConfirm:'このチャットの付箋データを削除します。よろしいですか？',
      emptyPinsTitle:'付箋データはまだありません',
      emptyPinsDesc:'一覧パネルで🔖をONにすると、ここに表示されます。',
      saved:'保存しました', reset:'規定に戻しました',
      nowOpen:'表示中のチャットは削除できません。',
      stillExists:'チャットがサイドバーに存在します（更新で反映）。'
    },
    en: {
      pinsTitle:'Pinned Data',
      pinsHint:'List of pins (pinsByChat) per chat. You can delete data for a specific chat.',
      thChat:'Chat', thCount:'Pins', thUpdated:'Updated', thOps:'',
      delBtn:'Delete', delConfirm:'Delete pin data for this chat. Are you sure?',
      emptyPinsTitle:'No pinned data yet',
      emptyPinsDesc:'Turn on the 🔖 icon in the list panel and chats will appear here.',
      saved:'Saved', reset:'Reset to defaults',
      nowOpen:'Now open chat cannot be deleted.',
      stillExists:'Chat still exists in the sidebar. Reload to update.'
    }
  };
  const t = (k)=> (I18N[curLang()]||I18N.ja)[k] || k;

  // --- Defaults fallback ---
  const DEF = (SH.DEFAULTS) || {
    centerBias: 0.40, headerPx: 0, eps: 20, lockMs: 700, showViz: false,
    panel:{ x:null, y:null },
    list:{ enabled:false, maxItems:30, maxChars:40, fontSize:12, w:null, h:null, x:null, y:null }
  };
  const clamp = (n, lo, hi) => Math.min(Math.max(Number(n), lo), hi);

  function sanitize(raw){
    const base = structuredClone ? structuredClone(DEF) : JSON.parse(JSON.stringify(DEF));
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

  // --- UI sync (IDで確実に) ---
  function applyToUI(cfg){
    const v = sanitize(cfg||{});
    try{
      if (exists('centerBias'))   $('centerBias').value   = v.centerBias;
      if (exists('headerPx'))     $('headerPx').value     = v.headerPx;
      if (exists('eps'))          $('eps').value          = v.eps;
      if (exists('lockMs'))       $('lockMs').value       = v.lockMs;
      if (exists('showViz'))      $('showViz').checked    = !!v.showViz;

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
      listMaxItems : $('listMaxItems')?.value,
      listMaxChars : $('listMaxChars')?.value,
      listFontSize : $('listFontSize')?.value,
    });
  }

  function showMsg(txt){
    const box = $('msg'); if (!box) return;
    box.textContent = txt; box.style.display='block';
    setTimeout(()=> box.style.display='none', 1200);
  }

  // --- Pins table ---
  async function renderPinsManager(){
    const box = $('pins-table'); if (!box) return;
    await new Promise(res => (SH.loadSettings ? SH.loadSettings(res) : res()));
    const cfg = (SH.getCFG && SH.getCFG()) || {};
    const pins = cfg.pinsByChat || {};
    const aliveMap = (cfg.chatIndex && cfg.chatIndex.ids) || {};
    const nowOpen  = cfg.currentChatId || null;

    const rows = Object.entries(pins).map(([cid, rec])=>{
      const title = (rec?.title || '(No Title)').replace(/\s+/g,' ').slice(0,120);
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
          <div style="font-weight:700; margin-bottom:4px;">${t('emptyPinsTitle')}</div>
          <div>${t('emptyPinsDesc')}</div>
        </div>`;
      return;
    }

    const html = [
      '<table class="cgtn-pins-table">',
      `<thead><tr><th>${t('thChat')}</th><th>${t('thCount')}</th><th>${t('thUpdated')}</th><th>${t('thOps')}</th></tr></thead>`,
      '<tbody>',
      ...rows.map(r => {
        const why = r.isNowOpen ? t('nowOpen') : (r.existsInSidebar ? t('stillExists') : '');
        return `
          <tr data-cid="${r.cid}" data-count="${r.count}">
            <td class="title">${escapeHtml(r.title)}</td>
            <td class="count" style="text-align:right">${r.count}</td>
            <td class="date">${r.date}</td>
            <td class="ops">
              <button class="del" data-cid="${r.cid}" ${r.canDelete?'':`disabled title="${escapeHtml(why)}"`}>${t('delBtn')}</button>
            </td>
          </tr>`;
      }),
      '</tbody></table>'
    ].join('');
    box.innerHTML = html;

    box.querySelectorAll('button.del').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const cid = btn.getAttribute('data-cid'); if (!cid) return;
        if (!confirm(t('delConfirm'))) return;
        try { SH.deletePinsForChat?.(cid); } catch(e){}
        await new Promise(r=>setTimeout(r, 80));
        await renderPinsManager();
      });
    });
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', async () => {
    try{
      // タイトル・ヒント（日英）
      const sec = $('pins-manager') || document;
      const h3 = sec.querySelector('h3'); if (h3) h3.textContent = t('pinsTitle');
      const hint = sec.querySelector('.hint'); if (hint) hint.textContent = t('pinsHint');

      // 設定ロード→UI反映
      await new Promise(res => (SH.loadSettings ? SH.loadSettings(res) : res()));
      const cfg = (SH.getCFG && SH.getCFG()) || DEF;
      applyToUI(cfg);

      // 初期描画（shared.js の renderViz 使用）
      try { SH.renderViz?.(cfg, !!cfg.showViz); } catch(e){ console.warn('renderViz init fail', e); }

      // 付箋テーブル
      await renderPinsManager();

      // 入力で即保存＋基準線描画
      const form = $('cgtn-options');
      form?.addEventListener('input', ()=>{
        try{
          const c2 = uiToCfg();
          SH.saveSettingsPatch?.(c2);
          SH.renderViz?.(c2, !!c2.showViz);
          showMsg(t('saved'));
        }catch(e){ console.warn('input handler failed', e); }
      });

      // showViz のチェック変更
      $('showViz')?.addEventListener('change', ()=>{
        try{
          const c2 = uiToCfg();
          SH.saveSettingsPatch?.(c2);
          SH.renderViz?.(c2, !!c2.showViz);
          showMsg(t('saved'));
        }catch(e){ console.warn('showViz change failed', e); }
      });

      // submit（明示保存）
      form?.addEventListener('submit', (e)=>{
        e.preventDefault();
        try{
          const c3 = uiToCfg();
          applyToUI(c3);
          SH.saveSettingsPatch?.(c3);
          SH.renderViz?.(c3, !!c3.showViz);
          showMsg(t('saved'));
        }catch(e){ console.warn('submit failed', e); }
      });

      // 既定に戻す
      $('resetBtn')?.addEventListener('click', async ()=>{
        const def = sanitize(DEF);
        applyToUI(def);
        SH.saveSettingsPatch?.(def);
        SH.renderViz?.(def, false);
        showMsg(t('reset'));
        await renderPinsManager();
      });

      // タブ復帰で再描画
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          renderPinsManager();
          try { SH.renderViz?.(SH.getCFG?.(), !!SH.getCFG?.().showViz); } catch{}
        }
      });

    }catch(e){
      console.error('options init failed', e);
    }
  });

  window.CGTN_OPTIONS = Object.assign(window.CGTN_OPTIONS||{}, { renderPinsManager });
})();
