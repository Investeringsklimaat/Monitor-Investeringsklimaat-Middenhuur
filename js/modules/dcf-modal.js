// dcf-modal.js - The DCF panel: opening and closing it, applying its settings,
// and typing a value beside a slider.
//
// The page hands over what it shares with initDcfModal().

let elements = null;
let controls = null;
let stateManager = null;
let updateIRRData = null;
let updateTaxRegimeReadout = null;

// The page's element and control references, its state manager, and the two
// page functions the panel calls: the recalculation and the tax readout.
export function initDcfModal(page) {
  ({ elements, controls, stateManager, updateIRRData, updateTaxRegimeReadout } = page);
}

// Initialize modal functionality
export function initializeModal() {
  // Open modal
  if (elements.customizeDcfBtn) {
    elements.customizeDcfBtn.addEventListener('click', () => {
      if (elements.dcfModal) {
        elements.dcfModal.style.display = 'block';
      }
    });
  }
  
  // Close modal
  if (elements.closeModal) {
    elements.closeModal.addEventListener('click', () => {
      if (elements.dcfModal) {
        elements.dcfModal.style.display = 'none';
      }
    });
  }
  
  // Cancel button
  if (elements.cancelDcfChanges) {
    elements.cancelDcfChanges.addEventListener('click', () => {
      if (elements.dcfModal) {
        elements.dcfModal.style.display = 'none';
      }
    });
  }
  
  // Apply changes button
  if (elements.applyDcfChanges) {
    elements.applyDcfChanges.addEventListener('click', async () => {
      if (elements.dcfModal) {
        elements.dcfModal.style.display = 'none';
      }
      // Save DCF parameters to state manager
      const rentSpread = controls.rentSpreadSlider ? controls.rentSpreadSlider.getValue() / 100 : 0.01;
      const longtermInflation = controls.longtermInflationSlider ? controls.longtermInflationSlider.getValue() / 100 : 0.022;
      const mortgageSpread = controls.mortgageSpreadSlider ? controls.mortgageSpreadSlider.getValue() / 100 : 0.0153;
      const useCpbExit = elements.useCpbExitCheckbox ? elements.useCpbExitCheckbox.checked : false;
      stateManager.setDCFParams(rentSpread, longtermInflation, mortgageSpread, useCpbExit);
      
      // Force recalculation with current slider values
      await updateIRRData();
      // Box 3 is quoted at the current LTV, so the readout follows the slider.
      await updateTaxRegimeReadout();
      // Don't call updateRequiredReturnData() - it also calls updateChart causing duplicate updates
    });
  }
  
  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    if (event.target === elements.dcfModal) {
      elements.dcfModal.style.display = 'none';
    }
  });
}

// Setup manual edit listeners for modal inputs
export function setupModalInputListeners() {
  const modalInputs = [
    { input: elements.ltvValue, slider: controls.ltvSlider, min: 0, max: 90 },
    { input: elements.opcostValue, slider: controls.opcostSlider, min: 10, max: 50 },
    { input: elements.periodValue, slider: controls.periodSlider, min: 5, max: 30 },
    { input: elements.rentSpreadValue, slider: controls.rentSpreadSlider, min: -2, max: 15 },
    { input: elements.longtermInflationValue, slider: controls.longtermInflationSlider, min: 0.5, max: 10 },
    { input: elements.mortgageSpreadValue, slider: controls.mortgageSpreadSlider, min: -1, max: 50 },
    { input: elements.betaValue, slider: controls.betaSlider, min: 0.3, max: 1.0 },
    { input: elements.liqPremiumValue, slider: controls.liqPremiumSlider, min: 0, max: 1 }
  ];

  modalInputs.forEach(({ input, slider, min, max }) => {
    if (!input || !slider) return;

    // Handle blur event
    input.addEventListener('blur', (e) => {
      const inputValue = parseFloat(e.target.value);
      if (isNaN(inputValue)) {
        // Revert to current slider value
        slider.updateDisplay(slider.getValue());
        return;
      }

      // Clamp to min/max
      const clampedValue = Math.max(min, Math.min(max, inputValue));
      
      // Update slider
      slider.setValue(clampedValue);
    });

    // Handle Enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    });
  });
}
