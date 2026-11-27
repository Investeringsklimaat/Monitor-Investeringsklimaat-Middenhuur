// three-year-window.js - 3-Year Window Analysis Module

import i18n from '../i18n.js';
import { COLORS, MONO } from './theme.js';
import { watchSize } from './utils.js';
import { threeYearWindow } from './api.js';

let windowChart = null;
let stopWatchingSize = null;  // stops watching the chart's container for size changes
let lastSensitivities = null;  // cached for re-render on language change
let lastData = null;           // { years, irr, capm, ref } for re-render on language change
let state = null;              // the page's state manager, for the CAPM norm and the benchmark

// The window is the selected year and the years either side, so the selectable
// centre years stop one short of the data's ends: 2011 (2010-2012) to 2025
// (2024-2026). It opens on the last full window.
const MIN_YEAR = 2011;
const MAX_YEAR = 2025;
let currentYear = MAX_YEAR;

// Initialize 3-year window view
export function initialize(stateManager, controls) {
  state = stateManager;
  // Setup year selector
  const yearSelect = document.getElementById('window-year-select');
  
  if (yearSelect) {
    // Clear existing options first
    yearSelect.innerHTML = '';
    
    // Populate year options
    for (let year = MIN_YEAR; year <= MAX_YEAR; year++) {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      if (year === currentYear) {
        option.selected = true;
      }
      yearSelect.appendChild(option);
    }
    
    // Add change listener
    yearSelect.addEventListener('change', (e) => {
      currentYear = parseInt(e.target.value);
      updateWindow(stateManager, controls);
    });
  }
  
  // Setup navigation arrows
  const prevBtn = document.getElementById('window-prev-year');
  const nextBtn = document.getElementById('window-next-year');
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentYear > MIN_YEAR) {
        currentYear--;
        yearSelect.value = currentYear;
        updateWindow(stateManager, controls);
      }
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentYear < MAX_YEAR) {
        currentYear++;
        yearSelect.value = currentYear;
        updateWindow(stateManager, controls);
      }
    });
  }
  
  // Initialize chart
  initializeChart();
  
  // Load initial data
  updateWindow(stateManager, controls);
}

