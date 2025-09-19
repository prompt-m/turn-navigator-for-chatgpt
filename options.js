// =========================
// ChatGPT Turn Navigator - options.js (kept original semantics)
// 即反映 / ステップ丸め / 範囲チェック / ステータス表示
// =========================

const DEFAULTS = Object.freeze({
  centerBias: 0.40,
  headerPx: 0,
  eps: 20,
  lockMs: 700,
  hotkeys: {
    enabled: true,
    targetRole: 'assistant',      // 'assistant' | 'user' | 'all'
    modifier: 'Alt',              // 'Alt' | 'Ctrl' | 'Shift' | 'Meta' | 'None'
    allowInInputs: false,
    keys: {
      prev: 'ArrowUp',
      next: 'ArrowDown',
      top: 'Home',
      bottom: 'End',
      roleUser: 'Digit1',
      roleAssistant: 'Digit2',
      roleAll: 'Digit3'
    }
  },
  panel: { x: null, y: null }
});

const keyChoices = [
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
  'Home','End','PageUp','PageDown',
  'J','K','H','L','U','I','O','N','P','G',
  'Digit1','Digit2','Digit3','Digit4','KeyU','KeyA','KeyZ'
];

const $ = (id) => document.getElementById(id);

const fillKeySelect = (sel) => {
  keyChoices.forEach(k => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = k;
    sel.appendChild(o);
  });
};
['keyPrev','keyNext','keyTop','keyBottom','keyRoleUser','keyRoleAssistant','keyRoleAll']
  .forEach(id => fillKeySelect($(id)));

// -------------------------
// deepMerge（既存値温存）
// -------------------------
function deepMerge(dst, src) {
  for (const k in src) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      dst[k] = deepMerge(dst[k] || {}, src[k]);
    } else {
      dst[k] = src[k];
    }
  }
  return dst;
}

// -------------------------
// ステータス表示
// -------------------------
function showStatus(msg = '保存しました', ms = 1400) {
  const st = $('status');
  st.textContent = msg;
  st.hidden = false;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => (st.hidden = true), ms);
}

// -------------------------
// 数値正規化（丸め／クランプ）
// -------------------------
function normalizeNumber(el, { applyToUI = false } = {}) {
  const v = el.value.trim();
  if (v === '') return null;

  let num = Number(v);
  if (!Number.isFinite(num)) return null;

  const min  = el.min !== '' ? Number(el.min) : -Infinity;
  const max  = el.max !== '' ? Number(el.max) : +Infinity;
  const step = el.step && el.step !== 'any' ? Number(el.step) : 1;

  const roundTo = (x, s) => (!Number.isFinite(s) || s <= 0) ? x : Math.round(x / s) * s;

  let rounded = roundTo(num, step);
  if (rounded < min) rounded = min;
  if (rounded > max) rounded = max;

  if (applyToUI) {
    const stepStr = String(step);
    const dot = stepStr.indexOf('.');
    const digits = dot >= 0 ? (stepStr.length - dot - 1) : 0;
    el.value = digits > 0 ? rounded.toFixed(digits) : String(rounded);
  }
  return rounded;
}

// -------------------------
// DOM → 設定 オブジェクト
// -------------------------
function collectSettingsFromDOM(existing) {
  const idToKey = (id) => ({
    centerBias: 'centerBias',
    headerPx:   'headerPx',
    lockMs:     'lockMs',
    eps:        'eps'
  }[id]);

  const pickNum = (id) => {
    const el = $(id);
    const n  = normalizeNumber(el);
    if (n === null) return existing?.[idToKey(id)];
    return n;
  };

  return {
    centerBias: pickNum('centerBias'),
    headerPx:   pickNum('headerPx'),
    lockMs:     pickNum('lockMs'),
    eps:        pickNum('eps'),
    hotkeys: {
      enabled:       $('enableHotkeys').value === 'true',
      targetRole:    $('targetRole').value,
      modifier:      $('modifier').value,
      allowInInputs: $('allowInInputs').value === 'true',
      keys: {
        prev:          $('keyPrev').value,
        next:          $('keyNext').value,
        top:           $('keyTop').value,
        bottom:        $('keyBottom').value,
        roleUser:      $('keyRoleUser').value,
        roleAssistant: $('keyRoleAssistant').value,
        roleAll:       $('keyRoleAll').value
      }
    }
  };
}

