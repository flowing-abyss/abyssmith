/** @type {import('stylelint').Config} */
const config = {
  extends: ['stylelint-config-obsidianmd', 'stylelint-config-standard'],
  rules: {
    // The earliest supported desktop installer (Obsidian 0.14.5 for app 1.0.3)
    // uses Chromium 100; the vendor default targets only recent Electron. Keep
    // this floor in sync with manifest.json and the earliest E2E capability.
    'plugin/no-unsupported-browser-features': [true, { browsers: ['chrome >= 100'], ignore: [] }],
    'selector-max-type': 0,
    'custom-property-pattern': null,
  },
};

export default config;
