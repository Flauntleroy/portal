const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const log = require('electron-log');

// Load DB models (shared with Electron app)
const db = require(path.join(__dirname, 'src', 'models'));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve static chat UI for preview
app.use('/views', express.static(path.join(__dirname, 'src', 'views')));
app.use('/assets', express.static(path.join(__dirname, 'src', 'assets')));
app.use('/renderer', express.static(path.join(__dirname, 'src', 'renderer')));
app.get('/', (req, res) => {
  res.redirect('/views/chat.html');
});

const PORT = process.env.CHAT_PORT || 3002;

// Util: Ensure direct room exists for two users
async function getOrCreateDirectRoom(userIdA, userIdB) {
  const [minId, maxId] = [Math.min(userIdA, userIdB), Math.max(userIdA, userIdB)];
  // Try find existing direct room that has both participants
  const rooms = await db.ChatRoom.findAll({
    where: { type: 'direct', is_active: true },
    include: [{ model: db.ChatParticipant, as: 'Participants' }]
  });
  for (const room of rooms) {
    const uids = (room.Participants || []).map(p => p.user_id).sort();
    if (uids.length === 2 && uids[0] === minId && uids[1] === maxId) {
      return room;
    }
  }
  // Create room if not found
  const newRoom = await db.ChatRoom.create({
    name: `DM ${minId}-${maxId}`,
    type: 'direct',
    created_by: userIdA,
    is_active: true
  });
  await db.ChatParticipant.bulkCreate([
    { room_id: newRoom.id, user_id: userIdA, role: 'member', joined_at: new Date(), is_active: true },
    { room_id: newRoom.id, user_id: userIdB, role: 'member', joined_at: new Date(), is_active: true }
  ]);
  return newRoom;
}

