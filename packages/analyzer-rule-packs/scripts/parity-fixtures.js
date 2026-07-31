#!/usr/bin/env node
/**
 * Fixture parity against the *full* Tier-1 corpus (incl. patterns).
 * Precision profile is covered separately by expected-precision.json.
 */

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const dist = path.join(root, 'dist')
if (!fs.existsSync(path.join(dist, 'index.js'))) {
  console.error('Run compile first: pnpm run compile')
  process.exit(1)
}

const {
  loadFullTier1Packs,
  loadDefaultTier1Packs,
  compileRulePack,
  matchCompiledRules,
  getAstRules,
  dedupeFindingsByCweLine,
} = require('../dist/index.js')

const fixturesDir = path.join(root, 'fixtures', 'js')
const expectedFull = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'expected.json'), 'utf8')
)
const expectedPrecision = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'expected-precision.json'), 'utf8')
)

function analyzeFixture(source, language, packs) {
  const findings = []
  for (const pack of packs) {
    findings.push(...matchCompiledRules(source, pack.compiled, language))
    const astRules = getAstRules(pack.manifest)
    if (astRules.length) {
      // Parity corpus still uses AST regex patterns for pack-ID coverage
      const withAst = compileRulePack(pack.manifest, { includeAstFallback: true })
      const onlyAst = withAst.compiled.filter((c) =>
        astRules.some((r) => r.id === c.rule.id)
      )
      findings.push(...matchCompiledRules(source, onlyAst, language))
    }
  }
  return [...new Set(dedupeFindingsByCweLine(findings).map((f) => f.ruleId))]
}

function runSuite(label, expected, packs) {
  let failed = 0
  for (const entry of expected.fixtures) {
    const filePath = path.join(fixturesDir, entry.file)
    const source = fs.readFileSync(filePath, 'utf8')
    const hit = analyzeFixture(source, entry.language || 'javascript', packs)
    const ok = entry.expectAnyOf.some((id) => hit.includes(id))
    if (!ok) {
      failed++
      console.error(
        `FAIL [${label}] ${entry.file}: expected one of [${entry.expectAnyOf.join(', ')}] got [${hit.join(', ') || '(none)'}]`
      )
    } else {
      console.log(
        `OK   [${label}] ${entry.file}: ${entry.expectAnyOf.find((id) => hit.includes(id))}`
      )
    }
  }
  return failed
}

let failed = 0
failed += runSuite('full', expectedFull, loadFullTier1Packs())
failed += runSuite('precision', expectedPrecision, loadDefaultTier1Packs())

// Zero-noise: sanitized sink must not survive suppressions
{
  const { shouldSuppressFinding, offsetFromLineCol, matchCompiledRules, getAstRules, compileRulePack } =
    require('../dist/index.js')
  const src = fs.readFileSync(path.join(fixturesDir, '11-sanitized-innerhtml.js'), 'utf8')
  const packs = loadDefaultTier1Packs()
  let hits = []
  for (const pack of packs) {
    hits.push(...matchCompiledRules(src, pack.compiled, 'javascript'))
    const astRules = getAstRules(pack.manifest)
    if (astRules.length) {
      const withAst = compileRulePack(pack.manifest, { includeAstFallback: true })
      hits.push(
        ...matchCompiledRules(
          src,
          withAst.compiled.filter((c) => astRules.some((r) => r.id === c.rule.id)),
          'javascript'
        )
      )
    }
  }
  const after = hits.filter((f) => {
    const start = offsetFromLineCol(src, f.line, f.column)
    return !shouldSuppressFinding(src, start, start + (f.matchedText?.length || 1))
  })
  if (after.some((f) => f.ruleId.includes('innerhtml') || f.ruleId.includes('innerHTML'))) {
    failed++
    console.error('FAIL [suppress] 11-sanitized-innerhtml.js: expected no innerHTML finding after suppression')
  } else {
    console.log('OK   [suppress] 11-sanitized-innerhtml.js')
  }
}

if (failed > 0) {
  console.error(`\nParity failed: ${failed} fixture(s)`)
  process.exit(1)
}
console.log(`\nParity passed (full + precision)`)
