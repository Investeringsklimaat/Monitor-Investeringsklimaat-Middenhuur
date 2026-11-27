// utils.js - Utility functions

// Text made safe to put into HTML: & < > " escaped, null and undefined as ''.
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Debounce function to limit API calls
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Show loading indicator
export function showLoading() {
  document.body.classList.add('loading');
}

// Hide loading indicator
export function hideLoading() {
  document.body.classList.remove('loading');
}

// Show calculating indicator
export function showCalculating() {
  document.body.classList.add('calculating');
}

// Hide calculating indicator
export function hideCalculating() {
  document.body.classList.remove('calculating');
}

// Update DOM element with animation
export function updateElement(element, value, unit = '') {
  if (!element) return;

  element.textContent = value + unit;
  element.classList.add('value-changed');

  setTimeout(() => {
    element.classList.remove('value-changed');
  }, 1500);
}

// Update IRR displays with animation
export function updateIRRDisplays(irrValues, years, latestYearElement, avgYearElement) {
  if (!irrValues || !years || irrValues.length === 0 || years.length === 0) {
    console.error('Invalid IRR or years data');
    return;
  }

  // Sort the data by year to ensure we're getting the latest
  const combinedData = years.map((year, index) => ({
    year: year,
    irr: irrValues[index]
  })).sort((a, b) => b.year - a.year); // Sort descending

  // Get the latest year's IRR
  const latestIrr = combinedData[0].irr;

  // Calculate 5-year average IRR (or as many years as available up to 5)
  let fiveYearSum = 0;
  let count = 0;

  for (let i = 0; i < Math.min(5, combinedData.length); i++) {
    fiveYearSum += combinedData[i].irr;
    count++;
  }

  const fiveYearAvg = count > 0 ? fiveYearSum / count : 0;

  // Update the DOM elements
  if (latestYearElement) {
    updateElement(latestYearElement, latestIrr.toFixed(2), '%');
  }

  if (avgYearElement) {
    updateElement(avgYearElement, fiveYearAvg.toFixed(2), '%');
  }

  // Return the average for sensitivity calculations
  return fiveYearAvg;
}

// Watch an element's size and run something when it changes.
//
// A chart measures its container when it is created or resized. A tab that is
// not the one on screen has no width to measure, so a chart created or resized
// while its tab is hidden comes back a hundred pixels wide and stays that way
// when the tab is shown again. Measuring nothing is skipped, and showing a
// pane again is a size change like any other, so the chart is told to measure
// itself once it has a width.
export function watchSize(element, run) {
  if (!element) return () => {};
  const size = () => `${element.clientWidth}x${element.clientHeight}`;
  let seen = size();
  const measure = () => {
    if (!element.clientWidth || size() === seen) return;
    seen = size();
    run();
  };
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }
  window.addEventListener('resize', measure);
  return () => window.removeEventListener('resize', measure);
}
