// state-manager.js - Centralized state management

export class StateManager {
  constructor() {
    // IRR data
    this.irrData = [];
    this.yearsData = [];
    this.requiredReturnData = [];
    // Dotted benchmark: the default investor type at its defaults (server-rendered)
    this.benchmarkIrrData = [];

    // Parameter data
    this.currentParam = '';
    this.currentParamData = {
      years: [],
      values: [],
      unit: '%'
    };
    this.originalParamData = {
      years: [],
      values: [],
      unit: '%'
    };

    // Parameter states
    this.parameterStates = {};

    // Other state
    this.baselineIrr = 0;
    this.sensitivities = {
      ltv: 40,
      opcost: 0,
      period: 0
    };
    this.isFirstUpdate = true;

    // Global state for maintaining IRR data across parameters
    this.globalIRRData = null;

    // DCF parameters (CPB-related and mortgage spread)
    this.dcfParams = {
      rentSpread: 0.01,        // Default: 1%
      longtermInflation: 0.022, // Default: 2.2%
      mortgageSpread: 0.0153,   // Default: 1.53%
      useCpbExit: true          // Default: use CPB inflation (checked by default)
    };


  }

  // Get current IRR data
  getIRRData() {
    return this.irrData.length > 0 ? [...this.irrData] : null;
  }

  // Set IRR data
  setIRRData(irrData) {
    if (irrData && irrData.length > 0) {
      this.irrData = [...irrData];
      // Also update global IRR data
      this.globalIRRData = [...irrData];
      return true;
    }
    return false;
  }

  // Update IRR data from API response
  updateIRRData(data) {
    if (data.irr_values) {
      this.irrData = data.irr_values;
      // Also update global IRR data
      this.globalIRRData = [...data.irr_values];

      if (data.required_return_values) {
        this.requiredReturnData = data.required_return_values;
      }

      // Update years if provided
      if (data.years) {
        this.yearsData = data.years;
      }

      return true;
    }
    return false;
  }

  // Set current parameter
  setCurrentParameter(paramType) {
    const previousParam = this.currentParam;
    this.currentParam = paramType;

    return previousParam;
  }

  // Check if we have state for a parameter
  // Drop the cached per-year values, so the next load reads the server again.
  clearParameterStates() {
    this.parameterStates = {};
    this.originalParamData = null;
  }

  hasParameterState(paramType) {
    return !!this.parameterStates[paramType];
  }

  // Preserve IRR data (important when switching parameters)
  preserveIRRData(irrData) {
    this.globalIRRData = [...irrData];
    console.log("Preserved IRR data for parameter switching");
    return true;
  }

  // Save current parameter state
  saveCurrentParameterState() {
    // Nothing to save before the editor has read a parameter, or right after the
    // cache was cleared: there is no reference to compare against yet.
    if (!this.currentParam || !this.currentParamData || !this.originalParamData
        || !Array.isArray(this.originalParamData.values)
        || this.currentParamData.values.length === 0) {
      return false;
    }

    // Get current values
    const values = this.currentParamData.values;

    // Check if modified
    let isModified = false;
    for (let i = 0; i < this.originalParamData.values.length; i++) {
      if (Math.abs(values[i] - this.originalParamData.values[i]) > 0.0001) {
        isModified = true;
        break;
      }
    }

    // Create or update parameter state - ONLY store parameter values, not IRR data
    this.parameterStates[this.currentParam] = {
      years: [...this.currentParamData.years],
      values: [...values],
      unit: this.currentParamData.unit,
      modified: isModified,
      originalValues: [...this.originalParamData.values]
    };

    console.log(`Saved state for parameter ${this.currentParam}, modified: ${isModified}`);
    return true;
  }

  // Restore parameter state
  restoreParameterState(paramType) {
  const paramState = this.parameterStates[paramType];

  if (!paramState) {
    console.error(`No state found for parameter: ${paramType}`);
    return null;
  }

  // Restore parameter data
  this.currentParamData = {
    years: [...paramState.years],
    values: [...paramState.values],
    unit: paramState.unit
  };

  // Restore original data for reset comparison
  this.originalParamData = {
    years: [...paramState.years],
    values: [...paramState.originalValues],
    unit: paramState.unit
  };

  console.log(`Restored state for parameter ${paramType}`);
  return paramState;
}

  // Update current parameter values
  updateCurrentParameterValues(values) {
    this.currentParamData.values = [...values];

    // Update parameter state if it exists
    if (this.parameterStates[this.currentParam]) {
      this.parameterStates[this.currentParam].values = [...values];

      // Check if modified
      let isModified = false;
      for (let i = 0; i < this.originalParamData.values.length; i++) {
        if (Math.abs(values[i] - this.originalParamData.values[i]) > 0.0001) {
          isModified = true;
          break;
        }
      }

      this.parameterStates[this.currentParam].modified = isModified;
    }

    return true;
  }

