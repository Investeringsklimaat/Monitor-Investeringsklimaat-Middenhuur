// i18n.js - Internationalization system

const translations = {
  en: {
    // Main UI
    'Main analysis': 'Main analysis',
    '3-year window': '3-year window',
    'Customize DCF': 'DCF',
    'DCF': 'DCF',
    'Full investment plan': 'Full investment plan',
    'Quick DCF adjustment': 'Quick DCF adjustment',
    'Open full investment plan': 'Full investment plan \u2192',
    'Private': 'Private',
    'Institutional': 'Institutional',
    'Social': 'Social',
    'Foreign': 'Foreign',
    'New construction': 'New construction',
    'VAT on purchase': 'VAT on purchase',
    'Mortgage rate': 'Mortgage rate',
    'Average monthly rent': 'Average monthly rent',
    'Basic inflation': 'Inflation',
    'CPI growth': 'CPI growth',
    'Property price': 'Property price',
    'Property price growth (YoY)': 'Property price growth (YoY)',
    'Property price growth (10Y)': 'Property price growth (10Y)',
    'Return': 'Return',
    'Year': 'Year',
    'Op Cost': 'Op Cost',
    'Period': 'Period',
    'Rent: CPB+': 'Rent: CPB+',
    'LT Inflation': 'LT Inflation',
    'Liq premium': 'Liq premium',
    
    // Additional common terms
    'LTV': 'LTV',
    'Beta': 'Beta',
    'CAPM Norm': 'CAPM Norm',
    'Transfer Tax': 'Transfer Tax',
    'Transfer tax': 'Transfer tax',
    // Investor-type tax regimes
    'Corporate tax': 'Corporate tax',
    'VAT': 'VAT',
    'Box 3': 'Box 3',
    'at LTV': 'at LTV',
    'No investor type selected': 'No investor type selected',
    'Mortgage Spread': 'Mortgage Spread',
    'Use CPB-based Growth': 'Use CPB-based Growth',
    'Apply Changes': 'Apply Changes',
    'Reset to Default': 'Reset to Default',
    'Close': 'Close',
    'IRR Analysis': 'IRR Analysis',
    'Cloud note': "The blue line is the Monitor's estimate from current data and the model; returns of individual investors vary around it, as the dots show.",
    'Demo mode': 'Demo mode',
    'Expected IRR Parameters': 'Expected IRR Parameters',
    'CAPM Norm Parameters': 'CAPM Norm Parameters',
    'Reset This Parameter': 'Reset This Parameter',
    'Customize DCF Parameters': 'DCF',
    'Select Year:': 'Select Year:',
    'Parameter Impact at': 'Parameter Impact at',
    // Chart legend / tooltip labels (kept English internally, displayed via i18n)
    'Expected IRR': 'Expected IRR',
    'Reference IRR': 'Reference IRR',
    'IRR with customized DCF': 'IRR with customized DCF',
    'CAPM norm with customized DCF': 'CAPM norm with customized DCF',
    'Plan': 'Plan',
    'IRR Distribution': 'IRR Distribution',
    'Median': 'Median',
    // Page chrome
    'Property Investment Analysis': 'Property Investment Analysis',
    'Line Chart': 'Line Chart',
    'Box Plot': 'Box Plot',
    'Added to base mortgage rate': 'Added to base mortgage rate',
    // Tooltip / hint strings
    'Previous Year': 'Previous Year',
    'Next Year': 'Next Year',
    'Sensitivity:': 'Sensitivity:',
    'for 1% increase': 'for 1% increase',
    'for +1 year': 'for +1 year',
    'Rent growth = CPB + spread': 'Rent growth = CPB + spread',
    'For years beyond 2026': 'For years beyond 2026',
    'If checked: Rent & Exit use CPB inflation; If unchecked: Use historical Rent Growth & Property Price Growth': 'If checked: Rent & Exit use CPB inflation; If unchecked: Use historical Rent Growth & Property Price Growth',
    // 3-year focus — sensitivity panel display_name values (from backend)
    'Loan-to-Value (LTV)': 'Loan-to-Value (LTV)',
    'Operating Cost': 'Operating Cost',
    'Holding Period': 'Holding Period',
    'Rent Growth Spread': 'Rent Growth Spread',
    'Long-term Inflation': 'Long-term Inflation',
    'Monthly Rent Level': 'Monthly Rent Level',
    'for 1 year increase': 'for 1 year increase',
    // Data tab
    'Data': 'Data',
    'Data version': 'Data version',
    'Download Excel': 'Download Excel',
    'Versions': 'Versions',
    'Show all': 'Show all',
    'Values per year': 'Values per year',
    'Changes': 'Changes',
    'changes': 'changes',
    'and': 'and',
    'more years': 'more years',
    'added': 'added',
    'No effect on the IRR': 'No effect on the IRR',
    'Series': 'Series',
    'Unit': 'Unit',
    'Source': 'Source',
    'Date': 'Date',
    'Version': 'Version',
    'Old': 'Old',
    'New': 'New',
    'Note': 'Note',
    'Last change': 'Last change',
    'New value': 'New value',
    'Save': 'Save',
    'Cancel': 'Cancel',
    'actual': 'actual',
    'forecast': 'forecast',
    'estimate': 'estimate',
    'assumption': 'assumption',
    'changed in the selected version': 'changed in the selected version',
    'Choices': 'Data source selection',
    'Data source selection': 'Data source selection',
    'Investor types': 'Investor types',
    'Back to top': 'Back to top',
    'CAPM norm': 'CAPM norm',
    'Changed in': 'Changed in',
    'Only rows that differ': 'Only rows that differ',
    'Input': 'Input',
    'vs': 'vs',
    'yrs': 'yrs',
    'Back to defaults': 'Back to defaults',
    'default': 'default',
    'norm': 'norm',
    'set by a choice above': 'set by a choice above',
    'credits': '© 2026 Prof. Dr. Dirk Brounen, Dr. Xudong Sun (Maastricht University) and Prof. Dr. Arno van der Vlist (University of Groningen/Amsterdam School of Real Estate) · Data: CBS, DNB, ECB, CPB, Belastingdienst',
    'Source code (open source)': 'Source code (open source)',
    'Open source': 'Open source',
    'Source code on': 'Source code on'
  },
  nl: {
    // Main UI
    'Main analysis': 'Historie',
    '3-year window': '3 Jaar Focus',
    'Customize DCF': 'DCF',
    'DCF': 'DCF',
    'Full investment plan': 'Volledig investeringsplan',
    'Quick DCF adjustment': 'DCF snel aanpassen',
    'Open full investment plan': 'Volledig investeringsplan \u2192',
    'Private': 'Particulier',
    'Institutional': 'Institutioneel',
    'Social': 'Sociaal',
    'Foreign': 'Buitenlands',
    'New construction': 'Nieuwbouw',
    'VAT on purchase': 'Btw bij aankoop',
    'Mortgage rate': 'Hypotheekrente',
    'Average monthly rent': 'Maandhuur',
    'Basic inflation': 'Inflatie',
    'CPI growth': 'Inflatie (CPI)',
    'Property price': 'Transactieprijs',
    'Property price growth (YoY)': 'Prijsstijgingen Leegwaarde',
    'Property price growth (10Y)': 'Gemiddelde Jaarlijkse Prijsstijging (10 Jaar)',
    'Return': 'Rendement',
    'Year': 'Jaar',
    'Op Cost': 'Op Kosten',
    'Period': 'Periode',
    'Rent: CPB+': 'Huuropslag Inflatie+',
    'LT Inflation': 'Lange Termijn Inflatie (CPB)',
    'Liq premium': 'Liq Premie',
    
    // Additional common terms
    'LTV': 'LTV',
    'Beta': 'Beta',
    'CAPM Norm': 'CAPM Norm',
    'Transfer Tax': 'Overdrachtsbelasting',
    'Transfer tax': 'Overdrachtsbelasting',
    // Investor-type tax regimes
    'Corporate tax': 'Vennootschapsbelasting',
    'VAT': 'BTW',
    'Box 3': 'Box 3',
    'at LTV': 'bij LTV',
    'No investor type selected': 'Geen beleggerstype geselecteerd',
    'Mortgage Spread': 'Mortgage Spread',
    'Use CPB-based Growth': 'Gebruik CPB-gebaseerde Groei',
    'Apply Changes': 'Wijzigingen Toepassen',
    'Reset to Default': 'Standaard Herstellen',
    'Close': 'Sluiten',
    'IRR Analysis': 'IRR analyse',
    'Cloud note': 'De blauwe lijn is de schatting van de Monitor op basis van actuele data en het model; het rendement van individuele beleggers varieert daaromheen, zoals de stippen laten zien.',
    'Demo mode': 'Demomodus',
    'Expected IRR Parameters': 'Verwachte IRR Parameters',
    'CAPM Norm Parameters': 'CAPM Norm',
    'Reset This Parameter': 'Reset Deze Parameter',
    'Customize DCF Parameters': 'DCF',
    'Select Year:': 'Selecteer Jaar:',
    'Parameter Impact at': 'Parameter-effect in',
    // Chart legend / tooltip labels
    'Expected IRR': 'IRR verwachting',
    'Reference IRR': 'Referentie IRR',
    'IRR with customized DCF': 'IRR met aangepaste DCF',
    'CAPM norm with customized DCF': 'CAPM-norm met aangepaste DCF',
    'Plan': 'Plan',
    'IRR Distribution': 'IRR Verdeling',
    'Median': 'Mediaan',
    // Page chrome
    'Property Investment Analysis': 'Vastgoedbeleggingen Analyse',
    'Line Chart': 'Lijngrafiek',
    'Box Plot': 'Boxplot',
    'Added to base mortgage rate': 'Toegevoegd aan basis hypotheekrente',
    // Tooltip / hint strings
    'Previous Year': 'Vorig Jaar',
    'Next Year': 'Volgend Jaar',
    'Sensitivity:': 'Gevoeligheid:',
    'for 1% increase': 'voor 1% stijging',
    'for +1 year': 'voor +1 jaar',
    'Rent growth = CPB + spread': 'Huurgroei = CPB + opslag',
    'For years beyond 2026': 'Voor jaren na 2026',
    'If checked: Rent & Exit use CPB inflation; If unchecked: Use historical Rent Growth & Property Price Growth': 'Indien aangevinkt: Huur & Exit gebruiken CPB inflatie; Indien niet aangevinkt: Gebruik historische Huurgroei & Woningprijsgroei',
    // 3-year focus — sensitivity panel display_name values
    'Loan-to-Value (LTV)': 'Loan-to-Value (LTV)',
    'Operating Cost': 'Operationele Kosten',
    'Holding Period': 'Houdperiode',
    'Rent Growth Spread': 'Huurgroei Opslag',
    'Long-term Inflation': 'Lange Termijn Inflatie',
    'Monthly Rent Level': 'Maandhuur Niveau',
    'Property Price': 'Woningprijs',
    'for 1 year increase': 'voor 1 jaar stijging',
    // Data tab
    'Data': 'Data',
    'Data version': 'Dataversie',
    'Download Excel': 'Download Excel',
    'Versions': 'Versies',
    'Show all': 'Alles tonen',
    'Values per year': 'Waarden per jaar',
    'Changes': 'Wijzigingen',
    'changes': 'wijzigingen',
    'and': 'en',
    'more years': 'jaren meer',
    'added': 'toegevoegd',
    'No effect on the IRR': 'Geen effect op de IRR',
    'Series': 'Reeks',
    'Unit': 'Eenheid',
    'Source': 'Bron',
    'Date': 'Datum',
    'Version': 'Versie',
    'Old': 'Oud',
    'New': 'Nieuw',
    'Note': 'Toelichting',
    'Last change': 'Laatste wijziging',
    'New value': 'Nieuwe waarde',
    'Save': 'Opslaan',
    'Cancel': 'Annuleren',
    'actual': 'gerealiseerd',
    'forecast': 'prognose',
    'estimate': 'schatting',
    'assumption': 'aanname',
    'changed in the selected version': 'gewijzigd in de gekozen versie',
    'Choices': 'Keuze databron',
    'Data source selection': 'Keuze databron',
    'Investor types': 'Beleggerstypen',
    'Back to top': 'Naar boven',
    'CAPM norm': 'CAPM-norm',
    'Changed in': 'Gewijzigd in',
    'Only rows that differ': 'Alleen rijen die verschillen',
    'Input': 'Invoer',
    'vs': 't.o.v.',
    'yrs': 'jaar',
    'Back to defaults': 'Terug naar standaard',
    'default': 'standaard',
    'norm': 'norm',
    'set by a choice above': 'bepaald door een keuze hierboven',
    'credits': '© 2026 prof. dr. Dirk Brounen, dr. Xudong Sun (Universiteit Maastricht) en prof. dr. Arno van der Vlist (Rijksuniversiteit Groningen/Amsterdam School of Real Estate) · Data: CBS, DNB, ECB, CPB, Belastingdienst',
    'Source code (open source)': 'Broncode (open source)',
    'Open source': 'Open source',
    'Source code on': 'Broncode op'
  }
};

