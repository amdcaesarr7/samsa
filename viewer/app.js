// ═══════════════════════════════════════════
// SAMSA Archive Viewer — app.js
// ═══════════════════════════════════════════

// ─── Credentials ─────────────────────────────
const CREDENTIALS = { username: 'caesar', password: 'blehh' };

const NAME_OVERRIDES = {
  '340282366841710301244276027063499769278': 'Aarushiee',
  '340282366841710301244276076731847501149': 'Swatiie'
};

// ─── Boot sequence lines ──────────────────────
const BOOT_LINES = [
  '[ 0.000000] BIOS-provided physical RAM map:',
  '[ 0.000000] BIOS-e820: [mem 0x0000000000000000-0x000000000009fbff] usable',
  '[ 0.000000] BIOS-e820: [mem 0x000000000009fc00-0x000000000009ffff] reserved',
  '[ 0.000000] BIOS-e820: [mem 0x00000000000e0000-0x00000000000fffff] reserved',
  '[ 0.000000] Initializing cgroup subsys cpuset',
  '[ 0.000000] Initializing cgroup subsys memory',
  '[ 0.000000] Initializing cgroup subsys blkio',
  '[ 0.000000] Linux version 6.5.0-samsa3-amd64 (dev@samsa.local)',
  '[ 0.000000] Command line: BOOT_IMAGE=/boot/vmlinuz-6.5.0 root=/dev/sda1 ro quiet splash',
  '[ 0.000000] KERNEL supported cpus: Intel GenuineIntel, AMD AuthenticAMD',
  '[ 0.000000] x86/fpu: x87 FPU will use FXSAVE',
  '[ 0.000000] Disabled fast string operations',
  '[ 0.082341] ACPI: IRQ0 used by override.',
  '[ 0.128471] ACPI: IRQ2 used by override.',
  '[ 0.202384] pci 0000:00:00.0: Samsa memory extensions detected',
  '[ 0.240001] pci 0000:00:1f.2: AHCI 0001.0300 32 slots',
  '[ 0.320011] clocksource: tsc-early: mask: 0xffffffffffffffff',
  '[ 0.380044] Booting paravirtualized kernel on bare hardware',
  '[ 0.450712] NET: Registered PF_INET6 protocol family',
  '[ 0.512003] PCI: Using configuration type 1 for base access',
  '[ 0.604881] ACPI: bus type USB registered',
  '[ 0.650000] usbcore: registered new device driver usb',
  '[ 0.700000] usbcore: registered new interface driver hub',
  '[ 0.722199] usbcore: registered new interface driver usb-storage',
  '[ 0.780000] mousedev: PS/2 mouse device common for all mice',
  '[ 0.820000] input: Power Button as /devices/LNXSYSTM:00',
  '[ 0.872301] Loading samsa_archive kernel module ...',
  '[ 0.872844] EXT4-fs (sda1): mounted filesystem with ordered data mode',
  '[ 0.920000] Bluetooth: HCI device and connection manager initialized',
  '[ 0.960000] Bluetooth: RFCOMM socket layer initialized',
  '[ 0.990017] systemd[1]: Inserted module \'samsa_storage\'',
  '[ 1.020000] systemd[1]: systemd 252 running in system mode.',
  '[ 1.100432] dracut-initqueue[318]: done.',
  '[ 1.150000] Started udev Kernel Device Manager.',
  '[ 1.210089] Starting Archive Indexing Service...',
  '[ 1.260000] Started Remount Root and Kernel File Systems.',
  '[ 1.310000] Started Load Kernel Modules.',
  '[ 1.350200] Started Journal Service.',
  '[ 1.413770] samsa[1]: Reading IndexedDB snapshot',
  '[ 1.470000] samsa[1]: Parsing conversation metadata...',
  '[ 1.520443] Started D-Bus System Message Bus.',
  '[ 1.575000] Started Network Name Resolution.',
  '[ 1.611009] samsa[1]: Mapping media directory...',
  '[ 1.660000] samsa[1]: Found 2 conversation threads.',
  '[ 1.720884] NetworkManager: Starting...',
  '[ 1.780000] samsa[1]: Loading message index [1/4]...',
  '[ 1.840000] samsa[1]: Loading message index [2/4]...',
  '[ 1.890000] samsa[1]: Loading message index [3/4]...',
  '[ 1.940000] samsa[1]: Loading message index [4/4]...',
  '[ 1.998223] samsa[1]: Archive service ready.',
  '[ 2.050000] Started Login Service.',
  '[ 2.120000] Started Bluetooth Manager.',
  '[ 2.200000] samsa[1]: Encryption layer initialized.',
  '[ 2.280000] samsa[1]: Access control policies loaded.',
  '[ 2.350000] samsa[1]: Integrity checks passed.',
  '[ 2.420000] samsa[1]: Handoff to display manager.',
  '',
  '  ██████╗ ███╗   ███╗ ██████╗  █████╗ ',
  ' ██╔════╝████╗ ████║██╔════╝ ██╔══██╗',
  ' ╚█████╗ ██╔████╔██║╚█████╗  ███████║',
  '  ╚═══██║██║╚██╔╝██║ ╚═══██║ ██╔══██║',
  ' ██████╔╝██║ ╚═╝ ██║██████╔╝ ██║  ██║',
  ' ╚═════╝ ╚═╝     ╚═╝╚═════╝  ╚═╝  ╚═╝',
  '',
  ' Archive Viewer // Caesar Build',
  '',
  'Samsa Linux 2025  /dev/tty1',
  '',
  'samsa login: _',
];

