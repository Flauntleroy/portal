// Dashboard page renderer script

// Global variables
// Dashboard functionality
console.log('Dashboard.js script loaded');

let currentUser = null;
let currentSimrsLogId = null;

// Chat presence globals
let CHAT_BASE_URL = 'http://localhost:3002';
let SOCKET_IO_PATH = '/socket.io';
let chatSocket = null;
let chatPingInterval = null;
let presenceListReceived = false;

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async function() {
  console.log('DOM Content Loaded - Dashboard');
  console.log('Checking if elements exist...');
  try {
    if (window.api?.getChatBaseUrl) {
      const url = await window.api.getChatBaseUrl();
      if (url) { CHAT_BASE_URL = url; console.log('[chat] base url set to', CHAT_BASE_URL); }
    }
    try {
      const u = new URL(CHAT_BASE_URL);
      const basePath = (u.pathname || '').replace(/\/+$/, '');
      SOCKET_IO_PATH = basePath ? `${basePath}/socket.io` : '/socket.io';
      console.log('[chat] socket.io path set to', SOCKET_IO_PATH);
    } catch {}
  } catch(e) { console.warn('failed getChatBaseUrl', e); }
  
  // Check if critical elements exist
  const runSimrsBtn = document.getElementById('run-simrs-btn');
  const navProfile = document.getElementById('nav-profile');
  const logoutBtn = document.getElementById('logout-btn');
  const logoutNavBtn = document.getElementById('logout-nav-btn');
  
  console.log('Element check results:');
  console.log('- run-simrs-btn:', runSimrsBtn ? 'FOUND' : 'NOT FOUND');
  console.log('- nav-profile:', navProfile ? 'FOUND' : 'NOT FOUND');
  console.log('- logout-btn:', logoutBtn ? 'FOUND' : 'NOT FOUND');
  console.log('- logout-nav-btn:', logoutNavBtn ? 'FOUND' : 'NOT FOUND');
  
  // Initialize Bootstrap components
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  const tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
  
  // Load user data first
  try {
    loadUserData();
    console.log('User data loaded, setting up navigation and event listeners');
    setupNavigation();
    setupEventListeners();
    
    // Load additional data
    loadUnitKerjaData();
    loadShiftStatus();
    loadSimrsHistory();

    // Setup Chat UI & presence
    setupChatToggle();
  } catch (error) {
    console.error('Error loading user data:', error);
  }
});

// Load user data from localStorage
function loadUserData() {
  const userData = localStorage.getItem('currentUser');

  if (!userData) {
    // Redirect to login if no user data
    window.location.href = 'login.html';
    return;
  }

  try {
    currentUser = JSON.parse(userData);

    // Update UI with user data
    document.getElementById('username-display').textContent = currentUser.username;
    document.getElementById('fullname-display').textContent = currentUser.full_name;

    // Update unit kerja info
    const unitKerjaInfo = document.getElementById('unit-kerja-info');
    if (currentUser.UnitKerja) {
      unitKerjaInfo.innerHTML = `
        <p class="text-info"><i class="fas fa-info-circle"></i> Anda akan menjalankan SIMRS sebagai petugas unit <strong>${currentUser.UnitKerja.nama}</strong></p>
      `;
    } else {
      unitKerjaInfo.innerHTML = `
        <p class="text-warning"><i class="fas fa-exclamation-circle"></i> Anda belum memiliki unit kerja. Silakan update profil Anda.</p>
      `;
    }

    // Set profile photo in navbar and other places
    if (currentUser.photo) {
      // Determine photo URL based on whether it's a full URL or just a filename
      let photoUrl;
      if (currentUser.photo.startsWith('http')) {
        // Already a full URL
        photoUrl = currentUser.photo;
      } else if (currentUser.photo.startsWith('../')) {
        // Local relative path
        photoUrl = currentUser.photo;
      } else {
        // Just a filename - construct the portal URL
        photoUrl = `https://portal.rsudhabdulazizmarabahan.com/uploads/photos/${currentUser.photo}`;
      }

      // Set profile photo in navbar
      const navPhotoElement = document.getElementById('nav-profile-photo');
      const navPlaceholderElement = document.getElementById('nav-profile-placeholder');

      navPhotoElement.src = photoUrl;
    navPhotoElement.onload = function() {
      navPhotoElement.classList.remove('d-none');
      navPlaceholderElement.classList.add('d-none');
    };
    navPhotoElement.onerror = function() {
      // If portal URL fails, try local backup
      if (photoUrl.includes('portal.rsudhabdulazizmarabahan.com')) {
        navPhotoElement.src = `../assets/uploads/${currentUser.photo}`;
      } else {
        navPhotoElement.classList.add('d-none');
        navPlaceholderElement.classList.remove('d-none');
      }
    };

    // Set profile photo in dashboard header
    const dashboardPhotoElement = document.getElementById('dashboard-photo');
    const dashboardPlaceholderElement = document.getElementById('dashboard-photo-placeholder');

    dashboardPhotoElement.src = photoUrl;
    dashboardPhotoElement.onload = function() {
      dashboardPhotoElement.classList.remove('d-none');
      dashboardPlaceholderElement.classList.add('d-none');
    };
    dashboardPhotoElement.onerror = function() {
      // If portal URL fails, try local backup
      if (photoUrl.includes('portal.rsudhabdulazizmarabahan.com')) {
        dashboardPhotoElement.src = `../assets/uploads/${currentUser.photo}`;
      } else {
        dashboardPhotoElement.classList.add('d-none');
        dashboardPlaceholderElement.classList.remove('d-none');
      }
    };

    // Store the photo URL for later use
    currentUser.photoUrl = photoUrl;
  }

  // Show/hide admin menu based on unit_id
  const adminNavLink = document.getElementById('nav-admin');
  if (adminNavLink) {
    if (currentUser.unit_kerja_id === 5) {
      adminNavLink.style.display = 'block';
    } else {
      adminNavLink.style.display = 'none';
    }
  }

  // Fill profile form
  fillProfileForm();

  // Check for active SIMRS session
  checkActiveSimrsSession();
} catch (error) {
  console.error('Error parsing user data:', error);
  localStorage.removeItem('currentUser');
  window.location.href = 'login.html';
}

}

// Check for active SIMRS session
async function checkActiveSimrsSession() {
  if (!currentUser) return;

  try {
    const history = await window.api.getSimrsHistory(currentUser.id);

    // Check if there's an active session
    const activeSession = history.find(item => item.status === 'active');

    if (activeSession) {
      // Set current log ID
      currentSimrsLogId = activeSession.id;

      // Show status
      document.getElementById('simrs-status').classList.remove('d-none');
      document.getElementById('status-message').textContent = 'SIMRS sedang berjalan...';

      // Set up auto-refresh for SIMRS history
      const hc = document.getElementById('simrs-history-container');
      if (hc) {
        const historyRefreshInterval = setInterval(() => {
          loadSimrsHistory();
        }, 10000); // Refresh every 10 seconds

        // Store the interval ID
        window.simrsHistoryRefreshInterval = historyRefreshInterval;
      }
    }
  } catch (error) {
    console.error('Error checking active SIMRS session:', error);
  }
}

