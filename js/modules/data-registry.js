// data-registry.js - What the Data tab draws, read from the same files the
// engine reads.
//
// Two tables. "Values per year" is every series the model reads, with its
// publisher and what kind of figure each year's value is. "Investor types" puts
// the types side by side for one purchase year: only the inputs that differ
// between them, then each type's return and the norm, and under a value that
// differs from the first type, what that one input does to that type's return.

import * as D from './dataset.js';
import * as engine from './engine.js';

// A status says what kind of published figure a value is. A value with no
// public source carries no status and no source line.
export const STATUSES = ['actual', 'forecast', 'estimate'];

const round10 = v => Number(Number(v).toFixed(10));
const isNum = v => v !== null && v !== undefined && Number.isFinite(Number(v));

function yearRange() {
  const [first, last] = D.data().registry.years;
  const out = [];
  for (let year = first; year <= last; year++) out.push(year);
  return out;
}

/** {year: stored value} for one series, read from where the engine reads it. */
function storedValues(spec) {
  const store = spec.store;
  const d = D.data();
  if (store.kind === 'series') {
    const out = {};
    for (const [year, value] of Object.entries(d.series[store.key] || {})) {
      if (isNum(value)) out[Math.trunc(Number(year))] = Number(value);
    }
    return out;
  }
  if (store.kind === 'monthly') {
    const rows = store.file === 'nl_bond_10y.json' ? d.bond
      : store.file === 'mortgage_rates_all.json' ? d.mortgageAll : d.mortgageNew;
    return D.monthlyToYearly(rows, store.field);
  }
  const rows = store.file === 'mkt.json' ? d.market
    : store.file === 'avg_property_prices.json' ? d.prices
      : store.file === 'prop_price_growth.json' ? d.priceGrowth
        : store.file === 'rent_growth.json' ? d.rentGrowth : d.cpi;
  const out = {};
  for (const row of rows || []) {
    const year = row[store.year_field];
    if (year === null || year === undefined || !isNum(row[store.field])) continue;
    out[Math.trunc(Number(year))] = Number(row[store.field]);
  }
  return out;
}

/** {year: value in the unit the table shows}. */
function seriesValues(spec) {
  const scale = spec.scale ?? 1;
  const out = {};
  for (const [year, value] of Object.entries(storedValues(spec))) {
    out[Number(year)] = round10(Number(value) * scale);
  }
  return out;
}

function statusOf(spec, year) {
  return (spec.status || {})[String(year)] ?? spec.default_status ?? 'actual';
}

/** Every series with its values, status and publisher. */
export function registryPayload() {
  const reg = D.data().registry;
  const years = yearRange();
  const series = reg.series.map(spec => {
    const values = seriesValues(spec);
    const status = {};
    for (const year of years) {
      if (values[year] !== undefined && STATUSES.includes(statusOf(spec, year))) {
        status[String(year)] = statusOf(spec, year);
      }
    }
    const shown = {};
    for (const year of years) shown[String(year)] = values[year] ?? null;
    return { id: spec.id, group: spec.group, label: spec.label, unit: spec.unit,
      decimals: spec.decimals, used: spec.used, source: spec.source || null,
      values: shown, status };
  });
  return { years, groups: reg.groups, series, statuses: [...STATUSES] };
}

// ---------------------------------------------------------------------------
// The types side by side.

const TYPES = D.VISIBLE_TYPES;
const BASE_TYPE = D.DEFAULT_INVESTOR_TYPE;

const GROUPS = [
  { id: 'market', label: { en: 'Dwelling and market', nl: 'Woning en markt' } },
  { id: 'dcf', label: { en: 'DCF settings', nl: 'DCF-instellingen' } },
  { id: 'tax', label: { en: 'Taxes', nl: 'Belastingen' } },
  { id: 'result', label: { en: 'Result', nl: 'Uitkomst' } },
];

// Inputs from the registry that are the same for every type.
const MARKET_SERIES = ['property_price', 'monthly_rent', 'mortgage_rate', 'cpb_inflation',
  'price_growth', 'rent_increase', 'rf', 'erp', 'beta', 'liq'];