// Drawn like the main IRR chart (chart.js): the same colours, font, axes,
// legend, tooltip, line and point styles, and a seeded dot cloud around the
// IRR line. The CAPM norm and the dashed reference (default investor type at
// its defaults, shown once the IRR departs from it) come from the main chart's
// data for the same years.
const CLOUD_SEED = 20261016;
const CLOUD_POINTS = 30;

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The same spread the Chart.js version drew (up to +/-3 points tented by layer,
// plus +/-0.75 noise), from a fixed seed so it keeps its shape between renders.
function cloudSeries(years, irr) {
  const rand = mulberry32(CLOUD_SEED);
  const n = CLOUD_POINTS;
  const points = [];
  for (let i = 0; i < n; i++) {
    const spread = (rand() - 0.5) * 6;
    const size = 4 + rand() * 5;
    const symbol = rand() > 0.7 ? 'diamond' : 'circle';
    const tent = 1 - Math.abs(i - n / 2) / (n / 2);
    years.forEach((_, y) => {
      const value = irr[y] + spread * tent + (rand() - 0.5) * 1.5;
      points.push({
        value: [y, value],
        symbol,
        symbolSize: size,
        symbolOffset: [(rand() - 0.5) * 22, 0],
        itemStyle: { color: COLORS.irr, opacity: +(0.08 + 0.42 * Math.pow(tent, 1.5)).toFixed(3) }
      });
    });
  }
  return {
    id: 'cloud',
    name: i18n.t('IRR Distribution'),
    type: 'scatter',
    z: 1,
    silent: true,
    data: points
  };
}

function initializeChart() {
  const el = document.getElementById('window-chart');
  if (!el) {
    console.error('Window chart container not found');
    return;
  }
  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  windowChart = echarts.init(el, null, { renderer: 'canvas' });
  if (stopWatchingSize) stopWatchingSize();
  stopWatchingSize = watchSize(el, () => windowChart && windowChart.resize());
}

// The main chart's series for the window's years: CAPM norm and benchmark.
function mainSeriesFor(years) {
  const all = (state && state.yearsData) || [];
  const pick = list => years.map(y => {
    const i = all.findIndex(v => Number(v) === Number(y));
    return i >= 0 && list && Number.isFinite(list[i]) ? list[i] : null;
  });
  return { capm: pick(state && state.requiredReturnData), ref: pick(state && state.benchmarkIrrData) };
}

const fmt = v => `${Number(v).toFixed(2)}%`;
const marker = (color, dashed) => dashed
  ? `<span style="display:inline-block;width:14px;border-top:2px dashed ${color};margin:0 8px 3px 0"></span>`
  : `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin:0 10px 1px 3px"></span>`;
const row = (left, right) =>
  `<div style="display:flex;justify-content:space-between;gap:24px;line-height:1.75">${left}<b style="font-weight:500;color:#fff">${right}</b></div>`;

function buildOption() {
  const { years, irr, capm, ref } = lastData;
  const refShown = ref.some((v, i) => v !== null && Math.abs(v - irr[i]) > 0.01);
  const values = [...irr, ...capm, ...(refShown ? ref : [])].filter(v => Number.isFinite(v));
  const yMax = Math.max(14, Math.ceil(Math.max(...values) * 1.15 / 2) * 2);
  const yMin = Math.min(0, Math.floor(Math.min(...values) / 2) * 2);

  const tooltip = index => {
    const lines = [`<div style="font-weight:600;color:#fff;margin-bottom:4px">${years[index]}</div>`];
    lines.push(row(`<span>${marker(COLORS.irr)}${i18n.t('Expected IRR')}</span>`, fmt(irr[index])));
    if (Number.isFinite(capm[index])) lines.push(row(`<span>${marker(COLORS.capm)}${i18n.t('CAPM Norm')}</span>`, fmt(capm[index])));
    if (refShown && Number.isFinite(ref[index])) lines.push(row(`<span>${marker(COLORS.ref, true)}${i18n.t('Reference IRR')}</span>`, fmt(ref[index])));
    if (Number.isFinite(capm[index])) {
      const spread = irr[index] - capm[index];
      lines.push('<div style="border-top:1px solid rgba(255,255,255,.12);margin:6px 0 2px"></div>');
      lines.push(row('<span>IRR − CAPM</span>',
        `<span style="color:${spread >= 0 ? '#56b4e9' : '#e69f00'}">${spread >= 0 ? '+' : '−'}${Math.abs(spread).toFixed(2)} pt</span>`));
    }
    return lines.join('');
  };

  return {
    animationDuration: 1000,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 700,
    animationEasingUpdate: 'cubicInOut',
    textStyle: { fontFamily: MONO },
    grid: { left: 44, right: 16, top: 56, bottom: 36 },
    legend: {
      top: 8,
      data: [
        { name: i18n.t('Expected IRR'), icon: 'circle' },
        { name: i18n.t('CAPM Norm'), icon: 'circle' },
        ...(refShown ? [{ name: i18n.t('Reference IRR'), icon: 'path://M0,3h7v2h-7z M10,3h7v2h-7z M20,3h7v2h-7z' }] : [])
      ],
      itemWidth: 14,
      itemHeight: 10,
      itemGap: 22,
      textStyle: { fontFamily: MONO, fontSize: 12, color: '#374151' },
      selectedMode: false
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        lineStyle: { color: 'rgba(17, 24, 39, 0.25)', type: 'dashed' },
        crossStyle: { color: 'rgba(17, 24, 39, 0.18)', type: 'dashed' },
        label: {
          backgroundColor: '#111827', fontFamily: MONO, fontSize: 11,
          formatter: p => (p.axisDimension === 'y' ? `${(+p.value).toFixed(1)}%` : p.value)
        }
      },
      backgroundColor: 'rgba(17, 24, 39, 0.94)',
      borderWidth: 0,
      padding: [10, 14],
      textStyle: { color: '#cbd5e1', fontFamily: MONO, fontSize: 12 },
      extraCssText: 'border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.25);min-width:240px;',
      formatter: params => {
        const p = Array.isArray(params) ? params[0] : params;
        const index = p ? years.findIndex(y => String(y) === String(p.axisValue)) : -1;
        return index >= 0 ? tooltip(index) : '';
      }
    },
    xAxis: {
      type: 'category',
      data: years.map(String),
      boundaryGap: true,
      axisLine: { lineStyle: { color: '#d1d5db' } },
      axisTick: { show: false },
      axisLabel: {
        fontFamily: MONO, fontSize: 11, margin: 12,
        // The selected year is the centre of the window
        formatter: v => (Number(v) === currentYear ? `{sel|${v}}` : v),
        color: '#6b7280',
        rich: { sel: { color: '#111827', fontWeight: 700, fontFamily: MONO, fontSize: 11 } }
      },
      splitLine: { show: true, lineStyle: { color: 'rgba(0, 0, 0, 0.035)' } }
    },
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax,
      interval: 2,
      axisLine: { show: false },
      axisLabel: { color: '#6b7280', fontFamily: MONO, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: 'rgba(0, 0, 0, 0.06)' } }
    },
    series: [
      cloudSeries(years, irr),
      {
        id: 'irr',
        name: i18n.t('Expected IRR'),
        type: 'line',
        z: 5,
        data: irr,
        symbol: 'circle',
        symbolSize: 9,
        showAllSymbol: true,
        itemStyle: { color: COLORS.irr, borderColor: '#fff', borderWidth: 2 },
        lineStyle: { width: 3.5, color: COLORS.irr, shadowBlur: 12, shadowColor: 'rgba(0, 114, 178, 0.35)' },
        emphasis: { scale: 1.5, itemStyle: { borderWidth: 3, shadowBlur: 10, shadowColor: 'rgba(0, 114, 178, 0.5)' } }
      },
      {
        id: 'capm',
        name: i18n.t('CAPM Norm'),
        type: 'line',
        z: 4,
        data: capm,
        symbol: 'circle',
        symbolSize: 7,
        itemStyle: { color: COLORS.capm, borderColor: '#fff', borderWidth: 1.5 },
        lineStyle: { width: 2.5, color: COLORS.capm, shadowBlur: 8, shadowColor: 'rgba(213, 94, 0, 0.22)' },
        emphasis: { scale: 1.4 }
      },
      {
        id: 'ref',
        name: i18n.t('Reference IRR'),
        type: 'line',
        z: 3,
        data: ref,
        symbol: 'none',
        silent: true,
        lineStyle: { width: 2, type: [6, 5], color: COLORS.ref, opacity: refShown ? 0.95 : 0 },
        itemStyle: { color: COLORS.ref }
      }
    ]
  };
}