// Set up navigation
function setupNavigation() {
  console.log('Setting up navigation...');

  // Dashboard navigation
  const navDashboard = document.getElementById('nav-dashboard');
  if (navDashboard) {
    console.log('Dashboard nav found, adding event listener');
    navDashboard.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Dashboard nav clicked!');
      showSection('dashboard');
    });
  } else {
    console.error('Dashboard nav not found!');
  }

  // Profile navigation (main button)
  const navProfile = document.getElementById('nav-profile');
  if (navProfile) {
    console.log('Profile nav button found, adding event listener');
    navProfile.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Profile nav clicked!');
      showSection('profile');
    });
  } else {
    console.error('Profile nav button not found!');
  }
  
  // Profile navigation (dropdown)
  const navProfileDropdown = document.getElementById('nav-profile-dropdown');
  if (navProfileDropdown) {
    console.log('Profile dropdown found, adding event listener');
    navProfileDropdown.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Profile dropdown clicked!');
      showSection('profile');
    });
  } else {
    console.error('Profile dropdown not found!');
  }

  // Logout button (main)
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    console.log('Logout button found, adding event listener');
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Logout button clicked!');
      logout();
    });
  } else {
    console.error('Logout button not found!');
  }

  // Logout button (nav)
  const logoutNavBtn = document.getElementById('logout-nav-btn');
  if (logoutNavBtn) {
    console.log('Logout nav button found, adding event listener');
    logoutNavBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Logout nav button clicked!');
      logout();
    });
  } else {
    console.error('Logout nav button not found!');
  }
  
  console.log('Navigation setup completed');
}

// Chat UI: toggle and presence
function setupChatToggle() {
  try {
    const offcanvasEl = document.getElementById('chatOffcanvas');
    const toggles = [
      document.getElementById('toggle-chat-btn'),
      document.getElementById('toggle-chat-fab'),
    ].filter(Boolean);

    if (!offcanvasEl || toggles.length === 0) return;

    const offcanvas = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);

    toggles.forEach((btn) => {
      if (btn.dataset.chatToggleInit === '1') return;
      btn.dataset.chatToggleInit = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        offcanvas.show();
        const userId = window?.CURRENT_USER?.id || window?.USER_ID;
        if (userId) initChatPresence(userId);
      });
    });
  } catch (err) {
    console.error('setupChatToggle error:', err);
  }
}


async function ensureSocketIoClient() {
  if (window.io) return true;
  const candidateUrls = [
    `${CHAT_BASE_URL}/socket.io/socket.io.js`,
    'https://cdn.socket.io/4.7.2/socket.io.min.js'
  ];
  for (const url of candidateUrls) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      if (window.io) return true;
    } catch (e) {
      console.warn('[chat] gagal load socket.io', url, e);
    }
  }
  return !!window.io;
}

function logPresence(step, extra) {
  try { console.log(`[presence][client] ${step}`, extra || ''); } catch (e) {}
}

// Chat popup caches
const chatPopupsByRoomId = {};
const chatPopupsByUserId = {};
const userCacheById = {};

// Bind IPC dari main untuk membuka modal saat klik "Balas" di overlay
try {
  if (window.api && !window._chatIpcBinded) {
    window.api.onChatOpenModal(async (payload) => {
      try {
        // Coba resolve user dari cache/presence; fallback ke objek minimal
        let peer = await resolveUserById(payload.sender_id);
        if (!peer) {
          peer = { id: payload.sender_id, full_name: payload.sender_name || 'Pengguna' };
        }
        // Pastikan modal tercipta
        let handle = chatPopupsByUserId[peer.id];
        if (!handle) {
          handle = createChatModal(peer);
          chatPopupsByUserId[peer.id] = handle;
        }
        handle.modal.show();
        // Jika room_id dari overlay tersedia, langsung pakai itu
        if (payload.room_id) {
          handle.roomId = payload.room_id;
          chatPopupsByRoomId[payload.room_id] = handle;
          if (window._chatSocket) window._chatSocket.emit('room:join', { room_id: payload.room_id });
          await loadMessagesIntoHandle(handle, payload.room_id);
        } else {
          // Fallback: resolve / buat direct-room
          const meId = getCurrentUserId();
          const r = await fetch(`${CHAT_BASE_URL}/api/direct-room?user_id=${meId}&peer_id=${peer.id}`);
          const room = await r.json();
          handle.roomId = room.id;
          chatPopupsByRoomId[room.id] = handle;
          if (window._chatSocket) window._chatSocket.emit('room:join', { room_id: room.id });
          await loadMessagesIntoHandle(handle, room.id);
        }
      } catch (e) { console.warn('open-modal IPC error', e); }
    });
    window._chatIpcBinded = true;
  }
} catch (e) {}

function getCurrentUserId() {
  try { return window?.CURRENT_USER?.id || window?.USER_ID || JSON.parse(localStorage.getItem('currentUser')||'{}').id; } catch { return null; }
}

function resolveUserById(userId) {
  if (userCacheById[userId]) return Promise.resolve(userCacheById[userId]);
  // Try fetch online-users first
  return fetch(`${CHAT_BASE_URL}/api/online-users`)
    .then(r => r.json())
    .then(list => {
      const found = Array.isArray(list) ? list.find(u => String(u.id) === String(userId)) : null;
      if (found) { userCacheById[userId] = found; return found; }
      // Fallback to contacts
      const me = getCurrentUserId();
      if (!me) return null;
      return fetch(`${CHAT_BASE_URL}/api/contacts?user_id=${me}`)
        .then(r => r.json())
        .then(cs => {
          const f = Array.isArray(cs) ? cs.find(u => String(u.id) === String(userId)) : null;
          if (f) userCacheById[userId] = f;
          return f;
        });
    })
    .catch(() => null);
}

function createChatModal(peer) {
  const mid = `chatModal-${peer.id}`;
  let el = document.getElementById(mid);
  if (!el) {
    el = document.createElement('div');
    el.id = mid;
    el.className = 'modal fade chat-modal';
    el.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-end chat-modal-anim" style="max-width: 560px;">
        <div class="modal-content" style="border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.15);">
          <div class="modal-header py-2" style="background:#1a8e83;color:#fff;">
            <div class="d-flex align-items-center">
              <i class="fas fa-user me-2"></i>
              <div class="sender-info-modal">
                ${peer.unit_kerja && peer.unit_kerja !== '-' ? `<div class="unit-badge-modal" title="Unit: ${peer.unit_kerja}">${peer.unit_kerja}</div>` : ''}
                <h6 class="modal-title mb-0" title="${peer.full_name || peer.username || 'Pengguna'}">${peer.full_name || peer.username || 'Pengguna'}</h6>
              </div>
            </div>
            <div class="d-flex align-items-center gap-2">
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
          </div>
          <div class="modal-body" style="max-height: 480px; overflow-y: auto; background:#f8fafc;">
            <div class="chat-mini-messages"></div>
          </div>
          <div class="modal-footer py-2">
            <div class="input-group">
              <input type="text" class="form-control chat-mini-input" placeholder="Tulis pesan…" aria-label="Tulis pesan" />
              <button class="btn btn-primary chat-mini-send" type="button" aria-label="Kirim"><i class="fas fa-paper-plane"></i></button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    // Animasi show/hide yang smooth
    el.addEventListener('shown.bs.modal', () => { try { el.querySelector('.chat-modal-anim')?.classList.add('showing'); } catch(e){} });
    el.addEventListener('hide.bs.modal', () => { try { el.querySelector('.chat-modal-anim')?.classList.remove('showing'); } catch(e){} });
    // Minimize/restore
    const btnMin = el.querySelector('.btn-minimize');
    if (btnMin) btnMin.addEventListener('click', () => { el.classList.toggle('minimized'); });
  }
  const modal = bootstrap.Modal.getOrCreateInstance(el, { backdrop: true });
  const handle = {
    el,
    modal,
    peer,
    roomId: null,
    listEl: el.querySelector('.chat-mini-messages'),
    inputEl: el.querySelector('.chat-mini-input'),
    sendBtn: el.querySelector('.chat-mini-send')
  };
  handle.sendBtn.addEventListener('click', () => sendMessageFromHandle(handle));
  handle.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessageFromHandle(handle); });
  return handle;
}

