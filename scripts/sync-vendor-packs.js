#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const src = path.join(root, 'packages', 'analyzer-rule-packs')
const dest = path.join(root, 'vendor', 'analyzer-rule-packs')

function copyRecursive(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name)
    const d = path.join(to, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'fixtures') continue
      copyRecursive(s, d)
    } else {
      fs.copyFileSync(s, d)
    }
  }
}

if (!fs.existsSync(path.join(src, 'src', 'index.ts'))) {
  console.error('packages/analyzer-rule-packs missing')
  process.exit(1)
}

// Prefer compiled dist if present
const needsCompile = !fs.existsSync(path.join(src, 'dist', 'index.js'))
if (needsCompile) {
  console.log('Note: analyzer-rule-packs dist not built (esbuild bundles from src)')
}

fs.rmSync(dest, { recursive: true, force: true })
copyRecursive(src, dest)
for (const drop of ['node_modules', 'fixtures', 'scripts', 'src', 'tsconfig.json']) {
  fs.rmSync(path.join(dest, drop), { recursive: true, force: true })
}
console.log('Synced vendor/analyzer-rule-packs')
