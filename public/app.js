/* =============================================================
   Tier List Battle — Frontend SPA
   ============================================================= */

const S = {
  token:null, user:null, socket:null, googleEnabled:false,
  currentPage:'dashboard',
  // game
  matchPlayers:[], placements:{}, selectedItem:null,
  submittedItems:new Set(), timerInterval:null, timerEndsAt:null,
  roomId:null, roomHostId:null,
  // voting
  myVote:null, voteOptions:[], voteCounts:{},
  voteTimerInterval:null, voteEndsAt:null,
};

const $app = () => document.getElementById('app');

function toast(msg, type='info', ms=3500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function initials(n){ return (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
function avClass(i){ return `av-${i%6}`; }
function winRate(w,l){ const g=w+l; return g===0?'—':Math.round(w/g*100)+'%'; }

// ── API ──────────────────────────────────────────────────────────────
const api = {
  async req(method, path, body) {
    const r = await fetch('/api'+path, {
      method,
      headers:{'Content-Type':'application/json',...(S.token?{Authorization:'Bearer '+S.token}:{})},
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error||'Request failed');
    return d;
  },
  register:(u,p)=>api.req('POST','/auth/register',{username:u,password:p}),
  login:   (u,p)=>api.req('POST','/auth/login',   {username:u,password:p}),
  me:      ()   =>api.req('GET', '/me'),
  board:   ()   =>api.req('GET', '/leaderboard'),
  myLists: ()   =>api.req('GET', '/tierlists/mine'),
  createList:(title,items)=>api.req('POST','/tierlists',{title,items}),
  deleteList:(id)         =>api.req('DELETE',`/tierlists/${id}`),
};

// ── Socket ───────────────────────────────────────────────────────────
function connectSocket() {
  if (S.socket) { S.socket.disconnect(); S.socket=null; }
  S.socket = io({ auth:{ token:S.token }, reconnectionAttempts:5 });
  S.socket.on('connect_error', ()=>toast('Connection lost — retrying…','error'));

  S.socket.on('queue_update', ({count,needed})=>{
    const el=document.getElementById('queue-count');
    if (el) el.innerHTML=`<span>${count}</span> / ${needed} players found`;
  });

  S.socket.on('rooms_list',   ({rooms})          => renderRoomsList(rooms));
  S.socket.on('room_created', ({room})            => { S.roomId=room.id; S.roomHostId=room.hostId; showLobby({room,players:[{userId:S.user.id,username:S.user.username}]}); });
  S.socket.on('room_joined',  ({room})            => { S.roomId=room.id; S.roomHostId=room.hostId; });
  S.socket.on('room_updated', ({players,hostId,room}) => { S.roomHostId=hostId; if(room) S.roomId=room.id; updateLobby(players,hostId,room); });
  S.socket.on('room_left',    ()                  => { S.roomId=null; });

  S.socket.on('match_started',     showMatchStarting);
  S.socket.on('voting_started',    showVotingScreen);
  S.socket.on('vote_update',       updateVoteCounts);
  S.socket.on('voting_ended',      showVotingResult);
  S.socket.on('round_started',     showRound);
  S.socket.on('player_submitted',  ({userId})=>{ S.submittedItems.add(String(userId)); updateSubmittedDots(); });
  S.socket.on('submission_confirmed', ()=>{ const b=document.getElementById('submit-btn'); if(b){b.disabled=true;b.textContent='Submitted ✓';} });
  S.socket.on('round_ended',  showRoundResults);
  S.socket.on('match_ended',  showMatchEnd);
  S.socket.on('error', ({message})=>toast(message,'error'));
}

// ── AUTH ─────────────────────────────────────────────────────────────
async function doLogin(e) {
  e.preventDefault();
  const u=document.getElementById('l-username').value.trim();
  const p=document.getElementById('l-password').value;
  const err=document.getElementById('l-error'); err.textContent='';
  try { const {token,user}=await api.login(u,p); authSuccess(token,user); }
  catch(ex){ err.textContent=ex.message; }
}
async function doRegister(e) {
  e.preventDefault();
  const u=document.getElementById('r-username').value.trim();
  const p=document.getElementById('r-password').value;
  const p2=document.getElementById('r-confirm').value;
  const err=document.getElementById('r-error'); err.textContent='';
  if(p!==p2){ err.textContent='Passwords do not match'; return; }
  try { const {token,user}=await api.register(u,p); authSuccess(token,user); }
  catch(ex){ err.textContent=ex.message; }
}
function authSuccess(token,user) {
  S.token=token; S.user=user;
  localStorage.setItem('tlb_token',token);
  connectSocket();
  showAppShell('dashboard');
}
function logout() {
  localStorage.removeItem('tlb_token');
  if(S.socket) S.socket.disconnect();
  S.token=null; S.user=null; S.socket=null;
  showLogin();
}

// ── APP SHELL (sidebar layout) ────────────────────────────────────────
function showAppShell(page) {
  S.currentPage = page;
  $app().innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">TIER LIST<br>BATTLE</div>
        <div style="flex:1;overflow-y:auto;padding:12px 0">
          <div class="sidebar-section">Menu</div>
          <nav class="sidebar-nav">
            <button class="sidebar-item ${page==='dashboard'?'active':''}" onclick="switchPage('dashboard')">
              <span class="sidebar-icon">🏠</span> Dashboard
            </button>
            <button class="sidebar-item ${page==='make'?'active':''}" onclick="switchPage('make')">
              <span class="sidebar-icon">✏️</span> Make Tier List
            </button>
          </nav>
          <div class="sidebar-section" style="margin-top:12px">Play</div>
          <nav class="sidebar-nav">
            <button class="sidebar-item" onclick="showPlay()">
              <span class="sidebar-icon">▶</span> Play Now
            </button>
          </nav>
        </div>
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <strong>${S.user.username}</strong>
            Signed in
          </div>
          <button class="sidebar-item" onclick="logout()" style="color:var(--danger);width:100%">
            <span class="sidebar-icon">↩</span> Log out
          </button>
        </div>
      </aside>
      <div class="main-content" id="main-content">
        <div id="page-area"></div>
      </div>
    </div>`;
  loadPage(page);
}

function switchPage(page) {
  S.currentPage = page;
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  const activeBtn = [...document.querySelectorAll('.sidebar-item')].find(b => b.textContent.trim().toLowerCase().startsWith(page==='dashboard'?'dashboard':'make'));
  if (activeBtn) activeBtn.classList.add('active');
  loadPage(page);
}

function loadPage(page) {
  if (page === 'dashboard') renderDashboard();
  else if (page === 'make') renderMakeTierlist();
}

// ── DASHBOARD ────────────────────────────────────────────────────────
async function renderDashboard() {
  const el = document.getElementById('page-area');
  if (!el) return;
  el.innerHTML = `<div class="page-body screen">
    <div class="page-header"><div class="page-title">Dashboard</div><div class="page-sub">Welcome back, ${S.user.username}!</div></div>
    <p class="section-label">Your Stats</p>
    <div class="stats-grid">
      <div class="stat-card wins"><div class="stat-accent">🏆</div><div class="stat-num" id="s-wins">—</div><div class="stat-label">Wins</div></div>
      <div class="stat-card losses"><div class="stat-accent">💀</div><div class="stat-num" id="s-losses">—</div><div class="stat-label">Losses</div></div>
      
      <div class="stat-card ratio"><div class="stat-accent">📈</div><div class="stat-num" id="s-ratio">—</div><div class="stat-label">Win Rate</div></div>
    </div>
    <p class="section-label">Top 5 Leaderboard</p>
    <div class="lb-card">
      <div class="lb-head"><span></span><span>Player</span><span style="text-align:center">W</span><span style="text-align:center">L</span></div>
      <div id="lb-body"><div style="padding:20px;text-align:center;color:var(--text-3)">Loading…</div></div>
    </div>
    <div class="play-cta"><button class="btn btn-primary btn-xl" onclick="showPlay()">▶  PLAY</button></div>
  </div>`;

  try {
    const [me,board] = await Promise.all([api.me(), api.board()]);
    S.user = {...S.user,...me};
    document.getElementById('s-wins').textContent   = me.wins;
    document.getElementById('s-losses').textContent = me.losses;
    document.getElementById('s-rounds').textContent = me.rounds_played;
    document.getElementById('s-ratio').textContent  = winRate(me.wins, me.losses);
    document.getElementById('lb-body').innerHTML = board.leaderboard.map((p,i)=>`
      <div class="lb-row ${['rank-1','rank-2','rank-3'][i]||''}">
        <div class="lb-rank-wrap"><span class="lb-rank">${['🥇','🥈','🥉'][i]||i+1}</span></div>
        <span class="lb-name ${p.id===S.user.id?'me':''}">${p.username}</span>
        <span class="lb-num lb-wins">${p.wins}</span>
        <span class="lb-num lb-losses">${p.losses}</span>
      </div>`).join('') || '<div style="padding:20px;text-align:center;color:var(--text-3)">No players yet</div>';
  } catch { toast('Could not load stats','error'); }
}

// ── MAKE TIER LIST ────────────────────────────────────────────────────
let tlItems = [];

async function renderMakeTierlist() {
  tlItems = ['',''];
  const el = document.getElementById('page-area');
  if (!el) return;

  el.innerHTML = `<div class="make-tl-page screen">
    <div class="page-title">✏️ Make Tier List</div>
    <div class="page-sub">Create a custom tier list that can appear in matches for everyone to rank.</div>

    <div class="tl-form-card">
      <div class="tl-name-row form-group">
        <label>Tier List Name</label>
        <input class="input" id="tl-title" type="text" placeholder="e.g. Best Zelda Games, Pizza Toppings…" maxlength="60" />
      </div>

      <div class="form-group">
        <label>Options <span style="color:var(--text-3);font-weight:400">(min 4, max 12)</span></label>
        <div class="items-area" id="items-area"></div>
        <div class="add-option-row">
          <button class="add-option-btn" onclick="addItem()">+ Add Option</button>
        </div>
        <div class="tl-hint" id="tl-hint"></div>
      </div>

      <div class="tl-actions">
        <button class="btn btn-primary btn-lg" onclick="completeTierlist()">✓ Complete Tier List</button>
        <button class="btn btn-secondary" onclick="resetForm()">Clear</button>
      </div>
      <div id="tl-error" class="form-error" style="margin-top:10px"></div>
    </div>

    <div class="my-lists-section">
      <p class="section-label">My Tier Lists</p>
      <div id="my-lists-area"><div style="color:var(--text-3);font-size:14px;padding:10px 0">Loading…</div></div>
    </div>
  </div>`;

  renderItemInputs();
  loadMyLists();
}

function renderItemInputs() {
  const area = document.getElementById('items-area');
  if (!area) return;
  area.innerHTML = tlItems.map((val, i) => `
    <div class="item-entry-row">
      <span class="item-num">${i+1}.</span>
      <input class="input" type="text" placeholder="Option ${i+1}"
        value="${val.replace(/"/g,'&quot;')}"
        oninput="tlItems[${i}]=this.value"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); addItem(); }"
        id="item-input-${i}" />
      ${tlItems.length > 2 ? `<button class="remove-item-btn" onclick="removeItem(${i})" title="Remove">×</button>` : '<span style="width:26px"></span>'}
    </div>`).join('');
  // Focus last input
  const last = document.getElementById(`item-input-${tlItems.length-1}`);
  if (last && document.activeElement !== last) {
    // only focus if new item was just added
  }
  updateHint();
}

function addItem() {
  if (tlItems.length >= 12) { toast('Maximum 12 options allowed','error'); return; }
  tlItems.push('');
  renderItemInputs();
  // Focus the new input
  setTimeout(() => {
    const el = document.getElementById(`item-input-${tlItems.length-1}`);
    if (el) el.focus();
  }, 50);
}

function removeItem(i) {
  if (tlItems.length <= 2) return;
  tlItems.splice(i, 1);
  renderItemInputs();
}

function updateHint() {
  const el = document.getElementById('tl-hint');
  if (!el) return;
  const n = tlItems.filter(s=>s.trim()).length;
  if (n < 4) el.textContent = `Add at least ${4-n} more option${4-n===1?'':'s'} to complete`;
  else el.textContent = `${n} option${n===1?'':'s'} — looking good!`;
}

function resetForm() {
  tlItems = ['',''];
  const title = document.getElementById('tl-title');
  if (title) title.value = '';
  const err = document.getElementById('tl-error');
  if (err) err.textContent = '';
  renderItemInputs();
}

async function completeTierlist() {
  const titleEl = document.getElementById('tl-title');
  const errEl   = document.getElementById('tl-error');
  errEl.textContent = '';

  // Sync tlItems from DOM inputs just in case
  document.querySelectorAll('#items-area input').forEach((inp, i) => { tlItems[i] = inp.value; });

  const title = titleEl.value.trim();
  const items = tlItems.map(s=>s.trim()).filter(Boolean);

  if (!title)        { errEl.textContent = 'Give your tier list a name first'; titleEl.focus(); return; }
  if (items.length < 4) { errEl.textContent = `You need at least 4 options (you have ${items.length})`; return; }

  const btn = document.querySelector('.tl-actions .btn-primary');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    await api.createList(title, items);
    toast('Tier list created! 🎉','success');
    resetForm();
    loadMyLists();
  } catch(ex) {
    errEl.textContent = ex.message;
  } finally {
    btn.disabled = false; btn.textContent = '✓ Complete Tier List';
  }
}

async function loadMyLists() {
  const el = document.getElementById('my-lists-area');
  if (!el) return;
  try {
    const { tierlists } = await api.myLists();
    if (!tierlists.length) {
      el.innerHTML = '<div style="color:var(--text-3);font-size:14px;padding:10px 0">You haven\'t made any tier lists yet. Create one above!</div>';
      return;
    }
    el.innerHTML = tierlists.map(tl => `
      <div class="my-list-item">
        <div style="flex:1;min-width:0">
          <div class="my-list-title">${tl.title}</div>
          <div class="my-list-items">${tl.items.join(' · ')}</div>
          <div class="my-list-count">${tl.items.length} options · Created by you</div>
        </div>
        <button class="btn btn-danger" style="font-size:12px;padding:6px 12px;flex-shrink:0"
          onclick="deleteList('${tl._id}', this)">Delete</button>
      </div>`).join('');
  } catch { el.innerHTML = '<div style="color:var(--text-3);font-size:14px">Could not load your tier lists.</div>'; }
}

async function deleteList(id, btn) {
  if (!confirm('Delete this tier list?')) return;
  btn.disabled = true;
  try {
    await api.deleteList(id);
    toast('Deleted','info');
    loadMyLists();
  } catch(ex) { toast(ex.message,'error'); btn.disabled=false; }
}

// ── PLAY MENU (full screen, no sidebar) ──────────────────────────────
function showPlay() {
  $app().innerHTML = `
    <div class="play-screen screen" style="min-height:100vh;background:var(--bg)">
      <h1 class="play-title">Choose Mode</h1>
      <p class="play-sub">How do you want to play?</p>
      <div class="play-options">
        <div class="play-option" onclick="showQueue()">
          <div class="play-icon">⚡</div>
          <div class="play-option-title">Quick Queue</div>
          <div class="play-option-desc">Matchmake with 3 players automatically.</div>
        </div>
        <div class="play-option" onclick="showCreateRoom()">
          <div class="play-icon">🏠</div>
          <div class="play-option-title">Create Room</div>
          <div class="play-option-desc">Set up a private room and invite friends.</div>
        </div>
        <div class="play-option" onclick="showJoinRoom()">
          <div class="play-icon">🔍</div>
          <div class="play-option-title">Join Room</div>
          <div class="play-option-desc">Browse open rooms and jump in.</div>
        </div>
      </div>
      <div style="margin-top:28px">
        <button class="btn btn-secondary" onclick="showAppShell('dashboard')">← Back</button>
      </div>
    </div>`;
}

function navHTML() {
  return `<nav class="topnav">
    <div class="nav-logo">TIER<span>LIST</span> BATTLE</div>
    <div class="nav-user">
      <span class="nav-username">Playing as <strong>${S.user.username}</strong></span>
      <button class="btn btn-secondary" style="padding:6px 14px;font-size:13px" onclick="showAppShell('dashboard')">Dashboard</button>
    </div>
  </nav>`;
}

// ── AUTH VIEWS ────────────────────────────────────────────────────────
function showLogin() {
  $app().innerHTML=`<div class="auth-screen">
    <div class="auth-card">
      <div class="auth-card-logo">TIER LIST BATTLE</div>
      <h2>Sign In</h2>
      <form class="auth-fields" onsubmit="doLogin(event)">
        <div class="form-group"><label>Username</label><input class="input" id="l-username" type="text" placeholder="your_username" autocomplete="username" required/></div>
        <div class="form-group"><label>Password</label><input class="input" id="l-password" type="password" placeholder="••••••" autocomplete="current-password" required/></div>
        <div class="form-error" id="l-error"></div>
        <button class="btn btn-primary btn-full" type="submit">Sign In</button>
        ${S.googleEnabled?`<div class="divider"><span>or</span></div><a href="/api/auth/google" class="btn btn-google btn-full">Sign in with Google</a>`:''}
      </form>
      <div class="auth-footer">No account? <a href="#" onclick="showSignup();return false">Create one</a></div>
    </div>
  </div>`;
}

function showSignup() {
  $app().innerHTML=`<div class="auth-screen">
    <div class="auth-card">
      <div class="auth-card-logo">TIER LIST BATTLE</div>
      <h2>Create Account</h2>
      <form class="auth-fields" onsubmit="doRegister(event)">
        <div class="form-group"><label>Username</label><input class="input" id="r-username" type="text" placeholder="cool_gamer99" autocomplete="username" required/></div>
        <div class="form-group"><label>Password</label><input class="input" id="r-password" type="password" placeholder="min. 6 characters" autocomplete="new-password" required/></div>
        <div class="form-group"><label>Confirm Password</label><input class="input" id="r-confirm" type="password" placeholder="repeat password" autocomplete="new-password" required/></div>
        <div class="form-error" id="r-error"></div>
        <button class="btn btn-primary btn-full" type="submit">Create Account</button>
        ${S.googleEnabled?`<div class="divider"><span>or</span></div><a href="/api/auth/google" class="btn btn-google btn-full">Sign up with Google</a>`:''}
      </form>
      <div class="auth-footer">Already have an account? <a href="#" onclick="showLogin();return false">Sign in</a></div>
    </div>
  </div>`;
}

// ── QUEUE ─────────────────────────────────────────────────────────────
function showQueue() {
  $app().innerHTML = navHTML() + `<div class="queue-screen screen">
    <div class="queue-orb"><div class="queue-icon">🎮</div></div>
    <h2 class="queue-title">Finding a Match…</h2>
    <p class="queue-count" id="queue-count"><span>1</span> / 3 players found</p>
    <p style="font-size:13px;color:var(--text-3)">Waiting for other players</p>
    <button class="btn btn-secondary" onclick="cancelQueue()">Cancel</button>
  </div>`;
  S.socket.emit('join_queue');
}
function cancelQueue() { S.socket.emit('leave_queue'); showPlay(); }

// ── CREATE ROOM ───────────────────────────────────────────────────────
function showCreateRoom() {
  $app().innerHTML = navHTML() + `<div style="display:flex;align-items:center;justify-content:center;flex:1;padding:24px;" class="screen">
    <div class="modal" style="position:relative">
      <h2 class="modal-title">🏠 Create Room</h2>
      <div class="modal-fields">
        <div class="form-group"><label>Room Name</label><input class="input" id="cr-name" type="text" placeholder="${S.user.username}'s Room" maxlength="32"/></div>
        <div class="form-group"><label>Password <span style="color:var(--text-3);font-weight:400">(optional)</span></label><input class="input" id="cr-pass" type="password" placeholder="Leave blank for open room"/></div>
        <div class="form-group"><label>Max Players</label>
          <select class="input" id="cr-max">
            <option value="2">2 players</option><option value="3">3 players</option>
            <option value="4" selected>4 players</option><option value="5">5 players</option>
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
  const name=document.getElementById('cr-name').value.trim()||`${S.user.username}'s Room`;
  const password=document.getElementById('cr-pass').value;
  const maxPlayers=document.getElementById('cr-max').value;
  S.socket.emit('create_room',{name,password,maxPlayers});
}

