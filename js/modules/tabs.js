// tabs.js - The page tabs: switching between them.
//
// The page hands over what it shares with initTabs().

import * as ThreeYearWindow from './three-year-window.js';

let elements = null;
let controls = null;
let stateManager = null;

// The page's element and control references and its state manager.
export function initTabs(page) {
  ({ elements, controls, stateManager } = page);
}

// Initialize tab navigation
export function initializeTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  let threeYearWindowInitialized = false;

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      // Remove active class from all buttons
      tabButtons.forEach(btn => btn.classList.remove('active'));

      // Add active class to clicked button
      button.classList.add('active');

      // Hide all tab contents
      tabContents.forEach(content => {
        content.style.display = 'none';
      });

      // Show target tab content
      const targetContent = document.getElementById(targetTab);
      if (targetContent) {
        targetContent.style.display = 'block';
      }

      // The investor type and DCF settings belong to the analysis tabs
      const analysisBar = document.getElementById('analysis-bar');
      if (analysisBar) analysisBar.hidden = targetTab === 'data-sources';

      // Initialize Three-Year Window when tab is first opened
      if (targetTab === 'three-year' && !threeYearWindowInitialized) {
        ThreeYearWindow.initialize(stateManager, controls);
        threeYearWindowInitialized = true;
      } else if (targetTab === 'three-year') {
        // Refresh data when returning to the tab
        ThreeYearWindow.refresh(stateManager, controls);
      } else if (targetTab === 'data-sources') {
        import('./data-page.js').then(m => m.showDataPage());
      }
    });
  });
}
