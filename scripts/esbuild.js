/**
 * esbuild bundle for VS Code extension — single dist/extension.js
 */
const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const outfile = path.join(root, 'dist', 'extension.js')
const workerOutfile = path.join(root, 'dist', 'plugin-worker.js')
const packsEntry = path.join(root, 'packages', 'analyzer-rule-packs', 'src', 'index.ts')

async function main() {
  const watch = process.argv.includes('--watch')
  const common = {
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: true,
    minify: !watch,
    treeShaking: true,
    mainFields: ['module', 'main'],
    logLevel: 'info',
    loader: {
      '.json': 'json',
    },
  }

  const extensionConfig = {
    ...common,
    entryPoints: [path.join(root, 'src', 'extension.ts')],
    outfile,
    external: ['vscode'],
    alias: {
      '@jokalala/analyzer-rule-packs': packsEntry,
    },
  }

  // The plugin worker runs in a worker_thread, not the extension host — it
  // must not (and does not) import `vscode`, so it gets its own bundle
  // rather than being pulled into dist/extension.js.
  const workerConfig = {
    ...common,
    entryPoints: [path.join(root, 'src', 'services', 'plugin-worker.ts')],
    outfile: workerOutfile,
  }

  if (watch) {
    const [extCtx, workerCtx] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(workerConfig),
    ])
    await Promise.all([extCtx.watch(), workerCtx.watch()])
    console.log('Watching extension + plugin-worker bundles...')
    return
  }

  await Promise.all([
    esbuild.build({ ...extensionConfig, metafile: false }),
    esbuild.build({ ...workerConfig, metafile: false }),
  ])

  for (const file of [outfile, workerOutfile]) {
    const stat = fs.statSync(file)
    console.log(`Bundled ${file} (${(stat.size / 1024).toFixed(1)} KB)`)
  }

  copyWasmAssets()
}

/**
 * Tree-sitter runtime + Python/Java grammars for the syntax-aware precision
 * layer (core/syntax-service.ts). Copied, not bundled — emscripten loads
 * them from disk at runtime.
 */
function copyWasmAssets() {
  const wasmDir = path.join(root, 'dist', 'wasm')
  fs.mkdirSync(wasmDir, { recursive: true })
  const assets = [
    path.join(root, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm'),
    path.join(root, 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm', 'tree-sitter-python.wasm'),
    path.join(root, 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm', 'tree-sitter-java.wasm'),
  ]
  for (const src of assets) {
    const dest = path.join(wasmDir, path.basename(src))
    fs.copyFileSync(src, dest)
    console.log(`Copied ${path.basename(src)} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
