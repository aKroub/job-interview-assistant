# Setup Guide — Interview Prep Tracker

This guide walks you through getting the Gmail + Google Calendar integration working from scratch.

---

## Prerequisites

- **Node.js 20** via nvm (`nvm install 20 && nvm use 20`)
- A **Google account** whose Gmail and Calendar you want to scan
- A **Google Cloud project** (free tier is sufficient)

---

## 1 — Clone and install dependencies

```bash
git clone https://github.com/aKroub/job-interview-assistant.git
cd job-interview-assistant

# Frontend
cd interview-prep-tracker
nvm use 20 && npm install
cd ..

# Backend
cd server
nvm use 20 && npm install
cd ..
```

---

## 2 — Create a Google Cloud project and OAuth credentials

> **One-time setup.** Each developer needs their own Google Cloud project and credentials. Credentials are never committed to the repo.

### 2a — Create a project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Click the project selector at the top → **New Project**
3. Give it any name (e.g. `interview-tracker-local`) → **Create**

### 2b — Enable the required APIs

1. In the left menu go to **APIs & Services → Library**
2. Search for **Gmail API** → click it → **Enable**
3. Search for **Google Calendar API** → click it → **Enable**
4. Search for **Google Drive API** → click it → **Enable** (required for cloud sync backup/restore)

### 2c — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** (works for personal Gmail) → **Create**
3. Fill in:
   - **App name**: anything (e.g. `Interview Tracker`)
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue** through the Scopes and Test Users screens
5. On the **Test users** step, add your own Gmail address as a test user → **Save**

### 2d — Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials** → **+ Create Credentials → OAuth client ID**
2. **Application type**: Web application
3. **Name**: anything (e.g. `Interview Tracker Local`)
4. Under **Authorised redirect URIs** click **+ Add URI** and enter:
   ```
   http://localhost:3001/api/auth/callback
   ```
5. Click **Create**
6. A dialog shows your **Client ID** and **Client Secret** — copy both

---

## 3 — Configure the backend

```bash
cd server
cp .env.example .env
```

Open `server/.env` and fill in your values:

```env
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here

# Leave these as-is unless you need to change ports
PORT=3001
POLL_INTERVAL_MS=300000
EMAIL_LOOKBACK_DAYS=1
CALENDAR_LOOKAHEAD_DAYS=30
```

> **`server/.env` is gitignored** — it will never be committed.

### LLM Extraction (optional)

The backend can use Claude to extract structured interview data (company names, dates, times, interview types) from emails and calendar events. This is opt-in — the app works without it.

Add these three variables to `server/.env` to enable it:

```env
# Claude API key — get one at https://console.anthropic.com/settings/keys
# Leave blank (or omit) to stay in dry mode: prompts are logged but no API calls are made.
ANTHROPIC_API_KEY=

# Set to "false" to enable live API calls to Claude. Default is "true" (dry mode).
# In dry mode the app shows what prompts WOULD be sent, without calling the API.
LLM_DRY_MODE=true

# Claude model to use for extraction. Default: claude-haiku-4-5 (fastest/cheapest).
LLM_MODEL=claude-haiku-4-5
```

- **`ANTHROPIC_API_KEY`** — optional; when absent the server runs in dry mode automatically (no API calls, no charges).
- **`LLM_DRY_MODE`** — set to `false` only after you have added a valid API key.
- **`LLM_MODEL`** — defaults to `claude-haiku-4-5`; any Anthropic messages-API model ID is accepted.

---

## 4 — Start the servers

Open **two terminal tabs**:

**Tab 1 — Backend:**
```bash
cd server
nvm use 20 && npm run dev
# → Interview Tracker server running on http://localhost:3001
```

**Tab 2 — Frontend:**
```bash
cd interview-prep-tracker
nvm use 20 && npm start
# → App running on http://localhost:3000
```

---

## 5 — Connect your Google account

1. Open [http://localhost:3000](http://localhost:3000) in your browser
2. The **Interview Suggestions** panel at the top shows a **Connect Google** button
3. Click it — a new tab opens to Google's OAuth consent screen
4. Sign in with the Google account you added as a test user in step 2c
5. Grant access to Gmail and Google Calendar
6. The tab closes with a "Connected!" message — return to the app
7. The panel status changes to **Live** — the first scan starts automatically

> **Why a new tab?** The OAuth flow redirects to `localhost:3001/api/auth/callback`, which shows a success page. You can then close that tab.

---

## 6 — How the scanning works

| What | Detail |
|---|---|
| **Trigger** | Scanning only runs while the frontend is open and connected via SSE |
| **Interval** | Every 5 minutes (configurable via `POLL_INTERVAL_MS`) |
| **Email lookback** | Last 1 day of Gmail (configurable via `EMAIL_LOOKBACK_DAYS`) |
| **Calendar lookahead** | Next 30 days (configurable via `CALENDAR_LOOKAHEAD_DAYS`) |
| **LLM enrichment** | When `LLM_DRY_MODE=false` and an API key is set, each email/event is enriched with Claude-extracted fields before matching (per-field fallback to regex) |
| **Cross-reference rule** | A cross-referenced suggestion requires both Gmail and Calendar confirmation; email-only and calendar-only suggestions are also surfaced with lower confidence |
| **Tokens** | Stored at `~/.interview-tracker/tokens.json` (outside the repo, never committed) |
| **Dismissed suggestions** | Stored at `~/.interview-tracker/dismissed.json` |

---

## 7 — Run the tests

```bash
# Frontend (from interview-prep-tracker/)
nvm use 20 && npm test -- --watchAll=false --verbose

# Backend (from server/)
nvm use 20 && npm test
```

Both suites must pass before opening a PR.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ECONNREFUSED` in the browser console | The Express server isn't running — start it with `npm run dev` in `server/` |
| "Connect Google" button opens an error page | Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `server/.env` are correct |
| OAuth redirect fails with `redirect_uri_mismatch` | Make sure `http://localhost:3001/api/auth/callback` is in your Google Cloud OAuth client's Authorised Redirect URIs |
| No suggestions appear after connecting | Try clicking **Scan now** in the panel; check the server terminal for API errors |
| `access_denied` on the OAuth screen | Make sure your Google account is listed as a test user in the OAuth consent screen |
| Server starts but crashes immediately | Run `npm run dev` and read the error — most likely a missing env var in `server/.env` |