// ── JOIN ROOM ─────────────────────────────────────────────────────────
function showJoinRoom() {
  $app().innerHTML = navHTML() + `<div style="display:flex;align-items:center;justify-content:center;flex:1;padding:24px;" class="screen">
    <div style="width:100%;max-width:560px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h2 style="font-family:var(--font-h);font-size:24px;font-weight:700">🔍 Join a Room</h2>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" style="font-size:13px;padding:7px 14px" onclick="S.socket.emit('get_rooms')">↻ Refresh</button>
          <button class="btn btn-secondary" style="font-size:13px;padding:7px 14px" onclick="showPlay()">← Back</button>
        </div>
      </div>
      <div class="rooms-list" id="rooms-list"><div class="empty-msg">Loading rooms…</div></div>
    </div>
  </div>`;
  S.socket.emit('get_rooms');
}
function renderRoomsList(rooms) {
  const el=document.getElementById('rooms-list'); if(!el) return;
  if(!rooms.length){ el.innerHTML='<div class="empty-msg">No open rooms. Create one!</div>'; return; }
  el.innerHTML=rooms.map(r=>`
    <div class="room-item" onclick="tryJoinRoom('${r.id}',${r.hasPassword})">
      <div><div class="room-name">${r.name}</div><div class="room-meta">${r.players}/${r.maxPlayers} players</div></div>
      <div style="display:flex;align-items:center;gap:10px">
        ${r.hasPassword?'<span style="font-size:16px">🔒</span>':''}
        <button class="btn btn-primary" style="font-size:13px;padding:7px 16px">Join</button>
      </div>
    </div>`).join('');
}
function tryJoinRoom(roomId, hasPassword) {
  if (hasPassword) { const pw=prompt('Enter room password:'); if(pw===null) return; S.socket.emit('join_room',{roomId,password:pw}); }
  else S.socket.emit('join_room',{roomId,password:''});
}

