// logic.js  —  ターン抽出/並び/移動ナビ
(() => {
  const SH = window.CGTN_SHARED;
  const NS = (window.CGTN_LOGIC = window.CGTN_LOGIC || {});

  // === ステート ===
  const state = { all: [], user: [], assistant: [] };

  // === スクローラ / 幾何 ===
  let TRUE_SCROLLER = null;
  const TURN_SELECTORS = 'div[data-testid^="conversation-turn-"]';

  function getTrueScroller() {
    if (TRUE_SCROLLER && document.body.contains(TRUE_SCROLLER)) return TRUE_SCROLLER;
    const isScrollable = (el) => {
      const s = el && getComputedStyle(el);
      return !!el && /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight;
    };
    const first = document.querySelector(TURN_SELECTORS) || document.querySelector('[data-message-author-role]');
    if (first) {
      for (let el=first.parentElement; el && el!==document.body; el=el.parentElement) {
        if (isScrollable(el)) { TRUE_SCROLLER = el; return el; }
      }
    }
    TRUE_SCROLLER = document.scrollingElement || document.documentElement;
    return TRUE_SCROLLER;
  }

  function isVisible(el){
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function headNodeOf(article){
    const pick = (root, sel) => {
      const n = (root || article).querySelector(sel);
      return n && isVisible(n) ? n : null;
    };
    const isAssistant = article.matches('[data-message-author-role="assistant"]') || !!article.querySelector('[data-message-author-role="assistant"]');
    const isUser = article.matches('[data-message-author-role="user"]') || !!article.querySelector('[data-message-author-role="user"]');

    if (isAssistant) {
      return pick(article, ':scope > div') || pick(article, 'div.text-base') || pick(article, 'div.markdown') || article;
    }
    if (isUser) {
      const wrap = pick(article, 'div.flex.justify-end') || pick(article, 'div.items-end') || article;
      const firstVisibleChild = Array.from(wrap.children).find(isVisible);
      return firstVisibleChild || article;
    }
    return article;
  }

  function articleTop(scroller, article){
    const node = headNodeOf(article);
    const scR = scroller.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return scroller.scrollTop + (r.top - scR.top);
  }

  function currentAnchor(){
    const { y } = SH.computeAnchor(SH.getCFG());
    return y;
  }

  // === 抽出・整列・再構築 ===
  function pickAllArticles(){
    let list = Array.from(document.querySelectorAll(TURN_SELECTORS));
    if (!list.length) {
      const seen = new Set();
      const nodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
      list = nodes.map(n => n.closest(TURN_SELECTORS) || n)
                  .filter(el => el && !seen.has(el) && (seen.add(el), true));
    }
    return list.filter(a => {
      const r = a.getBoundingClientRect();
      return r.height > 10 && getComputedStyle(a).display !== 'none';
    });
  }

  function sortByY(list, scroller){
    const s = scroller || getTrueScroller();
    try {
      return list.map(el => ({ el, y: articleTop(s, el) }))
                 .sort((a,b) => a.y - b.y)
                 .map(x => x.el);
    } catch {
      return list;
    }
  }

  function rebuild(){
    TRUE_SCROLLER = getTrueScroller();
    const raw = pickAllArticles();
    const sorted = sortByY(raw, TRUE_SCROLLER);
    state.all = sorted;
    state.user = sorted.filter(el => el.matches('[data-message-author-role="user"], [data-message-author-role="user"] *'));
    state.assistant = sorted.filter(el => el.matches('[data-message-author-role="assistant"], [data-message-author-role="assistant"] *'));
  }

  // === スクロール ===
  let scrollLockUntil = 0;
  const locked = () => performance.now() < scrollLockUntil;
  const lockFor = (ms) => (scrollLockUntil = performance.now() + (ms || SH.getCFG().lockMs));

  function scrollToHead(article){
    if (!article) return;
    const sc = getTrueScroller();
    const desired = Math.round(articleTop(sc, article) - currentAnchor());
    const clamped = Math.min(Math.max(0, desired), Math.max(0, sc.scrollHeight - sc.clientHeight));
    lockFor(SH.getCFG().lockMs);
    sc.scrollTo({ top: clamped, behavior: 'smooth' });
  }

  // === 前/次/先頭/末尾（role: 'user' | 'assistant' | 'all'） ===
  function goTop(role){
    const L = role==='all' ? state.all : state[role]; if (!L.length) return;
    scrollToHead(L[0]);
  }
  function goBottom(role){
    if (role === 'all') {
      // ★修正：全体の末尾は“画面の絶対最下端”にスクロール
      const sc = getTrueScroller();
      lockFor(SH.getCFG().lockMs);
      sc.scrollTo({ top: sc.scrollHeight, behavior:'smooth' });
      return;
    }
    const L = state[role]; if (!L.length) return;
    scrollToHead(L[L.length - 1]);
  }
  function goPrev(role){
    const L = role==='all' ? state.all : state[role]; if (!L.length) return;
    const sc = getTrueScroller();
    const yStar = sc.scrollTop + currentAnchor();
    // yStarより"上"の最後を取る
    for (let i=L.length-1; i>=0; i--){
      if (articleTop(sc, L[i]) < yStar - (SH.getCFG().eps||0)) return scrollToHead(L[i]);
    }
  }
  function goNext(role){
    const L = role==='all' ? state.all : state[role]; if (!L.length) return;
    const sc = getTrueScroller();
    const yStar = sc.scrollTop + currentAnchor();
    // yStarより"下"の最初を取る
    for (const el of L){
      if (articleTop(sc, el) > yStar + (SH.getCFG().eps||0)) return scrollToHead(el);
    }
  }

  // === 公開 ===
  NS.rebuild   = rebuild;
  NS.goTop     = goTop;
  NS.goBottom  = goBottom;
  NS.goPrev    = goPrev;
  NS.goNext    = goNext;
})();
