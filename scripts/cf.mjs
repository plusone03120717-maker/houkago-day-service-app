/**
 * Cloudflare（OpenNext）向けの命令をまとめて呼ぶ。
 *
 *   node scripts/cf.mjs build                 組み立てだけ
 *   node scripts/cf.mjs preview               組み立てて、手元で Workers と同じ仕組みで動かす（試験の設定）
 *   node scripts/cf.mjs deploy-staging        組み立てて、試験環境（houkago-app-staging）に出す
 *
 * Windows でも同じように動くよう、環境変数の CF_BUILD=1（next.config.ts が出力先を
 * .next にする合図）をこのスクリプトで付ける。
 */
import { spawnSync } from 'node:child_process'

const mode = process.argv[2] ?? 'build'
const env = { ...process.env, CF_BUILD: '1' }

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('node', ['scripts/gen-docs-module.mjs'])
run('npx', ['opennextjs-cloudflare', 'build'])

if (mode === 'preview') {
  run('npx', ['opennextjs-cloudflare', 'preview', '--env', 'staging'])
} else if (mode === 'deploy-staging') {
  run('npx', ['opennextjs-cloudflare', 'deploy', '--env', 'staging'])
} else if (mode !== 'build') {
  console.error(`知らない命令です: ${mode}`)
  process.exit(1)
}
