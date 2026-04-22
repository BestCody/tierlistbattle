const Datastore = require('nedb-promises');
const bcrypt    = require('bcryptjs');
const path      = require('path');
const fs        = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const users     = Datastore.create({ filename: path.join(dataDir, 'users.db'),     autoload: true });
const tierlists = Datastore.create({ filename: path.join(dataDir, 'tierlists.db'), autoload: true });

function init() {
  users.ensureIndex({ fieldName: 'username', unique: true });
  users.ensureIndex({ fieldName: 'googleId',  unique: true, sparse: true });
  tierlists.ensureIndex({ fieldName: 'createdBy' });
}

// ── user helpers ────────────────────────────────────────────────────
function safeUser(doc) {
  if (!doc) return null;
  return {
    id:            doc._id,
    username:      doc.username,
    email:         doc.email         || null,
    wins:          doc.wins          || 0,
    losses:        doc.losses        || 0,
    rounds_played: doc.rounds_played || 0,
  };
}

async function createUser(username, password) {
  const hash = bcrypt.hashSync(password, 10);
  const doc  = await users.insert({ username, password_hash: hash, wins: 0, losses: 0, rounds_played: 0 });
  return safeUser(doc);
}
async function findByUsername(username) { return users.findOne({ username }); }
async function findById(id)             { return safeUser(await users.findOne({ _id: id })); }
function checkPassword(doc, pw)         { return !!(doc?.password_hash && bcrypt.compareSync(pw, doc.password_hash)); }

async function findOrCreateGoogleUser(googleId, email, displayName) {
  let doc = await users.findOne({ googleId });
  if (doc) return safeUser(doc);
  if (email) {
    doc = await users.findOne({ email });
    if (doc) { await users.update({ _id: doc._id }, { $set: { googleId } }); return safeUser(await users.findOne({ _id: doc._id })); }
  }
  let username = (displayName || 'player').replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 20);
  if (await users.findOne({ username })) username += '_' + Date.now().toString().slice(-4);
  doc = await users.insert({ username, email: email || null, googleId, wins: 0, losses: 0, rounds_played: 0 });
  return safeUser(doc);
}

async function updateStats(id, wins, losses, rounds) {
  await users.update({ _id: id }, { $inc: { wins, losses, rounds_played: rounds } });
}
async function leaderboard() {
  return (await users.find({}).sort({ wins: -1 }).limit(5)).map(safeUser);
}

// ── tierlist helpers ─────────────────────────────────────────────────
function safeTierlist(doc) {
  if (!doc) return null;
  return {
    _id:              doc._id,
    title:            doc.title,
    items:            doc.items,
    isCustom:         true,
    createdBy:        doc.createdBy,
    createdByUsername: doc.createdByUsername,
    createdAt:        doc.createdAt,
  };
}

async function createTierlist(userId, username, title, items) {
  const doc = await tierlists.insert({
    title: title.trim().slice(0, 60),
    items: items.map(i => i.trim().slice(0, 40)).filter(Boolean),
    createdBy: userId,
    createdByUsername: username,
    isCustom: true,
    createdAt: new Date().toISOString(),
  });
  return safeTierlist(doc);
}

async function getAllCustomTierlists() {
  return (await tierlists.find({})).map(safeTierlist);
}

async function getUserTierlists(userId) {
  return (await tierlists.find({ createdBy: userId }).sort({ createdAt: -1 })).map(safeTierlist);
}

async function deleteTierlist(id, userId) {
  const n = await tierlists.remove({ _id: id, createdBy: userId }, {});
  return n > 0;
}

module.exports = {
  init,
  createUser, findByUsername, findById, checkPassword,
  findOrCreateGoogleUser, updateStats, leaderboard,
  createTierlist, getAllCustomTierlists, getUserTierlists, deleteTierlist,
};
