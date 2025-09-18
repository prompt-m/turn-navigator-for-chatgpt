// =========================
// ChatGPT Turn Navigator - options.js (Cleaned Version)
// =========================

const DEFAULTS = Object.freeze({
  centerBias: 0.40,
  headerPx: 0,
  eps: 20,
  lockMs: 700,
  hotkeys: {
    enabled: true,
    targetRole: 'assistant',
    modifier: 'Alt',
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

function showStatus(msg = '保存しました', ms = 1400) {
  const st = $('status');
  st.textContent = msg;
  st.hidden = false;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => (st.hidden = true), ms);
}

function normalizeNumber(el, { applyToUI = false } = {}) {
  const v = el.value.trim();
  if (v === '') return null;

  let num = Number(v);
  if (!Number.isFinite(num)) return null;

  const min = el.min !== '' ? Number(el.min) : -Infinity;
  const max = el.max !== '' ? Number(el.max) : +Infinity;
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

function collectSettingsFromDOM() {
  return {
    centerBias: normalizeNumber($('centerBias')),
    headerPx: normalizeNumber($('headerPx')),
    lockMs: normalizeNumber($('lockMs')),
    eps: normalizeNumber($('eps')),
    hotkeys: {
      enabled: $('enableHotkeys').value === 'true',
      targetRole: $('targetRole').value,
      modifier: $('modifier').value,
      allowInInputs: $('allowInInputs').value === 'true',
      keys: {
        prev: $('keyPrev').value,
        next: $('keyNext').value,
        top: $('keyTop').value,
        bottom: $('keyBottom').value,
        roleUser: $('keyRoleUser').value,
        roleAssistant: $('keyRoleAssistant').value,
        roleAll: $('keyRoleAll').value
      }
    }
  };
}

function save(settings) {
  return new Promise(res => {
    chrome.storage.sync.get('cgNavSettings', ({ cgNavSettings }) => {
      void chrome.runtime.lastError;
      const merged = deepMerge(structuredClone(cgNavSettings || {}), settings);
      chrome.storage.sync.set({ cgNavSettings: merged }, () => {
        void chrome.runtime.lastError;
        res();
      });
    });
  });
}

function load() {
  chrome.storage.sync.get('cgNavSettings', ({ cgNavSettings }) => {
    void chrome.runtime.lastError;
    const s = deepMerge(structuredClone(DEFAULTS), cgNavSettings || {});
    
    $('centerBias').value = s.centerBias;
    $('headerPx').value = s.headerPx;
    $('lockMs').value = s.lockMs;
    $('eps').value = s.eps;

    $('enableHotkeys').value = String(s.hotkeys.enabled);
    $('targetRole').value = s.hotkeys.targetRole;
    $('modifier').value = s.hotkeys.modifier;
    $('allowInInputs').value = String(s.hotkeys.allowInInputs);
    $('keyPrev').value = s.hotkeys.keys.prev;
    $('keyNext').value = s.hotkeys.keys.next;
    $('keyTop').value = s.hotkeys.keys.top;
    $('keyBottom').value = s.hotkeys.keys.bottom;
    $('keyRoleUser').value = s.hotkeys.keys.roleUser;
    $('keyRoleAssistant').value = s.hotkeys.keys.roleAssistant;
    $('keyRoleAll').value = s.hotkeys.keys.roleAll;

    load._lastSettings = s;
  });
}

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const debouncedAutosave = debounce(async () => {
  const newSettings = collectSettingsFromDOM();
  
  if (JSON.stringify(load._lastSettings) !== JSON.stringify(deepMerge(structuredClone(load._lastSettings), newSettings))) {
    await save(newSettings);
    load._lastSettings = deepMerge(structuredClone(load._lastSettings), newSettings);
    showStatus('保存しました');
    
    // shared.js の機能を呼び出して可視ラインを即時反映
    if (window.CGTN?.renderViz) {
      window.CGTN.renderViz(load._lastSettings);
    }
  }
}, 300);

async function resetToDefaults() {
  const { cgNavSettings } = await new Promise(res => chrome.storage.sync.get('cgNavSettings', res));
  void chrome.runtime.lastError;
  const keepPanel = cgNavSettings?.panel ? { panel: cgNavSettings.panel } : {};

  const newSettings = deepMerge(structuredClone(DEFAULTS), keepPanel);
  await new Promise(r => chrome.storage.sync.set({ cgNavSettings: newSettings }, r));
  void chrome.runtime.lastError;

  // UIに反映
  load();

  showStatus('既定に戻しました', 1600);

  // shared.js の機能を呼び出して可視ラインを即時反映
  if (window.CGTN?.renderViz) {
    window.CGTN.renderViz(newSettings);
  }
}

function getSavedValue(id) {
  const map = { centerBias:'centerBias', headerPx:'headerPx', lockMs:'lockMs', eps:'eps' };
  const key = map[id];
  return load._lastSettings?.[key] ?? DEFAULTS[key];
}

document.addEventListener('DOMContentLoaded', () => {
  load();

  // shared.js のホットキー登録機能を呼び出す
  if (window.CGTN?.installHotkey) {
    window.CGTN.installHotkey();
  }

  const inputs = [
    'centerBias','headerPx','lockMs','eps',
    'enableHotkeys','targetRole','modifier','allowInInputs',
    'keyPrev','keyNext','keyTop','keyBottom',
    'keyRoleUser','keyRoleAssistant','keyRoleAll'
  ];

  inputs.forEach(id => {
    const el = $(id);
    el.addEventListener('input', debouncedAutosave);
    el.addEventListener('change', debouncedAutosave);
    if (el.type === 'number') {
        el.addEventListener('blur', () => {
            if (el.value.trim() === '') {
                el.value = getSavedValue(id);
            } else {
                normalizeNumber(el, { applyToUI: true });
            }
            debouncedAutosave();
        });
    }
  });

  $('save').addEventListener('click', async () => {
    const newSettings = collectSettingsFromDOM();
    await save(newSettings);
    load._lastSettings = deepMerge(structuredClone(load._lastSettings), newSettings);
    showStatus('保存しました');
  });

  $('reset').addEventListener('click', resetToDefaults);
});