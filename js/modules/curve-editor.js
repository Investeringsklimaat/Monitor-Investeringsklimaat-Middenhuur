// curve-editor.js - Per-year values of one parameter as a line you edit on the
// chart, in place of the row of vertical sliders.
//
// An input control, kept quiet next to the IRR chart: a thin grey line for the
// data as published, small handles for the values the model uses, and only the
// edited years in dark ink with the gap shaded. Press a handle and drag to move
// that year; keep the button down and move sideways to draw the course over
// several years; double-click a handle to give it back its published value.
// Under each handle its value is always an editable number: Tab moves to the
// next year, Enter applies.
//
// Same interface as the VerticalSliders it replaces (setData, getValues,
// resetValues), so every edit goes through the existing time-variant path
// (/apply_parameter_changes) and the results are the ones the sliders gave.

import i18n from '../i18n.js';
import { MONO } from './theme.js';
import { watchSize } from './utils.js';

const INK = '#1a1a1a';
const MUTED = '#9a9a9a';
const LINE = '#7a7a7a';

// Range, rounding and display per parameter, in the units the server sends
// (CPB inflation as a decimal, the rest as shown).
const SPECS = {
  mortgage_rate: { min: 0, max: 15, round: 0.01, decimals: 2, unit: '%', scale: 1 },
  monthly_rent: { min: 300, max: 4000, round: 1, decimals: 0, unit: '€', scale: 1 },
  cpb_inflation: { min: -0.02, max: 0.15, round: 0.001, decimals: 1, unit: '%', scale: 100 },
  property_price: { min: 50000, max: 1500000, round: 500, decimals: 0, unit: '€', scale: 1 },
  transfer_tax: { min: 0, max: 20, round: 0.1, decimals: 1, unit: '%', scale: 1 },
};
const FALLBACK = { min: -1e9, max: 1e9, round: 0.01, decimals: 2, unit: '', scale: 1 };

// px from a point that counts as pressing it; wider for a finger
const HIT_RADIUS = window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 26 : 16;

export class CurveEditor {
  constructor(container, onValueChange, getOriginal) {
    this.container = container;
    this.onValueChange = onValueChange;
    this.getOriginal = getOriginal;
    this.years = [];
    this.values = [];
    this.paramType = '';
    this.chart = null;
    this.drag = null;
    this.frozenRange = null;
    this.inputs = [];

    document.addEventListener('languageChanged', () => this.draw());
  }

  spec() {
    return SPECS[this.paramType] || FALLBACK;
  }

  original() {
    const values = this.getOriginal ? this.getOriginal() : null;
    return values && values.length === this.values.length ? values : [...this.values];
  }

  setData(years, values, paramType) {
    this.years = [...years];
    this.values = [...values];
    this.paramType = paramType;
    this.frozenRange = null;
    this.ensureChart();
    this.buildInputs();
    this.draw(true);
  }

  getValues() {
    return [...this.values];
  }

  // The years the reader actually moved, and nothing else. What the editor
  // holds for the other years is the data as it was when the editor read it,
  // and sending that back would pin it: a data choice made in the meantime
  // would be overwritten by a series the reader never touched.
  edits() {
    const published = this.original();
    const years = [];
    const values = [];
    this.years.forEach((year, i) => {
      const was = published[i];
      if (!Number.isFinite(this.values[i])) return;
      if (Number.isFinite(was) && Math.abs(this.values[i] - was) < 1e-9) return;
      years.push(year);
      values.push(this.values[i]);
    });
    return { years, values };
  }

  resetValues(originalValues) {
    this.values = [...originalValues];
    this.frozenRange = null;
    this.draw();
  }

  // ---------- drawing ----------

  ensureChart() {
    if (this.chart) return;
    this.container.innerHTML = '';
    this.container.classList.add('curve-editor');
    const el = document.createElement('div');
    el.className = 'curve-editor-chart';
    this.container.appendChild(el);
    this.row = document.createElement('div');
    this.row.className = 'curve-editor-values';
    this.container.appendChild(this.row);
    this.chart = echarts.init(el, null, { renderer: 'canvas' });
    watchSize(el, () => {
      if (!this.chart) return;
      this.chart.resize();
      this.placeInputs();
    });
    this.bind();
  }

