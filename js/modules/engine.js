// engine.js - The investment, year by year.
//
// The Monitor's calculation, as the Monitor runs it: the cash flow of one
// dwelling from purchase to sale, and the internal rate of return on it. The
// whole chart is seventeen runs of simulate(), one per purchase year, and every
// move of a slider or a handle runs them again.
//
// The numbers it reads are prepared by dataset.js; nothing here reads a file or
// a setting of its own.
//
// An event is a change from a given year on, with a scope (the shared
// assumptions, or one investment) and a clock (the calendar, or years after the
// purchase). The Monitor's own views set them; this version draws no events, and
// the code that reads them is kept so the arithmetic stays the one calculation.

export const EVENT_FIELDS = ['rent_growth', 'rent_level', 'op_cost', 'value_growth', 'loan_rate',
  'one_off', 'transfer_tax', 'inflation', 'corporate_tax', 'box3'];

// ---------------------------------------------------------------------------
// The two tax helpers, as on the server.

export function rateForYear(rates, year) {
  const keys = Object.keys(rates || {});
  if (!keys.length) return 0;
  const y = Number(year);
  if (rates[String(y)] !== undefined) return Number(rates[String(y)]);
  const known = keys.map(Number).sort((a, b) => a - b);
  return Number(rates[String(y < known[0] ? known[0] : known[known.length - 1])]);
}

export function box3EffectiveRate(components, year, ltvRatio) {
  const keys = Object.keys(components || {});
  if (!keys.length) return 0;
  const y = Number(year);
  let key = String(y);
  if (components[key] === undefined) {
    const known = keys.map(Number).sort((a, b) => a - b);
    key = String(y < known[0] ? known[0] : known[known.length - 1]);
  }
  const c = components[key];
  return Number(c.tax_rate) * (Number(c.implied_roi) - Number(c.implied_interest) * Number(ltvRatio));
}

// ---------------------------------------------------------------------------
// Events.

/** The calendar year an event starts in, for an investment bought in entryYear. */
export function eventStart(event, entryYear) {
  return event.clock === 'plan' ? Number(entryYear) + Number(event.at) - 1 : Number(event.at);
}

// How an event changes the value it acts on: 'delta' adds to it, 'set' puts a
// value in its place, 'cap' is an upper bound. A cap with relative_to
// 'inflation' is measured from that year's inflation.
export const EVENT_MODES = ['delta', 'set', 'cap'];

function eventUntil(event) {
  return event.until === undefined || event.until === null || event.until === ''
    ? null : Number(event.until);
}

function eventsLive(events, cashflowYear, entryYear) {
  return (events || []).filter(e => {
    if (!EVENT_FIELDS.includes(e.field)) return false;
    if (eventStart(e, entryYear) > cashflowYear) return false;
    const until = eventUntil(e);
    return until === null || cashflowYear <= until;
  });
}

function applyEvents(value, events, field, cashflowYear, entryYear, basis = 0) {
  let out = value;
  for (const event of eventsLive(events, cashflowYear, entryYear)) {
    if (event.field !== field) continue;
    const amount = Number(event.value || 0);
    const mode = event.mode || 'delta';
    if (mode === 'set') out = amount;
    else if (mode === 'cap') out = Math.min(out, event.relative_to === 'inflation' ? basis + amount : amount);
    else out += amount;
  }
  return out;
}

/** Only the events that belong to the shared assumptions. */
export function marketEvents(events) {
  return (events || []).filter(e => e.scope === 'market');
}

// ---------------------------------------------------------------------------
// IRR.
//
// numpy_financial.irr takes every root of the cash-flow polynomial, keeps the
// real positive ones and returns the rate closest to zero. The same rule is
// used here: Durand-Kerner for the roots, then Newton on the net present value
// to bring the chosen one to full precision. A single sign change (the ordinary
// case) has one root and both steps agree; a plan with a cost in the middle can
// have more, and then the selection rule is what keeps the two sides equal.

function npv(rate, values) {
  let total = 0;
  for (let t = 0; t < values.length; t++) total += values[t] / Math.pow(1 + rate, t);
  return total;
}

function npvSlope(rate, values) {
  let total = 0;
  for (let t = 1; t < values.length; t++) total -= (t * values[t]) / Math.pow(1 + rate, t + 1);
  return total;
}

