import React, { useEffect, useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LineChart as LineChartIcon, Loader2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5050';

/** Same priority as the backend's diffing logic: a price-drop's new (lower)
 * price first, falling back to the "confirmed best price" catalog price. */
function latestPriceForReservation(findings, reservationId) {
  const res = (findings?.reservations || []).find(r => r.reservation_id === reservationId);
  if (!res) return null;
  const drop = res.cabin_findings.find(f => f.status === 'price_drop' || f.status === 'price_drop_locked');
  if (drop) return { price: drop.new_price, currency: drop.currency };
  const confirmed = res.cabin_findings.find(f => f.status === 'confirmed_best_price');
  if (confirmed) return { price: confirmed.current_catalog_price, currency: confirmed.currency };
  return null;
}

/**
 * Fetches recent run history and plots one reservation's market price over
 * time. Entirely frontend-side — /api/history already returns findings for
 * every past run, so no backend changes were needed for this.
 */
export default function PriceTrendChart({ currentReservations, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_URL}/api/history?limit=30`)
      .then(res => res.json())
      .then(data => { if (!cancelled) setHistory(data.runs || []); })
      .catch(() => { if (!cancelled) setError('Could not load run history.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected && currentReservations?.length > 0) {
      setSelected(currentReservations[0].reservation_id);
    }
  }, [currentReservations, selected]);

  const chartData = useMemo(() => {
    if (!history || !selected) return [];
    return history
      .slice()
      .reverse() // oldest → newest, left to right
      .map(run => {
        const latest = latestPriceForReservation(run.findings, selected);
        if (!latest || latest.price == null) return null;
        return {
          date: new Date(run.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          price: latest.price,
          currency: latest.currency,
        };
      })
      .filter(Boolean);
  }, [history, selected]);

  if (!currentReservations || currentReservations.length === 0) return null;

  const selectCls = `px-3 py-1.5 rounded-lg border text-xs ${d(
    'bg-white border-gray-300 text-gray-800',
    'bg-gray-800 border-gray-700 text-gray-100'
  )}`;

  return (
    <div className={`rounded-xl border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
      <div className={`flex items-center justify-between px-4 py-2.5 ${d('bg-gray-50 border-b border-gray-200', 'bg-gray-800 border-b border-gray-700')}`}>
        <span className={`text-xs font-semibold flex items-center gap-1.5 ${d('text-gray-600', 'text-gray-300')}`}>
          <LineChartIcon className="w-3.5 h-3.5" /> Price Trend
        </span>
        <select className={selectCls} value={selected} onChange={e => setSelected(e.target.value)}>
          {currentReservations.map(r => (
            <option key={r.reservation_id} value={r.reservation_id}>
              #{r.reservation_id} {r.ship ? `— ${r.ship}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="p-4">
        {loading && (
          <div className={`flex items-center gap-2 text-xs ${d('text-gray-500', 'text-gray-400')}`}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading history…
          </div>
        )}
        {error && <p className={`text-xs ${d('text-red-600', 'text-red-400')}`}>{error}</p>}
        {!loading && !error && chartData.length < 2 && (
          <p className={`text-xs italic ${d('text-gray-400', 'text-gray-500')}`}>
            Not enough runs with a comparable price for this reservation yet — run a
            few more checks over time and a trend line will appear here.
          </p>
        )}
        {!loading && !error && chartData.length >= 2 && (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#374151' : '#e5e7eb'} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: dark ? '#9ca3af' : '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: dark ? '#9ca3af' : '#6b7280' }}
                domain={['dataMin - 20', 'dataMax + 20']} />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  backgroundColor: dark ? '#1f2937' : '#fff',
                  border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`,
                  borderRadius: 8,
                }}
                formatter={(value, _name, props) => [`${value} ${props.payload.currency || ''}`, 'Price']}
              />
              <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