// -------------------------
// 保存：既存値（未知キー）温存
// -------------------------
function save(settings) {
  return new Promise(res => {
    chrome.storage.sync.get('cgNavSettings', ({ cgNavSettings }) => {
      const merged = deepMerge(structuredClone(cgNavSettings || {}), settings);
      chrome.storage.sync.set({ cgNavSettings: merged }, () => res());
    });
  });
}

// -------------------------
// 読み込み
// -------------------------
function load() {
  chrome.storage.sync.get('cgNavSettings', ({ cgNavSettings }) => {
    const s = deepMerge(structuredClone(DEFAULTS), cgNavSettings || {});

    $('centerBias').value = s.centerBias;
    $('headerPx').value   = s.headerPx;
    $('lockMs').value     = s.lockMs;
    $('eps').value        = s.eps;

    $('enableHotkeys').value    = String(s.hotkeys.enabled);
    $('targetRole').value       = s.hotkeys.targetRole;
    $('modifier').value         = s.hotkeys.modifier;
    $('allowInInputs').value    = String(s.hotkeys.allowInInputs);
    $('keyPrev').value          = s.hotkeys.keys.prev;
    $('keyNext').value          = s.hotkeys.keys.next;
    $('keyTop').value           = s.hotkeys.keys.top;
    $('keyBottom').value        = s.hotkeys.keys.bottom;
    $('keyRoleUser').value      = s.hotkeys.keys.roleUser;
    $('keyRoleAssistant').value = s.hotkeys.keys.roleAssistant;
    $('keyRoleAll').value       = s.hotkeys.keys.roleAll;

    load._last = s; // 直近値を保持（空入力時の復元に利用）
  });
}

