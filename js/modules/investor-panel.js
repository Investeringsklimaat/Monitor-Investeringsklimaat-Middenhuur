// investor-panel.js - Settings panel for the active investor type
//
// One compact block per item, laid out in a wrapping grid: the label, the value
// (settings typed over via "edit"), and a small grey "Source: <publisher>" line
// when it has one. A setting moved away from its reference adds one line: how far,
// and the effect on the latest year's IRR, green when higher, red when lower.
//
// The rows are the three DCF settings that differ by type (LTV, mortgage spread,
// holding period), from data/investor_settings.json, followed by the taxes in
// force, which are data rather than settings and so carry a source but no number
// to type over.
//
// The panel opens collapsed and remembers whether it was opened afterwards.

import i18n from '../i18n.js';
import { esc } from './utils.js';
import { INVESTOR_PANEL_TEXT as TEXT } from '../i18n.js';
import { investorSettingsEffects } from './api.js';

// Rows for the investor types. The three DCF settings carry a number to type
// over; the taxes are data and carry only a source.
const STANDARD_ROWS = [
  { key: 'ltv', kind: 'percent', decimals: 0, min: 0, max: 90 },
  { key: 'mortgage_spread', kind: 'percent', decimals: 2, min: -1, max: 5 },
  { key: 'period', kind: 'years', min: 5, max: 30 },
];

let settingsConfig = {};
let taxRates = {};
let deps = null;
let effects = null;
let activeType = null;
let collapsed = true;
let effectsRequest = 0;

function lang() {
  return i18n.getCurrentLanguage() === 'en' ? 'en' : 'nl';
}

function t(key) {
  return TEXT[lang()][key] ?? key;
}

function fmt(value, decimals) {
  const text = Number(value).toFixed(decimals);
  return lang() === 'nl' ? text.replace('.', ',') : text;
}

function signed(value, decimals) {
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return fmt(0, decimals);
  return (rounded > 0 ? '+' : '−') + fmt(Math.abs(rounded), decimals);
}

function parseNumber(text) {
  const value = parseFloat(String(text).trim().replace(',', '.').replace('%', ''));
  return Number.isFinite(value) ? value : null;
}

function rows() {
  return STANDARD_ROWS;
}

// The reference entry (value, source) behind a row.
function entryFor(key) {
  return settingsConfig.settings?.[activeType]?.[key];
}

function reference(key) {
  return entryFor(key)?.value;
}

// Current value of a setting, in display units (percent or years).
function currentValue(key) {
  const dcf = deps.getDcf();
  if (key === 'ltv') return dcf.ltv * 100;
  if (key === 'mortgage_spread') return dcf.mortgageSpread * 100;
  if (key === 'op_cost') return dcf.opCost * 100;
  return dcf.period;
}

export function initInvestorPanel(options) {
  deps = options;
  settingsConfig = options.settingsConfig || {};
  taxRates = options.taxRates || {};
  // Collapsed until the reader opens it; the choice is remembered after that.
  try { collapsed = localStorage.getItem('investorPanelCollapsed') !== '0'; } catch (e) { collapsed = true; }

  document.addEventListener('languageChanged', () => render());
}

// Show the panel for an investor type, or hide it when no type is active.
export function showInvestorPanel(type) {
  const panel = document.getElementById('nc-panel');
  if (!panel) return;
  activeType = type || null;
  const visible = Boolean(activeType) && Boolean(settingsConfig.settings?.[activeType]);
  panel.hidden = !visible;
  if (!visible) return;
  panel.setAttribute('aria-label', t(activeType));
  effects = null;
  render();
  refreshInvestorPanel();
}

// Re-read the DCF values and recompute the differences. Called after every
// recalculation while a type is active.
export async function refreshInvestorPanel() {
  const panel = document.getElementById('nc-panel');
  if (!panel || panel.hidden || !activeType) return;
  render();

  const request = ++effectsRequest;
  try {
    const data = await investorSettingsEffects(activeType, deps.getDcf());
    if (request !== effectsRequest || data.error) return;
    effects = data;
    render();
  } catch (error) {
    console.error('Error working out the investor-panel effects:', error);
  }
}

