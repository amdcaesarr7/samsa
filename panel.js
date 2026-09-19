// panel.js

// DOM Elements
const clockEl = document.getElementById('live-clock');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const timerEl = document.getElementById('session-timer');
const statConvs = document.getElementById('stat-convs');
const statMsgs = document.getElementById('stat-msgs');
const statMedia = document.getElementById('stat-media');
const logContainer = document.getElementById('log-container');
const convContainer = document.getElementById('conv-container');
const btnSelectAll = document.getElementById('btn-select-all');

// State
let currentState = 'stopped';
let activeSince = null;
let idleSince = null;
let dbData = null;
let liveConversations = []; // From sidebar
let rootFolderHandle = null;
let totalMediaToDownload = 0;
let mediaDownloaded = 0;
let batchQueue = [];
let isProcessingBatch = false;

function updateMediaProgress() {
  const el = document.getElementById('media-progress');
  const cnt = document.getElementById('media-count');
  if (totalMediaToDownload > 0) {
    el.style.display = 'block';
    cnt.textContent = `${mediaDownloaded}/${totalMediaToDownload}`;
  } else {
    el.style.display = 'none';
  }
}

async function fetchAndSaveMedia(url, convName, timestamp) {
  if (!rootFolderHandle) return url;
  
  try {
    const sanitizedName = String(convName || 'unknown').replace(/[^a-z0-9_\-]/gi, '_').slice(0, 50);
    const mediaFolder = await rootFolderHandle.getDirectoryHandle('media', { create: true });
    const convFolder = await mediaFolder.getDirectoryHandle(sanitizedName, { create: true });
    
    const cleanUrl = url.split('?')[0];
    let ext = '.jpg';
    const match = cleanUrl.match(/\.(mp4|jpg|jpeg|png|webp|gif|mp3|m4a|aac)$/i);
    if (match) ext = match[0];
    else if (url.includes('audio')) ext = '.mp4';
    else if (url.includes('video')) ext = '.mp4';
    
    // Fallback if timestamp collision happens in the same millisecond
    const randomSuffix = Math.floor(Math.random() * 1000);
    const fileName = `media_${timestamp}_${randomSuffix}${ext}`;
    const relativePath = `media/${sanitizedName}/${fileName}`;
    
    try {
      await convFolder.getFileHandle(fileName, { create: false });
      return relativePath; // skip if exists
    } catch(e) {}

    const res = await fetch(url);
    if (!res.ok) throw new Error("Fetch failed");
    const blob = await res.blob();
    
    const fh = await convFolder.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    await writable.write(blob);
    await writable.close();
    
    return relativePath;
  } catch (e) {
    addLog(`[${new Date().toLocaleTimeString()}] Media download failed: ${e.message}`, 'warning');
    return url;
  }
}

async function writeJsonToDisk() {
  if (!rootFolderHandle) return;
  try {
    const data = await new Promise(resolve => chrome.runtime.sendMessage({ type: "GET_DB_DATA" }, resolve));
    const fh = await rootFolderHandle.getFileHandle('samsa_archive.json', { create: true });
    const writable = await fh.createWritable();
    await writable.write(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    await writable.close();
  } catch (e) {
    addLog(`[${new Date().toLocaleTimeString()}] Failed to auto-save JSON: ${e.message}`, 'error');
  }
}

async function processBatchQueue() {
  if (isProcessingBatch || batchQueue.length === 0) return;
  isProcessingBatch = true;
  
  while (batchQueue.length > 0) {
    const batch = batchQueue.shift();
    let hasLocalUpdates = false;
    
    for (const msg of batch.messages) {
      if (msg.mediaUrls && msg.mediaUrls.length > 0) {
        totalMediaToDownload += msg.mediaUrls.length;
        updateMediaProgress();
        
        const localUrls = [];
        for (const url of msg.mediaUrls) {
          if (!url.startsWith('http')) {
            localUrls.push(url);
            mediaDownloaded++;
            updateMediaProgress();
            continue;
          }
          
          const localPath = await fetchAndSaveMedia(url, batch.conversationName, msg.timestamp);
          localUrls.push(localPath);
          if (localPath !== url) hasLocalUpdates = true;
          
          mediaDownloaded++;
          updateMediaProgress();
        }
        msg.mediaUrls = localUrls;
      }
    }
    
    if (hasLocalUpdates) {
      await new Promise(resolve => chrome.runtime.sendMessage({ type: "UPDATE_LOCAL_URLS", payload: batch }, resolve));
    }
    
    await writeJsonToDisk();
  }
  
  isProcessingBatch = false;
}

// Smart Buttons State Machine
const btnStates = {
  idle:     { show: ["btn-start", "btn-live"],       hide: ["btn-pause","btn-resume","btn-stop","btn-stop-live"] },
  active:   { show: ["btn-pause","btn-stop"],        hide: ["btn-start","btn-resume","btn-live","btn-stop-live"] },
  paused:   { show: ["btn-resume","btn-stop"],       hide: ["btn-start","btn-pause","btn-live","btn-stop-live"] },
  stopped:  { show: ["btn-start", "btn-live"],       hide: ["btn-pause","btn-resume","btn-stop","btn-stop-live"] },
  live:     { show: ["btn-stop-live"],               hide: ["btn-start","btn-pause","btn-resume","btn-stop","btn-live"] }
};

function updateButtons(state) {
  if (!btnStates[state]) return;
  Object.entries(btnStates[state]).forEach(([action, ids]) => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = action === "show" ? "inline-block" : "none";
      }
    });
  });
}

