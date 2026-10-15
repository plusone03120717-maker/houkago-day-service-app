/**
 * 国保連請求の月初集計（段階1）を手元から試す。
 *
 *   プレビュー（書き込まない・送らない）: npx tsx scripts/run-billing-month-start.ts [YYYYMM]
 *   明細も作る                          : npx tsx scripts/run-billing-month-start.ts [YYYYMM] --apply
 *
 * 月を省くと前月。LINE の本文と、送り先になる請求担当を表示する（LINE は送らない）。
 * プレビューでも、書き換えない月・作り直す月の判定は本番と同じ。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { monthStartNotice, previousYearMonthJST, runMonthStartBilling } from '../src/lib/billing/month-start'

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

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const yearMonth = args.find((a) => /^\d{6}$/.test(a)) ?? previousYearMonthJST()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const client = supabase as unknown as Parameters<typeof runMonthStartBilling>[0]

  const report = await runMonthStartBilling(client, yearMonth, { apply })
  for (const u of report.units) {
    const how = u.recalculated ? '明細を作り直した' : apply ? `書き換えず（${u.error ?? u.skippedReason}）` : `プレビュー${u.skippedReason ? `／本番なら書き換えない（${u.skippedReason}）` : '／本番なら明細を作り直す'}`
    console.log(`${u.unitName}: ${how}`)
  }

  const { data: staff, error } = await supabase
    .from('staff_members')
    .select('name, line_user_id')
    .eq('receives_billing_notice', true)
  console.log('\n送り先:', error ? `（読めませんでした: ${error.message}）` : (staff ?? []).map((s) => `${s.name}${s.line_user_id ? '' : '（LINE 未連携）'}`).join('、') || '（未設定）')

  console.log('\n----- LINE の本文 -----')
  console.log(monthStartNotice(report, process.env.NEXT_PUBLIC_APP_URL || 'https://houkago-day-service-app-kotti.vercel.app'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
