import React from 'react';
import { Award, Anchor, Dices, Gem } from 'lucide-react';

/**
 * Shows the loyalty-tier snapshot returned per account by /api/check
 * (result.accounts_loyalty). The backend already logs this on every run —
 * this just gives it a home in the UI instead of only the raw log text.
 */
const TIER_ROWS = [
  { key: 'crown_and_anchor', label: 'Crown & Anchor', icon: Anchor,
    line: (t) => `${t.tier || 'Member'} · ${t.shared_points ?? 0} shared pts (${t.individual_points ?? 0} individual)`,
    sub:  (t) => (t.total_trips ? `${t.total_trips} trips · ${t.total_nights} nights on Royal` : null) },
  { key: 'club_royale', label: 'Club Royale (Casino)', icon: Dices,
    line: (t) => `${t.tier || 'Member'} · ${t.points ?? 0} credits`,
    sub:  () => null },
  { key: 'captains_club', label: "Captain's Club", icon: Award,
    line: (t) => `${t.tier || 'Member'} TIER · ${t.shared_points ?? 0} shared pts (${t.individual_points ?? 0} individual)`,
    sub:  (t) => (t.total_trips ? `${t.total_trips} trips · ${t.total_nights} nights on Celebrity` : null) },
  { key: 'blue_chip', label: 'Blue Chip (Casino)', icon: Gem,
    line: (t) => `${t.tier || 'Member'} · ${t.points ?? 0} points`,
    sub:  () => null },
];

function NextTierLine({ nextTier, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  if (!nextTier) return null;
  if (nextTier.at_top_tier) {
    return <p className={`text-[11px] mt-1 font-semibold ${d('text-emerald-600', 'text-emerald-400')}`}>Top tier reached</p>;
  }
  return (
    <p className={`text-[11px] mt-1 ${d('text-indigo-600', 'text-indigo-400')}`}>
      {nextTier.points_needed.toLocaleString()} pts to {nextTier.next_tier}
    </p>
  );
}

export default function LoyaltyCard({ accountsLoyalty, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  if (!accountsLoyalty || accountsLoyalty.length === 0) return null;

  // Only show accounts that actually have at least one populated tier
  const withTiers = accountsLoyalty.filter(a =>
    TIER_ROWS.some(row => a[row.key])
  );
  if (withTiers.length === 0) return null;

  return (
    <div className={`rounded-xl border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
      <div className={`px-4 py-2.5 text-xs font-semibold ${d('bg-gray-50 text-gray-600 border-b border-gray-200', 'bg-gray-800 text-gray-300 border-b border-gray-700')}`}>
        Loyalty Status
      </div>
      <div className={`divide-y ${d('divide-gray-100', 'divide-gray-800')}`}>
        {withTiers.map((acc, idx) => (
          <div key={idx} className="p-4">
            <p className={`text-xs font-semibold mb-2 ${d('text-gray-500', 'text-gray-400')}`}>{acc.username}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {TIER_ROWS.filter(row => acc[row.key]).map(row => {
                const Icon = row.icon;
                const tier = acc[row.key];
                const sub = row.sub(tier);
                return (
                  <div key={row.key} className={`flex items-start gap-2 rounded-lg p-2.5 ${d('bg-gray-50', 'bg-gray-800/50')}`}>
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${d('text-indigo-600', 'text-indigo-400')}`} />
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${d('text-gray-700', 'text-gray-200')}`}>{row.label}</p>
                      <p className={`text-xs mt-0.5 ${d('text-gray-600', 'text-gray-300')}`}>{row.line(tier)}</p>
                      {sub && <p className={`text-[11px] mt-0.5 ${d('text-gray-400', 'text-gray-500')}`}>{sub}</p>}
                      <NextTierLine nextTier={tier.next_tier} dark={dark} />
                      {row.key === 'blue_chip' && tier.next_tier && !tier.next_tier.at_top_tier && (
                        <p className={`text-[10px] mt-0.5 italic ${d('text-gray-400', 'text-gray-500')}`}>
                          Blue Chip thresholds are approximate — not officially published
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
