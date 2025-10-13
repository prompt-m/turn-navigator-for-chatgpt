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
    list:{ enabled:false, pinOnly:false, maxItems:30, maxChars:60, fontSize:12, w:null, h:null, x:null, y:null }
  };
//    list:{ enabled:false, pinOnly:false, maxItems:30, maxChars:40, fontSize:12, w:null, h:null, x:null, y:null }

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

  function applyI18N(){
    const T = window.CGTN_I18N?.t || (s=>s);
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const key = el.dataset.i18n;
      const target = el.dataset.i18nTarget || 'text';   // 'text' | 'placeholder' | 'title' | 'aria-label'
      const v = T(key);
      if (target === 'placeholder')      el.placeholder = v;
      else if (target === 'title')       el.title = v;
      else if (target === 'aria-label')  el.setAttribute('aria-label', v);
      else                               el.textContent = v;
    });
  }
/*
function applyI18N(){
  const T = (k)=> window.CGTN_I18N?.t?.(k) || k;
  const set = (id, key)=>{ const n=document.getElementById(id); if(n) n.textContent=T(key); };

  set('opt-title',       'opts.title');
  set('opt-desc',        'opts.tips');

  set('lang-ja',         'opts.lang.ja');
  set('lang-en',         'opts.lang.en');

  set('pins-title',      'options.pinsTitle');
  set('pins-hint',       'options.pinsHint');

  set('sum-list',        'options.listTitle');
  set('lbl-listMaxChars','options.listMaxChars');
  set('lbl-listFontSize','options.listFontSize');

  set('sum-advanced',    'options.detailTitle');
  set('lbl-showViz',     'nav.viz');
  const hv=document.getElementById('hint-showViz'); if(hv) hv.textContent = T('nav.viz');

  set('lbl-centerBias',  'options.centerBias');
  const hcb=document.getElementById('hint-centerBias'); if(hcb) hcb.textContent = T('options.centerBiasHint');

  set('lbl-eps',         'options.eps');
  const he=document.getElementById('hint-eps'); if(he) he.textContent = T('options.epsHint');

  set('lbl-lockMs',      'options.lockMs');

  const sl=document.getElementById('saveList');  if(sl) sl.textContent = T('options.saveBtn');
  const rl=document.getElementById('resetList'); if(rl) rl.textContent = T('options.resetBtn');
  const sa=document.getElementById('saveAdv');  if(sa) sa.textContent = T('options.saveBtn');
  const ra=document.getElementById('resetAdv'); if(ra) ra.textContent = T('options.resetBtn');
}
*/

  // --- pointer tracker（マウス/タッチの最後の位置を保持） ---
  let _lastPt = { x: window.innerWidth/2, y: window.innerHeight/2 };
  window.addEventListener('mousemove', e => _lastPt = { x:e.clientX, y:e.clientY }, { passive:true });
  window.addEventListener('touchstart', e => {
    const t = e.touches?.[0]; if (t) _lastPt = { x:t.clientX, y:t.clientY };
  },{ passive:true });

  // --- near-pointer toast ---
  function toastNearPointer(msg, { ms=1400, dx=18, dy=-22 } = {}){
    const host = document.getElementById('cgtn-floater');
    if (!host) return;

    // 画面端でははみ出さない程度にクランプ
    const x = Math.max(12, Math.min(window.innerWidth-12,  _lastPt.x + dx));
    const y = Math.max(12, Math.min(window.innerHeight-12, _lastPt.y + dy));

    const el = document.createElement('div');
    el.className = 'cgtn-toast';
    el.textContent = msg;
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    host.appendChild(el);

    // フェードイン → 一定時間後フェードアウト＆削除
    requestAnimationFrame(()=> el.classList.add('show'));
    const t1 = setTimeout(()=> el.classList.remove('show'), ms);
    const t2 = setTimeout(()=> { el.remove(); }, ms + 220);
    // 参照持っておくなら el._timers = [t1,t2];
  }

  function flashMsgPins(key='options.deleted'){
console.log("flashMsgPins ");
    const T = window.CGTN_I18N?.t || (s=>s);
    const el = document.getElementById('msg-pins');
    if (!el) return;
    el.textContent = T(key);
    el.classList.add('show');
    clearTimeout(el._to);
    el._to = setTimeout(()=> el.classList.remove('show'), 1600);
  }


  function flashMsgInline(id, key='options.saved'){
console.log("flashMsgInline id:",id);
    const T = window.CGTN_I18N?.t || (s=>s);
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = T(key);
    el.classList.add('show');
    clearTimeout(el._to);
    el._to = setTimeout(()=> el.classList.remove('show'), 1600);
  }
