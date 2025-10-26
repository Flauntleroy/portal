const CHAT_BASE_URL = window.CHAT_BASE_URL || 'http://localhost:3002';
let SOCKET_IO_PATH = '/socket.io';
try {
  const u = new URL(CHAT_BASE_URL);
  const basePath = (u.pathname || '').replace(/\/+$/, '');
  SOCKET_IO_PATH = basePath ? `${basePath}/socket.io` : '/socket.io';
} catch {}

function ChatApp() {
  const [contacts, setContacts] = React.useState([]);
  const [onlineMap, setOnlineMap] = React.useState({});
  const [selected, setSelected] = React.useState(null); // contact object
  const [roomId, setRoomId] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [text, setText] = React.useState('');
  const [latency, setLatency] = React.useState(null);
  const [status, setStatus] = React.useState('Connecting…');
  const socketRef = React.useRef(null);
  const currentUser = React.useMemo(() => {
    try { return JSON.parse(localStorage.getItem('currentUser')); } catch { return null; }
  }, []);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    const socket = io(CHAT_BASE_URL, { transports: ['websocket'], path: SOCKET_IO_PATH });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('Connected');
      socket.emit('auth', { user_id: currentUser.id });
    });

    socket.on('disconnect', () => setStatus('Disconnected'));

    socket.on('presence:list', (list) => {
      const map = {};
      (list || []).forEach(item => { map[item.user_id] = true; });
      setOnlineMap(map);
    });

    socket.on('chat:new_message', (m) => {
      setMessages(prev => {
        if (roomId && m.room_id === roomId) {
          return [...prev, m];
        }
        return prev;
      });
    });

    const ping = () => {
      try {
        socket.emit('presence:ping', (serverTs) => {
          const now = Date.now();
          if (typeof serverTs === 'number') {
            setLatency(Math.max(0, now - serverTs));
          }
        });
      } catch {}
    };
    const int = setInterval(ping, 5000);
    ping();

    // initial load
    loadContacts(currentUser.id).catch(() => {});

    return () => {
      clearInterval(int);
      socket.removeAllListeners();
      socket.close();
    };
  }, [currentUser?.id]);

  async function loadContacts(userId) {
    const r = await fetch(`${CHAT_BASE_URL}/api/contacts?user_id=${userId}`);
    const data = await r.json();
    setContacts(data);
    // seed online map
    const map = {}; data.forEach(c => { if (c.online) map[c.id] = true; });
    setOnlineMap(map);
  }

  async function selectContact(contact) {
    setSelected(contact);
    setMessages([]);
    setRoomId(null);
    // Ensure direct room exists and join it
    const r = await fetch(`${CHAT_BASE_URL}/api/direct-room?user_id=${currentUser.id}&peer_id=${contact.id}`);
    const room = await r.json();
    setRoomId(room.id);
    if (socketRef.current) socketRef.current.emit('room:join', { room_id: room.id });
    await loadMessages(room.id);
  }

  async function loadMessages(rid) {
    const r = await fetch(`${CHAT_BASE_URL}/api/messages?room_id=${rid}&user_id=${currentUser.id}`);
    const data = await r.json();
    setMessages(data);
    
    // Mark messages as read when loading
    const unreadMessages = data.filter(m => String(m.sender_id) !== String(currentUser.id) && !m.is_read_by_me);
    for (const msg of unreadMessages) {
      try {
        await fetch(`${CHAT_BASE_URL}/api/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.id, message_id: msg.id })
        });
      } catch (e) { console.warn('mark read error', e); }
    }
  }

  async function sendMessage() {
    const t = text.trim();
    if (!t || !selected) return;
    const payload = { sender_id: currentUser.id, room_id: roomId, message: t, message_type: 'text' };
    // If roomId not yet set, send with recipient to create room
    if (!roomId && selected?.id) payload.recipient_id = selected.id;
    const r = await fetch(`${CHAT_BASE_URL}/api/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (data?.data?.room_id && !roomId) {
      setRoomId(data.data.room_id);
      if (socketRef.current) socketRef.current.emit('room:join', { room_id: data.data.room_id });
    }
    setText('');
  }

  if (!currentUser?.id) {
    return (
      <div className="alert alert-warning">
        Anda belum login. Silakan login terlebih dahulu di halaman <a href="login.html">Login</a>.
      </div>
    );
  }

  return (
    <div className="row chat-container">
      <div className="col-4 contacts">
        <div className="d-flex justify-content-between align-items-center p-2">
          <strong>Kontak</strong>
          <small className="text-muted">Status: {status}{latency!=null ? ` · ${latency}ms` : ''}</small>
        </div>
        <div>
          {contacts.map(c => (
            <div key={c.id} className={`d-flex align-items-center p-2 ${selected?.id===c.id?'bg-light':''}`} style={{cursor:'pointer'}} onClick={() => selectContact(c)}>
              <span className={`online-dot ${onlineMap[c.id]?'online':'offline'}`}></span>
              <div className="flex-grow-1">
                {c.unit_kerja && c.unit_kerja !== '-' && (
                  <div className="unit-badge-chat" title={`Unit: ${c.unit_kerja}`}>{c.unit_kerja}</div>
                )}
                <div className="fw-semibold">{c.full_name || c.username}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="col-8 d-flex flex-column">
        <div className="border-bottom p-2">
          {selected ? (
            <div className="d-flex align-items-center">
              <div className="sender-info-chat">
                {selected.unit_kerja && selected.unit_kerja !== '-' && (
                  <div className="unit-badge-chat" title={`Unit: ${selected.unit_kerja}`}>{selected.unit_kerja}</div>
                )}
                <strong>Chat dengan {selected.full_name || selected.username}</strong>
              </div>
            </div>
          ) : (
            <span className="text-muted">Pilih kontak untuk mulai chat</span>
          )}
        </div>
        <div className="flex-grow-1 p-2 messages">
          {selected && messages.length === 0 && (
            <div className="text-muted">Belum ada pesan. Tulis pesan pertama.</div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`message ${m.sender_id===currentUser.id ? 'me' : 'other'}`}>
              <div style={{fontSize:'12px'}} className="text-muted">{m.sender_id===currentUser.id ? 'Anda' : (m.sender || 'Teman')}</div>
              <div>{m.message}</div>
              <div style={{fontSize:'11px'}} className="text-muted">{new Date(m.created_at).toLocaleString()}</div>
              {m.sender_id === currentUser.id && (
                <div style={{fontSize:'11px', textAlign:'right', marginTop:'4px', color:'#6b7280'}}>
                  {m.read_count > 0 || (m.reads && m.reads.length > 0) ? (
                    <span style={{color:'#0ea5e9'}}>✓✓</span>
                  ) : (
                    <span>✓</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="p-2 d-flex gap-2">
          <input className="form-control" placeholder="Tulis pesan…" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') sendMessage();}} disabled={!selected} />
          <button className="btn btn-primary" onClick={sendMessage} disabled={!selected || !text.trim()}>Kirim</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ChatApp />);


import io from 'socket.io-client';

const CHAT_BASE_URL = window.CHAT_BASE_URL || 'http://localhost:3002';
let SOCKET_IO_PATH = '/socket.io';
try {
  const u = new URL(CHAT_BASE_URL);
  const basePath = (u.pathname || '').replace(/\/+$/, '');
  SOCKET_IO_PATH = basePath ? `${basePath}/socket.io` : '/socket.io';
} catch {}

export function initPresenceForChatApp(currentUserId, onListUpdate) {
  const socket = io(CHAT_BASE_URL, { transports: ['websocket'], reconnection: true, path: SOCKET_IO_PATH });
  socket.on('connect', () => {
    console.log('[presence][chat_app] connected', socket.id);
    socket.emit('auth', { user_id: currentUserId });
    socket.emit('presence:ping');
  });
  socket.on('presence:list', (list) => {
    console.log('[presence][chat_app] presence:list', list.length);
    if (typeof onListUpdate === 'function') onListUpdate(list);
  });
  socket.on('disconnect', (reason) => {
    console.log('[presence][chat_app] disconnected', reason);
  });
  return socket;
}