function renderMessageBubble(m, meId) {
  const mine = String(m.sender_id) === String(meId);
  const div = document.createElement('div');
  div.className = `message ${mine ? 'me' : 'other'}`;
  // konten bubble + status
  const msg = document.createElement('div');
  msg.textContent = m.message;
  div.appendChild(msg);

  // status tanda dibaca (hanya untuk pesan saya)
  if (mine) {
    const meta = document.createElement('div');
    meta.style.fontSize = '11px';
    meta.style.textAlign = 'right';
    const statusSpan = document.createElement('span');
    statusSpan.className = 'msg-status';
    const hasRead = !!(m.reads && m.reads.length) || !!m.read_count || !!m.read_at;
    // Ubah indikator: tampilkan teks 'Dibaca' atau 'Belum dibaca'
    statusSpan.textContent = hasRead ? 'Dibaca' : 'Belum dibaca';
    meta.appendChild(statusSpan);
    div.appendChild(meta);
  }
  return div;
}

async function loadMessagesIntoHandle(handle, rid) {
  try {
    const r = await fetch(`${CHAT_BASE_URL}/api/messages?room_id=${rid}`);
    const data = await r.json();
    handle.listEl.innerHTML = '';
    const meId = getCurrentUserId();
    data.forEach(m => { handle.listEl.appendChild(renderMessageBubble(m, meId)); });
    handle.listEl.scrollTop = handle.listEl.scrollHeight;
  } catch (e) { console.warn('loadMessagesIntoHandle error', e); }
}

function appendMessageToHandle(handle, m) {
  const meId = getCurrentUserId();
  handle.listEl.appendChild(renderMessageBubble(m, meId));
  handle.listEl.scrollTop = handle.listEl.scrollHeight;
}

async function sendMessageFromHandle(handle) {
  const t = (handle.inputEl.value || '').trim();
  if (!t) return;
  const meId = getCurrentUserId();
  const payload = { sender_id: meId, message: t, message_type: 'text' };
  if (handle.roomId) {
    payload.room_id = handle.roomId;
  } else {
    payload.recipient_id = handle.peer.id;
  }
  try {
    const r = await fetch(`${CHAT_BASE_URL}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await r.json();
    if (data?.data?.room_id && !handle.roomId) {
      handle.roomId = data.data.room_id;
      chatPopupsByRoomId[handle.roomId] = handle;
      if (window._chatSocket) window._chatSocket.emit('room:join', { room_id: handle.roomId });
    }
    handle.inputEl.value = '';
  } catch (e) { console.warn('sendMessage error', e); }
}

function openChatPopup(peer) {
  const meId = getCurrentUserId();
  if (!meId || !peer?.id) return;
  let handle = chatPopupsByUserId[peer.id];
  if (!handle) {
    handle = createChatModal(peer);
    chatPopupsByUserId[peer.id] = handle;
  }
  // reset unread badge untuk peer ini
  try {
    window.unreadCountsByUserId = window.unreadCountsByUserId || {};
    window.unreadCountsByUserId[peer.id] = 0;
    updateUnreadBadgeForUser(peer.id);
  } catch (e) {}

  handle.modal.show();
  fetch(`${CHAT_BASE_URL}/api/direct-room?user_id=${meId}&peer_id=${peer.id}`)
    .then(r => r.json())
    .then(room => {
      handle.roomId = room.id;
      chatPopupsByRoomId[room.id] = handle;
      if (window._chatSocket) window._chatSocket.emit('room:join', { room_id: room.id });
      return loadMessagesIntoHandle(handle, room.id);
    })
    .catch(e => console.warn('direct-room error', e));
}

function startChatWithUser(user) { openChatPopup(user); }

async function initChatPresence(userId) {
  logPresence('initChatPresence start', { userId });
  if (!window.io) {
    console.warn('socket.io client belum tersedia');
    return;
  }
  if (chatSocket && chatSocket.connected) {
    logPresence('socket already connected, skip init');
    return;
  }
  const socket = window.io(CHAT_BASE_URL, { transports: ['websocket'], reconnection: true, path: SOCKET_IO_PATH });
  window._chatSocket = socket;
  chatSocket = socket;

  const statusEl = document.getElementById('chat-conn-status');

  socket.on('connect', () => {
    logPresence('socket connected', { id: socket.id });
    if (statusEl) statusEl.textContent = 'Terhubung';
    socket.emit('auth', { user_id: userId });
    socket.emit('presence:ping', (ts) => {
      logPresence('presence:ping ack', { ts });
      if (typeof ts === 'number' && statusEl) {
        const latency = Math.max(0, Date.now() - ts);
        statusEl.textContent = 'Terhubung · ' + latency + 'ms';
      }
    });
  });

  // NEW: handle incoming messages to show popup automatically
  if (!socket._chatMessageHandlerInstalled) {
    socket.on('chat:new_message', async (m) => {
      try {
        let handle = chatPopupsByRoomId[m.room_id];
        const meId = getCurrentUserId();
        // Hitung unread per pengirim
        try {
          window.unreadCountsByUserId = window.unreadCountsByUserId || {};
          if (String(m.sender_id) !== String(meId)) {
            window.unreadCountsByUserId[m.sender_id] = (window.unreadCountsByUserId[m.sender_id] || 0) + 1;
            updateUnreadBadgeForUser(m.sender_id);
          }
        } catch (e) {}
        // Selalu munculkan overlay notifikasi
        try {
          const peer = await resolveUserById(m.sender_id);
          if (String(m.sender_id) !== String(meId) && peer && window.api && typeof window.api.notifyChat === 'function') {
            const unreadCount = window.unreadCountsByUserId?.[m.sender_id] || 1;
            window.api.notifyChat({
              me_id: meId,
              sender_id: m.sender_id,
              sender_name: peer.full_name || peer.username || 'Pengguna',
              unit_kerja: peer.unit_kerja || null,
              room_id: m.room_id,
              message: m.message,
              unread_count: unreadCount
            });
          }
        } catch (e) {}
        // Tetap append ke modal aktif jika ada
        if (handle) {
          appendMessageToHandle(handle, m);
        }
      } catch (e) { console.warn('chat:new_message handler error', e); }
    });
    socket._chatMessageHandlerInstalled = true;
  }

// Update badge unread pada daftar online users
function updateUnreadBadgeForUser(userId) {
  try {
    const container = document.getElementById('online-users-list');
    if (!container) return;
    const btn = container.querySelector(`.chat-start-btn[data-user-id="${userId}"]`);
    if (!btn) return;
    const parent = btn.closest('.list-group-item');
    if (!parent) return;
    let badge = parent.querySelector(`#unread-badge-${userId}`);
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'badge rounded-pill bg-danger ms-2';
      badge.id = `unread-badge-${userId}`;
      badge.textContent = '0';
      const rightBox = parent.querySelector('.d-flex.align-items-center.gap-2:last-child');
      (rightBox || parent).appendChild(badge);
    }
    const count = window.unreadCountsByUserId?.[userId] || 0;
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  } catch (e) { console.warn('updateUnreadBadgeForUser error', e); }
}

  socket.on('presence:list', (list) => {
    presenceListReceived = true;
    logPresence('presence:list', { count: (list||[]).length });
    refreshOnlineUsersFromPresenceList(list, userId);
  });

  socket.on('disconnect', (reason) => {
    logPresence('socket disconnected', { reason });
    if (statusEl) statusEl.textContent = 'Terputus';
  });

  // Ping berkala untuk menjaga last_active dan latency
  const ping = () => {
    try {
      socket.emit('presence:ping', (serverTs) => {
        if (typeof serverTs === 'number' && statusEl) {
          const latency = Math.max(0, Date.now() - serverTs);
          statusEl.textContent = 'Terhubung · ' + latency + 'ms';
        }
      });
    } catch (e) {}
  };
  try { ping(); } catch (e) {}
  window._chatPingInterval = setInterval(ping, 5000);

  // Tambahkan refresh periodik dari API untuk memastikan konsistensi daftar online
  try {
    if (!window._onlineUsersRefreshInterval) {
      window._onlineUsersRefreshInterval = setInterval(() => {
        try { refreshOnlineUsersFromAPI(userId); } catch (e) {}
      }, 10000);
    }
  } catch (e) {}
}

