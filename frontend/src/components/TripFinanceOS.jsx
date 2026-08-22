import React, { useState, useEffect } from 'react';
import {
  Calculator, DollarSign, Trophy, Gift, Info, Plus, Trash2,
  BarChart2, ChevronDown, ChevronUp, Anchor, RefreshCw,
} from 'lucide-react';
import { PERK_PRESETS, EMPTY_TRIP } from '../data/constants';
import { storageGet, storageSet, calcTotals, fmt, fmtSGD, fmtPts, num, fetchFxRate } from '../utils/helpers';

// ── Currency badge helper ────────────────────────────────────────────────────
// Small inline label showing which currency a section uses
function CurrencyTag({ currency }) {
  const isSGD = currency === 'SGD';
  return (
    <span className={`ml-2 text-xs font-semibold px-1.5 py-0.5 rounded ${
      isSGD ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
    }`}>
      {currency}
    </span>
  );
}

// ── PerkInputRow ─────────────────────────────────────────────────────────────
// Defined outside TripFinanceOS so React doesn't remount it on every parent render.
// Uses local state for text inputs (same pattern as NumberField) to prevent
// losing focus after a single keystroke.
function PerkInputRow({ dark, perkInput, setPerkInput, onAdd }) {
  const d = (light, darkCls) => (dark ? darkCls : light);
  const isCustom = perkInput.preset === 'Custom Perk';

  const [localLabel, setLocalLabel] = React.useState('');
  const [localValue, setLocalValue] = React.useState('');

  useEffect(() => {
    setLocalLabel(perkInput.customLabel ?? '');
    setLocalValue(perkInput.customValue ?? '');
  }, [perkInput.preset, perkInput.customLabel, perkInput.customValue]);

  return (
    <div className="flex gap-2 mb-3 flex-wrap">
      <select
        value={perkInput.preset}
        onChange={(e) => setPerkInput((p) => ({ ...p, preset: e.target.value }))}
        className={`flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${d('bg-white border-gray-200 text-gray-800', 'bg-gray-800 border-gray-600 text-white')}`}
      >
        <option value="">Select a perk…</option>
        {PERK_PRESETS.map((p) => (
          <option key={p.label} value={p.label}>
            {p.label}{p.value > 0 ? ` (~$${p.value})` : ''}
          </option>
        ))}
      </select>

      {isCustom && (
        <>
          <input
            type="text"
            placeholder="Perk description"
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            onBlur={() => setPerkInput((prev) => ({ ...prev, customLabel: localLabel }))}
            className={`w-40 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${d('bg-white border-gray-200 text-gray-800', 'bg-gray-800 border-gray-600 text-white placeholder-gray-500')}`}
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder="$ value"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => setPerkInput((prev) => ({ ...prev, customValue: localValue }))}
            className={`w-24 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${d('bg-white border-gray-200 text-gray-800', 'bg-gray-800 border-gray-600 text-white placeholder-gray-500')}`}
          />
        </>
      )}

      <button
        onClick={() => onAdd(localLabel, localValue)}
        disabled={!perkInput.preset}
        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm rounded-lg flex items-center gap-1"
      >
        <Plus className="w-4 h-4" /> Add
      </button>
    </div>
  );
}

