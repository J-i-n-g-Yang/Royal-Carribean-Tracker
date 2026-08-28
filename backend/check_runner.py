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


def _mask_url(url: str) -> str:
    """
    Redact the credential/token portion of a notify URL for display back to
    the user. We only ever want to echo back enough to tell services apart
    (e.g. "tgram://***" vs "mailto://***"), never the token/password itself.
    """
    scheme = url.split("://", 1)[0] if "://" in url else "?"
    return f"{scheme}://***"


def get_notify_status() -> Dict[str, Any]:
    """
    Diagnostic snapshot of notification configuration for GET /api/notify/status.

    Today a malformed backend/secrets/notify.json (bad JSON, wrong shape,
    non-string entries) fails silently — _load_notify_urls_from_file() just
    logs a warning server-side and returns an empty list, so the UI has no
    way to explain *why* notifications aren't firing. This surfaces that.
    """
    env_urls_raw = os.environ.get("NOTIFY_URLS", "")
    env_urls = [u.strip() for u in env_urls_raw.split(",") if u.strip()]

    file_exists = os.path.exists(NOTIFY_SECRETS_FILE)
    file_error: Optional[str] = None
    file_urls: List[str] = []

    if file_exists:
        try:
            with open(NOTIFY_SECRETS_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
            if isinstance(raw, list):
                file_urls = [u for u in raw if isinstance(u, str) and u.strip()]
                bad_entries = [u for u in raw if not (isinstance(u, str) and u.strip())]
                if bad_entries:
                    noun = "entry is" if len(bad_entries) == 1 else "entries are"
                    file_error = (
                        f"{len(bad_entries)} {noun} not a non-empty string and will be ignored."
                    )
            else:
                file_error = 'notify.json must be a JSON list of URL strings, e.g. ["mailto://..."].'
        except json.JSONDecodeError as exc:
            file_error = f"notify.json is not valid JSON: {exc.msg} (line {exc.lineno}, col {exc.colno})."
        except OSError as exc:
            file_error = f"Could not read notify.json: {exc}"

    if env_urls:
        active_source, active_urls = "env", env_urls
    elif file_urls:
        active_source, active_urls = "file", file_urls
    else:
        active_source, active_urls = "none", []

    return {
        "apprise_installed":  engine.Apprise is not None,
        "active_source":      active_source,   # "env" | "file" | "none"
        "active_url_count":   len(active_urls),
        "active_urls_masked": [_mask_url(u) for u in active_urls],
        "file": {
            "path":      NOTIFY_SECRETS_FILE,
            "exists":    file_exists,
            "url_count": len(file_urls),
            "error":     file_error,
        },
        "env": {
            "configured": bool(env_urls_raw.strip()),
            "url_count":  len(env_urls),
        },
    }


def send_test_notification(payload_override: Optional[List[str]]) -> Dict[str, Any]:
    """
    Fires an immediate, unconditional test notification to each configured
    Apprise URL (config file / NOTIFY_URLS / one-off override), independent
    of any price-check run. Mirrors the engine's own apprise_test CLI flag
    (see CheckRoyalCaribbeanPrice.main()) but callable from the API so the
    frontend can offer a "Send Test Notification" button.

    Each URL is tested with its own Apprise() instance so one bad URL
    (rejected syntax or failed delivery) doesn't block or mask the others —
    important once you have both an email and a Telegram URL configured.
    """
    urls = _resolve_notify_urls(payload_override)
    if not urls:
        return {
            "success": False,
            "error": "No notification URLs configured. Add one to backend/secrets/notify.json, "
                     "the NOTIFY_URLS env var, or pass notify_urls in this request.",
            "results": [],
        }

    if engine.Apprise is None:
        return {
            "success": False,
            "error": "The 'apprise' package isn't installed — add it to requirements.txt and rebuild.",
            "results": [],
        }

    results = []
    for url in urls:
        masked = _mask_url(url)
        single = engine.Apprise()
        if not single.add(url):
            results.append({
                "url": masked,
                "added": False,
                "sent": False,
                "error": "Apprise rejected this URL — check the scheme/syntax.",
            })
            continue

        try:
            sent = single.notify(
                body="This is only a test. Apprise is set up correctly.",
                title="Cruise Price Notification Test",
                body_format=engine.NotifyFormat.TEXT,
            )
        except Exception as exc:  # noqa: BLE001
            results.append({"url": masked, "added": True, "sent": False, "error": str(exc)})
            continue

        results.append({
            "url": masked,
            "added": True,
            "sent": bool(sent),
            "error": None if sent else "Notify call returned failure — check credentials/chat id.",
        })

    return {
        "success": all(r["sent"] for r in results),
        "error": None,
        "results": results,
    }


# ── Run summary notification ────────────────────────────────────────────────
#
# The engine's own config.apobj.notify(...) calls are deliberately narrow —
# they only fire on an actionable event (cabin price drop, addon price drop,
# room no longer available). That's the right default for "don't spam me
# every run," but it means a scheduled/unattended run is silent when nothing
# changed, which gives you no confirmation it actually ran at all. This
# builds and sends a separate, unconditional "here's the state of your
# bookings" notification — current fare/OBC/check-in status per reservation,
# plus whatever savings were found — independent of the engine's own alerts.

def _format_run_summary(result: Dict[str, Any]) -> str:
    """Plain-text summary of one completed run, for a general status notification."""
    findings = result.get("findings") or {}
    reservations = findings.get("reservations") or []
    summary = result.get("summary") or {}

    lines: List[str] = []

    if not result.get("success"):
        lines.append(f"Run failed: {result.get('error') or 'see logs for details'}")
        lines.append("")

    if not reservations:
        lines.append("No reservations found in this run.")
    else:
        lines.append(f"{len(reservations)} reservation(s) checked:")
        for r in reservations:
            fare = r.get("cruise_fare_total")
            fare_str = f"${fare:,.2f}" if isinstance(fare, (int, float)) else "unknown"

            obc = r.get("onboard_credit")
            obc_str = ""
            if isinstance(obc, (int, float)) and obc:
                obc_str = f", OBC ${obc:,.2f} {r.get('onboard_credit_currency') or ''}".rstrip()

            checkin = r.get("checkin_opens")
            checkin_str = f", check-in opens {checkin}" if checkin else ""

            lines.append(
                f"- Reservation #{r.get('reservation_id')}: "
                f"{r.get('ship') or 'unknown ship'} ({r.get('sail_date') or 'unknown date'}), "
                f"room {r.get('room') or 'unknown'}, fare {fare_str}{obc_str}{checkin_str}"
            )

    hit_count = summary.get("hit_count", 0)
    total_cabin_savings = summary.get("total_cabin_savings", 0)
    lines.append("")
    if not result.get("success"):
        pass  # already reported the failure above; no savings verdict to give
    elif hit_count:
        lines.append(
            f"{hit_count} savings opportunity(ies) found this run "
            f"(${total_cabin_savings:,.2f} total cabin savings) — see the dashboard for details."
        )
    else:
        lines.append("No price drops found this run — everything is at your best known price.")

    return "\n".join(lines)


def send_run_summary(result: Dict[str, Any], payload_override: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Fires an unconditional run-summary notification to every configured
    Apprise URL. Unlike send_test_notification(), the body reflects a real
    completed run (result must be a dict shaped like run_check()'s return
    value / a history_store record) rather than a fixed test message.
    """
    urls = _resolve_notify_urls(payload_override)
    if not urls:
        return {"success": False, "error": "No notification URLs configured.", "sent": False}

    apobj = _build_apprise_object(urls)
    if apobj is None:
        return {"success": False, "error": "No valid notification URLs to send to.", "sent": False}

    body = _format_run_summary(result)
    try:
        sent = apobj.notify(
            body=body,
            title="Cruise Price Check — Run Summary",
            body_format=engine.NotifyFormat.TEXT,
        )
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc), "sent": False}

    return {
        "success": bool(sent),
        "error": None if sent else "Notify call returned failure — check credentials/chat id.",
        "sent": bool(sent),
    }


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


def _best_price_ever_by_reservation(current_findings: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Scans every stored historical run (up to MAX_RUNS, currently 50) plus the
    just-completed run, and returns the lowest market price ever observed per
    reservation:  {reservation_id: {"price", "currency", "ship", "sail_date",
    "seen_run_id"}}.

    This is intentionally a full re-scan rather than an incrementally
    maintained running minimum — history.json already caps at MAX_RUNS, so
    the scan cost is bounded, and re-deriving it fresh avoids ever having a
    stale/incorrect "best ever" value silently drift from what's actually in
    history (e.g. after a manual history edit or a cleared run).
    """
    best: Dict[str, Dict[str, Any]] = {}

    def _consider(prices: Dict[str, Dict[str, Any]], run_id: Any) -> None:
        for res_id, info in prices.items():
            price = info.get("price")
            if price is None:
                continue
            existing = best.get(res_id)
            if existing is None or price < existing["price"]:
                best[res_id] = {**info, "seen_run_id": run_id}

    for past_run in history_store.get_history(limit=history_store.MAX_RUNS):
        _consider(_latest_prices_by_reservation(past_run.get("findings") or {}), past_run.get("run_id"))

    _consider(_latest_prices_by_reservation(current_findings), None)  # None = this run, not yet saved

    return best


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
    engine.watch_price_rows.clear()

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

    # Due to RCCL API updates, currency overrides no longer change returned prices.
    # Kept functional for now (see project notes) but surfaced here so it's visible
    # in the run log rather than silently doing nothing.
    if cfg.currency_override:
        engine.log(
            f"{engine.YELLOW}Note: currency override '{cfg.currency_override}' is set, "
            f"but RCCL API updates mean it no longer changes returned prices.{engine.RESET}"
        )
    elif any(w.currency and w.currency != "USD" for w in cfg.watch_list):
        engine.log(
            f"{engine.YELLOW}Note: a watch item currency other than USD is set, "
            f"but RCCL API updates mean it no longer changes returned prices.{engine.RESET}"
        )

    accounts_loyalty: List[Dict[str, Any]] = []
    cabin_categories: Dict[str, Any] = {}

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

                    # All-cabin-categories scan for this watched sailing. Independent
                    # of get_cruise_price above (which only prices pc's own target
                    # cabin) — parses the same URL again to build a fresh
                    # CruiseURLParams and pulls every category currently for sale.
                    # Best-effort: a failure here never fails the whole run.
                    try:
                        cat_params = engine.parse_provided_URL(pc.cruise_URL)
                        categories = engine.get_all_cabin_categories(cat_params)
                        if categories:
                            cabin_categories[pc.cruise_URL] = categories
                    except Exception:
                        logger.warning(
                            "cabin_categories: failed to fetch categories for %s",
                            pc.cruise_URL, exc_info=True,
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
        # All cabin categories/prices/rooms-left for each watched prospective
        # cruise, keyed by its cruise_URL. Empty {} on watchlist-only-disabled
        # runs or if every category fetch failed — never breaks the run.
        "cabin_categories":     cabin_categories,
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
        result["best_price_ever"] = _best_price_ever_by_reservation(result["findings"])
    else:
        result["price_diff"] = []
        result["best_price_ever"] = {}

    # Persist to run history (passwords already stripped from result)
    usernames = [a.get("username", "") for a in payload.get("accounts", [])]
    record = history_store.append_run(result, usernames)
    result["run_id"] = record.get("run_id")

    return result


def is_locked() -> bool:
    """Return True if a check is currently running."""
    acquired = _run_lock.acquire(blocking=False)
    if acquired:
        _run_lock.release()
    return not acquired
