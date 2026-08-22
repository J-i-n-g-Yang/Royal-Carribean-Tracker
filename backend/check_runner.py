"""
Shared price-check execution logic used by both the Flask /api/check endpoint
and the optional background scheduler.

Having this in its own module means app.py and scheduler.py can both import
run_check() without duplicating the engine-call sequence, and without the
scheduler needing to import Flask.

All credential handling happens here.  Passwords are used only in memory
for the duration of a single run and are never written to disk or logged.
"""

import json
import logging
import os
import threading
import traceback
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import CheckRoyalCaribbeanPrice as engine
from findings_parser import parse_findings, summarize_savings
import history_store

logger = logging.getLogger(__name__)

# ── Notifications ("email bot") ────────────────────────────────────────────────
#
# The engine already fires Apprise notifications (config.apobj.notify(...)) at
# every meaningful price-alert point — cabin price drops, addon price drops,
# and "room no longer available" — it just needs an Apprise object handed to
# it. We build that here from either:
#   1. backend/secrets/notify.json  — a persistent list of Apprise URLs,
#      e.g. for a Gmail "app password" bot: mailto://user:apppassword@gmail.com?to=you@example.com
#      (same pattern as secrets/accounts.json for the scheduler)
#   2. the NOTIFY_URLS env var — comma-separated Apprise URLs, handy for a
#      quick single-URL setup without a secrets file
#   3. a "notify_urls" list in the POST payload — one-off override for testing
#      from the UI without touching either of the above
NOTIFY_SECRETS_FILE = os.path.join(
    os.path.dirname(__file__), "secrets", "notify.json"
)


def _load_notify_urls_from_file() -> List[str]:
    try:
        with open(NOTIFY_SECRETS_FILE, "r", encoding="utf-8") as f:
            urls = json.load(f)
        if isinstance(urls, list):
            return [u for u in urls if isinstance(u, str) and u.strip()]
        logger.warning("notify: %s is not a list — ignoring", NOTIFY_SECRETS_FILE)
    except FileNotFoundError:
        pass   # normal — notifications are opt-in
    except json.JSONDecodeError as exc:
        logger.error("notify: could not parse %s — %s", NOTIFY_SECRETS_FILE, exc)
    return []


def _resolve_notify_urls(payload_override: Optional[List[str]]) -> List[str]:
    if payload_override:
        return [u for u in payload_override if isinstance(u, str) and u.strip()]

    env_urls = os.environ.get("NOTIFY_URLS", "")
    if env_urls.strip():
        return [u.strip() for u in env_urls.split(",") if u.strip()]

    return _load_notify_urls_from_file()


def _build_apprise_object(urls: List[str]) -> Optional["engine.Apprise"]:
    if not urls:
        return None
    if engine.Apprise is None:
        logger.warning(
            "notify: notification URLs configured but the 'apprise' package "
            "isn't installed — add it to requirements.txt and rebuild"
        )
        return None

    apobj = engine.Apprise()
    added_any = False
    for url in urls:
        if apobj.add(url):
            added_any = True
        else:
            logger.warning("notify: Apprise rejected URL (redacted) — check the scheme/syntax")
    return apobj if added_any else None


def _json_safe_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    engine.checkin_payment_rows stores "final_payment" as a real date object
    (needed so print_checkin_payment_table can .strftime() it for the console
    table) and "sail_date" as a raw "YYYYMMDD" API string. Neither is
    JSON-serializable/display-friendly as-is, so:
      - convert dates/datetimes to ISO strings so json.dump() doesn't choke
      - add "sail_date_display" / "final_payment_display" human-readable
        strings so the frontend doesn't have to parse "YYYYMMDD" or ISO
        dates itself
    """
    safe_rows = []
    for row in rows:
        safe_row = dict(row)

        sail_date_raw = safe_row.get("sail_date")
        if sail_date_raw and len(sail_date_raw) == 8:
            try:
                safe_row["sail_date_display"] = datetime.strptime(
                    sail_date_raw, "%Y%m%d"
                ).strftime("%b %d, %Y")
            except ValueError:
                safe_row["sail_date_display"] = sail_date_raw
        else:
            safe_row["sail_date_display"] = sail_date_raw or None

        for key, value in safe_row.items():
            if isinstance(value, (datetime, date)):
                safe_row[key] = value.isoformat()

        final_payment_iso = safe_row.get("final_payment")
        if final_payment_iso:
            try:
                safe_row["final_payment_display"] = datetime.fromisoformat(
                    final_payment_iso
                ).strftime("%b %d, %Y")
            except ValueError:
                safe_row["final_payment_display"] = final_payment_iso
        else:
            safe_row["final_payment_display"] = None

        safe_rows.append(safe_row)
    return safe_rows


# ── "What changed since last run" diffing ───────────────────────────────────────

def _latest_prices_by_reservation(findings: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    For each reservation, picks the single most meaningful "current market
    price" out of its findings: a price-drop's new (lower) price takes
    priority since it's the most actionable number; otherwise falls back to
    the catalog price from a "you already have the best price" confirmation.
    Reservations with neither (e.g. "Not For Sale" only) are omitted — there's
    nothing comparable to diff for them.
    """
    latest: Dict[str, Dict[str, Any]] = {}
    for r in findings.get("reservations", []):
        res_id = r.get("reservation_id")
        if not res_id:
            continue

        price = None
        currency = None
        for f in r.get("cabin_findings", []):
            if f.get("status") in ("price_drop", "price_drop_locked"):
                price = f.get("new_price")
                currency = f.get("currency")
                break
        if price is None:
            for f in r.get("cabin_findings", []):
                if f.get("status") == "confirmed_best_price":
                    price = f.get("current_catalog_price")
                    currency = f.get("currency")
                    break

        if price is not None:
            latest[res_id] = {
                "price": price,
                "currency": currency,
                "ship": r.get("ship"),
                "sail_date": r.get("sail_date"),
            }
    return latest


