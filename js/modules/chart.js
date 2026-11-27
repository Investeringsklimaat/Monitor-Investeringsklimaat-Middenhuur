// chart.js - Main IRR chart, drawn with ECharts.
//
// Same elements as before: the blue IRR line with its points, the red CAPM
// norm, the grey dashed reference (the default investor type at its defaults,
// shown only once the IRR line departs from it), the legend, the line/box
// toggle and the dot cloud. Only the drawing changed; every number comes from
// the engine exactly as it did with Chart.js.
//
// The 3-year window tab draws with the same colours and font (COLORS, MONO,
// in theme.js).

import i18n from '../i18n.js';
import { COLORS, MONO } from './theme.js';
import { watchSize } from './utils.js';

// Which view the chart draws: 'line' or 'boxplot'. The page sets it with the
// toggle above the chart.
let view = 'line';

// Stops watching the chart's container for size changes.
let stopWatchingSize = null;

export function setView(value) {
  view = value;
}

export function getView() {
  return view;
}

// The cloud is drawn from a fixed seed so it keeps its shape between renders
// and can glide with the line instead of being reshuffled on every update.
const CLOUD_SEED = 20261016;
const CLOUD_LAYERS = 50;
// How far the dots lie from the line, against the cloud as first drawn. Only
// the picture: the line, the norm and every number from the engine are not
// touched by it.
const CLOUD_SCALE = 0.75;

// 0-14% holds every investor type at its defaults, so switching type never
// rescales the axis. Data that runs past it (a hard time-variant edit) widens
// the axis rather than being clipped.
const Y_MAX_BASE = 14;

let chart = null;
let years = [];
let irrValues = [];
let capmValues = [];
let originalIRRData = null;
// Lines drawn beside the settled defaults, never in place of them: the market
// once events are in force, and the Plan tab's own investment. Same colours and
// styles, at a lower opacity, and without the dot cloud.
let planValues = null;
let eventIrrValues = null;
let eventCapmValues = null;
const SIDE_OPACITY = 0.45;
// The checkbox in the legend. It is there only while there is a line of the
// reader's own to show, it is on until the reader says otherwise, and it holds
// its answer through every recalculation for as long as the page is open.
let customShown = true;
let holdingLegend = false;

// The checkbox, drawn as the legend item's own mark: a box with the line's
// colour inside it, or an empty one, and the line's dot beside it. It is drawn
// in the room one mark has, so the legend keeps its spacing.
const BOX = 'M0,0.75h7.5v7.5h-7.5z M1.1,1.85v5.3h5.3v-5.3z';
const TICK = ' M2.3,3.05h2.9v2.9h-2.9z';
const DOT = ' M9,4.5a1.5,1.5 0 1,0 3,0a1.5,1.5 0 1,0 -3,0';
const CHECKBOX = { on: `path://${BOX}${TICK}${DOT}`, off: `path://${BOX}${DOT}` };
let layers = null;
let renderedView = null;
let highlightedYear = null;

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The same cloud the Chart.js version generated (generateIRRDistribution):
// 50 layers, each one a layer spread of up to +/-4 points weighted into a tent
// by layer number, plus +/-1 noise and a +/-1.5 sine wave, offset from the IRR
// line. The only change is the seeded generator. Per-dot size, shape and a
// small horizontal dodge in pixels are drawn here too, so the dots keep their
// look while their values move.
function buildLayers(yearCount) {
  const rand = mulberry32(CLOUD_SEED);
  const n = CLOUD_LAYERS;

  return Array.from({ length: n }, (_, i) => {
    const spread = (rand() - 0.5) * 8;
    const size = 4 + rand() * 5;
    const symbol = rand() > 0.7 ? 'diamond' : 'circle';
    const offsets = [];
    const dodge = [];

    for (let index = 0; index < yearCount; index++) {
      const base = spread * (1 - Math.abs(i - n / 2) / (n / 2));
      const noise = (rand() - 0.5) * 2;
      const wave = Math.sin(i * 0.3 + index * 0.2) * 1.5;
      offsets.push(base + noise + wave);
      dodge.push((rand() - 0.5) * 14);
    }

    return { size, symbol, offsets, dodge };
  });
}

