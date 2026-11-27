# Monitor Investeringsklimaat Middenhuur

## Nederlands

**Monitor Investeringsklimaat Middenhuur**

De Monitor geeft een objectief beeld van het investeringsklimaat voor middenhuurwoningen. Hij vergelijkt jaarlijks het verwachte rendement (IRR) van een belegger in middenhuur met het vereiste rendement (CAPM-norm). Ligt het verwachte rendement boven het vereiste, dan is het investeringsklimaat gemiddeld gunstig.

Ontwikkeld door prof. dr. Dirk Brounen, dr. Xudong Sun (Universiteit Maastricht) en prof. dr. Arno van der Vlist (Rijksuniversiteit Groningen/Amsterdam School of Real Estate), samen met marktpartijen, brancheorganisaties en het Rijk, en gevalideerd in het Structureel Overleg Investeringsklimaat.

Meer informatie: [Volkshuisvesting Nederland](https://www.volkshuisvestingnederland.nl/onderwerpen/aanpak-woningnood/spelers-op-de-woningmarkt/monitor-investeringsklimaat-middenhuur)

## English

**Monitor Investeringsklimaat Middenhuur (Mid-Rent Investment Climate Monitor)**

The Monitor gives an objective picture of the investment climate for mid-rent housing in the Netherlands. Each year it compares the expected return (IRR) of an investor in mid-rent housing with the required return (CAPM norm). When the expected return is above the required return, the investment climate is, on average, favourable.

Developed by Prof. Dr. Dirk Brounen, Dr. Xudong Sun (Maastricht University) and Prof. Dr. Arno van der Vlist (University of Groningen/Amsterdam School of Real Estate), together with market parties, industry organisations and the national government, and validated in the Structureel Overleg Investeringsklimaat.

More information: [Volkshuisvesting Nederland](https://www.volkshuisvestingnederland.nl/onderwerpen/aanpak-woningnood/spelers-op-de-woningmarkt/monitor-investeringsklimaat-middenhuur)

---

## What this repository is

The open version of the Monitor: a set of static files, with every calculation
running in the browser. There is no server, no account and no database. Opening
`index.html` is the whole of it.

Three investor types are shown — institutional, private and foreign — on three
tabs:

- **Historie / Main analysis** — the expected return per purchase year with its
  spread of individual investors, the CAPM norm, and the reference line of the
  default type. A box plot in place of the dots, the quick DCF panel, and the
  per-year editor above the chart, where the mortgage rate, the rent, inflation,
  the transaction price and the transfer tax can be moved year by year and the
  chart follows.
- **3 Jaar Focus / 3-year window** — one purchase year with the year before and
  after, and what moves that year's return.
- **Data** — the investor types side by side for a chosen purchase year, every
  series the model reads with its publisher and what kind of figure each year's
  value is, and a spreadsheet of both tables.

Demo mode, on until it is switched off, puts a note beside whatever the pointer
is on. The page is in Dutch and English.

## The numbers

The return is an internal rate of return on the cash flow of one dwelling, held
for the period set: the purchase price and the transfer tax against the loan at
t=0, then the rent less the operating costs, the interest and the taxes of the
investor type, and the sale at the end. The norm is the CAPM figure of the year
the money went in: the risk-free rate, beta on the equity risk premium, and the
liquidity premium.

The calculation is `js/modules/engine.js`, which is the engine the Monitor runs
on. The data is prepared for it by `js/modules/dataset.js`: the published series
are read into one table, the ten-year averages are added, and the years without
the data the engine needs are dropped. The ten-year averages are summed by a
running sum with a compensation term, which is how the Monitor's own preparation
summed them, so the figures are the ones the published Monitor shows — for 2026
and an institutional investor at the defaults, a return of 4.248167% against a
norm of 6.456%.

## Data sources

| Series | Publisher |
| --- | --- |
| Average sale price and price growth, existing homes | CBS |
| Average monthly rent and rent increases | CBS |
| Consumer price index | CBS |
| Mortgage rate, 10 years and over | DNB |
| Government bond yield, 10 years | ECB |
| Inflation | CPB |
| Equity risk premium | Damodaran |
| Transfer tax, corporate tax, VAT, Box 3 | Belastingdienst |

Every series, with its publisher and its status per year, is on the Data tab and
in `data/registry.json`.

## Opening it locally

The page is static, but it reads its data with `fetch`, which a browser does not
allow from a `file://` address. So serve the folder over HTTP:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Any static file server will do.

## What is in the repository

```
index.html          the page
css/                the styles
js/
  i18n.js           Dutch and English
  main.js           the page's wiring
  modules/
    engine.js       the investment, year by year
    dataset.js      the published data, prepared for the engine
    api.js          what the page asks for, answered in this browser
    data-registry.js  the Data tab's two tables
    chart.js, three-year-window.js, curve-editor.js, ... the drawing
data/               the published series, as JSON
vendor/             ECharts and JetBrains Mono, served from here
```

## Licences

The code is under the MIT licence; see [LICENSE](LICENSE).

The documentation and the data descriptions are under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/);
see [LICENSE-docs](LICENSE-docs). The underlying figures are published by the
bodies named above and carry their own terms.

Third-party files in `vendor/`, each under its own licence:

- Apache ECharts — Apache License 2.0 (`vendor/echarts/LICENSE`, `NOTICE`)
- JetBrains Mono — SIL Open Font License 1.1 (`vendor/jetbrains-mono/OFL.txt`)

© 2026 Prof. Dr. Dirk Brounen, Dr. Xudong Sun (Maastricht University) and
Prof. Dr. Arno van der Vlist (University of Groningen/Amsterdam School of Real
Estate) · Data: CBS, DNB, ECB, CPB, Belastingdienst