// ── LOBBY ─────────────────────────────────────────────────────────────
function showLobby({room, players}) {
  S.roomId = room.id;
  $app().innerHTML = navHTML() + `<div class="lobby-screen screen">
    <div class="lobby-card">
      <div class="lobby-room-name">${room.name}</div>
      <div class="lobby-capacity" id="lobby-cap">${players.length}/${room.maxPlayers} players</div>
      <div class="player-list" id="lobby-players"></div>
      <div id="lobby-hint" class="lobby-hint" style="font-size:13px;color:var(--text-3);text-align:center;margin-bottom:14px"></div>
      <div id="lobby-actions" style="display:flex;flex-direction:column;gap:10px"></div>
    </div>
  </div>`;
  updateLobby(players, room.hostId, room);
}
function updateLobby(players, hostId, room) {
  const listEl=document.getElementById('lobby-players');
  const actEl=document.getElementById('lobby-actions');
  const hintEl=document.getElementById('lobby-hint');
  const capEl=document.getElementById('lobby-cap');
  if (!listEl) return;
  S.roomHostId = hostId;
  const isHost = S.user.id === hostId;
  if (capEl && room) capEl.textContent=`${players.length}/${room.maxPlayers} players${room.hasPassword?' · 🔒 Password protected':''}`;
  listEl.innerHTML=players.map((p,i)=>`
    <div class="player-item">
      <div class="player-avatar ${avClass(i)}">${initials(p.username)}</div>
      <span class="player-item-name">${p.username}${p.userId===S.user.id?' (you)':''}</span>
      ${p.userId===hostId?'<span class="host-badge">HOST</span>':''}
    </div>`).join('');
  if (hintEl) hintEl.textContent=isHost?(players.length<2?'Waiting for at least 1 more player…':'Ready! Hit start when everyone\'s here.'):'Waiting for the host to start…';
  if (actEl) actEl.innerHTML=`
    ${isHost?`<button class="btn btn-primary btn-lg" onclick="S.socket.emit('start_match')" ${players.length<2?'disabled':''}>▶ Start Game</button>`:''}
    <button class="btn btn-danger" onclick="leaveRoom()">Leave Room</button>`;
}
function leaveRoom() { S.socket.emit('leave_room'); S.roomId=null; showPlay(); }

