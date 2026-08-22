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
