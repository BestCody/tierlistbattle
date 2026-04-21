/* =====================================================================
   Tier List Battle — Frontend SPA
   ===================================================================== */

// ── State ─────────────────────────────────────────────────────────────
const S = {
  token: null,
  user: null,
  socket: null,
  googleEnabled: false,

  // game
  matchPlayers: [],
  placements: {},       // { item: tier }
  selectedItem: null,
  submittedItems: new Set(), // userIds who submitted this round
  timerInterval: null,
  timerEndsAt: null,

  // lobby / room
  roomId: null,
  roomHostId: null,
};

// ── Utilities ─────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const app = () => document.getElementById('app');

function toast(msg, type = 'info', ms = 3500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function avatarClass(i) {
  return `av-${i % 6}`;
}

function winRate(wins, losses) {
  const g = wins + losses;
  return g === 0 ? '—' : Math.round((wins / g) * 100) + '%';
}

// ── API ───────────────────────────────────────────────────────────────
const api = {
  async req(method, path, body) {
    const r = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  register: (u, p) => api.req('POST', '/auth/register', { username: u, password: p }),
  login:    (u, p) => api.req('POST', '/auth/login',    { username: u, password: p }),
  me:       ()     => api.req('GET',  '/me'),
  board:    ()     => api.req('GET',  '/leaderboard'),
};

// ── Socket ────────────────────────────────────────────────────────────
function connectSocket() {
  if (S.socket) { S.socket.disconnect(); S.socket = null; }

  S.socket = io({ auth: { token: S.token }, reconnectionAttempts: 5 });

  S.socket.on('connect_error', () => toast('Connection lost — retrying…', 'error'));

  // Queue
  S.socket.on('queue_update', ({ count, needed }) => {
    const el = document.getElementById('queue-count');
    if (el) el.innerHTML = `<span>${count}</span> / ${needed} players found`;
  });
  S.socket.on('queue_left', () => {});

  // Room
  S.socket.on('rooms_list', ({ rooms }) => renderRoomsList(rooms));
  S.socket.on('room_created', ({ room }) => {
    S.roomId = room.id; S.roomHostId = room.hostId;
    showLobby({ room, players: [{ userId: S.user.id, username: S.user.username }] });
  });
  S.socket.on('room_joined', ({ room }) => {
    S.roomId = room.id; S.roomHostId = room.hostId;
  });
  S.socket.on('room_updated', ({ players, hostId, room }) => {
    S.roomHostId = hostId;
    if (room) S.roomId = room.id;
    updateLobby(players, hostId, room);
  });
  S.socket.on('room_left', () => { S.roomId = null; });

  // Match
  S.socket.on('match_started',  showMatchStarting);
  S.socket.on('round_started',  showRound);
  S.socket.on('player_submitted', ({ userId }) => {
    S.submittedItems.add(String(userId));
    updateSubmittedDots();
  });
  S.socket.on('submission_confirmed', () => {
    const btn = document.getElementById('submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitted ✓'; }
  });
  S.socket.on('round_ended',  showRoundResults);
  S.socket.on('match_ended',  showMatchEnd);

  S.socket.on('error', ({ message }) => toast(message, 'error'));
}

// ── Auth ──────────────────────────────────────────────────────────────
async function doLogin(e) {
  e.preventDefault();
  const u = document.getElementById('l-username').value.trim();
  const p = document.getElementById('l-password').value;
  const err = document.getElementById('l-error');
  err.textContent = '';
  try {
    const { token, user } = await api.login(u, p);
    authSuccess(token, user);
  } catch (ex) { err.textContent = ex.message; }
}

async function doRegister(e) {
  e.preventDefault();
  const u = document.getElementById('r-username').value.trim();
  const p = document.getElementById('r-password').value;
  const p2 = document.getElementById('r-confirm').value;
  const err = document.getElementById('r-error');
  err.textContent = '';
  if (p !== p2) { err.textContent = 'Passwords do not match'; return; }
  try {
    const { token, user } = await api.register(u, p);
    authSuccess(token, user);
  } catch (ex) { err.textContent = ex.message; }
}

function authSuccess(token, user) {
  S.token = token; S.user = user;
  localStorage.setItem('tlb_token', token);
  connectSocket();
  showDashboard();
}

function logout() {
  localStorage.removeItem('tlb_token');
  if (S.socket) S.socket.disconnect();
  S.token = null; S.user = null; S.socket = null;
  showLogin();
}

// ── Views ─────────────────────────────────────────────────────────────

// NAV BAR
function navHTML() {
  return `
    <nav class="topnav">
      <div class="nav-logo">TIER<span>LIST</span> BATTLE</div>
      <div class="nav-user">
        <span class="nav-username">Playing as <strong>${S.user.username}</strong></span>
        <button class="btn btn-secondary" style="padding:6px 14px;font-size:13px" onclick="logout()">Log out</button>
      </div>
    </nav>`;
}

// LOGIN
function showLogin() {
  app().innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-card-logo">TIER LIST BATTLE</div>
        <h2>Sign In</h2>
        <form class="auth-fields" onsubmit="doLogin(event)">
          <div class="form-group">
            <label>Username</label>
            <input class="input" id="l-username" type="text" placeholder="your_username" autocomplete="username" required />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input class="input" id="l-password" type="password" placeholder="••••••" autocomplete="current-password" required />
          </div>
          <div class="form-error" id="l-error"></div>
          <button class="btn btn-primary btn-full" type="submit">Sign In</button>
          ${S.googleEnabled ? `
            <div class="divider"><span>or</span></div>
            <a href="/api/auth/google" class="btn btn-google btn-full">Sign in with Google</a>
          ` : ''}
        </form>
        <div class="auth-footer">
          No account? <a href="#" onclick="showSignup();return false">Create one</a>
        </div>
      </div>
    </div>`;
}

// SIGNUP
function showSignup() {
  app().innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-card-logo">TIER LIST BATTLE</div>
        <h2>Create Account</h2>
        <form class="auth-fields" onsubmit="doRegister(event)">
          <div class="form-group">
            <label>Username</label>
            <input class="input" id="r-username" type="text" placeholder="cool_gamer99" autocomplete="username" required />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input class="input" id="r-password" type="password" placeholder="min. 6 characters" autocomplete="new-password" required />
          </div>
          <div class="form-group">
            <label>Confirm Password</label>
            <input class="input" id="r-confirm" type="password" placeholder="repeat password" autocomplete="new-password" required />
          </div>
          <div class="form-error" id="r-error"></div>
          <button class="btn btn-primary btn-full" type="submit">Create Account</button>
          ${S.googleEnabled ? `
            <div class="divider"><span>or</span></div>
            <a href="/api/auth/google" class="btn btn-google btn-full">Sign up with Google</a>
          ` : ''}
        </form>
        <div class="auth-footer">
          Already have an account? <a href="#" onclick="showLogin();return false">Sign in</a>
        </div>
      </div>
    </div>`;
}

// DASHBOARD
async function showDashboard() {
  app().innerHTML = navHTML() + `
    <div class="dashboard-body screen">
      <p class="section-title">Your Stats</p>
      <div class="stats-grid" id="stats-grid">
        <div class="stat-card wins"><div class="stat-num" id="s-wins">—</div><div class="stat-label">Wins</div></div>
        <div class="stat-card losses"><div class="stat-num" id="s-losses">—</div><div class="stat-label">Losses</div></div>
        <div class="stat-card rounds"><div class="stat-num" id="s-rounds">—</div><div class="stat-label">Rounds Played</div></div>
        <div class="stat-card ratio"><div class="stat-num" id="s-ratio">—</div><div class="stat-label">Win Rate</div></div>
      </div>

      <p class="section-title">Top 5 Leaderboard</p>
      <div class="lb-table" id="lb-table">
        <div class="lb-head">
          <span>#</span><span>Player</span>
          <span style="text-align:center">W</span>
          <span style="text-align:center">L</span>
          <span style="text-align:center">Rounds</span>
        </div>
        <div id="lb-body"><div style="padding:20px;text-align:center;color:var(--text-3)">Loading…</div></div>
      </div>

      <div class="play-cta">
        <button class="btn btn-primary btn-xl" onclick="showPlay()">▶  PLAY</button>
      </div>
    </div>`;

  // Fetch stats + leaderboard in parallel
  try {
    const [me, board] = await Promise.all([api.me(), api.board()]);
    S.user = { ...S.user, ...me };
    document.getElementById('s-wins').textContent   = me.wins;
    document.getElementById('s-losses').textContent = me.losses;
    document.getElementById('s-rounds').textContent = me.rounds_played;
    document.getElementById('s-ratio').textContent  = winRate(me.wins, me.losses);

    document.getElementById('lb-body').innerHTML = board.leaderboard.map((p, i) => `
      <div class="lb-row">
        <span class="lb-rank ${['r1','r2','r3'][i] || ''}">${i + 1}</span>
        <span class="lb-name ${p.id === S.user.id ? 'me' : ''}">${p.username}</span>
        <span class="lb-num lb-wins">${p.wins}</span>
        <span class="lb-num lb-losses">${p.losses}</span>
        <span class="lb-num">${p.rounds_played}</span>
      </div>`).join('') || '<div style="padding:20px;text-align:center;color:var(--text-3)">No players yet</div>';
  } catch (ex) { toast('Could not load stats', 'error'); }
}

// PLAY MENU
function showPlay() {
  app().innerHTML = navHTML() + `
    <div class="play-screen screen">
      <h1 class="play-title">Choose Mode</h1>
      <p class="play-sub">How do you want to play?</p>
      <div class="play-options">
        <div class="play-option" onclick="showQueue()">
          <div class="play-icon">⚡</div>
          <div class="play-option-title">Quick Queue</div>
          <div class="play-option-desc">Jump into a random match with 3 players. No waiting around.</div>
        </div>
        <div class="play-option" onclick="showCreateRoom()">
          <div class="play-icon">🏠</div>
          <div class="play-option-title">Create Room</div>
          <div class="play-option-desc">Set up a private room with a password and invite your friends.</div>
        </div>
        <div class="play-option" onclick="showJoinRoom()">
          <div class="play-icon">🔍</div>
          <div class="play-option-title">Join Room</div>
          <div class="play-option-desc">Browse open rooms and jump into one of your friends' sessions.</div>
        </div>
      </div>
      <div style="margin-top:24px">
        <button class="btn btn-secondary" onclick="showDashboard()">← Back</button>
      </div>
    </div>`;
}

// QUICK QUEUE
function showQueue() {
  app().innerHTML = navHTML() + `
    <div class="queue-screen screen">
      <div class="queue-orb"><div class="queue-icon">🎮</div></div>
      <h2 class="queue-title">Finding a Match…</h2>
      <p class="queue-count" id="queue-count"><span>1</span> / 3 players found</p>
      <p style="font-size:13px;color:var(--text-3)">Waiting for other players to join</p>
      <button class="btn btn-secondary" onclick="cancelQueue()">Cancel</button>
    </div>`;
  S.socket.emit('join_queue');
}

function cancelQueue() {
  S.socket.emit('leave_queue');
  showPlay();
}

// CREATE ROOM
function showCreateRoom() {
  app().innerHTML = navHTML() + `
    <div style="display:flex;align-items:center;justify-content:center;flex:1;padding:24px;" class="screen">
      <div class="modal" style="position:relative">
        <h2 class="modal-title">🏠 Create Room</h2>
        <div class="modal-fields">
          <div class="form-group">
            <label>Room Name</label>
            <input class="input" id="cr-name" type="text" placeholder="${S.user.username}'s Room" maxlength="32" />
          </div>
          <div class="form-group">
            <label>Password <span style="color:var(--text-3);font-weight:400">(optional)</span></label>
            <input class="input" id="cr-pass" type="password" placeholder="Leave blank for open room" />
          </div>
          <div class="form-group">
            <label>Max Players</label>
            <select class="input" id="cr-max">
              <option value="2">2 players</option>
              <option value="3">3 players</option>
              <option value="4" selected>4 players</option>
              <option value="5">5 players</option>
              <option value="6">6 players</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="showPlay()">Cancel</button>
          <button class="btn btn-primary" style="flex:1" onclick="createRoom()">Create Room</button>
        </div>
      </div>
    </div>`;
}

function createRoom() {
  const name = document.getElementById('cr-name').value.trim() || `${S.user.username}'s Room`;
  const password = document.getElementById('cr-pass').value;
  const maxPlayers = document.getElementById('cr-max').value;
  S.socket.emit('create_room', { name, password, maxPlayers });
}

// JOIN ROOM
function showJoinRoom() {
  app().innerHTML = navHTML() + `
    <div style="display:flex;align-items:center;justify-content:center;flex:1;padding:24px;" class="screen">
      <div style="width:100%;max-width:560px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <h2 style="font-family:var(--font-h);font-size:26px;font-weight:700">🔍 Join a Room</h2>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary" style="font-size:13px;padding:7px 14px" onclick="S.socket.emit('get_rooms')">↻ Refresh</button>
            <button class="btn btn-secondary" style="font-size:13px;padding:7px 14px" onclick="showPlay()">← Back</button>
          </div>
        </div>
        <div class="rooms-list" id="rooms-list">
          <div class="empty-msg">Loading rooms…</div>
        </div>
      </div>
    </div>`;
  S.socket.emit('get_rooms');
}

function renderRoomsList(rooms) {
  const el = document.getElementById('rooms-list');
  if (!el) return;
  if (!rooms.length) { el.innerHTML = '<div class="empty-msg">No open rooms right now. Create one!</div>'; return; }
  el.innerHTML = rooms.map(r => `
    <div class="room-item" onclick="tryJoinRoom('${r.id}', ${r.hasPassword})">
      <div>
        <div class="room-name">${r.name}</div>
        <div class="room-meta">${r.players} / ${r.maxPlayers} players</div>
      </div>
      <div class="room-join">
        ${r.hasPassword ? '<span class="lock-icon">🔒</span>' : ''}
        <button class="btn btn-primary" style="font-size:13px;padding:7px 16px">Join</button>
      </div>
    </div>`).join('');
}

function tryJoinRoom(roomId, hasPassword) {
  if (hasPassword) {
    const pw = prompt('Enter room password:');
    if (pw === null) return;
    S.socket.emit('join_room', { roomId, password: pw });
  } else {
    S.socket.emit('join_room', { roomId, password: '' });
  }
}

// LOBBY
function showLobby({ room, players }) {
  S.roomId = room.id;
  app().innerHTML = navHTML() + `
    <div class="lobby-screen screen">
      <div class="lobby-card">
        <div class="lobby-room-name">${room.name}</div>
        <div class="lobby-capacity" id="lobby-cap">
          ${players.length} / ${room.maxPlayers} players
          ${room.hasPassword ? ' · 🔒 Password protected' : ''}
        </div>
        <div class="player-list" id="lobby-players"></div>
        <div id="lobby-hint" class="lobby-hint"></div>
        <div class="lobby-actions" id="lobby-actions"></div>
      </div>
    </div>`;
  updateLobby(players, room.hostId, room);
}

function updateLobby(players, hostId, room) {
  const listEl = document.getElementById('lobby-players');
  const actEl  = document.getElementById('lobby-actions');
  const hintEl = document.getElementById('lobby-hint');
  const capEl  = document.getElementById('lobby-cap');
  if (!listEl) return;

  S.roomHostId = hostId;
  const isHost = S.user.id === hostId;

  if (capEl && room) capEl.textContent = `${players.length} / ${room.maxPlayers} players${room.hasPassword ? ' · 🔒 Password protected' : ''}`;

  listEl.innerHTML = players.map((p, i) => `
    <div class="player-item">
      <div class="player-avatar ${avatarClass(i)}">${initials(p.username)}</div>
      <span class="player-item-name">${p.username}${p.userId === S.user.id ? ' (you)' : ''}</span>
      ${p.userId === hostId ? '<span class="host-badge">HOST</span>' : ''}
    </div>`).join('');

  if (hintEl) hintEl.textContent = isHost
    ? players.length < 2 ? 'Waiting for at least 1 more player…' : 'Ready! Start whenever.'
    : 'Waiting for the host to start…';

  if (actEl) actEl.innerHTML = `
    ${isHost ? `<button class="btn btn-primary btn-lg" onclick="startMatch()" ${players.length < 2 ? 'disabled' : ''}>▶ Start Game</button>` : ''}
    <button class="btn btn-danger" onclick="leaveRoom()">Leave Room</button>`;
}

function startMatch() { S.socket.emit('start_match'); }
function leaveRoom() {
  S.socket.emit('leave_room');
  S.roomId = null;
  showPlay();
}

// ── GAME FLOW ─────────────────────────────────────────────────────────

function showMatchStarting({ players, totalRounds }) {
  S.matchPlayers = players;

  // Show overlay
  const overlay = document.createElement('div');
  overlay.className = 'match-starting';
  overlay.innerHTML = `
    <div class="match-starting-title">MATCH FOUND</div>
    <div class="match-players-list">
      ${players.map(p => `<div class="match-player-chip">${p.username}</div>`).join('')}
    </div>
    <p style="color:var(--text-2);font-size:14px">${totalRounds} rounds · 30 seconds each</p>
    <div class="match-countdown" id="match-cd">3</div>`;
  document.body.appendChild(overlay);

  let n = 3;
  const iv = setInterval(() => {
    n--;
    const el = document.getElementById('match-cd');
    if (el) el.textContent = n > 0 ? n : 'GO!';
    if (n <= -1) { clearInterval(iv); overlay.remove(); }
  }, 1000);
}

function showRound({ roundNumber, totalRounds, tierlist, duration }) {
  S.placements = {};
  S.selectedItem = null;
  S.submittedItems = new Set();
  clearInterval(S.timerInterval);
  S.timerEndsAt = Date.now() + duration * 1000;

  const TIERS = ['S', 'A', 'B', 'C', 'D', 'F'];

  app().innerHTML = `
    <div class="game-screen">
      <div class="game-header">
        <span class="game-round">Round ${roundNumber} / ${totalRounds}</span>
        <span class="game-tl-title">"${tierlist.title}"</span>
        <div class="timer-wrap">
          <div class="timer-num" id="timer-num">${duration}</div>
          <div class="timer-bar"><div class="timer-fill" id="timer-fill" style="width:100%"></div></div>
        </div>
      </div>

      <div class="player-submitted-row" id="submitted-row">
        ${S.matchPlayers.map(p => `
          <span class="sub-dot" id="sub-${p.userId}" data-uid="${p.userId}">${p.username}</span>
        `).join('')}
      </div>

      <div class="game-body">
        <div class="tier-list">
          ${TIERS.map(t => `
            <div class="tier-row" data-tier="${t}" onclick="placeItemInTier('${t}')">
              <div class="tier-label tier-${t}">${t}</div>
              <div class="tier-zone" id="zone-${t}"></div>
            </div>`).join('')}
        </div>

        <div class="item-pool-wrap">
          <div class="pool-label">Unranked — click an item, then click a tier row to place it</div>
          <div class="item-pool" id="item-pool">
            ${tierlist.items.map(item => `
              <div class="item-card" data-item="${item}" onclick="selectItem('${item}')">${item}</div>
            `).join('')}
          </div>
        </div>

        <div class="game-footer">
          <span class="game-hint" id="game-hint">Click an item to select it</span>
          <button class="btn btn-primary" id="submit-btn" onclick="submitPlacements()">Submit</button>
        </div>
      </div>
    </div>`;

  startTimer(duration);
}

function selectItem(item) {
  // Find where item currently lives
  const allCards = document.querySelectorAll(`.item-card[data-item="${item}"]`);
  if (!allCards.length) return;

  // If already selected → deselect
  if (S.selectedItem === item) {
    S.selectedItem = null;
    allCards.forEach(c => c.classList.remove('selected'));
    const hint = document.getElementById('game-hint');
    if (hint) hint.textContent = 'Click an item to select it';
    return;
  }

  // Deselect previous
  document.querySelectorAll('.item-card.selected').forEach(c => c.classList.remove('selected'));
  S.selectedItem = item;
  allCards.forEach(c => c.classList.add('selected'));

  const hint = document.getElementById('game-hint');
  if (hint) hint.textContent = `"${item}" selected — click a tier row to place it`;
}

function placeItemInTier(tier) {
  if (!S.selectedItem) return;
  const item = S.selectedItem;

  // Remove from old tier if placed
  if (S.placements[item]) {
    const oldZone = document.getElementById('zone-' + S.placements[item]);
    if (oldZone) {
      const old = oldZone.querySelector(`[data-item="${item}"]`);
      if (old) old.remove();
    }
  }

  // Remove from pool if there
  const pool = document.getElementById('item-pool');
  if (pool) {
    const inPool = pool.querySelector(`[data-item="${item}"]`);
    if (inPool) inPool.remove();
  }

  // Place in tier
  S.placements[item] = tier;
  const zone = document.getElementById('zone-' + tier);
  if (zone) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.dataset.item = item;
    card.textContent = item;
    card.onclick = () => selectItem(item);
    zone.appendChild(card);
  }

  // Clear selection
  S.selectedItem = null;
  document.querySelectorAll('.item-card.selected').forEach(c => c.classList.remove('selected'));
  const hint = document.getElementById('game-hint');
  if (hint) hint.textContent = 'Click an item to select it';
}

function submitPlacements() {
  S.socket.emit('submit_tierlist', { placements: S.placements });
}

function updateSubmittedDots() {
  S.submittedItems.forEach(uid => {
    const el = document.getElementById('sub-' + uid);
    if (el) el.classList.add('done');
  });
}

function startTimer(duration) {
  const numEl  = () => document.getElementById('timer-num');
  const fillEl = () => document.getElementById('timer-fill');

  clearInterval(S.timerInterval);
  S.timerInterval = setInterval(() => {
    const left = Math.max(0, Math.ceil((S.timerEndsAt - Date.now()) / 1000));
    const pct  = (left / duration) * 100;
    const n = numEl(); const f = fillEl();
    if (n) {
      n.textContent = left;
      n.classList.toggle('urgent', left <= 10);
    }
    if (f) {
      f.style.width = pct + '%';
      f.classList.toggle('urgent', left <= 10);
    }
    if (left <= 0) {
      clearInterval(S.timerInterval);
      submitPlacements(); // auto-submit when time runs out
    }
  }, 500);
}

// ── RESULTS ───────────────────────────────────────────────────────────

function showRoundResults({ roundNumber, scores, allPlacements, items }) {
  clearInterval(S.timerInterval);

  // Build per-item agreement data
  const itemAgreements = items.map(item => {
    const tierCounts = {};
    Object.values(allPlacements).forEach(pl => {
      const t = pl[item];
      if (t) { tierCounts[t] = (tierCounts[t] || []); tierCounts[t].push(t); }
    });
    const placements = {};
    Object.entries(allPlacements).forEach(([uname, pl]) => {
      if (pl[item]) placements[uname] = pl[item];
    });
    const allTiers = Object.values(placements);
    const agreed = allTiers.length >= 2 && allTiers.some(t => allTiers.filter(x => x === t).length >= 2);
    return { item, placements, agreed };
  });

  const isLast = roundNumber >= 5;

  app().innerHTML = navHTML() + `
    <div class="results-screen screen">
      <h2 class="results-title">Round ${roundNumber} Results</h2>

      <div style="display:flex;flex-direction:column;gap:8px;width:100%;max-width:600px">
        ${scores.sort((a,b)=>b.roundPoints-a.roundPoints).map((s,i) => `
          <div class="score-row">
            <span class="score-name">${i===0?'🥇 ':''}${s.username}${s.userId===S.user.id?' (you)':''}</span>
            <div style="display:flex;align-items:baseline;gap:6px">
              <span class="score-pts">${s.totalPoints}</span>
              <span class="score-round">+${s.roundPoints} this round</span>
            </div>
          </div>`).join('')}
      </div>

      <h3 class="agreement-title">What everyone ranked</h3>
      <div class="agreement-grid">
        ${itemAgreements.map(({ item, placements, agreed }) => `
          <div class="ag-item ${agreed ? 'ag-agreed' : ''}">
            <div class="ag-item-name">${item}</div>
            ${agreed ? '<div class="agreed-badge">+1 agreement</div>' : ''}
            <div class="ag-tiers">
              ${Object.entries(placements).map(([uname, tier]) => `
                <span class="ag-tier-chip tier-chip-${tier}">${tier} ${uname}</span>
              `).join('')}
            </div>
          </div>`).join('')}
      </div>

      <p class="next-round-bar">
        ${isLast ? 'Calculating final results…' : 'Next round starting in a few seconds…'}
      </p>
    </div>`;
}

function showMatchEnd({ winner, scores }) {
  clearInterval(S.timerInterval);
  const iWon = winner.userId === S.user.id;

  app().innerHTML = navHTML() + `
    <div class="match-end-screen screen">
      <div class="winner-crown">🏆</div>
      <div>
        <div class="winner-label">${iWon ? 'You won!' : 'Winner'}</div>
        <div class="winner-name">${winner.username}</div>
        <div class="winner-pts">${winner.points} points</div>
      </div>

      <div class="final-scores">
        ${scores.map((p, i) => `
          <div class="final-row ${p.userId === S.user.id ? 'you' : ''}">
            <div>
              <div class="final-name">${p.username}${p.userId === S.user.id ? ' (you)' : ''}</div>
              <div class="final-rank">${['🥇','🥈','🥉'][i] || '#'+(i+1)}</div>
            </div>
            <div class="final-points">${p.points} pts</div>
          </div>`).join('')}
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
        <button class="btn btn-primary btn-lg" onclick="showPlay()">Play Again</button>
        <button class="btn btn-secondary btn-lg" onclick="showDashboard()">Dashboard</button>
      </div>
    </div>`;
}

// ── INIT ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Check for Google OAuth token redirect
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  const authError = params.get('auth_error');
  if (urlToken || authError) window.history.replaceState({}, '', '/');

  if (authError) toast(authError, 'error');

  // Load config
  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    S.googleEnabled = cfg.googleEnabled;
  } catch {}

  // Restore session
  const stored = urlToken || localStorage.getItem('tlb_token');
  if (stored) {
    S.token = stored;
    if (urlToken) localStorage.setItem('tlb_token', stored);
    try {
      const me = await api.me();
      S.user = me;
      connectSocket();
      showDashboard();
      return;
    } catch {
      localStorage.removeItem('tlb_token');
      S.token = null;
    }
  }

  showLogin();
});