// Model constants without a documented source (the engine's own defaults).
const OP_COST = 0.23;
const RENT_SPREAD = 0.01;
const LONGTERM_INFLATION = 0.022;
const PRICE_SHARE = 0.8;

const publishers = () => D.data().publicSources || {};

/** A value with its publisher's name. Only forecast and estimate are marked. */
function cell(value, url = null, status = null, publisher = null) {
  const name = publisher || (url ? (publishers().links || {})[url] : null) || null;
  return { value: value === undefined ? null : value,
    status: status === 'forecast' || status === 'estimate' ? status : null,
    source: name ? { en: name, nl: name } : null };
}

/** A DCF setting, with the publisher named in the type's definitions. */
function settingCell(type, key, value) {
  const entry = (((D.data().investorSettings || {}).settings || {})[type] || {})[key] || {};
  return cell(value, entry.url, null, entry.source);
}

/** Publisher of a tax. */
function taxPublisher(key) {
  const named = ((D.data().investorSettings || {}).taxes || {})[key];
  return typeof named === 'string' ? named : (publishers().taxes || {})[key] || null;
}

function typeInputs(type) {
  const s = D.investorDcfSettings(type);
  return { ltv: s.ltv, mortgage_spread: s.mortgage_spread, period: s.period,
    op_cost: s.op_cost ?? OP_COST, regime: D.taxRegime(type) };
}

/** {year: return in %} for one set of inputs, on the published data. */
function irrByYear(inputs) {
  const frame = D.engineInputs(null, null);
  frame.regime = { corporate_tax: (inputs.regime || {}).corporate_tax || {},
    box3_components: (inputs.regime || {}).box3_components || {} };
  const curve = engine.curve(frame, {
    ltv: inputs.ltv, opCost: inputs.op_cost, period: inputs.period,
    rentSpread: RENT_SPREAD, longtermInflation: LONGTERM_INFLATION,
    mortgageSpread: inputs.mortgage_spread, useCpbExit: true,
  });
  const out = {};
  frame.years.forEach((year, i) => { if (Number.isFinite(curve[i])) out[year] = curve[i]; });
  return out;
}

/** inputs with one row set back to the base type's value. */
function reset(inputs, row, base) {
  const out = { ...inputs };
  if (['ltv', 'mortgage_spread', 'period', 'op_cost'].includes(row)) {
    out[row] = base[row];
  } else if (row === 'corporate_tax') {
    out.regime = { ...(inputs.regime || {}),
      corporate_tax: (base.regime || {}).corporate_tax || {} };
  } else if (row === 'box3') {
    out.regime = { ...(inputs.regime || {}) };
    delete out.regime.box3_components;
  }
  return out;
}

const same = (a, b) => {
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  return Math.abs(Number(a) - Number(b)) < 1e-9;
};

let cache = null;

