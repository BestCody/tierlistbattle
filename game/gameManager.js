const { getRandomTierlists } = require('./tierlists');
const db = require('../database');

const ROUND_DURATION_MS  = 30_000;
const MATCH_ROUNDS       = 5;
const QUEUE_NEEDED       = 3;
const PRE_ROUND_DELAY_MS = 3_000;
const POST_ROUND_DELAY_MS = 5_000;

class GameManager {
  constructor(io) {
    this.io      = io;
    this.queue   = [];        // { socketId, userId, username }
    this.rooms   = new Map(); // roomId → room
    this.matches = new Map(); // matchId → match
  }

  init() {
    this.io.on('connection', (socket) => {
      const { id: userId, username } = socket.user;
      console.log(`[+] ${username} connected`);

      socket.on('join_queue',       ()  => this.joinQueue(socket));
      socket.on('leave_queue',      ()  => this.leaveQueue(socket));
      socket.on('get_rooms',        ()  => this.sendRooms(socket));
      socket.on('create_room',      (d) => this.createRoom(socket, d));
      socket.on('join_room',        (d) => this.joinRoom(socket, d));
      socket.on('leave_room',       ()  => this.leaveRoom(socket));
      socket.on('start_match',      ()  => this.hostStart(socket));
      socket.on('submit_tierlist',  (d) => this.submitTierlist(socket, d));

      socket.on('disconnect', () => {
        console.log(`[-] ${username} disconnected`);
        this.leaveQueue(socket);
        if (socket._roomId) this.leaveRoom(socket);
      });
    });
  }

  // ── QUEUE ─────────────────────────────────────────────────────────

  joinQueue(socket) {
    const { id: userId, username } = socket.user;
    if (this.queue.find(p => p.userId === userId)) return;
    this.queue.push({ socketId: socket.id, userId, username });
    this._broadcastQueue();

    if (this.queue.length >= QUEUE_NEEDED) {
      const players = this.queue.splice(0, QUEUE_NEEDED);
      this._broadcastQueue();
      this._startMatchFromPlayers(players, true);
    }
  }

  leaveQueue(socket) {
    const { id: userId } = socket.user;
    this.queue = this.queue.filter(p => p.userId !== userId);
    socket.emit('queue_left');
    this._broadcastQueue();
  }

  _broadcastQueue() {
    this.queue.forEach(p => {
      const s = this.io.sockets.sockets.get(p.socketId);
      if (s) s.emit('queue_update', { count: this.queue.length, needed: QUEUE_NEEDED });
    });
  }

  // ── ROOMS ──────────────────────────────────────────────────────────

  sendRooms(socket) {
    const rooms = [];
    this.rooms.forEach((r) => {
      if (r.status === 'waiting') {
        rooms.push({
          id: r.id, name: r.name,
          players: r.players.length, maxPlayers: r.maxPlayers,
          hasPassword: !!r.password,
        });
      }
    });
    socket.emit('rooms_list', { rooms });
  }

  createRoom(socket, { name, password, maxPlayers } = {}) {
    const { id: userId, username } = socket.user;
    const roomId = `room_${Date.now()}_${userId}`;
    const room = {
      id: roomId,
      name: (name || `${username}'s Room`).slice(0, 32),
      password: password || null,
      maxPlayers: Math.min(Math.max(parseInt(maxPlayers) || 4, 2), 8),
      hostId: userId,
      players: [{ userId, username, socketId: socket.id }],
      status: 'waiting',
    };
    this.rooms.set(roomId, room);
    socket.join(roomId);
    socket._roomId = roomId;

    socket.emit('room_created', { room: this._safeRoom(room) });
    this._emitRoomUpdate(roomId);
  }

  joinRoom(socket, { roomId, password } = {}) {
    const { id: userId, username } = socket.user;
    const room = this.rooms.get(roomId);

    if (!room)
      return socket.emit('error', { message: 'Room not found' });
    if (room.status !== 'waiting')
      return socket.emit('error', { message: 'Match already started' });
    if (room.players.length >= room.maxPlayers)
      return socket.emit('error', { message: 'Room is full' });
    if (room.password && room.password !== password)
      return socket.emit('error', { message: 'Wrong password' });
    if (room.players.find(p => p.userId === userId))
      return socket.emit('error', { message: 'Already in this room' });

    room.players.push({ userId, username, socketId: socket.id });
    socket.join(roomId);
    socket._roomId = roomId;

    socket.emit('room_joined', { room: this._safeRoom(room) });
    this._emitRoomUpdate(roomId);
  }

