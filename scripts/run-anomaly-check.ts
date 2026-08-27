/**
 * 入力チェックを手元から実行する（夜間バッチと同じ処理）。
 *
 *   npm run check:anomaly
 *
 * 画面の「今すぐチェック」と結果は同じ。デプロイ前の動作確認や、
 * Cron が止まっているときの応急手当に使う。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { runAnomalyCheck } from '../src/lib/anomaly/run'

function loadEnv(path: string) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const key = line.slice(0, i).trim()
    if (!process.env[key]) {
      process.env[key] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
}

loadEnv('.env.local')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  const result = await runAnomalyCheck(supabase, { triggerSource: 'manual' })
  console.log(`対象期間: ${result.from} 〜 ${result.to}`)
  console.log(
    `検出 ${result.found}件 / 新規 ${result.created}件 / 再発 ${result.reopened}件 / 解消 ${result.resolved}件`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
