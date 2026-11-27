// api.js - What the page asks for, answered in this browser.
//
// The Monitor used to ask a server these questions. The answers are the same
// ones, worked out here from the files under data/ (dataset.js) with the engine
// the site has always calculated with (engine.js). The functions keep the names
// and the shapes the page already called them by, so nothing above this file
// had to change.
//
// The per-year edits a reader makes live in this module for as long as the page
// is open. They used to ride in a session cookie; there is no session here, and
// a reload starts again from the published data.

import * as D from './dataset.js';
import * as engine from './engine.js';

// ---------------------------------------------------------------------------
// The per-year edits.

let edits = {};

export function heldEdits() {
  return JSON.parse(JSON.stringify(edits));
}

export function clearEdits() {
  edits = {};
}

export function editedParams() {
  return Object.keys(edits).sort();
}

// ---------------------------------------------------------------------------
// The chart's numbers.

const DEFAULTS = {
  ltv: 0.40, op_cost: 0.23, period: 15, rent_spread: 0.01,
  longterm_inflation: 0.022, mortgage_spread: 0.0153, use_cpb_exit: true,
  beta: 0.63, liq_premium: 0.0025,
};

// Two decimals, as the figures beside the chart have always been given.
const round2 = v => (Number.isFinite(v) ? Number(v.toFixed(2)) : 0);

function settingsOf(ltv, opCost, period, rentSpread, longtermInflation, mortgageSpread, useCpbExit) {
  return { ltv, opCost, period, rentSpread, longtermInflation, mortgageSpread, useCpbExit };
}

/**
 * The return per entry year, and the figures beside the chart.
 *
 * A year the engine cannot price is given as 0, the way the chart has always
 * drawn it, and is left out of the latest year and the five-year average.
 */
function irrPayload(years, values) {
  const priced = years.map((year, i) => ({ year, irr: values[i] }))
    .filter(row => Number.isFinite(row.irr))
    .sort((a, b) => b.year - a.year);
  const latest = priced.length ? priced[0].irr : 0;
  const recent = priced.slice(0, Math.min(5, priced.length));
  const average = recent.length
    ? recent.reduce((sum, row) => sum + row.irr, 0) / recent.length : 0;
  return {
    irr_values: values.map(v => (Number.isFinite(v) ? v : 0)),
    years: [...years],
    latest_year_irr: round2(latest),
    five_year_avg_irr: round2(average),
    avg_irr: round2(average),
  };
}

/** The return per entry year for one set of settings. */
export function irrCurve(settings, investorType, held = edits) {
  const inputs = D.engineInputs(investorType, held);
  const values = engine.curve(inputs, settings);
  return { inputs, values };
}

export async function calculateIRR(ltv, opCost, period, rentSpread = DEFAULTS.rent_spread,
  longtermInflation = DEFAULTS.longterm_inflation, mortgageSpread = DEFAULTS.mortgage_spread,
  useCpbExit = true, investorType = null) {
  const { inputs, values } = irrCurve(
    settingsOf(ltv, opCost, period, rentSpread, longtermInflation, mortgageSpread, useCpbExit),
    investorType);
  return { ...irrPayload(inputs.years, values), modified_params: editedParams() };
}

/**
 * The CAPM norm per year.
 *
 * The norm is the property's own required return, so it does not follow the
 * loan; `levered` says so, as the page's own answer always did.
 */
export async function calculateRequiredReturn(beta, liqPremium) {
  const rows = D.requiredReturns(beta, liqPremium, null);
  const values = rows.map(row => (Number.isFinite(row.value) ? row.value : 0));
  const valid = rows.map(row => row.value).filter(Number.isFinite);
  return {
    levered: false,
    required_return_values: values,
    years: rows.map(row => row.year),
    avg_required_return: round2(valid.length
      ? valid.reduce((a, b) => a + b, 0) / valid.length : 0),
  };
}

// ---------------------------------------------------------------------------
// The per-year editor.

/** The published series and the values in force, per year, for one parameter. */
export async function getParameterData(param) {
  const spec = D.PARAMS[param];
  if (!spec) return { error: `Unsupported parameter: ${param}` };

  // Every parameter is drawn over the same years: the ones the table holds.
  const years = D.frame().map(row => row.Year);
  let values;
  if (spec.source === 'column') {
    const byYear = {};
    for (const row of D.frame()) byYear[row.Year] = row[spec.source_column];
    values = years.map(year => {
      const v = byYear[year];
      return v === null || v === undefined || !Number.isFinite(v) ? 0 : Number(v);
    });
  } else {
    const series = D.publishedSeries(param) || {};
    values = years.map(year => Number(series[String(year)] ?? 0));
  }

  // The stored series, before any edit: the line an edit is measured against.
  const stored = [...values];
  const held = (edits[param] || {}).modified || {};
  for (const [year, value] of Object.entries(held)) {
    const index = years.indexOf(parseInt(year, 10));
    if (index >= 0) values[index] = Number(value);
  }

  return { years, values, original: stored, unit: spec.unit, param,
    display_name: spec.display_name };
}

