// hook.js — Samsa
// Runs in the MAIN WORLD to access Instagram's authenticated session and fetch APIs.
(function () {
  'use strict';

  const post = (type, data) => {
    try { window.postMessage({ __samsa: true, type, data }, '*'); } catch (_) {}
  };

  const _realFetch = window.fetch.bind(window);

  function getCsrf() {
    return (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
  }

  window.addEventListener('message', async (ev) => {
    if (!ev.data?.__samsa || ev.data.type !== 'fetchApi') return;

    const { reqId, url } = ev.data.data;

    try {
      const res = await _realFetch(url, {
        credentials: 'include',
        headers: {
          'x-ig-app-id': '936619743392459',
          'x-csrftoken': getCsrf(),
          'x-requested-with': 'XMLHttpRequest',
          'accept': 'application/json, */*',
        },
      });

      if (res.headers.get('content-type')?.includes('json')) {
        const json = await res.json();
        post('fetchApiResult', { reqId, ok: res.ok, status: res.status, json });
      } else {
        post('fetchApiResult', {
          reqId, ok: false, status: res.status,
          json: null, error: `Non-JSON response (status ${res.status})`
        });
      }
    } catch (e) {
      post('fetchApiResult', { reqId, ok: false, status: 0, json: null, error: e.message });
    }
  });

  post('hookReady', { version: 1 });
})();
