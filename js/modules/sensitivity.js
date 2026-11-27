// sensitivity.js - How much the return moves for a small change in one input:
// the readouts beside LTV, op cost and period in the DCF panel, and the one
// above the per-year editor for the parameter it shows.
//
// Moved out of main.js as it was; the page hands over what it shares with
// initSensitivity().

import { calculateIRR, applyParameterChanges } from './api.js';
import { showLoading, hideLoading } from './utils.js';
import { updateChart } from './chart.js';

let elements = null;
let controls = null;
let stateManager = null;
let investorType = () => null;

// The page's element and control references, its state manager, and the
// active investor type, which the page owns and may change at any time.
export function initSensitivity(page) {
  ({ elements, controls, stateManager, investorType } = page);
}

// Calculate sensitivity for a parameter
async function calculateParameterSensitivity(parameter, step) {
  showLoading();

  try {
    const ltv = controls.ltvSlider.getValue() / 100;
    const opCost = controls.opcostSlider.getValue() / 100;
    const period = controls.periodSlider.getValue();

    // Create param values with the step addition
    const params = {
      ltv: ltv,
      opCost: opCost,
      period: period
    };

    // For period, use absolute change; for others, use relative change
    if (parameter === 'period') {
      params[parameter] += 1; // +1 year absolute increase
    } else {
      params[parameter] *= (1 + step); // Relative increase
    }

    console.log(`Calculating ${parameter} sensitivity with useCpbExit=${stateManager.dcfParams.useCpbExit}`);
    
    // Calculate IRR with increased parameter - use StateManager DCF params
    const data = await calculateIRR(
      params.ltv, 
      params.opCost, 
      params.period,
      stateManager.dcfParams.rentSpread,
      stateManager.dcfParams.longtermInflation,
      stateManager.dcfParams.mortgageSpread,
      stateManager.dcfParams.useCpbExit,
      investorType()
    );

    if (data.error) {
      console.error('Error:', data.error);
      return 0;
    }

    // Calculate average IRR with increased parameter
    const avgIrrIncrease = data.five_year_avg_irr ||
                          (data.irr_values.reduce((a, b) => a + b, 0) / data.irr_values.length);

    // Calculate percent change in IRR
    const irrPercentChange = (avgIrrIncrease - stateManager.baselineIrr) / stateManager.baselineIrr * 100;

    // Calculate sensitivity
    let sensitivity = irrPercentChange;

    // For percentage parameters, calculate elasticity
    if (parameter !== 'period') {
      sensitivity = irrPercentChange / (step * 100); // Normalize to 1% change
    }

    // Update state
    stateManager.sensitivities[parameter] = sensitivity;

    // Update display
    updateSensitivityDisplay(parameter, sensitivity);

    return sensitivity;
  } catch (error) {
    console.error(`Error calculating ${parameter} sensitivity:`, error);
    return 0;
  } finally {
    hideLoading();
  }
}

// Calculate sensitivities for all parameters
export async function calculateAllSensitivities() {
  await calculateParameterSensitivity('ltv', 0.01);
  await calculateParameterSensitivity('opcost', 0.01);
  await calculateParameterSensitivity('period', 1);
}