// Live Clock
setInterval(() => {
  clockEl.textContent = new Date().toLocaleTimeString();
  updateTimer();
}, 1000);

function updateTimer() {
  if (currentState === 'active' && activeSince) {
    const elapsed = Date.now() - activeSince;
    timerEl.textContent = formatTime(elapsed);
  } else if (currentState === 'idle' && idleSince) {
    const elapsed = Date.now() - idleSince;
    const remaining = Math.max(0, 30 * 60 * 1000 - elapsed);
    timerEl.textContent = formatTime(remaining);
  } else if (currentState === 'paused') {
    timerEl.textContent = "--:--";
  } else {
    timerEl.textContent = "00:00";
  }
}

function formatTime(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSecs / 60)).padStart(2, '0');
  const s = String(totalSecs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// Logging
function addLog(message, level = 'info') {
  const el = document.createElement('div');
  el.className = `log-entry ${level}`;
  el.textContent = message;
  logContainer.appendChild(el);
  logContainer.scrollTop = logContainer.scrollHeight;
}

const btnCopyLogs = document.getElementById('btn-copy-logs');
if (btnCopyLogs) {
  btnCopyLogs.addEventListener('click', () => {
    const logs = Array.from(logContainer.children).map(el => el.textContent).join('\n');
    navigator.clipboard.writeText(logs).then(() => {
      btnCopyLogs.textContent = 'COPIED!';
      setTimeout(() => btnCopyLogs.textContent = 'COPY', 2000);
    });
  });
}

// Data Fetch & Render
function loadData() {
  chrome.runtime.sendMessage({ type: "GET_DB_DATA" }, (response) => {
    if (!response) return;
    dbData = response;
    
    const convs = response.conversations || [];
    const media = response.media_urls || [];
    
    statConvs.textContent = convs.length;
    let totalMsgs = 0;
    convs.forEach(c => totalMsgs += (c.messages ? c.messages.length : 0));
    statMsgs.textContent = totalMsgs;
    statMedia.textContent = media.length;
    
    renderConversations();
  });
}

function renderConversations() {
  // Merge live sidebar convs with db convs
  const dbMap = new Map();
  if (dbData && dbData.conversations) {
    dbData.conversations.forEach(c => dbMap.set(c.conversationId, c));
  }

  // Preserve checked state
  const checkedIds = new Set();
  document.querySelectorAll('.conv-checkbox').forEach(cb => {
    if (cb.checked) checkedIds.add(cb.value);
  });

  convContainer.innerHTML = '';

  // Use live ones if available, otherwise just db ones
  const itemsToRender = liveConversations.length > 0 ? liveConversations : Array.from(dbMap.values()).map(c => ({
    id: c.conversationId,
    name: "Unknown (DB)"
  }));

  itemsToRender.forEach(liveC => {
    const cId = liveC.id;
    const dbC = dbMap.get(cId) || null;
    
    const msgCount = dbC && dbC.messages ? dbC.messages.length : 0;
    const lastScraped = dbC ? new Date(dbC.last_scraped).toLocaleString() : 'Never';
    
    // Status badge (Pending by default, overridden if active)
    let status = 'Pending';
    let statusClass = 'pending';
    
    // Check if there is an active badge override
    const existingBadge = document.getElementById(`badge-${cId}`);
    if (existingBadge) {
      status = existingBadge.textContent;
      statusClass = existingBadge.className.replace('conv-badge ', '');
    }

    const item = document.createElement('div');
    item.className = 'conv-item';
    
    const header = document.createElement('div');
    header.className = 'conv-header';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'conv-checkbox';
    checkbox.value = cId;
    if (checkedIds.has(cId)) checkbox.checked = true;
    
    // Don't expand when clicking checkbox
    checkbox.addEventListener('click', e => e.stopPropagation());
    
    const info = document.createElement('div');
    info.className = 'conv-info';
    
    const title = document.createElement('span');
    title.className = 'conv-title';
    title.textContent = liveC.name || cId;
    title.title = cId;
    
    const meta = document.createElement('span');
    meta.className = 'conv-meta';
    meta.textContent = `${msgCount} msgs • Last: ${lastScraped}`;
    
    info.appendChild(title);
    info.appendChild(meta);
    
    const badge = document.createElement('span');
    badge.className = `conv-badge ${statusClass}`;
    badge.id = `badge-${cId}`;
    badge.textContent = status;
    
    header.appendChild(checkbox);
    header.appendChild(info);
    header.appendChild(badge);
    
    item.appendChild(header);

    if (dbC && dbC.messages && dbC.messages.length > 0) {
      const preview = document.createElement('div');
      preview.className = 'conv-preview';
      const recent = dbC.messages.slice(-5);
      recent.forEach(m => {
        const pMsg = document.createElement('div');
        pMsg.className = 'preview-msg';
        pMsg.textContent = m.text ? m.text : (m.mediaUrls.length > 0 ? '[Media]' : '[Empty]');
        preview.appendChild(pMsg);
      });
      item.appendChild(preview);
      
      header.addEventListener('click', () => {
        preview.classList.toggle('expanded');
      });
    }

    convContainer.appendChild(item);
  });
}

function updateState(payload) {
  if (!payload) return;
  currentState = payload.state || 'stopped';
  activeSince = payload.activeSince || null;
  idleSince = payload.idleSince || null;
  
  statusDot.className = `status-dot ${currentState}`;
  statusText.textContent = currentState.toUpperCase();

  updateButtons(currentState);
}

// Select All Toggle
let selectAllState = false;
btnSelectAll.addEventListener('click', () => {
  selectAllState = !selectAllState;
  document.querySelectorAll('.conv-checkbox').forEach(cb => {
    cb.checked = selectAllState;
  });
  btnSelectAll.textContent = selectAllState ? "Deselect All" : "Select All";
});

// Refresh List
const btnRefreshList = document.getElementById('btn-refresh-list');
if (btnRefreshList) {
  btnRefreshList.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: "FETCH_CONVERSATIONS" });
    addLog(`[${new Date().toLocaleTimeString()}] Requested conversation list...`, 'info');
  });
}