function roots(coefficients) {
  // coefficients[i] multiplies x^i; Durand-Kerner wants it monic.
  let n = coefficients.length - 1;
  while (n > 0 && Math.abs(coefficients[n]) < 1e-300) n--;
  if (n < 1) return [];
  const lead = coefficients[n];
  const a = [];
  for (let i = n; i >= 0; i--) a.push(coefficients[i] / lead);

  const evaluate = (re, im) => {
    let xr = 1, xi = 0, sr = 0, si = 0;
    for (let i = a.length - 1; i >= 0; i--) {
      sr += a[i] * xr; si += a[i] * xi;
      const nr = xr * re - xi * im;
      xi = xr * im + xi * re; xr = nr;
    }
    return [sr, si];
  };

  const zr = [], zi = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n + 0.4;
    zr.push(0.9 * Math.cos(angle) + 0.4);
    zi.push(0.9 * Math.sin(angle));
  }

  for (let iteration = 0; iteration < 500; iteration++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const [pr, pi] = evaluate(zr[i], zi[i]);
      let dr = 1, di = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const ur = zr[i] - zr[j], ui = zi[i] - zi[j];
        const nr = dr * ur - di * ui;
        di = dr * ui + di * ur; dr = nr;
      }
      const den = dr * dr + di * di;
      if (den < 1e-300) continue;
      const qr = (pr * dr + pi * di) / den;
      const qi = (pi * dr - pr * di) / den;
      zr[i] -= qr; zi[i] -= qi;
      moved = Math.max(moved, Math.abs(qr) + Math.abs(qi));
    }
    if (moved < 1e-15) break;
  }

  return zr.map((re, i) => [re, zi[i]]);
}

// Every rate in (-1, LIMIT] where the net present value crosses zero. The root
// finder alone is not enough: a deeply negative return sits at a root far out on
// the real line (a return of -98% is a root at x = 84), where Durand-Kerner
// started on the unit circle does not reliably land, and numpy's eigenvalue
// method does. Scanning for sign changes finds those, and the two together
// cover what the server's calculation can produce.
function crossings(values) {
  const LIMIT = 100;
  const out = [];
  const grid = [-0.999999, -0.9999, -0.999];
  for (let r = -0.99; r < 1; r += 0.01) grid.push(r);
  for (let r = 1; r <= LIMIT; r += 0.25) grid.push(r);

  let previous = npv(grid[0], values);
  for (let i = 1; i < grid.length; i++) {
    const here = npv(grid[i], values);
    if (Number.isFinite(previous) && Number.isFinite(here) && previous !== 0
        && ((previous < 0) !== (here < 0))) {
      let lo = grid[i - 1], hi = grid[i], flo = previous;
      for (let step = 0; step < 200; step++) {
        const mid = (lo + hi) / 2;
        const f = npv(mid, values);
        if (!Number.isFinite(f)) break;
        if ((flo < 0) !== (f < 0)) hi = mid; else { lo = mid; flo = f; }
        if (hi - lo < 1e-15 * Math.max(1, Math.abs(hi))) break;
      }
      out.push((lo + hi) / 2);
    }
    if (here === 0) out.push(grid[i]);
    previous = here;
  }
  return out;
}

export function irr(values) {
  const rates = [];
  for (const [re, im] of roots(values.slice())) {
    // A root finder on a polynomial of thirty-odd terms can return a root that
    // is not a number at all; those comparisons are all false, so they have to
    // be thrown out by hand before they poison the choice below.
    if (!Number.isFinite(re) || !Number.isFinite(im)) continue;
    if (Math.abs(im) > 1e-9 * Math.max(1, Math.abs(re))) continue;
    if (re <= 0) continue;
    const rate = 1 / re - 1;
    if (Number.isFinite(rate)) rates.push(rate);
  }
  for (const rate of crossings(values)) {
    if (rate <= -1) continue;
    if (!rates.some(r => Math.abs(r - rate) < 1e-7 * Math.max(1, Math.abs(rate)))) rates.push(rate);
  }
  if (!rates.length) return NaN;

  let rate = rates.reduce((best, r) => (Math.abs(r) < Math.abs(best) ? r : best), rates[0]);

  for (let i = 0; i < 60; i++) {
    const f = npv(rate, values);
    const d = npvSlope(rate, values);
    if (!Number.isFinite(f) || !Number.isFinite(d) || Math.abs(d) < 1e-300) break;
    const step = f / d;
    rate -= step;
    if (rate <= -1) { rate += step; break; }
    if (Math.abs(step) < 1e-15 * Math.max(1, Math.abs(rate))) break;
  }
  return rate;
}

