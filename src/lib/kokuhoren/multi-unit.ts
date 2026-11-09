// 同じ月に1人の児童が2つ以上の事業（ユニット）に記録されていないかを調べる。
// 国保連の明細書は事業所番号ごとに1人1枚なので、事業が分かれていると同じ児童の明細書が2つでき、
// 取込送信ソフトで「同一の基本情報が複数存在します（TS049）」「データレコードの順序が正しくありません（TS029）」になる。
// 多くは出席の入れまちがい（例：児発の子の1日だけがプラスワン1に入っていた）なので、CSV を出す前に知らせる。

import type { createClient } from '@/lib/supabase/server'
import type { BillingScope } from './scope'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

type Row = {
  child_id: string
  date: string
  units: { name: string } | null
  children: { name: string } | null
}

export type MultiUnitChild = {
  childId: string
  childName: string
  /** 事業名 → その事業に記録された日（MM/DD） */
  datesByUnit: Map<string, string[]>
}

/**
 * その月の出席・欠席が2つ以上の事業にまたがる児童を返す。
 * excludeChildIds（日中一時支援だけの児童など、国保連の請求に入らない児童）は調べない。
 */
export async function findMultiUnitChildren(
  supabase: SupabaseLike,
  scope: Pick<BillingScope, 'yearMonth' | 'unitIds'>,
  excludeChildIds: Set<string> = new Set(),
): Promise<MultiUnitChild[]> {
  if (scope.unitIds.length < 2) return []

  const y = scope.yearMonth.slice(0, 4)
  const m = scope.yearMonth.slice(4, 6)
  const monthStart = `${y}-${m}-01`
  const monthEndDay = new Date(parseInt(y), parseInt(m), 0).getDate()
  const monthEnd = `${y}-${m}-${String(monthEndDay).padStart(2, '0')}`

  const { data } = await supabase
    .from('daily_attendance')
    .select('child_id, date, units (name), children (name)')
    .in('unit_id', scope.unitIds)
    .in('status', ['attended', 'absent'])
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .order('date')

  const byChild = new Map<string, MultiUnitChild>()
  for (const r of (data ?? []) as unknown as Row[]) {
    if (excludeChildIds.has(r.child_id)) continue
    const entry = byChild.get(r.child_id) ?? {
      childId: r.child_id,
      childName: r.children?.name ?? '(不明)',
      datesByUnit: new Map<string, string[]>(),
    }
    const unitName = r.units?.name ?? '(不明)'
    const dates = entry.datesByUnit.get(unitName) ?? []
    dates.push(`${Number(r.date.slice(5, 7))}/${Number(r.date.slice(8, 10))}`)
    entry.datesByUnit.set(unitName, dates)
    byChild.set(r.child_id, entry)
  }

  return [...byChild.values()].filter((c) => c.datesByUnit.size >= 2)
}

/** CSV の出力を止めるエラーの文。日数の少ない事業の日付を出して、入れまちがいを探しやすくする */
export function multiUnitErrors(children: MultiUnitChild[]): string[] {
  return children.map((c) => {
    const parts = [...c.datesByUnit.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([unit, dates], i) =>
        i === 0 ? `${unit} ${dates.length}日` : `${unit} ${dates.length}日（${dates.join('・')}）`,
      )
    return `${c.childName}: 同じ月に2つ以上の事業に記録があります（${parts.join('、')}）。国保連の明細書は1人1枚なので、出席管理でどちらかの事業にそろえてから出力してください`
  })
}
