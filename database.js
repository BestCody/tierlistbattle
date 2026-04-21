const Datastore = require('nedb-promises');
const bcrypt    = require('bcryptjs');
const path      = require('path');

const users = Datastore.create({
  filename: path.join(__dirname, 'data', 'users.db'),
  autoload: true,
});

function init() {
  // nedb auto-creates the file; ensure the data directory exists
  const fs = require('fs');
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  // Ensure unique indexes
  users.ensureIndex({ fieldName: 'username', unique: true });
  users.ensureIndex({ fieldName: 'googleId', unique: true, sparse: true });
}

// ── helpers ──────────────────────────────────────────────────────────
function safeUser(doc) {
  if (!doc) return null;
  return {
    id:           doc._id,
    username:     doc.username,
    email:        doc.email        || null,
    wins:         doc.wins         || 0,
    losses:       doc.losses       || 0,
    rounds_played: doc.rounds_played || 0,
  };
}

// ── public API ────────────────────────────────────────────────────────
async function createUser(username, password) {
  const hash = bcrypt.hashSync(password, 10);
  const doc  = await users.insert({ username, password_hash: hash, wins: 0, losses: 0, rounds_played: 0 });
  return safeUser(doc);
}

async function findByUsername(username) {
  return users.findOne({ username });
}

async function findById(id) {
  const doc = await users.findOne({ _id: id });
  return safeUser(doc);
}

function checkPassword(userDoc, password) {
  return !!(userDoc?.password_hash && bcrypt.compareSync(password, userDoc.password_hash));
}

async function findOrCreateGoogleUser(googleId, email, displayName) {
  // existing google user
  let doc = await users.findOne({ googleId });
  if (doc) return safeUser(doc);

  // existing email → link account
  if (email) {
    doc = await users.findOne({ email });
    if (doc) {
      await users.update({ _id: doc._id }, { $set: { googleId } });
      return safeUser(await users.findOne({ _id: doc._id }));
    }
  }

  // create new
  let username = (displayName || 'player')
    .replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 20);
  const clash = await users.findOne({ username });
  if (clash) username += '_' + Date.now().toString().slice(-4);

  doc = await users.insert({
    username, email: email || null, googleId,
    wins: 0, losses: 0, rounds_played: 0,
  });
  return safeUser(doc);
}

async function updateStats(id, wins, losses, rounds) {
  await users.update(
    { _id: id },
    { $inc: { wins, losses, rounds_played: rounds } }
  );
}

async function leaderboard() {
  const docs = await users.find({}).sort({ wins: -1 }).limit(5);
  return docs.map(safeUser);
}

module.exports = {
  init,
  createUser,
  findByUsername,
  findById,
  checkPassword,
  findOrCreateGoogleUser,
  updateStats,
  leaderboard,
};
