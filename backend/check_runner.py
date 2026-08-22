"""
Shared price-check execution logic used by both the Flask /api/check endpoint
and the optional background scheduler.

Having this in its own module means app.py and scheduler.py can both import
run_check() without duplicating the engine-call sequence, and without the
scheduler needing to import Flask.

All credential handling happens here.  Passwords are used only in memory
for the duration of a single run and are never written to disk or logged.
"""

import logging
import threading
import traceback
from datetime import date, datetime
from typing import Any, Dict, List

import CheckRoyalCaribbeanPrice as engine
from findings_parser import parse_findings, summarize_savings
import history_store

logger = logging.getLogger(__name__)


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
    engine.config = cfg

    error = None
    try:
        ship_dictionary = engine.ShipRegistry()
        engine.get_ship_dictionary_web(ship_dictionary)

        for account_info in cfg.accounts:
            engine.log(
                f"\nUsing {account_info.friendly_name} for user {account_info.username}"
            )
            account_info.access = engine.login(account_info)
            state_from_profile, loyalty_number, c_and_a_points = engine.get_profile(
                account_info
            )
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
    }


def run_check(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Public entry point: acquire the global run lock, execute the check,
    persist the result to history, then return it.

    Raises RuntimeError if another check is already in progress.
    """
    if not _run_lock.acquire(blocking=False):
        raise RuntimeError("A check is already running. Please wait for it to finish.")

    try:
        result = _execute(payload)
    finally:
        _run_lock.release()

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
