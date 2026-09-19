let db = null;
let currentState = 'stopped';
let scrapeQueue = [];
let isScraping = false;
let globalConvMap = new Map(); // Store names

let liveModeInterval = null;
let liveModeIds = [];

// 3s–9s random delay
const getRandomDelay = () => Math.random() * (9000 - 3000) + 3000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function extractMediaUrls(obj, urls = new Set()) {
  if (!obj || typeof obj !== 'object') return urls;
  
  if (Array.isArray(obj)) {
    obj.forEach(o => extractMediaUrls(o, urls));
  } else {
    let foundMedia = false;
    if (obj.video_versions && Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
      const best = obj.video_versions.slice().sort((a,b) => ((b.width||0)*(b.height||0)) - ((a.width||0)*(a.height||0)))[0];
      if (best && best.url) { urls.add(best.url); foundMedia = true; }
    } 
    else if (obj.image_versions2 && obj.image_versions2.candidates && Array.isArray(obj.image_versions2.candidates)) {
      const best = obj.image_versions2.candidates.slice().sort((a,b) => ((b.width||0)*(b.height||0)) - ((a.width||0)*(a.height||0)))[0];
      if (best && best.url) { urls.add(best.url); foundMedia = true; }
    }
    
    if (obj.audio && obj.audio.audio_src) {
      urls.add(obj.audio.audio_src);
      foundMedia = true;
    }
    
    if (!foundMedia) {
      for (const key of Object.keys(obj)) {
        if (key !== 'user' && key !== 'owner' && key !== 'sender') {
          extractMediaUrls(obj[key], urls);
        }
      }
    }
  }
  return urls;
}

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("samsa_archive", 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("conversations")) {
        db.createObjectStore("conversations", { keyPath: "conversationId" });
      }
      if (!db.objectStoreNames.contains("media_urls")) {
        db.createObjectStore("media_urls", { keyPath: "url" });
      }
    };
    
    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };
    
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

chrome.runtime.onInstalled.addListener(() => {
  initDB();
  chrome.storage.local.set({ state: 'idle', activeSince: null });
});

chrome.action.onClicked.addListener(async () => {
  const panelUrl = chrome.runtime.getURL("panel.html");
  const tabs = await chrome.tabs.query({ url: panelUrl });
  if (tabs.length > 0) {
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    return;
  }
  await chrome.windows.create({
    url: panelUrl,
    type: "popup",
    width: 500,
    height: 720
  });
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ url: "*://www.instagram.com/*" });
  return tabs[0]; // Take first IG tab
}

async function fetchApiViaTab(tabId, url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: 'proxyIgFetch', url }, (response) => {
      if (chrome.runtime.lastError) {
        let errMessage = chrome.runtime.lastError.message;
        if (errMessage.includes("Receiving end does not exist")) {
          errMessage = "Please open and RELOAD your Instagram tab. The extension lost connection to the page.";
        }
        return reject(new Error(errMessage));
      }
      if (!response) return reject(new Error("No response from tab. Ensure IG page is fully loaded."));
      if (response.ok) resolve(response.json);
      else reject(new Error(response.error));
    });
  });
}

async function fetchConversations() {
  const tab = await getActiveTab();
  if (!tab) {
    chrome.runtime.sendMessage({ type: "LOG", payload: `[${new Date().toLocaleTimeString()}] No active Instagram tab found to fetch list!`, level: 'error' }).catch(()=>{});
    return;
  }
  chrome.runtime.sendMessage({ type: "LOG", payload: `[${new Date().toLocaleTimeString()}] Fetching inbox via API...`, level: 'info' }).catch(()=>{});
  try {
    const json = await fetchApiViaTab(tab.id, "https://www.instagram.com/api/v1/direct_v2/inbox/?persistentBadging=true&folder=&limit=20");
    if (json && json.inbox && json.inbox.threads) {
      const convs = json.inbox.threads.map(t => ({
        id: t.thread_id,
        name: t.thread_title || (t.users && t.users.map(u => u.username).join(', ')) || t.thread_id
      }));
      convs.forEach(c => globalConvMap.set(c.id, c.name));
      chrome.runtime.sendMessage({ type: "CONVERSATIONS_FOUND", payload: convs }).catch(() => {});
      chrome.runtime.sendMessage({ type: "LOG", payload: `[${new Date().toLocaleTimeString()}] API returned ${convs.length} recent threads.`, level: 'success' }).catch(()=>{});
    }
  } catch (e) {
    chrome.runtime.sendMessage({ type: "LOG", payload: `[${new Date().toLocaleTimeString()}] Inbox fetch failed: ${e.message}`, level: 'error' }).catch(()=>{});
  }
}