function draw() {
  if (!windowChart || !lastData) return;
  windowChart.setOption(buildOption(), true);
}

// Refresh chart + sensitivity panel when language changes
document.addEventListener('languageChanged', () => {
  draw();
  // Re-render cached sensitivity panel with new translations (no network call needed)
  if (lastSensitivities) {
    updateSensitivityDisplay(lastSensitivities);
  }
});

// Update 3-year window data
async function updateWindow(stateManager, controls) {
  try {
    // Update year display
    const yearDisplay = document.getElementById('window-selected-year');
    if (yearDisplay) {
      yearDisplay.textContent = currentYear;
    }
    
    // Update button states
    const prevBtn = document.getElementById('window-prev-year');
    const nextBtn = document.getElementById('window-next-year');
    if (prevBtn) {
      prevBtn.disabled = currentYear <= MIN_YEAR;
    }
    if (nextBtn) {
      nextBtn.disabled = currentYear >= MAX_YEAR;
    }
    
    // Get current parameters
    const dcfParams = stateManager.getDCFParams();
    const ltv = controls.ltvSlider ? controls.ltvSlider.getValue() / 100 : 0.40;
    const opCost = controls.opcostSlider ? controls.opcostSlider.getValue() / 100 : 0.23;
    const period = controls.periodSlider ? controls.periodSlider.getValue() : 15;
    
    // The window's own numbers, worked out here. The investor type comes from
    // the page, which owns which type is in force.
    const type = window.HV && window.HV.investorType ? window.HV.investorType() : null;
    const data = await threeYearWindow({
      year: currentYear,
      ltv,
      opCost,
      period,
      rentSpread: dcfParams.rentSpread,
      longtermInflation: dcfParams.longtermInflation,
      mortgageSpread: dcfParams.mortgageSpread,
      useCpbExit: dcfParams.useCpbExit,
      investorType: type,
    });
    
    if (data.error) {
      console.error('Error:', data.error);
      return;
    }
    
    // Update chart
    lastData = { years: data.years, irr: data.irr_values, ...mainSeriesFor(data.years) };
    draw();
    
    // Update IRR values display
    updateIRRDisplay(data.years, data.irr_values);
    
    // Update sensitivity analysis
    updateSensitivityDisplay(data.sensitivities);
    
  } catch (error) {
    console.error('Error updating window:', error);
  }
}

