/**
 * esbuild bundle for VS Code extension — single dist/extension.js
 */
const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const outfile = path.join(root, 'dist', 'extension.js')
const packsEntry = path.join(root, 'packages', 'analyzer-rule-packs', 'src', 'index.ts')

async function main() {
  const watch = process.argv.includes('--watch')
  const common = {
    entryPoints: [path.join(root, 'src', 'extension.ts')],
    bundle: true,
    outfile,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: true,
    minify: !watch,
    treeShaking: true,
    external: ['vscode'],
    mainFields: ['module', 'main'],
    logLevel: 'info',
    alias: {
      '@jokalala/analyzer-rule-packs': packsEntry,
    },
    loader: {
      '.json': 'json',
    },
  }

  if (watch) {
    const ctx = await esbuild.context(common)
    await ctx.watch()
    console.log('Watching extension bundle...')
    return
  }

  await esbuild.build({ ...common, metafile: false })
  const stat = fs.statSync(outfile)
  console.log(`Bundled ${outfile} (${(stat.size / 1024).toFixed(1)} KB)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