function ensureLayers() {
  if (!layers || layers.length === 0 || layers[0].offsets.length !== years.length) {
    layers = buildLayers(years.length);
  }
  return layers;
}

// samples[yearIndex][layerIndex]
function cloudSamples() {
  const ls = ensureLayers();
  return years.map((_, y) => ls.map(layer => irrValues[y] + CLOUD_SCALE * layer.offsets[y]));
}

function quantile(sorted, p) {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Box statistics come from the same 50 cloud points, so the boxes describe the
// dots the user just saw instead of a second, unrelated random draw.
function stats(values) {
  const s = [...values].sort((a, b) => a - b);
  return {
    min: s[0],
    q1: quantile(s, 0.25),
    med: quantile(s, 0.5),
    q3: quantile(s, 0.75),
    max: s[s.length - 1]
  };
}

// The dashed benchmark is shown only once the IRR line departs from it, which
// is the rule the Chart.js version used.
function referenceShown() {
  if (!originalIRRData || !originalIRRData.length) return false;
  return irrValues.some((val, idx) => Math.abs(val - (originalIRRData[idx] || 0)) > 0.01);
}

// A side line is drawn only once there is something to draw that is not
// already the default line.
const hasValues = v => Array.isArray(v) && v.some(x => Number.isFinite(x));
const departs = (values, from) => hasValues(values)
  && values.some((v, i) => Number.isFinite(v) && Math.abs(v - (from[i] ?? 0)) > 0.005);

// Nothing is added to the chart until it would say something the default line
// does not: a plan with no changes, or events that miss every holding window,
// draw no line at all.
function planShown() { return departs(planValues, irrValues); }
function eventIrrShown() { return departs(eventIrrValues, irrValues); }
function eventCapmShown() { return customShown && departs(eventCapmValues, capmValues); }

// Events and a plan are both the reader's own doing, so the chart carries one
// line for them, not two: the plan where there is one, since a plan is already
// priced with the market events in force, and the events alone where there is
// not. It keeps the look it has always had in either case — the plan's own
// colour, or the IRR line's colour beside the IRR line.
function customCurve() {
  if (planShown()) return { values: planValues, color: COLORS.plan, opacity: 0.95, width: 2.5 };
  if (eventIrrShown()) {
    return { values: eventIrrValues, color: COLORS.irr, opacity: SIDE_OPACITY, width: 3.5 };
  }
  return null;
}

// What is drawn: the line there is to draw, unless the checkbox says no.
function customIrr() { return customShown ? customCurve() : null; }

function yMax() {
  const lineValues = [
    ...irrValues.filter(v => Number.isFinite(v)),
    ...capmValues.filter(v => Number.isFinite(v)),
    ...(originalIRRData || []).filter(v => Number.isFinite(v))
    // The plan's line and the lines with events are additions. They are clipped
    // by the axis the default lines set rather than rescaling it: the chart the
    // page has always drawn stays where it is.
  ];
  if (!lineValues.length) return Y_MAX_BASE;
  return Math.max(Y_MAX_BASE, Math.ceil(Math.max(...lineValues) * 1.15 / 2) * 2);
}

const fmt = v => `${Number(v).toFixed(2)}%`;

const marker = (color, dashed) => dashed
  ? `<span style="display:inline-block;width:14px;border-top:2px dashed ${color};margin:0 8px 3px 0"></span>`
  : `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin:0 10px 1px 3px"></span>`;

const row = (left, right) =>
  `<div style="display:flex;justify-content:space-between;gap:24px;line-height:1.75">${left}<b style="font-weight:500;color:#fff">${right}</b></div>`;

function tooltipHtml(index) {
  const year = years[index];
  const capm = capmValues[index];
  const lines = [`<div style="font-weight:600;color:#fff;margin-bottom:4px">${year}</div>`];

  if (view === 'boxplot') {
    const s = stats(cloudSamples()[index]);
    lines.push(row(`<span>${marker(COLORS.irr)}Max</span>`, fmt(s.max)));
    lines.push(row('<span style="padding-left:21px">Q3</span>', fmt(s.q3)));
    lines.push(row(`<span style="padding-left:21px">${i18n.t('Median')}</span>`, fmt(s.med)));
    lines.push(row('<span style="padding-left:21px">Q1</span>', fmt(s.q1)));
    lines.push(row('<span style="padding-left:21px">Min</span>', fmt(s.min)));
    if (Number.isFinite(capm)) {
      lines.push(row(`<span>${marker(COLORS.capm)}${i18n.t('CAPM Norm')}</span>`, fmt(capm)));
    }
    return lines.join('');
  }

  const irr = irrValues[index];
  lines.push(row(`<span>${marker(COLORS.irr)}${i18n.t('Expected IRR')}</span>`, fmt(irr)));
  if (Number.isFinite(capm)) {
    lines.push(row(`<span>${marker(COLORS.capm)}${i18n.t('CAPM Norm')}</span>`, fmt(capm)));
  }
  if (referenceShown()) {
    lines.push(row(`<span>${marker(COLORS.ref, true)}${i18n.t('Reference IRR')}</span>`,
      fmt(originalIRRData[index])));
  }
  const custom = customIrr();
  if (custom && Number.isFinite(custom.values[index])) {
    lines.push(row(`<span>${marker(custom.color)}${i18n.t('IRR with customized DCF')}</span>`,
      fmt(custom.values[index])));
  }
  if (eventCapmShown() && Number.isFinite(eventCapmValues[index])) {
    lines.push(row(`<span>${marker(COLORS.capm)}${i18n.t('CAPM norm with customized DCF')}</span>`,
      fmt(eventCapmValues[index])));
  }
  if (Number.isFinite(capm) && Number.isFinite(irr)) {
    const spread = irr - capm;
    lines.push('<div style="border-top:1px solid rgba(255,255,255,.12);margin:6px 0 2px"></div>');
    lines.push(row('<span>IRR − CAPM</span>',
      `<span style="color:${spread >= 0 ? '#56b4e9' : '#e69f00'}">${spread >= 0 ? '+' : '−'}${Math.abs(spread).toFixed(2)} pt</span>`));
  }
  return lines.join('');
}

// One scatter series per year, so the universal transition can merge that
// year's dots into its box and split them back out again.
function cloudSeries(samples) {
  return years.map((year, y) => {
    const ranked = samples[y].map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const rank = [];
    ranked.forEach(([, i], r) => { rank[i] = r; });
    const mid = (samples[y].length - 1) / 2;

    return {
      id: `cloud-${year}`,
      name: `IRR Distribution ${year}`,
      type: 'scatter',
      dataGroupId: String(year),
      universalTransition: { enabled: true, divideShape: 'clone' },
      z: 1,
      clip: true,
      silent: false,
      emphasis: { scale: false, itemStyle: { opacity: 0.8 } },
      animationDelay: i => 250 + y * 45 + i * 3,
      data: samples[y].map((v, i) => {
        const layer = layers[i % layers.length];
        const k = mid > 0 ? Math.abs(rank[i] - mid) / mid : 0;
        return {
          value: [y, v],
          symbol: layer.symbol,
          symbolSize: layer.size,
          symbolOffset: [layer.dodge[y], 0],
          // Denser through the middle of the year's range, fading to the tails
          itemStyle: { color: COLORS.irr, opacity: +(0.08 + 0.42 * Math.pow(1 - k, 1.5)).toFixed(3) }
        };
      })
    };
  });
}

function lineSeries() {
  const refShown = referenceShown();
  const custom = customIrr();

  return [
    {
      id: 'irr',
      name: i18n.t('Expected IRR'),
      type: 'line',
      z: 5,
      data: irrValues,
      symbol: 'circle',
      symbolSize: 9,
      showAllSymbol: true,
      itemStyle: { color: COLORS.irr, borderColor: '#fff', borderWidth: 2 },
      lineStyle: { width: 3.5, color: COLORS.irr, shadowBlur: 12, shadowColor: 'rgba(0, 114, 178, 0.35)' },
      emphasis: { scale: 1.5, itemStyle: { borderWidth: 3, shadowBlur: 10, shadowColor: 'rgba(0, 114, 178, 0.5)' } },
      animationDuration: 1400
    },
    {
      id: 'capm',
      name: i18n.t('CAPM Norm'),
      type: 'line',
      z: 4,
      data: capmValues,
      symbol: 'circle',
      symbolSize: 7,
      itemStyle: { color: COLORS.capm, borderColor: '#fff', borderWidth: 1.5 },
      lineStyle: { width: 2.5, color: COLORS.capm, shadowBlur: 8, shadowColor: 'rgba(213, 94, 0, 0.22)' },
      emphasis: { scale: 1.4 },
      animationDuration: 1400
    },
    {
      // Kept in the option even when hidden, so a type switch is a plain merge
      // and the line glides instead of being torn down and rebuilt.
      id: 'ref',
      name: i18n.t('Reference IRR'),
      type: 'line',
      z: 3,
      data: originalIRRData || [],
      symbol: 'none',
      silent: true,
      lineStyle: { width: 2, type: [6, 5], color: COLORS.ref, opacity: refShown ? 0.95 : 0 },
      itemStyle: { color: COLORS.ref }
    },
    {
      // The DCF as the reader has set it — their plan, or the market events —
      // beside the default line rather than in place of it. The legend's entry
      // for it is the series below, not this one: a legend mark takes the size
      // of its line's own dots, which leaves no room for a checkbox.
      id: 'irr-custom',
      type: 'line',
      z: 6,
      data: (custom && custom.values) || [],
      symbol: 'circle',
      symbolSize: 7,
      itemStyle: { color: custom ? custom.color : COLORS.plan, borderColor: '#fff',
        borderWidth: 1.5, opacity: custom ? 1 : 0 },
      lineStyle: { width: custom ? custom.width : 2.5, color: custom ? custom.color : COLORS.plan,
        opacity: custom ? custom.opacity : 0 },
      emphasis: { scale: 1.4 }
    },
    {
      id: 'capm-custom',
      name: i18n.t('CAPM norm with customized DCF'),
      type: 'line',
      z: 4,
      data: eventCapmValues || [],
      symbol: 'circle',
      symbolSize: 6,
      itemStyle: { color: COLORS.capm, borderColor: '#fff', borderWidth: 1.5,
        opacity: eventCapmShown() ? SIDE_OPACITY : 0 },
      lineStyle: { width: 2.5, color: COLORS.capm, opacity: eventCapmShown() ? SIDE_OPACITY : 0 },
      emphasis: { scale: 1.3 }
    },
    // Nothing is drawn from this: it carries the name the legend shows for the
    // reader's own line, and with no line of its own the legend gives its mark
    // the whole of the room a mark has — the checkbox and the line's dot.
    ...(customCurve() ? [{
      id: 'irr-custom-key',
      name: i18n.t('IRR with customized DCF'),
      type: 'line',
      data: [],
      silent: true
    }] : [])
  ];
}

function boxSeries(samples) {
  return [
    {
      id: 'box',
      name: i18n.t('IRR Distribution'),
      type: 'boxplot',
      z: 2,
      // seriesKey names every per-year dot series, so each year's dots morph
      // into that year's box and back out again
      universalTransition: {
        enabled: true,
        divideShape: 'clone',
        seriesKey: years.map(year => `cloud-${year}`)
      },
      boxWidth: [10, 22],
      itemStyle: { color: 'rgba(0, 114, 178, 0.10)', borderColor: COLORS.irr, borderWidth: 1.5 },
      emphasis: { itemStyle: { color: 'rgba(0, 114, 178, 0.22)', borderWidth: 2 } },
      data: years.map((year, y) => {
        const s = stats(samples[y]);
        return { value: [s.min, s.q1, s.med, s.q3, s.max], groupId: String(year) };
      })
    },
    {
      id: 'capm',
      name: i18n.t('CAPM Norm'),
      type: 'line',
      z: 4,
      data: capmValues,
      symbol: 'circle',
      symbolSize: 7,
      itemStyle: { color: COLORS.capm, borderColor: '#fff', borderWidth: 1.5 },
      lineStyle: { width: 2.5, color: COLORS.capm, shadowBlur: 8, shadowColor: 'rgba(213, 94, 0, 0.22)' }
    }
  ];
}

function buildOption() {
  const isBox = view === 'boxplot';
  const samples = cloudSamples();

  // Box whiskers may run below 0%; the line view keeps the 0% floor
  const yMin = isBox
    ? Math.min(0, Math.floor(Math.min(...samples.flat()) / 2) * 2)
    : 0;

  const series = isBox ? boxSeries(samples) : [...cloudSeries(samples), ...lineSeries()];

  const legendData = isBox
    ? [
        { name: i18n.t('IRR Distribution'), icon: 'roundRect' },
        { name: i18n.t('CAPM Norm'), icon: 'circle' }
      ]
    : [
        { name: i18n.t('Expected IRR'), icon: 'circle' },
        { name: i18n.t('CAPM Norm'), icon: 'circle' },
        // A stroke-only path draws nothing in the legend, so the dashed icon is
        // three filled segments instead.
        ...(referenceShown()
          ? [{ name: i18n.t('Reference IRR'), icon: 'path://M0,3h7v2h-7z M10,3h7v2h-7z M20,3h7v2h-7z' }]
          : []),
        // The reader's own line keeps its place in the legend whether it is
        // drawn or not: the checkbox on it is how it is brought back.
        ...(customCurve()
          ? [{ name: i18n.t('IRR with customized DCF'),
               icon: customShown ? CHECKBOX.on : CHECKBOX.off,
               itemStyle: { color: customCurve().color } }]
          : []),
        ...(eventCapmShown()
          ? [{ name: i18n.t('CAPM norm with customized DCF'), icon: 'circle' }] : [])
      ];

  return {
    animationDuration: 1200,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 800,
    animationEasingUpdate: 'cubicInOut',
    textStyle: { fontFamily: MONO },
    grid: { left: 44, right: 16, top: 34, bottom: 36 },
    legend: {
      top: 2,
      data: legendData,
      itemWidth: 12,
      itemHeight: 9,
      itemGap: 16,
      textStyle: { fontFamily: MONO, fontSize: 11, color: '#374151' },
      // The legend takes a click only while the checkbox is in it, and only
      // the checkbox acts on one: every item stays drawn (see bindLegend), so
      // the default lines and the cloud are not the legend's to hide.
      selectedMode: !isBox && customCurve() ? 'multiple' : false,
      selected: Object.fromEntries(legendData.map(item => [item.name, true]))
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        lineStyle: { color: 'rgba(17, 24, 39, 0.25)', type: 'dashed' },
        crossStyle: { color: 'rgba(17, 24, 39, 0.18)', type: 'dashed' },
        label: {
          backgroundColor: '#111827',
          fontFamily: MONO,
          fontSize: 11,
          formatter: p => (p.axisDimension === 'y' ? `${(+p.value).toFixed(1)}%` : p.value)
        }
      },
      backgroundColor: 'rgba(17, 24, 39, 0.94)',
      borderWidth: 0,
      padding: [10, 14],
      textStyle: { color: '#cbd5e1', fontFamily: MONO, fontSize: 12 },
      extraCssText: 'border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.25);min-width:240px;',
      formatter: params => {
        // trigger 'axis' can hand back a scatter point first, whose dataIndex is
        // the dot's index rather than the year's, so the year comes from
        // axisValue instead.
        const p = Array.isArray(params) ? params[0] : params;
        const index = p ? years.findIndex(y => String(y) === String(p.axisValue)) : -1;
        return index >= 0 ? tooltipHtml(index) : '';
      }
    },
    xAxis: {
      type: 'category',
      data: years.map(String),
      boundaryGap: true,
      axisLine: { lineStyle: { color: '#d1d5db' } },
      axisTick: { show: false },
      axisLabel: { color: '#6b7280', fontFamily: MONO, fontSize: 11, margin: 12 },
      splitLine: { show: true, lineStyle: { color: 'rgba(0, 0, 0, 0.035)' } }
    },
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax(),
      interval: 2,
      axisLine: { show: false },
      axisLabel: { color: '#6b7280', fontFamily: MONO, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.06)' } }
    },
    series
  };
}

