// investor-type.js - The investor-type buttons: which type is active, the DCF
// settings each type brings with it, and the readout of its taxes.
//
// Moved out of main.js as it was; the page hands over what it shares with
// initInvestorType().

import { getTaxRegime } from './api.js';
import * as D from './dataset.js';
import { showInvestorPanel } from './investor-panel.js';
import * as ThreeYearWindow from './three-year-window.js';
import i18n from '../i18n.js';

let controls = null;
let stateManager = null;
let updateIRRData = null;
let updateRequiredReturnData = null;

// The page's control references, its state manager, and the two
// recalculations a click on a type starts.
export function initInvestorType(page) {
  ({ controls, stateManager, updateIRRData, updateRequiredReturnData } = page);
}

// Investor-type buttons select a TAX REGIME (data/taxes.json) together with that
// type's default LTV, mortgage spread and period — the only DCF settings that
// differ by type (INVESTOR_DCF_SETTINGS in modules/dataset.js). Everything else
// stays where the user left it.

// Active investor type, or null for the generic (type-agnostic) calculation.
// The page starts on the default type and a deselection holds until the reader
// picks a type again.
let activeInvestorType = D.DEFAULT_INVESTOR_TYPE;

// Set while an investor-type click is still recalculating, so anything waiting
// on it can wait for the real thing instead of guessing a delay.
let pendingRecalculation = false;

// The active type and whether a click on a type is still recalculating, for the
// page, which reads them but leaves them to this module to set.
export function activeType() {
  return activeInvestorType;
}

export function recalculating() {
  return pendingRecalculation;
}

export function initializeInvestorPresets() {
  const buttons = document.querySelectorAll('.investor-preset-btn');
  buttons.forEach(button => {
    button.addEventListener('click', async () => {
      const type = button.getAttribute('data-preset');
      if (!type) return;

      // Clicking the active type again deselects it, back to generic.
      const selecting = type !== activeInvestorType;
      activeInvestorType = selecting ? type : null;

      buttons.forEach(btn => btn.classList.toggle('active', selecting && btn === button));

      // Selecting a type applies its default DCF settings.
      if (selecting) applyInvestorDefaults(type);
      showInvestorPanel(activeInvestorType);

      pendingRecalculation = true;
      try {
        await updateIRRData();
        await updateRequiredReturnData();
        await updateTaxRegimeReadout();
      } finally {
        pendingRecalculation = false;
      }

      // The buttons stay visible on the 3-year tab; bring it up to date too.
      const threeYearTab = document.getElementById('three-year');
      if (threeYearTab && threeYearTab.style.display !== 'none') {
        ThreeYearWindow.refresh(stateManager, controls);
      }
    });
  });

  // The page is already rendered with the active type applied, so this only
  // has to catch the buttons and the readout up — no recalculation.
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-preset') === activeInvestorType);
  });
  updateTaxRegimeReadout();
}

// Default DCF settings (decimals) for an investor type; the shared defaults for
// null or a type without its own entry.
function investorDcfSettings(type) {
  return D.investorDcfSettings(type);
}

// Set LTV, mortgage spread and period to the type's defaults. The spread is read
// from the state manager by every calculation, so it is set there as well as on
// the slider.
export function applyInvestorDefaults(type) {
  const settings = investorDcfSettings(type);
  if (!settings) return;

  const toPercent = value => Math.round(value * 10000) / 100;

  if (controls.ltvSlider) {
    controls.ltvSlider.setValue(toPercent(settings.ltv));
  }
  if (controls.periodSlider) {
    controls.periodSlider.setValue(settings.period);
  }
  if (controls.mortgageSpreadSlider) {
    controls.mortgageSpreadSlider.setValue(toPercent(settings.mortgage_spread));
  }

  const dcf = stateManager.getDCFParams();
  stateManager.setDCFParams(dcf.rentSpread, dcf.longtermInflation, settings.mortgage_spread, dcf.useCpbExit);
}

// One-line readout of the taxes in force for the active type. Box 3 is shown at
// the LTV currently set, since it is computed from that rather than stored.
export async function updateTaxRegimeReadout() {
  // Before the controls exist (i18n fires languageChanged at startup) the LTV is
  // unknown; initializeInvestorPresets() renders the readout once it is.
  if (!controls.ltvSlider) return;
  const ltv = controls.ltvSlider.getValue() / 100;
  const data = activeInvestorType ? await getTaxRegime(ltv, activeInvestorType) : null;
  renderTaxRegimeReadout(data, ltv);
}

function renderTaxRegimeReadout(data, ltv) {
  const readout = document.getElementById('investor-regime-readout');
  if (!readout) return;

  if (!data || !data.taxes || data.taxes.length === 0) {
    readout.textContent = i18n.t('No investor type selected');
    readout.classList.remove('has-regime');
    return;
  }

  const labels = {
    transfer_tax: 'Transfer tax',
    corporate_tax: 'Corporate tax',
    vat: 'VAT',
    box3: 'Box 3'
  };

  const parts = data.taxes.map(tax => {
    const label = i18n.t(labels[tax.key] || tax.key);
    const rate = formatTaxRate(tax.rate);
    if (tax.key === 'box3') {
      return `${label} ${rate} (${i18n.t('at LTV')} ${Math.round(ltv * 100)}%)`;
    }
    return `${label} ${rate}`;
  });

  const year = data.reference_year ? ` — ${data.reference_year}` : '';
  readout.textContent = parts.join(' · ') + year;
  readout.classList.add('has-regime');
}

// Percentages without trailing zeros: 8% rather than 8.00%, 1.77% rather than 1.7712%.
function formatTaxRate(rate) {
  const pct = rate * 100;
  const rounded = Math.abs(pct - Math.round(pct)) < 0.005 ? pct.toFixed(0) : pct.toFixed(2).replace(/0+$/, '');
  return `${rounded}%`;
}