async function scrapeThread(tabId, threadId) {
  chrome.runtime.sendMessage({ type: "CONV_STATUS_UPDATE", payload: { conversationId: threadId, status: "Scraping" } }).catch(()=>{});
  let cursor = "";
  let keepFetching = true;
  let pagesFetched = 0;
  
  while (keepFetching) {
    if (currentState !== 'active') break;

    let url = `https://www.instagram.com/api/v1/direct_v2/threads/${threadId}/`;
    if (cursor) url += `?cursor=${cursor}`;
    
    chrome.runtime.sendMessage({ type: "LOG", payload: `[${new Date().toLocaleTimeString()}] Fetching thread @${threadId} (Page ${pagesFetched+1})`, level: 'info' }).catch(()=>{});
    
    const json = await fetchApiViaTab(tabId, url);
    const thread = json.thread || (json.threads && json.threads[0]);
    if (!thread || !thread.items) {
      throw new Error("Invalid thread JSON structure");
    }
    
    const parsedMessages = [];
    for (const item of thread.items) {
      let text = item.text || "";
      
      const mediaUrls = Array.from(extractMediaUrls(item));
      
      let timestamp = parseInt(item.timestamp);
      if (timestamp > 10000000000000) timestamp = Math.floor(timestamp / 1000); // Sometimes microsec

      parsedMessages.push({
        item_id: item.item_id,
        item_type: item.item_type,
        text: text,
        mediaUrls: mediaUrls,
        timestamp: timestamp,
        sender: item.user_id
      });
    }
    
    const convName = globalConvMap.get(threadId) || threadId;
      const batchPayload = {
        conversationId: threadId,
        conversationName: convName,
        messages: parsedMessages,
        // Preserve full participant details for proper name and profile picture resolution
        participants: thread.users ? thread.users.map(u => ({
          pk: u.pk,
          username: u.username,
          full_name: u.full_name,
          profile_pic_url: u.profile_pic_url
        })) : []
      };
    
    await saveConversationBatch(batchPayload);
    
    // Broadcast batch to panel for downloading media and JSON
    chrome.runtime.sendMessage({ type: "BATCH_SCRAPED", payload: batchPayload }).catch(() => {});
    
    pagesFetched++;
    const msgCount = parsedMessages.length;
    chrome.runtime.sendMessage({ type: "LOG", payload: `[${new Date().toLocaleTimeString()}] Saved ${msgCount} API messages`, level: 'success' }).catch(() => {});

    if (thread.oldest_cursor) {
      cursor = thread.oldest_cursor;
      await sleep(getRandomDelay());
    } else {
      keepFetching = false; // Reached beginning
    }
  }
}

async function startQueue(ids) {
  scrapeQueue = ids;
  if (isScraping) return;
  isScraping = true;
  currentState = 'active';
  chrome.storage.local.set({ state: 'active', activeSince: Date.now() });
  broadcastState();
  
  const tab = await getActiveTab();
  if (!tab) {
    chrome.runtime.sendMessage({ type: "LOG", payload: `[${new Date().toLocaleTimeString()}] No active Instagram tab found!`, level: 'error' }).catch(()=>{});
    isScraping = false;
    return;
  }
  
  while (scrapeQueue.length > 0) {
    if (currentState !== 'active') break;
    const threadId = scrapeQueue.shift();
    try {
      await scrapeThread(tab.id, threadId);
      chrome.runtime.sendMessage({ type: "CONV_STATUS_UPDATE", payload: { conversationId: threadId, status: "Done" } }).catch(()=>{});
    } catch (e) {
      chrome.runtime.sendMessage({ type: "CONV_STATUS_UPDATE", payload: { conversationId: threadId, status: "Error" } }).catch(()=>{});
      chrome.runtime.sendMessage({ type: "LOG", payload: `[${new Date().toLocaleTimeString()}] Error scraping ${threadId}: ${e.message}`, level: 'error' }).catch(()=>{});
    }
    await sleep(getRandomDelay());
  }
  
  isScraping = false;
  if (scrapeQueue.length === 0 && currentState === 'active') {
    chrome.runtime.sendMessage({ type: "LOG", payload: `[${new Date().toLocaleTimeString()}] Queue finished.`, level: 'success' }).catch(()=>{});
    currentState = 'stopped';
    chrome.storage.local.set({ state: 'stopped' });
    broadcastState();
    // panel.js handles the final write
  }
}

