// One lint setup for the whole repo: `npm run lint` from the project root.
// The aim is to catch real mistakes (undefined names, unused code, broken hook usage), not to argue about style.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'server/uploads/**', 'ui-report/**'] },

  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // A leading underscore marks something deliberately unused; `...rest` siblings are a way to omit a key.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Server and repo tooling run in Node.
  {
    files: ['server/**/*.js', 'scripts/**/*.{js,mjs}', 'client/vite.config.js', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
  // The UI check script also contains functions that run inside the browser page.
  { files: ['scripts/ui-check.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },

  // The website runs in the browser.
  {
    files: ['client/src/**/*.{js,jsx}'],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // Tests run in Node and also use browser objects (jsdom).
  { files: ['client/src/**/*.test.{js,jsx}', 'client/src/test/**'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { files: ['client/public/sw.js'], languageOptions: { sourceType: 'script', globals: globals.serviceworker } },
];
