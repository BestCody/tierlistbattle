# 🎮 Tier List Battle

A real-time multiplayer tier list ranking game. Players rank the same lists simultaneously, earn points when they agree with each other, and compete over 5 rounds.

## Quick Start

```bash
cd tierlist-battle
npm install
npm start
# Open http://localhost:3000
```

## Features

- **Sign up / Sign in** with username + password (Google OAuth optional)
- **Dashboard** — your stats (wins, losses, rounds, win rate) + top-5 leaderboard
- **Quick Queue** — auto-matches you with 2 other players
- **Create / Join Rooms** — private rooms with optional password
- **5-round matches** — each round has a random tier list and 30-second timer
- **Scoring** — if 2+ players rank the same item in the same tier, they all get +1 point
- **Live lobby** — see who's in the room, host starts the game

## Game Rules

1. Each match has **5 rounds**
2. Every round reveals a **tier list** (e.g. "Mario Kart Tracks" or "RPG Classes")
3. Players have **30 seconds** to rank all 8 items into S / A / B / C / D / F tiers
4. After time's up, scores are calculated:
   - If **2 or more players** put the **same item in the same tier** → they each get **+1 point**
5. Player with the **most points after 5 rounds** wins
6. Stats (wins, losses, rounds) are saved to the database

## Google OAuth Setup (optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → APIs & Services → Credentials
3. Create OAuth 2.0 Client ID (Web application)
4. Add authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
5. Copy `.env.example` to `.env` and fill in your Client ID and Secret:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

If these aren't set, Google login is hidden and username/password works fine.

## Project Structure

```
tierlist-battle/
├── server.js          — Express + Socket.io entry point
├── database.js        — SQLite via better-sqlite3
├── middleware/
│   └── auth.js        — JWT middleware
├── routes/
│   ├── auth.js        — /api/auth/* endpoints
│   └── api.js         — /api/me, /api/leaderboard
├── game/
│   ├── gameManager.js — All real-time game logic
│   └── tierlists.js   — 10 tier list categories
└── public/
    ├── index.html     — SPA shell
    ├── style.css      — Dark gaming theme
    └── app.js         — All frontend logic
```

## Tech Stack

- **Backend**: Node.js, Express, Socket.io, better-sqlite3, bcryptjs, jsonwebtoken
- **Auth**: JWT (30-day sessions), optional Google OAuth via Passport
- **Frontend**: Vanilla JS SPA (no framework), Google Fonts
- **Database**: SQLite (auto-created as `data.db` on first run)