async function scrapeThreadLive(tabId, threadId) {
  let url = `https://www.instagram.com/api/v1/direct_v2/threads/${threadId}/`;
  const json = await fetchApiViaTab(tabId, url);
  const thread = json.thread || (json.threads && json.threads[0]);
  if (!thread || !thread.items) return;

  const parsedMessages = [];
  const apiItemIds = new Set();
  let oldestTimestampInFetch = Infinity;

  for (const item of thread.items) {
    apiItemIds.add(item.item_id);
    let text = item.text || "";
    const mediaUrls = Array.from(extractMediaUrls(item));
    let timestamp = parseInt(item.timestamp);
    if (timestamp > 10000000000000) timestamp = Math.floor(timestamp / 1000);

    if (timestamp < oldestTimestampInFetch) oldestTimestampInFetch = timestamp;

    parsedMessages.push({
      item_id: item.item_id,
      item_type: item.item_type,
      text: text,
      mediaUrls: mediaUrls,
      timestamp: timestamp,
      sender: item.user_id
    });
  }

  const convName = globalConvMap.get(threadId) || threadId;
  const batchPayload = {
    conversationId: threadId,
    conversationName: convName,
    messages: parsedMessages,
    participants: thread.users ? thread.users.map(u => ({
      pk: u.pk,
      username: u.username,
      full_name: u.full_name,
      profile_pic_url: u.profile_pic_url
    })) : [],
    isLive: true,
    apiItemIds: Array.from(apiItemIds),
    oldestTimestampInFetch: oldestTimestampInFetch
  };

  await saveConversationBatch(batchPayload);
  chrome.runtime.sendMessage({ type: "BATCH_SCRAPED", payload: batchPayload }).catch(() => {});
}

async function startLiveMode(ids) {
  liveModeIds = ids;
  if (currentState === 'active') return;
  currentState = 'live';
  chrome.storage.local.set({ state: 'live', activeSince: Date.now() });
  broadcastState();

  if (liveModeInterval) clearInterval(liveModeInterval);
  
  const liveScrape = async () => {
    if (currentState !== 'live') return;
    const tab = await getActiveTab();
    if (!tab) return;
    for (const threadId of liveModeIds) {
      if (currentState !== 'live') break;
      try {
        await scrapeThreadLive(tab.id, threadId);
      } catch (e) {
        chrome.runtime.sendMessage({ type: "LOG", payload: `[Live] Error ${threadId}: ${e.message}`, level: 'error' }).catch(()=>{});
      }
      await sleep(2000);
    }
  };
  
  liveScrape();
  liveModeInterval = setInterval(liveScrape, 15000); // 15 seconds
}

async function saveConversationBatch(batch) {
  if (!db) await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["conversations", "media_urls"], "readwrite");
    const convStore = transaction.objectStore("conversations");
    const mediaStore = transaction.objectStore("media_urls");
    
    const getReq = convStore.get(batch.conversationId);
    getReq.onsuccess = (e) => {
      let data = e.target.result;
      if (!data) {
        data = {
          conversationId: batch.conversationId,
          participants: batch.participants || [],
          messages: [],
          last_scraped: Date.now()
        };
      }
      
      const existingMsgIds = new Set(data.messages.map(m => m.item_id || (m.timestamp + m.text)));
      let newCount = 0;
      for (const msg of batch.messages) {
        const key = msg.item_id || (msg.timestamp + msg.text);
        if (!existingMsgIds.has(key)) {
          data.messages.push(msg);
          for (const url of msg.mediaUrls) {
            mediaStore.put({ url: url, conversationId: batch.conversationId, timestamp: msg.timestamp });
          }
          if (batch.isLive) newCount++;
        }
      }
      
      if (batch.isLive && newCount > 0) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('viewer/kali_dragon.png'),
          title: 'Samsa: New Message',
          message: `${newCount} new message(s) in ${batch.conversationName}`
        });
      }

      if (batch.isLive && batch.apiItemIds && batch.oldestTimestampInFetch !== Infinity) {
        const apiIds = new Set(batch.apiItemIds);
        let deletedCount = 0;
        data.messages.forEach(m => {
           if (m.timestamp >= batch.oldestTimestampInFetch && m.item_id) {
               if (!apiIds.has(m.item_id) && !m.deleted) {
                   m.deleted = true;
                   deletedCount++;
               }
           }
        });
        if (deletedCount > 0) {
            chrome.runtime.sendMessage({ type: "LOG", payload: `[Live] Detected ${deletedCount} deleted messages in ${batch.conversationName}`, level: 'warning' }).catch(()=>{});
            chrome.notifications.create({
              type: 'basic',
              iconUrl: chrome.runtime.getURL('viewer/kali_dragon.png'),
              title: 'Samsa: Message Deleted',
              message: `${deletedCount} message(s) were deleted in ${batch.conversationName}`
            });
        }
      }
      
      data.messages.sort((a, b) => a.timestamp - b.timestamp);
      
      data.last_scraped = Date.now();
        // Merge participant objects, ensuring unique entries by pk
        const participantMap = new Map();
        // Existing participants may be simple strings or objects; normalize to objects
        (data.participants || []).forEach(p => {
          if (typeof p === 'string') {
            participantMap.set(p, { pk: p });
          } else if (p && p.pk) {
            participantMap.set(p.pk, p);
          }
        });
        (batch.participants || []).forEach(p => {
          if (p && p.pk) {
            participantMap.set(p.pk, p);
          }
        });
        data.participants = Array.from(participantMap.values());
        if (batch.conversationName) {
          data.name = batch.conversationName;
        }
      
      convStore.put(data);
      resolve();
    };
    getReq.onerror = (e) => reject(e.target.error);
  });
}

