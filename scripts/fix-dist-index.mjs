import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const indexPath = resolve('dist/index.html')
let html = await readFile(indexPath, 'utf8')
html = html
  // Keep type="module" intact. Modern dependencies such as Supabase rely on module semantics.
  .replace(/<script type="module" crossorigin src="(\/assets\/[^"]+\.js)"><\/script>/, '<script type="module" src=".$1"></script>')
  .replace(/<script type="module" crossorigin src="(\.\/assets\/[^"]+\.js)"><\/script>/, '<script type="module" src="$1"></script>')
  .replace(/<link rel="stylesheet" crossorigin href="(\.\/assets\/[^"]+\.css)">/, '<link rel="stylesheet" href="$1">')
  .replace(/<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/, '<link rel="stylesheet" href=".$1">')
await writeFile(indexPath, html)
console.log('Patched dist/index.html for relative asset paths while preserving module scripts')
