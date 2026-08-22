/**
 * Export helpers for a completed price-check run.
 *
 * CSV: built entirely client-side from the already-fetched result, downloaded
 * as a Blob — no new dependency and no backend round-trip needed.
 *
 * PDF: rather than pulling in a client-side PDF library (jspdf etc., not
 * currently a project dependency), this triggers the browser's native
 * print-to-PDF via window.print(). Pair it with the .print-area / @media
 * print rules added in PriceChecker.jsx so only the results section prints,
 * not the whole page chrome.
 */

function csvEscape(value) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function buildRunCSV(result) {
  const rows = [
    ['Reservation #', 'Ship', 'Sail Date', 'Room', 'Cruise Fare', 'Onboard Credit', 'Currency', 'Finding', 'Details'],
  ];

  const reservations = result?.findings?.reservations || [];
  for (const r of reservations) {
    const findings = [
      ...(r.cabin_findings || []).map(f => ({ status: f.status, description: f.description })),
      ...(r.addon_findings || []).map(f => ({ status: f.type, description: f.item })),
    ];
    if (findings.length === 0) {
      rows.push([
        r.reservation_id, r.ship, r.sail_date, r.room,
        r.cruise_fare_total ?? '', r.onboard_credit ?? '', r.onboard_credit_currency ?? '',
        '', '',
      ]);
    } else {
      for (const f of findings) {
        rows.push([
          r.reservation_id, r.ship, r.sail_date, r.room,
          r.cruise_fare_total ?? '', r.onboard_credit ?? '', r.onboard_credit_currency ?? '',
          f.status, f.description || '',
        ]);
      }
    }
  }

  return rows.map(row => row.map(csvEscape).join(',')).join('\n');
}

export function downloadRunCSV(result) {
  const csv = buildRunCSV(result);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `rc-price-check-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printRun() {
  window.print();
}
