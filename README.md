# Video Conferencing Platform

Browser-based video meetings for small groups. Start a room, share the link, check your camera in a lobby, and talk. Built on the MERN stack, with **Socket.IO for signaling** and **WebRTC for audio/video**.

## Features

| Area | What works |
|---|---|
| Meetings | Instant rooms with shareable codes and links, a pre-join lobby with camera preview and mic meter, a responsive grid, pin/spotlight, automatic spotlight for presenters, and an "only one here" invite card |
| Media | Peer-to-peer audio/video (WebRTC mesh), mute, camera on/off (the camera light really turns off), screen sharing, camera/mic selection, speaking indicators |
| Collaboration | In-call chat (lasts as long as the meeting), raise hand, emoji reactions, participant list with mic/camera state |
| Host controls | First person in is host (passes to the next earliest joiner when they leave). The host can lock the room, ask someone to mute, and remove participants |
| Accounts | Optional. Register/sign in (bcrypt, hashed opaque session tokens), meeting history (de-duplicated, deletable). Guests join with just a name |
| Resilience | Socket auto-reconnect with clean rejoin, ICE restart on failure, a clear "Reconnecting…" state, honest per-peer "Connecting…" / "Could not connect" labels, permission-denied guidance |

**Capacity:** 6 people per room (`MAX_PARTICIPANTS`). In a mesh, every participant sends their video to every other participant, so upload bandwidth and CPU grow with each person. Six is a practical ceiling on ordinary connections. Larger meetings would need an SFU (e.g. LiveKit or mediasoup), which this project does not include.

## Architecture

```
Browser A ──── WebRTC media (peer-to-peer, or via TURN) ──── Browser B
    │                                                          │
    └──── HTTPS + WebSocket ────► Express + Socket.IO ◄────────┘
                                   │  REST: /api/v1/...
                                   │  Socket.IO: rooms + signaling relay
                                   ▼
                              MongoDB Atlas (users, sessions, meeting history)
```

* **Socket.IO never carries media.** It handles room membership and relays SDP offers/answers and ICE candidates, and only to a peer in the **same room**. The sender ID is always the server-known socket, never a client-supplied field.
* **Live room state is in memory.** That covers participants, chat and locks, and it is reset on server restart (clients reconnect and rejoin). MongoDB stores only accounts, sessions (TTL-expired) and meeting history. Audio, video and chat are never stored.
* **Signaling roles are fixed to avoid glare.** The newcomer sends offers to everyone already in the room. Each connection has one audio and one video transceiver, so mute, camera switching and screen sharing use `replaceTrack()` without renegotiating.

Key code:

| Path | Purpose |
|---|---|
| `backend/src/server.js` | Entry point: config check, MongoDB connect, HTTP + Socket.IO, graceful shutdown |
| `backend/src/app.js` | Express app: security headers, CORS, `/health`, API routes, serves `frontend/dist` |
| `backend/src/realtime/socketManager.js` | Socket.IO events, validation, rate limits, targeted signaling relay |
| `backend/src/realtime/roomManager.js` | Pure room logic (capacity, host, lock, chat history), unit-tested |
| `frontend/src/lib/meeting/MeetingClient.js` | The WebRTC + Socket.IO engine (outside React) |
| `frontend/src/pages/VideoMeet.jsx` | Lobby → room → end screen |

## Requirements

* Node.js **22.12+** (developed and tested on **24.22.1**; `.node-version` pins 24 for Render)
* npm (each of `backend/` and `frontend/` has its own `package-lock.json`)
* A MongoDB Atlas cluster, or use `npm run dev:memory` for a throwaway in-memory database

## Run locally

```bash
# 1. Install
npm run install:all              # = npm ci in backend/ and frontend/

# 2. Configure the backend
cp backend/.env.example backend/.env   # then set MONGODB_URI (see below)

# 3. Start the API (http://localhost:8000)
cd backend && npm run dev               # uses MONGODB_URI
#   or: npm run dev:memory              # in-memory MongoDB, no credentials needed

# 4. In another terminal, start the UI (http://localhost:5173)
cd frontend && npm run dev
```