// Manual Add
document.getElementById('btn-add-manual').addEventListener('click', () => {
  const input = document.getElementById('input-manual-id');
  const val = input.value.trim();
  if (val) {
    const newConv = { id: val, name: val + " (Manual)" };
    if (!liveConversations.find(c => c.id === val)) {
      liveConversations.unshift(newConv);
      renderConversations();
    }
    input.value = '';
    setTimeout(() => {
      const cb = document.querySelector(`.conv-checkbox[value="${val}"]`);
      if (cb) cb.checked = true;
    }, 50);
  }
});


// Listen for messages from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATE_UPDATE") {
    updateState(msg.payload);
  } else if (msg.type === "LOG") {
    addLog(msg.payload, msg.level);
    if (msg.level === 'success') loadData(); // refresh stats on new batch
  } else if (msg.type === "CONVERSATIONS_FOUND") {
    liveConversations = msg.payload;
    renderConversations();
  } else if (msg.type === "CONV_STATUS_UPDATE") {
    const { conversationId, status } = msg.payload;
    const badge = document.getElementById(`badge-${conversationId}`);
    if (badge) {
      badge.textContent = status;
      badge.className = `conv-badge ${status.toLowerCase()}`;
    }
  } else if (msg.type === "BATCH_SCRAPED") {
    if (rootFolderHandle) {
      batchQueue.push(msg.payload);
      processBatchQueue();
    }
  }
});

// Initial load
chrome.runtime.sendMessage({ type: "CHECK_STATE" }, (response) => {
  updateState(response);
});
loadData();
addLog(`[${new Date().toLocaleTimeString()}] Panel initialized`, 'info');

