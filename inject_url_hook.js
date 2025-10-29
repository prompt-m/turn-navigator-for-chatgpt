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
