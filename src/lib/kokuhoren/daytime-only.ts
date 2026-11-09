// 日中一時支援だけを使った児童を見分ける。
// 日中一時支援は市町村の事業なので、国保連の請求（請求書・明細書・実績記録票・CSV）には入らない。
// 次の2つがそろう児童を「日中一時支援だけ」とみなす。
//   1. その月に有効な受給者証がない
//   2. その月の出席・欠席がすべて日中一時支援の日
// 受給者証がある児童は、日中一時支援の日があっても放デイ・児発と同じ日に使っていることが多いので外さない。

import type { createClient } from '@/lib/supabase/server'
import type { BillingScope } from './scope'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

type AttendanceRow = {
  child_id: string
  daytime_support: boolean | null
  children: {
    name: string
    benefit_certificates: Array<{ start_date: string; end_date: string }>
  } | null
}

/** 日中一時支援だけを使った児童の id → 氏名 */
export async function findDaytimeOnlyChildren(
  supabase: SupabaseLike,
  scope: Pick<BillingScope, 'yearMonth' | 'unitIds'>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (scope.unitIds.length === 0) return result

  const y = scope.yearMonth.slice(0, 4)
  const m = scope.yearMonth.slice(4, 6)
  const monthStart = `${y}-${m}-01`
  const monthEndDay = new Date(parseInt(y), parseInt(m), 0).getDate()
  const monthEnd = `${y}-${m}-${String(monthEndDay).padStart(2, '0')}`

  const { data } = await supabase
    .from('daily_attendance')
    .select('child_id, daytime_support, children (name, benefit_certificates (start_date, end_date))')
    .in('unit_id', scope.unitIds)
    .in('status', ['attended', 'absent'])
    .gte('date', monthStart)
    .lte('date', monthEnd)

  const rows = (data ?? []) as unknown as AttendanceRow[]
  const byChild = new Map<string, AttendanceRow[]>()
  for (const r of rows) {
    const list = byChild.get(r.child_id) ?? []
    list.push(r)
    byChild.set(r.child_id, list)
  }

  for (const [childId, list] of byChild) {
    const child = list[0].children
    const hasCertificate = (child?.benefit_certificates ?? []).some(
      (c) => c.start_date <= monthEnd && c.end_date >= monthStart,
    )
    if (hasCertificate) continue
    if (list.every((r) => r.daytime_support === true)) {
      result.set(childId, child?.name ?? '(不明)')
    }
  }
  return result
}

/** CSV の警告に出す文 */
export function daytimeOnlyWarnings(children: Map<string, string>): string[] {
  return [...children.values()].map(
    (name) => `${name}: 日中一時支援だけの利用なので、国保連の請求には入れていません`,
  )
}