async function refreshOnlineUsersFromAPI(currentUserId) {
  try {
    const res = await fetch(`${CHAT_BASE_URL}/api/online-users?exclude_id=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    logPresence('refreshOnlineUsersFromAPI', { count: (data||[]).length });
    renderOnlineUsers(data);
  } catch (e) {
    console.warn('gagal fetch online-users, fallback ke contacts', e);
    try {
      const r = await fetch(`${CHAT_BASE_URL}/api/contacts?user_id=${encodeURIComponent(currentUserId)}`);
      const contacts = await r.json();
      const onlineOnly = (contacts || []).filter(c => c.online && c.id !== currentUserId);
      renderOnlineUsers(onlineOnly);
    } catch (err) {
      console.warn('gagal fetch contacts fallback', err);
      renderOnlineUsers([]);
    }
  }
}

async function refreshOnlineUsersFromPresenceList(list, currentUserId) {
  try {
    const set = new Set((list || []).map(x => x.user_id));
    set.delete(currentUserId);

    // Ambil data authoritative dari API online-users
    const res = await fetch(`${CHAT_BASE_URL}/api/online-users?exclude_id=${encodeURIComponent(currentUserId)}`);
    const apiList = await res.json();

    // Gunakan daftar API sebagai sumber kebenaran; jangan filter ketat dengan presence set
    const items = Array.isArray(apiList) ? apiList : [];

    logPresence('refreshFromPresenceList+api_union', { presence_count: set.size, api_count: (apiList||[]).length, final: (items||[]).length });
    renderOnlineUsers(items);
  } catch (e) {
    console.warn('refreshFromPresenceList error', e);
  }
}

function renderOnlineUsers(list) {
  const container = document.getElementById('online-users-list');
  if (!container) return;
  container.innerHTML = '';

  // cache list
  window._onlineUsersList = Array.isArray(list) ? list : [];
  window._onlineUsersById = {}; (window._onlineUsersList || []).forEach(u => { window._onlineUsersById[u.id] = u; userCacheById[u.id] = u; });

  if (!Array.isArray(list) || list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-muted';
    empty.textContent = 'Belum ada user online.';
    container.appendChild(empty);
  } else {
    list.forEach((u) => {
      const item = document.createElement('div');
      item.className = 'list-group-item d-flex align-items-center justify-content-between';
      item.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-success rounded-pill">•</span>
          <strong>${u.full_name || u.username || u.name}</strong>
        </div>
        <div class="d-flex align-items-center gap-2">
          <small class="text-muted">${u.unit_kerja || '-'}</small>
          <span class="badge rounded-pill bg-danger ms-2" id="unread-badge-${u.id}" style="display:none">0</span>
          <button class="btn btn-sm btn-outline-primary chat-start-btn" title="Chat" data-user-id="${u.id}"><i class="fas fa-paper-plane"></i></button>
        </div>
      `;
      container.appendChild(item);
      const btn = item.querySelector('.chat-start-btn');
      if (btn) btn.addEventListener('click', () => startChatWithUser(u));
      // sync badge jika ada data awal (guard terhadap fungsi tidak tersedia)
      try { if (typeof updateUnreadBadgeForUser === 'function') updateUnreadBadgeForUser(u.id); } catch (e) {}
    });
  }

  const countEl = document.getElementById('chat-online-count');
  if (countEl) countEl.textContent = String(list?.length || 0);
  const fabBadge = document.getElementById('chat-fab-badge');
  if (fabBadge) fabBadge.textContent = String(list?.length || 0);
}

async function setupChatPresence(user) {
  const userId = user?.id;
  logPresence('setupChatPresence', { userId });
  await ensureSocketIoClient();
  if (userId) {
    await initChatPresence(userId);
    setTimeout(() => {
      if (!presenceListReceived) {
        refreshOnlineUsersFromAPI(userId);
      }
    }, 1500);
  }
}

// Inisialisasi otomatis saat halaman Dashboard dimuat
try {
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
      // Pastikan tombol Chat bisa toggle offcanvas
      setupChatToggle();
      if (user && user.id) await setupChatPresence(user);
    } catch (e) { console.warn('[presence] init on load error', e); }
  });
} catch (e) {}

// Show specific section and hide others
function showSection(sectionName) {
  console.log('Showing section:', sectionName);
  
  // Hide all sections by adding d-none
  const sections = document.querySelectorAll('.content-section');
  console.log('Found sections:', sections.length);
  sections.forEach(section => {
    section.classList.add('d-none');
    section.style.display = ''; // reset inline display to avoid conflicts
  });

  const targetSection = document.getElementById(`${sectionName}-content`);
  if (targetSection) {
    console.log('Target section found:', `${sectionName}-content`);
    targetSection.classList.remove('d-none');
    targetSection.style.display = ''; // rely on CSS/Bootstrap
  } else {
    console.error('Target section not found:', `${sectionName}-content`);
  }

  // Update active navigation
  const navItems = document.querySelectorAll('.nav-link');
  navItems.forEach(item => {
    item.classList.remove('active');
  });

  const targetNav = document.getElementById(`nav-${sectionName}`);
  if (targetNav) {
    console.log('Target nav found:', `nav-${sectionName}`);
    targetNav.classList.add('active');
  } else {
    console.error('Target nav not found:', `nav-${sectionName}`);
  }
}

