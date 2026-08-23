import React, { useState } from 'react';
import { LayoutGrid, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Shows every cabin type/category currently for sale on each watched
 * prospective cruise, from result.cabin_categories (keyed by cruise_URL —
 * see get_all_cabin_categories() in the backend). Only ever populated for
 * prospective cruises, not existing reservations — see the README note on
 * this feature's scope for why.
 */
export default function CabinCategoriesPanel({ cabinCategories, prospectiveCruises, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  const [openUrl, setOpenUrl] = useState(null);

  const entries = Object.entries(cabinCategories || {});
  if (entries.length === 0) return null;

  const nameForUrl = (url) => {
    const match = (prospectiveCruises || []).find(pc => pc.cruise_URL === url);
    return match?.name || url.split('/').filter(Boolean).slice(-1)[0] || url;
  };

  return (
    <div className={`rounded-xl border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
      <div className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-1.5 ${d('bg-gray-50 text-gray-600 border-b border-gray-200', 'bg-gray-800 text-gray-300 border-b border-gray-700')}`}>
        <LayoutGrid className="w-3.5 h-3.5" /> Cabin Categories — Watched Cruises
      </div>
      <div className={`divide-y ${d('divide-gray-100', 'divide-gray-800')}`}>
        {entries.map(([url, categories]) => {
          const isOpen = openUrl === url;
          const cheapest = categories.reduce((min, c) =>
            (c.price != null && (min == null || c.price < min)) ? c.price : min, null);
          return (
            <div key={url}>
              <button
                onClick={() => setOpenUrl(isOpen ? null : url)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left ${d('hover:bg-gray-50', 'hover:bg-gray-800/50')}`}
              >
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${d('text-gray-800', 'text-gray-100')}`}>{nameForUrl(url)}</p>
                  <p className={`text-xs mt-0.5 ${d('text-gray-500', 'text-gray-400')}`}>
                    {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} for sale
                    {cheapest != null && ` · from ${cheapest.toLocaleString()} ${categories[0]?.currency || ''}`}
                  </p>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className={d('text-gray-500', 'text-gray-400')}>
                        <th className="text-left py-1.5 pr-3">Category</th>
                        <th className="text-left py-1.5 pr-3">Price</th>
                        <th className="text-left py-1.5">Rooms Left</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...categories]
                        .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
                        .map((c, i) => (
                        <tr key={i} className={`border-t ${d('border-gray-100', 'border-gray-800')}`}>
                          <td className={`py-1.5 pr-3 ${d('text-gray-700', 'text-gray-200')}`}>{c.name || '—'}</td>
                          <td className={`py-1.5 pr-3 font-medium ${d('text-gray-800', 'text-gray-100')}`}>
                            {c.price != null ? `${c.price.toLocaleString()} ${c.currency || ''}` : 'N/A'}
                          </td>
                          <td className={`py-1.5 ${d('text-gray-600', 'text-gray-300')}`}>
                            {c.rooms_left != null ? c.rooms_left : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
