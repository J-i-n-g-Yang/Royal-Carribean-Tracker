import { BASE_URL, S_CODES } from '../data/constants';

/** Generate all PDF link objects for a given year + month */
export function generateLinks(year, month) {
  const yy = String(year).slice(-2);
  const mm = String(month).padStart(2, '0');
  const links = [];
  for (let x = 1; x <= 7; x++) {
    const label = `CHN0${x}`;
    const filename = `${yy}${mm}${label}.pdf`;
    links.push({ label, filename, url: BASE_URL + filename, group: 'CHN' });
  }
  for (const code of S_CODES) {
    const filename = `${yy}${mm}${code}.pdf`;
    links.push({ label: code, filename, url: BASE_URL + filename, group: 'S' });
  }
  return links;
}

/** Build a PDF URL from a raw offer code */
export function buildLookupResult(raw) {
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  const filename = code.endsWith('.PDF') ? code : code + '.pdf';
  return { filename, url: BASE_URL + filename };
}

/** Safe localStorage helpers */
export const storageGet = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
};
export const storageSet = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

/** Format a number as USD */
export const fmt = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

/** Format a number as SGD */
export const fmtSGD = (n) =>
  n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 0 });

/** Format a number with thousands separators */
export const fmtPts = (n) => n.toLocaleString('en-US');

/** Parse a value as float, return 0 on failure */
export const num = (v) => parseFloat(v) || 0;

/**
 * Calculate trip financial totals, split by currency.
 * SGD bucket: cruise fare, taxes, airfare, pre/post hotel (paid before boarding)
 * USD bucket: all onboard spending, casino, perks (transacted in USD onboard)
 *
 * @param {object} t          - trip object
 * @param {number} globalFxRate - 1 USD = globalFxRate SGD (app-level default)
 *
 * If the trip has a `tripFxRate` field set, that rate is used for converting
 * the USD bucket (gambling & onboard spending) to SGD instead of the global rate.
 * The SGD bucket (cruise cost, taxes, airfare, hotel) always uses the global rate
 * for the USD grand-total conversion since those are already in SGD.
 */
export function calcTotals(t, globalFxRate = 1) {
  // Use per-trip rate for USD→SGD conversion if set, otherwise fall back to global
  const tripRate = num(t.tripFxRate);
  const usdFxRate = tripRate > 0 ? tripRate : globalFxRate;

  // SGD bucket
  const cruiseBase = num(t.cruiseCost) + num(t.taxes);
  const travel     = num(t.airfare) + num(t.hotel) + num(t.roaming) + num(t.insurance);
  const totalSGD   = cruiseBase + travel;

  // USD bucket
  const onboard  = num(t.foodDrinks) + num(t.excursions) + num(t.spa) + num(t.shopping) + num(t.otherOnboard);
  const casino   = num(t.casinoSpend);
  const totalUSD = onboard + casino;

  // Perks are USD (onboard credits, cabin comps, etc.)
  const perksUSD = (t.perks || []).reduce((s, p) => s + num(p.value), 0);

  // Grand totals: USD bucket uses per-trip rate; SGD bucket converts via global rate for USD view
  const grandSGD = totalSGD + totalUSD * usdFxRate;
  const grandUSD = (globalFxRate > 0 ? totalSGD / globalFxRate : 0) + totalUSD;
  const netSGD   = grandSGD - perksUSD * usdFxRate;
  const netUSD   = grandUSD - perksUSD;

  // Casino points
  const pts          = num(t.casinoPointsEarned);
  const costPerPoint = pts > 0 ? casino / pts : 0;
  const goalPct      = num(t.casinoPointsGoal) > 0
    ? Math.min((pts / num(t.casinoPointsGoal)) * 100, 100)
    : 0;

  return {
    cruiseBase, travel, onboard, casino,
    totalSGD, totalUSD,
    perksUSD,
    grandSGD, grandUSD,
    netSGD, netUSD,
    usdFxRate,           // the effective rate used for USD → SGD (per-trip or global)
    hasTripRate: tripRate > 0,  // true when per-trip rate is active
    // Legacy aliases so nothing else breaks
    total:      grandSGD,
    perksValue: perksUSD,
    net:        netSGD,
    pts, costPerPoint, goalPct,
  };
}

/**
 * Fetch the live USD → SGD exchange rate.
 * Tries Frankfurter (ECB data, new domain) first, then falls back to ExchangeRate-API.
 * Both are free, no API key, and CORS-friendly from the browser.
 * Returns null on total failure so the caller keeps the cached/manual rate.
 */
export async function fetchFxRate() {
  // Primary: Frankfurter v2 (ECB data, updated daily)
  try {
    const res  = await fetch('https://api.frankfurter.dev/v2/rates?base=USD&quotes=SGD');
    const data = await res.json();
    // v2 returns { rates: { SGD: { rate: 1.234 } } }
    const rate = data?.rates?.SGD?.rate ?? data?.rates?.SGD ?? null;
    if (rate) return rate;
  } catch {}

  // Fallback: ExchangeRate-API open endpoint (no key needed, updated daily)
  try {
    const res  = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    return data?.rates?.SGD ?? null;
  } catch {}

  return null;
}