import React, { useState } from 'react';
import { Eye, Plus, Trash2, ChevronDown, ChevronUp, Link as LinkIcon } from 'lucide-react';

export const emptyWatchItem = () => ({
  name: '',
  prefix: '',
  product: '',
  price: '',
  currency: 'USD',
  guest_age_string: 'adult',
  enabled: true,
  reservations: '',   // comma-separated in the UI, split before sending
});

export const emptyProspective = () => ({
  cruise_URL: '',
  paid_price: '',
  loyalty_number: '',
});

/**
 * The backend has always accepted "watch_list" (track a specific add-on/
 * category on an existing reservation) and "prospective_cruises" (track an
 * unbooked cruise-planner URL against a target price) — this just gives
 * both a form instead of requiring a hand-built POST body.
 */
export default function WatchlistForm({ watchList, setWatchList, prospective, setProspective, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  const [open, setOpen] = useState(false);

  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm ${d(
    'bg-white border-gray-300 text-gray-800',
    'bg-gray-800 border-gray-700 text-gray-100'
  )}`;

  const updateWatch = (idx, field, value) =>
    setWatchList(prev => prev.map((w, i) => (i === idx ? { ...w, [field]: value } : w)));
  const addWatch = () => setWatchList(prev => [...prev, emptyWatchItem()]);
  const removeWatch = (idx) => setWatchList(prev => prev.filter((_, i) => i !== idx));

  const updateProspective = (idx, field, value) =>
    setProspective(prev => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  const addProspective = () => setProspective(prev => [...prev, emptyProspective()]);
  const removeProspective = (idx) => setProspective(prev => prev.filter((_, i) => i !== idx));

  const totalActive = watchList.length + prospective.length;

  return (
    <div className={`rounded-xl border overflow-hidden ${d('border-gray-200 bg-gray-50', 'border-gray-700 bg-gray-800/50')}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Eye className={`w-4 h-4 ${d('text-purple-600', 'text-purple-400')}`} />
          <span className={`text-sm font-semibold ${d('text-gray-700', 'text-gray-200')}`}>
            Watchlist &amp; Prospective Cruises {totalActive > 0 && `(${totalActive})`}
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5">
          {/* Watch list — add-ons/categories on existing reservations */}
          <div className="space-y-3">
            <p className={`text-xs ${d('text-gray-500', 'text-gray-400')}`}>
              Track a specific add-on or category on a booking you already have — you'll be
              notified when it drops below your target price. Reservation IDs is a
              comma-separated list of the reservation(s) this applies to.
            </p>
            {watchList.map((w, idx) => (
              <div key={idx} className={`p-3 rounded-lg border space-y-2 ${d('border-gray-200 bg-white', 'border-gray-700 bg-gray-900')}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${d('text-gray-600', 'text-gray-300')}`}>Watch item {idx + 1}</span>
                  <button onClick={() => removeWatch(idx)} className={d('text-gray-400 hover:text-red-500', 'text-gray-500 hover:text-red-400')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Name (e.g. VOOM Internet - 3 Devices)"
                    value={w.name} onChange={e => updateWatch(idx, 'name', e.target.value)} />
                  <input className={inputCls} placeholder="Target price" type="number" step="0.01"
                    value={w.price} onChange={e => updateWatch(idx, 'price', e.target.value)} />
                  <input className={inputCls} placeholder="Prefix (cruise-planner category code)"
                    value={w.prefix} onChange={e => updateWatch(idx, 'prefix', e.target.value)} />
                  <input className={inputCls} placeholder="Product (cruise-planner product code)"
                    value={w.product} onChange={e => updateWatch(idx, 'product', e.target.value)} />
                  <input className={inputCls} placeholder="Currency" value={w.currency}
                    onChange={e => updateWatch(idx, 'currency', e.target.value)} />
                  <input className={inputCls} placeholder="Reservation IDs, comma-separated"
                    value={w.reservations} onChange={e => updateWatch(idx, 'reservations', e.target.value)} />
                </div>
                <p className={`text-[11px] ${d('text-gray-400', 'text-gray-500')}`}>
                  Prefix/product come from the cruise-planner add-on's URL on royalcaribbean.com —
                  leave blank if you're not sure; the check will still run for your reservations either way.
                </p>
              </div>
            ))}
            <button onClick={addWatch}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${d('bg-gray-100 text-gray-700 hover:bg-gray-200', 'bg-gray-700 text-gray-200 hover:bg-gray-600')}`}>
              <Plus className="w-3.5 h-3.5" /> Add watch item
            </button>
          </div>

          {/* Prospective cruises — unbooked, tracked by URL */}
          <div className={`space-y-3 pt-3 border-t ${d('border-gray-200', 'border-gray-700')}`}>
            <p className={`text-xs ${d('text-gray-500', 'text-gray-400')}`}>
              Track an <strong>unbooked</strong> cruise by pasting its royalcaribbean.com/celebritycruises.com
              cruise-planner URL — you'll be alerted if the price drops below what you tell it here.
            </p>
            {prospective.map((p, idx) => (
              <div key={idx} className={`p-3 rounded-lg border space-y-2 ${d('border-gray-200 bg-white', 'border-gray-700 bg-gray-900')}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold flex items-center gap-1 ${d('text-gray-600', 'text-gray-300')}`}>
                    <LinkIcon className="w-3 h-3" /> Prospective cruise {idx + 1}
                  </span>
                  <button onClick={() => removeProspective(idx)} className={d('text-gray-400 hover:text-red-500', 'text-gray-500 hover:text-red-400')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input className={inputCls} placeholder="Cruise planner URL"
                  value={p.cruise_URL} onChange={e => updateProspective(idx, 'cruise_URL', e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Alert me below this price" type="number" step="0.01"
                    value={p.paid_price} onChange={e => updateProspective(idx, 'paid_price', e.target.value)} />
                  <input className={inputCls} placeholder="Loyalty number (optional)"
                    value={p.loyalty_number} onChange={e => updateProspective(idx, 'loyalty_number', e.target.value)} />
                </div>
              </div>
            ))}
            <button onClick={addProspective}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${d('bg-gray-100 text-gray-700 hover:bg-gray-200', 'bg-gray-700 text-gray-200 hover:bg-gray-600')}`}>
              <Plus className="w-3.5 h-3.5" /> Add prospective cruise
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Builds the payload fields from form state, dropping incomplete rows and
 * splitting the comma-separated reservations string back into an array. */
export function buildWatchlistPayload(watchList, prospective) {
  return {
    watch_list: watchList
      .filter(w => w.name && w.price)
      .map(w => ({
        name: w.name,
        prefix: w.prefix,
        product: w.product,
        price: parseFloat(w.price) || 0,
        currency: w.currency || 'USD',
        guest_age_string: w.guest_age_string || 'adult',
        enabled: true,
        reservations: (w.reservations || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
      })),
    prospective_cruises: prospective
      .filter(p => p.cruise_URL && p.paid_price)
      .map(p => ({
        cruise_URL: p.cruise_URL,
        paid_price: parseFloat(p.paid_price) || 0,
        loyalty_number: p.loyalty_number || null,
      })),
  };
}
