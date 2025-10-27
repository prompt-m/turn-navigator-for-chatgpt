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
    centerBias: 0.40, eps: 20, lockMs: 700, showViz: false,
    list:{ maxChars: 60, fontSize: 12, /* 他は不要 */ }
  };

  /* ここから追加：sync 使用量ラベルを更新（常時表示＋i18n対応） */
  async function updateSyncUsageLabel(){
    try{
      const el = document.getElementById('sync-usage');
      if (!el || !chrome?.storage?.sync?.getBytesInUse) return;
      chrome.storage.sync.getBytesInUse(null, (bytes)=>{
        // ※ 100KB は Chrome Sync の合計上限
        const used = (bytes || 0);
        const usedKB = (Math.round(used/102.4)/10).toFixed(1); // 8.0KB など
        const totalKB = 100;
        // i18n：「options.syncUsage」が無ければフォールバック
        const label = (typeof T === 'function' ? T('options.syncUsage') : 'sync usage:');
        el.textContent = `${label} ${usedKB}KB / ${totalKB}KB`;
      });
    }catch(e){ /* no-op */ }
  }
  /* ここまで */

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

  /* ボタンbusy制御（スピナー+タイムアウト） */
  function setBusy(btn, on, {timeoutMs=12000, onTimeout} = {}){
    if (!btn) return;
    if (on){
      if (btn.classList.contains('is-busy')) return;
      btn.dataset.base = (btn.textContent || '').trim();
      btn.classList.add('is-busy');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      // タイムアウト保険
      const id = setTimeout(()=>{
        clearBusy(btn);
        try{ onTimeout?.(); }catch(_){}
      }, timeoutMs);
      btn.dataset.busyTimer = String(id);
    }else{
      clearBusy(btn);
    }
  }
  function clearBusy(btn){
    if (!btn) return;
    btn.classList.remove('is-busy');
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    const t = btn.dataset.busyTimer;
    if (t){ clearTimeout(Number(t)); delete btn.dataset.busyTimer; }
    if (btn.dataset.base) btn.textContent = btn.dataset.base;
  }


  /* ここから追加：アクティブ ChatGPT タブへ送信 */
  function sendToActive(payload){
    return new Promise((resolve)=>{
      const urls = ['*://chatgpt.com/*','*://chat.openai.com/*'];
      chrome.tabs.query({ url: urls, active:true, lastFocusedWindow:true }, (tabs)=>{
        const t = tabs?.[0];
        if (!t?.id) return resolve({ ok:false, reason:'no-tab' });
        chrome.tabs.sendMessage(t.id, payload, (res)=>{
          if (chrome.runtime.lastError) return resolve({ ok:false, reason:'no-response' });
          resolve(res || { ok:false, reason:'empty' });
        });
      });
    });
  }
  /* ここまで */

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
    const T = window.CGTN_I18N?.t || (s=>s);
    const el = document.getElementById('msg-pins');
    if (!el) return;
    el.textContent = T(key);
    el.classList.add('show');
    clearTimeout(el._to);
    el._to = setTimeout(()=> el.classList.remove('show'), 1600);
  }


  function flashMsgInline(id, key='options.saved'){
    const T = window.CGTN_I18N?.t || (s=>s);
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = T(key);
    el.classList.add('show');
    clearTimeout(el._to);
    el._to = setTimeout(()=> el.classList.remove('show'), 1600);
  }

  //表示直前での正規化
  function loadAndRenderPins(){
    const cfg = SH.getCFG() || {};
    const raw = cfg.pinsByChat || {};
    // ★ 正規化をかける（ゼロ件削除＋タイトル最新化）
    const norm = SH.normalizePinsByChat?.(raw, { dropZero: true, preferNewTitle: true }) || raw;
  
    // 以降は norm を使う
    renderPinsTable(norm); // ← あなたの実装に合わせた関数名でOK
  }

  //エクスポート直前での正規化
  function onExportPinsClick(){
    const cfg = SH.getCFG() || {};
    //const pins = cfg.pinsByChat || {};
    const pins = getNormalizedPinsForOptions(cfg);  // ★ゼロ件除去＋タイトル最新化
    //const norm = SH.normalizePinsByChat?.(raw, { dropZero: true, preferNewTitle: true }) || raw;

    const payload = { pinsByChat: pins };
    const blob = new Blob([ JSON.stringify({ pinsByChat: norm }, null, 2) ], { type: 'application/json' });
    // 既存のダウンロード処理へ
    triggerDownload(blob, 'pins_backup.json');
  }

  //正規化ヘルパ
  // === pinsByChat を設定画面向けに正規化 ===
  // ・ゼロ件ピンは除外
  // ・タイトルは可能なら最新（getChatTitle or chatIndex.titles）に更新
  function getNormalizedPinsForOptions(cfg){
    const raw = (cfg && cfg.pinsByChat) || {};
    const out = {};
    const getTitle = (cid, rec)=>{
      return (SH.getChatTitle?.(cid))
          || (cfg?.chatIndex?.titles?.[cid]?.title)
          || (rec?.title)
          || '(No Title)';
    };

    for (const [cid, rec] of Object.entries(raw)){
      const pinsObj = rec?.pins || {};
      const count = Object.values(pinsObj).filter(Boolean).length;
      if (count === 0) continue;                 // ★ 0件は削除（表示・エクスポート対象外）
      out[cid] = { ...rec, title: getTitle(cid, rec) }; // ★ タイトルを最新へ
    }
    return out;
  }

  // 表示直前に“最新タイトルへ置換”してから描画
  async function renderPinsManager(){
    const box = $('pins-table'); if (!box) return;
    await new Promise(res => (SH.loadSettings ? SH.loadSettings(res) : res()));
    const cfg = (SH.getCFG && SH.getCFG()) || {};

    //const pins = cfg.pinsByChat || {};
    const pins = getNormalizedPinsForOptions(cfg);
    const liveIdx = (cfg.chatIndex && cfg.chatIndex.ids) || {};

    const aliveMap = (cfg.chatIndex && cfg.chatIndex.ids) || {};
    const nowOpen  = cfg.currentChatId || null;

    const rows = Object.entries(pins).map(([cid, rec]) => {
      // タイトルは保存しない方針：live（chatIndexや現在タブ）に無ければ chatId を表示
      const liveTitle = (liveIdx[cid]?.title || '').trim();
      const title = (liveTitle || cid).replace(/\s+/g,' ').slice(0,120);

      // pins は配列想定（shared.js の方針に合わせる）：1 の数を数える
      const pinsArr = Array.isArray(rec?.pins) ? rec.pins : [];
      const pinsCount = pinsArr.filter(Boolean).length;

      const date  = rec?.updatedAt ? new Date(rec.updatedAt).toLocaleString() : '';
      const existsInSidebar = !!liveIdx[cid]; // ここも liveIdx に揃える
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
/*
    const html = [
      `<div class="pins-toolbar" style="display:flex;gap:12px;justify-content:space-between;align-items:center;margin:8px 0;flex-wrap:wrap;">
         <div id="title-help" class="hint" style="opacity:.9;"></div>
       </div>`,
      '<table class="cgtn-pins-table">',
      `<thead>
       <tr><span id="cgtn-sync-usage" class="hint" style="opacity:.85;"></span></tr>
       <tr>
        <th>No.</th>
        <th class="title">${T('options.thChat')}</th>
        <th>${T('options.thCount')}</th>
        <th>${T('options.thUpdated')}</th>
      </tr></thead>`,

      '<tbody><div class="cgtn-pins-scroll">',
        ...rows.map((r, i) => {
           const inlineDel = r.count > 0
             ? ` <button class="btn del inline" data-cid="\${r.cid}" title="${T('options.delBtn')}">🗑</button>` : '';
          return `<tr data-cid="\${r.cid}">
            <td class="no">${i+1}</td>
            <td class="title" title="\${titleEscape(r.title)}">${titleEscape(r.title)}</td>
            <td class="count" style="text-align:right">${r.count}${inlineDel}</td>
            <td class="updated">${titleEscape(r.date || '')}</td>
           </tr>`;
      }),
      '</div></tbody></table>'
    ].join('');
    box.innerHTML = html;
*/

    const html = [
      /* ここから追加：正しいテーブル構造に刷新 */
      '<table class="cgtn-pins-table">',
      `<thead>
         <tr>
           <th>No.</th>
           <th class="title">${T('options.thChat')}</th>
           <th>${T('options.thCount')}</th>
           <th>${T('options.thUpdated')}</th>
         </tr>
       </thead>`,
      '<tbody>',
        ...rows.map((r, i) => {
          const inlineDel = r.count > 0
            ? ` <button class="btn del inline" data-cid="${r.cid}" title="${T('options.delBtn')}">🗑</button>` : '';
          return `<tr data-cid="${r.cid}">
            <td class="no">${i+1}</td>
            <td class="title" title="${titleEscape(r.title)}">${titleEscape(r.title)}</td>
            <td class="count" style="text-align:right">${r.count}${inlineDel}</td>
            <td class="updated">${titleEscape(r.date || '')}</td>
          </tr>`;
        }),
      '</tbody></table>'
      /* ここまで */
    ].join('');
    box.innerHTML = html;

    /* ここから追加：ラッパにスクロールを付与（options.html 側の .pins-wrap を再利用） */
    const wrap = box.parentElement;           // <div class="pins-wrap">
    if (wrap) wrap.classList.add('cgtn-pins-scroll');
    /* ここまで */

    // 削除ボタン（行内🗑）配線
    box.querySelectorAll('button.del').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        e.stopPropagation?.(); // 行クリック誤発火防止
        const cid = btn.getAttribute('data-cid');
        if (!cid) return;
        await deletePinsFromOptions(cid);
        try{ updateSyncUsageLabel(); }catch(_){}

      });
    });

    const refreshBtn = document.getElementById('cgtn-refresh');
    if (refreshBtn){
      /* ここから追加：スピナー版 */
      refreshBtn.onclick = async () => {
        if (refreshBtn.classList.contains('is-busy')) return;
        setBusy(refreshBtn, true, {
          onTimeout: () => {
            // タイムアウト通知（既存のインラインメッセージ機構があれば使う）
            try{
              (window.flashMsgInline
                ? flashMsgInline('pins-hint', 'options.refreshTimeout')
                : console.warn('Refresh timeout'));
            }catch(_){}
          }
        });
        try{
          const meta = await sendToActive({ type:'cgtn:get-chat-meta' });
          if (meta?.ok){
            const tr = box.querySelector(`tr[data-cid="${meta.chatId}"]`);
            if (tr) tr.querySelector('.title').textContent = meta.title || meta.chatId;
          }
          try{ updateSyncUsageLabel(); }catch(_){}
          // 成功時の軽い通知（任意）
          try{ window.flashMsgInline?.('pins-hint','options.refreshed'); }catch(_){}
        }catch(e){
          console.warn(e);
          try{ window.flashMsgInline?.('pins-hint','options.refreshFailed'); }catch(_){}
        }finally{
          setBusy(refreshBtn, false);
        }
      };
      /* ここまで */
    }

    let refreshInFlight = false;
    let refreshTO = null;
    if (refreshBtn){
      refreshBtn.addEventListener('click', ()=>{
        if (refreshTO) clearTimeout(refreshTO);
        refreshTO = setTimeout(async ()=>{
          if (refreshInFlight) return;
          refreshInFlight = true;
          const old = refreshBtn.textContent;
          refreshBtn.disabled = true;
          refreshBtn.textContent = old + '…';
          try{
            const meta  = await sendToActive({ type:'cgtn:get-chat-meta'  });
            if (meta?.ok){
              const tr = box.querySelector(`tr[data-cid="${meta.chatId}"]`);
              if (tr) tr.querySelector('.title').textContent = meta.title || meta.chatId;
            }
          } finally {
            refreshInFlight = false;
            refreshBtn.disabled = false;
            refreshBtn.textContent = old;
          }
        }, 400); // デバウンス
      // 使用量ラベル更新
      try{ updateSyncUsageLabel(); }catch(_){}
      });
    }
    /* ここまで */
  }


  function titleEscape(s){
    return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.getElementById('lang-ja')?.addEventListener('click', ()=>{
    SH.setLang?.('ja'); // i18n.js にある setter を想定（無ければ自前で保持）
    applyI18N();
    applyToUI();
    renderPinsManager();
    try{ updateSyncUsageLabel(); }catch(_){}
    /* ここから追加：busy解除＆ラベルベース更新 */
    clearBusy(document.getElementById('cgtn-refresh'));
    const _rb = document.getElementById('cgtn-refresh'); if (_rb) _rb.dataset.base = (_rb.textContent||'').trim();
    /* ここまで */

  });
  document.getElementById('lang-en')?.addEventListener('click', ()=>{
    SH.setLang?.('en');
    applyI18N();
    applyToUI();
    renderPinsManager();
    try{ updateSyncUsageLabel(); }catch(_){} 
    /* ここから追加：busy解除＆ラベルベース更新 */
    clearBusy(document.getElementById('cgtn-refresh'));
    const _rb = document.getElementById('cgtn-refresh'); if (_rb) _rb.dataset.base = (_rb.textContent||'').trim();
    /* ここまで */
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
    const yes = confirm(T('options.delConfirm') || 'Delete pins for this chat?');
    if (!yes) return;

    const ok = await SH.deletePinsForChat(chatId);

    if (ok){
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
      // 近くにポワン
      toastNearPointer(T('options.deleted') || 'Deleted');
    }

  }

  // 初期化
  document.addEventListener('DOMContentLoaded', async () => {
    try{

      // まず視覚ちらつき防止：showViz を一旦OFFにしてからロード
      const vizBox = document.getElementById('showViz');
      if (vizBox) vizBox.checked = false;

      // 設定ロード→UI反映
      await new Promise(res => (SH.loadSettings ? SH.loadSettings(res) : res()));
      const cfg = (SH.getCFG && SH.getCFG()) || DEF;
      applyToUI(cfg);
      applyI18N();
      try { SH.renderViz?.(cfg, !!cfg.showViz); } catch {}

      // 付箋テーブル
      await renderPinsManager();

      // sync 使用量表示
      //try{ updateSyncUsage(); }catch{}

      /* ここから追加：初期描画時に使用量ラベルを反映 */
      try{ updateSyncUsageLabel(); }catch(_){}
      /* 言語切替で再描画（両対応） */
      if (window.CGTN_SHARED?.onLangChange) {
        window.CGTN_SHARED.onLangChange(updateSyncUsageLabel);
      } else {
        window.addEventListener('cgtn:lang-changed', updateSyncUsageLabel, { passive:true });
      }
      /* ここまで */


      const form = $('cgtn-options');
      // 入力で即保存
      form?.addEventListener('input', (ev)=>{
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
      // タブ復帰で再描画
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') renderPinsManager();
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
        // リスト幅　文字数から算出
        window.CGTN_LOGIC?.applyPanelWidthByChars?.(newMaxChars);
      });

      // 一覧セクション：規定に戻す（値を戻して保存）
      document.getElementById('resetList')?.addEventListener('click', ()=>{
        const cur = SH.getCFG() || {};
        const patch = {
          list:{
            ...(cur.list||{}),
            maxChars: DEF.list.maxChars,
            fontSize: DEF.list.fontSize,
          }
        };
        // UIも戻す
        document.getElementById('listMaxChars').value = patch.list.maxChars;
        document.getElementById('listFontSize').value = patch.list.fontSize;
      
        SH.saveSettingsPatch?.(patch, ()=> flashMsgInline('msg-list','options.reset'));
        // リスト幅　文字数から算出
        window.CGTN_LOGIC?.applyPanelWidthByChars?.(newMaxChars);
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

      document.getElementById('resetAdv')?.addEventListener('click', ()=>{
        // 値戻し→保存…
        flashMsgInline('msg-adv','options.reset');
      });

      // 詳細セクション：規定に戻す（値を戻して保存）
      document.getElementById('resetAdv')?.addEventListener('click', ()=>{
        // UIを既定に
        document.getElementById('showViz').checked = !!DEF.showViz;
        document.getElementById('centerBias').value = DEF.centerBias;
        document.getElementById('eps').value = DEF.eps;
        document.getElementById('lockMs').value = DEF.lockMs;

        const patch = {
          showViz: !!DEF.showViz,
          centerBias: DEF.centerBias,
          eps: DEF.eps,
          lockMs: DEF.lockMs,
        };
        SH.saveSettingsPatch?.(patch, ()=>{
          try{ SH.renderViz?.(patch, patch.showViz); }catch{}
          flashMsgInline('msg-adv','options.reset');
        });
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

       // 開発用の軽いフラッシュ（本番ロジックがあれば不要）
       function devFlash(id, txt){
         const el = document.getElementById(id);
         if(!el) return;
         el.textContent = txt;
         el.classList.add('show');
         clearTimeout(el._t);
         el._t = setTimeout(()=> el.classList.remove('show'), 1500);
       }

       document.addEventListener('DOMContentLoaded', () => {
         // 既存の save / reset ハンドラに組み込む or なければ仮で紐付け
         const L = (k)=> (window.CGTN_I18N?.t(k) || '');
         const msgSaved = L('options.saved') || '保存しました';
         const msgReset = L('options.reset') || '規定に戻しました';
       
         document.getElementById('saveList') ?.addEventListener('click', ()=> devFlash('msg-list', msgSaved));
         document.getElementById('resetList')?.addEventListener('click', ()=> devFlash('msg-list', msgReset));
         document.getElementById('saveAdv')  ?.addEventListener('click', ()=> devFlash('msg-adv',  msgSaved));
         document.getElementById('resetAdv')?.addEventListener('click', ()=> devFlash('msg-adv',  msgReset));
       });
    }catch(e){
      console.error('options init failed', e);
    }
  });
})();