// ─── State ────────────────────────────────────
let archiveData = null;
let activeConvId = null;
let selfPk = null;

// ─── Screens ──────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const el = document.getElementById(id);
  el.style.display = 'flex';
  requestAnimationFrame(() => el.classList.add('active'));
}

// ─── BOOT ─────────────────────────────────────
let bootAborted = false;

async function runBoot() {
  bootAborted = false;
  showScreen('screen-boot');
  const log = document.getElementById('boot-log');
  const screen = document.getElementById('screen-boot');
  for (const line of BOOT_LINES) {
    if (bootAborted) break;
    log.textContent += line + '\n';
    // Auto-scroll to bottom
    screen.scrollTo({ top: screen.scrollHeight, behavior: 'smooth' });
    
    // Slower delays to stretch boot to ~12-14 seconds total
    const delay = line.startsWith('  ') ? 420 :
                  line.startsWith(' ')  ? 300 :
                  line === ''           ? 200 : 160;
    await sleep(delay);
  }
  if (!bootAborted) await sleep(2400);
  gotoLogin();
}

function gotoLogin() {
  bootAborted = true;
  showScreen('screen-login');
  document.getElementById('inp-user').focus();
}

document.getElementById('btn-skip').addEventListener('click', gotoLogin);

// ─── LOGIN ────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', doLogin);
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const loginScreen = document.getElementById('screen-login');
    if (loginScreen.classList.contains('active')) doLogin();
  }
});

function doLogin() {
  const user = document.getElementById('inp-user').value.trim();
  const pass = document.getElementById('inp-pass').value;
  const err = document.getElementById('login-error');
  if (user === CREDENTIALS.username && pass === CREDENTIALS.password) {
    err.classList.add('hidden');
    showScreen('screen-dashboard');
  } else {
    err.classList.remove('hidden');
    document.getElementById('inp-pass').value = '';
    document.getElementById('inp-pass').focus();
  }
}

// ─── LOGOUT ──────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', () => {
  archiveData = null;
  activeConvId = null;
  document.getElementById('inp-user').value = '';
  document.getElementById('inp-pass').value = '';
  document.getElementById('archive-meta').classList.add('hidden');
  document.getElementById('conv-list').innerHTML = '<div class="empty-state">No archive loaded.<br>Load samsa_archive.json to begin.</div>';
  document.getElementById('chat-pane').innerHTML = `
    <div class="chat-empty">
      <img src="kali_dragon.png" alt="" class="empty-dragon">
      <p class="empty-label">Select a conversation</p>
    </div>`;
  showScreen('screen-login');
});

// ─── FILE LOAD ────────────────────────────────
document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    archiveData = JSON.parse(text);
    processArchive();
  } catch(err) {
    alert('Failed to parse archive JSON: ' + err.message);
  }
  e.target.value = '';
});

