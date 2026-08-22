# Royal Caribbean Dashboard + Price Checker (local Docker setup)

This combines two projects into one local, Docker-run stack:

- **frontend/** — React dashboard (PDF links, Trip Finance OS, Casino Analytics, Casino Year), plus a **Price Checker** tab
- **backend/** — a small Flask API that wraps `CheckRoyalCaribbeanPrice.py` (the existing price-checking script, unmodified in its core logic) so the React app can call it over HTTP

## Project structure

```
Royal-Carribean-Tracker-fixed/
├── docker-compose.yml          # Orchestrates both services
├── README.md                   # This file
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
        │   ├── TripFinanceOS.jsx     # Trip finance dashboard tab
        │   ├── CasinoAnalytics.jsx   # Casino analytics tab
        │   ├── CasinoYearTracker.jsx # Casino year-over-year tracker tab
        │   ├── LinkGenerator.jsx     # Cruise-planner link generator tab
        │   └── PdfPreviewModal.jsx   # Shared PDF preview modal
        ├── data/
        │   └── constants.js
        └── utils/
            └── helpers.js      # localStorage/session helpers, formatting, etc.
```

**Not committed to version control** (see "Notes" below for what should be in `.gitignore`): `backend/data/history.json` (your personal run history), `backend/secrets/accounts.json` (your credentials, if using the scheduler), and the usual `node_modules/`, `__pycache__/`, `.env`.

## Run it

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5050 (health check at `/api/health`)

The frontend's "Price Checker" tab calls the backend at `http://localhost:5050` by default (configurable via `REACT_APP_API_URL` in `docker-compose.yml`).

## How the Price Checker tab works

1. You enter one or more Royal Caribbean / Celebrity account logins in the UI (passwords are never saved to disk or localStorage — only usernames/flags are remembered between sessions).
2. On "Run Price Check", the React app POSTs to `backend:5000/api/check`.
3. The backend calls the same `login`, `get_profile`, and `get_voyages` functions from `CheckRoyalCaribbeanPrice.py` that the CLI tool uses — nothing about the core price-checking logic was rewritten.
4. It captures the script's log output and its structured check-in/balance-due summary table, parses that log into per-reservation cards (price drops, best-price confirmations, add-on rebooks, onboard credit), and returns it all as JSON.
5. The UI renders a savings summary banner, a Check-in & Balance Summary table, per-reservation cards (expandable for details), watchlist hits, and a collapsible raw log as a fallback.

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

- Only account-based checks (login + your existing bookings) are wired up in the UI right now — watchlist items and prospective-cruise URL tracking aren't yet exposed in the form, though the backend endpoint already accepts them (`watch_list`, `prospective_cruises` fields) if you want to extend it.
- Only one check can run at a time (the underlying script uses module-level state), so the backend rejects a second request while one is in progress (`409`).
- GTY (guarantee, unassigned-room) bookings don't get a category code back from the API before assignment; the code guesses one from the room type letter + brand and logs a warning ("Data is missing from API..."). If the guess is wrong for a specific reservation, override it in `config.yaml` (`categoryOverride`).
- This is a **local-only development setup** — the backend runs Flask's dev server and the frontend runs the CRA dev server (`npm start`), neither of which is meant for production. See "Possible improvements" below if you want to harden this for anything beyond local use.
- Nothing is deployed publicly. If you later want this hosted (e.g. via GitHub Pages + a scheduled Action), that's a different setup since GitHub Pages can't run a live backend.

## Troubleshooting

- **`(node:XX) [DEP_WEBPACK_DEV_SERVER_ON_...] DeprecationWarning`** in the frontend logs: cosmetic only, comes from inside `react-scripts@5.0.1`'s bundled webpack-dev-server config, not from this project's code. Safe to ignore.
- **`Attempting to bind to HOST environment variable: 0.0.0.0`**: expected — set deliberately in `frontend/Dockerfile` so the dev server is reachable from outside the container.
- **`TypeError: Object of type date is not JSON serializable` on `/api/check`**: fixed — `check_runner.py` now converts date objects to ISO strings before they're returned/persisted.
- **`INTERIOR None` / category shown as blank for a GTY room**: fixed — the GTY category-guess workaround is now applied consistently everywhere a category code is needed, not just in the display path.

## Possible improvements (not yet done)

These are quality/hardening upgrades worth considering if you outgrow local dev use — none are required for the app to work as-is:

- Serve the frontend as a production build (`npm run build` + a static file server) instead of the CRA dev server; run the backend behind `gunicorn` instead of Flask's dev server.
- Pin dependency versions in `backend/requirements.txt` and commit a `frontend/package-lock.json` so rebuilds are reproducible.
- Add a `.dockerignore` to both services and expand `.gitignore` to cover `backend/data/`, `backend/secrets/`, `__pycache__/`, and `.env`.
- Run both containers as a non-root user.
- Add Docker Compose healthchecks wired to the existing `/api/health` endpoint.
