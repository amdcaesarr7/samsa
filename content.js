// content.js — Samsa Bridge
let _hookReady = false;
let _reqId = 0;
const _pending = new Map();

// Inject hook.js
const script = document.createElement('script');
script.src = chrome.runtime.getURL('hook.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// Listen to hook.js
window.addEventListener('message', (ev) => {
  if (!ev.data?.__samsa) return;
  const { type, data } = ev.data;

  if (type === 'hookReady') {
    _hookReady = true;
    chrome.runtime.sendMessage({ type: "CONTENT_READY" }).catch(() => {});
  } else if (type === 'fetchApiResult') {
    const p = _pending.get(data.reqId);
    if (p) {
      clearTimeout(p.timer);
      _pending.delete(data.reqId);
      if (data.ok) {
        p.resolve(data);
      } else {
        p.reject(new Error(data.error || `API error ${data.status}`));
      }
    }
  }
});

// Fetch wrapper
function igFetch(url) {
  return new Promise((resolve, reject) => {
    if (!_hookReady) return reject(new Error("Hook not ready"));
    const id = ++_reqId;
    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error('Timeout: ' + url));
    }, 30000);
    _pending.set(id, { resolve, reject, timer });
    window.postMessage({ __samsa: true, type: 'fetchApi', data: { reqId: id, url } }, '*');
  });
}

// Proxy from background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'proxyIgFetch') {
    igFetch(msg.url)
      .then((res) => sendResponse({ ok: true, json: res.json }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // Keep channel open
  }
});
