"""
Best-effort parser that turns CheckRoyalCaribbeanPrice.py's human-readable log
lines into structured JSON the React UI can render as cards instead of a raw
scrolling log.

This is intentionally conservative: if a line doesn't match a known pattern,
it's kept in `raw_lines` for that reservation so nothing is silently dropped.
The full raw log is still returned separately by the API as a fallback.
"""
import re
from typing import Any, Dict, List, Optional

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")

_RESERVATION_RE = re.compile(r"^Reservation #(\d+)")
_SHIP_ROOM_RE = re.compile(r"^(\d{2}/\d{2}/\d{2})\s+(.+?)\s+Room\s+(\S+)\s*(\(In this cabin: (.+)\))?")
_CHECKIN_RE = re.compile(r"Check-In opens on:\s*(.+)")
_DINING_RE = re.compile(r"^\s*Dining:\s*(.+)")
_FARE_RE = re.compile(r"^Cruise Fare - Total\s*([\d,]+\.\d+)")
_OBC_RE = re.compile(r"Onboard Credit of\s*([\d,]+\.\d+)\s*(\w+)")

# The engine prints a plain-text "Upcoming Check-In & Final Payment Dates"
# table at the very end of the run, after the last "Reservation #" block.
# It's just a text rendering of the same data already returned structurally
# as checkin_payment_rows, so once we see this header, stop attributing any
# further lines to whatever reservation happened to be last — otherwise every
# row of that trailing table gets silently dumped into the last reservation's
# raw_lines and shows up in the UI as a confusing "N unrecognised lines" block.
_CHECKIN_TABLE_HEADER_RE = re.compile(r"^Upcoming Check-In (?:&|and) Final Payment Dates")

# "You have the best price of X (now Y)" — a CONFIRMATION that the paid price
# is already the best available (Y is today's higher catalog price). This is
# reassuring, not a new savings opportunity, and must not be counted as a hit.
_BEST_PRICE_CONFIRMED_RE = re.compile(
    r"You have the best price of\s*([\d,]+\.\d+)\s*(\w+)\s*\(now\s*([\d,]+\.\d+)\s*(\w+)"
)
_NOT_FOR_SALE_RE = re.compile(r"Not For Sale")

# "Rebook! ... New price of X ... is lower than Y" — an ACTUAL cabin-fare
# price drop found for an already-booked cruise, before final payment.
_CABIN_REBOOK_RE = re.compile(
    r"Rebook!\s*(.+?)\s*New price of\s*([\d,]+\.\d+)\s*(\w+).*?is lower than\s*([\d,]+\.\d+)"
)
# Same drop, but past the final payment date (informational — can't act on it
# through a normal rebook, cruise line dependent on their own policy).
_PAST_FINAL_PAYMENT_RE = re.compile(
    r"Past Final Payment Date.*?New price of\s*([\d,]+\.\d+)\s*(\w+).*?is lower than\s*([\d,]+\.\d+)"
)

# Add-on/onboard-purchase (internet, drinks, excursions) price drops — these
# use "Price per night is lower" phrasing rather than the cabin-fare wording.
_ADDON_REBOOK_RE = re.compile(
    r"Rebook!\s*(.+?)\s*Price per night is lower:\s*([\d,]+\.\d+)\s*(\w+)\s*than\s*([\d,]+\.\d+)\s*(\w+)"
)
_BEST_PRICE_PER_NIGHT_RE = re.compile(
    r"has best price per night for\s*(.+?)\s*of:\s*([\d,]+\.\d+)\s*(\w+)\s*\(now\s*([\d,]+\.\d+)\s*(\w+)"
)

