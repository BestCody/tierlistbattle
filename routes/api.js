const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../database');

router.get('/me', auth, async (req, res) => {
  try {
    const user = await db.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.get('/leaderboard', auth, async (req, res) => {
  try { res.json({ leaderboard: await db.leaderboard() }); }
  catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Tierlists ─────────────────────────────────────────────────────────
router.get('/tierlists/mine', auth, async (req, res) => {
  try { res.json({ tierlists: await db.getUserTierlists(req.user.id) }); }
  catch { res.status(500).json({ error: 'Server error' }); }
});

router.post('/tierlists', auth, async (req, res) => {
  const { title, items } = req.body;
  if (!title?.trim())                    return res.status(400).json({ error: 'Title is required' });
  if (!Array.isArray(items) || items.length < 4) return res.status(400).json({ error: 'At least 4 items required' });
  if (items.length > 12)                 return res.status(400).json({ error: 'Max 12 items allowed' });
  if (items.some(i => !i?.trim()))       return res.status(400).json({ error: 'Items cannot be empty' });
  try {
    const tl = await db.createTierlist(req.user.id, req.user.username, title, items);
    res.json({ tierlist: tl });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/tierlists/:id', auth, async (req, res) => {
  try {
    const ok = await db.deleteTierlist(req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Not found or not yours' });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