// ---------------------------------------------------------------------------
// The investment itself.

const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * What the data says for one entry year, before a plan's own edits.
 *
 * A plan keeps its edits against these: a price as a share above or below the
 * reference price, a rate as a number of points over the rate of the year. The
 * same judgement then holds in every entry year and under every data choice,
 * which is what the return per entry year needs to mean anything.
 */
export function references(inputs, p, year = p.year) {
  const row = inputs.rows[String(year)] || inputs.rows[year];
  if (!row) return null;
  const cpb = (inputs.cpb || {})[String(year)];
  const inflation = cpb === undefined ? p.longtermInflation : Number(cpb);
  return {
    price: 0.8 * row.price,
    rent: 12 * row.monthly_rent,
    loan_rate: row.mortgage_rate / 100 + p.mortgageSpread,
    transfer_tax: row.transfer_tax === null ? 0.104 : row.transfer_tax / 100,
    value_growth: p.useCpbExit ? inflation : (row.price_growth + row.price_growth_10y) / 2 / 100,
    rent_growth: p.useCpbExit ? inflation + p.rentSpread : row.rent_growth / 100,
  };
}

/**
 * One entry year, start to finish.
 *
 * inputs   what /engine/inputs returned (rows, cpb, regime)
 * p        the settings: year, ltv, opCost, period, rentSpread, longtermInflation,
 *          mortgageSpread, useCpbExit
 * plan     a plan's own edits: overrides (per line) and events. Without it, and
 *          with no market events, this is the main chart's number for that year.
 *          An override is how far the plan stands from the reference of that
 *          year: price and rent as a share of it, the rest in its own points.
 *
 * Returns every line the Plan view draws, and the IRR.
 */
