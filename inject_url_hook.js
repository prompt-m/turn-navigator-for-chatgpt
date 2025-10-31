  // ====== diag helpers ======
  const now = () => new Date().toISOString().split('T')[1].replace('Z','');
  const chatIdFromUrl = () => {
    const m = (location.pathname || '').match(/\/c\/([^/?#]+)/);
    return m ? m[1] : '';
  };
  const pageKind = () => {
    const p = location.pathname || '/';
    if (/\/c\/[^/]+$/.test(p)) return 'chat';
    if (p === '/' || /^\/g\/?$/.test(p)) return 'home';        // ChatGPTホーム/新規
    if (/^\/g\/p-/.test(p)) return 'project';                  // プロジェクト先頭など
    return 'other';
  };
  let __lastCid = chatIdFromUrl();
  let __lastKind = pageKind();
  const log = (...a) => console.log('[cgtn:inject]', now(), ...a);
  const post = (type, extra={}) =>
    window.postMessage({ source:'cgtn', type, cid:chatIdFromUrl(), kind:pageKind(), ...extra }, '*');

 // --- turn-added hook: article 出現を検出して postMessage ---


 if (!window.__CGTN_TURN_HOOKED__) {
   window.__CGTN_TURN_HOOKED__ = true;

   const isOwnUI = (node) => { /* 既存のまま */ };
   const isTurnNode = (n)   => { /* 既存のまま */ };

   const root = document.querySelector('main') || document.body;
   if (root) {
     let to = 0;
     const postTurn = (reason) => {
       clearTimeout(to);
       to = setTimeout(() => {
         log('turn-added', 'cid=', chatIdFromUrl(), 'kind=', pageKind(), 'reason=', reason);
         post('turn-added', { reason });
       }, 200);
     };

     const mo = new MutationObserver((muts) => { /* 既存のまま */ });
     mo.observe(root, { childList:true, subtree:true });

     // ====== URL/ページ種別の変化を検知してログを出す ======
     const fireUrlChange = (src) => {
       const cid  = chatIdFromUrl();
       const kind = pageKind();
       if (cid === __lastCid && kind === __lastKind) return;
       __lastCid = cid; __lastKind = kind;
       log('url-change', 'by=', src, 'cid=', cid || '(none)', 'kind=', kind);
       post('url-change', { by:src });
     };
     // history フック
     for (const fn of ['pushState','replaceState']) {
       try {
         const orig = history[fn];
         history[fn] = function(...args){
           const r = orig.apply(this, args);
           fireUrlChange(fn);
           return r;
         };
       } catch{}
     }
     window.addEventListener('popstate', () => fireUrlChange('popstate'), true);
     // 保険（取りこぼし対策）
     setInterval(() => fireUrlChange('poll'), 1000);
   }
 }


/*
  // --- turn-added hook: article 出現を検出して postMessage ---
  if (!window.__CGTN_TURN_HOOKED__) {
    window.__CGTN_TURN_HOOKED__ = true;

    const isOwnUI = (node) => {
      if (!node || node.nodeType !== 1) return false;
      return node.closest?.('[data-cgtn-ui]') ||
             document.getElementById('cgpt-nav')?.contains(node) ||
             document.getElementById('cgpt-list-panel')?.contains(node);
    };
    const isTurnNode = (n) => {
      if (!n || n.nodeType !== 1) return false;
      if (n.tagName === 'ARTICLE') return true;
      const dt = n.getAttribute?.('data-testid') || '';
      if (dt.startsWith('conversation-turn')) return true;
      return !!n.querySelector?.('article,[data-testid^="conversation-turn"]');
    };

    const root = document.querySelector('main') || document.body;
    if (root) {
      let to = 0;
      const postTurn = (reason) => {
        clearTimeout(to);
        to = setTimeout(() => {
          // 拡張側（content.js）が isListOpen を見て必要なら rebuild する
          window.postMessage({ source: 'cgtn', type: 'turn-added', reason }, '*');
        }, 200); // 軽いデバウンス
      };

      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type !== 'childList') continue;
          for (const n of m.addedNodes) {
            if (isOwnUI(n)) continue;
            if (isTurnNode(n)) { postTurn('added'); return; }
          }
        }
      });

      mo.observe(root, { childList: true, subtree: true, attributes: false, characterData: false });
      // console.debug('[cgtn:url-hook] turn-added observer attached');
    }
  }
*/