/**
 * Apply per-year values to a parameter and give back the chart's numbers.
 *
 * persist=false answers a what-if without keeping it: the sensitivity readout
 * asks what the data gives, and a kept probe would stay applied to everything
 * calculated after it.
 */
export async function applyParameterChanges(param, years, values, ltv, opCost, period,
  rentSpread = DEFAULTS.rent_spread, longtermInflation = DEFAULTS.longterm_inflation,
  mortgageSpread = DEFAULTS.mortgage_spread, useCpbExit = true, investorType = null,
  persist = true) {
  if (!D.PARAMS[param]) return { error: `Unsupported parameter: ${param}` };

  const working = JSON.parse(JSON.stringify(edits));
  working[param] = working[param] || {};
  working[param].modified = {};
  years.forEach((year, i) => {
    if (i < values.length) working[param].modified[String(year)] = values[i];
  });

  if (persist) {
    // Only a real departure from the published series is an edit. Writing the
    // data back as an edit would make it its own baseline.
    const stored = D.publishedSeries(param) || {};
    const edited = {};
    for (const [year, value] of Object.entries(working[param].modified)) {
      if (stored[year] !== undefined && Math.abs(Number(value) - Number(stored[year])) > 1e-9) {
        edited[year] = Number(value);
      }
    }
    if (Object.keys(edited).length) working[param].modified = edited;
    else delete working[param];
    edits = D.cleanEdits(working);
  }

  const held = persist ? edits : D.cleanEdits(working);
  const inputs = D.engineInputs(investorType, held);
  const curve = engine.curve(inputs, settingsOf(ltv, opCost, period, rentSpread,
    longtermInflation, mortgageSpread, useCpbExit));

  return {
    ...irrPayload(inputs.years, curve),
    param,
    param_years: years,
    param_values: values,
    modified_params: Object.keys(held).sort(),
  };
}

/**
 * Everything back to the published data and the type's own defaults.
 *
 * The norm comes back with the liquidity premium the defaults name, which is
 * the figure this control has always put on the chart.
 */
export async function resetToDefaults(investorType = null) {
  clearEdits();
  const settings = D.investorDcfSettings(investorType);
  const inputs = D.engineInputs(investorType, edits);
  const curve = engine.curve(inputs, settingsOf(settings.ltv, DEFAULTS.op_cost,
    settings.period, DEFAULTS.rent_spread, DEFAULTS.longterm_inflation,
    settings.mortgage_spread, DEFAULTS.use_cpb_exit));
  const norm = D.requiredReturns(DEFAULTS.beta, DEFAULTS.liq_premium, null);
  return {
    ...irrPayload(inputs.years, curve),
    required_return_values: norm.map(row => (Number.isFinite(row.value) ? row.value : 0)),
  };
}

// ---------------------------------------------------------------------------
// The taxes in force.

/**
 * The active type's regime, for the readout under the buttons.
 *
 * Every tax in the regime with its rate for the reference year — the last year
 * the rate table covers, which is what is in force now — including the ones
 * that are zero. Box 3 is not a stored rate but the figure its components give
 * at the loan share set, which is why the readout moves with the LTV.
 */
export async function getTaxRegime(ltv, investorType = null) {
  const regime = D.taxRegime(investorType);
  if (!regime) return { investor_type: null, taxes: [] };

  const years = Object.keys(regime.transfer_tax || {}).map(Number).sort((a, b) => a - b);
  const referenceYear = years.length ? years[years.length - 1] : null;

  const taxes = [];
  for (const key of ['transfer_tax', 'corporate_tax', 'vat']) {
    if (regime[key] === undefined || regime[key] === null) continue;
    taxes.push({ key, rate: referenceYear ? D.rateForYear(regime[key], referenceYear) : 0,
      derived: false });
  }

  const components = regime.box3_components;
  if (components) {
    const box3Years = Object.keys(components).map(Number).sort((a, b) => a - b);
    const year = referenceYear || box3Years[box3Years.length - 1];
    taxes.push({ key: 'box3', rate: D.box3EffectiveRate(components, year, ltv),
      derived: true, ltv });
  }

  return { investor_type: investorType, reference_year: referenceYear, taxes };
}

// ---------------------------------------------------------------------------
// The 3-year window.

const SENSITIVITY_LABELS = {
  ltv: ['Loan-to-Value (LTV)', '%'],
  opcost: ['Operating Cost', '%'],
  period: ['Holding Period', 'year'],
  rent_spread: ['Rent Growth Spread', '%'],
  longterm_inflation: ['Long-term Inflation', '%'],
  property_price: ['Property Price', '%'],
  monthly_rent: ['Monthly Rent Level', '%'],
};

