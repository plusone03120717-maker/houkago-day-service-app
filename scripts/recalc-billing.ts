// 国保連請求の「出席実績から再集計」を、画面を開かずに実行する運用スクリプト。
// 画面のボタンと同じ処理（src/lib/billing/recalc.ts）を service role で動かす。
//
//   プレビュー（書き込まない）: npx tsx scripts/recalc-billing.ts <ユニット名> <YYYYMM>
//   保存する                  : npx tsx scripts/recalc-billing.ts <ユニット名> <YYYYMM> --apply
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { aggregateUnitMonth } from '../src/lib/billing/aggregate'
import { recalcUnitMonth } from '../src/lib/billing/recalc'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]
    }),
)

async function main() {
  const [unitName, yearMonth, flag] = process.argv.slice(2)
  if (!unitName || !/^\d{6}$/.test(yearMonth ?? '')) {
    console.error('使い方: npx tsx scripts/recalc-billing.ts <ユニット名> <YYYYMM> [--apply]')
    process.exit(1)
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data: unit } = await supabase.from('units').select('id, name').eq('name', unitName).maybeSingle()
  if (!unit) throw new Error(`ユニット「${unitName}」が見つかりません`)

  // 型は server クライアント前提だが、使っているのは共通の問い合わせ API だけ
  const client = supabase as unknown as Parameters<typeof aggregateUnitMonth>[0]

  if (flag !== '--apply') {
    const result = await aggregateUnitMonth(client, unit.id, yearMonth)
    if (result.fatal) throw new Error(result.fatal)
    for (const c of result.children) {
      console.log(
        `${c.childName}: ${c.totalDays}日 ${c.totalUnits}単位 総費用額${c.totalCost}円 負担${c.copayAmount}円`,
        c.errors.length ? ` ⚠ ${c.errors.join(' / ')}` : '',
      )
      for (const l of c.breakdown) console.log(`    ${l.code ?? '------'} ${l.name} ${l.unitCount}×${l.count}=${l.units}`)
    }
    for (const w of result.warnings) console.log('警告:', w)
    console.log('（プレビューです。保存するには --apply を付けて実行）')
    return
  }

  const res = await recalcUnitMonth(client, unit.id, yearMonth)
  if (res.error) throw new Error(res.error)
  console.log(`${unit.name} ${yearMonth}: ${res.childCount}名 ${res.totalUnits}単位 請求額${res.billedAmount}円 を保存しました`)
  for (const e of res.childErrors) console.log('  要確認:', e)
  for (const w of res.warnings) console.log('  警告:', w)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
