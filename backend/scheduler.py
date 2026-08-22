"""
Optional background scheduler for automatic periodic price checks.

Enabled by setting RC_SCHEDULE_INTERVAL_MINUTES to a positive integer in the
environment (e.g. RC_SCHEDULE_INTERVAL_MINUTES=360 for every 6 hours).
Set to 0 (the default) to disable scheduled runs entirely.

Credentials are loaded from  backend/secrets/accounts.json  (mounted read-only
in docker-compose.yml). The file must not exist for manual-only setups — the
scheduler will start in disabled mode if the file is missing or unreadable.

accounts.json format:
[
  {
    "username": "you@example.com",
    "password": "hunter2",
    "cruise_line": "royalcaribbean",
    "senior": false,
    "military": false,
    "fire": false,
    "police": false
  }
]

The scheduler calls the same check_runner.run_check() that the /api/check
endpoint uses, so all results are persisted to history_store automatically.
"""

import json
import logging
import os
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

SECRETS_FILE = os.path.join(
    os.path.dirname(__file__), "secrets", "accounts.json"
)
INTERVAL_MINUTES = int(os.environ.get("RC_SCHEDULE_INTERVAL_MINUTES", "0"))

_scheduler = None   # APScheduler BackgroundScheduler instance, or None


def _load_accounts() -> List[Dict[str, Any]]:
    """
    Read credentials from secrets/accounts.json.
    Returns an empty list if the file is missing, empty, or invalid JSON —
    the caller treats that as "no scheduled check configured".
    """
    try:
        with open(SECRETS_FILE, "r", encoding="utf-8") as f:
            accounts = json.load(f)
        if isinstance(accounts, list) and accounts:
            return accounts
        logger.warning("scheduler: %s is empty or not a list — skipping", SECRETS_FILE)
    except FileNotFoundError:
        pass   # normal for manual-only setups
    except json.JSONDecodeError as exc:
        logger.error("scheduler: could not parse %s — %s", SECRETS_FILE, exc)
    return []


def _scheduled_job() -> None:
    """
    The function APScheduler calls on each tick.

    Imports check_runner lazily so this module can be imported at app startup
    without triggering the heavy CheckRoyalCaribbeanPrice import until the
    first scheduled run.
    """
    import check_runner  # local import to defer the heavy load

    accounts = _load_accounts()
    if not accounts:
        logger.info("scheduler: no accounts configured — skipping run")
        return

    logger.info(
        "scheduler: starting automatic check for %d account(s)",
        len(accounts),
    )
    payload: Dict[str, Any] = {"accounts": accounts}
    try:
        result = check_runner.run_check(payload)
        summary = result.get("summary") or {}
        hit_count = summary.get("hit_count", 0)
        logger.info(
            "scheduler: check complete — success=%s, hits=%d",
            result.get("success"),
            hit_count,
        )
    except Exception:  # noqa: BLE001
        logger.exception("scheduler: unhandled error during scheduled run")


def start(app=None) -> bool:
    """
    Start the APScheduler background scheduler if INTERVAL_MINUTES > 0 and
    credentials are available.

    Returns True if the scheduler was started, False otherwise.

    Parameters
    ----------
    app   Optional Flask app — if supplied the scheduler starts inside an
          app context so any Flask-aware code in the job can access g/config.
    """
    global _scheduler

    if INTERVAL_MINUTES <= 0:
        logger.info(
            "scheduler: RC_SCHEDULE_INTERVAL_MINUTES=%d — automatic checks disabled",
            INTERVAL_MINUTES,
        )
        return False

    accounts = _load_accounts()
    if not accounts:
        logger.info(
            "scheduler: no accounts.json found in secrets/ — automatic checks disabled"
        )
        return False

    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.interval import IntervalTrigger
    except ImportError:
        logger.error(
            "scheduler: APScheduler is not installed — automatic checks disabled. "
            "Add 'APScheduler' to requirements.txt and rebuild."
        )
        return False

    def _job_wrapper():
        if app is not None:
            with app.app_context():
                _scheduled_job()
        else:
            _scheduled_job()

    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        _job_wrapper,
        trigger=IntervalTrigger(minutes=INTERVAL_MINUTES),
        id="price_check",
        name="Automatic price check",
        replace_existing=True,
        # Also fire immediately on startup so you don't wait for the first interval
        next_run_time=None,
    )
    _scheduler.start()

    logger.info(
        "scheduler: started — will run every %d minute(s) for %d account(s)",
        INTERVAL_MINUTES,
        len(accounts),
    )
    return True


def stop() -> None:
    """Gracefully shut down the scheduler (called on Flask teardown)."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler: stopped")
    _scheduler = None


def status() -> Dict[str, Any]:
    """Return a JSON-serialisable status dict for the /api/scheduler/status endpoint."""
    if _scheduler is None or not _scheduler.running:
        return {
            "running": False,
            "interval_minutes": INTERVAL_MINUTES,
            "next_run": None,
        }

    jobs = _scheduler.get_jobs()
    next_run = None
    if jobs:
        nr = jobs[0].next_run_time
        next_run = nr.isoformat() if nr else None

    return {
        "running": True,
        "interval_minutes": INTERVAL_MINUTES,
        "next_run": next_run,
        "job_count": len(jobs),
    }
