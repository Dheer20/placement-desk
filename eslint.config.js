'use strict';

const js = require('@eslint/js');
const globals = require('globals');

// Each source file defines one of these; all files share one global scope
// in Apps Script, so they are globals to each other.
const namespaces = [
  'PdBody', 'PdCoach', 'PdConfig', 'PdDates', 'PdDedupe', 'PdEligibility', 'PdFiles', 'PdMatch', 'PdMime',
  'PdPipeline', 'PdPlan', 'PdPrefill', 'PdQueries', 'PdSubject', 'PdText',
  'PdForms', 'PdLists', 'PdMail', 'PdRunner', 'PdStore'
];
const googleServices = [
  'SpreadsheetApp', 'Gmail', 'Utilities', 'UrlFetchApp', 'MailApp', 'LockService',
  'PropertiesService', 'HtmlService', 'ScriptApp', 'Session', 'Logger'
];
const readonly = (names) => Object.fromEntries(names.map((n) => [n, 'readonly']));

module.exports = [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: Object.assign({ Intl: 'readonly' }, readonly(namespaces), readonly(googleServices))
    },
    rules: {
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-unused-vars': ['error', { varsIgnorePattern: '^(Pd[A-Z]\\w*|PD_[A-Z_]+|onOpen|pd[A-Z]\\w*)$', caughtErrors: 'none' }],
      // Untrusted text must never be executed.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      strict: ['error', 'function']
    }
  },
  {
    // The entry points are plain global functions, as Apps Script requires.
    files: ['src/gas/App.js'],
    rules: { strict: 'off' }
  },
  {
    files: ['test/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
    rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }], eqeqeq: ['error', 'always'] }
  }
];
