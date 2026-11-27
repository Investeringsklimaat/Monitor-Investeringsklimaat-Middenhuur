// main.js - Application entry point
//
// The page reads the published data once (modules/dataset.js), works out the
// first chart from it, and from then on recalculates in this browser with every
// move of a slider or a handle. There is nothing behind the page.

import { defaultValues } from './modules/parameters.js';
import { ParameterSlider } from './modules/sliders.js';
import { CurveEditor } from './modules/curve-editor.js';
import { initializeChart, updateChart, destroyChart, getView, setView } from './modules/chart.js';
import {
  calculateIRR,
  calculateRequiredReturn,
  getParameterData,
  applyParameterChanges,
  resetToDefaults as apiResetToDefaults,
  irrCurve,
} from './modules/api.js';
import {
  debounce,
  showLoading,
  hideLoading,
  showCalculating,
  hideCalculating,
  updateIRRDisplays,
} from './modules/utils.js';
import { StateManager } from './modules/state-manager.js';
import {
  initSensitivity,
  calculateAllSensitivities,
  calculateTVPSensitivity,
} from './modules/sensitivity.js';
import { initTabs, initializeTabNavigation } from './modules/tabs.js';
import { initDcfModal, initializeModal, setupModalInputListeners } from './modules/dcf-modal.js';
import {
  initInvestorType,
  activeType,
  recalculating,
  initializeInvestorPresets,
  applyInvestorDefaults,
  updateTaxRegimeReadout,
} from './modules/investor-type.js';
import * as ThreeYearWindow from './modules/three-year-window.js';
import {
  initInvestorPanel,
  showInvestorPanel,
  refreshInvestorPanel,
} from './modules/investor-panel.js';
import * as D from './modules/dataset.js';
import i18n from './i18n.js';
import { initDemo } from './modules/demo.js';

// Initialize state manager
const stateManager = new StateManager();

// UI elements reference
const elements = {};

// UI controls reference
const controls = {};

// The reference settings per type and the taxes in force, read from the data
// once the files are in; the settings panel is drawn from them.
let investorSettingsConfig = {};
let investorTaxRates = {};

// Which type this tab is on, for the 3-year window, which asks the page.
window.HV = { investorType: activeType };

// The sensitivity readouts read the same references and the active type.
initSensitivity({ elements, controls, stateManager, investorType: activeType });
initTabs({ elements, controls, stateManager });
initInvestorType({ controls, stateManager, updateIRRData, updateRequiredReturnData });
initDcfModal({ elements, controls, stateManager, updateIRRData, updateTaxRegimeReadout });

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize i18n and apply translations
  i18n.updateDOM();

  // The published data, and what the page is drawn with.
  await D.load();
  investorSettingsConfig = D.data().investorSettings;
  investorTaxRates = D.investorTaxRates();

  // Get UI references
  getUIReferences();

  // Initialize language switcher
  initializeLanguageSwitcher();
  initDemo();

  // Initialize controls
  initializeControls();

  // The active investor type's defaults, before anything recalculates from them.
  applyInvestorDefaults(activeType());

  // The first chart: the active type at its defaults, the CAPM norm the
  // published figures give, and the default type's line as the dashed
  // reference the other types are read against.
  const first = firstPaint();
  stateManager.yearsData = first.years;
  stateManager.irrData = first.irr;
  stateManager.requiredReturnData = first.norm;
  stateManager.benchmarkIrrData = first.benchmark;

  if (elements.chartContainer && stateManager.yearsData.length > 0) {
    initializeChart(elements.chartContainer, stateManager.yearsData, stateManager.irrData,
      stateManager.requiredReturnData, stateManager.benchmarkIrrData);
    stateManager.baselineIrr = updateIRRDisplays(
      stateManager.irrData,
      stateManager.yearsData,
      elements.latestYearIrr,
      elements.fiveYearAvgIrr,
    );
  }

  // Load initial parameter data
  if (elements.timeVariantParam) {
    await loadParameterData(elements.timeVariantParam.value);
  }

  // Calculate initial sensitivities
  calculateAllSensitivities();

  // Initialize tab navigation
  initializeTabNavigation();

  // Initialize modal
  initializeModal();

  // Initialize chart type toggle
  initializeChartTypeToggle();

  // Initialize investor-type preset buttons
  initializeInvestorPresets();

  // Settings panel for the active investor type
  initInvestorPanel({
    settingsConfig: investorSettingsConfig,
    taxRates: investorTaxRates,
    getDcf: () => {
      const dcf = stateManager.getDCFParams();
      return {
        ltv: controls.ltvSlider ? controls.ltvSlider.getValue() / 100 : defaultValues.ltv / 100,
        opCost: controls.opcostSlider ? controls.opcostSlider.getValue() / 100 : defaultValues.opcost / 100,
        period: controls.periodSlider ? controls.periodSlider.getValue() : defaultValues.period,
        rentSpread: dcf.rentSpread,
        longtermInflation: dcf.longtermInflation,
        mortgageSpread: dcf.mortgageSpread,
        useCpbExit: dcf.useCpbExit || false,
      };
    },
    setLtv: percent => controls.ltvSlider && controls.ltvSlider.setValue(percent),
    setMortgageSpread: percent => controls.mortgageSpreadSlider
      && controls.mortgageSpreadSlider.setValue(percent),
    setOpCost: percent => controls.opcostSlider && controls.opcostSlider.setValue(percent),
    setPeriod: years => controls.periodSlider && controls.periodSlider.setValue(years),
    recalculate: recalculateForInvestorType,
  });
  showInvestorPanel(activeType());
});

