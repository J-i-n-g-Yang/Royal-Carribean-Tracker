import React from 'react';
import { ArrowDownRight, ArrowUpRight, History } from 'lucide-react';

/**
 * Renders result.price_diff — computed backend-side in check_runner.py by
 * comparing this run's per-reservation market price against the most
 * recent previous run in history. Only reservations whose price actually
 * changed are included, so this list is short and meaningful rather than
 * repeating every reservation every time.
 */
export default function RunDiff({ priceDiff, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  if (!priceDiff || priceDiff.length === 0) return null;

  return (
    <div className={`rounded-xl border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
      <div className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-1.5 ${d('bg-gray-50 text-gray-600 border-b border-gray-200', 'bg-gray-800 text-gray-300 border-b border-gray-700')}`}>
        <History className="w-3.5 h-3.5" /> What Changed Since Last Check
      </div>
      <div className={`divide-y ${d('divide-gray-100', 'divide-gray-800')}`}>
        {priceDiff.map((diff, i) => {
          const isDown = diff.direction === 'down';
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              {isDown
                ? <ArrowDownRight className={`w-4 h-4 shrink-0 ${d('text-green-600', 'text-green-400')}`} />
                : <ArrowUpRight className={`w-4 h-4 shrink-0 ${d('text-red-600', 'text-red-400')}`} />}
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-medium ${d('text-gray-700', 'text-gray-200')}`}>
                  Reservation #{diff.reservation_id}{diff.ship && ` · ${diff.ship}`}
                </p>
                <p className={`text-xs ${d('text-gray-500', 'text-gray-400')}`}>
                  {diff.previous_price.toLocaleString()} → {diff.current_price.toLocaleString()} {diff.currency}
                </p>
              </div>
              <span className={`text-xs font-bold shrink-0 ${isDown ? d('text-green-600', 'text-green-400') : d('text-red-600', 'text-red-400')}`}>
                {isDown ? '−' : '+'}{Math.abs(diff.delta).toLocaleString()} {diff.currency}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
