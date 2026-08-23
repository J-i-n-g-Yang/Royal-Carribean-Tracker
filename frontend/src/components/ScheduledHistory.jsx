import React, { useEffect, useState, useCallback } from 'react';
import {
  History, ChevronDown, ChevronUp, CheckCircle, XCircle,
  TrendingDown, TrendingUp, Clock, Calendar, RefreshCw,
  Loader2, ArrowDownRight, ArrowUpRight, AlertTriangle,
  Bell, BellOff, Layers,
} from 'lucide-react';
import DigestSettings from './DigestSettings';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5050';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

function fmtRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtNextRun(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = d - Date.now();
  if (diff < 0) return 'pending…';
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `in ${hrs}h ${mins % 60}m`;
  return `in ${Math.floor(hrs / 24)}d`;
}

// ── Scheduler status banner ────────────────────────────────────────────────────

function SchedulerBanner({ status, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  if (!status) return null;

  const running = status.running;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border text-xs ${
      running
        ? d('bg-green-50 border-green-200 text-green-800', 'bg-green-900/30 border-green-700 text-green-300')
        : d('bg-gray-50 border-gray-200 text-gray-600', 'bg-gray-800 border-gray-700 text-gray-400')
    }`}>
      {running
        ? <Bell className="w-4 h-4 shrink-0" />
        : <BellOff className="w-4 h-4 shrink-0" />}
      <div className="flex-1 min-w-0">
        {running ? (
          <span>
            Auto-scheduler running every{' '}
            <strong>{status.interval_minutes} min</strong>
            {status.next_run && (
              <> — next run <strong>{fmtNextRun(status.next_run)}</strong>
                <span className={d(' text-green-600', ' text-green-400')}>
                  {' '}({fmtTimestamp(status.next_run)})
                </span>
              </>
            )}
          </span>
        ) : (
          <span>
            Auto-scheduler is <strong>disabled</strong> — set{' '}
            <code className="font-mono">RC_SCHEDULE_INTERVAL_MINUTES</code> in your environment
            to enable periodic checks.
          </span>
        )}
      </div>
    </div>
  );
}

// ── Stats row ──────────────────────────────────────────────────────────────────

function StatsRow({ runs, dark }) {
  const d = (l, dk) => (dark ? dk : l);

  const totalRuns    = runs.length;
  const successRuns  = runs.filter(r => r.success).length;
  const totalHits    = runs.reduce((s, r) => s + (r.summary?.hit_count || 0), 0);
  const totalSavings = runs.reduce((s, r) =>
    s + (r.summary?.total_cabin_savings || 0) + (r.summary?.total_addon_savings_per_night || 0), 0
  );

  const stats = [
    {
      label: 'Total runs',
      value: totalRuns,
      icon: Layers,
      accent: d('text-blue-600', 'text-blue-400'),
    },
    {
      label: 'Successful',
      value: `${successRuns} / ${totalRuns}`,
      icon: CheckCircle,
      accent: d('text-green-600', 'text-green-400'),
    },
    {
      label: 'Savings found (all-time)',
      value: totalHits > 0 ? `${totalHits} hit${totalHits !== 1 ? 's' : ''}` : 'None yet',
      icon: TrendingDown,
      accent: totalHits > 0 ? d('text-amber-600', 'text-amber-400') : d('text-gray-400', 'text-gray-600'),
    },
    {
      label: 'Total savings value',
      value: totalSavings > 0
        ? totalSavings.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
        : '$0.00',
      icon: TrendingDown,
      accent: totalSavings > 0 ? d('text-amber-600', 'text-amber-400') : d('text-gray-400', 'text-gray-600'),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map(({ label, value, icon: Icon, accent }) => (
        <div key={label} className={`rounded-xl border p-3 ${d('border-gray-200 bg-gray-50', 'border-gray-700 bg-gray-800/50')}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Icon className={`w-3.5 h-3.5 ${accent}`} />
            <span className={`text-[11px] ${d('text-gray-500', 'text-gray-400')}`}>{label}</span>
          </div>
          <p className={`text-base font-bold ${accent}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Price-change timeline (all runs, condensed) ────────────────────────────────

function PriceTimeline({ runs, dark }) {
  const d = (l, dk) => (dark ? dk : l);

  // Collect all price_diff entries with the run's timestamp
  const events = [];
  for (const run of [...runs].reverse()) { // chronological
    for (const diff of (run.price_diff || [])) {
      events.push({ ...diff, timestamp: run.timestamp, run_id: run.run_id });
    }
  }
  if (events.length === 0) return null;

  return (
    <div className={`rounded-xl border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
      <div className={`px-4 py-2.5 text-xs font-semibold ${d('bg-gray-50 text-gray-600 border-b border-gray-200', 'bg-gray-800 text-gray-300 border-b border-gray-700')}`}>
        Price-Change Timeline (all runs)
      </div>
      <div className={`divide-y ${d('divide-gray-100', 'divide-gray-800')} max-h-60 overflow-y-auto`}>
        {events.map((ev, i) => {
          const isDown = ev.direction === 'down';
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              {isDown
                ? <ArrowDownRight className={`w-4 h-4 shrink-0 ${d('text-green-600', 'text-green-400')}`} />
                : <ArrowUpRight   className={`w-4 h-4 shrink-0 ${d('text-red-600', 'text-red-400')}`} />}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${d('text-gray-700', 'text-gray-200')}`}>
                  #{ev.reservation_id}{ev.ship && ` · ${ev.ship}`}
                </p>
                <p className={`text-xs ${d('text-gray-500', 'text-gray-400')}`}>
                  {ev.previous_price?.toLocaleString()} → {ev.current_price?.toLocaleString()} {ev.currency}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-xs font-bold ${isDown ? d('text-green-600', 'text-green-400') : d('text-red-600', 'text-red-400')}`}>
                  {isDown ? '−' : '+'}{Math.abs(ev.delta || 0).toLocaleString()} {ev.currency}
                </p>
                <p className={`text-[11px] ${d('text-gray-400', 'text-gray-500')}`}>Run #{ev.run_id}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Single run row (expandable) ────────────────────────────────────────────────

function RunRow({ run, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  const [expanded, setExpanded] = useState(false);
  const [fullRun, setFullRun]   = useState(null);
  const [loading, setLoading]   = useState(false);

  const hasSavings = (run.summary?.hit_count || 0) > 0;

  const loadFullRun = async () => {
    if (fullRun || loading) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/history/${run.run_id}`);
      const data = await res.json();
      setFullRun(data);
    } catch {
      // fall back to partial data already in `run`
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (!expanded) loadFullRun();
    setExpanded(e => !e);
  };

  const detail = fullRun || run;

  return (
    <div className={`rounded-xl border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
      {/* Header row */}
      <button
        onClick={toggle}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${d(
          'bg-gray-50 hover:bg-gray-100',
          'bg-gray-800/50 hover:bg-gray-800'
        )}`}
      >
        {/* Status icon */}
        {run.success
          ? <CheckCircle className={`w-4 h-4 shrink-0 ${d('text-green-600', 'text-green-400')}`} />
          : <XCircle     className={`w-4 h-4 shrink-0 ${d('text-red-600', 'text-red-400')}`} />}

        {/* Time */}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${d('text-gray-700', 'text-gray-200')}`}>
            Run #{run.run_id}
            <span className={`ml-2 font-normal ${d('text-gray-500', 'text-gray-400')}`}>
              {fmtTimestamp(run.timestamp)}
            </span>
            <span className={`ml-1 ${d('text-gray-400', 'text-gray-500')}`}>
              · {fmtRelative(run.timestamp)}
            </span>
          </p>
          <p className={`text-[11px] mt-0.5 ${d('text-gray-500', 'text-gray-400')}`}>
            {(run.accounts || []).join(', ')}
          </p>
        </div>

        {/* Hit badge */}
        {hasSavings && (
          <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${d('bg-amber-100 text-amber-700', 'bg-amber-900/50 text-amber-300')}`}>
            {run.summary.hit_count} hit{run.summary.hit_count !== 1 ? 's' : ''}
          </span>
        )}

        {expanded
          ? <ChevronUp   className={`w-4 h-4 shrink-0 ${d('text-gray-400', 'text-gray-500')}`} />
          : <ChevronDown className={`w-4 h-4 shrink-0 ${d('text-gray-400', 'text-gray-500')}`} />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className={`px-4 pb-4 pt-3 space-y-3 ${d('bg-white', 'bg-gray-900')}`}>
          {loading && (
            <div className={`flex items-center gap-2 text-xs ${d('text-gray-500', 'text-gray-400')}`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading full run…
            </div>
          )}

          {/* Error */}
          {detail.error && (
            <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${d('bg-red-50 text-red-700', 'bg-red-950 text-red-300')}`}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {detail.error}
            </div>
          )}

          {/* Summary quick-stats */}
          {detail.summary && (
            <div className="grid grid-cols-2 gap-2">
              {detail.summary.total_cabin_savings > 0 && (
                <div className={`rounded-lg p-2.5 ${d('bg-green-50', 'bg-green-900/20')}`}>
                  <p className={`text-[11px] ${d('text-gray-500', 'text-gray-400')}`}>Cabin savings</p>
                  <p className={`text-sm font-bold ${d('text-green-700', 'text-green-300')}`}>
                    ${detail.summary.total_cabin_savings.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
              {detail.summary.total_addon_savings_per_night > 0 && (
                <div className={`rounded-lg p-2.5 ${d('bg-amber-50', 'bg-amber-900/20')}`}>
                  <p className={`text-[11px] ${d('text-gray-500', 'text-gray-400')}`}>Add-on savings/night</p>
                  <p className={`text-sm font-bold ${d('text-amber-700', 'text-amber-300')}`}>
                    ${detail.summary.total_addon_savings_per_night.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* What changed in this run */}
          {(detail.price_diff || []).length > 0 && (
            <div className={`rounded-lg border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
              <div className={`px-3 py-1.5 text-[11px] font-semibold ${d('bg-gray-50 text-gray-500 border-b border-gray-200', 'bg-gray-800 text-gray-400 border-b border-gray-700')}`}>
                Price changes in this run
              </div>
              <div className={`divide-y ${d('divide-gray-100', 'divide-gray-800')}`}>
                {detail.price_diff.map((diff, i) => {
                  const isDown = diff.direction === 'down';
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      {isDown
                        ? <ArrowDownRight className={`w-3.5 h-3.5 shrink-0 ${d('text-green-600', 'text-green-400')}`} />
                        : <ArrowUpRight   className={`w-3.5 h-3.5 shrink-0 ${d('text-red-600', 'text-red-400')}`} />}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${d('text-gray-700', 'text-gray-200')}`}>
                          #{diff.reservation_id}{diff.ship && ` · ${diff.ship}`}
                        </p>
                        <p className={`text-[11px] ${d('text-gray-500', 'text-gray-400')}`}>
                          {diff.previous_price?.toLocaleString()} → {diff.current_price?.toLocaleString()} {diff.currency}
                        </p>
                      </div>
                      <span className={`text-xs font-bold ${isDown ? d('text-green-600', 'text-green-400') : d('text-red-600', 'text-red-400')}`}>
                        {isDown ? '−' : '+'}{Math.abs(diff.delta || 0).toLocaleString()} {diff.currency}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-reservation summary (compact) */}
          {(detail.findings?.reservations || []).length > 0 && (
            <div className="space-y-1.5">
              <p className={`text-[11px] font-semibold ${d('text-gray-500', 'text-gray-400')}`}>
                Reservations checked ({detail.findings.reservations.length})
              </p>
              {detail.findings.reservations.map(r => {
                const actionable = [
                  ...(r.cabin_findings || []).filter(f => f.status === 'price_drop' || f.status === 'price_drop_locked'),
                  ...(r.addon_findings || []).filter(f => f.type === 'addon_rebook'),
                ];
                return (
                  <div key={r.reservation_id}
                    className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${d('bg-gray-50', 'bg-gray-800/50')}`}>
                    <span className={`font-medium ${d('text-gray-700', 'text-gray-200')}`}>#{r.reservation_id}</span>
                    {r.ship && <span className={d('text-gray-500', 'text-gray-400')}>· {r.ship}</span>}
                    {r.sail_date && (
                      <span className={`flex items-center gap-1 ${d('text-gray-400', 'text-gray-500')}`}>
                        <Clock className="w-3 h-3" />{r.sail_date}
                      </span>
                    )}
                    {actionable.length > 0 && (
                      <span className={`ml-auto font-semibold px-1.5 py-0.5 rounded-full text-[11px] ${d('bg-green-100 text-green-700', 'bg-green-900/50 text-green-300')}`}>
                        {actionable.length} action{actionable.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Notification status */}
          <p className={`text-[11px] flex items-center gap-1 ${d('text-gray-400', 'text-gray-600')}`}>
            {detail.notifications_enabled
              ? <><Bell className="w-3 h-3" /> Notifications were enabled for this run</>
              : <><BellOff className="w-3 h-3" /> Notifications were not configured for this run</>}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ScheduledHistory({ dark }) {
  const d = (l, dk) => (dark ? dk : l);

  const [runs,           setRuns]           = useState(null);   // null = not yet loaded
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [showTimeline,   setShowTimeline]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [histRes, schedRes] = await Promise.all([
        fetch(`${API_URL}/api/history?limit=50`),
        fetch(`${API_URL}/api/scheduler/status`),
      ]);
      const hist  = await histRes.json();
      const sched = await schedRes.json();
      setRuns(hist.runs || []);
      setSchedulerStatus(sched);
    } catch {
      setError(`Could not reach the backend at ${API_URL}. Make sure the backend container is running (docker compose up).`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const priceChangeCount = (runs || []).reduce((s, r) => s + (r.price_diff || []).length, 0);

  return (
    <div className="space-y-5">

      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className={`w-5 h-5 ${d('text-blue-600', 'text-blue-400')}`} />
          <h2 className={`text-sm font-bold ${d('text-gray-800', 'text-white')}`}>
            Scheduled Run History
          </h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${d(
            'bg-gray-100 text-gray-700 hover:bg-gray-200',
            'bg-gray-800 text-gray-200 hover:bg-gray-700'
          )} disabled:opacity-50`}
        >
          {loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {/* Scheduler banner */}
      <SchedulerBanner status={schedulerStatus} dark={dark} />

      {/* Digest mode — weekly rollup via the same notify pipeline as daily alerts */}
      <DigestSettings dark={dark} />

      {/* Error */}
      {error && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${d('bg-red-50 text-red-700', 'bg-red-950 text-red-300')}`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && runs === null && (
        <div className={`flex items-center gap-2 text-xs ${d('text-gray-500', 'text-gray-400')}`}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading run history…
        </div>
      )}

      {/* Empty state */}
      {!loading && runs !== null && runs.length === 0 && (
        <div className={`rounded-xl border p-8 text-center ${d('border-gray-200 bg-gray-50', 'border-gray-700 bg-gray-800/30')}`}>
          <Calendar className={`w-8 h-8 mx-auto mb-2 ${d('text-gray-300', 'text-gray-600')}`} />
          <p className={`text-sm font-semibold ${d('text-gray-600', 'text-gray-400')}`}>No runs recorded yet</p>
          <p className={`text-xs mt-1 ${d('text-gray-400', 'text-gray-500')}`}>
            Runs appear here after you hit "Run Price Check" in the Price Checker tab,
            or when the auto-scheduler fires.
          </p>
        </div>
      )}

      {/* Stats + content */}
      {runs && runs.length > 0 && (
        <>
          <StatsRow runs={runs} dark={dark} />

          {/* Price-change timeline toggle */}
          {priceChangeCount > 0 && (
            <div>
              <button
                onClick={() => setShowTimeline(s => !s)}
                className={`flex items-center gap-1.5 text-xs font-semibold mb-2 ${d('text-blue-600 hover:text-blue-800', 'text-blue-400 hover:text-blue-200')}`}
              >
                {showTimeline
                  ? <ChevronUp className="w-3.5 h-3.5" />
                  : <ChevronDown className="w-3.5 h-3.5" />}
                {showTimeline ? 'Hide' : 'Show'} all-time price-change timeline ({priceChangeCount} event{priceChangeCount !== 1 ? 's' : ''})
              </button>
              {showTimeline && <PriceTimeline runs={runs} dark={dark} />}
            </div>
          )}

          {/* Run list */}
          <div className="space-y-2">
            <p className={`text-xs font-semibold ${d('text-gray-500', 'text-gray-400')}`}>
              Past runs — {runs.length} stored (newest first)
            </p>
            {runs.map(run => (
              <RunRow key={run.run_id} run={run} dark={dark} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
