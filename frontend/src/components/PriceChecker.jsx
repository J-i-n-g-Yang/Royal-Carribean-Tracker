import React, { useState, useEffect } from 'react';
import {
  Search, Plus, Trash2, Loader2, AlertTriangle, ShieldAlert,
  CheckCircle, TrendingDown, Info, ChevronDown, ChevronUp,
  DollarSign, Clock, Ship, Gift, Download, Printer, Mail, Send,
} from 'lucide-react';
import { storageGet, storageSet } from '../utils/helpers';
import { downloadRunCSV, printRun } from '../utils/exportRun';
import LoyaltyCard from './LoyaltyCard';
import PortfolioSummary from './PortfolioSummary';
import RunDiff from './RunDiff';
import PriceTrendChart from './PriceTrendChart';
import WatchlistForm, { buildWatchlistPayload } from './WatchlistForm';

// Fixed: fallback now correctly matches the docker-compose port (5050)
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5050';

const emptyAccount = () => ({
  username: '',
  password: '',
  cruise_line: 'royalcaribbean',
  senior: false,
  military: false,
  fire: false,
  police: false,
});

// ── Finding status helpers ─────────────────────────────────────────────────────

const STATUS_META = {
  price_drop:           { label: 'Price Drop — Rebook Now!', color: 'green',  icon: TrendingDown },
  price_drop_locked:    { label: 'Price Drop (Past Final Payment)', color: 'amber', icon: TrendingDown },
  confirmed_best_price: { label: 'Best Price Confirmed ✓', color: 'blue',   icon: CheckCircle },
  not_for_sale:         { label: 'Not For Sale',            color: 'gray',   icon: Info },
  addon_rebook:         { label: 'Add-on — Rebook Now!',   color: 'green',  icon: TrendingDown },
  addon_confirmed_best_price: { label: 'Add-on Best Price ✓', color: 'blue', icon: CheckCircle },
};

function statusClasses(color, dark) {
  const map = {
    green: dark ? 'bg-green-900/40 border-green-700 text-green-300' : 'bg-green-50 border-green-300 text-green-800',
    amber: dark ? 'bg-amber-900/40 border-amber-700 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-800',
    blue:  dark ? 'bg-blue-900/40  border-blue-700  text-blue-300'  : 'bg-blue-50  border-blue-300  text-blue-800',
    gray:  dark ? 'bg-gray-800    border-gray-600   text-gray-400'  : 'bg-gray-50  border-gray-300  text-gray-600',
  };
  return map[color] || map.gray;
}

// ── Summary banner ─────────────────────────────────────────────────────────────

