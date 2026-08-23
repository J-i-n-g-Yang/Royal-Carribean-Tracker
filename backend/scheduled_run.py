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


def _load_watchlist() -> dict:
    """
    Load watchlist and prospective-cruise config from the RC_WATCHLIST_JSON
    environment variable.  Returns a dict with "watch_list" and
    "prospective_cruises" keys (both default to empty lists so the caller can
    always merge the result directly into the payload).

    Format (same shape the /api/check endpoint already accepts):
    {
      "watch_list": [
        {
          "name": "VOOM Internet - 3 Devices",
          "prefix": "...",
          "product": "...",
          "price": 25.00,
          "currency": "USD",
          "guest_age_string": "adult",
          "enabled": true,
          "reservations": ["1234567", "8901234"]
        }
      ],
      "prospective_cruises": [
        {
          "cruise_URL": "https://www.royalcaribbean.com/...",
          "paid_price": 500.00,
          "loyalty_number": null
        }
      ]
    }
    """
    empty = {"watch_list": [], "prospective_cruises": []}
    raw = os.environ.get("RC_WATCHLIST_JSON", "").strip()
    if not raw:
        return empty
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"RC_WATCHLIST_JSON is not valid JSON — skipping watchlist: {exc}", file=sys.stderr)
        return empty
    if not isinstance(data, dict):
        print("RC_WATCHLIST_JSON must be a JSON object — skipping watchlist.", file=sys.stderr)
        return empty
    return {
        "watch_list":         data.get("watch_list", []),
        "prospective_cruises": data.get("prospective_cruises", []),
    }


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

    watchlist = _load_watchlist()
    if watchlist["watch_list"]:
        print(f"Watchlist: {len(watchlist['watch_list'])} item(s) loaded.")
    if watchlist["prospective_cruises"]:
        print(f"Prospective cruises: {len(watchlist['prospective_cruises'])} item(s) loaded.")

    payload = {"accounts": accounts, **watchlist}

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

    # Watch-list visibility: hit_count above only counts SAVINGS opportunities
    # (price_drop / addon_rebook with savings > 0) — it says nothing about
    # watch items that were checked but found no savings, or that failed to
    # resolve at all (wrong prefix/product code, reservation ID mismatch,
    # etc). Those cases produce no structured "finding" — the engine only
    # logs a plain text line for them, which findings_parser.py has no regex
    # for, so it lands in that reservation's raw_lines as an "unrecognised
    # line" instead. Print a redacted summary of exactly that here, since
    # this is the only place many people will ever look after a scheduled
    # run — no credentials or personal identifiers appear in any of this
    # (reservation IDs and package names aren't secrets, and anything that
    # WAS masked via ::add-mask:: above stays masked in this output too).
    reservations = (result.get("findings") or {}).get("reservations", [])
    if watchlist["watch_list"] and reservations:
        print("\n── Watch-list check outcomes ──")
        watch_item_names = {w.get("name", "").strip() for w in watchlist["watch_list"] if w.get("name")}
        for r in reservations:
            res_id = r.get("reservation_id")
            addon_findings = r.get("addon_findings", [])
            if addon_findings:
                for f in addon_findings:
                    print(f"  res {res_id}: {f.get('item', f.get('type'))} -> {f.get('type')}"
                          f"{' (save ' + str(f.get('savings_per_night')) + '/night)' if f.get('savings_per_night') else ''}")
            else:
                # No addon_finding at all for this reservation — either no
                # watch item's reservations list included this booking ID,
                # or the product/prefix lookup failed silently. Surface any
                # raw_lines that look watch-list-related so it's not a dead end.
                relevant_raw = [
                    line for line in r.get("raw_lines", [])
                    if "not available for passenger" in line
                    or any(name and name in line for name in watch_item_names)
                ]
                if relevant_raw:
                    print(f"  res {res_id}: no watch-list match, but found:")
                    for line in relevant_raw:
                        print(f"    {line.strip()}")
                else:
                    print(f"  res {res_id}: no watch-list items applied to this reservation "
                          f"(check each item's \"reservations\" list includes \"{res_id}\")")
        print("── end watch-list outcomes ──\n")

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