// ── TripFxRateField ───────────────────────────────────────────────────────────
// Per-trip exchange rate input. Uses local state + onBlur (same pattern as
// NumberField) so the user can type the full rate before the parent re-renders.
function TripFxRateField({ dark, d, activeTrip, newTrip, setNewTrip, globalFxRate }) {
  const [localVal, setLocalVal] = React.useState(newTrip.tripFxRate ?? '');

  useEffect(() => {
    setLocalVal(newTrip.tripFxRate ?? '');
  // eslint-disable-next-line
  }, [activeTrip]);

  const handleBlur = () => {
    let val = localVal.replace(/[^\d.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    setLocalVal(val);
    setNewTrip((prev) => ({ ...prev, tripFxRate: val }));
  };

  const handleClear = () => {
    setLocalVal('');
    setNewTrip((prev) => ({ ...prev, tripFxRate: '' }));
  };

  const isActive = num(newTrip.tripFxRate) > 0;

  return (
    <div className={`mt-4 pt-3 border-t ${d('border-gray-100', 'border-gray-700')}`}>
      <p className={`text-xs font-semibold mb-1 ${d('text-gray-600', 'text-gray-300')}`}>
        💱 Exchange Rate for This Trip's USD Spending
      </p>
      <p className={`text-xs mb-2 ${d('text-gray-400', 'text-gray-500')}`}>
        Set the SGD/USD rate you exchanged at for this cruise. Applies to casino &amp; all onboard
        spending. Leave blank to use the global rate ({globalFxRate.toFixed(4)}).
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-sm ${d('text-gray-500', 'text-gray-400')}`}>1 USD =</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder={globalFxRate.toFixed(4)}
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={handleBlur}
          onFocus={() => setLocalVal((v) => v.toString().replace(/,/g, ''))}
          className={`w-32 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${d('bg-white border-gray-200 text-gray-800', 'bg-gray-800 border-gray-600 text-white placeholder-gray-500')}`}
        />
        <span className={`text-sm ${d('text-gray-500', 'text-gray-400')}`}>SGD</span>
        {isActive && (
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${d('bg-green-100 text-green-700', 'bg-green-900/30 text-green-400')}`}>
            ✓ Custom rate active
          </span>
        )}
        {isActive && (
          <button
            onClick={handleClear}
            className={`text-xs px-2 py-1 rounded-lg ${d('bg-gray-100 hover:bg-gray-200 text-gray-500', 'bg-gray-700 hover:bg-gray-600 text-gray-400')}`}
          >Clear</button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TripFinanceOS({ dark }) {
  const d = (light, darkCls) => (dark ? darkCls : light);

  const [trips, setTrips]               = useState(() => storageGet('rc_trips', []));
  const [activeTrip, setActiveTrip]     = useState(null);
  const [showNewTripForm, setShowNewTripForm] = useState(false);
  const [newTrip, setNewTrip]           = useState({ ...EMPTY_TRIP, id: Date.now() });
  const [perkInput, setPerkInput]       = useState({ preset: '', customLabel: '', customValue: '' });
  const [expandedSection, setExpandedSection] = useState('cruise');
  const [viewingTrip, setViewingTrip]   = useState(null);

  // ── FX rate state ────────────────────────────────────────────────────────
  const [fxRate, setFxRate]         = useState(() => storageGet('rc_fxRate', 1.35));
  const [fxOverride, setFxOverride] = useState('');  // user's manual input
  const [fxLoading, setFxLoading]   = useState(false);
  const [fxDate, setFxDate]         = useState(() => storageGet('rc_fxDate', null));

  useEffect(() => { storageSet('rc_trips', trips); }, [trips]);
  useEffect(() => { storageSet('rc_fxRate', fxRate); }, [fxRate]);

  const refreshFxRate = async () => {
    setFxLoading(true);
    const rate = await fetchFxRate();
    if (rate) {
      setFxRate(rate);
      const today = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
      setFxDate(today);
      storageSet('rc_fxDate', today);
    }
    setFxLoading(false);
  };

  // Auto-fetch on first load if no cached rate or rate is default
  useEffect(() => {
    if (!fxDate) refreshFxRate();
  // eslint-disable-next-line
  }, []);

  const applyManualRate = () => {
    const v = parseFloat(fxOverride);
    if (v > 0) { setFxRate(v); setFxDate('manual'); }
    setFxOverride('');
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const addPerk = (localLabel, localValue) => {
    const preset = PERK_PRESETS.find((p) => p.label === perkInput.preset);
    if (!preset) return;
    const label = preset.label === 'Custom Perk' ? (localLabel || perkInput.customLabel || 'Custom Perk') : preset.label;
    const value = preset.label === 'Custom Perk' ? num(localValue ?? perkInput.customValue) : preset.value;
    if (!label || value <= 0) return;
    setNewTrip((t) => ({ ...t, perks: [...(t.perks || []), { id: Date.now(), label, value }] }));
    setPerkInput({ preset: '', customLabel: '', customValue: '' });
  };

  const removePerk = (id) => setNewTrip((t) => ({ ...t, perks: t.perks.filter((p) => p.id !== id) }));

  const saveTrip = () => {
    if (!newTrip.name) return;
    if (activeTrip) {
      setTrips((ts) => ts.map((t) => (t.id === activeTrip ? newTrip : t)));
      setActiveTrip(null);
    } else {
      setTrips((ts) => [...ts, newTrip]);
    }
    setNewTrip({ ...EMPTY_TRIP, id: Date.now() });
    setShowNewTripForm(false);
    setExpandedSection('cruise');
  };

  const editTrip = (trip) => {
    setNewTrip(trip);
    setActiveTrip(trip.id);
    setShowNewTripForm(true);
    setViewingTrip(null);
  };

  const deleteTrip = (id) => setTrips((ts) => ts.filter((t) => t.id !== id));

  // ── Sub-components ────────────────────────────────────────────────────────

  const NumberField = ({ fieldKey, label, placeholder = '0', prefix = '$' }) => {
    const [localValue, setLocalValue] = React.useState('');

    useEffect(() => {
      setLocalValue(newTrip[fieldKey] ?? '');
      // eslint-disable-next-line
    }, [activeTrip]);

    const handleBlur = () => {
      let val = localValue.replace(/[^\d.]/g, '');
      const parts = val.split('.');
      if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
      setNewTrip((prev) => ({ ...prev, [fieldKey]: val }));
      if (val) {
        const numVal = parseFloat(val);
        if (!isNaN(numVal)) setLocalValue(numVal.toLocaleString(undefined, { maximumFractionDigits: 2 }));
      }
    };

    return (
      <div className="flex flex-col gap-1">
        <label className={`text-xs font-medium ${d('text-gray-500', 'text-gray-400')}`}>{label}</label>
        <div className="relative">
          <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${d('text-gray-400', 'text-gray-500')}`}>{prefix}</span>
          <input
            type="text" inputMode="decimal" placeholder={placeholder}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onFocus={() => setLocalValue((v) => v.toString().replace(/,/g, ''))}
            className={`w-full pl-7 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${d('bg-white border-gray-200 text-gray-800', 'bg-gray-800 border-gray-600 text-white placeholder-gray-500')}`}
          />
        </div>
      </div>
    );
  };

  const Section = ({ id, title, icon: Icon, currency, children }) => (
    <div className={`rounded-xl overflow-hidden border mb-3 ${d('border-gray-200', 'border-gray-700')}`}>
      <button
        onClick={() => setExpandedSection(expandedSection === id ? null : id)}
        className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold ${d('bg-gray-50 text-gray-700 hover:bg-gray-100', 'bg-gray-800 text-gray-200 hover:bg-gray-750')}`}>
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4" />{title}
          {currency && <CurrencyTag currency={currency} />}
        </span>
        {expandedSection === id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expandedSection === id && (
        <div className={`px-4 py-4 ${d('bg-white', 'bg-gray-900')}`}>{children}</div>
      )}
    </div>
  );

  // ── Dual-currency summary row ────────────────────────────────────────────
  const CurrencySummary = ({ totals, label = 'Summary' }) => (
    <div className={`rounded-xl p-4 mb-4 ${d('bg-gray-50 border border-gray-200', 'bg-gray-800 border border-gray-700')}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${d('text-gray-500', 'text-gray-400')}`}>{label}</p>

      {/* SGD + USD side by side */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        {/* SGD column */}
        <div className={`rounded-lg p-3 ${d('bg-red-50', 'bg-red-900/10')}`}>
          <p className={`text-xs font-bold mb-2 ${d('text-red-600', 'text-red-400')}`}>🇸🇬 SGD (Pre-cruise)</p>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className={d('text-gray-500','text-gray-400')}>Cruise + Fees</span>
              <span className={d('text-gray-800','text-gray-200')}>{fmtSGD(totals.cruiseBase)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className={d('text-gray-500','text-gray-400')}>Travel</span>
              <span className={d('text-gray-800','text-gray-200')}>{fmtSGD(totals.travel)}</span>
            </div>
            <div className={`flex justify-between text-xs font-semibold pt-1 border-t ${d('border-red-200','border-red-800')}`}>
              <span className={d('text-red-700','text-red-300')}>Total SGD</span>
              <span className={d('text-red-700','text-red-300')}>{fmtSGD(totals.totalSGD)}</span>
            </div>
          </div>
        </div>

        {/* USD column */}
        <div className={`rounded-lg p-3 ${d('bg-blue-50', 'bg-blue-900/10')}`}>
          <p className={`text-xs font-bold mb-2 ${d('text-blue-600', 'text-blue-400')}`}>🇺🇸 USD (Onboard)</p>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className={d('text-gray-500','text-gray-400')}>Onboard</span>
              <span className={d('text-gray-800','text-gray-200')}>{fmt(totals.onboard)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className={d('text-gray-500','text-gray-400')}>Casino</span>
              <span className={d('text-gray-800','text-gray-200')}>{fmt(totals.casino)}</span>
            </div>
            <div className={`flex justify-between text-xs font-semibold pt-1 border-t ${d('border-blue-200','border-blue-800')}`}>
              <span className={d('text-blue-700','text-blue-300')}>Total USD</span>
              <span className={d('text-blue-700','text-blue-300')}>{fmt(totals.totalUSD)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grand total converted */}
      <div className={`rounded-lg p-3 ${d('bg-gray-100', 'bg-gray-700')}`}>
        <p className={`text-xs font-bold mb-2 ${d('text-gray-600', 'text-gray-300')}`}>
          Grand Total{' '}
          {totals.hasTripRate ? (
            <span className={`text-xs font-normal ${d('text-green-600','text-green-400')}`}>
              (trip rate: 1 USD = {totals.usdFxRate.toFixed(4)} SGD 💱)
            </span>
          ) : (
            <span className={`text-xs font-normal ${d('text-gray-400','text-gray-500')}`}>
              (rate: 1 USD = {totals.usdFxRate.toFixed(4)} SGD)
            </span>
          )}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className={`text-xs ${d('text-gray-500','text-gray-400')}`}>In SGD</p>
            <p className={`text-lg font-bold ${d('text-gray-800','text-white')}`}>{fmtSGD(totals.grandSGD)}</p>
          </div>
          <div>
            <p className={`text-xs ${d('text-gray-500','text-gray-400')}`}>In USD</p>
            <p className={`text-lg font-bold ${d('text-gray-800','text-white')}`}>{fmt(totals.grandUSD)}</p>
          </div>
        </div>
        {totals.perksUSD > 0 && (
          <div className={`mt-2 pt-2 border-t ${d('border-gray-200','border-gray-600')}`}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className={`text-xs ${d('text-gray-500','text-gray-400')}`}>Net after Perks (SGD)</p>
                <p className={`text-base font-bold ${totals.netSGD <= 0 ? d('text-blue-600','text-blue-400') : d('text-orange-600','text-orange-400')}`}>
                  {fmtSGD(totals.netSGD)}
                </p>
              </div>
              <div>
                <p className={`text-xs ${d('text-gray-500','text-gray-400')}`}>Net after Perks (USD)</p>
                <p className={`text-base font-bold ${totals.netUSD <= 0 ? d('text-blue-600','text-blue-400') : d('text-orange-600','text-orange-400')}`}>
                  {fmt(totals.netUSD)}
                </p>
              </div>
            </div>
            {totals.netSGD <= 0 && <p className={`text-xs mt-1 ${d('text-blue-500','text-blue-400')}`}>🎉 Perks exceed total cost!</p>}
          </div>
        )}
      </div>

      {/* Casino points */}
      {totals.pts > 0 && (
        <div className={`mt-2 flex items-center gap-2 text-xs ${d('text-gray-500', 'text-gray-400')}`}>
          <Trophy className="w-3.5 h-3.5 text-yellow-500" />
          <span>{fmtPts(totals.pts)} pts earned</span>
          {totals.costPerPoint > 0 && <span className="ml-auto">{fmt(totals.costPerPoint)}/pt</span>}
        </div>
      )}
      {totals.goalPct > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-xs mb-1">
            <span className={d('text-gray-500','text-gray-400')}>Points Goal</span>
            <span>{totals.goalPct.toFixed(0)}%</span>
          </div>
          <div className={`h-2 rounded-full ${d('bg-gray-200','bg-gray-700')}`}>
            <div className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-yellow-500 transition-all duration-500" style={{ width: `${totals.goalPct}%` }} />
          </div>
        </div>
      )}
    </div>
  );

  const TripCard = ({ t, isPast }) => {
    const totals = calcTotals(t, fxRate);

    // Days until sail countdown (for upcoming trips)
    const daysUntil = (() => {
      if (!t.sailDate || isPast) return null;
      const sail = new Date(t.sailDate);
      sail.setHours(0, 0, 0, 0);
      const diff = Math.round((sail - today) / (1000 * 60 * 60 * 24));
      return diff;
    })();

    return (
      <div
        className={`rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
          isPast
            ? d('bg-gray-50 border-gray-200 hover:border-gray-300 opacity-70', 'bg-gray-900 border-gray-700 hover:border-gray-500 opacity-60')
            : d('bg-white border-gray-200 hover:border-blue-300', 'bg-gray-800 border-gray-700 hover:border-blue-600')
        }`}
        onClick={() => setViewingTrip(viewingTrip === t.id ? null : t.id)}>

        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-bold ${isPast ? d('text-gray-500', 'text-gray-400') : d('text-gray-900', 'text-white')}`}>
                {t.name || 'Unnamed Trip'}
              </p>
              {/* Countdown badge for upcoming trips */}
              {daysUntil !== null && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  daysUntil === 0
                    ? 'bg-green-100 text-green-700'
                    : daysUntil <= 7
                    ? 'bg-orange-100 text-orange-700'
                    : daysUntil <= 30
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-blue-100 text-blue-600'
                }`}>
                  {daysUntil === 0 ? '⚓ Today!' : `⏳ ${daysUntil}d to go`}
                </span>
              )}
            </div>
            <p className={`text-xs mt-0.5 ${d('text-gray-500', 'text-gray-400')}`}>
              {t.ship}{t.sailDate ? ` · ${t.sailDate}` : ''}{t.nights ? ` · ${t.nights}N` : ''}
              {totals.hasTripRate && (
                <span className={`ml-1 font-medium ${d('text-green-600','text-green-400')}`}>
                  · 💱 {totals.usdFxRate.toFixed(4)}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2 ml-2 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); editTrip(t); }}
              className={`p-1.5 rounded-lg text-xs ${d('bg-gray-100 hover:bg-gray-200 text-gray-600', 'bg-gray-700 hover:bg-gray-600 text-gray-300')}`}>Edit</button>
            <button onClick={(e) => { e.stopPropagation(); deleteTrip(t.id); }}
              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick stats: SGD / USD / Net */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            ['SGD Spent', fmtSGD(totals.totalSGD), d('bg-red-50 text-red-500','bg-red-900/20 text-red-400'), isPast ? d('text-red-400','text-red-400') : d('text-red-600','text-red-300')],
            ['USD Spent', fmt(totals.totalUSD),     d('bg-blue-50 text-blue-500','bg-blue-900/20 text-blue-400'), isPast ? d('text-blue-400','text-blue-400') : d('text-blue-700','text-blue-300')],
            ['Net (SGD)', fmtSGD(totals.netSGD),
              totals.netSGD <= 0 ? d('bg-green-50 text-green-500','bg-green-900/20 text-green-400') : d('bg-orange-50 text-orange-500','bg-orange-900/20 text-orange-400'),
              totals.netSGD <= 0 ? d('text-green-700','text-green-300') : d('text-orange-700','text-orange-300')],
          ].map(([label, val, bgCls, textCls]) => (
            <div key={label} className={`rounded-lg p-2 text-center ${bgCls}`}>
              <p className="text-xs">{label}</p>
              <p className={`text-sm font-bold ${textCls}`}>{val}</p>
            </div>
          ))}
        </div>

        {totals.pts > 0 && (
          <div className={`mt-2 flex items-center gap-2 text-xs ${d('text-gray-500', 'text-gray-400')}`}>
            <Trophy className="w-3.5 h-3.5 text-yellow-500" />
            <span>{fmtPts(totals.pts)} pts earned</span>
            {totals.costPerPoint > 0 && <span className="ml-auto">{fmt(totals.costPerPoint)}/pt</span>}
          </div>
        )}

        {viewingTrip === t.id && (
          <div className={`mt-3 pt-3 border-t ${d('border-gray-100', 'border-gray-700')}`} onClick={(e) => e.stopPropagation()}>
            <CurrencySummary totals={totals} label="Trip Breakdown" />
            {t.perks?.length > 0 && (
              <div className={`mt-2 pt-2 border-t ${d('border-gray-100', 'border-gray-700')}`}>
                <p className={`text-xs font-semibold mb-1 ${d('text-gray-500', 'text-gray-400')}`}>Perks Received (USD)</p>
                {t.perks.map((p) => (
                  <div key={p.id} className="flex justify-between text-xs">
                    <span className={d('text-gray-600', 'text-gray-400')}>{p.label}</span>
                    <span className={d('text-green-600', 'text-green-400')}>{fmt(p.value)} / {fmtSGD(p.value * fxRate)}</span>
                  </div>
                ))}
              </div>
            )}
            {t.notes && <p className={`mt-2 text-xs italic ${d('text-gray-400', 'text-gray-500')}`}>{t.notes}</p>}
          </div>
        )}
      </div>
    );
  };

  // ── Past / Future split ───────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pastTrips   = trips.filter((t) => t.sailDate && new Date(t.sailDate) < today);
  const futureTrips = trips.filter((t) => !t.sailDate || new Date(t.sailDate) >= today);

  // Sort past trips newest-first, future trips soonest-first
  pastTrips.sort((a, b) => new Date(b.sailDate) - new Date(a.sailDate));
  futureTrips.sort((a, b) => {
    if (!a.sailDate && !b.sailDate) return 0;
    if (!a.sailDate) return 1;
    if (!b.sailDate) return -1;
    return new Date(a.sailDate) - new Date(b.sailDate);
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* FX Rate Bar */}
      <div className={`rounded-xl p-3 mb-4 border flex flex-wrap items-center gap-3 ${d('bg-amber-50 border-amber-200', 'bg-amber-900/10 border-amber-800')}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Calculator className={`w-4 h-4 shrink-0 ${d('text-amber-600','text-amber-400')}`} />
          <span className={`text-xs font-semibold ${d('text-amber-800','text-amber-300')}`}>
            1 USD = {fxRate.toFixed(4)} SGD
            {fxDate && <span className={`ml-1 font-normal ${d('text-amber-600','text-amber-500')}`}>({fxDate})</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text" inputMode="decimal" placeholder="Override rate"
            value={fxOverride}
            onChange={(e) => setFxOverride(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyManualRate()}
            className={`w-28 px-2 py-1 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 ${d('bg-white border-amber-300 text-gray-800','bg-gray-800 border-amber-700 text-white')}`}
          />
          <button onClick={applyManualRate} className={`px-2 py-1 rounded-lg text-xs font-medium ${d('bg-amber-200 hover:bg-amber-300 text-amber-900','bg-amber-800 hover:bg-amber-700 text-amber-100')}`}>
            Set
          </button>
          <button onClick={refreshFxRate} disabled={fxLoading}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${d('bg-amber-600 hover:bg-amber-700 text-white','bg-amber-700 hover:bg-amber-600 text-white')} disabled:opacity-50`}>
            <RefreshCw className={`w-3 h-3 ${fxLoading ? 'animate-spin' : ''}`} />
            {fxLoading ? 'Fetching…' : 'Live Rate'}
          </button>
        </div>
      </div>

      {/* Split Summary Banners — Upcoming vs Past */}
      {trips.length > 0 && (() => {
        const makeSummary = (tripList) => tripList.map((t) => calcTotals(t, fxRate)).reduce((s, t) => ({
          totalSGD: s.totalSGD + t.totalSGD,
          totalUSD: s.totalUSD + t.totalUSD,
          grandSGD: s.grandSGD + t.grandSGD,
          grandUSD: s.grandUSD + t.grandUSD,
          netSGD:   s.netSGD   + t.netSGD,
          netUSD:   s.netUSD   + t.netUSD,
          pts:      s.pts      + t.pts,
          casino:   s.casino   + t.casino,
        }), { totalSGD:0, totalUSD:0, grandSGD:0, grandUSD:0, netSGD:0, netUSD:0, pts:0, casino:0 });

        const futureSummary = makeSummary(futureTrips);
        const pastSummary   = makeSummary(pastTrips);

        const SummaryBanner = ({ label, emoji, summary, gradientLight, gradientDark, borderLight, borderDark, titleCls }) => (
          <div className={`rounded-xl p-4 mb-3 border ${d(`bg-gradient-to-r ${gradientLight} ${borderLight}`, `bg-gradient-to-r ${gradientDark} ${borderDark}`)}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${titleCls}`}>
              <BarChart2 className="w-4 h-4 inline mr-1" />{emoji} {label}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['SGD Spent', fmtSGD(summary.totalSGD), d('text-red-600','text-red-300')],
                ['USD Spent', fmt(summary.totalUSD),     d('text-blue-600','text-blue-300')],
                ['Net (SGD)', fmtSGD(summary.netSGD),    summary.netSGD <= 0 ? d('text-green-700','text-green-300') : d('text-orange-600','text-orange-300')],
                ['Net (USD)', fmt(summary.netUSD),        summary.netUSD <= 0 ? d('text-green-700','text-green-300') : d('text-orange-600','text-orange-300')],
              ].map(([l, v, cls]) => (
                <div key={l}>
                  <p className={`text-xs ${d('text-gray-500','text-gray-400')}`}>{l}</p>
                  <p className={`text-base font-bold ${cls}`}>{v}</p>
                </div>
              ))}
            </div>
            <div className={`grid grid-cols-2 gap-3 mt-2 pt-2 border-t ${d(borderLight.replace('border-','border-t-'), borderDark.replace('border-','border-t-'))}`}>
              <div>
                <p className={`text-xs ${d('text-gray-500','text-gray-400')}`}>Grand Total (SGD)</p>
                <p className={`text-sm font-bold ${d('text-gray-700','text-gray-200')}`}>{fmtSGD(summary.grandSGD)}</p>
              </div>
              <div>
                <p className={`text-xs ${d('text-gray-500','text-gray-400')}`}>Grand Total (USD)</p>
                <p className={`text-sm font-bold ${d('text-gray-700','text-gray-200')}`}>{fmt(summary.grandUSD)}</p>
              </div>
            </div>
            {summary.casino > 0 && summary.pts > 0 && (
              <p className={`text-xs mt-2 ${d('text-gray-500','text-gray-400')}`}>
                Avg casino cost/pt: <span className="font-semibold">{fmt(summary.casino / summary.pts)}</span>
              </p>
            )}
          </div>
        );

        return (
          <div className="mb-5">
            {futureTrips.length > 0 && (
              <SummaryBanner
                label="Upcoming Spend"
                emoji="🚢"
                summary={futureSummary}
                gradientLight="from-blue-50 to-indigo-50" gradientDark="from-blue-900/20 to-indigo-900/20"
                borderLight="border-blue-100" borderDark="border-blue-800"
                titleCls={d('text-blue-700','text-blue-300')}
              />
            )}
            {pastTrips.length > 0 && (
              <SummaryBanner
                label="Past Spend"
                emoji="🏁"
                summary={pastSummary}
                gradientLight="from-gray-50 to-slate-50" gradientDark="from-gray-800/40 to-slate-800/40"
                borderLight="border-gray-200" borderDark="border-gray-700"
                titleCls={d('text-gray-500','text-gray-400')}
              />
            )}
          </div>
        );
      })()}

      {/* Trip List — split by date */}
      {trips.length > 0 && !showNewTripForm && (
        <div className="mb-5">
          {/* ── Upcoming / Future Trips ── */}
          {futureTrips.length > 0 && (
            <div className="mb-5">
              <div className={`flex items-center gap-2 mb-3 pb-1 border-b ${d('border-blue-200', 'border-blue-700')}`}>
                <span className="text-base">🚢</span>
                <h3 className={`text-sm font-bold uppercase tracking-wide ${d('text-blue-600', 'text-blue-400')}`}>
                  Upcoming Trips
                </h3>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${d('bg-blue-100 text-blue-600', 'bg-blue-900/40 text-blue-300')}`}>
                  {futureTrips.length}
                </span>
              </div>
              <div className="space-y-3">
                {futureTrips.map((t) => <TripCard key={t.id} t={t} isPast={false} />)}
              </div>
            </div>
          )}

          {/* ── Past Trips ── */}
          {pastTrips.length > 0 && (
            <div>
              <div className={`flex items-center gap-2 mb-3 pb-1 border-b ${d('border-gray-200', 'border-gray-600')}`}>
                <span className="text-base">🏁</span>
                <h3 className={`text-sm font-bold uppercase tracking-wide ${d('text-gray-500', 'text-gray-400')}`}>
                  Past Trips
                </h3>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${d('bg-gray-100 text-gray-500', 'bg-gray-700 text-gray-400')}`}>
                  {pastTrips.length}
                </span>
              </div>
              <div className="space-y-3">
                {pastTrips.map((t) => <TripCard key={t.id} t={t} isPast={true} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New / Edit Trip Form */}
      {showNewTripForm ? (
        <div className={`rounded-xl border p-5 ${d('border-blue-200 bg-blue-50/30', 'border-blue-800 bg-blue-900/10')}`}>
          <h3 className={`text-base font-bold mb-4 ${d('text-gray-800', 'text-white')}`}>
            {activeTrip ? '✏️ Edit Trip' : '🚢 New Trip'}
          </h3>

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label className={`text-xs font-medium ${d('text-gray-500', 'text-gray-400')}`}>Trip Name *</label>
              <input type="text" placeholder="e.g. Harmony 5-night Aug 2025" value={newTrip.name || ''}
                onChange={(e) => setNewTrip((prev) => ({ ...prev, name: e.target.value }))}
                className={`px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${d('bg-white border-gray-200 text-gray-800', 'bg-gray-800 border-gray-600 text-white placeholder-gray-500')}`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={`text-xs font-medium ${d('text-gray-500', 'text-gray-400')}`}>Ship</label>
              <input type="text" placeholder="e.g. Harmony of the Seas" value={newTrip.ship || ''}
                onChange={(e) => setNewTrip((prev) => ({ ...prev, ship: e.target.value }))}
                className={`px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${d('bg-white border-gray-200 text-gray-800', 'bg-gray-800 border-gray-600 text-white placeholder-gray-500')}`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className={`text-xs font-medium ${d('text-gray-500', 'text-gray-400')}`}>Sail Date</label>
                <input type="date" value={newTrip.sailDate || ''}
                  onChange={(e) => setNewTrip((prev) => ({ ...prev, sailDate: e.target.value }))}
                  className={`px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${d('bg-white border-gray-200 text-gray-800', 'bg-gray-800 border-gray-600 text-white')}`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={`text-xs font-medium ${d('text-gray-500', 'text-gray-400')}`}>Nights</label>
                <input type="text" inputMode="numeric" placeholder="7" value={newTrip.nights || ''}
                  onChange={(e) => setNewTrip((prev) => ({ ...prev, nights: e.target.value.replace(/[^\d]/g, '') }))}
                  className={`px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${d('bg-white border-gray-200 text-gray-800', 'bg-gray-800 border-gray-600 text-white')}`} />
              </div>
            </div>
          </div>

          <Section id="cruise" title="Cruise Cost" icon={Anchor} currency="SGD">
            <p className={`text-xs mb-3 ${d('text-gray-400','text-gray-500')}`}>These are paid in SGD before you board.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <NumberField fieldKey="cruiseCost" label="Cruise Fare (Ticket)" prefix="S$" />
              <NumberField fieldKey="taxes"      label="Taxes & Port Fees"    prefix="S$" />
              <NumberField fieldKey="airfare"    label="Airfare"              prefix="S$" />
              <NumberField fieldKey="hotel"      label="Pre/Post Hotel"       prefix="S$" />
              <NumberField fieldKey="roaming"    label="Roaming"              prefix="S$" />
              <NumberField fieldKey="insurance"  label="Insurance"            prefix="S$" />
            </div>
          </Section>

          <Section id="onboard" title="Onboard Spending" icon={DollarSign} currency="USD">
            <p className={`text-xs mb-3 ${d('text-gray-400','text-gray-500')}`}>Onboard charges are billed in USD.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <NumberField fieldKey="foodDrinks"   label="Food & Drinks"   />
              <NumberField fieldKey="excursions"   label="Excursions"      />
              <NumberField fieldKey="spa"          label="Spa & Wellness"  />
              <NumberField fieldKey="shopping"     label="Shopping"        />
              <NumberField fieldKey="otherOnboard" label="Other Onboard"   />
            </div>
          </Section>

          <Section id="casino" title="Casino & Spending" icon={Trophy} currency="USD">
            <div className={`flex items-start gap-2 mb-3 p-2 rounded-lg text-xs ${d('bg-amber-50 text-amber-700', 'bg-amber-900/20 text-amber-400')}`}>
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Casino &amp; onboard charges are in USD. Data is stored locally and never shared.</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <NumberField fieldKey="casinoSpend"        label="Casino Buy-ins / Losses" />
              <NumberField fieldKey="casinoPointsEarned" label="Casino Points Earned"    prefix="🏆" />
              <NumberField fieldKey="casinoPointsGoal"   label="Points Goal (optional)"  prefix="🎯" />
            </div>

            {/* Per-trip exchange rate override */}
            <TripFxRateField
              dark={dark}
              d={d}
              activeTrip={activeTrip}
              newTrip={newTrip}
              setNewTrip={setNewTrip}
              globalFxRate={fxRate}
            />
          </Section>

          <Section id="perks" title="Perks & Rewards Received" icon={Gift} currency="USD">
            <p className={`text-xs mb-3 ${d('text-gray-400','text-gray-500')}`}>Perk values are in USD (onboard credits, free cabins, etc.).</p>
            <PerkInputRow
              dark={dark}
              perkInput={perkInput}
              setPerkInput={setPerkInput}
              onAdd={addPerk}
            />
            {newTrip.perks?.length > 0 && (
              <div className="space-y-1">
                {newTrip.perks.map((p) => (
                  <div key={p.id} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${d('bg-green-50 text-green-800', 'bg-green-900/20 text-green-300')}`}>
                    <span>{p.label}</span>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs ${d('text-gray-400','text-gray-500')}`}>{fmt(p.value)} / {fmtSGD(p.value * fxRate)}</span>
                      <button onClick={() => removePerk(p.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Live Summary */}
          <CurrencySummary totals={calcTotals(newTrip, fxRate)} label="Live Summary" />

          <div className="flex flex-col gap-2 mb-3">
            <label className={`text-xs font-medium ${d('text-gray-500','text-gray-400')}`}>Notes</label>
            <textarea rows={2} placeholder="Anything else to remember about this trip…" value={newTrip.notes}
              onChange={(e) => setNewTrip((t) => ({ ...t, notes: e.target.value }))}
              className={`px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${d('bg-white border-gray-200 text-gray-800','bg-gray-800 border-gray-600 text-white placeholder-gray-500')}`} />
          </div>

          <div className="flex gap-2">
            <button onClick={saveTrip} disabled={!newTrip.name}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg text-sm">
              {activeTrip ? 'Update Trip' : 'Save Trip'}
            </button>
            <button onClick={() => { setShowNewTripForm(false); setActiveTrip(null); setNewTrip({ ...EMPTY_TRIP, id: Date.now() }); }}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium ${d('bg-gray-100 hover:bg-gray-200 text-gray-700','bg-gray-700 hover:bg-gray-600 text-gray-200')}`}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowNewTripForm(true)}
          className="w-full py-3 border-2 border-dashed border-blue-400 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
          <Plus className="w-5 h-5" /> Add New Trip
        </button>
      )}
    </div>
  );
}
