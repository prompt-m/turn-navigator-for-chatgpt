// sw.ts — MV3 service worker（DOMに触らない）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.cmd === "openOptions") {
        // 拡張機能の公式機能を使って安全に設定画面を開く
        chrome.runtime.openOptionsPage(() => {
            sendResponse({ ok: true });
        });
        return true; // ← 非同期 sendResponse を使うので true を返す
    }
});