// Controls
document.getElementById('btn-start').addEventListener('click', async () => {
  const checkedBoxes = document.querySelectorAll('.conv-checkbox:checked');
  const ids = Array.from(checkedBoxes).map(cb => cb.value);
  
  if (ids.length === 0) {
    addLog(`[${new Date().toLocaleTimeString()}] No conversations selected!`, 'warning');
    return;
  }
  
  try {
    if (!rootFolderHandle) {
      rootFolderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      addLog(`[${new Date().toLocaleTimeString()}] Save folder selected.`, 'success');
    }
  } catch (e) {
    addLog(`[${new Date().toLocaleTimeString()}] Folder selection cancelled.`, 'warning');
    return;
  }

  // Reset badges for selected
  ids.forEach(id => {
    const badge = document.getElementById(`badge-${id}`);
    if (badge) {
      badge.textContent = 'PENDING';
      badge.className = 'conv-badge pending';
    }
  });

  chrome.runtime.sendMessage({ type: "MANUAL_START", ids: ids }, () => {
    addLog(`[${new Date().toLocaleTimeString()}] Start signal received for ${ids.length} conversations`, 'success');
    chrome.runtime.sendMessage({ type: "CHECK_STATE" }, updateState);
  });
});

document.getElementById('btn-pause').addEventListener('click', () => {
  // Use PAUSE_ERROR channel to trigger pause manually
  chrome.runtime.sendMessage({ type: "PAUSE_ERROR", payload: "User paused manually" });
});

document.getElementById('btn-resume').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: "RESUME_CYCLE" }, () => {
    addLog(`[${new Date().toLocaleTimeString()}] Cycle resumed`, 'success');
    chrome.runtime.sendMessage({ type: "CHECK_STATE" }, updateState);
  });
});

document.getElementById('btn-stop').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: "STOP_CYCLE" }, () => {
    addLog(`[${new Date().toLocaleTimeString()}] Cycle stopped`, 'warning');
    chrome.runtime.sendMessage({ type: "CHECK_STATE" }, updateState);
  });
});

document.getElementById('btn-live').addEventListener('click', async () => {
  const checkedBoxes = document.querySelectorAll('.conv-checkbox:checked');
  const ids = Array.from(checkedBoxes).map(cb => cb.value);
  
  if (ids.length === 0) {
    addLog(`[${new Date().toLocaleTimeString()}] No conversations selected for Live Mode!`, 'warning');
    return;
  }
  
  try {
    if (!rootFolderHandle) {
      rootFolderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      addLog(`[${new Date().toLocaleTimeString()}] Save folder selected for Live Mode.`, 'success');
    }
  } catch (e) {
    addLog(`[${new Date().toLocaleTimeString()}] Folder selection cancelled.`, 'warning');
    return;
  }

  chrome.runtime.sendMessage({ type: "START_LIVE_MODE", ids: ids }, () => {
    addLog(`[${new Date().toLocaleTimeString()}] Live Mode started for ${ids.length} conversations`, 'success');
    chrome.runtime.sendMessage({ type: "CHECK_STATE" }, updateState);
  });
});

document.getElementById('btn-stop-live').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: "STOP_LIVE_MODE" }, () => {
    addLog(`[${new Date().toLocaleTimeString()}] Live Mode stopped`, 'warning');
    chrome.runtime.sendMessage({ type: "CHECK_STATE" }, updateState);
  });
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (confirm("Are you sure you want to clear all archived DMs? This cannot be undone.")) {
    chrome.runtime.sendMessage({ type: "CLEAR_DB" }, () => {
      addLog(`[${new Date().toLocaleTimeString()}] Archive cleared`, 'error');
      dbData = null;
      loadData();
    });
  }
});

// Export functions
function downloadBlob(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('btn-export-all-json').addEventListener('click', () => {
  if (!dbData) return;
  downloadBlob(JSON.stringify(dbData, null, 2), 'samsa_archive_all.json', 'application/json');
});

document.getElementById('btn-export-all-csv').addEventListener('click', () => {
  if (!dbData || !dbData.conversations) return;
  let csv = 'conversationId,timestamp,text,mediaUrls\n';
  dbData.conversations.forEach(c => {
    if (c.messages) {
      c.messages.forEach(m => {
        const text = m.text ? m.text.replace(/"/g, '""') : '';
        const media = m.mediaUrls ? m.mediaUrls.join(';') : '';
        csv += `"${c.conversationId}","${new Date(m.timestamp).toISOString()}","${text}","${media}"\n`;
      });
    }
  });
  downloadBlob(csv, 'samsa_archive_all.csv', 'text/csv');
});
