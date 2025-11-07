// inject_url_hook.js  ← そのまま上書きしてください
(function () {
  if (window.__CGTN_URL_HOOKED__) return;
  window.__CGTN_URL_HOOKED__ = true;

  // ====== helpers ======
  const now = () => new Date().toISOString().split('T')[1].replace('Z','');
  const chatIdFromUrl = () => {
    const m = (location.pathname || '').match(/\/c\/([^/?#]+)/);
    return m ? m[1] : '';
  };
  const pageKind = () => {
    const p = location.pathname || '/';
    if (/\/c\/[^/]+$/.test(p)) return 'chat';
    // “新しいチャット” 明示
    if (p === '/new' || new URL(location.href).searchParams.get('temporary-chat') === 'true') return 'new';
    if (p === '/' || /^\/g\/?$/.test(p)) return 'home';
    if (/^\/g\/p-/.test(p)) return 'project';
    return 'other';
  };

  const log  = (...a) => console.log('[cgtn:inject]', now(), ...a);
  const post = (type, extra={}) => {
    const payload = { source:'cgtn', type, cid: chatIdFromUrl(), kind: pageKind(), ...extra };
    window.postMessage(payload, '*');
  };

  let __lastCid  = chatIdFromUrl();
  let __lastKind = pageKind();

  // ====== turn-added: 新しい article 出現をpost ======
  if (!window.__CGTN_TURN_HOOKED__) {
    window.__CGTN_TURN_HOOKED__ = true;

    const isOwnUI = (node) => {
      if (!node || node.nodeType !== 1) return false;
      return node.closest?.('[data-cgtn-ui]') ||
             document.getElementById('cgpt-nav')?.contains(node) ||
             document.getElementById('cgpt-list-panel')?.contains(node);
    };
    const turnsQ = 'article,[data-testid^="conversation-turn"]';
    const isTurnNode = (n) => n?.nodeType === 1 && (n.matches?.(turnsQ) || n.querySelector?.(turnsQ));

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
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type !== 'childList') continue;
          if ([...m.addedNodes].some(isTurnNode)) postTurn('add');
        }
      });
      mo.observe(root, { childList:true, subtree:true });
    }
  }

  // ====== URL/種別変化：from→to を付けてpost ======
  const fireUrlChange = (src) => {
    const toCid  = chatIdFromUrl();
    const toKind = pageKind();
    const from   = { cid: __lastCid, kind: __lastKind };
    const to     = { cid: toCid,    kind: toKind    };

    if (toCid === __lastCid && toKind === __lastKind) return; // 変化なし
    __lastCid = toCid; __lastKind = toKind;

    log('url-change', 'by=', src, 'from=', from.kind, from.cid || '(none)', '→ to=', to.kind, to.cid || '(none)');
    post('url-change', { from, to, by:src });
  };

  // history フック + popstate + 保険ポーリング
  for (const fn of ['pushState','replaceState']) {
    try {
      const orig = history[fn];
      history[fn] = function(...args){
        const r = orig.apply(this, args);
        fireUrlChange(fn);
        return r;
      };
    } catch {}
  }
  window.addEventListener('popstate', () => fireUrlChange('popstate'), true);
  setInterval(() => fireUrlChange('poll'), 1000);
})();

/*
(function () {
console.log('[cgtn:inject] BOOT try @', location.href);
window.__CGTN_INJECT_PROBE__ = (new Date).toISOString();
  if (window.__CGTN_URL_HOOKED__) return;
  window.__CGTN_URL_HOOKED__ = true;

  // ====== diag helpers ======
  const now = () => new Date().toISOString().split('T')[1].replace('Z','');
  const chatIdFromUrl = () => {
    const m = (location.pathname || '').match(/\/c\/([^/?#]+)/);
    return m ? m[1] : '';
  };
  const pageKind = () => {
    const p = location.pathname || '/';
    if (/\/c\/[^/]+$/.test(p)) return 'chat';
    // “新しいチャット” を明示的に判定
    if (p === '/new' || new URL(location.href).searchParams.get('temporary-chat') === 'true') return 'new';
    if (p === '/' || /^\/g\/?$/.test(p)) return 'home';        // ChatGPTホーム
    if (/^\/g\/p-/.test(p)) return 'project';                  // プロジェクト先頭など
    return 'other';
  };
  let __lastCid  = chatIdFromUrl();
  let __lastKind = pageKind();

  const log  = (...a) => console.log('[cgtn:inject]', now(), ...a);
  const post = (type, extra = {}) => {
    const toCid  = chatIdFromUrl();
    const toKind = pageKind();
    window.postMessage({
      source: 'cgtn',
      type,
      // to: 現在
      cid:  toCid,
      kind: toKind,
      // from: 直前
      fromCid:  __lastCid,
      fromKind: __lastKind,
      // ヒント: 現時点で article 可視か
      hasTurns: !!document.querySelector('article,[data-testid^="conversation-turn"]'),
      ...extra
    }, '*');
  };

  // --- turn-added hook: article 出現を検出して postMessage ---
  if (!window.__CGTN_TURN_HOOKED__) {
    window.__CGTN_TURN_HOOKED__ = true;

    const isOwnUI = (node) => {
      const nav  = document.getElementById('cgpt-nav');
      const list = document.getElementById('cgpt-list-panel');
      return (nav && (node===nav || nav.contains(node))) ||
             (list && (node===list || list.contains(node)));
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
          log('turn-added', 'cid=', chatIdFromUrl() || '(none)', 'kind=', pageKind(), 'reason=', reason);
          post('turn-added', { reason });
        }, 200);
      };

      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type !== 'childList') continue;
          if (isOwnUI(m.target)) continue;
          const arr = [...m.addedNodes, ...m.removedNodes];
          if (arr.some(isTurnNode)) { postTurn('turn-node'); break; }
        }
      });
      try { mo.observe(root, { childList:true, subtree:true }); } catch {}

      // ====== URL/ページ種別の変化を検知してログを出す ======
      const fireUrlChange = (src) => {
        const toCid  = chatIdFromUrl();
        const toKind = pageKind();
        if (toCid === __lastCid && toKind === __lastKind) return;
        const fromCid  = __lastCid;
        const fromKind = __lastKind;
        __lastCid  = toCid;
        __lastKind = toKind;
        log('url-change', 'by=', src, 'from=', `${fromKind}:${fromCid || '-'}`, '→', `${toKind}:${toCid || '-'}`);
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
        } catch {}
      }
      window.addEventListener('popstate', () => fireUrlChange('popstate'), true);
      // 保険（取りこぼし対策）
      setInterval(() => fireUrlChange('poll'), 1000);
    }
  }
})();
*/
