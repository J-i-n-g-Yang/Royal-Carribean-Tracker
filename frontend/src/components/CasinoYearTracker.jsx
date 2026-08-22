import React, { useState, useMemo } from 'react';
import {
  Trophy, DollarSign, TrendingUp, TrendingDown, Calendar,
  Target, Award, BarChart2, Activity, ChevronDown, ChevronUp,
  Zap, Star, AlertCircle,
} from 'lucide-react';
import { storageGet, fmt, fmtPts, num, calcTotals } from '../utils/helpers';

// ─── Colour palette ────────────────────────────────────────────────────────────
const C = {
  gold:   '#f59e0b',
  blue:   '#3b82f6',
  green:  '#10b981',
  red:    '#ef4444',
  indigo: '#6366f1',
  teal:   '#14b8a6',
  purple: '#a855f7',
  rose:   '#f43f5e',
};

// ─── Derive casino year label from a sail date ────────────────────────────────
// Casino year: Apr 1 YYYY → Mar 31 (YYYY+1)
// e.g. a trip on 2024-06-15 belongs to "CY 2024/25"
function getCasinoYear(sailDate) {
  if (!sailDate) return null;
  const d = new Date(sailDate + 'T00:00:00');
  if (isNaN(d)) return null;
  const yr = d.getFullYear();
  const mo = d.getMonth() + 1; // 1-based
  const startYear = mo >= 4 ? yr : yr - 1;
  return { startYear, label: `CY ${startYear}/${String(startYear + 1).slice(-2)}` };
}

// ─── Small helpers ────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function toSvgPts(values, W, H, padX = 40, padY = 18) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v, i) => ({
    x: padX + (i / Math.max(values.length - 1, 1)) * (W - padX * 2),
    y: padY + (1 - (v - min) / range) * (H - padY * 2),
    v,
  }));
}

// ─── Mini Sparkline ───────────────────────────────────────────────────────────
function Sparkline({ values, color, dark }) {
  if (!values || values.length < 2) return null;
  const W = 120, H = 36;
  const coords = toSvgPts(values, W, H, 4, 4);
  const areaPts = [
    `${coords[0].x},${H}`,
    ...coords.map(c => `${c.x},${c.y}`),
    `${coords[coords.length - 1].x},${H}`,
  ].join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-24 h-9">
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#sg-${color.replace('#','')})`} />
      <polyline
        points={coords.map(c => `${c.x},${c.y}`).join(' ')}
        fill="none" stroke={color} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round"
      />
      <circle cx={coords[coords.length-1].x} cy={coords[coords.length-1].y}
        r={2.5} fill={color} />
    </svg>
  );
}