/** The return of one entry year on a set of rows, or null. */
function irrOf(rows, year, settings, investorType) {
  // The rows already carry the edits; the inflation does not live in them, so
  // the edits travel on as well.
  const inputs = D.engineInputs(investorType, edits, rows);
  if (!inputs.rows[year]) return null;
  const run = engine.simulate(inputs, { ...settings, year });
  return run && Number.isFinite(run.irr) ? run.irr : null;
}

/**
 * The selected year and the years either side, and what moves the selected
 * year's return.
 *
 * The window is priced on its own three rows, as it always was: the ten-year
 * averages of a three-year window are the averages of those three years, and
 * the sensitivities are measured on the selected year's row alone.
 */
export async function threeYearWindow({ year, ltv, opCost, period, rentSpread,
  longtermInflation, mortgageSpread, useCpbExit, investorType = null } = {}) {
  const settings = settingsOf(ltv, opCost, period, rentSpread, longtermInflation,
    mortgageSpread, useCpbExit);
  const rows = D.editedFrame(edits);
  const windowYears = [year - 1, year, year + 1];
  const windowRows = rows.filter(row => windowYears.includes(row.Year));
  if (!windowRows.length) return { error: 'No data available for the selected year window' };

  const inputs = D.engineInputs(investorType, edits, windowRows);
  const values = engine.curve(inputs, settings);

  const own = rows.filter(row => row.Year === year);
  const sensitivities = [];
  if (own.length) {
    const base = irrOf(own, year, settings, investorType);
    const move = (changed, settingsOverride) => {
      const value = irrOf(changed, year, { ...settings, ...settingsOverride }, investorType);
      return base === null || value === null ? null : value - base;
    };
    const add = (key, value) => {
      if (value === null) return;
      const [name, unit] = SENSITIVITY_LABELS[key];
      sensitivities.push({ param: key, display_name: name,
        value: Number(value.toFixed(4)), unit });
    };

    add('ltv', move(own, { ltv: Math.min(ltv + 0.01, 0.9) }));
    add('opcost', move(own, { opCost: opCost + 0.01 }));
    add('period', move(own, { period: period + 1 }));
    add('rent_spread', move(own, { rentSpread: rentSpread + 0.01 }));
    add('longterm_inflation', move(own, { longtermInflation: longtermInflation + 0.01 }));

    const withPrice = own.map(row => ({ ...row, Avg_Property_Price: row.Avg_Property_Price * 1.01 }));
    add('property_price', move(withPrice, {}));
    const withRent = own.map(row => ({ ...row, Avg_Monthly_Rent: row.Avg_Monthly_Rent * 1.01 }));
    add('monthly_rent', move(withRent, {}));
    // The mortgage rate has no row here, and never had: the rate the window is
    // priced on is the published series, and the figure the readout would move
    // is not one of this row's own.

    sensitivities.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }

  return {
    years: inputs.years,
    irr_values: values.map(v => (Number.isFinite(v) ? v : null)),
    selected_year: year,
    sensitivities,
  };
}

// ---------------------------------------------------------------------------
// The settings panel.

/** The reference loan share, spread and holding period for a type. */
function settingsReference(investorType) {
  const entry = ((D.data().investorSettings || {}).settings || {})[investorType || ''] || {};
  const defaults = D.investorDcfSettings(investorType);
  const out = {};
  for (const key of ['ltv', 'mortgage_spread', 'period']) {
    out[key] = (entry[key] || {}).value ?? defaults[key];
  }
  return out;
}

/**
 * What each per-type setting does to the latest year's return: the return as
 * the settings stand, and the return with that one setting back at its
 * reference. The difference is the note beside the setting.
 */
export async function investorSettingsEffects(investorType, dcf) {
  const reference = settingsReference(investorType);
  const current = {
    ltv: dcf.ltv ?? reference.ltv,
    mortgage_spread: dcf.mortgageSpread ?? reference.mortgage_spread,
    period: dcf.period ?? reference.period,
  };
  const shared = {
    opCost: dcf.opCost ?? DEFAULTS.op_cost,
    rentSpread: dcf.rentSpread ?? DEFAULTS.rent_spread,
    longtermInflation: dcf.longtermInflation ?? DEFAULTS.longterm_inflation,
    useCpbExit: dcf.useCpbExit ?? true,
  };
  const inputs = D.engineInputs(investorType, edits);

  const latest = values => {
    const curve = engine.curve(inputs, {
      ...shared, ltv: values.ltv, mortgageSpread: values.mortgage_spread, period: values.period,
    });
    for (let i = inputs.years.length - 1; i >= 0; i--) {
      if (Number.isFinite(curve[i])) return [inputs.years[i], curve[i]];
    }
    return [null, null];
  };

  const [year, irr] = latest(current);
  const effects = {};
  for (const key of ['ltv', 'mortgage_spread', 'period']) {
    const [, referenceIrr] = latest({ ...current, [key]: reference[key] });
    effects[key] = { reference_irr: referenceIrr,
      delta: irr === null || referenceIrr === null ? null : irr - referenceIrr };
  }
  return { year, irr, effects };
}