/*
  function showMsg(txt){
    const box = $('msg'); if (!box) return;
    box.textContent = txt;
    box.style.display='block';
    setTimeout(()=> box.style.display='none', 1200);
  }
*/
  async function renderPinsManager(){
    const box = $('pins-table'); if (!box) return;
    await new Promise(res => (SH.loadSettings ? SH.loadSettings(res) : res()));
    const cfg = (SH.getCFG && SH.getCFG()) || {};
    const pins = cfg.pinsByChat || {};
    const aliveMap = (cfg.chatIndex && cfg.chatIndex.ids) || {};
    const nowOpen  = cfg.currentChatId || null;

    const rows = Object.entries(pins).map(([cid, rec]) => {
      const title = String(rec?.title || '(No Title)').replace(/\s+/g,' ').slice(0,120);

      // pins はオブジェクト想定：true の数だけを数える
      const pinsCount = Object.values(rec?.pins || {}).filter(Boolean).length;

      const date  = rec?.updatedAt ? new Date(rec.updatedAt).toLocaleString() : '';
      const existsInSidebar = !!aliveMap[cid];
      const isNowOpen = (cid === nowOpen);
      const canDelete = true; // 仕様：常に削除可（必要なら条件に戻す）

      return { cid, title, count: pinsCount, date, canDelete, isNowOpen, existsInSidebar };
    }).sort((a,b)=> b.count - a.count || (a.title > b.title ? 1 : -1));

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
        const why = r.isNowOpen ? T('options.nowOpen')
                  : (r.existsInSidebar ? T('options.stillExists') : '');
        const dis = r.canDelete ? '' : `disabled title="${titleEscape(why)}"`;
        return `
          <tr data-cid="${r.cid}" data-count="${r.count}">
            <td class="title">${titleEscape(r.title)}</td>
            <td class="count" style="text-align:right">${r.count}</td>
            <td class="date">${r.date}</td>
            <td class="ops">
              <button type="button" class="del" data-cid="${r.cid}" ${dis}>${T('options.delBtn')}</button>
            </td>
          </tr>`;
      }),
      '</tbody></table>'
    ].join('');
    box.innerHTML = html;

    // 削除ボタンの配線
    box.querySelectorAll('button.del').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const cid = btn.getAttribute('data-cid');
        if (!cid) return;
        await deletePinsFromOptions(cid);
      });
    });

  }


  function titleEscape(s){
    return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.getElementById('lang-ja')?.addEventListener('click', ()=>{
console.log("lang-ja");
    SH.setLang?.('ja'); // i18n.js にある setter を想定（無ければ自前で保持）
    applyI18N();
    applyToUI();
    renderPinsManager();
  });
  document.getElementById('lang-en')?.addEventListener('click', ()=>{
console.log("lang-en");
    SH.setLang?.('en');
    applyI18N();
    applyToUI();
    renderPinsManager();
  });

  document.getElementById('showViz')?.addEventListener('change', (ev)=>{
    const on = !!ev.target.checked;

    // 1) 設定画面自身へ即時反映
    try {
      const cfgNow = (SH.getCFG && SH.getCFG()) || DEF;
      SH.renderViz?.(cfgNow, on);
    } catch {}
    // 2) 設定も保存（他と整合）
//    SH.saveSettingsPatch?.({ showViz: on });
    // 3) ChatGPT タブにも反映を通知
    chrome.tabs.query({ url: ['*://chatgpt.com/*','*://chat.openai.com/*'] }, tabs=>{
      tabs.forEach(tab=>{
        chrome.tabs.sendMessage(tab.id, { type:'cgtn:viz-toggle', on });
      });
    });
  });

  async function deletePinsFromOptions(chatId){
console.log("deletePinsFromOptions");
    const yes = confirm(T('options.delConfirm') || 'Delete pins for this chat?');
    if (!yes) return;

    const ok = await SH.deletePinsForChat(chatId);

    if (ok){
console.log("deletePinsFromOptions call chatId: ",chatId," OK?:",ok);
      // ChatGPTタブへ同期通知（chatgpt.com と chat.openai.com の両方）
      try {
       const targets = [
         '*://chatgpt.com/*',
         '*://chat.openai.com/*'
       ];
       chrome.tabs.query({ url: targets }, tabs=>{
          tabs.forEach(tab=>{
            chrome.tabs.sendMessage(tab.id, { type:'cgtn:pins-deleted', chatId });
          });
        });
      } catch {}

      await renderPinsManager();
console.log("deletePinsFromOptions flashMsgPins直前: ",chatId," OK?:",ok);
      // 近くにポワン
      toastNearPointer(T('options.deleted') || 'Deleted');
//      flashMsgPins('options.deleted');
    }
console.log("deletePinsFromOptions call chatId: ",chatId," not OK?:",ok);

  }

  // 初期化
  document.addEventListener('DOMContentLoaded', async () => {
    try{

      // まず視覚ちらつき防止：showViz を一旦OFFにしてからロード
      const vizBox = document.getElementById('showViz');
      if (vizBox) vizBox.checked = false;

      // 見出し＆ヒント
      //const sec = $('pins-manager') || document;
      //const h3 = sec.querySelector('h3'); if (h3) h3.textContent = T('options.pinsTitle');
      //const hint = sec.querySelector('.hint'); if (hint) hint.textContent = T('options.pinsHint');

      // 設定ロード→UI反映
      await new Promise(res => (SH.loadSettings ? SH.loadSettings(res) : res()));
      const cfg = (SH.getCFG && SH.getCFG()) || DEF;
      applyToUI(cfg);
      applyI18N();
      try { SH.renderViz?.(cfg, !!cfg.showViz); } catch {}

      // 付箋テーブル
      await renderPinsManager();

      const form = $('cgtn-options');
      // 入力で即保存
      form?.addEventListener('input', (ev)=>{
console.log("入力で即保存");
        try {
          const c2 = uiToCfg();
          SH.saveSettingsPatch?.(c2);
          try { SH.renderViz?.(c2, undefined); } catch {}

          // 入力元に応じて表示箇所を切り替え
          const id = ev.target.id || '';
          if (id.startsWith('list')) {
            flashMsgInline('msg-list','options.saved');
          } else if (['showViz','centerBias','eps','lockMs'].includes(id)) {
            flashMsgInline('msg-adv','options.saved');
          }
        } catch(e){ console.warn('input handler failed', e); }
      });
/*
      // submit（明示保存）
      form?.addEventListener('submit', (e)=>{
console.log("明示保存");
        e.preventDefault();
        try{
          const c3 = uiToCfg();
          applyToUI(c3);
          SH.saveSettingsPatch?.(c3);
          SH.renderViz?.(c3, !!c3.showViz);
          showMsg(T('options.saved'));
        }catch(e){ console.warn('submit failed', e); }
      });
*/
/*
      // 既定に戻す
      $('resetBtn')?.addEventListener('click', async ()=>{
console.log("既定に戻す");
        const def = sanitize(DEF);
        applyToUI(def);
        SH.saveSettingsPatch?.(def);
        SH.renderViz?.(def, false);
        showMsg(T('options.reset'));
        await renderPinsManager();
      });
*/
      // タブ復帰で再描画
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') renderPinsManager();
      });

      // オートセーブ + 即時反映
      // 追加：変更検知→デバウンス保存（200ms）
      const AUTO_SAVE_MS = 200;
      let saveTimer = null;
      function autoSave() {
console.log("autoSave");

        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const next = uiToCfg();
          try { SH.saveSettings?.(next, () => showMsg(window.CGTN_I18N?.t?.('options.saved'))); }
          catch(e){ console.warn('autoSave failed', e); }
        }, AUTO_SAVE_MS);
      }
      // 監視する入力群（number/checkbox）
      document.querySelectorAll('#cgtn-options input').forEach(el => {
        el.addEventListener('input', autoSave);
        el.addEventListener('change', autoSave);
      });

      // 一覧セクションの保存
      document.getElementById('saveList')?.addEventListener('click', ()=>{
        const cur = SH.getCFG() || {};
        const patch = {
          list:{
            ...(cur.list||{}),
            maxChars: +document.getElementById('listMaxChars').value,
            fontSize: +document.getElementById('listFontSize').value
          }
        };
        SH.saveSettingsPatch?.(patch, ()=> flashMsgInline('msg-list','options.saved'));
      });

      // 詳細セクションの保存
      document.getElementById('saveAdv')?.addEventListener('click', ()=>{
        const patch = {
          showViz: !!document.getElementById('showViz').checked,
          centerBias: +document.getElementById('centerBias').value,
          eps: +document.getElementById('eps').value,
          lockMs: +document.getElementById('lockMs').value
        };
        SH.saveSettingsPatch?.(patch, ()=>{
          try{ SH.renderViz?.(patch, patch.showViz); }catch{}
          flashMsgInline('msg-adv','options.saved');
        });
      });

      // リセット時も同様に
      document.getElementById('resetList')?.addEventListener('click', ()=>{
        // 値戻し→保存…
        flashMsgInline('msg-list','options.reset');
      });
      document.getElementById('resetAdv')?.addEventListener('click', ()=>{
        // 値戻し→保存…
        flashMsgInline('msg-adv','options.reset');
      });


      // Extension version 表示
      try {
         const m = chrome.runtime.getManifest();
//         const ver = `${m.name} v${m.version}`;
         const ver = `${m.name} v${m.version} ${m.version_name ? '('+m.version_name+')' : ''}`.trim();

         const info = document.getElementById('buildInfo');
         if (info) info.textContent = ver;
       } catch (e) {
         console.warn('buildInfo failed', e);
       }

    }catch(e){
      console.error('options init failed', e);
    }
  });
})();