// ─── Year comparison bar chart ────────────────────────────────────────────────
function YearBarChart({ years, metric, color, formatY, dark }) {
  const [hover, setHover] = useState(null);
  const W = 540, H = 140;
  const vals = years.map(y => y[metric]);
  const maxVal = Math.max(...vals.map(Math.abs), 1);
  const barW = clamp((W - 80) / years.length - 8, 12, 56);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 28}`} className="w-full" style={{ minWidth: 280 }}>
        {years.map((y, i) => {
          const x = 40 + i * ((W - 60) / years.length) + ((W - 60) / years.length - barW) / 2;
          const isPos = y[metric] >= 0;
          const ratio = Math.abs(y[metric]) / maxVal;
          const barH = clamp(ratio * 110, 2, 110);
          const barY = H - 20 - barH;
          const barColor = y[metric] <= 0 ? C.red : color;

          return (
            <g key={y.label} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={barY} width={barW} height={barH} rx={4}
                fill={barColor} fillOpacity={hover === i ? 1 : 0.75}
                style={{ transition: 'fill-opacity 0.15s' }} />
              {hover === i && (
                <g>
                  <rect x={x + barW / 2 - 55} y={barY - 28}
                    width={110} height={22} rx={5}
                    fill={dark ? '#1f2937' : '#fff'} stroke={barColor} strokeWidth={1} />
                  <text x={x + barW / 2} y={barY - 12}
                    textAnchor="middle" fontSize={10}
                    fill={dark ? '#e5e7eb' : '#374151'} fontWeight="600">
                    {formatY ? formatY(y[metric]) : y[metric].toLocaleString()}
                  </text>
                </g>
              )}
              <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize={9}
                fill={dark ? '#6b7280' : '#9ca3af'} fontWeight="500">
                {y.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── KPI card with optional sparkline ─────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, spark, dark }) {
  const d = (l, dk) => dark ? dk : l;
  return (
    <div className={`rounded-2xl p-4 border ${d('bg-white border-gray-100 shadow-sm', 'bg-gray-800 border-gray-700')}`}>
      <div className="flex items-start justify-between mb-1">
        <p className={`text-[10px] font-bold uppercase tracking-widest ${d('text-gray-400', 'text-gray-500')}`}>{label}</p>
        <Icon className="w-3.5 h-3.5 mt-0.5" style={{ color }} />
      </div>
      <div className="flex items-end justify-between mt-1">
        <div>
          <p className="text-xl font-extrabold leading-tight" style={{ color }}>{value}</p>
          {sub && <p className={`text-[10px] mt-0.5 ${d('text-gray-400', 'text-gray-500')}`}>{sub}</p>}
        </div>
        {spark && <Sparkline values={spark} color={color} dark={dark} />}
      </div>
    </div>
  );
}

// ─── Year header pill ─────────────────────────────────────────────────────────
function YearPill({ label, active, onClick, dark }) {
  const d = (l, dk) => dark ? dk : l;
  return (
    <button onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
        active
          ? 'bg-amber-500 text-white shadow-md scale-105'
          : d('bg-gray-100 text-gray-500 hover:bg-gray-200', 'bg-gray-700 text-gray-400 hover:bg-gray-600')
      }`}>
      {label}
    </button>
  );
}

// ─── Trip row inside a year ───────────────────────────────────────────────────
function TripRow({ t, dark }) {
  const d = (l, dk) => dark ? dk : l;
  return (
    <tr className={`border-b text-xs ${d('border-gray-50 hover:bg-amber-50/40', 'border-gray-700/50 hover:bg-amber-900/10')} transition-colors`}>
      <td className={`py-2 pr-4 font-semibold ${d('text-gray-800', 'text-gray-200')}`}>{t.name || 'Unnamed'}</td>
      <td className={`py-2 pr-4 ${d('text-gray-400', 'text-gray-500')}`}>{t.sailDate || '—'}</td>
      <td className={`py-2 pr-4 ${d('text-gray-400', 'text-gray-500')}`}>{t.ship || '—'}</td>
      <td className="py-2 pr-4 font-mono font-semibold" style={{ color: C.rose }}>{fmt(t.spend)}</td>
      <td className="py-2 pr-4 font-mono" style={{ color: C.gold }}>{t.pts > 0 ? fmtPts(t.pts) : '—'}</td>
      <td className="py-2 pr-4 font-mono" style={{ color: C.blue }}>{t.cpp > 0 ? `$${t.cpp.toFixed(4)}` : '—'}</td>
      <td className="py-2 pr-4 font-mono" style={{ color: C.green }}>{t.perksVal > 0 ? fmt(t.perksVal) : '—'}</td>
      <td className="py-2 font-mono font-bold" style={{ color: t.net <= 0 ? C.green : C.rose }}>
        {fmt(t.net)}
      </td>
    </tr>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ dark }) {
  const d = (l, dk) => dark ? dk : l;
  return (
    <div className={`rounded-2xl border p-12 text-center ${d('border-dashed border-gray-200 bg-gray-50/50', 'border-dashed border-gray-700 bg-gray-800/30')}`}>
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: 'rgba(245,158,11,0.12)' }}>
        <Trophy className="w-7 h-7" style={{ color: C.gold }} />
      </div>
      <p className={`text-sm font-bold mb-1 ${d('text-gray-600', 'text-gray-300')}`}>No casino data yet</p>
      <p className={`text-xs ${d('text-gray-400', 'text-gray-500')}`}>
        Add trips with casino spend or points in the Trip Finance OS tab.
      </p>
    </div>
  );
}