/**
 * The lines the page opens on.
 *
 * The active type at its defaults, the default type at its defaults (the dashed
 * reference), and the CAPM norm from the published risk-free rate, beta, equity
 * risk premium and liquidity premium.
 */
function firstPaint() {
  const type = activeType();
  const settingsFor = t => {
    const s = D.investorDcfSettings(t);
    return { ltv: s.ltv, opCost: 0.23, period: s.period, rentSpread: 0.01,
      longtermInflation: 0.022, mortgageSpread: s.mortgage_spread, useCpbExit: true };
  };
  const active = irrCurve(settingsFor(type), type);
  const benchmark = irrCurve(settingsFor(D.DEFAULT_INVESTOR_TYPE), D.DEFAULT_INVESTOR_TYPE);
  const market = D.marketData();
  return {
    years: active.inputs.years,
    irr: active.values.map(v => (Number.isFinite(v) ? v : 0)),
    benchmark: benchmark.values.map(v => (Number.isFinite(v) ? v : 0)),
    norm: active.inputs.years.map(year =>
      (market[year] ? market[year].required_return : 0)),
  };
}

// Recalculate everything that depends on the investor type's settings.
async function recalculateForInvestorType() {
  await updateIRRData();
  await updateTaxRegimeReadout();

  // The buttons stay visible on the 3-year tab; bring it up to date too.
  const threeYearTab = document.getElementById('three-year');
  if (threeYearTab && threeYearTab.style.display !== 'none') {
    ThreeYearWindow.refresh(stateManager, controls);
  }
}

// Initialize chart type toggle
function initializeChartTypeToggle() {
  const lineChartBtn = document.getElementById('line-chart-btn');
  const boxplotBtn = document.getElementById('boxplot-btn');

  if (!lineChartBtn || !boxplotBtn) return;

  lineChartBtn.addEventListener('click', () => {
    if (getView() !== 'line') {
      setView('line');
      lineChartBtn.classList.add('active');
      boxplotBtn.classList.remove('active');
      // Redraw chart with current data
      updateChart(stateManager.irrData, stateManager.requiredReturnData);
    }
  });

  boxplotBtn.addEventListener('click', () => {
    if (getView() !== 'boxplot') {
      setView('boxplot');
      boxplotBtn.classList.add('active');
      lineChartBtn.classList.remove('active');
      // Redraw chart as box plot
      updateChart(stateManager.irrData, stateManager.requiredReturnData);
    }
  });
}

// The readout is rendered from data, so it has to be rebuilt after i18n resets
// the element to its static default on a language switch.
document.addEventListener('languageChanged', () => {
  updateTaxRegimeReadout();
});