export function simulate(inputs, p, plan = {}, options = {}) {
  const year = Number(p.year);
  const row = inputs.rows[String(year)] || inputs.rows[year];
  if (!row) return null;

  const over = plan.overrides || {};
  const events = plan.events || [];
  const cpb = inputs.cpb || {};
  const longterm = p.longtermInflation;
  // Inflation in one calendar year: the CPB figure, the long-term rate beyond
  // the series, and whatever the events in force make of it.
  const inflationOf = y => {
    const v = cpb[String(y)] !== undefined ? cpb[String(y)] : cpb[y];
    const base = v === undefined ? longterm : Number(v);
    return applyEvents(base, events, 'inflation', y, year, base);
  };

  const corporate = (inputs.regime && inputs.regime.corporate_tax) || {};
  const box3 = (inputs.regime && inputs.regime.box3_components) || {};
  const hasCorporate = Object.keys(corporate).length > 0;
  const hasBox3 = Object.keys(box3).length > 0;

  const period = Math.max(1, Math.round(num(over.period) ?? p.period));
  const ltv = num(over.ltv) ?? p.ltv;
  const opCostRatio = num(over.op_cost_ratio) ?? p.opCost;
  const rentSpread = num(over.rent_spread) ?? p.rentSpread;

  // How far this plan stands from the data of this year. Nothing set by hand
  // leaves every one of them at zero, which is the market reference itself.
  const apart = key => num(over[key]) ?? 0;
  const reference = references(inputs, { ...p, rentSpread }, year);

  const purchasePrice = reference.price * (1 + apart('price'));
  const loan = ltv * purchasePrice;
  const baseRate = num(over.base_rate) ?? row.mortgage_rate / 100;
  const mortgageRate = baseRate + p.mortgageSpread + apart('loan_rate');
  const initialRent = reference.rent * (1 + apart('rent'));

  // A rate set from a given year on applies to a purchase in that year or later.
  const transferTax = applyEvents(
    reference.transfer_tax + apart('transfer_tax'),
    events, 'transfer_tax', year, year);

  const historicGrowth = (row.price_growth + row.price_growth_10y) / 2 / 100;
  const historicRentGrowth = row.rent_growth / 100;
  // Growth is set against the year it happens in, not against the year of
  // purchase: a plan that counts on a point above inflation counts on it in
  // every year of the holding period.
  const valueGrowthFor = y => {
    const inflation = inflationOf(y);
    const base = (p.useCpbExit ? inflation : historicGrowth) + apart('value_growth');
    return applyEvents(base, events, 'value_growth', y, year, inflation);
  };
  const rentGrowthFor = y => {
    const inflation = inflationOf(y);
    const base = (p.useCpbExit ? inflation + rentSpread : historicRentGrowth) + apart('rent_growth');
    return applyEvents(base, events, 'rent_growth', y, year, inflation);
  };

  const cashflows = [-purchasePrice * (1 + transferTax) + loan];
  const rows = [];
  // Every step of the calculation, for a caller that wants to show its working
  // rather than only its result.
  const trace = options.trace ? {
    year, price: purchasePrice, transfer_tax: transferTax, loan,
    equity: purchasePrice * (1 + transferTax) - loan,
    loan_rate: mortgageRate, rent_year1: initialRent, cost_year1: opCostRatio * initialRent,
    inflation_path: [], rent_path: [], cost_path: [], interest_path: [],
    value_path: [], tax_path: [], net_path: [],
  } : null;

  let rent = initialRent;
  let operatingCosts = opCostRatio * initialRent;
  let propertyValue = purchasePrice;

  for (let t = 1; t <= period; t++) {
    const cashflowYear = year + t - 1;
    const live = eventsLive(events, cashflowYear, year);

    let yearRent = rent;
    let yearCosts = operatingCosts;
    let yearRate = mortgageRate;
    let oneOff = 0;
    // The rate is whatever the most recent refinancing set it to, whatever
    // order the events happen to be stored in.
    const byStart = [...live].sort((a, b) => eventStart(a, year) - eventStart(b, year));
    for (const event of byStart) {
      const value = Number(event.value || 0);
      if (event.field === 'rent_level') yearRent *= 1 + value;
      else if (event.field === 'op_cost') yearCosts *= 1 + value;
      else if (event.field === 'loan_rate') yearRate = value;
      else if (event.field === 'one_off' && eventStart(event, year) === cashflowYear) oneOff += value;
    }

    const interest = loan * yearRate;
    let netIncome = yearRent - yearCosts - interest;
    const gross = netIncome;

    if (hasCorporate) {
      const rate = Math.max(0, applyEvents(rateForYear(corporate, cashflowYear),
        events, 'corporate_tax', cashflowYear, year));
      netIncome -= rate * Math.max(0, netIncome);
    }
    if (hasBox3) {
      const rate = Math.max(0, applyEvents(box3EffectiveRate(box3, cashflowYear, ltv),
        events, 'box3', cashflowYear, year));
      netIncome -= rate * propertyValue;
    }

    const tax = gross - netIncome;
    netIncome -= oneOff;
    cashflows.push(netIncome);
    rows.push({
      t,
      year: cashflowYear,
      rent: yearRent,
      costs: yearCosts,
      interest,
      tax,
      oneOff,
      net: netIncome,
      value: propertyValue,
    });

    if (trace) {
      trace.rent_path.push(yearRent);
      trace.cost_path.push(yearCosts);
      trace.interest_path.push(interest);
      trace.tax_path.push(tax);
      trace.net_path.push(netIncome);
      trace.value_path.push(propertyValue);
      trace.inflation_path.push(inflationOf(cashflowYear));
    }

    rent *= 1 + rentGrowthFor(year + t);
    operatingCosts *= 1 + inflationOf(year + t);
    propertyValue *= 1 + valueGrowthFor(cashflowYear);
  }

  // The exit value walks the same path the yearly property value did.
  let exitValue = purchasePrice;
  for (let t = 0; t < period; t++) exitValue *= 1 + valueGrowthFor(year + t);

  cashflows[cashflows.length - 1] += exitValue - loan;

  const result = irr(cashflows) * 100;
  if (trace) {
    trace.exit_value = exitValue;
    trace.proceeds = exitValue - loan;
    trace.cashflows = [...cashflows];
    trace.irr = Number.isFinite(result) ? result : null;
  }

  return {
    year,
    period,
    purchasePrice,
    transferTax,
    loan,
    equity: purchasePrice * (1 + transferTax) - loan,
    mortgageRate,
    initialRent,
    rows,
    exitValue,
    proceeds: exitValue - loan,
    cashflows,
    irr: result,
    trace,
  };
}

/** The return for every entry year the data covers. */
export function curve(inputs, p, plan = {}) {
  return inputs.years.map(year => {
    const run = simulate(inputs, { ...p, year }, plan);
    return run && Number.isFinite(run.irr) ? run.irr : null;
  });
}

/** The CAPM norm for an entry year: the market of the year the money went in. */
export function requiredReturn(inputs, year) {
  const m = (inputs.market || {})[String(year)] || (inputs.market || {})[year];
  return m ? m.required_return : null;
}
