/**
 * Mocha test setup — registers the vscode mock before any test file loads.
 *
 * Node.js resolves `require('vscode')` through its module cache. This file
 * patches the cache BEFORE the compiled test files are loaded so that any
 * `import * as vscode from 'vscode'` in test or source code resolves to our
 * lightweight in-process mock instead of the real VS Code runtime.
 *
 * Loaded via `.mocharc.json` `require` field.
 */

'use strict'

const Module = require('module')
const path = require('path')

const VSCODE_MOCK_PATH = path.resolve(__dirname, 'dist/test/vscode-mock.js')

// Register the mock in Node's module cache under the 'vscode' key.
// This is the same technique used by the VS Code extension test scaffold
// when running outside the electron environment.
const vscodeMock = require(VSCODE_MOCK_PATH)
require.cache['vscode'] = {
  id: 'vscode',
  filename: 'vscode',
  loaded: true,
  exports: vscodeMock,
  parent: null,
  children: [],
  paths: [],
}

// Also patch Module._resolveFilename so that dynamic requires of 'vscode'
// are intercepted before they reach the file system.
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  if (request === 'vscode') {
    return 'vscode'
  }
  return originalResolve.call(this, request, ...args)
}

console.log('[test-setup] vscode mock registered')

// ── Interface compatibility shims ────────────────────────────────────────────
// Some legacy tests use `describe/it` (BDD) while most use `suite/test` (TDD).
// Running mocha with --ui tdd provides suite/test but not describe/it.
// These shims make both interfaces available globally.
//
// They are installed here (before any test file loads) so that `describe` and
// `it` resolve correctly when the test files are imported.
//
// NOTE: Mocha's own globals are only available after mocha boots, so we set
// these up in the `--require` phase which runs before test discovery.
if (typeof global.describe === 'undefined') {
  global.describe = global.suite
}
if (typeof global.it === 'undefined') {
  global.it = global.test
}
if (typeof global.before === 'undefined') {
  global.before = global.suiteSetup
}
if (typeof global.after === 'undefined') {
  global.after = global.suiteTeardown
}