def _diff_against_previous_run(current_findings: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Compares this run's per-reservation market price against the most
    recently stored run (before this one is saved). Returns only
    reservations whose price actually changed — unchanged reservations are
    omitted so the UI can show a short, meaningful "what's new" list instead
    of repeating every reservation every time.
    """
    previous_runs = history_store.get_history(limit=1)
    if not previous_runs:
        return []
    previous = previous_runs[0]
    previous_findings = previous.get("findings")
    if not previous_findings:
        return []

    current_prices = _latest_prices_by_reservation(current_findings)
    previous_prices = _latest_prices_by_reservation(previous_findings)

    diffs = []
    for res_id, curr in current_prices.items():
        prev = previous_prices.get(res_id)
        if prev is None or prev.get("price") is None:
            continue
        delta = round(curr["price"] - prev["price"], 2)
        if delta == 0:
            continue
        diffs.append({
            "reservation_id": res_id,
            "ship": curr.get("ship"),
            "sail_date": curr.get("sail_date"),
            "previous_price": prev["price"],
            "current_price": curr["price"],
            "delta": delta,
            "currency": curr.get("currency") or prev.get("currency"),
            "direction": "down" if delta < 0 else "up",
        })

    return diffs


# ── Locking ─────────────────────────────────────────────────────────────────────
# Only one check can run at a time: the underlying script uses module-level
# globals (config, checkin_payment_rows) that would collide under concurrency.
_run_lock = threading.Lock()


# ── ANSI-stripping log capture ────────────────────────────────────────────────

class _CapturingHandler(logging.Handler):
    """Collects every log line the engine emits instead of only printing it."""

    import re as _re
    ANSI_RE = _re.compile(r"\x1b\[[0-9;]*m")

    def __init__(self):
        super().__init__()
        self.lines: List[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        msg = self.format(record)
        self.lines.append(self.ANSI_RE.sub("", msg))


# ── Payload → engine dataclass builders ───────────────────────────────────────

def _build_account(entry: Dict[str, Any]) -> "engine.AccountInfo":
    return engine.AccountInfo(
        username=entry.get("username", ""),
        password=entry.get("password", ""),
        cruise_line=entry.get("cruise_line", "royalcaribbean"),
        state=entry.get("state"),
        senior=bool(entry.get("senior", False)),
        military=bool(entry.get("military", False)),
        fire=bool(entry.get("fire", False)),
        police=bool(entry.get("police", False)),
    )


def _build_watch_item(entry: Dict[str, Any]) -> "engine.WatchListItem":
    return engine.WatchListItem(
        name=entry.get("name", ""),
        prefix=entry.get("prefix", ""),
        product=entry.get("product", ""),
        price=float(entry.get("price", 0)),
        enabled=bool(entry.get("enabled", True)),
        guest_age_string=entry.get("guest_age_string", "adult"),
        currency=entry.get("currency", "USD"),
        reservations=entry.get("reservations", []) or [],
    )


def _build_prospective(entry: Dict[str, Any]) -> "engine.ProspectiveCruise":
    return engine.ProspectiveCruise(
        cruise_URL=entry.get("cruise_URL", ""),
        paid_price=float(entry.get("paid_price", 0)),
        loyalty_number=entry.get("loyalty_number"),
    )


# ── Core run logic ─────────────────────────────────────────────────────────────

def _execute(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Runs one price-check pass against request-supplied accounts/watchlist.

    This does NOT acquire _run_lock — the caller (run_check) does that.
    Returns a result dict ready to be returned as JSON.
    """
    handler = _CapturingHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))

    engine.setup_hybrid_logging(log_file_path=None)
    logging.getLogger().addHandler(handler)
    engine.checkin_payment_rows.clear()

    cfg = engine.CruiseAppConfig(
        minimum_saving_alert=payload.get("minimum_saving_alert"),
        currency_override=payload.get("currency_override"),
        show_promos=bool(payload.get("show_promos", False)),
        accounts=[_build_account(a) for a in payload.get("accounts", [])],
        watch_list=[_build_watch_item(w) for w in payload.get("watch_list", [])],
        prospective_cruises=[
            _build_prospective(p) for p in payload.get("prospective_cruises", [])
        ],
    )
    # Wire up the "email bot": the engine already calls config.apobj.notify(...)
    # at every price-drop/room-unavailable point — we just need to hand it a
    # built Apprise object. See _resolve_notify_urls() for where URLs come from.
    notify_urls = _resolve_notify_urls(payload.get("notify_urls"))
    cfg.apobj = _build_apprise_object(notify_urls)
    engine.config = cfg

    accounts_loyalty: List[Dict[str, Any]] = []

    error = None
    try:
        ship_dictionary = engine.ShipRegistry()
        engine.get_ship_dictionary_web(ship_dictionary)

        for account_info in cfg.accounts:
            engine.log(
                f"\nUsing {account_info.friendly_name} for user {account_info.username}"
            )
            account_info.access = engine.login(account_info)
            state_from_profile, loyalty_number, c_and_a_points, loyalty_info = engine.get_profile(
                account_info
            )
            accounts_loyalty.append({
                "username": account_info.username,
                "cruise_line": account_info.cruise_line,
                **loyalty_info,
            })
            if account_info.state is None:
                account_info.state = state_from_profile

            discounts = engine.DiscountProfile(
                loyalty_number=loyalty_number,
                state=account_info.state,
                senior=account_info.senior,
                military=account_info.military,
                fire=account_info.fire,
                police=account_info.police,
                dp340=c_and_a_points >= 340,
            )
            try:
                engine.get_voyages(account_info, discounts, ship_dictionary)
            finally:
                account_info.access.session.close()

        if cfg.prospective_cruises:
            anon_session = engine.new_api_session()
            try:
                for pc in cfg.prospective_cruises:
                    prospective_account = engine.AccountInfo(
                        username="AnonymousWatch",
                        password="",
                        cruise_line="royalcaribbean",
                        access=engine.APIAccess(
                            token=None, id=None, session=anon_session
                        ),
                    )
                    paid_price = float(pc.paid_price)
                    engine.get_cruise_price(
                        prospective_account,
                        {
                            "url": pc.cruise_URL,
                            "paidPriceStruct": {"paidPrice": paid_price},
                            "finalPaymentDate": None,
                            "shipCode": "",
                            "sailDate": "",
                            "packageCode": "",
                            "stateroomType": "NONE",
                        },
                        ship_dictionary,
                        automatic_URL=False,
                        paid_price_struct={"paid_price": paid_price},
                    )
            finally:
                anon_session.close()

        engine.print_checkin_payment_table()

    except Exception as exc:  # noqa: BLE001
        error = str(exc)
        handler.lines.append(traceback.format_exc())
    finally:
        logging.getLogger().removeHandler(handler)

    # Parse the captured log into structured findings
    findings = parse_findings(handler.lines)
    summary  = summarize_savings(findings)

    return {
        "success":              error is None,
        "error":                error,
        "log_lines":            handler.lines,
        "checkin_payment_rows": _json_safe_rows(engine.checkin_payment_rows),
        "findings":             findings,
        "summary":              summary,
        "accounts_loyalty":     accounts_loyalty,
        "notifications_enabled": cfg.apobj is not None,
    }


def run_check(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Public entry point: acquire the global run lock, execute the check,
    diff it against the previous run, persist to history, then return it.

    Raises RuntimeError if another check is already in progress.
    """
    if not _run_lock.acquire(blocking=False):
        raise RuntimeError("A check is already running. Please wait for it to finish.")

    try:
        result = _execute(payload)
    finally:
        _run_lock.release()

    # "What changed since last run" — must run BEFORE append_run() below,
    # since it compares against the most recent run already on disk.
    if result.get("success") and result.get("findings"):
        result["price_diff"] = _diff_against_previous_run(result["findings"])
    else:
        result["price_diff"] = []

    # Persist to run history (passwords already stripped from result)
    usernames = [a.get("username", "") for a in payload.get("accounts", [])]
    history_store.append_run(result, usernames)

    return result


def is_locked() -> bool:
    """Return True if a check is currently running."""
    acquired = _run_lock.acquire(blocking=False)
    if acquired:
        _run_lock.release()
    return not acquired