async function commit(row, text) {
  const value = parseNumber(text);
  if (value === null) return false;
  const clamped = Math.max(row.min, Math.min(row.max, value));

  if (row.key === 'ltv') {
    deps.setLtv(clamped);
  } else if (row.key === 'mortgage_spread') {
    deps.setMortgageSpread(clamped);
  } else if (row.key === 'op_cost') {
    deps.setOpCost(clamped);
  } else if (row.key === 'period') {
    deps.setPeriod(Math.round(clamped));
  }
  await deps.recalculate();
  return true;
}

function differenceNote(row) {
  const current = currentValue(row.key);
  const ref = reference(row.key);
  if (ref === undefined || ref === null) return '';

  const decimals = row.decimals ?? 1;
  let distance;
  let equal;

  if (row.kind === 'years') {
    const diff = current - ref;
    equal = diff === 0;
    distance = `${signed(diff, 0)} ${t('years')}`;
  } else {
    const diff = current - ref * 100;
    equal = Math.abs(diff) < Math.pow(10, -decimals) / 2;
    distance = `${signed(diff, decimals)} ${t('pp')}`;
  }

  if (equal) return '';

  const effect = effects?.effects?.[row.key];
  if (!effect || effect.delta === null || effect.delta === undefined) {
    return `<span class="nc-diff same">${distance}</span>`;
  }
  const delta = effect.delta;
  const cls = Math.abs(delta) < 0.005 ? 'same' : (delta > 0 ? 'up' : 'down');
  const lead = distance ? `${distance} · ` : '';
  return `<span class="nc-diff ${cls}">${lead}${t('irrLabel')} ${effects.year} ${signed(delta, 2)} ${t('pp')}</span>`;
}

// The year the panel's values apply to: the latest year of the tax table.
function dataYear() {
  const rates = taxRates[activeType] || taxRates.institutional || Object.values(taxRates)[0];
  return rates?.reference_year;
}

// "Source: <publisher>, <year>": the entry's own year when it has one, else the
// year the values apply to. Nothing when there is no source: the value stands alone.
function sourceLine(entry, year) {
  const name = typeof entry === 'string' ? entry : entry?.source;
  if (!name) return '';
  const y = (entry && typeof entry === 'object' && entry.year) || year || dataYear();
  return `<span class="nc-src">${t('source')}: ${esc(name)}${y ? `, ${esc(y)}` : ''}</span>`;
}

function block(inner, cls = '') {
  return `<div class="nc-block ${cls}">${inner}</div>`;
}

function settingBlock(row) {
  const name = `<span class="nc-name">${t(row.key)}</span>`;
  const entry = entryFor(row.key);

  const value = currentValue(row.key);
  const shown = row.kind === 'years' ? String(Math.round(value)) : fmt(value, row.decimals ?? 1);
  const suffix = row.kind === 'years' ? t('years') : (TEXT[lang()][`${row.key}_suffix`] || '');
  const sign = row.kind === 'percent' ? '%' : '';
  return block(`${name}
    <span class="nc-numline"><input class="nc-num" data-key="${row.key}" value="${shown}" readonly tabindex="-1"
      style="width:${Math.max(shown.length, 2) + 0.6}ch"
      inputmode="decimal" autocomplete="off" aria-label="${t(row.key)}"><span class="nc-sign">${sign}</span>${suffix ? `<span class="nc-suffix">${suffix}</span>` : ''}
      <button type="button" class="nc-edit" data-edit="${row.key}" aria-label="${t('edit')} ${t(row.key)}">${t('edit')}</button></span>
    ${sourceLine(entry)}${differenceNote(row)}`);
}

