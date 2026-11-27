// data-page.js - the Data tab, in reading order: how the investor types differ
// and what they earn, then every value the types share, per year, with its
// source and what kind of figure it is. A sticky bar lists the two sections and
// marks the one in view. The spreadsheet download is made from the same tables.

import i18n from '../i18n.js';
import { esc } from './utils.js';
import { registryPayload, investorTypesPayload, comparisonRows, valueRows } from './data-registry.js';
import { download } from './xlsx.js';

const t = key => i18n.t(key);
const lang = () => i18n.getCurrentLanguage();
const pick = obj => (obj && (obj[lang()] || obj.en)) || '';

let REG = null, IC = null, root = null, tip = null;
let icYear = null, topButton = null;

const SECTIONS = [
  ['dp-types', 'Investor types'],
  ['dp-values', 'Values per year'],
];

function fmt(series, v) {
  if (v === null || v === undefined) return '';
  const locale = lang() === 'nl' ? 'nl-NL' : 'en-GB';
  return Number(v).toLocaleString(locale,
    { minimumFractionDigits: series.decimals, maximumFractionDigits: series.decimals });
}
// A change in percentage points, signed: "+0,12 pp", "−0,40 pp".
function fmtPp(v) {
  const locale = lang() === 'nl' ? 'nl-NL' : 'en-GB';
  const n = Math.abs(v).toLocaleString(locale,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${n} pp`;
}
const unitLabel = s => (s.unit === 'EUR' ? '€' : s.unit);

function load() {
  REG = registryPayload();
  IC = investorTypesPayload(icYear ?? REG.years[REG.years.length - 1]);
  icYear = IC.year;
}

// Investor types side by side: only the inputs that differ between types (the
// shared ones are in "Values per year"), then each type's IRR. Under each value
// that differs from the first type, that input's own effect on the type's IRR.
// The CAPM norm is the same for every type and is given once, in the heading.
function icFmt(row, v) {
  if (v === null || v === undefined) return '—';
  const locale = lang() === 'nl' ? 'nl-NL' : 'en-GB';
  return Number(v).toLocaleString(locale,
    { minimumFractionDigits: row.decimals, maximumFractionDigits: row.decimals });
}
const icUnit = u => (u === 'EUR' ? '€' : (u === 'yrs' ? t('yrs') : u));

function icEffect(v) {
  const base = IC.types.find(x => x.id === IC.base);
  return `${fmtPp(v)} ${t('vs')} ${esc(pick(base.label))}`;
}

function icCellClass(c) {
  return c.value === null || c.value === undefined ? 'ic-na' : (c.status ? `st-${c.status}` : '');
}

function renderInvestorTypes() {
  if (!IC || !IC.rows) return '';
  const types = IC.types;
  const years = IC.years.map(y =>
    `<option value="${y}"${y === IC.year ? ' selected' : ''}>${y}</option>`).join('');
  const norm = IC.rows.find(r => r.id === 'norm');
  const normValue = norm ? norm.cells[types[0].id].value : null;
  const head = `<tr><th class="dp-name"></th><th class="dp-unit"></th>${
    types.map(x => `<th>${esc(pick(x.label))}</th>`).join('')}</tr>`;
  const body = IC.groups.map(g => {
    const rows = IC.rows.filter(r => r.group === g.id && r.id !== 'norm'
      && (r.differs || r.id === 'irr'));
    if (!rows.length) return '';
    const trs = rows.map(r => {
      const base = r.cells[IC.base];
      const tds = types.map(x => {
        const c = r.cells[x.id];
        const off = r.id !== 'irr' && x.id !== IC.base
          && (c.value ?? null) !== (base.value ?? null);
        const eff = c.effect !== undefined && c.effect !== null
          ? `<small class="ic-eff">${icEffect(c.effect)}</small>` : '';
        return `<td class="ic-cell ${icCellClass(c)}${off ? ' ic-off' : ''}" data-ic-row="${r.id}"`
          + ` data-ic-type="${x.id}"><span>${esc(icFmt(r, c.value))}</span>${eff}</td>`;
      }).join('');
      return `<tr class="${r.id === 'irr' ? 'ic-res' : 'ic-diff'}"><th class="dp-name">`
        + `<span>${esc(pick(r.label))}</span></th><td class="dp-unit">${esc(icUnit(r.unit))}</td>${tds}</tr>`;
    }).join('');
    return `<tr class="dp-group"><th colspan="${types.length + 2}">${esc(pick(g.label))}</th></tr>${trs}`;
  }).join('');
  return `<section class="dp-section" id="dp-types">
    <h3>${t('Investor types')}
      <select class="ic-year" aria-label="${t('Year')}">${years}</select>
      ${normValue !== null && normValue !== undefined
    ? `<span class="ic-norm">${t('CAPM norm')} <b>${esc(icFmt({ decimals: 2 }, normValue))}%</b></span>`
    : ''}</h3>
    <div class="dp-table-wrap"><table class="dp-table ic-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
  </section>`;
}

function showIcTip(td, ev) {
  const r = IC.rows.find(x => x.id === td.dataset.icRow);
  const ids = td.dataset.icType ? [td.dataset.icType] : IC.types.map(x => x.id);
  const c0 = r.cells[ids[0]];
  const sources = ids.map(id => pick(r.cells[id].source));
  const alike = sources.every(s => s === sources[0]);
  const status = c0.status ? ` · ${t(c0.status)}` : '';
  const typeName = td.dataset.icType
    ? ` · ${esc(pick(IC.types.find(x => x.id === td.dataset.icType).label))}` : '';
  const srcHtml = alike
    ? (sources[0] ? `<div>${t('Source')}: ${esc(sources[0])}, ${IC.year}</div>` : '')
    : ids.map((id, i) => (sources[i]
      ? `<div><b>${esc(pick(IC.types.find(x => x.id === id).label))}</b>: ${t('Source')}: `
        + `${esc(sources[i])}, ${IC.year}</div>` : '')).join('');
  tip.innerHTML = `<b>${esc(pick(r.label))} · ${IC.year}${typeName}</b>
    <div>${esc(icFmt(r, c0.value))} ${esc(icUnit(r.unit))}${status}</div>${srcHtml}
    ${c0.effect !== undefined && c0.effect !== null && td.dataset.icType
    ? `<div class="dp-tip-chg">${icEffect(c0.effect)}</div>` : ''}`;
  tip.hidden = false;
  placeTip(ev);
}

function seriesById(id) { return REG.series.find(s => s.id === id); }

function cellClass(s, y) {
  const v = s.values[y];
  if (v === null || v === undefined) return 'dp-empty';
  return `st-${s.status[y] || 'actual'}`;
}

function renderTable() {
  const years = REG.years.map(String);
  const head = `<tr><th class="dp-name">${t('Series')}</th><th class="dp-unit">${t('Unit')}</th>${
    years.map(y => `<th>${y}</th>`).join('')}</tr>`;
  const body = REG.groups.map(g => {
    const rows = REG.series.filter(s => s.group === g.id).map(s => {
      const cells = years.map(y =>
        `<td class="${cellClass(s, y)}" data-series="${s.id}" data-year="${y}">${
          esc(fmt(s, s.values[y]))}</td>`).join('');
      return `<tr><th class="dp-name"><span>${esc(pick(s.label))}</span>${
        s.source && s.source.name
          ? `<small class="dp-src">${t('Source')}: ${esc(s.source.name)}</small>` : ''
      }</th><td class="dp-unit">${esc(unitLabel(s))}</td>${cells}</tr>`;
    }).join('');
    return `<tr class="dp-group"><th colspan="${years.length + 2}">${esc(pick(g.label))}</th></tr>${rows}`;
  }).join('');
  return `<section class="dp-section" id="dp-values">
    <h3>${t('Values per year')}</h3>
    <div class="dp-table-wrap"><table class="dp-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
  </section>`;
}

// Sticky bar: the sections, the one in view marked; the download at the right.
function renderNav() {
  const links = SECTIONS.map(([id, key]) =>
    `<a href="#${id}" class="dp-nav-link" data-section="${id}">${t(key)}</a>`).join('');
  return `<nav class="dp-nav" aria-label="${t('Data')}">
    <div class="dp-nav-links">${links}</div>
    <div class="dp-nav-meta"><button type="button" class="dp-download" data-download>Excel ↓</button></div>
  </nav>`;
}

// Whose work this is and where the data comes from, under the last table. It
// is drawn with the rest, so it follows the language the reader picked.
function renderCredits() {
  return `<p class="dp-credits">${esc(t('credits'))}</p>`;
}

function render() {
  if (!root || !REG) return;
  root.innerHTML = `
    ${renderNav()}
    ${renderInvestorTypes()}
    ${renderTable()}
    ${renderCredits()}`;
  markSection();
}

function saveWorkbook() {
  const l = lang();
  const [name, rows] = comparisonRows(icYear, l);
  const types = IC.types.length;
  const values = valueRows(l);
  download([
    ['Data', values, [18, 40, 8, 40, 36].concat(REG.years.map(() => 10))],
    [name, rows, [18, 44, 7].concat(
      Array(types).fill(14), Array(Math.max(0, types - 1)).fill(22), [90])],
  ], 'Monitor-Investeringsklimaat-Middenhuur.xlsx');
}

function navOffset() {
  const nav = root && root.querySelector('.dp-nav');
  return nav ? nav.offsetHeight + 8 : 0;
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - navOffset(),
    behavior: 'smooth' });
}

// Mark the section whose top has passed under the bar; at the very bottom, the last.
function markSection() {
  if (!root || !root.offsetParent) { if (topButton) topButton.hidden = true; return; }
  const offset = navOffset() + 4;
  let current = SECTIONS[0][0];
  SECTIONS.forEach(([id]) => {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top - offset <= 0) current = id;
  });
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) {
    current = SECTIONS[SECTIONS.length - 1][0];
  }
  root.querySelectorAll('.dp-nav-link')
    .forEach(a => a.classList.toggle('on', a.dataset.section === current));
  const link = root.querySelector('.dp-nav-link.on');
  if (link) link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (topButton) topButton.hidden = scrollY < 500;
}

function showTip(td, ev) {
  const s = seriesById(td.dataset.series);
  const y = td.dataset.year;
  const v = s.values[y];
  if (v === null || v === undefined) return hideTip();
  tip.innerHTML = `<b>${esc(pick(s.label))} · ${y}</b><div>${esc(fmt(s, v))} ${
    esc(unitLabel(s))} · ${t(s.status[y] || 'actual')}</div>
    ${s.source && s.source.name ? `<div>${t('Source')}: ${esc(s.source.name)}, ${y}</div>` : ''}`;
  tip.hidden = false;
  return placeTip(ev);
}

function placeTip(ev) {
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let x = ev.clientX + 14;
  let yy = ev.clientY + 14;
  if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
  if (yy + h > innerHeight - 8) yy = ev.clientY - h - 14;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, yy)}px`;
}

function hideTip() { if (tip) tip.hidden = true; }

function bind() {
  root.addEventListener('click', e => {
    if (e.target.closest('[data-download]')) { saveWorkbook(); return; }
    const link = e.target.closest('.dp-nav-link');
    if (link) { e.preventDefault(); scrollToSection(link.dataset.section); }
  });
  root.addEventListener('change', e => {
    if (e.target.matches('.ic-year')) {
      icYear = Number(e.target.value);
      IC = investorTypesPayload(icYear);
      render();
    }
  });
  root.addEventListener('mousemove', e => {
    const td = e.target.closest('td[data-series]');
    if (td) return showTip(td, e);
    const ic = e.target.closest('td[data-ic-row]');
    if (ic) return showIcTip(ic, e);
    return hideTip();
  });
  root.addEventListener('mouseleave', hideTip);
  document.addEventListener('languageChanged', render);
  window.addEventListener('scroll', () => requestAnimationFrame(markSection), { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(markSection));

  // Back to top: shown on the Data tab once the reader has scrolled down
  topButton = document.createElement('button');
  topButton.type = 'button';
  topButton.className = 'dp-top';
  topButton.hidden = true;
  topButton.textContent = '↑';
  topButton.setAttribute('aria-label', t('Back to top'));
  topButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(topButton);
  // Leaving the Data tab hides it
  document.querySelectorAll('.tab-button')
    .forEach(btn => btn.addEventListener('click', () => requestAnimationFrame(markSection)));
}

export async function showDataPage() {
  if (!root) {
    root = document.getElementById('data-page');
    tip = document.createElement('div');
    tip.className = 'dp-tip';
    tip.hidden = true;
    document.body.appendChild(tip);
    bind();
    root.innerHTML = '<p class="dp-sub">…</p>';
  }
  load();
  render();
}