// Set up event listeners
function setupEventListeners() {
  console.log('Setting up event listeners...');

  // Run SIMRS button
  const runSimrsBtn = document.getElementById('run-simrs-btn');
  if (runSimrsBtn) {
    console.log('Run SIMRS button found, adding event listener');
    runSimrsBtn.addEventListener('click', function(e) {
      console.log('Run SIMRS button clicked!');
      runSimrs(e);
    });
    
    console.log('Button properties:');
    console.log('- disabled:', runSimrsBtn.disabled);
    console.log('- display:', runSimrsBtn.style.display);
    console.log('- pointerEvents:', runSimrsBtn.style.pointerEvents);
  } else {
    console.error('Run SIMRS button not found!');
  }

  // Close SIMRS session button
  const closeSimrsBtn = document.getElementById('close-simrs-btn');
  if (closeSimrsBtn) {
    closeSimrsBtn.addEventListener('click', closeSimrsSession);
  }

  // Profile form
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', updateProfile);
  }

  // Browse SIMRS path button (fix naming conflict)
  const browseSimrsPathBtn = document.getElementById('browse-simrs-path');
  if (browseSimrsPathBtn) {
    browseSimrsPathBtn.addEventListener('click', browseSimrsPath);
  }

  // Setup shift event listeners
  setupShiftEventListeners();

  // Photo upload
  const photoUpload = document.getElementById('photo-upload');
  if (photoUpload) {
    photoUpload.addEventListener('change', handlePhotoUpload);
  }

  // Refresh history button
  const refreshHistory = document.getElementById('refresh-history');
  if (refreshHistory) {
    refreshHistory.addEventListener('click', () => {
      loadSimrsHistory();
    });
  }

  console.log('Event listeners setup completed');
}

// Run SIMRS application
async function runSimrs(e) {
  console.log('runSimrs function called!');
  e.preventDefault();

  if (!currentUser) {
    console.log('No current user found');
    showSimrsAlert('danger', 'Anda harus login terlebih dahulu.');
    return;
  }

  try {
    console.log('Attempting to run SIMRS for user:', currentUser.id);
    showSimrsAlert('info', 'Menjalankan SIMRS...');

    const result = await window.api.runSimrs(currentUser.id);
    console.log('SIMRS result:', result);

    if (result.success) {
      currentSimrsLogId = result.log_id;
      showSimrsAlert('success', result.message);

      // Show status
      document.getElementById('simrs-status').classList.remove('d-none');
      document.getElementById('status-message').textContent = 'SIMRS sedang berjalan...';

      // Reload SIMRS history (only if container exists)
      setTimeout(() => {
        const hc = document.getElementById('simrs-history-container');
        if (hc) {
          loadSimrsHistory();
        }
      }, 1000);

      // Set up auto-refresh for SIMRS history to keep status updated (only if container exists)
      const hc2 = document.getElementById('simrs-history-container');
      if (hc2) {
        const historyRefreshInterval = setInterval(() => {
          loadSimrsHistory();
        }, 10000); // Refresh every 10 seconds

        // Store the interval ID to clear it later if needed
        window.simrsHistoryRefreshInterval = historyRefreshInterval;
      }
    } else {
      showSimrsAlert('danger', result.message);
    }
  } catch (error) {
    console.error('Error running SIMRS:', error);
    showSimrsAlert('danger', 'Terjadi kesalahan saat menjalankan SIMRS.');
  }
}

// Show SIMRS alert
function showSimrsAlert(type, message) {
  const alertContainer = document.getElementById('simrs-alert-container');
  alertContainer.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
}

// Show profile alert
function showProfileAlert(type, message) {
  const alertContainer = document.getElementById('profile-alert-container');
  alertContainer.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
}

// Fill profile form with user data
function fillProfileForm() {
  if (!currentUser) return;

  // Set form values
  document.getElementById('profile-username').value = currentUser.username;
  document.getElementById('profile-email').value = currentUser.email;
  document.getElementById('profile-fullname').value = currentUser.full_name;
  document.getElementById('profile-contact').value = currentUser.contact || '';
  document.getElementById('profile-simrs-path').value = currentUser.simrs_path || '';

  // Load shift configuration if available
  loadShiftConfigurationForm();

  // Set profile header
  document.getElementById('profile-header-name').textContent = currentUser.full_name || currentUser.username;

  // Set profile photo if available
  if (currentUser.photo) {
    const photoElement = document.getElementById('profile-photo');
    const placeholderElement = document.getElementById('profile-photo-placeholder');

    // Determine photo URL based on whether it's a full URL or just a filename
    let photoUrl;
    if (currentUser.photoUrl) {
      // Use cached URL if available
      photoUrl = currentUser.photoUrl;
    } else if (currentUser.photo.startsWith('http')) {
      // Already a full URL
      photoUrl = currentUser.photo;
    } else if (currentUser.photo.startsWith('../')) {
      // Local relative path
      photoUrl = currentUser.photo;
    } else {
      // Just a filename - construct the portal URL
      photoUrl = `https://portal.rsudhabdulazizmarabahan.com/uploads/photos/${currentUser.photo}`;
    }

    photoElement.src = photoUrl;
    photoElement.onload = function() {
      photoElement.classList.remove('d-none');
      placeholderElement.classList.add('d-none');
    };
    photoElement.onerror = function() {
      // If portal URL fails, try local backup
      if (photoUrl.includes('portal.rsudhabdulazizmarabahan.com')) {
        photoElement.src = `../assets/uploads/${currentUser.photo}`;
      } else {
        photoElement.classList.add('d-none');
        placeholderElement.classList.remove('d-none');
        console.error('Failed to load profile photo:', photoUrl);
      }
    };
  }

  // Unit kerja will be set when data is loaded
  // We'll update the profile-header-unit in loadUnitKerjaData
}

