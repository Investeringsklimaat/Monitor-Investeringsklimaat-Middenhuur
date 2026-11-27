// dataset.js - The published data, prepared for the engine, in the browser.
//
// The Monitor used to prepare its numbers on a server and hand the browser the
// frame to calculate from. This file does that preparation here instead, from
// the JSON files under data/, so the site is a set of static files and nothing
// else. The arithmetic that follows it is engine.js, unchanged.
//
// Three steps, in the order they are taken:
//
//   frame()        every published series read into one table, a row per year
//   editedFrame()  that table with the reader's per-year edits written into it
//   inputFrame()   the rows the engine reads: the ten-year averages added and
//                  the years without the data it needs dropped
//
// The ten-year averages are summed the way a running sum with a compensation
// term sums them, which is how the server's pandas computed them, so the last
// bits of every average are the ones the published figures were drawn with.

const FILES = {
  mortgageAll: 'mortgage_rates_all.json',
  mortgageNew: 'mortgage_rates_new.json',
  prices: 'avg_property_prices.json',
  rentGrowth: 'rent_growth.json',
  cpi: 'cpi.json',
  priceGrowth: 'prop_price_growth.json',
  bond: 'nl_bond_10y.json',
  market: 'mkt.json',
  series: 'series.json',
  taxes: 'taxes.json',
  investorSettings: 'investor_settings.json',
  publicSources: 'public_sources.json',
  registry: 'registry.json',
};

// Where the files are read from, and how. The page reads them over the network;
// the parity test reads them from disk, with its own loader.
let base = 'data/';
let loader = path => fetch(path).then(r => {
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
});

export function setLoader(fn, prefix = base) {
  loader = fn;
  base = prefix;
}

let files = null;

/** Read every data file once. */
export async function load() {
  if (files) return files;
  const names = Object.keys(FILES);
  const parts = await Promise.all(names.map(name => loader(base + FILES[name])));
  files = {};
  names.forEach((name, i) => { files[name] = parts[i]; });
  return files;
}

export function data() {
  if (!files) throw new Error('dataset.load() has not been awaited');
  return files;
}

// ---------------------------------------------------------------------------
// The published series, year by year.

const num = v => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * {year: value} from monthly rows ({Date: 'YYYY-MM-01', [field]: value}).
 *
 * Every year takes its January value, except the last year, which takes its
 * latest published month so that the current year reflects current rates.
 */
export function monthlyToYearly(rows, field) {
  const out = {};
  const lastMonth = {};
  for (const row of rows || []) {
    const date = String(row.Date ?? '');
    const value = num(row[field]);
    if (date.length < 7 || value === null) continue;
    const year = parseInt(date.slice(0, 4), 10);
    if (date.slice(5, 7) === '01') out[year] = value;
    if (!lastMonth[year] || date > lastMonth[year][0]) lastMonth[year] = [date, value];
  }
  const years = Object.keys(lastMonth).map(Number);
  if (years.length) {
    const last = Math.max(...years);
    out[last] = lastMonth[last][1];
  }
  return out;
}

/** {year: value} from yearly rows, the first value a year has. */
function yearlyFrom(rows, yearField, field) {
  const out = {};
  for (const row of rows || []) {
    const year = num(row[yearField]);
    const value = num(row[field]);
    if (year === null || value === null) continue;
    const y = Math.trunc(year);
    if (out[y] === undefined) out[y] = value;
  }
  return out;
}

/** {year: value} from monthly rows, the earliest month of each year. */
function firstMonthOfYear(rows, field) {
  const sorted = [...(rows || [])].filter(r => String(r.Date ?? '').length >= 7)
    .sort((a, b) => (String(a.Date) < String(b.Date) ? -1 : String(a.Date) > String(b.Date) ? 1 : 0));
  const out = {};
  for (const row of sorted) {
    const year = parseInt(String(row.Date).slice(0, 4), 10);
    const value = num(row[field]);
    if (value === null || out[year] !== undefined) continue;
    out[year] = value;
  }
  return out;
}