function SummaryBanner({ summary, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  if (!summary) return null;

  const hasSavings = summary.total_cabin_savings > 0 || summary.total_addon_savings_per_night > 0;

  return (
    <div className={`rounded-xl p-4 border ${hasSavings
      ? d('bg-green-50 border-green-300', 'bg-green-900/30 border-green-700')
      : d('bg-blue-50 border-blue-200',   'bg-blue-900/30 border-blue-700')}`}>
      <div className="flex items-center gap-2 mb-3">
        {hasSavings
          ? <TrendingDown className={`w-5 h-5 ${d('text-green-600', 'text-green-400')}`} />
          : <CheckCircle  className={`w-5 h-5 ${d('text-blue-600',  'text-blue-400')}`} />}
        <span className={`font-bold text-sm ${hasSavings
          ? d('text-green-800', 'text-green-300')
          : d('text-blue-800',  'text-blue-300')}`}>
          {hasSavings
            ? `${summary.hit_count} saving${summary.hit_count !== 1 ? 's' : ''} found!`
            : 'All prices confirmed — you have the best rates.'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {summary.total_cabin_savings > 0 && (
          <div className={`rounded-lg p-3 ${d('bg-white', 'bg-gray-800')}`}>
            <p className={`text-xs ${d('text-gray-500', 'text-gray-400')}`}>Cabin savings</p>
            <p className={`text-lg font-bold ${d('text-green-700', 'text-green-400')}`}>
              ${summary.total_cabin_savings.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}
        {summary.total_addon_savings_per_night > 0 && (
          <div className={`rounded-lg p-3 ${d('bg-white', 'bg-gray-800')}`}>
            <p className={`text-xs ${d('text-gray-500', 'text-gray-400')}`}>Add-on savings/night</p>
            <p className={`text-lg font-bold ${d('text-green-700', 'text-green-400')}`}>
              ${summary.total_addon_savings_per_night.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reservation card ───────────────────────────────────────────────────────────

function ReservationCard({ res, dark }) {
  const d = (l, dk) => (dark ? dk : l);
  const [expanded, setExpanded] = useState(false);

  const allFindings = [
    ...res.cabin_findings.map(f => ({ ...f, _kind: 'cabin' })),
    ...res.addon_findings.map(f => ({ ...f, _kind: 'addon' })),
  ];

  const actionable = allFindings.filter(
    f => f.status === 'price_drop' || f.type === 'addon_rebook'
  );

  return (
    <div className={`rounded-xl border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
      {/* Card header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={`w-full flex items-start justify-between gap-3 p-4 text-left transition-colors ${d(
          'bg-gray-50 hover:bg-gray-100',
          'bg-gray-800/50 hover:bg-gray-800'
        )}`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <Ship className={`w-5 h-5 mt-0.5 shrink-0 ${d('text-blue-500', 'text-blue-400')}`} />
          <div className="min-w-0">
            <p className={`font-semibold text-sm ${d('text-gray-800', 'text-gray-100')}`}>
              Reservation #{res.reservation_id}
              {res.ship && <span className={`ml-2 font-normal ${d('text-gray-500', 'text-gray-400')}`}>· {res.ship}</span>}
            </p>
            <div className={`flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-xs ${d('text-gray-500', 'text-gray-400')}`}>
              {res.sail_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{res.sail_date}</span>}
              {res.room && <span>Room {res.room}</span>}
              {res.dining && <span>Dining: {res.dining}</span>}
              {res.checkin_opens && <span>Check-in: {res.checkin_opens}</span>}
              {res.cruise_fare_total && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Fare: ${res.cruise_fare_total.toLocaleString()}
                </span>
              )}
              {res.onboard_credit > 0 && (
                <span className={`flex items-center gap-1 font-medium ${d('text-emerald-600', 'text-emerald-400')}`}>
                  <Gift className="w-3 h-3" />
                  OBC: {res.onboard_credit.toLocaleString('en-US', { minimumFractionDigits: 2 })} {res.onboard_credit_currency || ''}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actionable.length > 0 && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${d('bg-green-100 text-green-700', 'bg-green-900/50 text-green-300')}`}>
              {actionable.length} action{actionable.length !== 1 ? 's' : ''}
            </span>
          )}
          {expanded
            ? <ChevronUp className={`w-4 h-4 ${d('text-gray-400', 'text-gray-500')}`} />
            : <ChevronDown className={`w-4 h-4 ${d('text-gray-400', 'text-gray-500')}`} />}
        </div>
      </button>

      {/* Expanded findings */}
      {expanded && (
        <div className={`p-4 space-y-2 ${d('bg-white', 'bg-gray-900')}`}>
          {allFindings.length === 0 && (
            <p className={`text-xs italic ${d('text-gray-400', 'text-gray-500')}`}>No findings for this reservation.</p>
          )}
          {allFindings.map((f, i) => {
            const key   = f._kind === 'addon' ? (f.type || 'addon_rebook') : f.status;
            const meta  = STATUS_META[key] || STATUS_META.not_for_sale;
            const Icon  = meta.icon;
            return (
              <div key={i} className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${statusClasses(meta.color, dark)}`}>
                <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold">{meta.label}</p>
                  {f._kind === 'cabin' && f.savings > 0 && (
                    <p className="mt-0.5">Save ${f.savings.toLocaleString('en-US', { minimumFractionDigits: 2 })} — from ${f.old_price?.toLocaleString()} → ${f.new_price?.toLocaleString()} {f.currency}</p>
                  )}
                  {f._kind === 'addon' && f.savings_per_night > 0 && (
                    <p className="mt-0.5">{f.item} — save ${f.savings_per_night.toFixed(2)}/night ({f.currency})</p>
                  )}
                  {f.description && (
                    <p className="mt-1 opacity-70 break-words">{f.description}</p>
                  )}
                </div>
              </div>
            );
          })}

          {res.raw_lines && res.raw_lines.length > 0 && (
            <details className="mt-2">
              <summary className={`text-xs cursor-pointer select-none ${d('text-gray-400', 'text-gray-500')}`}>
                {res.raw_lines.length} unrecognised line{res.raw_lines.length !== 1 ? 's' : ''}
              </summary>
              <pre className={`mt-1 text-xs p-2 rounded overflow-x-auto whitespace-pre-wrap ${d('bg-gray-100 text-gray-600', 'bg-gray-800 text-gray-400')}`}>
                {res.raw_lines.join('\n')}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PriceChecker({ dark }) {
  const d = (l, dk) => (dark ? dk : l);

  const [accounts, setAccounts] = useState(() => {
    const saved = storageGet('rc_price_accounts', []);
    return saved.length ? saved.map(a => ({ ...a, password: '' })) : [emptyAccount()];
  });

  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showLog,  setShowLog]  = useState(false);

  // Watchlist / prospective-cruise form state (see WatchlistForm.jsx) —
  // included in the /api/check payload the backend already accepts.
  const [watchList,   setWatchList]   = useState([]);
  const [prospective, setProspective] = useState([]);

  // One-off notification override for testing without touching
  // backend/secrets/notify.json — see check_runner._resolve_notify_urls().
  const [notifyUrl, setNotifyUrl] = useState('');
  const [testingNotify, setTestingNotify] = useState(false);
  const [notifyTestResult, setNotifyTestResult] = useState(null);

  // Diagnostic snapshot from GET /api/notify/status — surfaces things like a
  // malformed backend/secrets/notify.json that would otherwise fail silently
  // (server-side log only, UI just says "not configured").
  const [notifyStatus, setNotifyStatus] = useState(null);

  const fetchNotifyStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/notify/status`);
      setNotifyStatus(await res.json());
    } catch {
      setNotifyStatus(null); // backend unreachable — stay silent, /api/check will surface that
    }
  };

  useEffect(() => { fetchNotifyStatus(); }, []);

  const sendTestNotification = async () => {
    setTestingNotify(true);
    setNotifyTestResult(null);
    try {
      const res = await fetch(`${API_URL}/api/notify/test`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(
          notifyUrl.trim() ? { notify_urls: [notifyUrl.trim()] } : {}
        ),
      });
      const data = await res.json();
      setNotifyTestResult(data);
    } catch (err) {
      setNotifyTestResult({ success: false, error: err.message, results: [] });
    } finally {
      setTestingNotify(false);
      fetchNotifyStatus(); // in case the test round-trip revealed something new
    }
  };

  const updateAccount = (idx, field, value) =>
    setAccounts(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });

  const addAccount    = () => setAccounts(prev => [...prev, emptyAccount()]);
  const removeAccount = idx => setAccounts(prev => prev.filter((_, i) => i !== idx));

  const persistAccounts = () =>
    storageSet('rc_price_accounts', accounts.map(({ password, ...rest }) => rest));

  const runCheck = async () => {
    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    setShowLog(false);
    persistAccounts();

    const validAccounts = accounts.filter(a => a.username && a.password);
    if (validAccounts.length === 0) {
      setErrorMsg('Enter at least one username and password.');
      setLoading(false);
      return;
    }

    const { watch_list, prospective_cruises } = buildWatchlistPayload(watchList, prospective);

    try {
      const res  = await fetch(`${API_URL}/api/check`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          accounts: validAccounts,
          watch_list,
          prospective_cruises,
          ...(notifyUrl.trim() ? { notify_urls: [notifyUrl.trim()] } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) setErrorMsg(data.error || 'Check failed.');
      setResult(data);
    } catch {
      setErrorMsg(
        `Could not reach the backend at ${API_URL}. Make sure the backend container is running (docker compose up).`
      );
    } finally {
      setLoading(false);
    }
  };

  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm ${d(
    'bg-white border-gray-300 text-gray-800',
    'bg-gray-800 border-gray-700 text-gray-100'
  )}`;

  return (
    <div className="space-y-6">

      {/* Security notice */}
      <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${d('bg-amber-50 text-amber-800', 'bg-amber-950 text-amber-300')}`}>
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Credentials are sent only to your own local backend (running in Docker on your machine)
          to log into Royal Caribbean / Celebrity's site. Passwords are <strong>never</strong> saved
          between sessions or written to disk.
        </span>
      </div>

      {/* Account forms */}
      <div className="space-y-4">
        {accounts.map((acc, idx) => (
          <div key={idx} className={`p-4 rounded-xl border space-y-3 ${d('border-gray-200 bg-gray-50', 'border-gray-700 bg-gray-800/50')}`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-semibold ${d('text-gray-700', 'text-gray-200')}`}>Account {idx + 1}</span>
              {accounts.length > 1 && (
                <button onClick={() => removeAccount(idx)} className={d('text-gray-400 hover:text-red-500', 'text-gray-500 hover:text-red-400')}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="Username / email" value={acc.username}
                onChange={e => updateAccount(idx, 'username', e.target.value)} />
              <input className={inputCls} placeholder="Password" type="password" value={acc.password}
                onChange={e => updateAccount(idx, 'password', e.target.value)} />
              <select className={inputCls} value={acc.cruise_line}
                onChange={e => updateAccount(idx, 'cruise_line', e.target.value)}>
                <option value="royalcaribbean">Royal Caribbean</option>
                <option value="celebritycruises">Celebrity Cruises</option>
              </select>
              <div className="flex items-center gap-3 flex-wrap text-xs">
                {['senior', 'military', 'fire', 'police'].map(flag => (
                  <label key={flag} className={`flex items-center gap-1 ${d('text-gray-600', 'text-gray-300')}`}>
                    <input type="checkbox" checked={acc[flag]} onChange={e => updateAccount(idx, flag, e.target.checked)} />
                    {flag.charAt(0).toUpperCase() + flag.slice(1)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ))}

        <div className="flex gap-3">
          <button onClick={addAccount}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${d('bg-gray-100 text-gray-700 hover:bg-gray-200', 'bg-gray-800 text-gray-200 hover:bg-gray-700')}`}>
            <Plus className="w-4 h-4" /> Add Account
          </button>
          <button onClick={runCheck} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Checking prices…' : 'Run Price Check'}
          </button>
        </div>
      </div>

      {/* Watchlist / prospective cruises */}
      <WatchlistForm
        watchList={watchList} setWatchList={setWatchList}
        prospective={prospective} setProspective={setProspective}
        dark={dark}
      />

      {/* Notification test override — persistent config lives in
          backend/secrets/notify.json; this is just a one-off test hook so
          you don't have to touch that file to try it out. Works for any
          Apprise URL scheme, e.g. mailto:// for email or tgram:// for
          Telegram (tgram://<bot_token>/<chat_id>). */}
      <div className={`p-3 rounded-lg text-xs space-y-2 ${d('bg-gray-50 border border-gray-200 text-gray-600', 'bg-gray-800/50 border border-gray-700 text-gray-400')}`}>

        {/* Config diagnostics from GET /api/notify/status — catches things
            like a malformed notify.json instead of failing silently */}
        {notifyStatus && (
          <div className="flex items-start gap-2 pb-1">
            {notifyStatus.file?.error ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                <span className={d('text-amber-700', 'text-amber-400')}>
                  Problem in backend/secrets/notify.json: {notifyStatus.file.error}
                  {notifyStatus.active_source === 'env' && ' (currently overridden by NOTIFY_URLS, so this isn\'t blocking anything right now.)'}
                </span>
              </>
            ) : notifyStatus.apprise_installed === false ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                <span className={d('text-amber-700', 'text-amber-400')}>
                  The 'apprise' package isn't installed on the backend — add it to requirements.txt and rebuild.
                </span>
              </>
            ) : notifyStatus.active_source === 'none' ? (
              <>
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>No persistent notifications configured yet — add a URL to backend/secrets/notify.json, set NOTIFY_URLS, or just test one below.</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-600" />
                <span className={d('text-gray-700', 'text-gray-300')}>
                  {notifyStatus.active_url_count} notification URL{notifyStatus.active_url_count === 1 ? '' : 's'} configured via {notifyStatus.active_source === 'env' ? 'NOTIFY_URLS' : 'notify.json'}: {notifyStatus.active_urls_masked.join(', ')}
                </span>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 shrink-0" />
          <input
            className={`flex-1 bg-transparent outline-none ${d('text-gray-800 placeholder:text-gray-400', 'text-gray-100 placeholder:text-gray-500')}`}
            placeholder="Optional: Apprise URL — mailto://user:apppass@gmail.com?to=you@example.com or tgram://<bot_token>/<chat_id>"
            value={notifyUrl}
            onChange={e => setNotifyUrl(e.target.value)}
          />
          <button
            type="button"
            onClick={sendTestNotification}
            disabled={testingNotify}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold whitespace-nowrap ${d('bg-gray-200 text-gray-700 hover:bg-gray-300', 'bg-gray-700 text-gray-100 hover:bg-gray-600')} disabled:opacity-50`}
          >
            {testingNotify ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {testingNotify ? 'Sending…' : 'Send Test'}
          </button>
        </div>

        {notifyTestResult && (
          <div className={`pl-6 space-y-1 ${notifyTestResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {notifyTestResult.error && <div>{notifyTestResult.error}</div>}
            {notifyTestResult.results?.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {r.sent ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                <span className={d('text-gray-700', 'text-gray-300')}>{r.url}</span>
                <span>— {r.sent ? 'delivered' : (r.error || 'failed')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {errorMsg && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${d('bg-red-50 text-red-700', 'bg-red-950 text-red-300')}`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {errorMsg}
        </div>
      )}

      {/* Print stylesheet: only .rc-print-area renders when printing/saving as PDF */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .rc-print-area, .rc-print-area * { visibility: visible; }
          .rc-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .rc-no-print { display: none !important; }
        }
      `}</style>

      {/* Results */}
      {result && (
        <div className="space-y-4 rc-print-area">

          {/* Export actions */}
          <div className="flex items-center justify-end gap-2 rc-no-print">
            <button onClick={() => downloadRunCSV(result)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${d('bg-gray-100 text-gray-700 hover:bg-gray-200', 'bg-gray-800 text-gray-200 hover:bg-gray-700')}`}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button onClick={printRun}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${d('bg-gray-100 text-gray-700 hover:bg-gray-200', 'bg-gray-800 text-gray-200 hover:bg-gray-700')}`}>
              <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
            </button>
          </div>

          {/* Notification status */}
          {result.notifications_enabled !== undefined && (
            <div className={`flex items-center gap-2 text-xs rc-no-print ${d('text-gray-500', 'text-gray-400')}`}>
              <Mail className="w-3.5 h-3.5" />
              {result.notifications_enabled
                ? 'Notifications are configured — you\'ll be alerted via Apprise for any price drops found.'
                : 'Notifications not configured — see the diagnostics above the "Run Price Check" button.'}
            </div>
          )}

          {/* Summary banner */}
          <SummaryBanner summary={result.summary} dark={dark} />

          {/* What changed since last run */}
          <RunDiff priceDiff={result.price_diff} dark={dark} />

          {/* Portfolio-wide aggregates */}
          <PortfolioSummary result={result} dark={dark} />

          {/* Loyalty tier status */}
          <LoyaltyCard accountsLoyalty={result.accounts_loyalty} dark={dark} />

          {/* Price trend chart */}
          <PriceTrendChart currentReservations={result.findings?.reservations} dark={dark} />

          {/* Check-in / payment table */}
          {result.checkin_payment_rows && result.checkin_payment_rows.length > 0 && (
            <div className={`rounded-xl border overflow-hidden ${d('border-gray-200', 'border-gray-700')}`}>
              <div className={`px-4 py-2.5 text-xs font-semibold ${d('bg-gray-50 text-gray-600 border-b border-gray-200', 'bg-gray-800 text-gray-300 border-b border-gray-700')}`}>
                Check-in & Balance Summary
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={d('text-gray-500', 'text-gray-400')}>
                      <th className="text-left px-4 py-2">Sailing</th>
                      <th className="text-left px-4 py-2">Reservation #</th>
                      <th className="text-left px-4 py-2">Check-in Opens</th>
                      <th className="text-left px-4 py-2">Final Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.checkin_payment_rows]
                      .sort((a, b) => (a.sail_date || '').localeCompare(b.sail_date || ''))
                      .map((row, i) => (
                      <tr key={i} className={`border-t align-top ${d('border-gray-100', 'border-gray-800')}`}>
                        <td className="px-4 py-2">
                          <div className={`font-medium ${d('text-gray-800', 'text-gray-100')}`}>{row.name || '—'}</div>
                          <div className={`text-xs mt-0.5 ${d('text-gray-500', 'text-gray-400')}`}>
                            {row.sail_date_display || 'Date TBD'}
                          </div>
                        </td>
                        <td className="px-4 py-2">{row.reservation || '—'}</td>
                        <td className="px-4 py-2">{row.checkin_label || 'TBD'}</td>
                        <td className="px-4 py-2">
                          {row.final_payment_display ? (
                            <>
                              <div className={d('text-gray-800', 'text-gray-100')}>{row.final_payment_display}</div>
                              <div className="text-xs mt-0.5">
                                {row.balance_due === true
                                  ? (row.past_final_payment
                                      ? <span className={`font-semibold ${d('text-red-600', 'text-red-400')}`}>Past due</span>
                                      : <span className={`font-semibold ${d('text-amber-600', 'text-amber-400')}`}>Balance owed</span>)
                                  : row.balance_due === false
                                    ? <span className={`font-semibold ${d('text-green-600', 'text-green-400')}`}>Paid</span>
                                    : <span className={d('text-gray-400', 'text-gray-500')}>Unknown</span>}
                              </div>
                            </>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Per-reservation finding cards */}
          {result.findings && result.findings.reservations && result.findings.reservations.length > 0 && (
            <div className="space-y-3">
              <p className={`text-xs font-semibold ${d('text-gray-500', 'text-gray-400')}`}>
                Reservations ({result.findings.reservations.length})
              </p>
              {result.findings.reservations.map(res => (
                <ReservationCard key={res.reservation_id} res={res} dark={dark} />
              ))}
            </div>
          )}

          {/* Prospective/watchlist hits */}
          {result.findings && result.findings.prospective_hits && result.findings.prospective_hits.length > 0 && (
            <div className="space-y-2">
              <p className={`text-xs font-semibold ${d('text-gray-500', 'text-gray-400')}`}>Watchlist Hits</p>
              {result.findings.prospective_hits.map((h, i) => (
                <div key={i} className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${statusClasses('green', dark)}`}>
                  <TrendingDown className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{h.name}</p>
                    <p className="mt-0.5">
                      New price ${h.new_price?.toLocaleString()} {h.currency} — save ${h.savings?.toFixed(2)} vs watchlist target
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Collapsible raw log */}
          {result.log_lines && result.log_lines.length > 0 && (
            <div>
              <button
                onClick={() => setShowLog(s => !s)}
                className={`flex items-center gap-1 text-xs font-semibold mb-1 ${d('text-gray-500 hover:text-gray-700', 'text-gray-400 hover:text-gray-200')}`}>
                {showLog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showLog ? 'Hide' : 'Show'} raw log ({result.log_lines.length} lines)
              </button>
              {showLog && (
                <pre className={`text-xs p-3 rounded-lg overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap ${d('bg-gray-900 text-gray-100', 'bg-black text-gray-200')}`}>
                  {result.log_lines.join('\n')}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