function processArchive() {
  if (!archiveData || !archiveData.conversations) return;
  const convs = archiveData.conversations;
  
  let totalMsgs = 0;
  let totalMedia = 0;
  convs.forEach(c => {
    totalMsgs += c.messages ? c.messages.length : 0;
    c.messages && c.messages.forEach(m => {
      totalMedia += m.mediaUrls ? m.mediaUrls.length : 0;
    });
  });
  
  document.getElementById('meta-convs').textContent = convs.length;
  document.getElementById('meta-msgs').textContent = totalMsgs.toLocaleString();
  document.getElementById('meta-media').textContent = totalMedia.toLocaleString();
  document.getElementById('archive-meta').classList.remove('hidden');

  // Detect self PK globally: find the participant that appears in the most conversations
  const pkPresence = {};
  convs.forEach(c => {
    const participants = c.participants || [];
    participants.forEach(p => {
      const pk = String(p.pk || p.id || '');
      if (pk) pkPresence[pk] = (pkPresence[pk] || 0) + 1;
    });
  });
  const sortedPks = Object.entries(pkPresence).sort((a,b) => b[1]-a[1]);
  if (sortedPks.length > 0) {
    selfPk = sortedPks[0][0];
  } else {
    // Fallback: most frequent sender across all messages
    const senderCounts = {};
    convs.forEach(c => {
      (c.messages || []).forEach(m => {
        const s = String(m.sender);
        if (s) senderCounts[s] = (senderCounts[s] || 0) + 1;
      });
    });
    const sortedSenders = Object.entries(senderCounts).sort((a,b) => b[1]-a[1]);
    if (sortedSenders.length > 0) selfPk = sortedSenders[0][0];
  }
  
  renderConvList(convs);
}

// ─── Detect username from archive ───────────────
// The participant PK that is NOT the logged-in user is the "other" person.
// We resolve their display name from the conversation name field or conversationId.
function resolveDisplayName(conv, senderPk) {
  const pkStr = String(senderPk);
  if (NAME_OVERRIDES[pkStr]) return NAME_OVERRIDES[pkStr];
  return pkStr;
}

// ─── CONVERSATION LIST ────────────────────────
function renderConvList(convs) {
  const container = document.getElementById('conv-list');
  container.innerHTML = '';
  
  if (convs.length === 0) {
    container.innerHTML = '<div class="empty-state">No conversations found.</div>';
    return;
  }
  
  convs.forEach(conv => {
    const msgCount = conv.messages ? conv.messages.length : 0;
    const mediaCount = conv.messages
      ? conv.messages.reduce((s, m) => s + (m.mediaUrls ? m.mediaUrls.length : 0), 0)
      : 0;
    const lastDate = conv.messages && conv.messages.length > 0
      ? formatDate(conv.messages[conv.messages.length - 1].timestamp * 1000)
      : '—';
    
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.conversationId === activeConvId ? ' active' : '');
    item.dataset.id = conv.conversationId;
    
    item.innerHTML = `
      <div class="conv-name">${escHtml(conv.name || conv.conversationId)}</div>
      <div class="conv-name-id">${escHtml(conv.conversationId)}</div>
      <div class="conv-stats">
        <span>${msgCount.toLocaleString()} msgs</span>
        ${mediaCount > 0 ? `<span class="conv-badge-media">⬡ ${mediaCount} media</span>` : ''}
        <span>${lastDate}</span>
      </div>`;
    
    item.addEventListener('click', () => {
      document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      loadConversation(conv);
    });
    
    container.appendChild(item);
  });
}

// Sidebar search
document.getElementById('search-convs').addEventListener('input', (e) => {
  if (!archiveData) return;
  const q = e.target.value.toLowerCase();
  const filtered = archiveData.conversations.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    c.conversationId.toLowerCase().includes(q)
  );
  renderConvList(filtered);
});

// ─── Collect all media URLs from a message (handles various Instagram archive formats) ───
function collectMediaUrls(msg) {
  const urls = [];
  // Standard field
  if (msg.mediaUrls && msg.mediaUrls.length) urls.push(...msg.mediaUrls);
  // Alternative fields used in different archive versions
  if (msg.media && msg.media.length) {
    msg.media.forEach(m => {
      if (typeof m === 'string') urls.push(m);
      else if (m.uri) urls.push(m.uri);
      else if (m.url) urls.push(m.url);
    });
  }
  if (msg.attachments && msg.attachments.length) {
    msg.attachments.forEach(a => {
      if (typeof a === 'string') urls.push(a);
      else if (a.uri) urls.push(a.uri);
      else if (a.url) urls.push(a.url);
    });
  }
  if (msg.reel_share && msg.reel_share.media && msg.reel_share.media.uri) {
    urls.push(msg.reel_share.media.uri);
  }
  if (msg.story_share && msg.story_share.media && msg.story_share.media.uri) {
    urls.push(msg.story_share.media.uri);
  }
  if (msg.xma_media_url) urls.push(msg.xma_media_url);
  // Deduplicate
  return [...new Set(urls.filter(Boolean))];
}