Vite proxies `/api`, `/health` and `/socket.io` to `localhost:8000`, so the dev app uses the same origin, like production. To try the production build locally: `npm run build && npm start` from the repo root, then open http://localhost:8000.

**Test a call:** open the same meeting link in two browser profiles, or a normal and a private window, on one machine. Better still, use two devices on the same network. Note that browsers allow camera access only on `https://` or `localhost`, so a second device needs the deployed HTTPS URL or a tunnel.

### MongoDB configuration

| Variable | Meaning |
|---|---|
| `MONGODB_URI` | **Required.** Full connection string, ideally including credentials (`mongodb+srv://user:pass@cluster…/`). |
| `MONGODB_USERNAME`, `MONGODB_PASSWORD` | Optional. Injected (URL-encoded) only if the URI has no credentials or contains Atlas' `<username>`/`<db_password>` placeholders. If the URI already contains credentials, these are ignored. |
| `MONGODB_DB_NAME` | Database to use (default `video_conferencing_platform`). Set explicitly so data never lands in the driver's default `test` database. |

Use a least-privilege Atlas database user (`readWrite` on this database only). Atlas must allow connections from wherever the server runs; see the Render section.

## Tests

```bash
cd backend && npm test          # 38 tests: REST API, auth, room logic, Socket.IO signaling + origin check (in-memory MongoDB)
cd frontend && npm run test:e2e # 21 Playwright tests in Chromium against the production build
cd frontend && npm run lint     # oxlint
```

* Backend tests start an **in-memory MongoDB** and never touch Atlas.
* The Playwright suite builds the frontend, serves it from the real backend (in-memory DB), and drives Chromium with **synthetic camera/microphone devices**. It checks that remote video frames decode, that remote audio tracks arrive and trigger the speaking indicator, chat, mute/camera state, leaving (all tracks stopped), refresh/rejoin, screen sharing (spotlight, late joiners, camera-off sharing), host lock/remove, denied permissions, and phone/tablet/desktop layouts.
* First run: `npx playwright install chromium` in `frontend/`.
* To test your running dev setup instead (both `npm run dev` servers, real database): `E2E_BASE_URL=http://localhost:5173 npm run test:e2e`. This creates a few test accounts in that database.
* **What the automated tests do not prove:** real webcams/microphones, and calls between different networks (NAT traversal). Do a manual two-device check after deploying.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Backend logs `MongoDB connection attempt n/5 failed … Atlas refused the connection` | Your current IP isn't on the Atlas access list (common after switching Wi-Fi or VPN). Add it under Atlas → Network Access, then restart. The server retries 5 times before exiting. |
| `… username or password … was rejected` | Fix the credentials in `MONGODB_URI` (URL-encode special characters). |
| `… hostname could not be resolved` | Check your internet/DNS connection or the cluster address. |
| Vite prints `[proxy] Backend not reachable at http://localhost:8000` | Start the backend (`cd backend && npm run dev`); the UI shows "Reconnecting…" until it's up. |

## Deploy to Render

The repo includes a Blueprint (`render.yaml`) for **one Web Service** that serves the API, Socket.IO and the built React app from the same origin. That means no CORS setup, no build-time API URL, and working deep links.

1. Push the repo to GitHub/GitLab (`backend/.env` is git-ignored; confirm it is not committed).
2. In Render, choose **New → Blueprint**, select the repo, and enter `MONGODB_URI` when prompted.
   Or create the service manually:

   | Setting | Value |
   |---|---|
   | Service type | Web Service, runtime Node, instance type Free (or any paid plan) |
   | Root directory | *(repo root, leave empty)* |
   | Build command | `npm run render:build` |
   | Start command | `npm start` |
   | Health check path | `/health` (returns 503 when MongoDB is unreachable) |