  // Reset current parameter to original values
  resetCurrentParameter() {
    if (!this.currentParam) {
      console.error('No current parameter to reset');
      return false;
    }

    if (!this.parameterStates[this.currentParam]) {
      console.error(`No state found for parameter: ${this.currentParam}`);
      return false;
    }

    // Get original values
    const originalValues = this.parameterStates[this.currentParam].originalValues ||
                          this.originalParamData.values;

    // Update current parameter data
    this.currentParamData.values = [...originalValues];

    // Update parameter state
    this.parameterStates[this.currentParam].values = [...originalValues];
    this.parameterStates[this.currentParam].modified = false;


    return true;
  }

  // Process parameter data from API
  processParameterData(data) {
    let paramYears = [];
    let paramValues = [];

    // Create map of years to values
    const yearToValueMap = {};
    for (let i = 0; i < data.years.length; i++) {
      yearToValueMap[data.years[i]] = data.values[i];
    }

    // Use years from main chart or from data
    if (this.yearsData.length > 0) {
      const sortedYears = [...this.yearsData].sort((a, b) => a - b);

      for (let year of sortedYears) {
        paramYears.push(year);
        paramValues.push(yearToValueMap[year] !== undefined ? yearToValueMap[year] : 0);
      }
    } else {
      paramYears = data.years;
      paramValues = data.values;
    }

    // The reference the editor measures an edit against is the stored series,
    // which the server sends as `original`. Using the current values would make
    // an edit carried over from an earlier visit its own baseline.
    const storedByYear = {};
    if (Array.isArray(data.original)) {
      (data.years || []).forEach((year, i) => { storedByYear[year] = data.original[i]; });
    }
    const storedValues = Array.isArray(data.original)
      ? paramYears.map((year, i) => (storedByYear[year] !== undefined ? storedByYear[year] : paramValues[i]))
      : [...paramValues];

    this.originalParamData = {
      years: paramYears,
      values: storedValues,
      unit: data.unit || '%'
    };

    this.currentParamData = {
      years: [...paramYears],
      values: [...paramValues],
      unit: data.unit || '%'
    };

    // Store in parameter states
    this.parameterStates[this.currentParam] = {
      years: [...paramYears],
      values: [...paramValues],
      unit: data.unit || '%',
      modified: false,
      originalValues: [...paramValues]
    };

    // If we have global IRR data, store it
    if (this.globalIRRData) {
      this.parameterStates[this.currentParam].irrData = [...this.globalIRRData];

      if (this.requiredReturnData.length > 0) {
        this.parameterStates[this.currentParam].requiredReturnData = [...this.requiredReturnData];
      }
    }

    return {
      years: paramYears,
      values: paramValues,
      unit: data.unit || '%'
    };
  }

  // Get DCF parameters
  getDCFParams() {
    return { ...this.dcfParams };
  }

  // Set DCF parameters
  setDCFParams(rentSpread, longtermInflation, mortgageSpread, useCpbExit = false) {
    this.dcfParams.rentSpread = rentSpread;
    this.dcfParams.longtermInflation = longtermInflation;
    this.dcfParams.mortgageSpread = mortgageSpread;
    this.dcfParams.useCpbExit = useCpbExit;
    console.log(`StateManager: DCF params updated - rentSpread=${rentSpread}, longtermInflation=${longtermInflation}, mortgageSpread=${mortgageSpread}, useCpbExit=${useCpbExit}`);
  }

  // Reset DCF parameters to defaults
  resetDCFParams() {
    this.dcfParams.rentSpread = 0.01;
    this.dcfParams.longtermInflation = 0.022;
    this.dcfParams.mortgageSpread = 0.0153;
    this.dcfParams.useCpbExit = true;  // Default: use CPB inflation (checked)
    console.log('StateManager: DCF params reset to defaults');
  }

  // Reset all state
  resetAll() {
    // Clear parameter states
    this.parameterStates = {};

    // Reset current parameter
    this.currentParam = '';

    // Reset parameter data
    this.currentParamData = {
      years: [],
      values: [],
      unit: '%'
    };

    this.originalParamData = {
      years: [],
      values: [],
      unit: '%'
    };

    // Clear global IRR data
    this.globalIRRData = null;

    // Reset DCF parameters
    this.resetDCFParams();

    // Reset other state
    this.isFirstUpdate = true;


    return true;
  }
}