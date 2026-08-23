"""
Flask API wrapper around CheckRoyalCaribbeanPrice.py.

All price-check execution logic lives in check_runner.py so it can be shared
with the optional background scheduler in scheduler.py.

Credentials are only ever kept in memory for the duration of a single request.
They are never written to disk or logged.
"""
import logging
import os

from flask import Flask, jsonify, request
from flask_cors import CORS

import check_runner
import digest
import history_store
import scheduler

# Diagnostic escape hatch: curl_cffi's TLS-impersonation binary can misbehave
# inside some container/Docker Desktop setups. Setting RC_FORCE_PLAIN_REQUESTS=1
# falls back to plain requests to isolate whether an issue is curl_cffi-specific.
import CheckRoyalCaribbeanPrice as engine
if os.environ.get("RC_FORCE_PLAIN_REQUESTS") == "1":
    engine.requests = engine.plain_requests
    engine.IMPERSONATE_ARGS = {}
    print("RC_FORCE_PLAIN_REQUESTS=1 — using plain requests instead of curl_cffi")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = Flask(__name__)
CORS(app)  # allow the React dev server (different origin) to call this API

# Start the optional background scheduler (no-op if INTERVAL_MINUTES=0)
scheduler.start(app=app)


# ── Health ────────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "scheduler": scheduler.status()})


# ── Price check ───────────────────────────────────────────────────────────────

@app.route("/api/check", methods=["POST"])
def check():
    payload = request.get_json(force=True, silent=True) or {}
    if not payload.get("accounts") and not payload.get("prospective_cruises"):
        return (
            jsonify({"success": False, "error": "Provide at least one account or prospective cruise."}),
            400,
        )

    if check_runner.is_locked():
        return (
            jsonify({"success": False, "error": "A check is already running. Please wait."}),
            409,
        )

    try:
        result = check_runner.run_check(payload)
    except RuntimeError as exc:
        return jsonify({"success": False, "error": str(exc)}), 409

    status_code = 200 if result["success"] else 500
    return jsonify(result), status_code


# ── Notifications ─────────────────────────────────────────────────────────────

@app.route("/api/notify/status", methods=["GET"])
def notify_status():
    """
    Diagnostic snapshot of notification config — surfaces things like a
    malformed backend/secrets/notify.json that would otherwise fail silently
    (server-side log only) with no indication in the UI.
    """
    return jsonify(check_runner.get_notify_status())


@app.route("/api/notify/test", methods=["POST"])
def notify_test():
    """
    Fires an immediate test notification (independent of any price check) to
    every configured Apprise URL — config file, NOTIFY_URLS env var, or a
    one-off notify_urls override in the request body. Useful for confirming
    a new Telegram/email/Discord URL actually delivers before relying on it.
    """
    payload = request.get_json(force=True, silent=True) or {}
    result = check_runner.send_test_notification(payload.get("notify_urls"))
    status_code = 200 if result["success"] else 500
    return jsonify(result), status_code


@app.route("/api/notify/summary", methods=["POST"])
def notify_summary():
    """
    Sends an unconditional "here's the state of your bookings" notification
    for a completed run — defaults to the most recent run if no run_id is
    given. Independent of the engine's own price-drop-only alerts.
    """
    payload = request.get_json(force=True, silent=True) or {}
    run_id = payload.get("run_id")

    if run_id is not None:
        record = history_store.get_run(int(run_id))
        if record is None:
            return jsonify({"success": False, "error": f"Run {run_id} not found."}), 404
    else:
        recent = history_store.get_history(limit=1)
        if not recent:
            return jsonify({"success": False, "error": "No runs in history yet."}), 404
        record = recent[0]

    result = check_runner.send_run_summary(record, payload.get("notify_urls"))
    status_code = 200 if result["success"] else 500
    return jsonify(result), status_code


@app.route("/api/digest/preview", methods=["GET"])
def digest_preview():
    """
    Builds (but does not send) the digest text for the last N days — lets
    the UI show what a digest would look like right now before firing it.
    ?days=N, default 7.
    """
    days = int(request.args.get("days", digest.DEFAULT_DIGEST_DAYS))
    return jsonify(digest.build_digest(days=days))


@app.route("/api/digest/send", methods=["POST"])
def digest_send():
    """
    Builds and sends the digest through Apprise right now — same
    "notify_urls" one-off-override convention as /api/notify/test.
    Body: {"days": 7, "notify_urls": [...]} — both optional.
    """
    payload = request.get_json(force=True, silent=True) or {}
    days = int(payload.get("days", digest.DEFAULT_DIGEST_DAYS))
    result = digest.send_digest(days=days, notify_urls_override=payload.get("notify_urls"))
    status_code = 200 if result["success"] else 500
    return jsonify(result), status_code


# ── Run history ───────────────────────────────────────────────────────────────

@app.route("/api/history", methods=["GET"])
def history():
    """Return the most recent 20 run summaries (no log lines — use /api/history/<id>)."""
    limit = min(int(request.args.get("limit", 20)), 50)
    return jsonify({"runs": history_store.get_history(limit=limit)})


@app.route("/api/history/<int:run_id>", methods=["GET"])
def history_run(run_id: int):
    """Return the full record for a single run including log lines."""
    run = history_store.get_run(run_id)
    if run is None:
        return jsonify({"error": f"Run {run_id} not found."}), 404
    return jsonify(run)


@app.route("/api/history", methods=["DELETE"])
def history_clear():
    """Delete all stored run history."""
    count = history_store.clear_history()
    return jsonify({"deleted": count})


# ── Scheduler status ──────────────────────────────────────────────────────────

@app.route("/api/scheduler/status", methods=["GET"])
def scheduler_status():
    return jsonify(scheduler.status())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