// API: get contacts
app.get('/api/contacts', async (req, res) => {
  try {
    const userId = parseInt(req.query.user_id, 10);
    if (!userId) return res.status(400).json({ error: 'user_id diperlukan' });

    // Contacts from direct rooms
    const parts = await db.ChatParticipant.findAll({ where: { user_id: userId }, include: [{ model: db.ChatRoom, as: 'Room' }] });
    const directRoomIds = parts.filter(p => p.Room?.type === 'direct').map(p => p.room_id);
    const otherParticipants = await db.ChatParticipant.findAll({ where: { room_id: directRoomIds } });
    const contactIds = [...new Set(otherParticipants.map(p => p.user_id).filter(uid => uid !== userId))];

    let contacts = [];
    if (contactIds.length) {
      contacts = await db.User.findAll({ where: { id: contactIds }, include: [{ model: db.UnitKerja }] });
    } else {
      // Fallback: all users except self
      contacts = await db.User.findAll({ where: { id: { [db.Sequelize.Op.ne]: userId } }, include: [{ model: db.UnitKerja }], limit: 50 });
    }

    // Presence information
    const online = await db.OnlineUser.findAll({ where: { status: 'online' } });
    const onlineSet = new Set(online.map(o => o.user_id));


    res.json(contacts.map(u => ({
      id: u.id,
      username: u.username,
      full_name: u.full_name,
      unit_kerja: u.UnitKerja ? u.UnitKerja.nama : null,
      online: onlineSet.has(u.id),
      photo: u.photo
    })));
  } catch (e) {
    log.error('contacts error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// API: list all online users with details (dedup by user_id)
app.get('/api/online-users', async (req, res) => {
  try {
    const excludeId = parseInt(req.query.exclude_id, 10);
    const rows = await db.OnlineUser.findAll({
      where: { status: 'online' },
      include: [{ model: db.User, as: 'User', include: [{ model: db.UnitKerja }] }]
    });
    const map = new Map();
    for (const r of rows) {
      const uid = r.user_id;
      if (excludeId && uid === excludeId) continue;
      if (!map.has(uid)) {
        map.set(uid, {
          id: uid,
          username: r.User?.username,
          full_name: r.User?.full_name,
          unit_kerja: r.User?.UnitKerja ? r.User.UnitKerja.nama : null,
          last_active: r.last_active,
          photo: r.User?.photo
        });
      }
    }
    const list = Array.from(map.values());
    log.info(`[presence] /api/online-users -> ${list.length} users`);
    res.json(list);
  } catch (e) {
    log.error('online-users error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// API: get rooms for user
app.get('/api/rooms', async (req, res) => {
  try {
    const userId = parseInt(req.query.user_id, 10);
    if (!userId) return res.status(400).json({ error: 'user_id diperlukan' });
    const parts = await db.ChatParticipant.findAll({ where: { user_id: userId }, include: [{ model: db.ChatRoom, as: 'Room' }] });
    res.json(parts.map(p => ({ id: p.Room.id, name: p.Room.name, type: p.Room.type })));
  } catch (e) {
    log.error('rooms error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// API: get messages for room
app.get('/api/messages', async (req, res) => {
  try {
    const roomId = parseInt(req.query.room_id, 10);
    const userId = parseInt(req.query.user_id, 10);
    if (!roomId) return res.status(400).json({ error: 'room_id diperlukan' });
    
    const messages = await db.ChatMessage.findAll({
      where: { room_id: roomId },
      include: [
        { model: db.User, as: 'Sender', attributes: ['id', 'username', 'full_name'] },
        { model: db.ChatMessageRead, as: 'Reads', attributes: ['user_id', 'read_at'] }
      ],
      order: [['created_at', 'ASC']]
    });
    
    res.json(messages.map(m => ({
      id: m.id,
      room_id: m.room_id,
      sender_id: m.sender_id,
      sender: m.Sender?.full_name || m.Sender?.username,
      message: m.message,
      message_type: m.message_type,
      created_at: m.created_at,
      reads: m.Reads || [],
      read_count: m.Reads ? m.Reads.length : 0,
      is_read_by_me: userId ? m.Reads?.some(r => r.user_id === userId) : false
    })));
  } catch (e) {
    log.error('messages error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// API: send message
app.post('/api/messages', async (req, res) => {
  try {
    const { sender_id, room_id, recipient_id, message, message_type } = req.body;
    if (!sender_id || !(room_id || recipient_id) || !message) {
      return res.status(400).json({ error: 'payload tidak lengkap' });
    }

    let targetRoomId = room_id;
    if (!targetRoomId && recipient_id) {
      const room = await getOrCreateDirectRoom(parseInt(sender_id, 10), parseInt(recipient_id, 10));
      targetRoomId = room.id;
    }

    const msg = await db.ChatMessage.create({
      room_id: targetRoomId,
      sender_id,
      message,
      message_type: message_type || 'text'
    });

    // Ensure all online participants are joined to the room
    try {
      const parts = await db.ChatParticipant.findAll({ where: { room_id: targetRoomId } });
      const memberIds = parts.map(p => p.user_id);
      const onlineMembers = await db.OnlineUser.findAll({ where: { user_id: memberIds, status: 'online' } });
      for (const om of onlineMembers) {
        const sock = io.sockets.sockets.get(om.socket_id);
        if (sock) sock.join(`room:${targetRoomId}`);
      }
    } catch (joinErr) { log.warn('join recipients error', joinErr); }

    // Emit to room channel
    io.to(`room:${targetRoomId}`).emit('chat:new_message', {
      id: msg.id,
      room_id: targetRoomId,
      sender_id,
      message,
      message_type: msg.message_type,
      created_at: msg.created_at
    });

    res.json({ success: true, message: 'sent', data: { id: msg.id, room_id: targetRoomId } });
  } catch (e) {
    log.error('send message error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// API: mark read
app.post('/api/read', async (req, res) => {
  try {
    const { user_id, message_id } = req.body;
    if (!user_id || !message_id) return res.status(400).json({ error: 'payload tidak lengkap' });
    await db.ChatMessageRead.findOrCreate({
      where: { message_id, user_id },
      defaults: { read_at: new Date() }
    });
    // Emit ke semua peserta room bahwa pesan ini telah dibaca
    try {
      const msg = await db.ChatMessage.findOne({ where: { id: message_id } });
      if (msg && msg.room_id) {
        io.to(`room:${msg.room_id}`).emit('chat:message_read', {
          message_id,
          room_id: msg.room_id,
          reader_id: parseInt(user_id, 10)
        });
      }
    } catch (emitErr) {
      log.warn('emit chat:message_read error', emitErr);
    }
    res.json({ success: true });
  } catch (e) {
    log.error('read error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// Socket.io: presence & messaging
io.on('connection', async (socket) => {
  log.info('socket connected', socket.id);
  // Client should emit 'auth' with user_id after connection
  socket.on('auth', async (payload) => {
    try {
      const userId = parseInt(payload?.user_id, 10);
      if (!userId) return;
      // Cache userId on socket and upsert presence to be idempotent
      socket.data = socket.data || {};
      socket.data.userId = userId;
      await db.OnlineUser.upsert({ user_id: userId, socket_id: socket.id, status: 'online', last_active: new Date(), connected_at: new Date() });
      log.info(`[presence] auth user=${userId} socket=${socket.id}`);

      // Join all rooms user participates in
      const parts = await db.ChatParticipant.findAll({ where: { user_id: userId } });
      for (const p of parts) socket.join(`room:${p.room_id}`);

      // Broadcast presence
      await broadcastPresence();
    } catch (e) { log.error('auth error', e); }
  });

  socket.on('presence:ping', async (cb) => {
    try {
      const rec = await db.OnlineUser.findOne({ where: { socket_id: socket.id } });
      if (rec) {
        rec.last_active = new Date();
        rec.status = 'online';
        await rec.save();
      } else if (socket.data?.userId) {
        await db.OnlineUser.upsert({ user_id: socket.data.userId, socket_id: socket.id, status: 'online', last_active: new Date(), connected_at: new Date() });
      }
    } catch (e) { log.error('presence:ping update error', e); }
    try { await broadcastPresence(); } catch (e) {}
    if (typeof cb === 'function') {
      cb(Date.now());
    }
  });

  socket.on('room:join', async (payload) => {
    try {
      const roomId = parseInt(payload?.room_id, 10);
      if (!roomId) return;
      socket.join(`room:${roomId}`);
    } catch (e) { log.error('room:join error', e); }
  });

  socket.on('disconnect', async () => {
    try {
      const rec = await db.OnlineUser.findOne({ where: { socket_id: socket.id } });
      if (rec) {
        rec.status = 'offline';
        rec.disconnected_at = new Date();
        rec.last_active = new Date();
        await rec.save();
      }
      log.info(`[presence] disconnect socket=${socket.id}`);
      await broadcastPresence();
    } catch (e) { log.error('disconnect error', e); }
  });
});

async function broadcastPresence() {
  const online = await db.OnlineUser.findAll({ where: { status: 'online' } });
  const payload = online.map(o => ({ user_id: o.user_id, socket_id: o.socket_id, last_active: o.last_active }));
  log.info(`[presence] broadcast count=${payload.length}`);
  io.emit('presence:list', payload);
}

(async () => {
  try {
    await db.sequelize.sync();
    server.listen(PORT, () => {
      console.log(`Chat server listening on port ${PORT}`);
    });
  } catch (e) {
    console.error('Failed to start chat server', e);
  }
})();

// API: get or create direct room between two users
app.get('/api/direct-room', async (req, res) => {
  try {
    const a = parseInt(req.query.user_id, 10);
    const b = parseInt(req.query.peer_id, 10);
    if (!a || !b) return res.status(400).json({ error: 'user_id dan peer_id diperlukan' });
    const room = await getOrCreateDirectRoom(a, b);
    res.json({ id: room.id, name: room.name, type: room.type });
  } catch (e) {
    log.error('direct-room error', e);
    res.status(500).json({ error: 'server_error' });
  }
});