// Taxes in force: the rate and its source with the year. They are data rather
// than settings, so there is no number to type over and no difference line.
function taxBlocks() {
  const rates = taxRates[activeType];
  if (!rates) return '';
  const sources = settingsConfig.taxes || {};
  const year = rates.reference_year;
  const ltv = deps.getDcf().ltv;
  const item = (label, rateText, source, suffix = '') => block(`<span class="nc-name">${label}</span>
    <span class="nc-numline nc-static">${rateText}${suffix ? `<span class="nc-suffix">${suffix}</span>` : ''}</span>
    ${sourceLine(source, year)}`);

  const parts = [];
  ['transfer_tax', 'corporate_tax', 'vat'].forEach(key => {
    const rate = rates.taxes?.[key];
    if (rate === undefined) return;
    const label = key === 'vat' ? t('vat_tax') : t(key);
    parts.push(item(label, `${fmt(rate * 100, (rate * 100) % 1 === 0 ? 0 : 1)}%`, sources[key]));
  });

  const components = rates.box3_components;
  if (components) {
    const c = components[String(year)] ?? components[Object.keys(components).sort().pop()];
    const rate = Number(c.tax_rate) * (Number(c.implied_roi) - Number(c.implied_interest) * ltv);
    parts.push(item(t('box3'), `${fmt(rate * 100, 2)}%`, sources.box3, `${t('box3_at_ltv')} ${fmt(ltv * 100, 0)}%`));
  }

  if (!parts.length) return '';
  return `<div class="nc-group">${t('groupTaxes')}</div><div class="nc-grid">${parts.join('')}</div>`;
}

// One line with the type's key values, so the closed toggle shows what it holds.
function summary() {
  const dcf = deps.getDcf();
  const pct = (v, d) => `${fmt(v * 100, d)}%`;
  const parts = [`LTV ${pct(dcf.ltv, 0)}`, `${t('spreadShort')} ${pct(dcf.mortgageSpread, 2)}`,
    `${dcf.period} ${t('years')}`];
  return parts.map(esc).join(' · ');
}

function render() {
  const panel = document.getElementById('nc-panel');
  if (!panel || !deps || !activeType) return;

  // Keep an open edit field as it is while the panel redraws around it
  const editing = panel.querySelector('.nc-num:not([readonly])');
  if (editing) return;

  const settingBlocks = rows().map(settingBlock).join('');

  panel.classList.toggle('collapsed', collapsed);
  panel.innerHTML = `
    <button type="button" class="nc-toggle" aria-expanded="${!collapsed}" aria-controls="nc-body">
      <span class="nc-chevron" aria-hidden="true">${collapsed ? '▸' : '▾'}</span>
      <span class="nc-toggle-name">${t('settings')}</span>
      <span class="nc-summary">${summary()}</span>
      <span class="nc-action">${collapsed ? t('showDetails') : t('hideDetails')} ${collapsed ? '↓' : '↑'}</span>
    </button>
    <div class="nc-body" id="nc-body">
      <div class="nc-group">${t('groupDcf')}</div>
      <div class="nc-grid">${settingBlocks}</div>
      ${taxBlocks()}
    </div>`;

  bind(panel);
}

function bind(panel) {
  panel.querySelector('.nc-toggle').addEventListener('click', () => {
    collapsed = !collapsed;
    try { localStorage.setItem('investorPanelCollapsed', collapsed ? '1' : '0'); } catch (e) { /* not stored */ }
    render();
  });

  panel.querySelectorAll('.nc-edit').forEach(button => {
    button.addEventListener('click', () => {
      const input = panel.querySelector(`.nc-num[data-key="${button.getAttribute('data-edit')}"]`);
      startEdit(input, button);
    });
  });

  panel.querySelectorAll('.nc-num').forEach(input => {
    input.addEventListener('click', () => {
      if (input.readOnly) startEdit(input, panel.querySelector(`.nc-edit[data-edit="${input.dataset.key}"]`));
    });
  });
}

function startEdit(input, button) {
  if (!input || !input.readOnly) return;
  const row = rows().find(r => r.key === input.dataset.key);
  const original = input.value;
  input.readOnly = false;
  input.tabIndex = 0;
  button?.setAttribute('aria-pressed', 'true');
  input.focus();
  input.select();

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    input.readOnly = true;
    input.tabIndex = -1;
    button?.setAttribute('aria-pressed', 'false');
    if (save && input.value !== original) {
      const ok = await commit(row, input.value);
      if (!ok) {
        input.value = original;
        input.title = t('invalid');
      }
    } else {
      input.value = original;
    }
    render();
  };

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}
