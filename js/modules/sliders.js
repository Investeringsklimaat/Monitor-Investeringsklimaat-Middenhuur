// sliders.js - Handles all slider functionality
export class ParameterSlider {
  constructor(element, valueDisplay, unit, initialValue, onChange, options = {}) {
    this.element = element;
    this.valueDisplay = valueDisplay;
    this.unit = unit;
    this.onChange = onChange;
    this.options = {
      scaleFactor: 1,  // Default scale factor
      decimals: 2,     // Default decimal places
      ...options
    };

    // Set initial value
    this.setValue(initialValue);

    // Add event listener
    this.element.addEventListener('input', () => {
      const value = this.getValue();
      this.updateDisplay(value);

      if (this.onChange) {
        this.onChange(value);
      }
    });
  }

  getValue() {
    // Get the raw value from the slider and apply scaling
    const rawValue = parseFloat(this.element.value);
    return rawValue / this.options.scaleFactor;
  }

  setValue(value) {
    // Set the slider value after applying scaling factor
    const scaledValue = value * this.options.scaleFactor;
    this.element.value = scaledValue;
    this.updateDisplay(value);
  }

updateDisplay(value) {
  if (this.valueDisplay) {
    // Format the display value with proper decimals
    const formattedValue = value.toFixed(this.options.decimals);

    // Check if valueDisplay is an input element or a span/text element
    if (this.valueDisplay.tagName === 'INPUT') {
      // For input elements, set value property (no unit, unit is separate)
      this.valueDisplay.value = formattedValue;
    } else {
      // For span/text elements, set textContent (with unit)
      this.valueDisplay.textContent = formattedValue + this.unit;
    }

    this.valueDisplay.classList.add('value-changed');

    setTimeout(() => {
      this.valueDisplay.classList.remove('value-changed');
    }, 1500);
  }
}


}