// ── MATCH STARTING ────────────────────────────────────────────────────
function showMatchStarting({players, totalRounds}) {
  S.matchPlayers = players;
  const overlay = document.createElement('div');
  overlay.className='match-starting'; overlay.id='match-overlay';
  overlay.innerHTML=`
    <div class="match-starting-title">MATCH FOUND</div>
    <div class="match-players-list">${players.map(p=>`<div class="match-player-chip">${p.username}</div>`).join('')}</div>
    <p style="color:var(--text-2);font-size:14px">${totalRounds} rounds · Vote then rank · 30s per round</p>
    <div class="match-countdown" id="match-cd">3</div>`;
  document.body.appendChild(overlay);
  let n=3;
  const iv=setInterval(()=>{ n--; const el=document.getElementById('match-cd'); if(el) el.textContent=n>0?n:'GO!'; if(n<=-1){clearInterval(iv);overlay.remove();} },1000);
}

// ── VOTING ────────────────────────────────────────────────────────────
function showVotingScreen({roundNumber, totalRounds, options, counts, duration}) {
  S.myVote = null;
  S.voteOptions = options;
  S.voteCounts = {...counts};
  clearInterval(S.voteTimerInterval);
  S.voteEndsAt = Date.now() + duration * 1000;

  $app().innerHTML = navHTML() + `<div class="voting-screen screen">
    <div class="voting-top">
      <div class="voting-round">Round ${roundNumber} of ${totalRounds}</div>
      <div class="voting-title">Vote for the Tier List</div>
      <div class="voting-sub">Choose which list you all want to rank this round</div>
    </div>

    <div class="vote-timer-row">
      <div class="vote-timer-num" id="vote-timer">${duration}</div>
      <div class="vote-timer-bar"><div class="vote-timer-fill" id="vote-timer-fill" style="width:100%"></div></div>
    </div>

    <div class="vote-options" id="vote-options">
      ${options.map(opt => `
        <div class="vote-card" id="vcard-${opt._id}" onclick="castVote('${opt._id}')">
          ${opt.isCustom?`<span class="vote-card-badge custom-badge">Custom</span>`:''}
          <div class="vote-card-title">${opt.title}</div>
          <div class="vote-card-items">${opt.items.slice(0,6).join(', ')}${opt.items.length>6?'…':''}</div>
          <div class="vote-bar-area">
            <div class="vote-bar-row">
              <div class="vote-bar-bg"><div class="vote-bar-fill" id="vbar-${opt._id}" style="width:0%"></div></div>
              <div class="vote-count-num" id="vcount-${opt._id}">0</div>
            </div>
          </div>
        </div>`).join('')}
    </div>
    <div class="vote-status" id="vote-status">Click a card to vote · 0 / ${S.matchPlayers.length} voted</div>
  </div>`;

  startVoteTimer(duration);
}