// Initialize language switcher
function initializeLanguageSwitcher() {
  const langButtons = document.querySelectorAll('.lang-btn');

  langButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      i18n.setLanguage(lang);

      // Update active state
      langButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    // Set active button based on current language
    if (btn.dataset.lang === i18n.getCurrentLanguage()) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Get UI element references
function getUIReferences() {
  // Modal Sliders
  elements.ltvSlider = document.getElementById('modal-ltv-slider');
  elements.ltvValue = document.getElementById('modal-ltv-value');
  elements.ltvSensitivity = document.getElementById('modal-ltv-sensitivity');
  elements.opcostSlider = document.getElementById('modal-opcost-slider');
  elements.opcostValue = document.getElementById('modal-opcost-value');
  elements.opcostSensitivity = document.getElementById('modal-opcost-sensitivity');
  elements.periodSlider = document.getElementById('modal-period-slider');
  elements.periodValue = document.getElementById('modal-period-value');
  elements.periodSensitivity = document.getElementById('modal-period-sensitivity');
  elements.rentSpreadSlider = document.getElementById('modal-rent-spread-slider');
  elements.rentSpreadValue = document.getElementById('modal-rent-spread-value');
  elements.mortgageSpreadSlider = document.getElementById('modal-mortgage-spread-slider');
  elements.mortgageSpreadValue = document.getElementById('modal-mortgage-spread-value');
  elements.longtermInflationSlider = document.getElementById('modal-longterm-inflation-slider');
  elements.longtermInflationValue = document.getElementById('modal-longterm-inflation-value');
  elements.useCpbExitCheckbox = document.getElementById('use-cpb-exit-checkbox');
  elements.betaSlider = document.getElementById('modal-beta-slider');
  elements.betaValue = document.getElementById('modal-beta-value');
  elements.liqPremiumSlider = document.getElementById('modal-liq-premium-slider');
  elements.liqPremiumValue = document.getElementById('modal-liq-premium-value');

  // Modal elements
  elements.dcfModal = document.getElementById('dcf-modal');
  elements.customizeDcfBtn = document.getElementById('customize-dcf-btn');
  elements.closeModal = document.querySelector('.close-modal');
  elements.applyDcfChanges = document.getElementById('apply-dcf-changes');
  elements.cancelDcfChanges = document.getElementById('cancel-dcf-changes');

  // Time variant elements
  elements.timeVariantParam = document.getElementById('time-variant-param');
  elements.tvpSensitivityValue = document.getElementById('tvp-sensitivity-value');
  elements.verticalSlidersContainer = document.getElementById('vertical-sliders-container');
  elements.resetSliderParam = document.getElementById('reset-slider-param');

  // Results and charts
  elements.latestYearIrr = document.getElementById('latest-year-irr');
  elements.fiveYearAvgIrr = document.getElementById('five-year-avg-irr');
  elements.resetButton = document.getElementById('reset-defaults');
  elements.chartContainer = document.getElementById('returnChart');
}

// Initialize controls
function initializeControls() {
  // Setup IRR parameter sliders - DCF modal sliders apply on "Apply Changes" click
  if (elements.ltvSlider) {
    controls.ltvSlider = new ParameterSlider(
      elements.ltvSlider, elements.ltvValue, '', defaultValues.ltv, null);
  }

  if (elements.opcostSlider) {
    controls.opcostSlider = new ParameterSlider(
      elements.opcostSlider, elements.opcostValue, '', defaultValues.opcost, null);
  }

  if (elements.periodSlider) {
    controls.periodSlider = new ParameterSlider(
      elements.periodSlider, elements.periodValue, '', defaultValues.period, null);
  }

  if (elements.rentSpreadSlider) {
    controls.rentSpreadSlider = new ParameterSlider(
      elements.rentSpreadSlider, elements.rentSpreadValue, '',
      1.0,  // Initial value: 1% (slider value is 10, divided by 10)
      null,
      { scaleFactor: 10, decimals: 1 },
    );
  }

  if (elements.mortgageSpreadSlider) {
    controls.mortgageSpreadSlider = new ParameterSlider(
      elements.mortgageSpreadSlider, elements.mortgageSpreadValue, '',
      1.53,  // Initial value: 1.53% (slider value is 153, divided by 100)
      null,
      { scaleFactor: 100, decimals: 2 },
    );
  }

  if (elements.longtermInflationSlider) {
    controls.longtermInflationSlider = new ParameterSlider(
      elements.longtermInflationSlider, elements.longtermInflationValue, '',
      2.2,  // Initial value: 2.2% (slider value is 22, divided by 10)
      null,
      { scaleFactor: 10, decimals: 1 },
    );
  }

  // Setup required return sliders
  if (elements.betaSlider) {
    controls.betaSlider = new ParameterSlider(
      elements.betaSlider, elements.betaValue, '', 0.63,
      debounce(() => updateRequiredReturnData(), 300),
      { scaleFactor: 100, decimals: 2 },
    );
  }

  if (elements.liqPremiumSlider) {
    controls.liqPremiumSlider = new ParameterSlider(
      elements.liqPremiumSlider, elements.liqPremiumValue, '', 0.25,
      debounce(() => updateRequiredReturnData(), 300),
      { scaleFactor: 100, decimals: 2 },
    );
  }

  // Per-year values of the selected parameter, edited on a line chart. It
  // keeps the sliders' interface, so every edit takes the same path.
  controls.verticalSliders = new CurveEditor(
    elements.verticalSlidersContainer,
    debounce(() => applyParameterChangesRealtime(), 120),
    () => stateManager.originalParamData.values,
  );

  // Parameter tabs drive the (hidden) select the rest of the page reads
  document.querySelectorAll('.tv-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (!elements.timeVariantParam || elements.timeVariantParam.value === tab.dataset.param) return;
      document.querySelectorAll('.tv-tab').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
      elements.timeVariantParam.value = tab.dataset.param;
      elements.timeVariantParam.dispatchEvent(new Event('change'));
    });
  });

  // Setup event listeners
  if (elements.timeVariantParam) {
    elements.timeVariantParam.addEventListener('change', handleParameterChange);
  }

  if (elements.resetButton) {
    elements.resetButton.addEventListener('click', handleResetToDefaults);
  }

  const resetButton = document.getElementById('reset-slider-param');
  if (resetButton) {
    resetButton.addEventListener('click', handleResetParameter);
  }

  // Add manual edit listeners for modal value inputs
  setupModalInputListeners();
}