  leaveRoom(socket) {
    const { id: userId } = socket.user;
    const roomId = socket._roomId;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.players = room.players.filter(p => p.userId !== userId);
    socket.leave(roomId);
    socket._roomId = null;

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
    } else {
      if (room.hostId === userId) room.hostId = room.players[0].userId;
      this._emitRoomUpdate(roomId);
    }
    socket.emit('room_left');
  }

  hostStart(socket) {
    const { id: userId } = socket.user;
    const roomId = socket._roomId;
    if (!roomId) return socket.emit('error', { message: 'Not in a room' });
    const room = this.rooms.get(roomId);
    if (!room)              return socket.emit('error', { message: 'Room not found' });
    if (room.hostId !== userId) return socket.emit('error', { message: 'Only the host can start' });
    if (room.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players to start' });

    room.status = 'in_progress';
    this._startMatchFromPlayers(room.players.map(p => ({ ...p })), false, roomId);
  }

  // ── MATCH ─────────────────────────────────────────────────────────

  _startMatchFromPlayers(players, isQueue, existingRoomId) {
    const matchId = existingRoomId || `queue_${Date.now()}`;

    if (isQueue) {
      const room = { id: matchId, name: 'Queue Match', players, status: 'in_progress', isQueue: true };
      this.rooms.set(matchId, room);
      players.forEach(p => {
        const s = this.io.sockets.sockets.get(p.socketId);
        if (s) { s.join(matchId); s._roomId = matchId; }
      });
    }

    const match = {
      id: matchId,
      players: players.map(p => ({ ...p, points: 0 })),
      tierlists: getRandomTierlists(MATCH_ROUNDS),
      currentRound: 0,
      submissions: [],
      status: 'active',
      timer: null,
    };
    this.matches.set(matchId, match);

    this.io.to(matchId).emit('match_started', {
      matchId,
      players: players.map(p => ({ userId: p.userId, username: p.username })),
      totalRounds: MATCH_ROUNDS,
    });

    setTimeout(() => this._startRound(matchId), PRE_ROUND_DELAY_MS);
  }

  _startRound(matchId) {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'active') return;

    const idx = match.currentRound;
    if (idx >= MATCH_ROUNDS) { this._endMatch(matchId); return; }

    const tierlist = match.tierlists[idx];
    match.submissions[idx] = new Map(); // userId → placements object

    this.io.to(matchId).emit('round_started', {
      roundNumber: idx + 1,
      totalRounds: MATCH_ROUNDS,
      tierlist: { id: tierlist.id, title: tierlist.title, items: tierlist.items },
      duration: ROUND_DURATION_MS / 1000,
    });

    match.timer = setTimeout(() => this._endRound(matchId), ROUND_DURATION_MS + 500);
  }

  submitTierlist(socket, { placements } = {}) {
    const { id: userId } = socket.user;
    const matchId = socket._roomId;
    if (!matchId) return;
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'active') return;

    const idx  = match.currentRound;
    const subs = match.submissions[idx];
    if (!subs || subs.has(String(userId))) return;

    subs.set(String(userId), placements || {});
    socket.emit('submission_confirmed');
    this.io.to(matchId).emit('player_submitted', { userId });

    if (subs.size >= match.players.length) {
      clearTimeout(match.timer);
      this._endRound(matchId);
    }
  }

  _endRound(matchId) {
    const match = this.matches.get(matchId);
    if (!match) return;

    const idx      = match.currentRound;
    const tierlist = match.tierlists[idx];
    const subs     = match.submissions[idx] || new Map();

    // Score: per item, if ≥2 players chose same tier → each gets +1
    const roundPoints = {};
    match.players.forEach(p => { roundPoints[String(p.userId)] = 0; });

    tierlist.items.forEach(item => {
      const groups = {}; // tier → [userIds]
      subs.forEach((placements, uid) => {
        const tier = placements[item];
        if (tier) { if (!groups[tier]) groups[tier] = []; groups[tier].push(uid); }
      });
      Object.values(groups).forEach(uids => {
        if (uids.length >= 2) uids.forEach(uid => { if (roundPoints[uid] !== undefined) roundPoints[uid]++; });
      });
    });

    match.players.forEach(p => { p.points += roundPoints[String(p.userId)] || 0; });

    // Build reveal data
    const allPlacements = {};
    subs.forEach((placements, uid) => {
      const p = match.players.find(mp => String(mp.userId) === uid);
      if (p) allPlacements[p.username] = placements;
    });

    this.io.to(matchId).emit('round_ended', {
      roundNumber: idx + 1,
      scores: match.players.map(p => ({
        userId: p.userId, username: p.username,
        roundPoints: roundPoints[String(p.userId)] || 0,
        totalPoints: p.points,
      })),
      allPlacements,
      items: tierlist.items,
    });

    match.currentRound++;
    const delay = match.currentRound < MATCH_ROUNDS ? POST_ROUND_DELAY_MS : POST_ROUND_DELAY_MS;
    setTimeout(() => {
      if (match.currentRound < MATCH_ROUNDS) this._startRound(matchId);
      else this._endMatch(matchId);
    }, delay);
  }

  _endMatch(matchId) {
    const match = this.matches.get(matchId);
    if (!match) return;
    match.status = 'finished';
    clearTimeout(match.timer);

    const sorted = [...match.players].sort((a, b) => b.points - a.points);
    const winner = sorted[0];

    this.io.to(matchId).emit('match_ended', {
      winner: { userId: winner.userId, username: winner.username, points: winner.points },
      scores: sorted.map(p => ({ userId: p.userId, username: p.username, points: p.points })),
    });

    // Persist stats async (fire and forget)
    match.players.forEach(p => {
      const won = p.userId === winner.userId ? 1 : 0;
      db.updateStats(p.userId, won, 1 - won, MATCH_ROUNDS).catch(console.error);
    });

    const room = this.rooms.get(matchId);
    if (room?.isQueue) this.rooms.delete(matchId);
    else if (room) room.status = 'finished';
    this.matches.delete(matchId);
  }

  // ── HELPERS ───────────────────────────────────────────────────────

  _emitRoomUpdate(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.io.to(roomId).emit('room_updated', {
      players: room.players.map(p => ({ userId: p.userId, username: p.username })),
      hostId:  room.hostId,
      room:    this._safeRoom(room),
    });
  }

  _safeRoom(room) {
    return {
      id: room.id, name: room.name,
      maxPlayers: room.maxPlayers, hasPassword: !!room.password,
      hostId: room.hostId, status: room.status,
    };
  }
}

module.exports = { GameManager };