function castVote(tlId) {
  if (S.myVote) return; // already voted
  S.myVote = tlId;
  // Highlight voted card
  document.querySelectorAll('.vote-card').forEach(c => c.classList.add('no-vote'));
  const card = document.getElementById('vcard-'+tlId);
  if (card) { card.classList.remove('no-vote'); card.classList.add('voted'); card.innerHTML += '<span class="vote-card-badge voted-badge">✓ Voted</span>'; }
  S.socket.emit('cast_vote', { tierlistId: tlId });
}

function updateVoteCounts({counts, totalVotes, totalPlayers}) {
  S.voteCounts = counts;
  const maxVotes = Math.max(...Object.values(counts), 1);
  Object.entries(counts).forEach(([id, n]) => {
    const bar = document.getElementById('vbar-'+id);
    const cnt = document.getElementById('vcount-'+id);
    if (bar) bar.style.width = Math.round((n/maxVotes)*100)+'%';
    if (cnt) cnt.textContent = n;
  });
  const status = document.getElementById('vote-status');
  if (status) status.textContent = `${totalVotes} / ${totalPlayers} voted`;
}

function showVotingResult({winnerId, winner, counts, skipped}) {
  clearInterval(S.voteTimerInterval);
  if (counts) updateVoteCounts({counts, totalVotes: Object.values(counts).reduce((a,b)=>a+b,0), totalPlayers: S.matchPlayers.length});

  // Highlight winner
  document.querySelectorAll('.vote-card').forEach(c => { c.style.cursor='default'; c.onclick=null; });
  const winCard = document.getElementById('vcard-'+winnerId);
  if (winCard) { winCard.classList.add('winner-glow'); winCard.innerHTML += '<span class="vote-card-badge winner-badge">🏆 Selected</span>'; }

  const status = document.getElementById('vote-status');
  if (status) { status.className='vote-winner-announce'; status.textContent=`"${winner.title}" selected! Get ready to rank…`; }

  // Stop timer display
  const t = document.getElementById('vote-timer');
  if (t) { t.textContent=''; }
}

