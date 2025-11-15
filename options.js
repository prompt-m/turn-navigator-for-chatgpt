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

  /* sync.set の Promise ラッパ（lastError を reject） */
  function syncSetAsync(obj){
console.log("syncSetAsync",obj);
    return new Promise((resolve, reject)=>{
      chrome.storage.sync.set(obj, ()=>{
        const err = chrome.runtime?.lastError;
        if (err) return reject(err);
        resolve();
      });
    });
  }

  /* 使用量（KB）＋アイテム数 を同時表示。i18n対応 */
  async function updateSyncUsageLabel(){
    try{
      const el = document.getElementById('sync-usage');
      if (!el) return;
  
      // Promise化ヘルパ
      const getBytes = () => new Promise(res => chrome.storage.sync.getBytesInUse(null, b => res(b||0)));
      const getAll   = () => new Promise(res => chrome.storage.sync.get(null, obj => res(obj||{})));
  
      const [bytesInUse, allItems] = await Promise.all([ getBytes(), getAll() ]);
  
      const usedKB  = (bytesInUse/1024).toFixed(1);
      const totalKB = 100;       // sync 全体上限=約100KB
      const items   = Object.keys(allItems).length - 1;//共通キー分をマイナス
      const itemsMax = 512-1;      // sync のキー上限
  
      // i18n（無ければフォールバック）
      const t = window.CGTN_I18N?.t || (s=>s);
      const usageLabel = t('options.syncUsage');   // 例: "sync使用量"
      const itemsLabel = t('options.itemsLabel');  // 例: "アイテム数"
  
      // 表示テキストは 例) "sync使用量 8.0KB / 100KB ・ アイテム数 23 / 512"
      el.textContent = `${usageLabel} ${usedKB}KB / ${totalKB}KB ・ ${itemsLabel} ${items} / ${itemsMax}`;
    }catch(e){
      // 取れない場合は静かにスキップ
      console.warn('updateSyncUsageLabel failed', e);
    }
  }

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
console.log("近くにポワンtoastNearPointer host:",host);
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
console.log("flashMsgInline id:",id);
    const T = window.CGTN_I18N?.t || (s=>s);
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = T(key);
    el.classList.add('show');
    clearTimeout(el._to);
    el._to = setTimeout(()=> el.classList.remove('show'), 1600);
  }

  //エクスポート直前での正規化
  function onExportPinsClick(){
    const cfg = SH.getCFG() || {};
    //const pins = cfg.pinsByChat || {};
    const pins = getNormalizedPinsForOptions(cfg);  // ★ゼロ件除去＋タイトル最新化
    //const norm = SH.normalizePinsByChat?.(raw, { dropZero: true, preferNewTitle: true }) || raw;

    const payload = { pinsByChat: pins };
    const blob = new Blob([ JSON.stringify({ pinsByChat: pins }, null, 2) ], { type: 'application/json' });
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

    // 設定ロード（await で確実に完了させる）
    if (SH.loadSettings) await SH.loadSettings();

    // 新仕様：chatIdごとの分割キーを走査してmapを構築
    const all = await new Promise(res => {
      try {
        chrome.storage.sync.get(null, items => res(items || {})); 
      }
      catch {
        res({}); 
      }
    });
console.log("renderPinsManager*2 all:",all);
    const cfg = SH.getCFG?.() || {};
console.log("renderPinsManager*2.1 cfg:",cfg);
    const map = {};

    for (const [key, val] of Object.entries(all)) {
      if (!key.startsWith('cgtnPins::')) continue;
      const chatId  = key.slice('cgtnPins::'.length);
      const pinsArr = Array.isArray(val?.pins) ? val.pins : [];
      if (pinsArr.length === 0) continue;

      // ① 付箋データに保存されたタイトルを最優先
      const savedTitle = (val.title || '').trim();

      // ② インデックス（chatIndex.ids/map）にも同じCIDがあれば補完
      const live = (cfg.chatIndex?.ids?.[chatId] || cfg.chatIndex?.map?.[chatId]) || {};
      const proj = (live.project || live.folder || live.group || '').trim();
      const idxTitle = (live.title || '').trim();

      // ③ 優先度：savedTitle > idxTitle > fallback(CID)
      let title = savedTitle || idxTitle || chatId;
      if (proj && !title.startsWith(proj)) title = `${proj} - ${title}`;

      // ④ 更新日時は val.updatedAt をそのまま採用
      const updated = val.updatedAt || live.updated || null;

      map[chatId] = { pins: pinsArr, title, updatedAt: updated };
    }

console.log("renderPinsManager*3 map:",map);
    const tbody = document.getElementById('pins-tbody');
    if (!tbody) return;

//    const cfg = (SH.getCFG && SH.getCFG()) || {};
  
    // サイドバーの“生存チャット索引”があれば補助で使う（無ければ空でOK）
    const liveIdx = (cfg.chatIndex && (cfg.chatIndex.ids || cfg.chatIndex.map)) || {};
    console.log("renderPinsManager*3.3 liveIdx:", liveIdx);

    // 今開いているチャットID（options では基本 null でOK）
    const nowOpen  = cfg.currentChatId ?? null;
    console.log("renderPinsManager*3.5 nowOpen:", nowOpen);

    // ★ rows は配列のまま保持
    const rows = Object.entries(map).map(([cid, rec]) => {
      const pinsArr   = Array.isArray(rec?.pins) ? rec.pins : [];
      const turns = pinsArr.length;                 // ★ pinsArr の要素数が「会話数」
      const pinsCount = pinsArr.filter(Boolean).length;
      const t = SH.getTitleForChatId(cid, rec?.title || '');
console.log("renderPinsManager*3.6 t:", t);
      return {
        cid,
        title: t.slice(0,120),
        turns,
        count: pinsCount,
        date : rec?.updatedAt ? new Date(rec.updatedAt).toLocaleString() : ''
      };
    }).sort((a,b)=> b.count - a.count || (a.title > b.title ? 1 : -1));

console.log("renderPinsManager*4 rows:", rows);
console.log("renderPinsManager*5 rows.length:",rows.length);

    // 空
    if (!rows.length){
      tbody.innerHTML = `
        <tr class="empty">
          <td colspan="4" style="padding:12px;color:var(--muted);">
            ${T('options.emptyPinsDesc') || 'No pinned data.'}
          </td>
        </tr>`;
      return;
    }

    // 新: tbody だけ差し替え
    const rowHtml = rows.map((r, i) => {
      const esc = s => String(s ?? '').replace(/[&<>"']/g,
          m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
      const del = r.count > 0
        ? `<button class="btn del inline" data-cid="${esc(r.cid)}" title="${T('options.delBtn')}">🗑</button>`
        : '';
      return `
        <tr data-cid="${esc(r.cid)}">
          <td class="no">${i + 1}</td>
          <td class="title" title="${esc(r.title)}">${esc(r.title)}</td>
          <td class="turns" style="text-align:right">${r.turns}</td>
          <td class="count" style="text-align:right">${r.count}${del}</td>
          <td class="updated">${esc(r.date || '')}</td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rowHtml;

    // ← box 未定義対策＋スクロール
    const box  = document.getElementById('pins-table');
    const wrap = box?.parentElement;
    if (wrap) wrap.classList.add('cgtn-pins-scroll');

    // 削除（tbody に委譲） — 二重バインド防止
    if (!tbody._cgtnDelBound) {
      tbody._cgtnDelBound = true;
      tbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button.del');
        if (!btn) return;
        const cid = btn.getAttribute('data-cid');
        if (!cid) return;
        // 共通の通知/再描画ロジックへ一本化
        deletePinsFromOptions(cid);
      });
    }

    // 「最新にします」（id=pins-refresh）
    const refreshBtn = document.getElementById('pins-refresh');
    if (refreshBtn){
      refreshBtn.onclick = async () => {
        if (refreshBtn.classList.contains('is-busy')) return;
        setBusy(refreshBtn, true, { onTimeout: ()=> flashMsgInline?.('pins-msg','options.refreshTimeout') });
        try{
          const meta = await sendToActive({ type:'cgtn:get-chat-meta' });
          if (meta?.ok){
            const tr = box?.querySelector(`tr[data-cid="${meta.chatId}"]`);
            if (tr) tr.querySelector('.title').textContent = meta.title || meta.chatId;
          }
          try{ updateSyncUsageLabel(); }catch{}
          flashMsgInline?.('pins-msg','options.refreshed');
        }catch(e){
          console.warn(e);
          flashMsgInline?.('pins-msg','options.refreshFailed');
        }finally{
          setBusy(refreshBtn, false);
        }
      };
    }
    /* renderPinsManager ここまで */
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

  });
  document.getElementById('lang-en')?.addEventListener('click', ()=>{
    SH.setLang?.('en');
    applyI18N();
    applyToUI();
    renderPinsManager();
    try{ updateSyncUsageLabel(); }catch(_){} 
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

  // 付箋データ削除
  async function deletePinsFromOptions(chatId){
    const yes = confirm(T('options.delConfirm') || 'Delete pins for this chat?');
    if (!yes) return;
  
    /* 成功/失敗の分岐でUI処理を強化 */
    const ok = await SH.deletePinsForChat(chatId);
    //const ok = await SH.deletePinsForChatAsync(chatId);
  
    if (ok){
console.log("付箋データ削除 deletePinsFromOptions ok");
      // ChatGPTタブへ同期通知（chatgpt.com と chat.openai.com の両方）
      try {
        const targets = ['*://chatgpt.com/*', '*://chat.openai.com/*'];
        chrome.tabs.query({ url: targets }, tabs=>{
          tabs.forEach(tab=>{
            chrome.tabs.sendMessage(tab.id, { type:'cgtn:pins-deleted', chatId });
          });
        });
      } catch {}

      await renderPinsManager();

      // 使用量の再描画（KB/アイテム数）
      try{ updateSyncUsageLabel?.(); }catch(_){}

      // 近くにポワン
      toastNearPointer(T('options.deleted') || 'Deleted');

    } else {
console.log("付箋データ削除 deletePinsFromOptions ng");

      // 保存失敗（lastError など）→ UI でアラート/トースト
      try{
        toastNearPointer(T('options.saveFailed') || 'Failed to save');
      }catch(_){}
    }
  }

  // 初期化
  document.addEventListener('DOMContentLoaded', async () => {
    try{

      // まず視覚ちらつき防止：showViz を一旦OFFにしてからロード
      const vizBox = document.getElementById('showViz');
      if (vizBox) vizBox.checked = false;

      // 設定ロード→UI反映
//      await new Promise(res => (SH.loadSettings ? SH.loadSettings(res) : res()));
      // 設定ロード→UI反映（★まず sync から強制取得）
      if (SH.reloadFromSync) {
        await SH.reloadFromSync();
      } else {
        await new Promise(res => (SH.loadSettings ? SH.loadSettings(res) : res()));
      }

      const cfg = (SH.getCFG && SH.getCFG()) || DEF;
      applyToUI(cfg);
      applyI18N();
      try { SH.renderViz?.(cfg, !!cfg.showViz); } catch {}

      // 付箋テーブル
      await renderPinsManager();

      // 他タブ（content）からの更新通知を受けたら最新化
      if (chrome?.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener((msg) => {
          if (!msg || typeof msg.type !== 'string') return;
          if (msg.type === 'cgtn:pins-deleted' || msg.type === 'cgtn:pins-updated') {
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

      try { await updateSyncUsageLabel(); } catch {}

      /* 初期描画時に使用量ラベルを反映 */
      try{ updateSyncUsageLabel(); }catch(_){}
      /* 言語切替で再描画（両対応） */
      if (window.CGTN_SHARED?.onLangChange) {
        window.CGTN_SHARED.onLangChange(updateSyncUsageLabel);
      } else {
        window.addEventListener('cgtn:lang-changed', updateSyncUsageLabel, { passive:true });
      }

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
