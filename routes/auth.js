const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const passport = require('passport');
const db      = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'tierlist-dev-secret-change-in-prod';
const sign = (user) =>
  jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password)
    return res.status(400).json({ error: 'Username and password required' });
  if (username.trim().length < 3)
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!/^[a-zA-Z0-9_]+$/.test(username.trim()))
    return res.status(400).json({ error: 'Username: letters, numbers and underscores only' });
  try {
    const user = await db.createUser(username.trim(), password);
    res.json({ token: sign(user), user: { id: user.id, username: user.username } });
  } catch (e) {
    if (e.message?.includes('uniqueViolated') || e.errorType === 'uniqueViolated')
      return res.status(400).json({ error: 'Username already taken' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  try {
    const userDoc = await db.findByUsername(username.trim());
    if (!userDoc || !db.checkPassword(userDoc, password))
      return res.status(400).json({ error: 'Invalid username or password' });
    const user = { id: userDoc._id, username: userDoc.username, wins: userDoc.wins || 0, losses: userDoc.losses || 0, rounds_played: userDoc.rounds_played || 0 };
    res.json({ token: sign(user), user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Google OAuth — only active if credentials are configured
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID)
    return res.redirect('/?auth_error=Google+OAuth+not+configured');
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback',
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) return res.redirect('/');
    passport.authenticate('google', {
      session: false,
      failureRedirect: '/?auth_error=Google+login+failed',
    })(req, res, next);
  },
  (req, res) => {
    const token = sign(req.user);
    res.redirect(`/?token=${token}`);
  }
);

module.exports = router;