function startVoteTimer(duration) {
  clearInterval(S.voteTimerInterval);
  S.voteTimerInterval = setInterval(() => {
    const left = Math.max(0, Math.ceil((S.voteEndsAt - Date.now())/1000));
    const pct  = (left/duration)*100;
    const n = document.getElementById('vote-timer');
    const f = document.getElementById('vote-timer-fill');
    if (n) { n.textContent=left; n.classList.toggle('urgent', left<=5); }
    if (f) { f.style.width=pct+'%'; f.classList.toggle('urgent', left<=5); }
    if (left<=0) clearInterval(S.voteTimerInterval);
  }, 500);
}

// ── ROUND ─────────────────────────────────────────────────────────────
function showRound({roundNumber, totalRounds, tierlist, duration}) {
  S.placements={}; S.selectedItem=null; S.submittedItems=new Set();
  clearInterval(S.timerInterval);
  S.timerEndsAt = Date.now() + duration*1000;

  const TIERS=['S','A','B','C','D','F'];
  $app().innerHTML=`<div class="game-screen">
    <div class="game-header">
      <span class="game-round-badge">Round ${roundNumber} / ${totalRounds}</span>
      <span class="game-tl-title">${tierlist.title}</span>
      <div class="timer-wrap">
        <div class="timer-num" id="timer-num">${duration}</div>
        <div class="timer-bar"><div class="timer-fill" id="timer-fill" style="width:100%"></div></div>
      </div>
    </div>

    <div class="submitted-row" id="submitted-row">
      ${S.matchPlayers.map(p=>`<span class="sub-dot" id="sub-${p.userId}">${p.username}</span>`).join('')}
    </div>

    <div class="game-body">
      <div class="tier-list">
        ${TIERS.map(t=>`
          <div class="tier-row" onclick="placeItemInTier('${t}')">
            <div class="tier-label tier-${t}">${t}</div>
            <div class="tier-zone" id="zone-${t}"></div>
          </div>`).join('')}
      </div>
      <div class="item-pool-wrap">
        <div class="pool-label">Unranked — click an item then click a tier row to place it</div>
        <div class="item-pool" id="item-pool">
          ${tierlist.items.map(item=>`<div class="item-card" data-item="${item}" onclick="selectItem('${item}')">${item}</div>`).join('')}
        </div>
      </div>
      <div class="game-footer">
        <span class="game-hint" id="game-hint">Select an item, then click a tier to place it</span>
        <button class="btn btn-primary" id="submit-btn" onclick="submitPlacements()">Submit</button>
      </div>
    </div>
  </div>`;

  startTimer(duration);
}