const yearSeries = name => {
  const out = {};
  for (const [year, value] of Object.entries(data().series[name] || {})) {
    const v = num(value);
    if (v !== null) out[Math.trunc(Number(year))] = v;
  }
  return out;
};

export const monthlyRentValues = () => yearSeries('monthly_rent');
export const cpbInflationValues = () => yearSeries('cpb_inflation');
export const transferTaxValues = () => yearSeries('transfer_tax');

const COLUMNS = ['mortgage_rates_all_10Y_fixed', 'mortgage_rates_new_10Y_fixed',
  'Avg_Property_Price', 'Rent_Growth_YoY', 'CPI_YoY', 'Prop_Price_Growth_YoY',
  'Transfer_Tax_Rate', 'Avg_Monthly_Rent'];

let frameCache = null;

/**
 * Every published series in one table, a row per year from 2000 on.
 *
 * A year is in the table when any one series has a value for it; a series
 * without a value for that year leaves null, and the rows the engine cannot
 * price are dropped later, in inputFrame().
 */
export function frame() {
  if (frameCache) return frameCache.map(row => ({ ...row }));
  const d = data();
  const parts = {
    mortgage_rates_all_10Y_fixed: monthlyToYearly(d.mortgageAll, 'Interest (>10y)'),
    mortgage_rates_new_10Y_fixed: firstMonthOfYear(d.mortgageNew, 'Interest (>10y)'),
    Avg_Property_Price: yearlyFrom(d.prices, 'Perioden', 'GemiddeldeVerkoopprijs'),
    Rent_Growth_YoY: yearlyFrom(d.rentGrowth, 'Jaar', 'Huurverhoging_t-1'),
    CPI_YoY: yearlyFrom(d.cpi, 'Jaar', 'Inflatie_t-1'),
    Prop_Price_Growth_YoY: yearlyFrom(d.priceGrowth, 'Perioden', 'Leegwaardeontwikkeling_t-1'),
    Transfer_Tax_Rate: transferTaxValues(),
    Avg_Monthly_Rent: monthlyRentValues(),
  };

  const years = new Set();
  for (const column of Object.values(parts)) {
    for (const year of Object.keys(column)) years.add(Number(year));
  }
  const rows = [...years].filter(year => year >= 2000).sort((a, b) => a - b)
    .map(year => {
      const row = { Year: year };
      for (const column of COLUMNS) {
        const value = parts[column][year];
        row[column] = value === undefined ? null : value;
      }
      return row;
    });
  frameCache = rows;
  return rows.map(row => ({ ...row }));
}

// ---------------------------------------------------------------------------
// The ten-year averages.
//
// A running sum with a compensation term, added as the window moves on and
// subtracted as it moves off, which is the sum pandas' rolling mean takes. A
// plain sum over each window differs from it in the last bits, and those bits
// are in the published figures.

function rollingMean(values, window) {
  let sum = 0;
  let compensationAdd = 0;
  let compensationRemove = 0;
  let count = 0;
  let negatives = 0;

  const add = value => {
    if (value === null || !Number.isFinite(value)) return;
    const y = value - compensationAdd;
    const t = sum + y;
    compensationAdd = (t - sum) - y;
    sum = t;
    count += 1;
    if (value < 0) negatives += 1;
  };
  const remove = value => {
    if (value === null || !Number.isFinite(value)) return;
    const y = -value - compensationRemove;
    const t = sum + y;
    compensationRemove = (t - sum) - y;
    sum = t;
    count -= 1;
    if (value < 0) negatives -= 1;
  };

  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    if (i === 0) {
      for (let j = start; j <= i; j++) add(values[j]);
    } else {
      for (let j = Math.max(0, i - window); j < start; j++) remove(values[j]);
      add(values[i]);
    }
    if (count > 0) {
      let mean = sum / count;
      // A window of nothing but non-negative values cannot average below zero,
      // and one of nothing but negative values cannot average above it.
      if (negatives === 0 && mean < 0) mean = 0;
      else if (negatives === count && mean > 0) mean = 0;
      out.push(mean);
    } else {
      out.push(null);
    }
  }
  return out;
}