function broadcastState() {
  chrome.storage.local.get(['state', 'activeSince', 'idleSince'], (result) => {
    chrome.runtime.sendMessage({ type: "STATE_UPDATE", payload: result }).catch(() => {});
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CONTENT_READY") {
    // Inject automatically triggers this. Fetch list if idle.
    if (currentState !== 'active') {
      fetchConversations();
    }
    return;
  }

  if (message.type === "FETCH_CONVERSATIONS") {
    fetchConversations();
    sendResponse({success:true});
    return true;
  }

  if (message.type === "GET_DB_DATA") {
    getAllData().then(data => sendResponse(data));
    return true;
  }

  if (message.type === "CLEAR_DB") {
    clearDB().then(() => sendResponse({success:true}));
    return true;
  }

  if (message.type === "UPDATE_LOCAL_URLS") {
    updateLocalUrls(message.payload).then(() => sendResponse({success:true}));
    return true;
  }

  if (message.type === "MANUAL_START") {
    startQueue(message.ids);
    sendResponse({success:true});
    return true;
  }

  if (message.type === "STOP_CYCLE") {
    currentState = 'stopped';
    chrome.storage.local.set({ state: 'stopped' });
    broadcastState();
    sendResponse({success:true});
  }

  if (message.type === "START_LIVE_MODE") {
    startLiveMode(message.ids);
    sendResponse({success:true});
    return true;
  }

  if (message.type === "STOP_LIVE_MODE") {
    if (liveModeInterval) clearInterval(liveModeInterval);
    currentState = 'stopped';
    chrome.storage.local.set({ state: 'stopped' });
    broadcastState();
    sendResponse({success:true});
  }

  if (message.type === "CHECK_STATE") {
    chrome.storage.local.get(['state', 'activeSince', 'idleSince'], (result) => {
      sendResponse(result);
    });
    return true;
  }
});

async function getAllData() {
  if (!db) await initDB();
  return new Promise((resolve) => {
    const transaction = db.transaction(["conversations", "media_urls"], "readonly");
    const data = { conversations: [], media_urls: [] };
    
    transaction.objectStore("conversations").getAll().onsuccess = (e) => {
      data.conversations = e.target.result;
      transaction.objectStore("media_urls").getAll().onsuccess = (e2) => {
        data.media_urls = e2.target.result;
        resolve(data);
      }
    };
  });
}

async function clearDB() {
  if (!db) await initDB();
  return new Promise((resolve) => {
    const transaction = db.transaction(["conversations", "media_urls"], "readwrite");
    transaction.objectStore("conversations").clear();
    transaction.objectStore("media_urls").clear();
    transaction.oncomplete = () => resolve();
  });
}

async function updateLocalUrls(batch) {
  if (!db) await initDB();
  return new Promise((resolve) => {
    const transaction = db.transaction(["conversations"], "readwrite");
    const convStore = transaction.objectStore("conversations");
    const getReq = convStore.get(batch.conversationId);
    getReq.onsuccess = (e) => {
      let data = e.target.result;
      if (data) {
        const updateMap = new Map();
        batch.messages.forEach(m => {
          updateMap.set(m.item_id || (m.timestamp + m.text), m.mediaUrls);
        });
        data.messages.forEach(m => {
          const key = m.item_id || (m.timestamp + m.text);
          if (updateMap.has(key)) m.mediaUrls = updateMap.get(key);
        });
        convStore.put(data);
      }
      resolve();
    };
  });
}

initDB();
