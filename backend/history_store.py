"""
Persists price-check run history to disk so the UI can show past results
across container restarts.

Storage layout:  data/history.json
  { "runs": [ <RunRecord>, ... ] }   (newest first, capped at MAX_RUNS)

A RunRecord is whatever dict _run_check() returns, augmented with:
  "run_id"    – monotonically incrementing integer
  "timestamp" – ISO-8601 UTC string of when the check completed
  "accounts"  – list of usernames checked (passwords never stored)
"""

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

DATA_DIR   = os.environ.get("RC_DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))
HISTORY_FILE = os.path.join(DATA_DIR, "history.json")
MAX_RUNS   = 50   # oldest runs are dropped when the cap is hit


def _load() -> Dict[str, Any]:
    """Load raw history dict from disk, returning a blank structure on any error."""
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("runs"), list):
            return data
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return {"runs": [], "next_id": 1}


def _save(data: Dict[str, Any]) -> None:
    """Atomically write history to disk (write-then-rename)."""
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = HISTORY_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        # default=str is a safety net: it stringifies any stray non-JSON-native
        # object (date, datetime, etc.) instead of raising and losing the whole
        # run. Known offenders should still be normalized at the source
        # (see check_runner._json_safe_rows) so this is a backstop, not the fix.
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)
    os.replace(tmp, HISTORY_FILE)


def append_run(result: Dict[str, Any], account_usernames: List[str]) -> Dict[str, Any]:
    """
    Persist one completed run to history and return the enriched record.

    Parameters
    ----------
    result            The dict returned by _run_check() in app.py.
    account_usernames List of usernames that were checked (no passwords).
    """
    data = _load()
    run_id = data.get("next_id", 1)

    record: Dict[str, Any] = {
        "run_id":    run_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "accounts":  account_usernames,
        "success":   result.get("success", False),
        "error":     result.get("error"),
        # Structured findings (from findings_parser) — may be None for old runs
        "summary":   result.get("summary"),
        "findings":  result.get("findings"),
        # Compact check-in/payment table rows
        "checkin_payment_rows": result.get("checkin_payment_rows", []),
        # Full log kept so the UI can always fall back to the raw text
        "log_lines": result.get("log_lines", []),
    }

    runs: List[Dict[str, Any]] = data.get("runs", [])
    runs.insert(0, record)          # newest first
    if len(runs) > MAX_RUNS:
        runs = runs[:MAX_RUNS]

    data["runs"]    = runs
    data["next_id"] = run_id + 1
    _save(data)
    return record


def get_history(limit: int = 20) -> List[Dict[str, Any]]:
    """
    Return the most recent `limit` run records (newest first).

    Log lines are stripped to keep the response payload small — the caller
    can fetch a single run by ID to get the full log.
    """
    data = _load()
    runs = data.get("runs", [])[:limit]
    # Return a lighter-weight view: omit log_lines from the list
    return [
        {k: v for k, v in run.items() if k != "log_lines"}
        for run in runs
    ]


def get_run(run_id: int) -> Dict[str, Any] | None:
    """Return the full record for a single run, or None if not found."""
    data = _load()
    for run in data.get("runs", []):
        if run.get("run_id") == run_id:
            return run
    return None


def clear_history() -> int:
    """Delete all stored runs. Returns the number of records that were removed."""
    data = _load()
    count = len(data.get("runs", []))
    data["runs"] = []
    _save(data)
    return count