const DROP_IF_MISSING = ['Mortgage_Rate', 'Avg_Property_Price', 'Avg_Rent_Growth_10Y',
  'Avg_Monthly_Rent', 'CPI_10Y', 'Prop_Price_Growth_YoY', 'Prop_Price_Growth_10Y'];

/**
 * The rows the engine reads: the ten-year averages added and the years without
 * the data it needs dropped.
 */
export function inputFrame(rows) {
  const sorted = [...rows].sort((a, b) => a.Year - b.Year).map(row => ({ ...row }));
  const column = name => sorted.map(row => (row[name] === undefined ? null : row[name]));

  const priceGrowth10y = rollingMean(column('Prop_Price_Growth_YoY'), 10);
  const cpi10y = rollingMean(column('CPI_YoY'), 10);
  const rentGrowth10y = rollingMean(column('Rent_Growth_YoY'), 10);

  const rents = monthlyRentValues();
  sorted.forEach((row, i) => {
    row.Prop_Price_Growth_10Y = priceGrowth10y[i];
    row.CPI_10Y = cpi10y[i];
    row.Avg_Rent_Growth_10Y = rentGrowth10y[i];
    row.Mortgage_Rate = row.mortgage_rates_new_10Y_fixed === null
      ? row.mortgage_rates_all_10Y_fixed : row.mortgage_rates_new_10Y_fixed;
    if (row.Avg_Monthly_Rent === null && rents[row.Year] !== undefined) {
      row.Avg_Monthly_Rent = rents[row.Year];
    }
  });

  return sorted.filter(row => DROP_IF_MISSING.every(name => row[name] !== null
    && row[name] !== undefined && Number.isFinite(row[name])));
}

// ---------------------------------------------------------------------------
// The reader's per-year edits.

// Range, in the unit the value is stored in, that a per-year value may hold:
// euros for a rent or a price, percent for a rate, a decimal for the inflation.
// A value outside it is not an edit of this data, so it is dropped.
export const PARAMS = {
  mortgage_rate: {
    display_name: 'Mortgage Rate', source_column: 'mortgage_rates_all_10Y_fixed',
    unit: '%', source: 'column', limits: [0, 15],
  },
  monthly_rent: {
    display_name: 'Average Monthly Rent', source_column: 'Avg_Monthly_Rent',
    unit: '€', source: 'series', seriesName: 'monthly_rent', limits: [300, 4000],
  },
  cpb_inflation: {
    display_name: 'Inflation', source_column: 'CPB_Inflation',
    unit: '%', source: 'series', seriesName: 'cpb_inflation', limits: [-0.02, 0.15],
  },
  property_price: {
    display_name: 'Property Price', source_column: 'Avg_Property_Price',
    unit: '€', source: 'column', limits: [50000, 1500000],
  },
  transfer_tax: {
    display_name: 'Transfer tax', source_column: 'Transfer_Tax_Rate',
    unit: '%', source: 'series', seriesName: 'transfer_tax', limits: [0, 20],
  },
};

export function withinLimits(param, value) {
  const spec = PARAMS[param];
  if (!spec) return false;
  const v = Number(value);
  return Number.isFinite(v) && v >= spec.limits[0] && v <= spec.limits[1];
}

/** The edits a reader may hold: known parameters, real years, values in range. */
export function cleanEdits(edits) {
  const out = {};
  for (const [param, entry] of Object.entries(edits || {})) {
    if (!PARAMS[param] || !entry || typeof entry !== 'object') continue;
    const kept = {};
    for (const [year, value] of Object.entries(entry.modified || {})) {
      const y = parseInt(year, 10);
      if (!Number.isFinite(y)) continue;
      if (withinLimits(param, value)) kept[String(y)] = Number(value);
    }
    if (Object.keys(kept).length) out[param] = { modified: kept };
  }
  return out;
}

/** {year: value} for a parameter as the data has it, before any edit. */
export function publishedSeries(param) {
  const spec = PARAMS[param];
  if (!spec) return null;
  if (spec.source === 'series') {
    const values = yearSeries(spec.seriesName);
    const out = {};
    for (const [year, value] of Object.entries(values)) out[String(year)] = value;
    return out;
  }
  const out = {};
  for (const row of frame()) {
    const value = row[spec.source_column];
    if (value !== null && value !== undefined) out[String(row.Year)] = value;
  }
  return out;
}