// The words of the modules that keep their own tables, each looked up there in
// that module's own way.

// investor-panel.js: the active investor type's settings panel
export const INVESTOR_PANEL_TEXT = {
  nl: {
    tag: 'Prototype',
    collapse: 'Inklappen',
    groupTaxes: 'Belastingen',
    groupDcf: 'DCF-instellingen',
    settings: 'Instellingen',
    showDetails: 'Details voorinstelling bekijken',
    hideDetails: 'Details verbergen',
    spreadShort: 'opslag',
    opCostShort: 'kosten',
    rentPremiumShort: 'huurpremie',
    source: 'Bron',
    irrLabel: 'IRR',
    expand: 'Uitklappen',
    edit: 'bewerk',

    institutional: 'Institutioneel',
    private: 'Particulier',
    social: 'Sociaal',
    foreign: 'Buitenlands',
    new_construction: 'Nieuwbouw',

    ltv: 'Loan-to-value',
    ltv_unit: '% van de aankoopprijs geleend',
    mortgage_spread: 'Renteopslag',
    mortgage_spread_unit: '% bovenop de basishypotheekrente',
    op_cost: 'Exploitatiekosten',
    op_cost_unit: '% van de huur in jaar 1',
    op_cost_suffix: 'van de huur',
    rent_premium: 'Huurpremie',
    rent_premium_unit: '% boven de gemiddelde huur',
    purchase_tax: 'Belasting bij aankoop',
    period: 'Houdperiode',
    period_unit: 'jaar',
    price_premium: 'Nieuwbouwopslag op de prijs',
    price_premium_unit: '% bovenop de huidige prijsbasis',

    transfer_tax: 'Overdrachtsbelasting',
    corporate_tax: 'Vennootschapsbelasting',
    vat_tax: 'Btw',
    box3: 'Box 3',
    box3_at_ltv: 'bij LTV',
    inYear: 'in',
    landlord_levy: 'Verhuurderheffing',

    exempt: 'Vrijgesteld',
    transfer: 'Overdrachtsbelasting',
    vat: 'Btw',
    exempt_long: 'vrijgesteld (0%)',
    transfer_long: 'overdrachtsbelasting zoals bij bestaande bouw (8% in 2026)',
    vat_long: 'btw over de aankoopprijs',
    reference: 'Referentie',
    sourced: 'bron',
    pp: 'pp',
    years: 'jaar',
    invalid: 'Geen geldig getal',
  },
  en: {
    tag: 'Prototype',
    collapse: 'Collapse',
    groupTaxes: 'Taxes',
    groupDcf: 'DCF settings',
    settings: 'Settings',
    showDetails: 'View preset details',
    hideDetails: 'Hide preset details',
    spreadShort: 'spread',
    opCostShort: 'costs',
    rentPremiumShort: 'rent premium',
    source: 'Source',
    irrLabel: 'IRR',
    expand: 'Expand',
    edit: 'edit',

    institutional: 'Institutional',
    private: 'Private',
    social: 'Social',
    foreign: 'Foreign',
    new_construction: 'New construction',

    ltv: 'Loan-to-value',
    ltv_unit: '% of the purchase price borrowed',
    mortgage_spread: 'Mortgage spread',
    mortgage_spread_unit: '% on top of the base mortgage rate',
    op_cost: 'Operating costs',
    op_cost_unit: '% of rent in year 1',
    op_cost_suffix: 'of rent',
    rent_premium: 'Rent premium',
    rent_premium_unit: '% above the average rent',
    purchase_tax: 'Tax on purchase',
    period: 'Holding period',
    period_unit: 'years',
    price_premium: 'New-build price premium',
    price_premium_unit: '% on top of the current price base',

    transfer_tax: 'Transfer tax',
    corporate_tax: 'Corporate tax',
    vat_tax: 'VAT',
    box3: 'Box 3',
    box3_at_ltv: 'at LTV',
    inYear: 'in',
    landlord_levy: 'Verhuurderheffing',

    exempt: 'Exempt',
    transfer: 'Transfer tax',
    vat: 'VAT',
    exempt_long: 'exempt (0%)',
    transfer_long: 'transfer tax as for existing homes (8% in 2026)',
    vat_long: 'VAT on the purchase price',
    reference: 'Reference',
    sourced: 'source',
    pp: 'pp',
    years: 'years',
    invalid: 'Not a valid number',
  },
};

