/**
 * docs/manual.html を、アプリに取りこめる TypeScript のファイルに書き出す。
 *
 * これまでは実行中に docs/manual.html をファイルとして読んでいたが、
 * Cloudflare Workers では実行中にファイルを読めない。組み立ての前にこの
 * スクリプトで文字列のモジュールにしておけば、Vercel でも Cloudflare でも
 * 同じように動く。
 *
 * npm run build / npm run dev の前に自動で動く（package.json の prebuild・predev）。
 * 書き出したファイル（src/generated/）は Git に入れない。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(path.join(root, 'docs', 'manual.html'), 'utf8')
const outDir = path.join(root, 'src', 'generated')
mkdirSync(outDir, { recursive: true })
writeFileSync(
  path.join(outDir, 'docs-manual.ts'),
  '// scripts/gen-docs-module.mjs が docs/manual.html から作るファイル。手で直さない。\n' +
    `export const MANUAL_HTML: string = ${JSON.stringify(html)}\n`
)
console.log(`docs/manual.html を src/generated/docs-manual.ts に書き出しました（${html.length} 文字）`)