function selectItem(item) {
  if (S.selectedItem===item) {
    S.selectedItem=null;
    document.querySelectorAll('.item-card.selected').forEach(c=>c.classList.remove('selected'));
    const h=document.getElementById('game-hint'); if(h) h.textContent='Select an item, then click a tier to place it';
    return;
  }
  document.querySelectorAll('.item-card.selected').forEach(c=>c.classList.remove('selected'));
  S.selectedItem=item;
  document.querySelectorAll(`.item-card[data-item="${item}"]`).forEach(c=>c.classList.add('selected'));
  const h=document.getElementById('game-hint'); if(h) h.textContent=`"${item}" selected — click a tier row`;
}

function placeItemInTier(tier) {
  if (!S.selectedItem) return;
  const item=S.selectedItem;
  if (S.placements[item]) {
    const oz=document.getElementById('zone-'+S.placements[item]);
    if (oz) { const old=oz.querySelector(`[data-item="${item}"]`); if(old) old.remove(); }
  }
  const pool=document.getElementById('item-pool');
  if (pool) { const ip=pool.querySelector(`[data-item="${item}"]`); if(ip) ip.remove(); }
  S.placements[item]=tier;
  const zone=document.getElementById('zone-'+tier);
  if (zone) {
    const card=document.createElement('div');
    card.className='item-card'; card.dataset.item=item; card.textContent=item;
    card.onclick=()=>selectItem(item);
    zone.appendChild(card);
  }
  S.selectedItem=null;
  document.querySelectorAll('.item-card.selected').forEach(c=>c.classList.remove('selected'));
  const h=document.getElementById('game-hint'); if(h) h.textContent='Select an item, then click a tier to place it';
}

