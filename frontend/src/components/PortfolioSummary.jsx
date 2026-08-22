import React from 'react';
import { Wallet, Gift, TrendingDown, CalendarClock } from 'lucide-react';

/**
 * Rolls up everything already returned per-reservation into a single
 * "where do I stand across all my cruises" card: total fare paid, total
 * OBC, total potential savings sitting on the table, and the soonest
 * upcoming final payment that's still owed.
 *
 * Pure frontend aggregation — no new backend fields required, all of this
 * data already comes back in result.findings / result.checkin_payment_rows.
 */
export default function PortfolioSummary({ result, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  const reservations = result?.findings?.reservations || [];
  const rows = result?.checkin_payment_rows || [];
  const summary = result?.summary;

  if (reservations.length === 0 && rows.length === 0) return null;

  const totalFare = reservations.reduce((sum, r) => sum + (r.cruise_fare_total || 0), 0);
  const totalOBC = reservations.reduce((sum, r) => sum + (r.onboard_credit || 0), 0);
  const obcCurrency = reservations.find(r => r.onboard_credit > 0)?.onboard_credit_currency || '';

  const totalPotentialSavings =
    (summary?.total_cabin_savings || 0) + (summary?.total_addon_savings_per_night || 0);

  // Soonest still-owed final payment, by ISO date
  const owed = rows
    .filter(r => r.balance_due === true && r.final_payment)
    .sort((a, b) => (a.final_payment || '').localeCompare(b.final_payment || ''));
  const nextPayment = owed[0];

  const cards = [
    {
      icon: Wallet, label: 'Total fare across all reservations',
      value: totalFare > 0 ? `$${totalFare.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—',
      accent: 'text-blue-600 dark:text-blue-400',
    },
    {
      icon: Gift, label: 'Total onboard credit',
      value: totalOBC > 0 ? `${totalOBC.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${obcCurrency}` : '—',
      accent: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      icon: TrendingDown, label: 'Potential savings sitting on the table',
      value: totalPotentialSavings > 0 ? `$${totalPotentialSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0.00',
      accent: totalPotentialSavings > 0 ? 'text-amber-600 dark:text-amber-400' : d('text-gray-400', 'text-gray-500'),
    },
    {
      icon: CalendarClock, label: 'Next final payment due',
      value: nextPayment
        ? `${nextPayment.final_payment_display} — ${nextPayment.name || 'Reservation ' + nextPayment.reservation}`
        : 'All reservations paid',
      accent: nextPayment ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
      small: true,
    },
  ];

  return (
    <div className={`rounded-xl border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
      <div className={`px-4 py-2.5 text-xs font-semibold ${d('bg-gray-50 text-gray-600 border-b border-gray-200', 'bg-gray-800 text-gray-300 border-b border-gray-700')}`}>
        Portfolio Summary
      </div>
      <div className="grid sm:grid-cols-2 gap-3 p-4">
        {cards.map(({ icon: Icon, label, value, accent, small }, i) => (
          <div key={i} className={`flex items-start gap-2.5 rounded-lg p-3 ${d('bg-gray-50', 'bg-gray-800/50')}`}>
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${accent}`} />
            <div className="min-w-0">
              <p className={`text-[11px] ${d('text-gray-500', 'text-gray-400')}`}>{label}</p>
              <p className={`${small ? 'text-xs' : 'text-base'} font-bold mt-0.5 ${accent}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