// Load parameter data
async function loadParameterData(paramType) {
  showLoading();

  try {
    // Save current parameter state before switching
    stateManager.saveCurrentParameterState();

    // Update current parameter
    stateManager.setCurrentParameter(paramType);

    // Check if we already have state for this parameter
    if (stateManager.hasParameterState(paramType)) {
      // Restore parameter state and update UI
      const paramState = stateManager.restoreParameterState(paramType);

      controls.verticalSliders.setData(
        paramState.years, paramState.values, paramType, paramState.unit);

      // Calculate TVP sensitivity with the loaded parameter
      setTimeout(() => calculateTVPSensitivity(), 500);
      hideLoading();
      return;
    }

    const data = await getParameterData(paramType);

    if (data.error) {
      console.error('Error:', data.error);
      return;
    }

    // Process years and values
    const processedData = stateManager.processParameterData(data);

    // Setup vertical sliders
    controls.verticalSliders.setData(
      processedData.years, processedData.values, paramType, processedData.unit);

    // Calculate TVP sensitivity
    setTimeout(() => calculateTVPSensitivity(), 500);
  } catch (error) {
    console.error('Error loading parameter data:', error);
  } finally {
    hideLoading();
  }
}

// The settings the sliders and the state manager hold right now.
function currentSettings() {
  const dcf = stateManager.getDCFParams();
  return {
    ltv: controls.ltvSlider ? controls.ltvSlider.getValue() / 100 : defaultValues.ltv / 100,
    opCost: controls.opcostSlider ? controls.opcostSlider.getValue() / 100 : defaultValues.opcost / 100,
    period: controls.periodSlider ? controls.periodSlider.getValue() : defaultValues.period,
    rentSpread: dcf.rentSpread,
    longtermInflation: dcf.longtermInflation,
    mortgageSpread: dcf.mortgageSpread,
    useCpbExit: dcf.useCpbExit || false,
  };
}

async function updateIRRData() {
  showLoading();

  try {
    const settings = currentSettings();
    const { inputs, values } = irrCurve(settings, activeType());

    const data = {
      irr_values: values.map(v => (Number.isFinite(v) ? v : 0)),
      years: inputs.years,
      modified_params: inputs.edited_params,
    };

    // Update state
    stateManager.updateIRRData(data);

    // Update displays
    stateManager.baselineIrr = updateIRRDisplays(
      data.irr_values, data.years, elements.latestYearIrr, elements.fiveYearAvgIrr);

    // Update chart
    updateChart(stateManager.irrData, stateManager.requiredReturnData);

    // Update yearsData if needed
    if (data.years
      && (stateManager.yearsData.length !== data.years.length
        || !stateManager.yearsData.every((val, idx) => val === data.years[idx]))) {
      stateManager.yearsData = data.years;

      // Reload parameter data to match new years
      loadParameterData(elements.timeVariantParam.value);
    }

    // The differences from the reference depend on every setting
    refreshInvestorPanel();
  } catch (error) {
    console.error('Error updating IRR data:', error);
  } finally {
    hideLoading();
    hideCalculating();
  }
}

// Update required return data
async function updateRequiredReturnData() {
  showLoading();

  try {
    const beta = controls.betaSlider ? controls.betaSlider.getValue() : defaultValues.beta / 100;
    const liqPremium = controls.liqPremiumSlider
      ? controls.liqPremiumSlider.getValue() : defaultValues.liqPremium / 100;

    const data = await calculateRequiredReturn(beta, liqPremium);

    // Store required return data
    stateManager.requiredReturnData = data.required_return_values;

    // Update chart
    updateChart(stateManager.irrData, data.required_return_values);
  } catch (error) {
    console.error('Error updating required return data:', error);
  } finally {
    hideLoading();
  }
}

