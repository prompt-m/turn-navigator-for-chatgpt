const DEFAULTS = {
  centerBias: 0.46,
  headerPx: 48,
  lockMs: 700,
  eps: 6,
  hotkeys: {
    enabled: true,
    targetRole: 'assistant',   // 'assistant' | 'user' | 'all'
    modifier: 'Alt',           // 'Alt' | 'Ctrl' | 'Shift' | 'Meta' | 'None'
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
  }
};

const keyChoices = [
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
  'Home','End','PageUp','PageDown',
  'J','K','H','L','U','I','O','N','P','G',
  'Digit1','Digit2','Digit3','Digit4','KeyU','KeyA','KeyZ'
];

function byId(id){ return document.getElementById(id); }
function fillKeySelect(sel){ keyChoices.forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; sel.appendChild(o); }); }

['keyPrev','keyNext','keyTop','keyBottom','keyRoleUser','keyRoleAssistant','keyRoleAll']
  .forEach(id=> fillKeySelect(byId(id)));

function deepMerge(dst, src){
  for(const k in src){
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      dst[k] = deepMerge(dst[k] || {}, src[k]);
    } else {
      dst[k] = src[k];
    }
  }
  return dst;
}

function load(){
  chrome.storage.sync.get('cgNavSettings', ({ cgNavSettings })=>{
    const s = deepMerge(structuredClone(DEFAULTS), cgNavSettings || {});

    byId('centerBias').value = s.centerBias;
    byId('headerPx').value   = s.headerPx;
    byId('lockMs').value     = s.lockMs;
    byId('eps').value        = s.eps;

    byId('enableHotkeys').value = String(s.hotkeys.enabled);
    byId('targetRole').value    = s.hotkeys.targetRole;
    byId('modifier').value      = s.hotkeys.modifier;
    byId('allowInInputs').value = String(s.hotkeys.allowInInputs);

    byId('keyPrev').value   = s.hotkeys.keys.prev;
    byId('keyNext').value   = s.hotkeys.keys.next;
    byId('keyTop').value    = s.hotkeys.keys.top;
    byId('keyBottom').value = s.hotkeys.keys.bottom;

    byId('keyRoleUser').value      = s.hotkeys.keys.roleUser;
    byId('keyRoleAssistant').value = s.hotkeys.keys.roleAssistant;
    byId('keyRoleAll').value       = s.hotkeys.keys.roleAll;
  });
}

function save(){
  const s = {
    centerBias: parseFloat(byId('centerBias').value),
    headerPx: parseInt(byId('headerPx').value,10),
    lockMs: parseInt(byId('lockMs').value,10),
    eps: parseInt(byId('eps').value,10),
    hotkeys: {
      enabled: byId('enableHotkeys').value === 'true',
      targetRole: byId('targetRole').value,
      modifier: byId('modifier').value,
      allowInInputs: byId('allowInInputs').value === 'true',
      keys: {
        prev: byId('keyPrev').value,
        next: byId('keyNext').value,
        top: byId('keyTop').value,
        bottom: byId('keyBottom').value,
        roleUser: byId('keyRoleUser').value,
        roleAssistant: byId('keyRoleAssistant').value,
        roleAll: byId('keyRoleAll').value
      }
    }
  };
  chrome.storage.sync.set({ cgNavSettings: s }, ()=>{
    const st = document.getElementById('status');
    st.hidden = false; setTimeout(()=> st.hidden = true, 1200);
  });
}

function reset(){ chrome.storage.sync.set({ cgNavSettings: DEFAULTS }, load); }

document.getElementById('save').addEventListener('click', save);
document.getElementById('reset').addEventListener('click', reset);
document.addEventListener('DOMContentLoaded', load);