/** The comparison for one purchase year. */
export function investorTypesPayload(year) {
  const reg = registryPayload();
  const years = reg.years;
  const shown = years.includes(year) ? year : years[years.length - 1];
  const key = String(shown);
  const inputs = {};
  for (const type of TYPES) inputs[type] = typeInputs(type);
  const base = inputs[BASE_TYPE];
  const rows = [];

  const add = (group, id, label, unit, decimals, cells, effect = null) => {
    rows.push({ group, id, label, unit, decimals, cells, effect_row: effect });
  };

  // 1. Dwelling and market: the registry's values for the year.
  const byId = {};
  for (const spec of reg.series) byId[spec.id] = spec;
  for (const id of MARKET_SERIES) {
    const spec = byId[id];
    if (!spec) continue;
    const value = spec.values[key] ?? null;
    const status = spec.status[key] ?? 'actual';
    const cells = {};
    for (const type of TYPES) {
      cells[type] = cell(value, (spec.source || {}).url, status,
        (publishers().series || {})[id]);
    }
    add('market', id, spec.label, spec.unit, spec.decimals, cells);
  }

  // 2. DCF assumptions
  const pct = v => (v === null || v === undefined ? null : round10(Number(v) * 100));
  const per = fn => Object.fromEntries(TYPES.map(type => [type, fn(type)]));

  add('dcf', 'ltv', { en: 'Loan-to-value (LTV)', nl: 'Loan-to-value (LTV)' }, '%', 0,
    per(t => settingCell(t, 'ltv', pct(inputs[t].ltv))), 'ltv');
  add('dcf', 'mortgage_spread',
    { en: 'Spread on the mortgage rate', nl: 'Opslag op de hypotheekrente' }, '%', 2,
    per(t => settingCell(t, 'mortgage_spread', pct(inputs[t].mortgage_spread))), 'mortgage_spread');
  add('dcf', 'period', { en: 'Holding period', nl: 'Houdperiode' }, 'yrs', 0,
    per(t => settingCell(t, 'period', inputs[t].period)), 'period');
  add('dcf', 'op_cost',
    { en: 'Operating costs, share of year-1 rent',
      nl: 'Exploitatiekosten, deel van de huur in jaar 1' }, '%', 0,
    per(t => cell(pct(inputs[t].op_cost))), 'op_cost');
  add('dcf', 'price_share',
    { en: 'Purchase price, share of the average price',
      nl: 'Aankoopprijs, deel van de gemiddelde prijs' }, '%', 0,
    per(() => cell(pct(PRICE_SHARE))));
  add('dcf', 'rent_spread',
    { en: 'Rent growth above inflation', nl: 'Huurgroei boven inflatie' }, '%', 1,
    per(() => cell(pct(RENT_SPREAD))));
  add('dcf', 'longterm_inflation',
    { en: 'Inflation after the last CPB year', nl: 'Inflatie na het laatste CPB-jaar' }, '%', 1,
    per(() => cell(pct(LONGTERM_INFLATION))));

  // 3. Taxes in force in the year
  const transfer = byId.transfer_tax ? (byId.transfer_tax.values[key] ?? null)
    : (D.transferTaxValues()[shown] ?? null);
  add('tax', 'purchase_tax',
    { en: 'Transfer tax (at purchase)', nl: 'Overdrachtsbelasting (bij aankoop)' }, '%', 1,
    per(() => cell(transfer, null, null, taxPublisher('transfer_tax'))), 'purchase_tax');
  add('tax', 'corporate_tax',
    { en: 'Corporate tax, on net rent after interest',
      nl: 'Vennootschapsbelasting, over netto huur na rente' }, '%', 1,
    per(t => cell(pct(D.rateForYear((inputs[t].regime || {}).corporate_tax || {}, shown)),
      null, null, taxPublisher('corporate_tax'))), 'corporate_tax');

  const box3 = (type, part) => {
    const components = (inputs[type].regime || {}).box3_components;
    if (!components) return cell(null);
    if (part === 'effective') {
      return cell(pct(D.box3EffectiveRate(components, shown, inputs[type].ltv)),
        null, null, taxPublisher('box3'));
    }
    const known = Object.keys(components).map(Number).sort((a, b) => a - b);
    const bounded = Math.min(Math.max(shown, known[0]), known[known.length - 1]);
    return cell(pct(components[String(bounded)][part]), null, null, taxPublisher('box3'));
  };
  add('tax', 'box3',
    { en: 'Box 3, effective, on the property value', nl: 'Box 3, effectief, over de woningwaarde' },
    '%', 2, per(t => box3(t, 'effective')), 'box3');
  add('tax', 'box3_rate', { en: 'Box 3 tax rate', nl: 'Box 3-tarief' }, '%', 0,
    per(t => box3(t, 'tax_rate')));
  add('tax', 'box3_roi',
    { en: 'Box 3 implied return', nl: 'Box 3 forfaitair rendement' }, '%', 2,
    per(t => box3(t, 'implied_roi')));
  add('tax', 'box3_interest',
    { en: 'Box 3 implied interest', nl: 'Box 3 forfaitaire rente' }, '%', 2,
    per(t => box3(t, 'implied_interest')));

  // Which rows differ per type, for the effects
  const differing = {};
  for (const row of rows) {
    const values = TYPES.map(type => row.cells[type].value);
    row.differs = !values.every(v => same(v, values[0]));
    if (row.differs && row.effect_row) {
      for (const type of TYPES) {
        if (type !== BASE_TYPE && !same(row.cells[type].value, row.cells[BASE_TYPE].value)) {
          differing[type] = differing[type] || new Set();
          differing[type].add(row.effect_row);
        }
      }
    }
  }

  // Four full passes per differing setting; the answer depends only on the data
  // and these inputs, so it is worked out once per page.
  if (!cache) cache = { base: {}, reset: {} };
  for (const type of TYPES) {
    if (!cache.base[type]) cache.base[type] = irrByYear(inputs[type]);
  }
  for (const [type, keys] of Object.entries(differing)) {
    for (const row of keys) {
      const id = `${type}:${row}`;
      if (!cache.reset[id]) cache.reset[id] = irrByYear(reset(inputs[type], row, base));
    }
  }

  for (const row of rows) {
    if (!(row.differs && row.effect_row)) continue;
    for (const type of TYPES) {
      if (type === BASE_TYPE || same(row.cells[type].value, row.cells[BASE_TYPE].value)) continue;
      const now = cache.base[type][shown];
      const back = (cache.reset[`${type}:${row.effect_row}`] || {})[shown];
      if (now !== undefined && back !== undefined) {
        row.cells[type].effect = round10(Number((now - back).toFixed(4)));
      }
    }
  }

  // 4. Result
  add('result', 'irr', { en: 'IRR', nl: 'IRR' }, '%', 2,
    per(t => cell(cache.base[t][shown] === undefined ? null
      : Number(cache.base[t][shown].toFixed(4)))));
  const norm = D.marketData()[shown];
  add('result', 'norm', { en: 'CAPM norm', nl: 'CAPM-norm' }, '%', 2,
    per(() => cell(norm ? Number(norm.required_return.toFixed(4)) : null)));
  for (const row of rows.slice(-2)) {
    const values = TYPES.map(type => row.cells[type].value);
    row.differs = !values.every(v => same(v, values[0]));
  }

  return { year: shown, years,
    types: TYPES.map(type => ({ id: type, label: D.TYPE_LABELS[type] })),
    base: BASE_TYPE, groups: GROUPS, rows };
}

