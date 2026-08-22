import React, { useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Trophy, DollarSign, BarChart2,
  Activity, Target, Award, AlertCircle,
} from 'lucide-react';
import { storageGet, fmt, fmtPts, num, calcTotals } from '../utils/helpers';

// ─── Colour palette (works in both light and dark) ────────────────────────────
const BLUE   = '#3b82f6';
const GREEN  = '#22c55e';
const RED    = '#ef4444';
const AMBER  = '#f59e0b';
const INDIGO = '#6366f1';
const TEAL   = '#14b8a6';

// ─── Small helpers ────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Map an array of values into SVG x/y coordinates inside a viewBox */
function toPoints(values, width, height, padX = 40, padY = 20) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v, i) => ({
    x: padX + (i / Math.max(values.length - 1, 1)) * (width - padX * 2),
    y: padY + (1 - (v - min) / range) * (height - padY * 2),
    v,
  }));
}

/** Build an SVG polyline points string from coordinate array */
const pts = (coords) => coords.map((c) => `${c.x},${c.y}`).join(' ');

// ─── Reusable chart primitives ─────────────────────────────────────────────────

function LineChart({ data, color, label, formatY, dark }) {
  const W = 560, H = 160;
  const coords = toPoints(data.map((d) => d.y), W, H);
  const areaPts = [
    `${coords[0].x},${H}`,
    ...coords.map((c) => `${c.x},${c.y}`),
    `${coords[coords.length - 1].x},${H}`,
  ].join(' ');
  const [hover, setHover] = useState(null);
  const gridLines = 4;

  const minY = Math.min(...data.map((d) => d.y));
  const maxY = Math.max(...data.map((d) => d.y));
  const range = maxY - minY || 1;

  const yLabels = Array.from({ length: gridLines + 1 }, (_, i) => {
    const frac = i / gridLines;
    return { val: minY + frac * range, y: 20 + (1 - frac) * 120 };
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full" style={{ minWidth: 320 }}>
        {/* Grid */}
        {yLabels.map(({ val, y }) => (
          <g key={y}>
            <line x1={40} y1={y} x2={W - 10} y2={y} stroke={dark ? '#374151' : '#e5e7eb'} strokeWidth={1} />
            <text x={36} y={y + 4} textAnchor="end" fontSize={9} fill={dark ? '#6b7280' : '#9ca3af'}>
              {formatY ? formatY(val) : val.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <polygon points={areaPts} fill={color} fillOpacity={0.08} />

        {/* Line */}
        <polyline points={pts(coords)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots */}
        {coords.map((c, i) => (
          <g key={i}>
            <circle
              cx={c.x} cy={c.y} r={hover === i ? 6 : 4}
              fill={color} stroke={dark ? '#111827' : '#fff'} strokeWidth={2}
              style={{ cursor: 'pointer', transition: 'r 0.15s' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
            {hover === i && (
              <g>
                <rect x={c.x - 50} y={c.y - 32} width={100} height={22} rx={5}
                  fill={dark ? '#1f2937' : '#fff'} stroke={color} strokeWidth={1} />
                <text x={c.x} y={c.y - 16} textAnchor="middle" fontSize={10} fill={dark ? '#e5e7eb' : '#374151'} fontWeight="600">
                  {data[i].label}: {formatY ? formatY(data[i].y) : data[i].y.toFixed(2)}
                </text>
              </g>
            )}
          </g>
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => {
          const c = coords[i];
          return (
            <text key={i} x={c.x} y={H + 14} textAnchor="middle" fontSize={9}
              fill={dark ? '#6b7280' : '#9ca3af'} style={{ maxWidth: 60 }}>
              {d.label.length > 10 ? d.label.slice(0, 9) + '…' : d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function BarChart({ data, color, formatY, dark, showZeroLine }) {
  const W = 560, H = 160;
  const [hover, setHover] = useState(null);
  const vals = data.map((d) => d.y);
  const maxAbs = Math.max(...vals.map(Math.abs), 1);
  const hasNeg = vals.some((v) => v < 0);

  // zero line Y in SVG coords
  const zeroY = hasNeg ? 20 + (maxAbs / (2 * maxAbs)) * 120 : H - 20;
  const barW = clamp((W - 80) / data.length - 6, 8, 40);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full" style={{ minWidth: 320 }}>
        {/* Zero line */}
        {hasNeg && (
          <line x1={40} y1={zeroY} x2={W - 10} y2={zeroY}
            stroke={dark ? '#4b5563' : '#d1d5db'} strokeWidth={1} strokeDasharray="4 3" />
        )}

        {data.map((d, i) => {
          const x = 40 + i * ((W - 60) / data.length) + ((W - 60) / data.length - barW) / 2;
          const isPos = d.y >= 0;
          const ratio = Math.abs(d.y) / maxAbs;
          const barH = clamp(ratio * 100, 2, 120);
          const y = isPos ? (hasNeg ? zeroY - barH : H - 20 - barH) : zeroY;
          const barColor = d.color || (isPos ? color : RED);

          return (
            <g key={i} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={y} width={barW} height={barH} rx={3}
                fill={barColor} fillOpacity={hover === i ? 1 : 0.8}
                style={{ transition: 'fill-opacity 0.15s' }} />
              {hover === i && (
                <g>
                  <rect x={x + barW / 2 - 50} y={isPos ? y - 26 : y + barH + 4}
                    width={100} height={22} rx={5}
                    fill={dark ? '#1f2937' : '#fff'} stroke={barColor} strokeWidth={1} />
                  <text x={x + barW / 2} y={isPos ? y - 10 : y + barH + 18}
                    textAnchor="middle" fontSize={10} fill={dark ? '#e5e7eb' : '#374151'} fontWeight="600">
                    {formatY ? formatY(d.y) : d.y.toFixed(2)}
                  </text>
                </g>
              )}
              <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize={9}
                fill={dark ? '#6b7280' : '#9ca3af'}>
                {d.label.length > 8 ? d.label.slice(0, 7) + '…' : d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Radial gauge — 0..100 */
function Gauge({ pct, label, color, dark }) {
  const r = 52, cx = 70, cy = 70;
  const circ = Math.PI * r; // half-circle
  const dash = clamp(pct / 100, 0, 1) * circ;
  return (
    <svg viewBox="0 0 140 90" className="w-full max-w-[140px]">
      {/* Track */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={dark ? '#374151' : '#e5e7eb'} strokeWidth={10} strokeLinecap="round" />
      {/* Fill */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={18} fontWeight="700"
        fill={dark ? '#f3f4f6' : '#111827'}>
        {pct.toFixed(0)}%
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={9}
        fill={dark ? '#9ca3af' : '#6b7280'}>
        {label}
      </text>
    </svg>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  return (
    <div className={`rounded-xl p-4 border ${d('bg-white border-gray-200', 'bg-gray-800 border-gray-700')}`}>
      <div className="flex items-start justify-between mb-2">
        <p className={`text-xs font-medium uppercase tracking-wide ${d('text-gray-500', 'text-gray-400')}`}>{label}</p>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${d('text-gray-400', 'text-gray-500')}`}>{sub}</p>}
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon: Icon, color, dark, children }) {
  const d = (l, dk) => (dark ? dk : l);
  return (
    <div className={`rounded-xl border mb-6 overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
      <div className={`flex items-center gap-2 px-5 py-3 ${d('bg-gray-50', 'bg-gray-800')}`}>
        <Icon className="w-4 h-4" style={{ color }} />
        <h3 className={`text-sm font-semibold ${d('text-gray-700', 'text-gray-200')}`}>{title}</h3>
      </div>
      <div className={`p-5 ${d('bg-white', 'bg-gray-900')}`}>{children}</div>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ dark }) {
  const d = (l, dk) => (dark ? dk : l);
  return (
    <div className={`rounded-xl border p-10 text-center ${d('border-gray-200 bg-gray-50', 'border-gray-700 bg-gray-800/40')}`}>
      <AlertCircle className={`w-10 h-10 mx-auto mb-3 ${d('text-gray-300', 'text-gray-600')}`} />
      <p className={`text-sm font-semibold ${d('text-gray-600', 'text-gray-300')}`}>No casino data yet</p>
      <p className={`text-xs mt-1 ${d('text-gray-400', 'text-gray-500')}`}>
        Add trips with casino spend and points in the Trip Finance OS tab to see analytics here.
      </p>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function CasinoAnalytics({ dark }) {
  const d = (l, dk) => (dark ? dk : l);

  // Read trips fresh on every render so changes made in TripFinanceOS are
  // visible immediately when the user switches to this tab. storageGet is a
  // synchronous localStorage read so it's safe to call without useMemo.
  const trips = storageGet('rc_trips', []);

  // Only trips that have casino data
  const casinoTrips = useMemo(() =>
    trips
      .filter((t) => num(t.casinoSpend) > 0 || num(t.casinoPointsEarned) > 0)
      .sort((a, b) => (a.sailDate || '').localeCompare(b.sailDate || '')),
    [trips]
  );

  const [selectedTrip, setSelectedTrip] = useState('all');

  if (casinoTrips.length === 0) return <EmptyState dark={dark} />;

  // ── Per-trip derived data ──────────────────────────────────────────────────
  const tripStats = casinoTrips.map((t) => {
    const totals = calcTotals(t);
    const spend     = num(t.casinoSpend);
    const pts       = num(t.casinoPointsEarned);
    const cpp       = pts > 0 ? spend / pts : 0;
    const perksVal  = totals.perksValue;
    const netCasino = spend - perksVal;   // positive = net loss, negative = net gain
    return {
      id: t.id,
      name: t.name || 'Unnamed',
      ship: t.ship || '',
      sailDate: t.sailDate || '',
      nights: num(t.nights),
      spend,
      pts,
      cpp,
      perksVal,
      netCasino,
      totalCost: totals.total,
    };
  });

  // ── Aggregate stats ────────────────────────────────────────────────────────
  const agg = useMemo(() => {
    const src = selectedTrip === 'all' ? tripStats : tripStats.filter((t) => t.id === selectedTrip);
    if (!src.length) return null;
    const totalSpend = src.reduce((s, t) => s + t.spend, 0);
    const totalPts   = src.reduce((s, t) => s + t.pts, 0);
    const totalPerks = src.reduce((s, t) => s + t.perksVal, 0);
    const netLoss    = totalSpend - totalPerks;
    const avgCpp     = totalPts > 0 ? totalSpend / totalPts : 0;
    const bestCpp    = src.filter((t) => t.cpp > 0).sort((a, b) => a.cpp - b.cpp)[0] || null;
    const worstCpp   = src.filter((t) => t.cpp > 0).sort((a, b) => b.cpp - a.cpp)[0] || null;
    const totalNights = src.reduce((s, t) => s + t.nights, 0);
    const spendPerNight = totalNights > 0 ? totalSpend / totalNights : 0;
    const ptsPerNight   = totalNights > 0 ? totalPts / totalNights : 0;
    const roiPct = totalSpend > 0 ? (totalPerks / totalSpend) * 100 : 0;
    return { totalSpend, totalPts, totalPerks, netLoss, avgCpp, bestCpp, worstCpp, spendPerNight, ptsPerNight, roiPct, count: src.length };
  }, [selectedTrip, tripStats]);

  // ── Chart data series ──────────────────────────────────────────────────────
  const cppOverTime = tripStats
    .filter((t) => t.cpp > 0)
    .map((t) => ({ label: t.sailDate ? t.sailDate.slice(0, 7) : t.name, y: t.cpp }));

  const spendOverTime = tripStats.map((t) => ({ label: t.sailDate ? t.sailDate.slice(0, 7) : t.name, y: t.spend }));

  const ptsOverTime = tripStats
    .filter((t) => t.pts > 0)
    .map((t) => ({ label: t.sailDate ? t.sailDate.slice(0, 7) : t.name, y: t.pts }));

  const netPerTrip = tripStats.map((t) => ({
    label: t.name,
    y: t.netCasino,
    color: t.netCasino <= 0 ? GREEN : RED,
  }));

  const cppPerTrip = tripStats
    .filter((t) => t.cpp > 0)
    .map((t) => ({ label: t.name, y: t.cpp }));

  if (!agg) return <EmptyState dark={dark} />;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Trip filter pill row */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setSelectedTrip('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            selectedTrip === 'all'
              ? 'bg-blue-600 text-white'
              : d('bg-gray-100 text-gray-600 hover:bg-gray-200', 'bg-gray-700 text-gray-300 hover:bg-gray-600')
          }`}>
          All Trips
        </button>
        {tripStats.map((t) => (
          <button key={t.id} onClick={() => setSelectedTrip(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              selectedTrip === t.id
                ? 'bg-blue-600 text-white'
                : d('bg-gray-100 text-gray-600 hover:bg-gray-200', 'bg-gray-700 text-gray-300 hover:bg-gray-600')
            }`}>
            {t.name.length > 16 ? t.name.slice(0, 15) + '…' : t.name}
          </button>
        ))}
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Casino Spend"  value={fmt(agg.totalSpend)}  sub={`across ${agg.count} trip${agg.count !== 1 ? 's' : ''}`} icon={DollarSign} color={RED}   dark={dark} />
        <StatCard label="Points Earned"       value={fmtPts(agg.totalPts)} sub="casino loyalty points"                                   icon={Trophy}     color={AMBER}  dark={dark} />
        <StatCard label="Avg Cost / Point"    value={agg.avgCpp > 0 ? `$${agg.avgCpp.toFixed(4)}` : '—'} sub="lower = better"            icon={Target}     color={BLUE}   dark={dark} />
        <StatCard label="Net After Perks"     value={fmt(agg.netLoss)}     sub={agg.netLoss <= 0 ? '🎉 Net gain!' : 'net outlay'}         icon={agg.netLoss <= 0 ? TrendingDown : TrendingUp} color={agg.netLoss <= 0 ? GREEN : RED} dark={dark} />
      </div>

      {/* ── ROI Gauges ── */}
      <Section title="Perks Return on Casino Spend" icon={Award} color={INDIGO} dark={dark}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col items-center">
            <Gauge pct={Math.min(agg.roiPct, 100)} label="Perks ROI" color={agg.roiPct >= 100 ? GREEN : INDIGO} dark={dark} />
            <p className={`text-xs mt-1 text-center ${d('text-gray-500','text-gray-400')}`}>
              {fmt(agg.totalPerks)} perks on {fmt(agg.totalSpend)} spent
            </p>
          </div>
          <div className={`flex-1 min-w-[180px] rounded-xl p-4 border ${d('bg-gray-50 border-gray-100','bg-gray-800 border-gray-700')}`}>
            <dl className="space-y-2 text-sm">
              {[
                ['Total Casino Spend',    fmt(agg.totalSpend),     DollarSign, RED],
                ['Total Perks Value',     fmt(agg.totalPerks),     Award,      GREEN],
                ['Net After Perks',       fmt(agg.netLoss),        Activity,   agg.netLoss <= 0 ? GREEN : RED],
                ['Perks ROI',             `${agg.roiPct.toFixed(1)}%`, TrendingUp, INDIGO],
                ...(agg.spendPerNight > 0 ? [['Spend / Night', fmt(agg.spendPerNight), Target, BLUE]] : []),
              ].map(([label, val, Icon, color]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className={`flex items-center gap-1.5 ${d('text-gray-500','text-gray-400')}`}>
                    <Icon className="w-3.5 h-3.5" style={{ color }} />{label}
                  </span>
                  <span className="font-semibold" style={{ color }}>{val}</span>
                </div>
              ))}
            </dl>
          </div>
          {agg.bestCpp && agg.count > 1 && (
            <div className={`flex-1 min-w-[160px] rounded-xl p-4 border ${d('bg-gray-50 border-gray-100','bg-gray-800 border-gray-700')}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${d('text-gray-500','text-gray-400')}`}>Best vs Worst CPP</p>
              <div className="space-y-2 text-sm">
                <div>
                  <p className={`text-xs ${d('text-gray-400','text-gray-500')}`}>Best (lowest)</p>
                  <p className="font-bold" style={{ color: GREEN }}>${agg.bestCpp.cpp.toFixed(4)}/pt</p>
                  <p className={`text-xs ${d('text-gray-400','text-gray-500')}`}>{agg.bestCpp.name}</p>
                </div>
                <div>
                  <p className={`text-xs ${d('text-gray-400','text-gray-500')}`}>Worst (highest)</p>
                  <p className="font-bold" style={{ color: RED }}>${agg.worstCpp.cpp.toFixed(4)}/pt</p>
                  <p className={`text-xs ${d('text-gray-400','text-gray-500')}`}>{agg.worstCpp.name}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── Net casino result per trip (bar) ── */}
      {tripStats.length > 1 && (
        <Section title="Net Casino Result per Trip (Spend − Perks)" icon={BarChart2} color={TEAL} dark={dark}>
          <p className={`text-xs mb-3 ${d('text-gray-400','text-gray-500')}`}>
            Green bars = perks exceeded spend (net gain). Red bars = net loss. Hover for exact values.
          </p>
          <BarChart data={netPerTrip} color={BLUE} formatY={fmt} dark={dark} showZeroLine />
        </Section>
      )}

      {/* ── Cost per point over time (line) ── */}
      {cppOverTime.length >= 2 && (
        <Section title="Cost per Point Over Time" icon={TrendingDown} color={BLUE} dark={dark}>
          <p className={`text-xs mb-3 ${d('text-gray-400','text-gray-500')}`}>
            Trend of how efficiently you earn points. Lower is better — a falling line means improving returns.
          </p>
          <LineChart data={cppOverTime} color={BLUE} formatY={(v) => `$${v.toFixed(4)}`} dark={dark} />
        </Section>
      )}

      {/* ── Casino spend over time (line) ── */}
      {spendOverTime.length >= 2 && (
        <Section title="Casino Spend Over Time" icon={Activity} color={AMBER} dark={dark}>
          <LineChart data={spendOverTime} color={AMBER} formatY={fmt} dark={dark} />
        </Section>
      )}

      {/* ── Points earned over time (line) ── */}
      {ptsOverTime.length >= 2 && (
        <Section title="Points Earned Over Time" icon={Trophy} color={GREEN} dark={dark}>
          <LineChart data={ptsOverTime} color={GREEN} formatY={fmtPts} dark={dark} />
        </Section>
      )}

      {/* ── Cost per point per trip (bar) ── */}
      {cppPerTrip.length > 1 && (
        <Section title="Cost per Point — Trip Comparison" icon={Target} color={INDIGO} dark={dark}>
          <p className={`text-xs mb-3 ${d('text-gray-400','text-gray-500')}`}>
            How much each trip cost you per loyalty point earned. Shorter bars = better value.
          </p>
          <BarChart data={cppPerTrip} color={INDIGO} formatY={(v) => `$${v.toFixed(4)}`} dark={dark} />
        </Section>
      )}

      {/* ── Per-trip detail table ── */}
      <Section title="Full Trip Breakdown" icon={BarChart2} color={BLUE} dark={dark}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={d('text-gray-500 border-b border-gray-100', 'text-gray-400 border-b border-gray-700')}>
                {['Trip', 'Date', 'Spend', 'Points', '$/pt', 'Perks', 'Net'].map((h) => (
                  <th key={h} className="pb-2 pr-4 text-left font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tripStats.map((t) => (
                <tr key={t.id}
                  className={`border-b transition-colors ${d('border-gray-50 hover:bg-gray-50','border-gray-800 hover:bg-gray-800/60')}`}>
                  <td className={`py-2 pr-4 font-medium ${d('text-gray-800','text-gray-200')}`}>{t.name}</td>
                  <td className={`py-2 pr-4 ${d('text-gray-500','text-gray-400')}`}>{t.sailDate || '—'}</td>
                  <td className="py-2 pr-4 font-mono" style={{ color: RED }}>{fmt(t.spend)}</td>
                  <td className="py-2 pr-4 font-mono" style={{ color: AMBER }}>{t.pts > 0 ? fmtPts(t.pts) : '—'}</td>
                  <td className="py-2 pr-4 font-mono" style={{ color: BLUE }}>{t.cpp > 0 ? `$${t.cpp.toFixed(4)}` : '—'}</td>
                  <td className="py-2 pr-4 font-mono" style={{ color: GREEN }}>{t.perksVal > 0 ? fmt(t.perksVal) : '—'}</td>
                  <td className="py-2 pr-4 font-mono font-semibold" style={{ color: t.netCasino <= 0 ? GREEN : RED }}>
                    {fmt(t.netCasino)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
