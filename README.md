# Royal Caribbean Dashboard + Price Checker

A React dashboard and automated price-checking tool for Royal Caribbean cruises.

**Live frontend:** [https://J-i-n-g-Yang.github.io/Royal-Carribean-Tracker](https://J-i-n-g-Yang.github.io/Royal-Carribean-Tracker)

- **frontend/** — React dashboard (PDF links, Trip Finance OS, Casino Analytics, Casino Year), plus a **Price Checker** tab — deployed to GitHub Pages via GitHub Actions
- **backend/** — a small Flask API that wraps `CheckRoyalCaribbeanPrice.py` (the existing price-checking script, unmodified in its core logic) so the React app can call it over HTTP — run locally via Docker

## Project structure

```
Royal-Carribean-Tracker/
├── docker-compose.yml          # Orchestrates both services
├── README.md                   # This file
├── .github/
│   └── workflows/
│       ├── deploy.yml          # Deploys frontend to GitHub Pages (main → production, other branches → preview)
│       └── scheduled-check.yml # Runs daily price check via GitHub Actions (no server needed)
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt        # Python dependencies
│   ├── app.py                  # Flask app — routes only, no business logic
│   ├── check_runner.py         # Shared run logic for /api/check + the scheduler
│   ├── findings_parser.py      # Parses the script's raw log into structured
│   │                           #   JSON (per-reservation cards, savings, etc.)
│   ├── history_store.py        # Persists run history to data/history.json
│   ├── scheduler.py            # Optional background auto-check (APScheduler)
│   ├── CheckRoyalCaribbeanPrice.py  # The core price-checking engine (CLI-origin,
│   │                           #   reused as-is — login, pricing, discounts, etc.)
│   ├── data/                   # Volume-mounted — persists across restarts
│   │   └── history.json        # Run history (created on first check)
│   └── secrets/                # Volume-mounted, read-only — optional, only
│       └── accounts.json       #   used by the background scheduler (see
│                                #   accounts.example.json for the schema)
│
└── frontend/
    ├── Dockerfile
    ├── package.json            # Node dependencies
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── public/
    │   └── index.html
    └── src/
        ├── index.js            # React entry point
        ├── App.js              # Top-level layout / tab navigation
        ├── style.css / tailwind.css
        ├── components/
        │   ├── PriceChecker.jsx      # The Price Checker tab (this project's addition)
        │   ├── LoyaltyCard.jsx       # Loyalty tier dashboard (C&A / Casino Royale / etc.)
        │   ├── PortfolioSummary.jsx  # Aggregate fare/OBC/savings/next-payment card
        │   ├── WatchlistForm.jsx     # Watchlist + prospective-cruise entry form
        │   ├── PriceTrendChart.jsx   # Per-reservation price-over-time chart
        │   ├── RunDiff.jsx           # "What changed since last run" banner
        │   ├── TripFinanceOS.jsx     # Trip finance dashboard tab
        │   ├── CasinoAnalytics.jsx   # Casino analytics tab
        │   ├── CasinoYearTracker.jsx # Casino year-over-year tracker tab
        │   ├── LinkGenerator.jsx     # Cruise-planner link generator tab
        │   └── PdfPreviewModal.jsx   # Shared PDF preview modal
        ├── data/
        │   └── constants.js
        └── utils/
            ├── helpers.js      # localStorage/session helpers, formatting, etc.
            └── exportRun.js    # CSV export + print-to-PDF for a check run
```

**Not committed to version control** (see `.gitignore`): `backend/secrets/accounts.json` and `backend/secrets/notify.json` (your credentials, if using the scheduler / email notifications), `backend/data/history.json` (your personal run history), and the usual `node_modules/`, `__pycache__/`, `.env`.

## Run it

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5050 (health check at `/api/health`)

The frontend's "Price Checker" tab calls the backend at `http://localhost:5050` by default (configurable via `REACT_APP_API_URL` in `docker-compose.yml`).

## GitHub Actions workflows

Two automated workflows live in `.github/workflows/`:

### `deploy.yml` — Frontend deployment
Triggers on every push to any branch. Behaviour depends on the branch:

- **`main`** → builds and deploys to the root of the `gh-pages` branch → live at https://J-i-n-g-Yang.github.io/Royal-Carribean-Tracker
- **Any other branch** → builds and deploys to a preview subfolder, with the URL posted as a commit status on GitHub → `https://J-i-n-g-Yang.github.io/Royal-Carribean-Tracker/preview/<branch-name>`

```
push to main   →  npm install  →  npm run build  →  gh-pages (root)     →  live site
push to other  →  npm install  →  npm run build  →  gh-pages (preview/)  →  preview URL on commit
```

> **Note:** The Price Checker tab requires the backend API running locally (`docker compose up`). All other tabs (PDF Generator, Trip Finance OS, Casino Analytics, Casino Year) work fully from the static GitHub Pages deployment.

### `scheduled-check.yml` — Daily price check
Runs the Python price-checker daily at 08:00 UTC without needing any server. Requires two GitHub Actions secrets set in your repo settings:

| Secret | Value |
|---|---|
| `RC_ACCOUNTS_JSON` | Your Royal Caribbean account credentials (JSON) |
| `NOTIFY_URLS` | Comma-separated Apprise URLs for email/Discord/etc. alerts |

Run history is preserved across scheduled runs via `actions/cache` (keyed to `rc-history-`) so the "what changed since last run" diffing keeps working.

## How the Price Checker tab works

1. You enter one or more Royal Caribbean / Celebrity account logins in the UI (passwords are never saved to disk or localStorage — only usernames/flags are remembered between sessions).
2. On "Run Price Check", the React app POSTs to `backend:5000/api/check`.
3. The backend calls the same `login`, `get_profile`, and `get_voyages` functions from `CheckRoyalCaribbeanPrice.py` that the CLI tool uses — nothing about the core price-checking logic was rewritten.
4. It captures the script's log output and its structured check-in/balance-due summary table, parses that log into per-reservation cards (price drops, best-price confirmations, add-on rebooks, onboard credit), and returns it all as JSON.
5. The UI renders a savings summary banner, what-changed-since-last-run diffs, a portfolio-wide summary, loyalty tier status, a price trend chart, a Check-in & Balance Summary table, per-reservation cards (expandable for details), watchlist hits, and a collapsible raw log as a fallback.

## Features

- **Price drops & best-price confirmations** — per reservation, with actionable "rebook now" cards.
- **Loyalty dashboard** — Crown & Anchor, Club Royale, Captain's Club, and Blue Chip tier/points, per account, on every run.
- **Watchlist & prospective cruises** — track a specific add-on/category on an existing booking, or an unbooked cruise-planner URL, against a target price. Fully wired up in the UI (`WatchlistForm.jsx`) — this data already flowed through the backend, it just had no form before.
- **"What changed since last run"** — the backend diffs this run's per-reservation price against the most recent previous run and returns only what actually moved (`check_runner._diff_against_previous_run`).
- **Price trend chart** — pick a reservation and see its price across your last 30 runs (`PriceTrendChart.jsx`, built entirely from `/api/history` — no backend changes needed for this one).
- **Portfolio summary** — total fare paid, total onboard credit, total potential savings on the table, and your next upcoming final payment, aggregated across every reservation in the run.
- **Email / notification bot** — see "Notifications" below.
- **Export** — download a run as CSV, or use "Print / Save as PDF" (browser-native, no extra dependency).

## Notifications ("email bot")

The engine already calls `config.apobj.notify(...)` at every meaningful price-alert point (cabin price drops, add-on price drops, "room no longer available") — it just needed an [Apprise](https://github.com/caronc/apprise) object wired up from the API side, which `check_runner.py` now does.

**To enable email alerts persistently:**

1. Copy `backend/secrets/notify.example.json` to `backend/secrets/notify.json`.
2. Add one or more [Apprise URLs](https://github.com/caronc/apprise#popular-notification-services). For Gmail specifically:
   - Turn on 2-Step Verification on the sending Google account, then generate an [App Password](https://myaccount.google.com/apppasswords).
   - Use: `mailto://your_email%40gmail.com:your_app_password@gmail.com?to=you@example.com` (note the `@` in the email is URL-encoded as `%40`).
3. Rebuild/restart the backend. Every run (manual or scheduled) will now email you automatically whenever a price drop is found.

Apprise also supports Discord, Telegram, Slack, SMS gateways, and dozens more — any Apprise URL works, not just email; see their docs for the full list.

**To test a URL without touching the secrets file:** paste an Apprise URL into the "Optional: Apprise notify URL" field in the Price Checker tab before running a check — it's used for that single run only and never saved.

Alternatively, set the `NOTIFY_URLS` env var (comma-separated Apprise URLs) in `docker-compose.yml` if you'd rather not use a secrets file.

## Backend API reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Health check + scheduler status |
| `/api/check` | POST | Run a price check for one or more accounts / prospective cruises |
| `/api/history` | GET | Last 20 run summaries (`?limit=` up to 50) |
| `/api/history/<run_id>` | GET | Full record for a single run, including log lines |
| `/api/history` | DELETE | Clear all stored run history |
| `/api/scheduler/status` | GET | Background scheduler status |

Run history is persisted to `backend/data/history.json` (mounted as a Docker volume so it survives container restarts).

## Configuration

- **`RC_FORCE_PLAIN_REQUESTS`** (env var, set in `docker-compose.yml`): `1` uses plain `requests` instead of `curl_cffi`'s TLS impersonation. Useful if `curl_cffi` times out in your Docker Desktop setup; `curl_cffi` is more resistant to bot detection when it works, so try `0` first if you're hitting request failures.
- **`RC_SCHEDULE_INTERVAL_MINUTES`** (env var): `0` disables the optional background scheduler (default). Set to e.g. `360` to auto-run a check every 6 hours — this requires account credentials in `backend/secrets/accounts.json` (see `backend/secrets/accounts.example.json`), since there's no UI to type a password into for a background job.
- **`config.yaml`**: category overrides (`categoryOverride`, `subcategoryOverride`), reservations to mark as paid-in-full (`reservationsPaidInFull`), reservation nicknames, and known prices can be set per reservation ID — see inline comments in `CheckRoyalCaribbeanPrice.py`'s config loader for the full schema.

## Notes / current limitations

- Only one check can run at a time (the underlying script uses module-level state), so the backend rejects a second request while one is in progress (`409`).
- GTY (guarantee, unassigned-room) bookings don't get a category code back from the API before assignment; the code guesses one from the room type letter + brand and logs a warning ("Data is missing from API..."). If the guess is wrong for a specific reservation, override it in `config.yaml` (`categoryOverride`).
- The price trend chart and "what changed" diff both key off a simplified "latest market price" (a price-drop's new price, or a best-price confirmation's catalog price) rather than every price ever seen — see `_latest_prices_by_reservation()` in `check_runner.py` if you want to change that logic.
- The **backend** runs Flask's dev server and is not meant for production — it's local-only. The **frontend** is deployed publicly to GitHub Pages; all tabs except Price Checker work fully without any local setup.
- The Price Checker tab requires the local backend running (`docker compose up`) since GitHub Pages can't serve a live API.
- Deliberately not built (see prior discussion): a real production hardening pass (gunicorn/static build/etc.), and support for cruise lines beyond Royal Caribbean/Celebrity.

## Troubleshooting

- **`(node:XX) [DEP_WEBPACK_DEV_SERVER_ON_...] DeprecationWarning`** in the frontend logs: cosmetic only, comes from inside `react-scripts@5.0.1`'s bundled webpack-dev-server config, not from this project's code. Safe to ignore.
- **`Attempting to bind to HOST environment variable: 0.0.0.0`**: expected — set deliberately in `frontend/Dockerfile` so the dev server is reachable from outside the container.
- **`TypeError: Object of type date is not JSON serializable` on `/api/check`**: fixed — `check_runner.py` now converts date objects to ISO strings before they're returned/persisted.
- **`INTERIOR None` / category shown as blank for a GTY room**: fixed — the GTY category-guess workaround is now applied consistently everywhere a category code is needed, not just in the display path.

## Possible improvements (not yet done)

These are quality/hardening upgrades worth considering if you outgrow local dev use — none are required for the app to work as-is:

- Serve the frontend as a production build (`npm run build` + a static file server) instead of the CRA dev server; run the backend behind `gunicorn` instead of Flask's dev server.
- Pin `backend/requirements.txt` to exact versions (`==`) once the stack is stable, for fully reproducible builds (`frontend/package-lock.json` is now committed and used by the deploy workflow for npm caching).
- Add a `.dockerignore` to both services and expand `.gitignore` to cover `backend/data/`, `backend/secrets/`, `__pycache__/`, and `.env`.
- Run both containers as a non-root user.
- Add Docker Compose healthchecks wired to the existing `/api/health` endpoint.