// ─── Build a map of participant PK → {name, pfp} from archive ─────────────
function buildParticipantMap(conv) {
  const map = {};
  // participants array in conversation object
  if (conv.participants && Array.isArray(conv.participants)) {
    conv.participants.forEach(p => {
      const pk = String(p.pk || p.id || '');
      if (pk) {
        const name = NAME_OVERRIDES[pk] || p.username || p.full_name || pk;
        map[pk] = { name: name, pfp: p.profile_pic_url || null };
      }
    });
  }
  // Also try archiveData.profiles
  if (archiveData && archiveData.profiles) {
    Object.entries(archiveData.profiles).forEach(([pk, profile]) => {
      if (!map[pk]) map[pk] = {};
      map[pk].name = NAME_OVERRIDES[pk] || profile.username || profile.full_name || map[pk].name || pk;
      if (!map[pk].pfp) map[pk].pfp = profile.profile_pic_url || null;
    });
  }
  return map;
}

// ─── CHAT LOAD ────────────────────────────────
function loadConversation(conv) {
  activeConvId = conv.conversationId;
  const msgs = conv.messages || [];
  const mediaCount = msgs.reduce((s, m) => s + collectMediaUrls(m).length, 0);
  
  // selfPk is now calculated globally in processArchive
  
  const pane = document.getElementById('chat-pane');
  pane.innerHTML = `
    <div class="chat-header">
      <div class="chat-header-info">
        <div class="chat-header-name">${escHtml(conv.name || conv.conversationId)}</div>
        <div class="chat-header-meta">${escHtml(conv.conversationId)}</div>
      </div>
      <div class="chat-header-stats">
        <span>${msgs.length.toLocaleString()}</span> messages<br>
        <span>${mediaCount.toLocaleString()}</span> media items
      </div>
    </div>
    <div class="chat-search-bar">
      <input type="text" id="msg-search" placeholder="Search messages..." autocomplete="off">
      <span class="chat-search-count" id="search-result-count"></span>
    </div>
    <div class="chat-messages" id="chat-messages-container"></div>
    <div class="lightbox hidden" id="lightbox">
      <span class="lightbox-close" id="lightbox-close">✕</span>
      <img id="lightbox-img" src="" alt="">
    </div>`;
  
  const participantMap = buildParticipantMap(conv);
  renderMessages(conv, msgs, '', participantMap);
  
  document.getElementById('msg-search').addEventListener('input', (e) => {
    renderMessages(conv, msgs, e.target.value.trim(), participantMap);
  });
  
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target !== document.getElementById('lightbox-img')) {
      document.getElementById('lightbox').classList.add('hidden');
    }
  });
  
  document.getElementById('lightbox-close').addEventListener('click', () => {
    document.getElementById('lightbox').classList.add('hidden');
  });
}