/**
 * The comparison as spreadsheet rows: values per type, then each type's effect
 * against the first type (percentage points), then where each value comes from.
 */
export function comparisonRows(year, lang) {
  const data = investorTypesPayload(year);
  const nl = lang === 'nl';
  const names = data.types.map(t => t.label[lang]);
  const effectNames = names.slice(1)
    .map(n => `${n}: ${nl ? 'effect t.o.v.' : 'effect vs'} ${names[0]} (pp)`);
  const head = [nl ? 'Groep' : 'Group', nl ? 'Invoer' : 'Input', nl ? 'Eenheid' : 'Unit']
    .concat(names, effectNames, [nl ? 'Bron' : 'Source']);
  const groups = Object.fromEntries(data.groups.map(g => [g.id, g.label[lang]]));
  const out = [head];
  for (const row of data.rows) {
    const cells = data.types.map(t => row.cells[t.id]);
    const texts = cells.map(c => (c.source ? c.source[lang] : ''));
    const sources = new Set(texts).size === 1
      ? (texts[0] ? [texts[0]] : [])
      : names.map((n, i) => (texts[i] ? `${n}: ${texts[i]}` : '')).filter(Boolean);
    out.push([groups[row.group], row.label[lang] || row.label.en, row.unit]
      .concat(cells.map(c => c.value), cells.slice(1).map(c => c.effect ?? null),
        [sources.join(' | ')]));
  }
  return [`${nl ? 'Beleggerstypen' : 'Investor types'} ${data.year}`, out];
}

/** Every value in the tables, as spreadsheet rows. */
export function valueRows(lang) {
  const reg = registryPayload();
  const nl = lang === 'nl';
  const groups = Object.fromEntries(reg.groups.map(g => [g.id, g.label[lang] || g.label.en]));
  const head = (nl ? ['Groep', 'Reeks', 'Eenheid', 'Gebruikt voor', 'Bron']
    : ['Group', 'Series', 'Unit', 'Used for', 'Source'])
    .concat(reg.years.map(String));
  const out = [head];
  for (const spec of reg.series) {
    out.push([groups[spec.group], spec.label[lang] || spec.label.en, spec.unit,
      spec.used[lang] || spec.used.en, (spec.source || {}).name || '']
      .concat(reg.years.map(year => spec.values[String(year)])));
  }
  return out;
}
