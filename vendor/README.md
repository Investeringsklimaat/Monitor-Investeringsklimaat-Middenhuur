# Files from elsewhere, served with the page

The page loads these from here rather than from a third party, so it needs no
host but the one it is served from.

- `echarts/` — Apache ECharts 5.6.0: the `dist/echarts.min.js` as published,
  unchanged. Apache License 2.0, in `LICENSE` and `NOTICE`.
- `jetbrains-mono/` — JetBrains Mono at weights 300 to 700: the woff2 files
  Google Fonts serves for `css2?family=JetBrains+Mono:wght@300;400;500;600;700`
  `&display=swap`, with that stylesheet's own `@font-face` rules and unicode
  ranges kept in `jetbrains-mono.css`, so a browser still fetches only the
  subsets it needs. SIL Open Font License 1.1, in `OFL.txt`.

Replacing either of them means replacing its licence file with it.