// Hovering a year lifts that year's column of dots.
function bindAxisPointer() {
  chart.on('updateAxisPointer', event => {
    if (view === 'boxplot') return;
    const info = event.axesInfo && event.axesInfo.find(a => a.axisDim === 'x');
    const year = info ? years[info.value] : null;
    if (String(year) === String(highlightedYear)) return;
    if (highlightedYear !== null) {
      chart.dispatchAction({ type: 'downplay', seriesId: `cloud-${highlightedYear}` });
    }
    if (year !== null && year !== undefined) {
      chart.dispatchAction({ type: 'highlight', seriesId: `cloud-${year}` });
    }
    highlightedYear = year;
  });
}

// The checkbox on the reader's own line. ECharts' own idea of a hidden series
// is not used for it: the click is taken as the checkbox being set, the legend
// is put back the way it was, and the line is drawn or not on the next pass.
function bindLegend() {
  chart.on('legendselectchanged', event => {
    if (holdingLegend) return;
    if (event.name === i18n.t('IRR with customized DCF')) customShown = !customShown;
    holdingLegend = true;
    chart.setOption(buildOption(), false);
    holdingLegend = false;
  });
}

function handleResize() {
  if (chart) chart.resize();
}

export function destroyChart() {
  if (chart) {
    chart.dispose();
    chart = null;
  }
  renderedView = null;
  highlightedYear = null;
  if (stopWatchingSize) stopWatchingSize();
  stopWatchingSize = null;
}