function renderMessages(conv, msgs, query, participantMap) {
  const container = document.getElementById('chat-messages-container');
  if (!container) return;
  container.innerHTML = '';
  participantMap = participantMap || {};
  
  const q = query.toLowerCase();
  let filtered = msgs;
  
  if (q) {
    filtered = msgs.filter(m => (m.text || '').toLowerCase().includes(q));
    document.getElementById('search-result-count').textContent = `${filtered.length} results`;
  } else {
    document.getElementById('search-result-count').textContent = '';
  }
  
  let lastDay = '';
  
  filtered.forEach(msg => {
    // Determine timestamp (handle milliseconds vs seconds)
    const rawTs = msg.timestamp;
    const tsMs = rawTs > 1e12 ? rawTs : rawTs * 1000;
    const d = new Date(tsMs);
    const day = d.toDateString();
    
    if (day !== lastDay) {
      lastDay = day;
      const sep = document.createElement('div');
      sep.className = 'date-sep';
      sep.innerHTML = `<span class="date-sep-label">${d.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</span>`;
      container.appendChild(sep);
    }
    
    const isSelf = String(msg.sender) === String(selfPk);
    const senderPkStr = String(msg.sender);
    const participant = participantMap[senderPkStr] || {};
    const displayName = participant.name || resolveDisplayName(conv, msg.sender);
    const pfpUrl = participant.pfp || null;
    
    const row = document.createElement('div');
    row.className = `msg-row ${isSelf ? 'self' : 'other'}`;
    
    // Avatar for "other" sender
    if (!isSelf) {
      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar';
      if (pfpUrl) {
        const avatarImg = document.createElement('img');
        avatarImg.src = pfpUrl.startsWith('http') || pfpUrl.startsWith('data:') ? pfpUrl : '../archieves/' + pfpUrl;
        avatarImg.alt = displayName;
        avatarImg.onerror = () => {
          avatarImg.style.display = 'none';
          avatar.textContent = (displayName[0] || '?').toUpperCase();
        };
        avatar.appendChild(avatarImg);
      } else {
        avatar.textContent = (displayName[0] || '?').toUpperCase();
      }
      row.appendChild(avatar);
    }
    
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    if (msg.deleted) {
      bubble.classList.add('msg-deleted');
      bubble.innerHTML += `<div class="msg-deleted-badge">🚫 This message was unsent/deleted.</div>`;
    }
    
    const isAction = msg.item_type === 'action' || /^(Reacted .* to your message|Liked a message|Replied to your message)/i.test(msg.text || '');
    
    if (isAction) {
      row.className = 'msg-row action-row';
      bubble.className = 'msg-action';
      if (msg.text) {
        bubble.innerHTML += `<div class="msg-action-text">${escHtml(msg.text)}</div>`;
      }
    } else {
      if (!isSelf) {
        bubble.innerHTML += `<div class="msg-sender">${escHtml(displayName)}</div>`;
      }
      
      if (msg.text) {
        const highlighted = q ? highlightText(escHtml(msg.text), escHtml(q)) : escHtml(msg.text);
        bubble.innerHTML += `<div class="msg-text">${highlighted}</div>`;
      }
    }
    
    // Collect all media from various possible fields
    const allMedia = collectMediaUrls(msg);
    
    if (allMedia.length > 0) {
      const mediaDiv = document.createElement('div');
      mediaDiv.className = 'msg-media';
      allMedia.forEach(url => {
        if (!url) return;
        const isLocal = !url.startsWith('http');
        const isVideo = /\.(mp4|mov|avi|webm|m4v)$/i.test(url);
        const isAudio = /\.(mp3|m4a|aac|ogg|wav)$/i.test(url);
        
        if (isVideo) {
          const vid = document.createElement('video');
          vid.className = 'msg-media-video';
          vid.controls = true;
          vid.preload = 'metadata';
          vid.src = isLocal ? '../archieves/' + url : url;
          vid.onerror = () => {
            vid.replaceWith(Object.assign(document.createElement('span'), {
              textContent: '🎬 Video (unavailable)', className: 'msg-media-tag'
            }));
          };
          mediaDiv.appendChild(vid);
        } else if (isAudio) {
          const aud = document.createElement('audio');
          aud.className = 'msg-media-audio';
          aud.controls = true;
          aud.preload = 'metadata';
          aud.src = isLocal ? '../archieves/' + url : url;
          aud.onerror = () => {
            aud.replaceWith(Object.assign(document.createElement('span'), {
              textContent: '🎵 Audio (unavailable)', className: 'msg-media-tag'
            }));
          };
          mediaDiv.appendChild(aud);
        } else {
          // Image (default)
          const img = document.createElement('img');
          img.className = 'msg-media-img';
          img.alt = 'media';
          img.src = isLocal ? '../archieves/' + url : url;
          img.onerror = () => {
            if (!isLocal) {
              img.replaceWith(Object.assign(document.createElement('a'), {
                href: url, target: '_blank', rel: 'noopener',
                textContent: '🖼 Image (expired link)', className: 'msg-media-link'
              }));
            } else {
              img.style.display = 'none';
            }
          };
          img.addEventListener('click', () => openLightbox(img.src));
          mediaDiv.appendChild(img);
        }
      });
      bubble.appendChild(mediaDiv);
    }
    
    // Only show [Empty message] if truly no content at all
    if (!msg.text && allMedia.length === 0) {
      if (msg.item_type === 'raven_media') {
        bubble.innerHTML += `<div class="msg-text" style="color:var(--accent);font-style:italic">🔥 View-once (Expired)</div>`;
      } else {
        bubble.innerHTML += `<div class="msg-text" style="color:var(--text-dim);font-style:italic">[Empty message]</div>`;
      }
    }
    
    bubble.innerHTML += `<div class="msg-time">${d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })}</div>`;
    row.appendChild(bubble);
    container.appendChild(row);
  });
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function openLightbox(src) {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  document.getElementById('lightbox-img').src = src;
  lb.classList.remove('hidden');
}

// ─── Helpers ─────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlightText(text, query) {
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

function formatDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── START ────────────────────────────────────
runBoot();
