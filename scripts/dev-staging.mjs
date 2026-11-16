/**
 * 試験環境の値（.env.staging）だけで、手元の開発サーバーを動かす。
 *
 *   node scripts/dev-staging.mjs        （http://localhost:3026）
 *
 * .env.local（本番の値）と混ざらないよう、.env.staging の値を先に環境変数に入れてから
 * next dev を動かす（Next.js は、すでにある環境変数を .env.local で上書きしない）。
 * 本番の DB を指していたら止まる。
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PRODUCTION_REF = 'hodlnaszbtlcfkhutbdv'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const staging = Object.fromEntries(
  readFileSync(path.join(root, '.env.staging'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
if (!staging.NEXT_PUBLIC_SUPABASE_URL || staging.NEXT_PUBLIC_SUPABASE_URL.includes(PRODUCTION_REF)) {
  console.error('試験用の Supabase が設定されていないので止めます')
  process.exit(1)
}

const child = spawn('npx', ['next', 'dev', '-p', '3026'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ...staging },
})
child.on('exit', (code) => process.exit(code ?? 0))