// ─── Year detail panel ────────────────────────────────────────────────────────
function YearDetailPanel({ yr, dark }) {
  const [open, setOpen] = useState(true);
  const d = (l, dk) => dark ? dk : l;
  const netColor = yr.netSpend <= 0 ? C.green : C.rose;

  const stats = [
    ['Total Spend',    fmt(yr.totalSpend),                    DollarSign, C.rose],
    ['Points Earned',  fmtPts(yr.totalPts),                   Trophy,     C.gold],
    ['Avg Cost/Pt',    yr.avgCpp > 0 ? `$${yr.avgCpp.toFixed(4)}` : '—', Target, C.blue],
    ['Total Perks',    fmt(yr.totalPerks),                    Award,      C.green],
    ['Net After Perks',fmt(yr.netSpend),                       Activity,   netColor],
    ['Perks ROI',      `${yr.roiPct.toFixed(1)}%`,            TrendingUp, C.indigo],
    ['Trips',          `${yr.trips.length}`,                  Calendar,   C.teal],
    ['Spend / Night',  yr.spendPerNight > 0 ? fmt(yr.spendPerNight) : '—', Zap, C.purple],
  ];

  return (
    <div className={`rounded-2xl border overflow-hidden mb-5 ${d('border-gray-200', 'border-gray-700')}`}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 ${d('bg-gradient-to-r from-amber-50 to-yellow-50 hover:from-amber-100', 'bg-gradient-to-r from-amber-900/20 to-yellow-900/10 hover:from-amber-900/30')} transition-colors`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.2)' }}>
            <Calendar className="w-4 h-4" style={{ color: C.gold }} />
          </div>
          <div className="text-left">
            <p className={`text-sm font-extrabold ${d('text-gray-800', 'text-gray-100')}`}>{yr.label}</p>
            <p className={`text-[10px] ${d('text-gray-500', 'text-gray-400')}`}>
              Apr {yr.startYear} – Mar {yr.startYear + 1} · {yr.trips.length} trip{yr.trips.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-base font-extrabold" style={{ color: C.rose }}>{fmt(yr.totalSpend)}</p>
            <p className="text-[10px]" style={{ color: netColor }}>
              net {fmt(yr.netSpend)}
            </p>
          </div>
          {open
            ? <ChevronUp className={`w-4 h-4 ${d('text-gray-400','text-gray-500')}`} />
            : <ChevronDown className={`w-4 h-4 ${d('text-gray-400','text-gray-500')}`} />
          }
        </div>
      </button>

      {open && (
        <div className={`${d('bg-white', 'bg-gray-900')} px-5 py-4`}>
          {/* Stat grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {stats.map(([label, val, Icon, color]) => (
              <div key={label} className={`rounded-xl p-3 border ${d('bg-gray-50 border-gray-100', 'bg-gray-800 border-gray-700')}`}>
                <div className="flex items-center gap-1 mb-1">
                  <Icon className="w-3 h-3" style={{ color }} />
                  <p className={`text-[9px] font-bold uppercase tracking-wider ${d('text-gray-400','text-gray-500')}`}>{label}</p>
                </div>
                <p className="text-sm font-extrabold" style={{ color }}>{val}</p>
              </div>
            ))}
          </div>

          {/* Trips table */}
          {yr.trips.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={`${d('text-gray-400 border-b border-gray-100', 'text-gray-500 border-b border-gray-700')}`}>
                    {['Trip', 'Date', 'Ship', 'Spend', 'Points', '$/pt', 'Perks', 'Net'].map(h => (
                      <th key={h} className="pb-2 pr-4 text-left font-bold uppercase tracking-wider text-[9px] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {yr.trips.map(t => <TripRow key={t.id} t={t} dark={dark} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function CasinoYearTracker({ dark }) {
  const d = (l, dk) => dark ? dk : l;

  // Read trips fresh on every render so changes from TripFinanceOS show up
  // immediately when switching tabs. storageGet is a synchronous localStorage
  // read — no useMemo needed here.
  const trips = storageGet('rc_trips', []);

  // Only trips with casino data
  const casinoTrips = useMemo(() =>
    trips
      .filter(t => num(t.casinoSpend) > 0 || num(t.casinoPointsEarned) > 0)
      .sort((a, b) => (a.sailDate || '').localeCompare(b.sailDate || '')),
    [trips]
  );

  // Group by casino year
  const yearMap = useMemo(() => {
    const map = new Map();
    for (const t of casinoTrips) {
      const cy = getCasinoYear(t.sailDate);
      if (!cy) continue;
      const key = cy.startYear;
      if (!map.has(key)) map.set(key, { ...cy, trips: [] });
      map.get(key).trips.push(t);
    }
    return map;
  }, [casinoTrips]);

  // Build year objects with aggregated stats
  const years = useMemo(() => {
    return Array.from(yearMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([startYear, yr]) => {
        const tripStats = yr.trips.map(t => {
          const totals = calcTotals(t);
          const spend = num(t.casinoSpend);
          const pts   = num(t.casinoPointsEarned);
          const cpp   = pts > 0 ? spend / pts : 0;
          const perksVal = totals.perksValue;
          return {
            id: t.id, name: t.name, sailDate: t.sailDate, ship: t.ship,
            nights: num(t.nights), spend, pts, cpp, perksVal,
            net: spend - perksVal,
          };
        });

        const totalSpend   = tripStats.reduce((s, t) => s + t.spend, 0);
        const totalPts     = tripStats.reduce((s, t) => s + t.pts, 0);
        const totalPerks   = tripStats.reduce((s, t) => s + t.perksVal, 0);
        const netSpend     = totalSpend - totalPerks;
        const avgCpp       = totalPts > 0 ? totalSpend / totalPts : 0;
        const totalNights  = tripStats.reduce((s, t) => s + t.nights, 0);
        const spendPerNight = totalNights > 0 ? totalSpend / totalNights : 0;
        const roiPct       = totalSpend > 0 ? (totalPerks / totalSpend) * 100 : 0;

        return {
          startYear, label: yr.label,
          trips: tripStats,
          totalSpend, totalPts, totalPerks, netSpend,
          avgCpp, spendPerNight, roiPct,
        };
      });
  }, [yearMap]);

  const [selectedYear, setSelectedYear] = useState('all');

  if (casinoTrips.length === 0) return <EmptyState dark={dark} />;
  if (years.length === 0) return <EmptyState dark={dark} />;

  // Filtered view
  const visibleYears = selectedYear === 'all'
    ? years
    : years.filter(y => y.label === selectedYear);

  // Overall aggregates for the KPI row
  const agg = useMemo(() => {
    const src = visibleYears;
    if (!src.length) return null;
    const totalSpend  = src.reduce((s, y) => s + y.totalSpend, 0);
    const totalPts    = src.reduce((s, y) => s + y.totalPts, 0);
    const totalPerks  = src.reduce((s, y) => s + y.totalPerks, 0);
    const netSpend    = totalSpend - totalPerks;
    const avgCpp      = totalPts > 0 ? totalSpend / totalPts : 0;
    const roiPct      = totalSpend > 0 ? (totalPerks / totalSpend) * 100 : 0;
    const tripCount   = src.reduce((s, y) => s + y.trips.length, 0);
    return { totalSpend, totalPts, totalPerks, netSpend, avgCpp, roiPct, tripCount };
  }, [visibleYears]);

  // Spark series (all years, for KPI trends)
  const spendSpark  = years.map(y => y.totalSpend);
  const ptsSpark    = years.map(y => y.totalPts);
  const cppSpark    = years.filter(y => y.avgCpp > 0).map(y => y.avgCpp);
  const roiSpark    = years.map(y => y.roiPct);

  if (!agg) return <EmptyState dark={dark} />;

  return (
    <div>
      {/* ── Year filter pills ── */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <span className={`text-xs font-bold uppercase tracking-widest mr-1 ${d('text-gray-400','text-gray-500')}`}>
          Year
        </span>
        <YearPill label="All Years" active={selectedYear === 'all'} onClick={() => setSelectedYear('all')} dark={dark} />
        {years.map(y => (
          <YearPill key={y.label} label={y.label} active={selectedYear === y.label}
            onClick={() => setSelectedYear(y.label)} dark={dark} />
        ))}
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total Casino Spend" value={fmt(agg.totalSpend)}
          sub={`${agg.tripCount} trip${agg.tripCount !== 1 ? 's' : ''}`}
          icon={DollarSign} color={C.rose}
          spark={selectedYear === 'all' && spendSpark.length > 1 ? spendSpark : null}
          dark={dark} />
        <KpiCard label="Points Earned" value={fmtPts(agg.totalPts)}
          sub="loyalty points"
          icon={Trophy} color={C.gold}
          spark={selectedYear === 'all' && ptsSpark.length > 1 ? ptsSpark : null}
          dark={dark} />
        <KpiCard label="Avg Cost / Point" value={agg.avgCpp > 0 ? `$${agg.avgCpp.toFixed(4)}` : '—'}
          sub="lower is better"
          icon={Target} color={C.blue}
          spark={selectedYear === 'all' && cppSpark.length > 1 ? cppSpark : null}
          dark={dark} />
        <KpiCard label="Net After Perks" value={fmt(agg.netSpend)}
          sub={agg.netSpend <= 0 ? '🎉 Net gain!' : `${agg.roiPct.toFixed(1)}% perks ROI`}
          icon={agg.netSpend <= 0 ? Star : TrendingDown} color={agg.netSpend <= 0 ? C.green : C.rose}
          spark={selectedYear === 'all' && roiSpark.length > 1 ? roiSpark : null}
          dark={dark} />
      </div>

      {/* ── Year-over-year comparison charts (only when showing all years) ── */}
      {selectedYear === 'all' && years.length > 1 && (
        <div className={`rounded-2xl border overflow-hidden mb-6 ${d('border-gray-200', 'border-gray-700')}`}>
          <div className={`px-5 py-3 border-b flex items-center gap-2 ${d('bg-gray-50 border-gray-100', 'bg-gray-800 border-gray-700')}`}>
            <BarChart2 className="w-4 h-4" style={{ color: C.gold }} />
            <h3 className={`text-sm font-bold ${d('text-gray-700','text-gray-200')}`}>Year-over-Year Comparison</h3>
          </div>
          <div className={`p-5 grid md:grid-cols-2 gap-6 ${d('bg-white','bg-gray-900')}`}>
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${d('text-gray-400','text-gray-500')}`}>
                Casino Spend by Year
              </p>
              <YearBarChart years={years} metric="totalSpend" color={C.rose} formatY={fmt} dark={dark} />
            </div>
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${d('text-gray-400','text-gray-500')}`}>
                Points Earned by Year
              </p>
              <YearBarChart years={years} metric="totalPts" color={C.gold} formatY={fmtPts} dark={dark} />
            </div>
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${d('text-gray-400','text-gray-500')}`}>
                Net After Perks by Year
              </p>
              <YearBarChart years={years} metric="netSpend" color={C.green} formatY={fmt} dark={dark} />
            </div>
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${d('text-gray-400','text-gray-500')}`}>
                Perks ROI % by Year
              </p>
              <YearBarChart years={years} metric="roiPct" color={C.indigo}
                formatY={v => `${v.toFixed(1)}%`} dark={dark} />
            </div>
          </div>
        </div>
      )}

      {/* ── Progress note for current/in-progress year ── */}
      {(() => {
        const now = new Date();
        const mo = now.getMonth() + 1;
        const currentCyStart = mo >= 4 ? now.getFullYear() : now.getFullYear() - 1;
        const currentYearLabel = `CY ${currentCyStart}/${String(currentCyStart + 1).slice(-2)}`;
        const curYr = years.find(y => y.label === currentYearLabel);
        if (!curYr || (selectedYear !== 'all' && selectedYear !== currentYearLabel)) return null;
        // How many months left in the casino year?
        const endDate = new Date(currentCyStart + 1, 2, 31); // Mar 31
        const msLeft = endDate - now;
        const daysLeft = Math.max(0, Math.floor(msLeft / 86400000));
        return (
          <div className={`rounded-2xl border px-5 py-3 mb-5 flex items-center gap-3 ${d('bg-amber-50 border-amber-200', 'bg-amber-900/15 border-amber-800/40')}`}>
            <Zap className="w-4 h-4 shrink-0" style={{ color: C.gold }} />
            <p className={`text-xs ${d('text-amber-800','text-amber-300')}`}>
              <strong>{currentYearLabel}</strong> is the current casino year — {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining until 31 Mar {currentCyStart + 1}.
            </p>
          </div>
        );
      })()}

      {/* ── Per-year expandable detail panels ── */}
      {visibleYears.map(yr => (
        <YearDetailPanel key={yr.label} yr={yr} dark={dark} />
      ))}
    </div>
  );
}
