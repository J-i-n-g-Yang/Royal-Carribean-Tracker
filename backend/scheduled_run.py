"""
Entry point for running a single scheduled price check with no Flask server
and no APScheduler process required — designed to be invoked directly by a
GitHub Actions cron workflow (see .github/workflows/scheduled-check.yml),
but works from any external scheduler (cron, systemd timer, etc).

It reuses check_runner.run_check() end-to-end (login, pricing, "what changed
since last run" diffing, history persistence, and Apprise notifications) so
there is no duplicated logic between the manual/API path and this one.

── Why the stdout suppression below matters ──────────────────────────────────
CheckRoyalCaribbeanPrice.setup_hybrid_logging() attaches its own console
handler directly to Python's root logger, independent of the _CapturingHandler
check_runner uses to build the structured `result` dict. That means every
engine log line (login progress, cabin numbers, prices, sail dates, and the
account's own username in "Using X for user <email>") gets printed straight
to the real console *in addition to* being returned in result["log_lines"].

On a public GitHub repo, Actions run logs are visible to anyone by default —
so if we didn't suppress this, your email address and cruise price/reservation
details would be published to the internet on every scheduled run, regardless
of anything we do with the returned `result` object.

GitHub's automatic secret redaction only matches the *exact* full value of a
registered secret. If RC_ACCOUNTS_JSON is one JSON blob containing several
accounts, GitHub will not automatically redact a single username pulled back
out of it — hence the explicit `_mask()` calls below on each individual field.

If you run this outside of GitHub Actions (e.g. a private server, plain
cron), the ::add-mask:: lines are harmless no-ops — they only mean something
to the GitHub Actions log processor.
"""

import contextlib
import io
import json
import os
import sys

import check_runner


def _mask(value: str) -> None:
    """Ask the GitHub Actions log processor to redact this value everywhere it appears."""
    if value:
        print(f"::add-mask::{value}")


def main() -> int:
    accounts_raw = os.environ.get("RC_ACCOUNTS_JSON", "")
    if not accounts_raw.strip():
        print("RC_ACCOUNTS_JSON is not set — nothing to check.", file=sys.stderr)
        return 1

    try:
        accounts = json.loads(accounts_raw)
    except json.JSONDecodeError as exc:
        print(f"RC_ACCOUNTS_JSON is not valid JSON: {exc}", file=sys.stderr)
        return 1

    if not isinstance(accounts, list) or not accounts:
        print("RC_ACCOUNTS_JSON must be a non-empty JSON list of account objects.", file=sys.stderr)
        return 1

    # Mask every credential field BEFORE any code has a chance to print it.
    for acct in accounts:
        if isinstance(acct, dict):
            _mask(acct.get("username", ""))
            _mask(acct.get("password", ""))

    payload = {"accounts": accounts}

    # Swallow the engine's own console output (see module docstring) — its
    # log lines are still captured separately inside result["log_lines"] via
    # check_runner's _CapturingHandler, so nothing is lost, it just doesn't
    # ALSO get printed verbatim to a public log.
    engine_output = io.StringIO()
    try:
        with contextlib.redirect_stdout(engine_output):
            result = check_runner.run_check(payload)
    except RuntimeError as exc:
        print(f"Check did not run: {exc}", file=sys.stderr)
        return 1

    summary = result.get("summary") or {}
    print(
        f"success={result.get('success')} "
        f"hits={summary.get('hit_count', 0)} "
        f"notifications_enabled={result.get('notifications_enabled')}"
    )

    if result.get("error"):
        # Errors can legitimately contain account-specific detail (e.g. a
        # login failure message), so mask is applied above covers usernames,
        # but keep this generic rather than printing exception internals.
        print("Check completed with an error — see notifications/history for details.", file=sys.stderr)

    # Send a general run summary (current bookings + any savings found),
    # independent of the engine's own price-drop-only alerts, so a scheduled
    # run gives you confirmation it ran even when nothing changed. Opt out
    # with RC_RUN_SUMMARY=0 if you only want alerts on actual price drops.
    if os.environ.get("RC_RUN_SUMMARY", "1") != "0":
        with contextlib.redirect_stdout(engine_output):
            summary_result = check_runner.send_run_summary(result)
        if summary_result.get("sent"):
            print("Run summary notification sent.")
        else:
            print(f"Run summary notification not sent: {summary_result.get('error')}", file=sys.stderr)

    return 0 if result.get("success") else 1


if __name__ == "__main__":
    sys.exit(main())