// demo.js: the notes demo mode shows beside an element, by the name demo.js
// keeps each element under
export const DEMO_TEXT = {
  nl: {
    typeButton: 'Zet belastingen en standaardwaarden van dit type. Nogmaals klikken: geen type.',
    panelNumber: 'Klik op het getal of op bewerk om te typen. Enter of wegklikken past toe, Esc annuleert.',
    modalSlider: 'Sleep om in te stellen. De grafiek volgt na Wijzigingen Toepassen.',
    modalCapm: 'Slepen: de CAPM-norm wordt direct opnieuw getekend.',
    modalValue: 'Typ een waarde en druk op Enter. Wijzigingen Toepassen rekent opnieuw.',
    curveDrag: 'Sleep een punt omhoog of omlaag, of zijwaarts over meerdere jaren. Dubbelklik zet een punt terug.',
    curveNumber: 'De waarde van dat jaar. Typ en druk op Enter; Tab gaat naar het volgende jaar.',
    resetAll: 'Zet de instellingen en de jaarwijzigingen terug; het gekozen type blijft.',
    windowYear: 'Kies het middelste jaar; het jaar ervoor en erna komen mee.',
    demoToggle: 'Zet deze notities uit; de keuze blijft bewaard.',
  },
  en: {
    typeButton: "Sets this type's taxes and defaults. Click again for no type.",
    panelNumber: 'Click the number or edit to type. Enter or clicking away applies, Esc cancels.',
    modalSlider: 'Drag to set. The chart follows after Apply Changes.',
    modalCapm: 'Drag: the CAPM norm is redrawn at once.',
    modalValue: 'Type a value and press Enter. Apply Changes recalculates.',
    curveDrag: 'Drag a point up or down, or sideways across several years. Double-click undoes a point.',
    curveNumber: "That year's value. Type and press Enter; Tab goes to the next year.",
    resetAll: 'Resets the settings and the yearly edits; the chosen type stays.',
    windowYear: 'Choose the middle year; the year before and after come with it.',
    demoToggle: 'Turns these notes off; the choice is kept.',
  },
};