/** The table with the per-year edits written into it. */
export function editedFrame(edits) {
  const rows = frame();
  const clean = cleanEdits(edits);
  for (const [param, entry] of Object.entries(clean)) {
    // An inflation edit is not a column of the table: it reaches the engine
    // beside it, through cpbValues().
    if (param === 'cpb_inflation') continue;
    for (const [year, value] of Object.entries(entry.modified || {})) {
      const row = rows.find(r => r.Year === parseInt(year, 10));
      if (!row) continue;
      if (param === 'mortgage_rate') {
        row.mortgage_rates_all_10Y_fixed = value;
        row.mortgage_rates_new_10Y_fixed = value;
      } else {
        row[PARAMS[param].source_column] = value;
      }
    }
  }
  return rows;
}

/** CPB inflation by year, with the inflation edits in it. */
export function cpbValues(edits) {
  const out = cpbInflationValues();
  const clean = cleanEdits(edits);
  for (const [year, value] of Object.entries((clean.cpb_inflation || {}).modified || {})) {
    out[parseInt(year, 10)] = Number(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The investor types.

export const DEFAULT_INVESTOR_TYPE = 'institutional';
// The types this view shows, in order (the core view of the Monitor).
export const VISIBLE_TYPES = ['institutional', 'private', 'foreign'];

export const TYPE_LABELS = {
  institutional: { en: 'Institutional', nl: 'Institutioneel' },
  private: { en: 'Private', nl: 'Particulier' },
  foreign: { en: 'Foreign', nl: 'Buitenlands' },
};

const DEFAULT_DCF_SETTINGS = { ltv: 0.40, mortgage_spread: 0.0153, period: 15 };
// The settings each type changes. Selecting a type applies all three, so
// switching type never carries another type's values over.
const INVESTOR_DCF_SETTINGS = {
  institutional: {},
  private: { ltv: 0.75 },
  foreign: {},
};

export function investorDcfSettings(type) {
  return { ...DEFAULT_DCF_SETTINGS, ...(INVESTOR_DCF_SETTINGS[type || ''] || {}) };
}

export function taxRegimes() {
  return (data().taxes || {}).regimes || {};
}

export function taxRegime(type) {
  if (!type) return null;
  return taxRegimes()[String(type)] || null;
}

/** Rate in force per tax, per type, for the settings panel. */
export function investorTaxRates() {
  const out = {};
  for (const [type, regime] of Object.entries(taxRegimes())) {
    const years = Object.keys(regime.transfer_tax || {}).map(Number).sort((a, b) => a - b);
    const referenceYear = years.length ? years[years.length - 1] : null;
    const entry = { reference_year: referenceYear, taxes: {} };
    for (const key of ['transfer_tax', 'corporate_tax', 'vat']) {
      if (regime[key] !== undefined) {
        entry.taxes[key] = referenceYear ? rateForYear(regime[key], referenceYear) : 0;
      }
    }
    if (regime.box3_components) entry.box3_components = regime.box3_components;
    // The landlord levy is folded into social's corporate tax for 2013-2022
    // only, so the panel can say where that part comes from.
    if (type === 'social') entry.landlord_levy_years = [2013, 2022];
    out[type] = entry;
  }
  return out;
}

/** A per-year rate, holding the last known year for the years after it. */
export function rateForYear(rates, year) {
  const keys = Object.keys(rates || {});
  if (!keys.length) return 0;
  const y = Math.trunc(Number(year));
  if (rates[String(y)] !== undefined) return Number(rates[String(y)]);
  const known = keys.map(Number).sort((a, b) => a - b);
  return Number(rates[String(y < known[0] ? known[0] : known[known.length - 1])]);
}

export function box3EffectiveRate(components, year, ltv) {
  const keys = Object.keys(components || {});
  if (!keys.length) return 0;
  const y = Math.trunc(Number(year));
  let key = String(y);
  if (components[key] === undefined) {
    const known = keys.map(Number).sort((a, b) => a - b);
    key = String(y < known[0] ? known[0] : known[known.length - 1]);
  }
  const c = components[key];
  return Number(c.tax_rate) * (Number(c.implied_roi) - Number(c.implied_interest) * Number(ltv));
}

// ---------------------------------------------------------------------------
// What the engine is handed.

const ENGINE_COLUMNS = {
  price: 'Avg_Property_Price',
  mortgage_rate: 'mortgage_rates_all_10Y_fixed',
  monthly_rent: 'Avg_Monthly_Rent',
  transfer_tax: 'Transfer_Tax_Rate',
  rent_growth: 'Rent_Growth_YoY',
  price_growth: 'Prop_Price_Growth_YoY',
  price_growth_10y: 'Prop_Price_Growth_10Y',
};

/** The market data, with the CAPM norm the published figures give. */
export function marketData() {
  const out = {};
  for (const row of data().market || []) {
    const year = Math.trunc(Number(row.Year));
    out[year] = {
      rf: Number(row.Rf), beta: Number(row.Beta), erp: Number(row.ERP),
      liq: Number(row.LiqPremium),
      required_return: Number(row.Rf) + Number(row.Beta) * Number(row.ERP) + Number(row.LiqPremium),
    };
  }
  return out;
}

/**
 * Every number the engine needs, for the data as the reader has it.
 *
 * The same frame the Monitor's server published at /engine/inputs, built here:
 * the rows per entry year, the inflation beside them, the market data, and the
 * tax regime of the type in force.
 */
export function engineInputs(type, edits, rows = null) {
  const prepared = inputFrame(rows || editedFrame(edits));
  const regime = taxRegime(type) || {};
  const out = { years: [], rows: {}, cpb: {}, market: marketData(),
    regime: { corporate_tax: regime.corporate_tax || {}, box3_components: regime.box3_components || {} },
    investor_type: type || null,
    settings: investorDcfSettings(type),
    edited_params: Object.keys(cleanEdits(edits)).sort() };
  for (const row of prepared) {
    const year = Math.trunc(row.Year);
    out.years.push(year);
    const entry = {};
    for (const [key, column] of Object.entries(ENGINE_COLUMNS)) {
      const value = row[column];
      entry[key] = value === null || value === undefined || !Number.isFinite(value) ? null : Number(value);
    }
    out.rows[year] = entry;
  }
  for (const [year, value] of Object.entries(cpbValues(edits))) out.cpb[Number(year)] = value;
  return out;
}

/**
 * {purchase year: the rate that purchase pays on its loan, in %}, for the norm
 * that follows the loan.
 */
export function loanRateByYear(rows, mortgageSpread) {
  const out = {};
  for (const row of rows) {
    const base = row.mortgage_rates_all_10Y_fixed;
    if (base === null || base === undefined || !Number.isFinite(base)) continue;
    out[Math.trunc(row.Year)] = (Number(base) / 100 + mortgageSpread) * 100;
  }
  return out;
}

/**
 * The CAPM norm per year: the risk-free rate, beta on the equity risk premium
 * and the liquidity premium.
 *
 * leverage, when given as [ltv, {year: loan rate in %}], turns it into the
 * return the equity in the property has to earn, by Modigliani-Miller's second
 * proposition. The Monitor's own figure is the property's, so nothing here
 * passes it; it is kept because the arithmetic belongs with the norm.
 */
export function requiredReturns(beta, liqPremium, leverage = null) {
  const market = data().market || [];
  const out = [];
  for (const row of market) {
    const year = Math.trunc(Number(row.Year));
    let value = Number(row.Rf) + Number(beta) * Number(row.ERP) + Number(liqPremium);
    if (leverage) {
      const [ltv, rates] = leverage;
      const rate = rates[year];
      if (ltv && rate !== undefined && Number(ltv) > 0 && Number(ltv) < 1) {
        value += (value - rate) * (Number(ltv) / (1 - Number(ltv)));
      }
    }
    out.push({ year, value });
  }
  out.sort((a, b) => a.year - b.year);
  return out;
}