// Update IRR values display below chart
function updateIRRDisplay(years, irrValues) {
  const container = document.getElementById('window-irr-values');
  if (!container) return;
  
  container.innerHTML = '';
  
  years.forEach((year, index) => {
    const valueDiv = document.createElement('div');
    valueDiv.className = 'window-irr-value';
    
    const yearLabel = document.createElement('div');
    yearLabel.className = 'window-year-label';
    yearLabel.textContent = year;
    
    const irrLabel = document.createElement('div');
    irrLabel.className = 'window-irr-label';
    irrLabel.textContent = Number.isFinite(irrValues[index])
      ? `${irrValues[index].toFixed(2)}%` : '—';
    
    // Highlight selected year
    if (year === currentYear) {
      valueDiv.classList.add('selected');
    }
    
    valueDiv.appendChild(yearLabel);
    valueDiv.appendChild(irrLabel);
    container.appendChild(valueDiv);
  });
}

// Update sensitivity analysis display
function updateSensitivityDisplay(sensitivities) {
  const container = document.getElementById('window-sensitivities');
  if (!container) return;

  // Cache so we can re-render with new translations on language change
  lastSensitivities = sensitivities;

  container.innerHTML = '';

  sensitivities.forEach(sens => {
    const item = document.createElement('div');
    item.className = 'sensitivity-item';

    const label = document.createElement('div');
    label.className = 'sensitivity-label';
    label.textContent = i18n.t(sens.display_name);

    const bar = document.createElement('div');
    bar.className = 'sensitivity-bar-container';

    const barFill = document.createElement('div');
    barFill.className = `sensitivity-bar ${sens.value >= 0 ? 'positive' : 'negative'}`;

    // Scale bar width (max 100px for ±0.5% impact)
    const maxImpact = 0.5;
    const width = Math.min(Math.abs(sens.value) / maxImpact * 100, 100);
    barFill.style.width = `${width}%`;

    const value = document.createElement('div');
    value.className = `sensitivity-value ${sens.value >= 0 ? 'positive' : 'negative'}`;
    const incrementText = sens.unit === 'year'
      ? i18n.t('for 1 year increase')
      : i18n.t('for 1% increase');
    value.textContent = `${sens.value >= 0 ? '+' : ''}${sens.value.toFixed(4)}% ${incrementText}`;
    
    bar.appendChild(barFill);
    
    item.appendChild(label);
    item.appendChild(bar);
    item.appendChild(value);
    container.appendChild(item);
  });
}

// Cleanup function
export function destroy() {
  if (windowChart) {
    windowChart.dispose();
    windowChart = null;
  }
}

// Refresh data when view becomes active
export function refresh(stateManager, controls) {
  updateWindow(stateManager, controls);
}