class I18n {
  constructor() {
    // Default to Dutch
    this.currentLanguage = localStorage.getItem('language') || 'nl';
  }

  t(key) {
    return translations[this.currentLanguage][key] || key;
  }

  setLanguage(lang) {
    if (translations[lang]) {
      this.currentLanguage = lang;
      localStorage.setItem('language', lang);
      this.updateDOM();
    }
  }

  getCurrentLanguage() {
    return this.currentLanguage;
  }

  updateDOM() {
    // Update all elements with data-i18n attribute (text content / placeholder)
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.t(key);

      // Update text content or placeholder
      if (element.tagName === 'INPUT' && element.placeholder) {
        element.placeholder = translation;
      } else {
        element.textContent = translation;
      }
    });

    // Update title= attribute (hover tooltips) for elements with data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
      element.setAttribute('title', this.t(element.getAttribute('data-i18n-title')));
    });

    // Update page title if needed
    const titleElement = document.querySelector('title[data-i18n]');
    if (titleElement) {
      titleElement.textContent = this.t(titleElement.getAttribute('data-i18n'));
    }

    // Trigger custom event for other components to update
    document.dispatchEvent(new CustomEvent('languageChanged', { 
      detail: { language: this.currentLanguage } 
    }));
  }
}

// Create global instance
const i18n = new I18n();

// Export for use in other modules
export default i18n;

