(function(){
  if (window.__CGTN_URL_HOOKED__) return;
  window.__CGTN_URL_HOOKED__ = true;
  const POST = () => window.postMessage({ source:'cgtn', type:'url-change', href: location.href }, '*');
  const _ps = history.pushState, _rs = history.replaceState;
  if (_ps) history.pushState = function(){ const r=_ps.apply(this, arguments); try{POST();}catch(_){} return r; };
  if (_rs) history.replaceState = function(){ const r=_rs.apply(this, arguments); try{POST();}catch(_){} return r; };
  window.addEventListener('popstate', POST, true);
  window.addEventListener('hashchange', POST, true);
  queueMicrotask(POST);
})();
