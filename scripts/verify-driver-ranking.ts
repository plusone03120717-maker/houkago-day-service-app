/**
 * ドライバーの「よく入る順」の並びが、実際の担当をどれだけ上に出せているかを測る。
 *
 *   npx tsx scripts/verify-driver-ranking.ts [開始日] [終了日]
 *
 * 期間内の各日について、その日より前の記録だけで並びを作り、
 * その日に実際に入った人が 1番目／2番目までに出ていたかを数える。
 * データは読むだけで、何も書き込まない。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { fetchDriverRanking, rankDrivers, type TransportSlot } from '../src/lib/driver-ranking'

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

const from = process.argv[2] ?? '2026-08-01'
const to = process.argv[3] ?? '2026-09-30'

const SLOT_COLUMNS: Record<TransportSlot, string> = {
  pickup: 'pickup_driver_member_id',
  dropoff: 'dropoff_driver_member_id',
  daytime_pickup: 'daytime_pickup_driver_member_id',
  daytime_dropoff: 'daytime_dropoff_driver_member_id',
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: drivers } = await supabase.from('staff_members').select('id, name').order('name')
  const { data: rows, error } = await supabase
    .from('daily_attendance')
    .select(`child_id, date, ${Object.values(SLOT_COLUMNS).join(', ')}`)
    .gte('date', from)
    .lte('date', to)
    .neq('status', 'absent')
    .order('date')
  if (error) throw error

  const byDate = new Map<string, Record<string, string | null>[]>()
  for (const r of (rows ?? []) as unknown as Record<string, string | null>[]) {
    const list = byDate.get(r.date!) ?? []
    list.push(r)
    byDate.set(r.date!, list)
  }

  let n = 0
  let top1 = 0
  let top2 = 0
  for (const [date, list] of byDate) {
    // ページと同じサーバー用クライアントの代わりに、サービスロールのクライアントを渡す
    const ranking = await fetchDriverRanking(supabase as never, date)
    for (const r of list) {
      for (const [slot, col] of Object.entries(SLOT_COLUMNS) as [TransportSlot, string][]) {
        const actual = r[col]
        if (!actual) continue
        const { frequent } = rankDrivers(drivers ?? [], [ranking.scoresFor(r.child_id!, slot)])
        n++
        if (frequent[0]?.id === actual) top1++
        if (frequent.slice(0, 2).some((d) => d.id === actual)) top2++
      }
    }
  }
  const pct = (a: number) => `${((a / n) * 100).toFixed(1)}%`
  console.log(`${from}〜${to} 送迎 ${n}件`)
  console.log(`1番目が実際の担当: ${top1}件 (${pct(top1)})`)
  console.log(`2番目までに実際の担当: ${top2}件 (${pct(top2)})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
