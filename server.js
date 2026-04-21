require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const jwt      = require('jsonwebtoken');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const session  = require('express-session');

const db          = require('./database');
const authRoutes  = require('./routes/auth');
const apiRoutes   = require('./routes/api');
const { GameManager } = require('./game/gameManager');

const JWT_SECRET = process.env.JWT_SECRET || 'tierlist-dev-secret-change-in-prod';

db.init();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(session({ secret: JWT_SECRET, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth (only if credentials are set)
const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
if (googleEnabled) {
  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || '';
        const user  = await db.findOrCreateGoogleUser(profile.id, email, profile.displayName);
        done(null, user);
      } catch (e) { done(e); }
    }
  ));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try { done(null, await db.findById(id)); } catch (e) { done(e); }
  });
}

app.get('/api/config', (_req, res) => res.json({ googleEnabled }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRoutes);
app.use('/api',      apiRoutes);
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Socket.io auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

const gm = new GameManager(io);
gm.init();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮  Tier List Battle → http://localhost:${PORT}\n`);
  if (!googleEnabled) console.log('   Google OAuth not configured — username/password only\n');
});