// Load unit kerja data for profile form
async function loadUnitKerjaData() {
  try {
    if (!currentUser) {
      console.log('Waiting for currentUser to be loaded...');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('Loading unit kerja data...');

    let retries = 0;
    let unitSelect, unitHiddenInput;
    while (retries < 10) {
      unitSelect = document.getElementById('profile-unit-select');
      unitHiddenInput = document.getElementById('profile-unit');
      if (unitSelect && unitHiddenInput) break;
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }

    if (!unitSelect || !unitHiddenInput) {
      console.error('Unit kerja select or hidden input not found after retries');
      return;
    }

    console.log('DOM elements found, fetching unit kerja data...');
    const unitKerjaList = await window.api.getAllUnitKerja();
    console.log('Raw unit kerja data:', unitKerjaList);

    if (!Array.isArray(unitKerjaList)) {
      console.error('Unit kerja data is not an array:', unitKerjaList);
      return;
    }

    // Normalize possible Sequelize instances to plain objects
    const normalizedUnits = unitKerjaList
      .map(u => (u && u.dataValues) ? u.dataValues : u)
      .filter(u => !!u);

    // Populate options (no longer excluding any unit)
    unitSelect.innerHTML = '<option value="" disabled selected>Pilih unit kerja</option>';
    normalizedUnits.forEach(unit => {
      const opt = document.createElement('option');
      opt.value = unit.id;
      opt.textContent = unit.nama || unit.name || '-';
      unitSelect.appendChild(opt);
      console.log(`Added option: ${opt.textContent} (ID: ${unit.id})`);
    });
    console.log('Dropdown populated with', normalizedUnits.length, 'options');

    // Set selected value if currentUser has unit_kerja_id and exists
    if (currentUser && currentUser.unit_kerja_id) {
      const exists = normalizedUnits.some(u => String(u.id) === String(currentUser.unit_kerja_id));
      if (exists) {
        unitSelect.value = String(currentUser.unit_kerja_id);
        unitHiddenInput.value = String(currentUser.unit_kerja_id);
        const selectedUnit = normalizedUnits.find(u => String(u.id) === String(currentUser.unit_kerja_id));
        const headerEl = document.getElementById('profile-header-unit');
        if (headerEl) headerEl.textContent = selectedUnit ? selectedUnit.nama : 'Belum dipilih';
      } else {
        unitSelect.value = '';
        unitHiddenInput.value = '';
        const headerEl = document.getElementById('profile-header-unit');
        if (headerEl) headerEl.textContent = 'Belum dipilih';
        console.warn('Current user unit not found in list:', currentUser.unit_kerja_id);
      }
    } else {
      unitSelect.value = '';
      unitHiddenInput.value = '';
      const headerEl = document.getElementById('profile-header-unit');
      if (headerEl) headerEl.textContent = 'Belum dipilih';
    }

    // Change listener to reflect selection to hidden input and header
    unitSelect.addEventListener('change', () => {
      unitHiddenInput.value = unitSelect.value;
      const selectedUnit = normalizedUnits.find(u => String(u.id) === String(unitSelect.value));
      const headerEl = document.getElementById('profile-header-unit');
      if (headerEl) headerEl.textContent = selectedUnit ? selectedUnit.nama : 'Belum dipilih';
      console.log('Unit changed to:', selectedUnit ? selectedUnit.nama : 'None');
    });

    console.log('Unit kerja data loading completed successfully');
  } catch (error) {
    console.error('Error loading unit kerja data:', error);
  }
}

// Update profile
async function updateProfile(e) {
  e.preventDefault();

  if (!currentUser) {
    showProfileAlert('danger', 'Anda harus login terlebih dahulu.');
    return;
  }

  const password = document.getElementById('profile-password').value;
  const confirmPassword = document.getElementById('profile-password-confirm').value;

  // Check if passwords match
  if (password && password !== confirmPassword) {
    showProfileAlert('danger', 'Password dan konfirmasi password tidak cocok.');
    return;
  }

  try {
    showProfileAlert('info', 'Menyimpan perubahan...');

    // Ambil unit kerja dari dropdown jika tersedia
    const unitSelect = document.getElementById('profile-unit-select');
    const selectedUnitId = unitSelect && unitSelect.value ? parseInt(unitSelect.value, 10) : currentUser.unit_kerja_id;

    const formData = {
      id: currentUser.id,
      email: document.getElementById('profile-email').value,
      full_name: document.getElementById('profile-fullname').value,
      contact: document.getElementById('profile-contact').value,
      unit_kerja_id: selectedUnitId,
      simrs_path: document.getElementById('profile-simrs-path').value
    };

    // Add password if provided
    if (password) {
      formData.password = password;
    }

    const result = await window.api.updateProfile(formData);

    if (result.success) {
      // Update current user data
      currentUser = result.user;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      // Update UI
      document.getElementById('username-display').textContent = currentUser.username;
      document.getElementById('fullname-display').textContent = currentUser.full_name;
      document.getElementById('profile-header-name').textContent = currentUser.full_name || currentUser.username;

      // Update unit selection after save
      const unitKerjaList = await window.api.getAllUnitKerja();
      const selectedUnit = (unitKerjaList || []).find(u => String(u.id) === String(currentUser.unit_kerja_id));
      if (document.getElementById('profile-header-unit')) {
        document.getElementById('profile-header-unit').textContent = selectedUnit ? selectedUnit.nama : 'Belum dipilih';
      }
      const unitSelectEl = document.getElementById('profile-unit-select');
      const unitHiddenEl = document.getElementById('profile-unit');
      if (unitSelectEl) unitSelectEl.value = String(currentUser.unit_kerja_id || '');
      if (unitHiddenEl) unitHiddenEl.value = String(currentUser.unit_kerja_id || '');

      // Update shift configuration if shift system is being used
      const usesEl = document.getElementById('uses-shift-system');
      if (usesEl && usesEl.checked) {
        await updateShiftConfig();
      }

      // Clear password fields
      document.getElementById('profile-password').value = '';
      document.getElementById('profile-password-confirm').value = '';

      showProfileAlert('success', result.message);
    } else {
      showProfileAlert('danger', result.message);
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    showProfileAlert('danger', 'Terjadi kesalahan saat memperbarui profil.');
  }
}

// Browse for SIMRS path
async function browseSimrsPath() {
  try {
    const result = await window.api.selectSimrsPath();
    if (result && result.filePath) {
      document.getElementById('profile-simrs-path').value = result.filePath;
    }
  } catch (error) {
    console.error('Error browsing for SIMRS path:', error);
  }
}

// Handle profile photo upload
async function handlePhotoUpload(event) {
  if (!currentUser) {
    showProfileAlert('danger', 'Anda harus login terlebih dahulu.');
    return;
  }

  const file = event.target.files[0];
  if (!file) return;

  // Check file type
  if (!file.type.match('image.*')) {
    showProfileAlert('danger', 'File harus berupa gambar (JPG, PNG, GIF).');
    return;
  }

  // Check file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    showProfileAlert('danger', 'Ukuran file terlalu besar. Maksimal 2MB.');
    return;
  }

  try {
    showProfileAlert('info', 'Mengupload foto profil...');

    // Read file as data URL
    const reader = new FileReader();
    reader.onload = async (e) => {
      const photoData = e.target.result;

      // Upload to server
      const result = await window.api.uploadProfilePhoto(currentUser.id, photoData);

      if (result.success) {
        // Update current user data with just the filename
        currentUser.photo = result.fileName;
        // Store the full photo URL for immediate use
        currentUser.photoUrl = result.photoPath;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        // Update UI - Profile photo
        const photoElement = document.getElementById('profile-photo');
        const placeholderElement = document.getElementById('profile-photo-placeholder');

        photoElement.src = result.photoPath;
        photoElement.onload = function() {
          photoElement.classList.remove('d-none');
          placeholderElement.classList.add('d-none');
        };
        photoElement.onerror = function() {
          // If portal URL fails, try local backup
          if (result.photoPath.includes('portal.rsudhabdulazizmarabahan.com')) {
            photoElement.src = `../assets/uploads/${result.fileName}`;
          } else {
            photoElement.classList.add('d-none');
            placeholderElement.classList.remove('d-none');
          }
        };

        // Update UI - Navbar photo
        const navPhotoElement = document.getElementById('nav-profile-photo');
        const navPlaceholderElement = document.getElementById('nav-profile-placeholder');

        navPhotoElement.src = result.photoPath;
        navPhotoElement.onload = function() {
          navPhotoElement.classList.remove('d-none');
          navPlaceholderElement.classList.add('d-none');
        };
        navPhotoElement.onerror = function() {
          // If portal URL fails, try local backup
          if (result.photoPath.includes('portal.rsudhabdulazizmarabahan.com')) {
            navPhotoElement.src = `../assets/uploads/${result.fileName}`;
          } else {
            navPhotoElement.classList.add('d-none');
            navPlaceholderElement.classList.remove('d-none');
          }
        };

        // Update UI - Dashboard header photo
        const dashboardPhotoElement = document.getElementById('dashboard-photo');
        const dashboardPlaceholderElement = document.getElementById('dashboard-photo-placeholder');

        dashboardPhotoElement.src = result.photoPath;
        dashboardPhotoElement.onload = function() {
          dashboardPhotoElement.classList.remove('d-none');
          dashboardPlaceholderElement.classList.add('d-none');
        };
        dashboardPhotoElement.onerror = function() {
          // If portal URL fails, try local backup
          if (result.photoPath.includes('portal.rsudhabdulazizmarabahan.com')) {
            dashboardPhotoElement.src = `../assets/uploads/${result.fileName}`;
          } else {
            dashboardPhotoElement.classList.add('d-none');
            dashboardPlaceholderElement.classList.remove('d-none');
          }
        };

        showProfileAlert('success', 'Foto profil berhasil diupload.');
      } else {
        showProfileAlert('danger', result.message || 'Gagal mengupload foto profil.');
      }
    };

    reader.readAsDataURL(file);
  } catch (error) {
    console.error('Error uploading profile photo:', error);
    showProfileAlert('danger', 'Terjadi kesalahan saat mengupload foto profil.');
  }
}

// Load SIMRS usage history
async function loadSimrsHistory() {
  if (!currentUser) return;

  try {
    const history = await window.api.getSimrsHistory(currentUser.id);
    const historyContainer = document.getElementById('simrs-history-container');

    if (!historyContainer) {
      return;
    }

    if (!history || history.length === 0) {
      historyContainer.innerHTML = '<p class="text-center">Belum ada riwayat penggunaan SIMRS.</p>';
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="table table-striped table-hover">
          <thead>
            <tr>
              <th>Tanggal & Waktu</th>
              <th>Unit Kerja</th>
              <th>Status</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
    `;

    history.forEach(item => {
      const startTime = new Date(item.start_time).toLocaleString();
      const unitKerja = item.UnitKerja ? item.UnitKerja.nama : 'Tidak Ada Unit';
      const status = item.status === 'active' ?
        '<span class="badge bg-success">Aktif</span>' :
        '<span class="badge bg-secondary">Selesai</span>';

      html += `
        <tr>
          <td>${startTime}</td>
          <td>${unitKerja}</td>
          <td>${status}</td>
          <td>${item.ip_address}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    historyContainer.innerHTML = html;
  } catch (error) {
    console.error('Error loading SIMRS history:', error);
    const historyContainer = document.getElementById('simrs-history-container');
    if (historyContainer) {
      historyContainer.innerHTML = '<p class="text-center text-danger">Gagal memuat riwayat penggunaan SIMRS.</p>';
    }
  }
}

// Close SIMRS session
async function closeSimrsSession() {
  if (!currentSimrsLogId) {
    showSimrsAlert('warning', 'Tidak ada sesi SIMRS aktif yang perlu ditutup.');
    return;
  }

  try {
    showSimrsAlert('info', 'Menutup sesi SIMRS...');

    const result = await window.api.closeSimrs(currentSimrsLogId);

    if (result.success) {
      // Clear current log ID
      currentSimrsLogId = null;

      // Hide status
      document.getElementById('simrs-status').classList.add('d-none');

      // Clear refresh interval if exists
      if (window.simrsHistoryRefreshInterval) {
        clearInterval(window.simrsHistoryRefreshInterval);
        window.simrsHistoryRefreshInterval = null;
      }

      showSimrsAlert('success', 'Sesi SIMRS berhasil ditutup.');

      // Reload SIMRS history
      loadSimrsHistory();
    } else {
      showSimrsAlert('danger', result.message || 'Gagal menutup sesi SIMRS.');
    }
  } catch (error) {
    console.error('Error closing SIMRS session:', error);
    showSimrsAlert('danger', 'Terjadi kesalahan saat menutup sesi SIMRS.');
  }
}

// Logout function
async function logout() {
  try {
    const userJson = localStorage.getItem('currentUser');
    const user = userJson ? JSON.parse(userJson) : null;

    // Tutup semua sesi SIMRS aktif milik user di backend
    if (user && user.id && window.api && window.api.closeAllSimrsForUser) {
      try {
        const result = await window.api.closeAllSimrsForUser(user.id);
        console.log('closeAllSimrsForUser result:', result);
      } catch (e) {
        console.error('Gagal menutup semua sesi SIMRS user saat logout', e);
      }
    }

    // Hapus data user dari localStorage dengan aman
    localStorage.removeItem('currentUser');
    localStorage.removeItem('activeSimrsLogId');

    // Disconnect chat socket if any
    try { if (chatSocket) { chatSocket.close(); chatSocket = null; } } catch (e) {}
    if (chatPingInterval) { clearInterval(chatPingInterval); chatPingInterval = null; }
    try { if (window._onlineUsersRefreshInterval) { clearInterval(window._onlineUsersRefreshInterval); window._onlineUsersRefreshInterval = null; } } catch (e) {}

    // Redirect ke halaman login
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Error during logout:', error);
  }
}

// ===== SHIFT SYSTEM FUNCTIONS =====

// Setup shift-related event listeners
function setupShiftEventListeners() {
  // Uses shift system toggle
  const usesShiftSystemToggle = document.getElementById('uses-shift-system');
  if (usesShiftSystemToggle) {
    usesShiftSystemToggle.addEventListener('change', toggleShiftSystem);
  }

  // Manual shift change button
  const manualShiftChangeBtn = document.getElementById('manual-shift-change-btn');
  if (manualShiftChangeBtn) {
    manualShiftChangeBtn.addEventListener('click', handleManualShiftChange);
  }

  // Browse shift path buttons
  const browseShiftPagiBtn = document.getElementById('browse-shift-pagi-path');
  if (browseShiftPagiBtn) {
    browseShiftPagiBtn.addEventListener('click', () => browseShiftPath('pagi'));
  }

  const browseShiftMalamBtn = document.getElementById('browse-shift-malam-path');
  if (browseShiftMalamBtn) {
    browseShiftMalamBtn.addEventListener('click', () => browseShiftPath('malam'));
  }
}

// Toggle shift system configuration visibility
function toggleShiftSystem() {
  const usesShiftSystem = document.getElementById('uses-shift-system').checked;
  const shiftPathsConfig = document.getElementById('shift-paths-config');
  
  if (usesShiftSystem) {
    shiftPathsConfig.style.display = 'block';
  } else {
    shiftPathsConfig.style.display = 'none';
  }
}

// Load shift status and update UI
async function loadShiftStatus() {
  try {
    if (!currentUser || !currentUser.UnitKerja) {
      return;
    }

    // Get shift status for current unit
    const shiftStatus = await window.api.getShiftStatus(currentUser.UnitKerja.id);
    
    if (shiftStatus.usesShiftSystem) {
      // Show shift indicator
      const shiftIndicator = document.getElementById('shift-status-indicator');
      shiftIndicator.style.display = 'block';

      // Update shift information: prioritaskan shift sesi aktif jika ada
      const effectiveShiftName = (shiftStatus.activeSession && shiftStatus.activeSession.shift)
        ? shiftStatus.activeSession.shift
        : shiftStatus.currentShift;
      updateShiftIndicator(effectiveShiftName ? { shift_name: effectiveShiftName } : null);

      // Ensure initial theme matches the effective shift
      if (window.theme && typeof window.theme.applyThemeByShiftName === 'function') {
        window.theme.applyThemeByShiftName(effectiveShiftName);
      }

      // Show shift configuration in profile
      const shiftConfigSection = document.getElementById('shift-config-section');
      shiftConfigSection.style.display = 'block';

      // Fill shift configuration form
      fillShiftConfigForm(shiftStatus);
    }
  } catch (error) {
    console.error('Error loading shift status:', error);
  }
}

// Update shift indicator UI
function updateShiftIndicator(shiftData) {
  if (!shiftData) return;

  const shiftIcon = document.getElementById('shift-icon');
  const currentShiftName = document.getElementById('current-shift-name');
  const shiftTimeInfo = document.getElementById('shift-time-info');

  if (shiftData.shift_name === 'pagi') {
    shiftIcon.className = 'fas fa-sun text-warning';
    currentShiftName.textContent = 'Shift Pagi';
    shiftTimeInfo.textContent = '08:00 - 16:30';
  } else if (shiftData.shift_name === 'malam') {
    shiftIcon.className = 'fas fa-moon text-primary';
    currentShiftName.textContent = 'Shift Malam';
    shiftTimeInfo.textContent = '16:30 - 08:00';
  }
}

// Fill shift configuration form
function fillShiftConfigForm(shiftStatus) {
  const usesEl = document.getElementById('uses-shift-system');
  if (usesEl) {
    usesEl.checked = !!shiftStatus.usesShiftSystem;
  }

  const enabledEl = document.getElementById('shift-enabled');
  if (enabledEl) {
    enabledEl.checked = !!shiftStatus.shiftEnabled;
  }

  const pagiInput = document.getElementById('shift-pagi-path');
  if (pagiInput) {
    pagiInput.value = shiftStatus.shiftPagiPath || '';
  }

  const malamInput = document.getElementById('shift-malam-path');
  if (malamInput) {
    malamInput.value = shiftStatus.shiftMalamPath || '';
  }
}

// Handle manual shift change
async function handleManualShiftChange() {
  try {
    if (!currentUser || !currentUser.UnitKerja) {
      showSimrsAlert('warning', 'Unit kerja tidak ditemukan.');
      return;
    }

    // Get current shift
    const currentShift = await window.api.getCurrentShift();
    const oldShiftName = currentShift && currentShift.shift_name ? currentShift.shift_name : 'malam';
    const newShift = oldShiftName === 'pagi' ? 'malam' : 'pagi';

    // Confirm shift change
    const confirmed = confirm(`Apakah Anda yakin ingin mengganti shift dari ${oldShiftName} ke ${newShift}?`);
    if (!confirmed) return;

    // Perform manual shift change
    const result = await window.api.manualShiftChange({
      unitId: currentUser.UnitKerja.id,
      userId: currentUser.id,
      newShiftName: newShift
    });

    if (result.success) {
      showSimrsAlert('success', `Shift berhasil diganti ke ${newShift}.`);
      
      // Update shift indicator berdasarkan status shift unit (utamakan sesi aktif)
      const updatedStatus = await window.api.getShiftStatus(currentUser.UnitKerja.id);
      const effectiveShiftName = (updatedStatus.activeSession && updatedStatus.activeSession.shift)
        ? updatedStatus.activeSession.shift
        : updatedStatus.currentShift;
      updateShiftIndicator(effectiveShiftName ? { shift_name: effectiveShiftName } : null);

      // Update page theme to follow the new shift
      if (window.theme && typeof window.theme.applyThemeByShiftName === 'function') {
        window.theme.applyThemeByShiftName(effectiveShiftName);
      } else if (window.theme && typeof window.theme.applyTheme === 'function') {
        window.theme.applyTheme(effectiveShiftName === 'malam' ? 'dark' : 'light');
      }

      // Reload SIMRS history (only if container exists)
      const hc = document.getElementById('simrs-history-container');
      if (hc) {
        loadSimrsHistory();
      }
    } else {
      showSimrsAlert('danger', result.message || 'Gagal mengganti shift.');
    }
  } catch (error) {
    console.error('Error changing shift manually:', error);
    showSimrsAlert('danger', 'Terjadi kesalahan saat mengganti shift.');
  }
}

// Browse shift path
async function browseShiftPath(shiftType) {
  try {
    const result = await window.api.browseFile();
    if (result.success && result.filePath) {
      const inputId = `shift-${shiftType}-path`;
      document.getElementById(inputId).value = result.filePath;
    }
  } catch (error) {
    console.error(`Error browsing ${shiftType} shift path:`, error);
    showProfileAlert('danger', `Terjadi kesalahan saat memilih path shift ${shiftType}.`);
  }
}

// Update shift configuration
async function updateShiftConfig() {
  try {
    if (!currentUser || !currentUser.UnitKerja) {
      showProfileAlert('warning', 'Unit kerja tidak ditemukan.');
      return;
    }

    const usesEl = document.getElementById('uses-shift-system');
    const enabledEl = document.getElementById('shift-enabled');

    const shiftConfig = {
      unitKerjaId: currentUser.UnitKerja.id,
      usesShiftSystem: usesEl ? usesEl.checked : !!currentUser.UnitKerja.uses_shift_system,
      shiftEnabled: enabledEl ? enabledEl.checked : !!currentUser.UnitKerja.shift_enabled,
      shiftPagiPath: document.getElementById('shift-pagi-path') ? document.getElementById('shift-pagi-path').value : '',
      shiftMalamPath: document.getElementById('shift-malam-path') ? document.getElementById('shift-malam-path').value : ''
    };

    const result = await window.api.updateUnitShiftConfig(shiftConfig);

    if (result.success) {
      showProfileAlert('success', 'Konfigurasi shift berhasil disimpan.');
      
      // Reload shift status
      await loadShiftStatus();
    } else {
      showProfileAlert('danger', result.message || 'Gagal menyimpan konfigurasi shift.');
    }
  } catch (error) {
    console.error('Error updating shift config:', error);
    showProfileAlert('danger', 'Terjadi kesalahan saat menyimpan konfigurasi shift.');
  }
}

// Load shift configuration form data
async function loadShiftConfigurationForm() {
  try {
    const shiftConfigSection = document.getElementById('shift-config-section');
    
    if (!currentUser || !currentUser.UnitKerja) {
      if (shiftConfigSection) {
        shiftConfigSection.style.display = 'none';
      }
      return;
    }

    // Check if current user's unit uses shift system
    if (currentUser.UnitKerja.uses_shift_system && currentUser.UnitKerja.shift_enabled) {
      // Show shift configuration section
      if (shiftConfigSection) {
        shiftConfigSection.style.display = 'block';
      }

      // Get shift status for current unit
      const shiftStatus = await window.api.getShiftStatus(currentUser.UnitKerja.id);
      
      if (shiftStatus) {
        // Fill shift configuration form with existing paths
        fillShiftConfigForm(shiftStatus);
      }
    } else {
      // Hide shift configuration section if unit doesn't use shift system
      if (shiftConfigSection) {
        shiftConfigSection.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Error loading shift configuration form:', error);
    // Hide the section if there's an error
    const shiftConfigSection = document.getElementById('shift-config-section');
    if (shiftConfigSection) {
      shiftConfigSection.style.display = 'none';
    }
  }
}