# Unbooked/prospective watchlist cruise now cheaper than your target price —
# not tied to a reservation number.
_CONSIDER_BOOKING_RE = re.compile(
    r"Consider Booking!\s*(.+?):\s*New price of\s*([\d,]+\.\d+)\s*(\w+).*?is lower than watchlist price of\s*([\d,]+\.\d+)"
)


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def parse_findings(log_lines: List[str]) -> Dict[str, Any]:
    """Groups log lines into per-reservation blocks and extracts structured
    price/savings data, plus any prospective (unbooked watchlist) hits that
    aren't tied to a reservation. Returns {"reservations": [...], "prospective_hits": [...]}.

    Unrecognized lines for a reservation are kept in raw_lines so nothing is
    silently dropped; the full raw log is also returned separately as a
    fallback by the API."""

    reservations: List[Dict[str, Any]] = []
    prospective_hits: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    in_checkin_table = False

    for raw_line in log_lines:
        line = _ANSI_RE.sub("", raw_line).rstrip()
        if not line.strip():
            continue

        if in_checkin_table:
            # Already inside the trailing summary table — every remaining
            # line (header row, dashes, and data rows) is a re-print of
            # checkin_payment_rows, so skip it rather than dumping it into
            # the last reservation's raw_lines.
            continue

        if _CHECKIN_TABLE_HEADER_RE.match(line.strip()):
            current = None
            in_checkin_table = True
            continue

        m = _CONSIDER_BOOKING_RE.search(line)
        if m:
            name, new_price, currency, watchlist_price = m.groups()
            new_price = _num(new_price)
            watchlist_price = _num(watchlist_price)
            prospective_hits.append({
                "name": name.strip(),
                "new_price": new_price,
                "watchlist_price": watchlist_price,
                "currency": currency,
                "savings": round(watchlist_price - new_price, 2),
                "description": line.strip(),
            })
            continue

        m = _RESERVATION_RE.match(line.strip())
        if m:
            current = {
                "reservation_id": m.group(1),
                "sail_date": None,
                "ship": None,
                "room": None,
                "guests": None,
                "checkin_opens": None,
                "dining": None,
                "cruise_fare_total": None,
                "onboard_credit": None,
                "onboard_credit_currency": None,
                "cabin_findings": [],
                "addon_findings": [],
                "raw_lines": [],
            }
            reservations.append(current)
            continue

        if current is None:
            # Line appeared before any "Reservation #" header (e.g. account
            # summary lines) — not reservation-specific, skip for findings.
            continue

        m = _SHIP_ROOM_RE.match(line.strip())
        if m and current["ship"] is None:
            current["sail_date"] = m.group(1)
            current["ship"] = m.group(2)
            current["room"] = m.group(3)
            if m.group(5):
                current["guests"] = [g.strip() for g in m.group(5).split(",")]
            continue

        m = _CHECKIN_RE.search(line)
        if m:
            current["checkin_opens"] = m.group(1).strip()
            continue

        m = _DINING_RE.match(line)
        if m:
            current["dining"] = m.group(1).strip()
            continue

        m = _FARE_RE.match(line.strip())
        if m:
            current["cruise_fare_total"] = _num(m.group(1))
            continue

        m = _OBC_RE.search(line)
        if m:
            current["onboard_credit"] = _num(m.group(1))
            current["onboard_credit_currency"] = m.group(2)
            continue

        # ACTUAL cabin-fare price drop, actionable now.
        m = _CABIN_REBOOK_RE.search(line)
        if m:
            _pre, new_price, currency, old_price = m.groups()
            new_price = _num(new_price)
            old_price = _num(old_price)
            current["cabin_findings"].append({
                "status": "price_drop",
                "description": line.strip(),
                "new_price": new_price,
                "old_price": old_price,
                "currency": currency,
                "savings": round(old_price - new_price, 2),
            })
            continue

        # Real drop found, but past final payment date — informational only.
        m = _PAST_FINAL_PAYMENT_RE.search(line)
        if m:
            new_price, currency, old_price = m.groups()
            new_price = _num(new_price)
            old_price = _num(old_price)
            current["cabin_findings"].append({
                "status": "price_drop_locked",
                "description": line.strip(),
                "new_price": new_price,
                "old_price": old_price,
                "currency": currency,
                "savings": round(old_price - new_price, 2),
            })
            continue

        # Confirmation only — you already have the best price. Not a hit.
        m = _BEST_PRICE_CONFIRMED_RE.search(line)
        if m:
            paid_price, currency, current_price, _ = m.groups()
            current["cabin_findings"].append({
                "status": "confirmed_best_price",
                "description": line.strip(),
                "paid_price": _num(paid_price),
                "current_catalog_price": _num(current_price),
                "currency": currency,
            })
            continue

        m = _ADDON_REBOOK_RE.search(line)
        if m:
            item, new_price, currency, old_price, _ = m.groups()
            new_price = _num(new_price)
            old_price = _num(old_price)
            current["addon_findings"].append({
                "type": "addon_rebook",
                "item": item.strip(),
                "new_price_per_night": new_price,
                "old_price_per_night": old_price,
                "currency": currency,
                "savings_per_night": round(old_price - new_price, 2),
            })
            continue

        m = _BEST_PRICE_PER_NIGHT_RE.search(line)
        if m:
            item, best_price, currency, current_price, _ = m.groups()
            best_price = _num(best_price)
            current_price = _num(current_price)
            current["addon_findings"].append({
                "type": "addon_confirmed_best_price",
                "item": item.strip(),
                "best_price_per_night": best_price,
                "current_price_per_night": current_price,
                "currency": currency,
            })
            continue

        if _NOT_FOR_SALE_RE.search(line):
            current["cabin_findings"].append({
                "status": "not_for_sale",
                "description": line.strip(),
            })
            continue

        # Unrecognized line for this reservation — keep it so nothing's lost.
        current["raw_lines"].append(line.strip())

    return {"reservations": reservations, "prospective_hits": prospective_hits}


def summarize_savings(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """Rolls reservation-level findings up into a single run summary: total
    ACTIONABLE savings found (price drops only — never counts "you already
    have the best price" confirmations) and a flat list of hits worth
    surfacing prominently in the UI."""
    reservations = parsed.get("reservations", [])
    prospective_hits = parsed.get("prospective_hits", [])

    total_cabin_savings = 0.0
    total_addon_savings_per_night = 0.0
    hits = []

    for r in reservations:
        for f in r.get("cabin_findings", []):
            if f.get("status") in ("price_drop", "price_drop_locked") and f.get("savings", 0) > 0:
                total_cabin_savings += f["savings"]
                hits.append({
                    "reservation_id": r["reservation_id"],
                    "ship": r.get("ship"),
                    "sail_date": r.get("sail_date"),
                    "type": f["status"],
                    "savings": f["savings"],
                    "currency": f.get("currency"),
                    "description": f["description"],
                })
        for f in r.get("addon_findings", []):
            savings = f.get("savings_per_night")
            if savings and savings > 0:
                total_addon_savings_per_night += savings
                hits.append({
                    "reservation_id": r["reservation_id"],
                    "ship": r.get("ship"),
                    "sail_date": r.get("sail_date"),
                    "type": f["type"],
                    "item": f.get("item"),
                    "savings_per_night": savings,
                    "currency": f.get("currency"),
                })

    for p in prospective_hits:
        if p.get("savings", 0) > 0:
            hits.append({
                "reservation_id": None,
                "ship": p.get("name"),
                "sail_date": None,
                "type": "prospective",
                "savings": p["savings"],
                "currency": p.get("currency"),
                "description": p["description"],
            })

    return {
        "total_cabin_savings": round(total_cabin_savings, 2),
        "total_addon_savings_per_night": round(total_addon_savings_per_night, 2),
        "hit_count": len(hits),
        "hits": hits,
    }