3. **Environment variables** (Service → Environment):

   | Key | Required | Notes |
   |---|---|---|
   | `MONGODB_URI` | yes | Secret. Full Atlas URI with credentials |
   | `NODE_ENV` | yes | `production` |
   | `MONGODB_DB_NAME` | recommended | `video_conferencing_platform` |
   | `MONGODB_USERNAME` / `MONGODB_PASSWORD` | no | Only if your URI uses placeholders |
   | `MAX_PARTICIPANTS` | no | Default 6 |
   | `TURN_URLS` + `TURN_SECRET` (or `TURN_USERNAME` + `TURN_CREDENTIAL`) | no | Enables a TURN relay; see below |
   | `CLIENT_ORIGINS` | only for a split deploy | Comma-separated frontend origins |

   `PORT` is provided by Render; the server binds `0.0.0.0:$PORT`. Node comes from `.node-version` (24); set `NODE_VERSION` to override.
4. **Atlas network access:** Render's outbound IPs are not fixed on every plan. Either add your service's outbound IP ranges (Render dashboard → service → *Connect* → *Outbound*) to the Atlas IP Access List, or allow `0.0.0.0/0` and rely on a strong, least-privilege database password.
5. Deploy, open `https://<service>.onrender.com/health` (expect `{"status":"ok","database":"connected"}`), then hold a call between two devices on **different networks**.

**Optional split deploy (Static Site + Web Service):** deploy `frontend/` as a Static Site (build `npm ci && npm run build`, publish directory `dist`, rewrite `/*` → `/index.html`), set `VITE_API_URL=https://<backend>.onrender.com` on it, and set `CLIENT_ORIGINS=https://<static-site>.onrender.com` and `SERVE_FRONTEND=false` on the backend.

### Things to know on Render

* Render proxies WebSockets to the web service; that is all signaling needs. **Render does not relay WebRTC media.** Media goes peer-to-peer, or through a TURN server you configure.
* **Free instances spin down when idle.** The first visit after a pause takes a while, and a restart or deploy drops in-memory rooms. Clients show "Reconnecting…" and rejoin automatically.
* Run **one instance**. Socket.IO's in-memory adapter doesn't share rooms between instances. Scaling out needs a shared adapter (e.g. Redis) and sticky sessions for the polling transport.

## STUN / TURN

By default the server hands browsers Google's public STUN servers. STUN is enough when at least one side has a reasonably open NAT (most home networks), but **calls between strict corporate, campus or mobile-carrier networks may fail without TURN**. When that happens, tiles show "Could not connect" while chat still works.

To add TURN, run coturn with `use-auth-secret` and set `TURN_URLS` + `TURN_SECRET`. The server then issues short-lived credentials per request, so the secret never reaches the browser. Alternatively, use a provider's static `TURN_USERNAME`/`TURN_CREDENTIAL`. TURN relays carry real bandwidth and usually cost money, so check a provider's free-tier limits before relying on it.

## Security notes

* Passwords are hashed with bcrypt. Login responses take about the same time for unknown users and wrong passwords, so the timing doesn't reveal which usernames exist.
* Session tokens are 256-bit random values. Only their SHA-256 hash is stored, and they expire after 7 days (TTL index). Logout revokes them.
* All inputs are validated server-side: usernames, meeting codes, display names, chat (control/bidi characters stripped, 1000 characters max), and signaling payloads (whitelisted fields, size caps). Query operators in bodies are rejected.
* Per-socket rate limits apply to joins, chat, signaling, reactions and host actions, and HTTP rate limits apply to login/registration.
* Helmet sets security headers: CSP, frame-ancestors and others, plus a `Permissions-Policy` that allows camera, microphone and screen capture only for this origin.
* Trade-off: the session token lives in `localStorage` (this keeps the split-deploy option simple). React escapes all user text, but a cookie-based session would be stronger if XSS risk grows.
* Anyone with a meeting link can join unless the host locks the room. Codes are random (about 47 bits), but they work like unlisted links, not passwords.

## Known limitations & next steps

* **No TURN server is bundled.** Add one (see above) for reliable calls across restrictive networks.
* **Mesh topology, capped at 6.** Larger rooms would need an SFU such as LiveKit or mediasoup.
* **Room state is in memory on a single instance.** Restarts end live meetings (clients rejoin), and scaling out needs a Socket.IO Redis adapter plus sticky sessions.
* **Not included yet:** waiting room or passcodes, cookie-based sessions, bandwidth adaptation for larger rooms.
* **Deliberately out of scope:** recording, transcription and persistent chat, which need consent, storage and retention decisions first.
