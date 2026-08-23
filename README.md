# Royal Caribbean Cruise Tools Dashboard

A personal React dashboard and automated price-checking tool for Royal Caribbean and Celebrity cruises. Tracks fares across your existing bookings, monitors unbooked sailings against a target price, logs loyalty tier status, and sends you notifications when something worth acting on changes.

**Live frontend:** [https://J-i-n-g-Yang.github.io/Royal-Carribean-Tracker](https://J-i-n-g-Yang.github.io/Royal-Carribean-Tracker)

> **Note:** The Price Checker and Run History tabs require the backend API running locally (`docker compose up`). All other tabs — PDF Generator, Trip Finance OS, Casino Analytics, Casino Year — work fully from the static GitHub Pages URL with no local setup.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Project structure](#project-structure)
4. [Quick start (local)](#quick-start-local)
5. [Dashboard tabs](#dashboard-tabs)
6. [Price Checker — how it works](#price-checker--how-it-works)
7. [Watchlist & prospective cruises](#watchlist--prospective-cruises)
8. [Notifications](#notifications)
9. [Scheduled runs](#scheduled-runs)
10. [Run History dashboard](#run-history-dashboard)
11. [GitHub Actions workflows](#github-actions-workflows)
12. [GitHub Actions secrets](#github-actions-secrets)
13. [Backend API reference](#backend-api-reference)
14. [Configuration reference](#configuration-reference)
15. [Data storage & privacy](#data-storage--privacy)
16. [Known repo issues](#known-repo-issues)
17. [Troubleshooting](#troubleshooting)

---

## What it does

| Feature | Where |
|---|---|
| Check cabin & add-on prices across all your reservations | Price Checker tab |
| See exactly what changed since the last check | "What Changed" banner in results |
| Track your Crown & Anchor, Club Royale, Captain's Club, and Blue Chip tier status | Loyalty card in results |
| Plot fare-over-time for any reservation | Price Trend Chart in results |
| Aggregate total fare, OBC, savings, and next payment due across all bookings | Portfolio Summary in results |
| Monitor an unbooked cruise URL and get alerted if it drops below your target | Watchlist form + notifications |
| Track a specific add-on (internet, dining, etc.) on an existing booking | Watchlist form + notifications |
| Export a run as CSV or print-to-PDF | Export buttons in results |
| Automatic daily price checks with no server required | GitHub Actions scheduled workflow |
| View all past runs, per-run breakdowns, and a price-change timeline | Run History tab |
| Cruise planner PDF link generator | PDF Generator tab |
| Trip Finance OS — per-trip cost tracking with SGD/USD split and FX rate | Trip Finance OS tab |
| Casino analytics and year-over-year tracker | Casino Analytics / Casino Year tabs |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Pages (static, public)                                  │
│  React frontend — all tabs except Price Checker / Run History   │
│  work here                                                        │
└─────────────────────────────────────────────────────────────────┘
                          │ Price Checker / Run History only
                          ▼ (http://localhost:5050)
┌─────────────────────────────────────────────────────────────────┐
│  Your machine — docker compose up                                │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │  React frontend  │───▶│  Flask backend  :5000 (host 5050) │   │
│  │  :3000           │    │  app.py                           │   │
│  └──────────────────┘    │  check_runner.py                  │   │
│                          │  CheckRoyalCaribbeanPrice.py       │   │
│                          │  history_store.py                  │   │
│                          │  scheduler.py (optional)           │   │
│                          └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Actions (no server needed)                                │
│  scheduled-check.yml → scheduled_run.py → check_runner.py         │
│  Run history preserved via actions/cache                          │
└─────────────────────────────────────────────────────────────────┘
```

The backend and the GitHub Actions scheduled run share the same `check_runner.run_check()` function — there is no duplicated logic between the manual UI path and the automated one.

---

## Project structure

```
Royal-Carribean-Tracker/
├── docker-compose.yml
├── README.md
├── .gitignore
├── .github/
│   └── workflows/
│       ├── deploy.yml              # Deploys frontend to GitHub Pages
│       └── scheduled-check.yml     # Daily price check (no server needed)
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app.py                      # Flask app — routes only
│   ├── check_runner.py             # Shared run logic (API + scheduler)
│   ├── findings_parser.py          # Parses raw log → structured JSON
│   ├── history_store.py            # Persists runs to data/history.json
│   ├── scheduler.py                # Optional APScheduler background checks
│   ├── scheduled_run.py            # Entry point for GitHub Actions / cron
│   ├── CheckRoyalCaribbeanPrice.py # Core price-checking engine (unmodified)
│   ├── data/
│   │   └── history.json            # Run history — volume-mounted, gitignored
│   └── secrets/                    # Volume-mounted read-only, gitignored
│       ├── accounts.example.json   # ⚠ referenced in docs but missing — see "Known repo issues"
│       ├── notify.example.json     # Schema for Apprise notification URLs
│       └── watchlist.example.json  # ⚠ currently misnamed on disk — see "Known repo issues"
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── tailwind.config.js
    ├── public/
    │   └── index.html
    └── src/
        ├── index.js                     # React entry point
        ├── App.js                       # Top-level layout + tab navigation
        ├── style.css / tailwind.css     # Global styles
        ├── components/
        │   ├── PriceChecker.jsx         # Price Checker tab
        │   ├── LoyaltyCard.jsx          # C&A / Club Royale / Captain's Club / Blue Chip
        │   ├── PortfolioSummary.jsx     # Aggregate fare / OBC / savings / next payment
        │   ├── WatchlistForm.jsx        # Watchlist + prospective cruise entry form
        │   ├── PriceTrendChart.jsx      # Per-reservation price-over-time chart
        │   ├── RunDiff.jsx              # "What changed since last run" banner
        │   ├── ScheduledHistory.jsx     # Run History tab
        │   ├── TripFinanceOS.jsx        # Trip Finance OS tab
        │   ├── CasinoAnalytics.jsx      # Casino Analytics tab
        │   ├── CasinoYearTracker.jsx    # Casino Year tab
        │   ├── LinkGenerator.jsx        # PDF Generator tab
        │   └── PdfPreviewModal.jsx      # Shared PDF preview modal
        ├── data/
        │   └── constants.js
        └── utils/
            ├── helpers.js               # localStorage helpers, formatting, FX rate
            └── exportRun.js             # CSV export + print-to-PDF
```

**Never committed** (see `.gitignore`): `backend/secrets/accounts.json`, `backend/secrets/notify.json`, `backend/secrets/watchlist.json` (credentials and personal config), `backend/data/history.json` (personal run history), `node_modules/`, `__pycache__/`, `.env`.

---

## Quick start (local)

**Prerequisites:** Docker Desktop

```bash
git clone https://github.com/J-i-n-g-Yang/Royal-Carribean-Tracker.git
cd Royal-Carribean-Tracker
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5050 (health check at `/api/health`) — mapped from the container's internal port 5000

The frontend's Price Checker and Run History tabs call the backend at `http://localhost:5050` by default. This is configurable via `REACT_APP_API_URL` in `docker-compose.yml`.

---

## Dashboard tabs

### PDF Generator
Generates cruise-planner PDF links for a given year and month across standard booking codes. Paste a raw offer code to look up its PDF directly.

### Trip Finance OS
Per-trip cost tracker with a SGD / USD split. Tracks cruise fare, taxes, airfare, hotel, roaming, insurance, onboard spending, casino spend, and perks. Applies a live or manual USD → SGD FX rate. Calculates gross and net cost per trip, casino cost-per-point, and points progress toward a goal.

### Casino Analytics
Visualises casino spend and points across all your trips. Shows spend vs. goal progress, points efficiency, and comparative analytics across sailings.

### Casino Year
Year-over-year casino tracker. Compares casino activity across calendar years.

### Price Checker
The main tool — see [Price Checker — how it works](#price-checker--how-it-works) below.

### Run History
A dashboard of all past price-check runs. See [Run History dashboard](#run-history-dashboard) below.

---

## Price Checker — how it works

1. Enter one or more Royal Caribbean / Celebrity account credentials. Usernames (and your discount flags — senior, military, fire, police) are remembered in `localStorage` between sessions. Passwords are **never** saved anywhere — you re-enter them each session.
2. Optionally add watchlist items or prospective cruises in the collapsible Watchlist section below the account forms (see [Watchlist & prospective cruises](#watchlist--prospective-cruises)).
3. Click **Run Price Check**. The React app POSTs to `http://localhost:5050/api/check`.
4. The backend calls `CheckRoyalCaribbeanPrice.py`'s login, profile, and voyage functions — the core engine is unchanged. It captures the structured output, parses it into per-reservation JSON (price drops, best-price confirmations, add-on rebooks, onboard credit, check-in dates, balance due), and returns the whole result.
5. The UI renders:
   - **Summary banner** — total savings found, or "all prices confirmed"
   - **What Changed Since Last Run** — only reservations where the price actually moved vs. the previous run
   - **Portfolio Summary** — total fare across all reservations, total onboard credit, total potential savings on the table, next final payment due
   - **Loyalty Status** — Crown & Anchor, Club Royale (Casino Royale), Captain's Club, and Blue Chip tier + points per account
   - **Price Trend Chart** — select a reservation to see its fare plotted across your last 30 runs
   - **Check-in & Balance Summary** — table of all reservations with check-in open date and final payment status
   - **Per-reservation cards** — expandable, showing each cabin/add-on finding with actionable detail
   - **Watchlist hits** — prospective cruise or add-on price alerts
   - **Raw log** — collapsible fallback showing the engine's full output
   - **Export buttons** — CSV download and Print / Save as PDF

---

## Watchlist & prospective cruises

Two types of items can be tracked beyond your existing reservations.

### Watch list (add-ons on existing bookings)
Track a specific add-on or cabin category on a booking you already have. You'll be notified when it drops below your target price.

Fields:

| Field | Description |
|---|---|
| Name | Human-readable label, e.g. "VOOM Internet - 3 Devices" |
| Target price | Alert me when it drops below this amount |
| Prefix / Product | Cruise-planner category/product code from the add-on's URL — leave blank if unsure |
| Currency | e.g. `SGD` or `USD` |
| Reservation IDs | Comma-separated list of reservation numbers this applies to |

### Prospective cruises (unbooked sailings)
Track an unbooked cruise by its Royal Caribbean or Celebrity cruise-planner URL. You'll be alerted if the price drops below your target.

Fields:

| Field | Description |
|---|---|
| Cruise planner URL | Full URL from royalcaribbean.com or celebritycruises.com |
| Alert me below this price | Threshold in whatever currency the page shows |
| Loyalty number | Your C&A / Captain's Club number — used to apply member pricing |

### Persistence
Watchlist and prospective cruise entries are saved to `localStorage` and restored automatically on the next session, so you don't need to re-enter them each time.

### Using with the scheduler
To include watchlist/prospective items in automated runs, set the `RC_WATCHLIST_JSON` secret in GitHub Actions (see [GitHub Actions secrets](#github-actions-secrets)), or create `backend/secrets/watchlist.json` for the local Docker scheduler, matching the format under `RC_WATCHLIST_JSON format` below.

---

## Notifications

The engine calls Apprise notifications at every meaningful price-alert point (cabin price drops, add-on rebooks, "room no longer available"). `check_runner.py` wires up an [Apprise](https://github.com/caronc/apprise) object from one of three sources, in priority order:

1. **`notify_urls` in the POST payload** — one-off override for a single run, useful for testing from the UI
2. **`NOTIFY_URLS` env var** — comma-separated Apprise URLs; not set by default — add it under the `backend` service in `docker-compose.yml` if you want this path
3. **`backend/secrets/notify.json`** — persistent list of Apprise URLs, used for all runs

### Setting up email notifications (Gmail)
1. Copy `backend/secrets/notify.example.json` to `backend/secrets/notify.json`.
2. Enable 2-Step Verification on the sending Gmail account, then generate an [App Password](https://myaccount.google.com/apppasswords).
3. Add your URL:
   ```json
   ["mailto://your_email%40gmail.com:your_app_password@gmail.com?to=you@example.com"]
   ```
   Note: the `@` in the sending address must be URL-encoded as `%40`.
4. Rebuild the backend (`docker compose up --build`).

Apprise also supports Telegram, Discord, Slack, and many more. Any valid Apprise URL works — see the [Apprise documentation](https://github.com/caronc/apprise#popular-notification-services) for the full list.

### Testing notifications from the UI
Paste any Apprise URL into the notification field in the Price Checker tab and click **Send Test** — it fires a test notification immediately without touching `notify.json`. This URL is used for that session only and is never saved.

### Run summary notifications
After every check, you can send yourself a "here's the state of all your bookings" summary notification independently of any price-drop alerts, using the **Email me this summary** button in results. This also fires automatically in the GitHub Actions scheduled run (opt out with `RC_RUN_SUMMARY=0`).

---

## Scheduled runs

There are two independent ways to run checks automatically:

### 1. GitHub Actions (recommended — no server needed)
`scheduled-check.yml` runs `scheduled_run.py` directly on GitHub's runners on a daily schedule, and can also be triggered manually from the Actions tab via `workflow_dispatch`. No Docker, no server, no machine needs to be on. Requires `RC_ACCOUNTS_JSON` set as a GitHub Actions secret (see below).

Because `CheckRoyalCaribbeanPrice.py` logs login progress, cabin numbers, prices, and the account's own username straight to the console, `scheduled_run.py` suppresses that console output and masks each credential field individually with `::add-mask::` before anything is printed — otherwise your email address and reservation details would be published in the public Actions run log.

Run history is preserved across runs via `actions/cache` so the "what changed since last run" diffing continues to work.

### 2. Local Docker APScheduler
Set `RC_SCHEDULE_INTERVAL_MINUTES` to a positive integer in `docker-compose.yml` and ensure `backend/secrets/accounts.json` exists (the scheduler starts in disabled mode if the file is missing or unreadable — it will not error). The backend will run a check automatically on that interval while the container is running.

```yaml
# docker-compose.yml — backend environment:
- RC_SCHEDULE_INTERVAL_MINUTES=360   # every 6 hours
```

Credentials format for `backend/secrets/accounts.json`:

```json
[
  {
    "username": "you@example.com",
    "password": "yourpassword",
    "cruise_line": "royalcaribbean",
    "senior": false,
    "military": false,
    "fire": false,
    "police": false
  }
]
```

---

## Run History dashboard

The **Run History** tab shows everything stored in `backend/data/history.json` (local) or the GitHub Actions cache (scheduled). Up to 50 runs are kept (`/api/history` returns 20 by default; pass `?limit=N` up to 50).

- **Scheduler status banner** — whether `RC_SCHEDULE_INTERVAL_MINUTES` is set, the current interval, and when the next run is due
- **Stats row** — total runs, success rate, all-time hit count, cumulative savings value
- **Price-change timeline** — collapsible chronological list of every price move across all stored runs
- **Per-run rows** — expandable, each showing: timestamp, accounts checked, hit badges, savings breakdown, price diffs for that run, compact reservation list, and notification status

> **Note:** Local Docker runs and GitHub Actions scheduled runs write to separate history files and have no shared state. The Run History tab only shows runs from the same environment as the backend it's talking to.

---

## GitHub Actions workflows

### `deploy.yml` — Frontend deployment
Triggers on every push to any branch.

| Branch | Behaviour | URL |
|---|---|---|
| `main` | Builds + deploys to root of `gh-pages` | `https://J-i-n-g-Yang.github.io/Royal-Carribean-Tracker` |
| Any other | Builds + deploys to `preview/<branch-slug>`, URL posted as commit status | `https://J-i-n-g-Yang.github.io/Royal-Carribean-Tracker/preview/<branch>` |

**One-time setup:** go to your repo → Settings → Pages → Source → select **GitHub Actions**.

### `scheduled-check.yml` — Daily price check
Runs on a daily schedule, and can also be triggered manually from the Actions tab via `workflow_dispatch`.

Steps:
1. Checkout the repo
2. Restore `backend/data/` from cache (preserves run history for diffing)
3. Install Python dependencies
4. Run `python scheduled_run.py`

The script suppresses the engine's verbose console output (which would include your email address and reservation details) since Actions logs on a public repo are publicly visible. Credentials are masked via `::add-mask::` before any output is produced.

---

## GitHub Actions secrets

Set these in your repo → **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Required | Description |
|---|---|---|
| `RC_ACCOUNTS_JSON` | Yes (for scheduled checks) | JSON array of account objects — see format below |
| `NOTIFY_URLS` | No | Comma-separated Apprise URLs for notifications, e.g. `tgram://token/chatid` |
| `RC_WATCHLIST_JSON` | No | JSON object with `watch_list` and `prospective_cruises` arrays |

### `RC_ACCOUNTS_JSON` format

```json
[
  {
    "username": "you@example.com",
    "password": "yourpassword",
    "cruise_line": "royalcaribbean",
    "senior": false,
    "military": false,
    "fire": false,
    "police": false
  }
]
```

### `RC_WATCHLIST_JSON` format

```json
{
  "watch_list": [
    {
      "name": "VOOM High Speed Internet Package - 3 Devices",
      "prefix": "",
      "product": "",
      "price": 25.00,
      "currency": "SGD",
      "guest_age_string": "adult",
      "enabled": true,
      "reservations": ["1234567", "8901234"]
    }
  ],
  "prospective_cruises": [
    {
      "cruise_URL": "https://www.royalcaribbean.com/sgp/en/...",
      "paid_price": 4000.00,
      "loyalty_number": 389324606
    }
  ]
}
```

`watch_list` and `prospective_cruises` are both optional — include only what you need. This is the same shape used by `backend/secrets/watchlist.json` for the local scheduler.

---

## Backend API reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health check + scheduler running status |
| `/api/check` | POST | Run a price check — see payload below |
| `/api/history` | GET | Recent run summaries (`?limit=N`, default 20, max 50) |
| `/api/history/<run_id>` | GET | Full record for a single run including log lines |
| `/api/history` | DELETE | Clear all stored run history |
| `/api/scheduler/status` | GET | Background scheduler status + next run time |
| `/api/notify/status` | GET | Notification config diagnostic snapshot |
| `/api/notify/test` | POST | Fire a test notification to all configured URLs |
| `/api/notify/summary` | POST | Send a run summary notification (`{"run_id": N}` or omit for latest) |

### `/api/check` payload

```json
{
  "accounts": [
    {
      "username": "you@example.com",
      "password": "yourpassword",
      "cruise_line": "royalcaribbean",
      "senior": false,
      "military": false,
      "fire": false,
      "police": false
    }
  ],
  "watch_list": [],
  "prospective_cruises": [],
  "notify_urls": []
}
```

At least one account or one prospective cruise is required, or the endpoint returns `400`. Only one check can run at a time — a second request while one is in progress returns `409`.

---

## Configuration reference

### `docker-compose.yml` environment variables

| Variable | Default | Description |
|---|---|---|
| `RC_FORCE_PLAIN_REQUESTS` | `1` | `1` uses plain `requests`; `0` uses `curl_cffi` TLS impersonation (more bot-resistant but was timing out in some Docker Desktop setups) |
| `RC_SCHEDULE_INTERVAL_MINUTES` | `0` | `0` disables the local APScheduler. Set to e.g. `360` to auto-check every 6 hours |
| `REACT_APP_API_URL` | `http://localhost:5050` | Backend URL the frontend calls — change if you expose the backend on a different host/port |

### `RC_RUN_SUMMARY` (GitHub Actions only)
Set to `0` in the workflow env to suppress the post-run summary notification. Default is `1` (always send).

### `backend/secrets/` files

| File | Purpose |
|---|---|
| `accounts.json` | Credentials for the local Docker APScheduler (format above; no `.example.json` currently ships — see [Known repo issues](#known-repo-issues)) |
| `notify.json` | Persistent Apprise notification URLs (see `notify.example.json`) |
| `watchlist.json` | Watchlist + prospective cruises for the local Docker APScheduler (same format as `RC_WATCHLIST_JSON` above) |

All three are gitignored and volume-mounted read-only into the backend container.

### `config.yaml` (engine-level overrides)
Category overrides (`categoryOverride`, `subcategoryOverride`), reservations to mark as paid-in-full (`reservationsPaidInFull`), reservation nicknames, and known prices can be set per reservation ID. See inline comments in `CheckRoyalCaribbeanPrice.py`'s config loader for the full schema.

---

## Data storage & privacy

| Data | Where stored | Committed? |
|---|---|---|
| Run history (findings, prices, loyalty) | `backend/data/history.json` (local) or `actions/cache` (GitHub Actions) | No — gitignored |
| Account credentials | Memory only for the duration of a single run | Never |
| Account usernames + flags | Browser `localStorage` | No |
| Watchlist / prospective cruise entries | Browser `localStorage` | No |
| Notification URLs | `backend/secrets/notify.json` or env var | No — gitignored |
| Scheduler credentials | `backend/secrets/accounts.json` | No — gitignored |

Passwords are never written to disk, never logged, and never included in history records. The GitHub Actions scheduled run masks credentials with `::add-mask::` before any output is produced, since Actions logs on a public repo are publicly visible.

---

## Known repo issues

These don't affect app behaviour but are worth cleaning up:

- **`backend/secrets/accounts.example.json` is missing.** `scheduler.py` and this README both point to it as the schema reference for `accounts.json`, but only `notify.example.json` and a watchlist example currently exist in `backend/secrets/`. Add one using the format under [Scheduled runs](#scheduled-runs).
- **The watchlist example file is misnamed.** It currently exists as `backend/secrets/watchlist.example copy.json` (with a space, and an extra "copy") instead of `watchlist.example.json`. Since `.gitignore` only allow-lists `backend/secrets/*.example.json`, this file won't be committed under its current name.
- **`frontend/requirements.txt` looks misplaced.** It contains `flask` and `flask-cors` (backend dependencies) but lives under `frontend/`, which is a Node project — the frontend `Dockerfile` doesn't reference it. It's likely a stray copy of `backend/requirements.txt` and safe to delete.

---

## Troubleshooting

**"Could not reach the backend at http://localhost:5050"**
You're either opening the GitHub Pages URL (which only serves the static frontend — the backend doesn't exist there) or the backend container isn't running. Run `docker compose up` and open http://localhost:3000 instead.

**`(node:XX) [DEP_WEBPACK_DEV_SERVER_ON_...] DeprecationWarning` in frontend logs**
Cosmetic only — comes from inside `react-scripts@5.0.1`'s bundled webpack-dev-server. Safe to ignore.

**`Attempting to bind to HOST environment variable: 0.0.0.0` in frontend logs**
Expected — set deliberately in the frontend Dockerfile so the dev server is reachable from outside the container.

**`TypeError: Object of type date is not JSON serializable` on `/api/check`**
Fixed — `check_runner.py` now converts date objects to ISO strings before returning or persisting them.

**`INTERIOR None` / category shown as blank for a GTY (guarantee) room**
GTY bookings don't get a category code from the API before room assignment. The engine guesses from the room type letter and brand. If the guess is wrong for a specific reservation, override it in `config.yaml` with `categoryOverride`.

**Price trend chart shows "not enough runs"**
The chart needs at least two runs with a comparable price for the same reservation. Run a few more checks over time and the line will appear. Note that local Docker runs and GitHub Actions runs have separate history files — the chart only plots from whichever backend is currently running.

**Scheduled check runs but nothing changed — did it actually work?**
Yes — a run that finds no price changes is a successful run. Check the Run History tab (requires the local backend) or the GitHub Actions run log for confirmation. If `RC_RUN_SUMMARY=1` (the default), you'll also receive a summary notification even when nothing changed.

**A watchlist item isn't being checked in the scheduled run**
Make sure `RC_WATCHLIST_JSON` is set as a GitHub Actions secret, or `backend/secrets/watchlist.json` exists for the local scheduler. The watchlist entries you add in the UI are stored in your browser's `localStorage` — they don't automatically flow into the scheduler, which has no access to your browser.
