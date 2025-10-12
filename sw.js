// sw.js — MV3 service worker（DOMに触らない）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.cmd === 'openOptions') {
    chrome.runtime.openOptionsPage(() => {
      // 失敗時のみフォールバック（tabs 権限があればタブ作成）
      if (chrome.runtime.lastError) {
        try {
          chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
        } catch (_) {}
      }
      sendResponse({ ok: true });
    });
    return true; // ← 非同期 sendResponse を使うので true を返す
  }
});