function submitPlacements() { S.socket.emit('submit_tierlist',{placements:S.placements}); }

function updateSubmittedDots() {
  S.submittedItems.forEach(uid=>{ const el=document.getElementById('sub-'+uid); if(el) el.classList.add('done'); });
}

function startTimer(duration) {
  clearInterval(S.timerInterval);
  S.timerInterval=setInterval(()=>{
    const left=Math.max(0,Math.ceil((S.timerEndsAt-Date.now())/1000));
    const pct=(left/duration)*100;
    const n=document.getElementById('timer-num');
    const f=document.getElementById('timer-fill');
    if(n){ n.textContent=left; n.classList.toggle('urgent',left<=10); }
    if(f){ f.style.width=pct+'%'; f.classList.toggle('urgent',left<=10); }
    if(left<=0){ clearInterval(S.timerInterval); submitPlacements(); }
  },500);
}

// ── ROUND RESULTS ─────────────────────────────────────────────────────
function showRoundResults({roundNumber, scores, allPlacements, items}) {
  clearInterval(S.timerInterval);
  const itemData=items.map(item=>{
    const placements={};
    Object.entries(allPlacements).forEach(([uname,pl])=>{ if(pl[item]) placements[uname]=pl[item]; });
    const allTiers=Object.values(placements);
    const agreed=allTiers.length>=2&&allTiers.some(t=>allTiers.filter(x=>x===t).length>=2);
    return {item,placements,agreed};
  });

  $app().innerHTML=navHTML()+`<div class="results-screen screen">
    <h2 class="results-title">Round ${roundNumber} Results</h2>
    <div style="display:flex;flex-direction:column;gap:8px;width:100%;max-width:580px">
      ${scores.sort((a,b)=>b.roundPoints-a.roundPoints).map((s,i)=>`
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
      ${itemData.map(({item,placements,agreed})=>`
        <div class="ag-item ${agreed?'ag-agreed':''}">
          <div class="ag-item-name">${item}</div>
          ${agreed?'<div class="agreed-badge">+1 agreement</div>':''}
          <div class="ag-tiers">
            ${Object.entries(placements).map(([u,t])=>`<span class="ag-tier-chip tier-chip-${t}">${t} ${u}</span>`).join('')}
          </div>
        </div>`).join('')}
    </div>
    <p class="next-bar">${roundNumber>=5?'Calculating final results…':'Vote starting for next round…'}</p>
  </div>`;
}

// ── MATCH END ─────────────────────────────────────────────────────────
function showMatchEnd({winner, scores}) {
  clearInterval(S.timerInterval); clearInterval(S.voteTimerInterval);
  const iWon = winner.userId===S.user.id;
  $app().innerHTML=navHTML()+`<div class="match-end-screen screen">
    <div class="winner-crown">🏆</div>
    <div>
      <div class="winner-label">${iWon?'You won!':'Winner'}</div>
      <div class="winner-name">${winner.username}</div>
      <div class="winner-pts">${winner.points} points</div>
    </div>
    <div class="final-scores">
      ${scores.map((p,i)=>`
        <div class="final-row ${p.userId===S.user.id?'you':''}">
          <div><div class="final-name">${p.username}${p.userId===S.user.id?' (you)':''}</div>
          <div class="final-rank">${['🥇','🥈','🥉'][i]||'#'+(i+1)}</div></div>
          <div class="final-points">${p.points} pts</div>
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
      <button class="btn btn-primary btn-lg" onclick="showPlay()">Play Again</button>
      <button class="btn btn-secondary btn-lg" onclick="showAppShell('dashboard')">Dashboard</button>
    </div>
  </div>`;
}

// ── INIT ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const params=new URLSearchParams(window.location.search);
  const urlToken=params.get('token');
  const authError=params.get('auth_error');
  if(urlToken||authError) window.history.replaceState({},'','/');
  if(authError) toast(authError,'error');

  try {
    const cfg=await fetch('/api/config').then(r=>r.json());
    S.googleEnabled=cfg.googleEnabled;
  } catch{}

  const stored=urlToken||localStorage.getItem('tlb_token');
  if(stored){
    S.token=stored;
    if(urlToken) localStorage.setItem('tlb_token',stored);
    try{
      const me=await api.me();
      S.user=me;
      connectSocket();
      showAppShell('dashboard');
      return;
    } catch{ localStorage.removeItem('tlb_token'); S.token=null; }
  }
  showLogin();
});
