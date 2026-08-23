import React from 'react';
import { CalendarClock, AlertTriangle } from 'lucide-react';

/**
 * Standalone "days until final payment" countdown, built from the same
 * result.checkin_payment_rows the existing Check-in & Balance Summary table
 * already renders — no new API surface, just a more scannable view of data
 * that's already there. Only shows rows with an actual balance owed and a
 * known final payment date; paid-off or TBD reservations are left out since
 * there's nothing to count down to.
 */
function daysUntil(isoDate) {
  if (!isoDate) return null;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function urgencyClasses(days, dark) {
  const d = (l, dk) => (dark ? dk : l);
  if (days < 0) return d('bg-red-50 border-red-300 text-red-800', 'bg-red-900/30 border-red-700 text-red-300');
  if (days <= 14) return d('bg-amber-50 border-amber-300 text-amber-800', 'bg-amber-900/30 border-amber-700 text-amber-300');
  return d('bg-blue-50 border-blue-200 text-blue-800', 'bg-blue-900/20 border-blue-800 text-blue-300');
}

export default function FinalPaymentCountdown({ checkinPaymentRows, dark }) {
  const d = (l, dk) => (dark ? dk : l);

  const rows = (checkinPaymentRows || [])
    .filter(r => r.balance_due === true && r.final_payment)
    .map(r => ({ ...r, days: daysUntil(r.final_payment) }))
    .filter(r => r.days !== null)
    .sort((a, b) => a.days - b.days);

  if (rows.length === 0) return null;

  return (
    <div className={`rounded-xl border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
      <div className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-1.5 ${d('bg-gray-50 text-gray-600 border-b border-gray-200', 'bg-gray-800 text-gray-300 border-b border-gray-700')}`}>
        <CalendarClock className="w-3.5 h-3.5" /> Final Payment Countdown
      </div>
      <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((row, i) => (
          <div key={i} className={`rounded-lg border p-3 ${urgencyClasses(row.days, dark)}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold leading-snug">{row.name || `Reservation ${row.reservation}`}</p>
              {row.days < 0 && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
            </div>
            <p className="text-lg font-bold mt-1">
              {row.days < 0 ? `${Math.abs(row.days)}d overdue` : row.days === 0 ? 'Due today' : `${row.days}d left`}
            </p>
            <p className="text-[11px] mt-1 opacity-80">
              Due {row.final_payment_display} · Res #{row.reservation}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
