"""
Digest mode: rolls up N days of stored run history into a single readable
summary notification, instead of (or alongside) the per-run price-drop
alerts the engine already fires.

Pure aggregation over history_store — this makes zero calls to Royal
Caribbean / Celebrity's servers, so it's safe to run independently of an
actual price check (e.g. on its own weekly GitHub Actions schedule) and
can't affect check accuracy or trigger anything account-related.

Reuses check_runner's notify-URL resolution and Apprise object builder so
digest.py, check_runner.py, and app.py all agree on where notification URLs
come from (payload override -> NOTIFY_URLS env var -> secrets/notify.json).
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import CheckRoyalCaribbeanPrice as engine
import history_store
from check_runner import _resolve_notify_urls, _build_apprise_object  # noqa: F401 (intentional reuse)

logger = logging.getLogger(__name__)

DEFAULT_DIGEST_DAYS = 7


def _parse_ts(run: Dict[str, Any]) -> Optional[datetime]:
    ts = run.get("timestamp")
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts)
    except ValueError:
        return None


def _runs_in_window(days: int) -> List[Dict[str, Any]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    runs = history_store.get_history(limit=history_store.MAX_RUNS)
    windowed = []
    for run in runs:
        ts = _parse_ts(run)
        if ts is not None and ts >= cutoff:
            windowed.append(run)
    return windowed


def build_digest(days: int = DEFAULT_DIGEST_DAYS) -> Dict[str, Any]:
    """
    Returns {"text": str, "run_count": int, "hit_count": int,
    "total_savings": float, "upcoming_final_payments": [...]} summarizing
    the last `days` days of runs. Does not send anything — see send_digest().
    """
    runs = _runs_in_window(days)

    total_runs = len(runs)
    successful_runs = sum(1 for r in runs if r.get("success"))
    all_hits: List[Dict[str, Any]] = []
    total_cabin_savings = 0.0

    for run in runs:
        summary = run.get("summary") or {}
        for hit in summary.get("hits", []):
            all_hits.append({**hit, "run_id": run.get("run_id"), "timestamp": run.get("timestamp")})
        total_cabin_savings += summary.get("total_cabin_savings", 0) or 0

    # Upcoming final payments: pulled from the MOST RECENT run only (each run's
    # checkin_payment_rows is already a full current snapshot, not incremental,
    # so summing across runs in the window would double/triple-count the same
    # reservation). Only surface ones due in the next 14 days so the digest
    # stays focused on what actually needs action soon.
    upcoming_final_payments: List[Dict[str, Any]] = []
    if runs:
        latest_rows = runs[0].get("checkin_payment_rows") or []
        soon_cutoff = datetime.now(timezone.utc) + timedelta(days=14)
        for row in latest_rows:
            fp = row.get("final_payment")
            if not fp or row.get("balance_due") is not True:
                continue
            try:
                fp_dt = datetime.fromisoformat(fp)
                if fp_dt.tzinfo is None:
                    fp_dt = fp_dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if fp_dt <= soon_cutoff:
                upcoming_final_payments.append({
                    "name": row.get("name"),
                    "reservation": row.get("reservation"),
                    "final_payment_display": row.get("final_payment_display"),
                    "past_final_payment": row.get("past_final_payment"),
                })

    lines = [f"Cruise Tracker Digest — last {days} days", ""]
    lines.append(f"Runs: {total_runs} ({successful_runs} successful)")
    lines.append(f"Price-drop hits found: {len(all_hits)}")
    if total_cabin_savings > 0:
        lines.append(f"Total potential cabin savings across hits: {total_cabin_savings:.2f}")

    if all_hits:
        lines.append("")
        lines.append("Hits this period:")
        for h in all_hits[:15]:  # cap so a busy week doesn't produce a wall of text
            desc = h.get("description") or h.get("item") or "price change"
            lines.append(f"  - [{h.get('ship') or 'Reservation ' + str(h.get('reservation_id'))}] {desc}")
        if len(all_hits) > 15:
            lines.append(f"  ... and {len(all_hits) - 15} more (see Run History tab for the full list)")

    if upcoming_final_payments:
        lines.append("")
        lines.append("Final payments due within 14 days:")
        for fp in upcoming_final_payments:
            flag = " (PAST DUE)" if fp.get("past_final_payment") else ""
            lines.append(f"  - {fp.get('name')} (res #{fp.get('reservation')}): {fp.get('final_payment_display')}{flag}")

    if not all_hits and not upcoming_final_payments:
        lines.append("")
        lines.append("Nothing new to act on this period — all prices confirmed, no payments due soon.")

    return {
        "text": "\n".join(lines),
        "run_count": total_runs,
        "hit_count": len(all_hits),
        "total_savings": round(total_cabin_savings, 2),
        "upcoming_final_payments": upcoming_final_payments,
    }


def send_digest(days: int = DEFAULT_DIGEST_DAYS, notify_urls_override: Optional[List[str]] = None) -> Dict[str, Any]:
    """Builds the digest and fires it through Apprise. Mirrors check_runner's
    send_test_notification()/send_run_summary() error-shape conventions."""
    digest = build_digest(days)

    urls = _resolve_notify_urls(notify_urls_override)
    if not urls:
        return {
            "success": False,
            "error": "No notification URLs configured — set backend/secrets/notify.json, "
                     "the NOTIFY_URLS env var, or pass notify_urls in this request.",
            "digest": digest,
        }

    apobj = _build_apprise_object(urls)
    if apobj is None:
        return {
            "success": False,
            "error": "The 'apprise' package isn't installed — add it to requirements.txt and rebuild.",
            "digest": digest,
        }

    try:
        sent = apobj.notify(
            body=digest["text"],
            title="Cruise Tracker Digest",
            body_format=engine.NotifyFormat.TEXT,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("digest: failed to send")
        return {"success": False, "error": str(exc), "digest": digest}

    return {"success": bool(sent), "digest": digest}