// Initialize chart. referenceData is the dotted benchmark line (the default
// investor type at its defaults); without it the initial IRR line is used.
export function initializeChart(chartContainer, yearsData, irrData, requiredReturnData, referenceData = null) {
  if (!chartContainer) return null;

  years = [...yearsData];
  irrValues = [...irrData];
  capmValues = [...(requiredReturnData || [])];
  originalIRRData = [...(referenceData && referenceData.length ? referenceData : irrData)];
  layers = null;

  // The container may still hold a disposed instance after a reset.
  const existing = echarts.getInstanceByDom(chartContainer);
  if (existing) existing.dispose();

  chart = echarts.init(chartContainer, null, { renderer: 'canvas' });
  bindAxisPointer();
  bindLegend();
  if (stopWatchingSize) stopWatchingSize();
  stopWatchingSize = watchSize(chartContainer, handleResize);

  chart.setOption(buildOption(), true);
  renderedView = view;
  return chart;
}

// Update chart with new data. main.js fires this twice for one investor-type
// click, so it has to be a merge that lands on the same result both times.
export function updateChart(newIRRValues, newRequiredReturnValues) {
  if (!chart) return;

  irrValues = [...newIRRValues];
  if (newRequiredReturnValues) capmValues = [...newRequiredReturnValues];

  const viewChanged = renderedView !== view;
  highlightedYear = null;

  // A view switch replaces the series, which is what the universal transition
  // needs; a data change keeps the same series ids so everything glides.
  chart.setOption(buildOption(), viewChanged);
  renderedView = view;
}

