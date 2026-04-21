const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../database');

router.get('/me', auth, async (req, res) => {
  try {
    const user = await db.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/leaderboard', auth, async (req, res) => {
  try {
    res.json({ leaderboard: await db.leaderboard() });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