  display(v) {
    const s = this.spec();
    return v * s.scale;
  }

  range() {
    if (this.frozenRange) return this.frozenRange;
    const s = this.spec();
    const all = [...this.values, ...this.original()].filter(Number.isFinite).map(v => v * s.scale);
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.2 || 1;
    lo = Math.max(s.min * s.scale, lo - pad);
    hi = Math.min(s.max * s.scale, hi + pad);
    if (s.unit === '%' && lo > 0 && lo < pad * 2) lo = 0;
    return { lo, hi };
  }

  edited(i) {
    const o = this.original()[i];
    return Math.abs(this.values[i] - o) > this.spec().round / 2;
  }

  option() {
    const orig = this.original().map(v => this.display(v));
    const cur = this.values.map(v => this.display(v));
    const { lo, hi } = this.range();

    return {
      animation: false,
      textStyle: { fontFamily: MONO },
      grid: { left: 52, right: 12, top: 10, bottom: 6 },
      tooltip: { show: false },
      xAxis: {
        type: 'category',
        data: this.years.map(String),
        boundaryGap: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: lo,
        max: hi,
        scale: true,
        splitNumber: 3,
        axisLine: { show: false },
        axisLabel: {
          color: '#9a9a9a', fontFamily: MONO, fontSize: 10,
          formatter: v => this.spec().unit === '€' ? Math.round(v).toLocaleString('nl-NL') : `${+v.toFixed(2)}%`,
        },
        splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.05)' } },
      },
      series: [
        {
          // The gap between published and used values, shaded per segment
          id: 'gap',
          type: 'custom',
          silent: true,
          z: 1,
          data: cur.slice(0, -1).map((_, i) => i),
          renderItem: (params, api) => {
            const i = api.value(0);
            return {
              type: 'polygon',
              shape: { points: [api.coord([i, orig[i]]), api.coord([i + 1, orig[i + 1]]),
                api.coord([i + 1, cur[i + 1]]), api.coord([i, cur[i]])] },
              style: { fill: 'rgba(26, 26, 26, 0.07)' },
            };
          },
          encode: { x: 0 },
        },
        {
          id: 'orig',
          type: 'line',
          z: 2,
          silent: true,
          data: orig,
          symbol: 'none',
          lineStyle: { width: 1.5, color: '#c4c4c4' },
        },
        {
          id: 'edit',
          type: 'line',
          z: 5,
          data: cur.map((v, i) => this.edited(i)
            ? { value: v, symbol: 'circle', symbolSize: 9, itemStyle: { color: INK, borderColor: '#fff', borderWidth: 1.5 } }
            : { value: v, symbol: 'circle', symbolSize: 7, itemStyle: { color: '#fff', borderColor: MUTED, borderWidth: 1.5 } }),
          showAllSymbol: true,
          lineStyle: { width: 1.5, color: LINE },
          emphasis: { scale: 1.3 },
          cursor: 'ns-resize',
        },
      ],
    };
  }

  // ---------- the numbers under the handles ----------

  buildInputs() {
    this.row.innerHTML = '';
    const s = this.spec();
    this.inputs = this.years.map((year, i) => {
      const cell = document.createElement('label');
      cell.className = 'curve-editor-cell';
      const input = document.createElement('input');
      input.className = 'curve-editor-num';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.setAttribute('aria-label', `${year}`);
      const yearLabel = document.createElement('span');
      yearLabel.className = 'curve-editor-year';
      yearLabel.textContent = year;
      cell.appendChild(input);
      cell.appendChild(yearLabel);
      this.row.appendChild(cell);

      const apply = () => {
        const v = parseFloat(input.value.replace(',', '.').replace(/[€%\s]/g, ''));
        if (!Number.isFinite(v)) { this.updateInputs(true); return; }
        const next = this.clampRound(v / s.scale);
        if (Math.abs(next - this.values[i]) < s.round / 2) { this.updateInputs(true); return; }
        this.values[i] = next;
        this.draw();
        this.changed();
      };
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); apply(); input.select(); }
        if (e.key === 'Escape') { e.preventDefault(); this.updateInputs(true); input.select(); }
      });
      input.addEventListener('change', apply);
      input.addEventListener('focus', () => input.select());
      return input;
    });
  }

  updateInputs(force = false) {
    const s = this.spec();
    const locale = i18n.getCurrentLanguage() === 'nl' ? 'nl-NL' : 'en-GB';
    this.inputs.forEach((input, i) => {
      input.classList.toggle('edited', this.edited(i));
      if (!force && document.activeElement === input) return;
      input.value = (this.values[i] * s.scale).toLocaleString(locale,
        { minimumFractionDigits: s.decimals, maximumFractionDigits: s.decimals, useGrouping: false });
    });
  }

  placeInputs() {
    if (!this.chart || !this.inputs.length) return;
    this.inputs.forEach((input, i) => {
      const [x] = this.chart.convertToPixel('grid', [i, 0]);
      input.parentElement.style.left = `${x}px`;
    });
  }

  draw(full = false) {
    if (!this.chart || !this.years.length) return;
    this.chart.setOption(this.option(), full);
    this.updateInputs();
    if (full) this.placeInputs();
  }

  // ---------- editing ----------

  // Pixel → [year index, value in the server's units], or null outside the plot
  fromPixel(x, y) {
    if (!this.chart.containPixel('grid', [x, y])) return null;
    const [ix, v] = this.chart.convertFromPixel('grid', [x, y]);
    const i = Math.max(0, Math.min(this.years.length - 1, Math.round(ix)));
    return [i, v / this.spec().scale];
  }

  // The point under the pointer, by distance to the drawn points
  hit(x, y) {
    let best = -1;
    let bestD = HIT_RADIUS;
    this.values.forEach((v, i) => {
      const [px, py] = this.chart.convertToPixel('grid', [i, this.display(v)]);
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  clampRound(v) {
    const s = this.spec();
    const r = Math.round(v / s.round) * s.round;
    return +Math.max(s.min, Math.min(s.max, r)).toFixed(6);
  }

  set(i, v) {
    this.values[i] = this.clampRound(v);
  }

  changed() {
    if (this.onValueChange) this.onValueChange(this.getValues());
  }

  bind() {
    const zr = this.chart.getZr();

    zr.on('mousedown', e => {
      const i = this.hit(e.offsetX, e.offsetY);
      if (i < 0) return;
      this.frozenRange = this.range();
      this.drag = { last: i, moved: false, start: [e.offsetX, e.offsetY] };
    });

    zr.on('mousemove', e => {
      if (!this.drag) {
        zr.setCursorStyle(this.hit(e.offsetX, e.offsetY) >= 0 ? 'ns-resize' : 'default');
        return;
      }
      const p = this.fromPixel(e.offsetX, Math.max(this.chart.convertToPixel('grid', [0, this.frozenRange.hi])[1],
        Math.min(this.chart.convertToPixel('grid', [0, this.frozenRange.lo])[1], e.offsetY)));
      if (!p) return;
      if (!this.drag.moved && Math.hypot(e.offsetX - this.drag.start[0], e.offsetY - this.drag.start[1]) < 3) return;
      this.drag.moved = true;
      const [i, v] = p;
      const from = this.drag.last;
      // Sideways: draw the course from the last year to this one
      if (i !== from) {
        const v0 = this.values[from];
        const step = i > from ? 1 : -1;
        for (let k = from + step; k !== i + step; k += step) {
          this.set(k, v0 + (v - v0) * (k - from) / (i - from));
        }
      } else {
        this.set(i, v);
      }
      this.drag.last = i;
      this.draw();
      this.changed();
    });

    const end = () => {
      if (!this.drag) return;
      const { last } = this.drag;
      this.drag = null;
      this.frozenRange = null;
      this.draw();
      if (this.inputs[last]) this.inputs[last].classList.add('flash');
      setTimeout(() => this.inputs[last] && this.inputs[last].classList.remove('flash'), 400);
    };
    zr.on('mouseup', end);
    zr.on('globalout', end);

    zr.on('dblclick', e => {
      const i = this.hit(e.offsetX, e.offsetY);
      if (i < 0 || !this.edited(i)) return;
      this.values[i] = this.original()[i];
      this.draw();
      this.changed();
    });
  }
}