function deepEqual(a, b){
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

// -------------------------
// 軽いデバウンスで即保存
// -------------------------
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
const debouncedAutosave = debounce(async () => {

  const base = load._last || structuredClone(DEFAULTS);
  const next = collectSettingsFromDOM(base);
  if (!deepEqual(next, load._last)) {
    await save(next);
    load._last = next;
    showStatus('保存しました');
  }
}, 150);


// 既定に戻す（panel は温存）+ UI/キャッシュ/可視ラインまで同期
async function resetToDefaults() {
  // 1) いまの panel を温存
  const { cgNavSettings } = await new Promise(res =>
    chrome.storage.sync.get('cgNavSettings', res)
  );
  const keepPanel = cgNavSettings?.panel ? { panel: cgNavSettings.panel } : {};

  // 2) 既定 + panel で上書き保存
  const next = deepMerge(structuredClone(DEFAULTS), keepPanel);
  await new Promise(r => chrome.storage.sync.set({ cgNavSettings: next }, r));

  // 3) UIに反映（load()相当を直で行う）
  $('centerBias').value   = next.centerBias;
  $('headerPx').value     = next.headerPx;
  $('lockMs').value       = next.lockMs;
  $('eps').value          = next.eps;
  $('enableHotkeys').value   = String(next.hotkeys.enabled);
  $('targetRole').value      = next.hotkeys.targetRole;
  $('modifier').value        = next.hotkeys.modifier;
  $('allowInInputs').value   = String(next.hotkeys.allowInInputs);
  $('keyPrev').value         = next.hotkeys.keys.prev;
  $('keyNext').value         = next.hotkeys.keys.next;
  $('keyTop').value          = next.hotkeys.keys.top;
  $('keyBottom').value       = next.hotkeys.keys.bottom;
  $('keyRoleUser').value     = next.hotkeys.keys.roleUser;
  $('keyRoleAssistant').value= next.hotkeys.keys.roleAssistant;
  $('keyRoleAll').value      = next.hotkeys.keys.roleAll;

  // 4) キャッシュも更新（差分保存ロジックが無駄に走らないように）
  load._last = next;

  // 5) ステータス表示
  showStatus('既定に戻しました', 1600);

  // 6) 可視ライン（options上でも）を最新に
  try { CGTN?.renderViz?.(next); } catch {}

}

// -------------------------
// 現在保存されている数値の取得（空入力復元用）
// -------------------------
function getSavedValue(id) {
  const map = { centerBias:'centerBias', headerPx:'headerPx', lockMs:'lockMs', eps:'eps' };
  const k = map[id];
  const base = load._last || DEFAULTS;
  return base?.[k];
}

// =====================================================
// 可視ライン（設定ページ常設）— 中央線 + 対称バンド
// =====================================================
(function setupViz(){
  function ensureVizElements() {
    const mk = (id, css) => {
      // 既にあればそれを返す（←二重生成の防止）
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        Object.assign(el.style, css);
        document.body.appendChild(el);
      } else {
        Object.assign(el.style, css); // ← スタイルを最新に寄せる
      }
      return el;
    };

    const line = mk('cgpt-bias-line', {
      position: 'fixed',
      left: 0, right: 0,
      height: '0',
      borderTop: '3px solid red',
      zIndex: 2147483647,
      pointerEvents: 'none',
      display: 'none',
      boxSizing: 'content-box',
      margin: 0, padding: 0,
    });

    // 帯は中央対称のグラデーション（content-boxで高さ=帯厚）
    const band = mk('cgpt-bias-band', {
      position: 'fixed',
      left: 0, right: 0,
      height: '0',
      zIndex: 2147483647,
      pointerEvents: 'none',
      display: 'none',
      boxSizing: 'content-box',
      margin: 0, padding: 0,
      background: 'linear-gradient(to bottom, rgba(255,0,0,0.08) 0%, rgba(255,0,0,0.22) 50%, rgba(255,0,0,0.08) 100%)',
    });

    return { line, band };
  }

  const { line, band } = ensureVizElements();

  // ← これが“真実”。display に依存しない
  let isVizShown = false;
  const applyVisibility = () => {
    line.style.display = isVizShown ? '' : 'none';
    band.style.display = isVizShown ? '' : 'none';
  };

  function applyFrom(s) {
    const vh     = window.innerHeight | 0;
    const bias   = s.centerBias ?? DEFAULTS.centerBias;
    const header = s.headerPx   ?? DEFAULTS.headerPx;
    const eps    = s.eps        ?? DEFAULTS.eps;

    const y = Math.round(vh * bias - header); // ← 位置式はこれ一本
    line.style.top    = `${y}px`;
    band.style.top    = `${y - eps}px`;       // 中央線をまたいで上下対称
    band.style.height = `${eps * 2}px`;

    // 位置更新のたびに“現在の表示状態”を貫徹
    applyVisibility();
  }

  // Console からも呼べるトグル
  window.toggleVizLines = (force) => {
    isVizShown = (force === undefined) ? !isVizShown : !!force;
    applyVisibility();
  };

  // 初期反映＆変更反映
  chrome.storage.sync.get('cgNavSettings', ({ cgNavSettings }) => applyFrom(cgNavSettings || {}));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.cgNavSettings) {
      applyFrom(changes.cgNavSettings.newValue || {});
    }
  });
  window.addEventListener('resize', () => {
    chrome.storage.sync.get('cgNavSettings', ({ cgNavSettings }) => applyFrom(cgNavSettings || {}));
  });

  // 隠しホットキー Ctrl+Alt+Shift+V
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyV') {
      e.preventDefault();
      window.toggleVizLines();
      console.log('[options] toggleVizLines() via hotkey');
    }
  }, true);
})();

// =========================
// イベント束ね
// =========================
document.addEventListener('DOMContentLoaded', () => {
  load();

  ['centerBias','headerPx','lockMs','eps'].forEach(id => {
    const el = $(id);
    el.addEventListener('input',  debouncedAutosave);
    el.addEventListener('change', () => {
      if (el.value.trim() === '') {
        const v = getSavedValue(id);
        if (v !== undefined) el.value = String(v);
      } else {
        normalizeNumber(el, { applyToUI: true });
      }
      debouncedAutosave();
    });
    el.addEventListener('blur', () => {
      if (el.value.trim() === '') {
        const v = getSavedValue(id);
        if (v !== undefined) el.value = String(v);
      } else {
        normalizeNumber(el, { applyToUI: true });
      }
      debouncedAutosave();
    });
  });

  [
    'enableHotkeys','targetRole','modifier','allowInInputs',
    'keyPrev','keyNext','keyTop','keyBottom',
    'keyRoleUser','keyRoleAssistant','keyRoleAll'
  ].forEach(id => {
    $(id).addEventListener('change', debouncedAutosave);
  });

  $('save').addEventListener('click', async () => {
    const base = load._last || structuredClone(DEFAULTS);
    const next = collectSettingsFromDOM(base);
    await save(next);
    load._last = next;
    showStatus('保存しました');
  });

  $('reset').addEventListener('click', resetToDefaults);
});