// Edits are applied one at a time, so the last one the reader made is the one
// the chart ends on.
let editInFlight = null;
let editAgain = false;

async function applyParameterChangesRealtime() {
  if (editInFlight) { editAgain = true; return editInFlight; }
  editInFlight = applyParameterChangesNow().finally(() => { editInFlight = null; });
  const done = editInFlight;
  await done;
  if (editAgain) { editAgain = false; return applyParameterChangesRealtime(); }
  return done;
}

// Apply parameter changes in real-time
async function applyParameterChangesNow() {
  showLoading();

  try {
    const param = stateManager.currentParam;
    const values = controls.verticalSliders.getValues();
    // Only the years the reader moved are sent: the rest is the data as the
    // editor read it.
    const edited = controls.verticalSliders.edits
      ? controls.verticalSliders.edits() : { years: stateManager.currentParamData.years, values };
    const settings = currentSettings();

    // Update parameter values in state manager
    stateManager.updateCurrentParameterValues(values);

    const data = await applyParameterChanges(
      param, edited.years, edited.values, settings.ltv, settings.opCost, settings.period,
      settings.rentSpread, settings.longtermInflation, settings.mortgageSpread,
      settings.useCpbExit, activeType());

    if (data.error) {
      console.error('Error:', data.error);
      return;
    }

    // Update IRR data in state manager
    stateManager.updateIRRData(data);

    // Update displays
    stateManager.baselineIrr = updateIRRDisplays(
      data.irr_values, data.years, elements.latestYearIrr, elements.fiveYearAvgIrr);

    // Update chart
    updateChart(stateManager.irrData, stateManager.requiredReturnData);

    // Update sensitivities
    calculateTVPSensitivity();
  } catch (error) {
    console.error('Error applying parameter changes:', error);
  } finally {
    hideLoading();
  }
}

// Event Handlers
function handleParameterChange() {
  // Save the current state before switching
  stateManager.saveCurrentParameterState();

  // Switch to the new parameter
  loadParameterData(elements.timeVariantParam.value);
}

function handleResetParameter() {
  showLoading();

  try {
    // Reset the current parameter to its original values
    if (stateManager.resetCurrentParameter()) {
      controls.verticalSliders.resetValues(stateManager.originalParamData.values);
      applyParameterChangesRealtime();
    }
  } catch (error) {
    console.error('Error resetting parameter:', error);
  } finally {
    hideLoading();
  }
}

async function handleResetToDefaults() {
  showLoading();
  showCalculating();

  try {
    // LTV, period and mortgage spread go to the active investor type's defaults
    // below; the rest go back to the shared defaults.
    if (controls.opcostSlider) controls.opcostSlider.setValue(defaultValues.opcost);
    if (controls.rentSpreadSlider) controls.rentSpreadSlider.setValue(1.0);
    if (controls.longtermInflationSlider) controls.longtermInflationSlider.setValue(2.2);
    if (elements.useCpbExitCheckbox) elements.useCpbExitCheckbox.checked = true;
    if (controls.betaSlider) controls.betaSlider.setValue(defaultValues.beta / 100);
    if (controls.liqPremiumSlider) controls.liqPremiumSlider.setValue(defaultValues.liqPremium / 100);

    // Reset state manager, including the cached per-year values: the edits are
    // cleared, so the editor must read the data again rather than restore what
    // it had.
    stateManager.resetAll();
    stateManager.clearParameterStates();

    // The active type's own defaults (after resetAll, which resets the spread)
    applyInvestorDefaults(activeType());

    const data = await apiResetToDefaults(activeType());

    // Update state with fresh data
    stateManager.setIRRData(data.irr_values);
    stateManager.requiredReturnData = data.required_return_values;
    stateManager.yearsData = data.years;
    stateManager.isFirstUpdate = true;

    // Update displays
    stateManager.baselineIrr = updateIRRDisplays(
      data.irr_values, data.years, elements.latestYearIrr, elements.fiveYearAvgIrr);

    // Force complete chart redraw after reset
    destroyChart();
    initializeChart(elements.chartContainer, data.years, data.irr_values,
      data.required_return_values, stateManager.benchmarkIrrData);

    // Box 3 is quoted at the LTV, which the reset may have changed
    updateTaxRegimeReadout();
    refreshInvestorPanel();

    // Reload parameter data
    if (elements.timeVariantParam) {
      await loadParameterData(elements.timeVariantParam.value);
    }

    // Recalculate sensitivities
    calculateAllSensitivities();
  } catch (error) {
    console.error('Error resetting to defaults:', error);
  } finally {
    hideLoading();
    hideCalculating();
  }
}

export { currentSettings, recalculating };
