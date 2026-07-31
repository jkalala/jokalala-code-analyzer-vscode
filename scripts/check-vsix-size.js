#!/usr/bin/env node
/**
 * Fail if packaged VSIX exceeds budget.
 * Prefers the VSIX matching package.json version, else newest mtime.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const BUDGET_BYTES = Number(process.env.VSIX_SIZE_BUDGET || 1_400_000)
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const expectedName = `${pkg.name}-${pkg.version}.vsix`

const vsixFiles = fs
  .readdirSync(ROOT)
  .filter((f) => f.endsWith('.vsix'))
  .map((f) => ({
    name: f,
    size: fs.statSync(path.join(ROOT, f)).size,
    mtime: fs.statSync(path.join(ROOT, f)).mtimeMs,
  }))

if (!vsixFiles.length) {
  console.error('No .vsix found — run pnpm run package first')
  process.exit(1)
}

const vsix =
  vsixFiles.find((f) => f.name === expectedName) ||
  vsixFiles.sort((a, b) => b.mtime - a.mtime)[0]

console.log(
  `VSIX ${vsix.name}: ${(vsix.size / 1024).toFixed(1)} KB (budget ${(BUDGET_BYTES / 1024).toFixed(0)} KB)`
)
if (vsix.size > BUDGET_BYTES) {
  console.error(`FAIL: VSIX exceeds size budget`)
  process.exit(1)
}
console.log('OK: within VSIX size budget')