// The Plan tab hands over what it has: its own investment, and the market once
// the events are in force. Either may be null, and the default lines and the
// dot cloud are untouched by both.
export function setSideCurves({ plan = undefined, eventIrr = undefined, eventCapm = undefined } = {}) {
  const clean = v => (Array.isArray(v) && v.length ? v : null);
  const before = JSON.stringify([planValues, eventIrrValues, eventCapmValues]);
  if (plan !== undefined) planValues = clean(plan);
  if (eventIrr !== undefined) eventIrrValues = clean(eventIrr);
  if (eventCapm !== undefined) eventCapmValues = clean(eventCapm);
  if (!chart || before === JSON.stringify([planValues, eventIrrValues, eventCapmValues])) return;
  // A merge keeps the cloud and the default lines exactly where they are; the
  // box view has no side lines to merge into, so it is rebuilt.
  chart.setOption(buildOption(), view === 'boxplot');
  renderedView = view;
}

export function setPlanCurve(values) {
  setSideCurves({ plan: values });
}

// Re-render on a language change so the legend and tooltip pick up the new
// labels. Series names carry the translated text, so this is a full rebuild.
document.addEventListener('languageChanged', () => {
  if (!chart) return;
  highlightedYear = null;
  chart.setOption(buildOption(), true);
  renderedView = view;
});