// Calculate TVP sensitivity
export async function calculateTVPSensitivity() {
  showLoading();

  try {
    const param = stateManager.currentParam;
    const ltv = controls.ltvSlider.getValue() / 100;
    const opCost = controls.opcostSlider.getValue() / 100;
    const period = controls.periodSlider.getValue();
    
    // Get DCF parameters from state manager
    const { rentSpread, longtermInflation, mortgageSpread, useCpbExit } = stateManager.getDCFParams();

    // Store original values
    const originalValues = [...stateManager.currentParamData.values];
    const years = [...stateManager.currentParamData.years];

    console.log('calculateTVPSensitivity: using DCF params', { useCpbExit });

    // First calculate the baseline with original values. Not persisted: the
    // readout is asking what the data gives, not setting anything, and stored
    // it left the published series behind as an edit the reader never made.
    const originalData = await applyParameterChanges(
      param,
      years,
      originalValues,
      ltv,
      opCost,
      period,
      rentSpread,
      longtermInflation,
      mortgageSpread,
      useCpbExit,
      investorType(),
      false
    );

    if (originalData.error) {
      console.error('Error:', originalData.error);
      return;
    }

    // Find latest year
    const latestYear = Math.max(...years);
    const latestYearIndex = years.indexOf(latestYear);

    if (latestYearIndex === -1) {
      console.error('Error: Latest year not found in data');
      return;
    }

    // Create a copy of original values for testing the latest year
    const increasedValues = [...originalValues];

    // Apply a 1% increase only to the latest year we're testing
    increasedValues[latestYearIndex] = originalValues[latestYearIndex] * 1.01;

    // Calculate IRR with increased value for the latest year. Not persisted:
    // stored, the +1% stayed applied to every later calculation (and compounded
    // on each page load).
    const increasedData = await applyParameterChanges(
      param,
      years,
      increasedValues,
      ltv,
      opCost,
      period,
      rentSpread,
      longtermInflation,
      mortgageSpread,
      useCpbExit,
      investorType(),
      false
    );

    if (increasedData.error) {
      console.error('Error:', increasedData.error);
      return;
    }

    // Find the year index in the returned data
    const yearIndex = originalData.years.indexOf(latestYear);

    // Calculate sensitivity as change in IRR for the same year
    let avgSensitivity = 0;
    if (yearIndex !== -1) {
      const originalIrr = originalData.irr_values[yearIndex];
      const increasedIrr = increasedData.irr_values[yearIndex];
      avgSensitivity = (increasedIrr - originalIrr) / originalIrr * 100;
    }

    // Update display
    updateTVPSensitivityDisplay(avgSensitivity);

    // Restore original state
    stateManager.irrData = originalData.irr_values;
    updateChart(originalData.irr_values, originalData.required_return_values || stateManager.requiredReturnData);
  } catch (error) {
    console.error('Error calculating TVP sensitivity:', error);
  } finally {
    hideLoading();
  }
}

// Update sensitivity display
function updateSensitivityDisplay(parameter, sensitivity) {
  const formattedSensitivity = sensitivity > 0 ?
    `+${sensitivity.toFixed(2)}` : sensitivity.toFixed(2);

  // Apply to corresponding element
  switch(parameter) {
    case 'ltv':
      if (elements.ltvSensitivity) {
        elements.ltvSensitivity.textContent = formattedSensitivity;
        // Apply color based on value
        elements.ltvSensitivity.style.color = sensitivity > 0 ? '#28a745' :
                                    sensitivity < 0 ? '#dc3545' : '#4263eb';
      }
      break;
    case 'opcost':
      if (elements.opcostSensitivity) {
        elements.opcostSensitivity.textContent = formattedSensitivity;
        // Apply color based on value
        elements.opcostSensitivity.style.color = sensitivity > 0 ? '#28a745' :
                                    sensitivity < 0 ? '#dc3545' : '#4263eb';
      }
      break;
    case 'period':
      if (elements.periodSensitivity) {
        elements.periodSensitivity.textContent = formattedSensitivity;
        // Apply color based on value
        elements.periodSensitivity.style.color = sensitivity > 0 ? '#28a745' :
                                    sensitivity < 0 ? '#dc3545' : '#4263eb';
      }
      break;
  }
}

// Update TVP sensitivity display
function updateTVPSensitivityDisplay(sensitivity) {
  if (!elements.tvpSensitivityValue) return;

  // Format with sign and 2 decimal places
  const formattedSensitivity = sensitivity > 0 ?
    `+${sensitivity.toFixed(2)}` : sensitivity.toFixed(2);

  elements.tvpSensitivityValue.textContent = formattedSensitivity;

  // Apply color based on value
  elements.tvpSensitivityValue.style.color = sensitivity > 0 ? '#28a745' :
                                   sensitivity < 0 ? '#dc3545' : '#4263eb';
}
