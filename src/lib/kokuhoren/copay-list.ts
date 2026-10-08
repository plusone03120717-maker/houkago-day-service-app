// 「利用者負担額一覧表」: 他事業所が上限額管理事業所になっている児童について、
// 当事業所の総費用額・利用者負担額・利用回数・欠席回数を管理事業所へ伝える帳票のデータ。

import type { createClient } from '@/lib/supabase/server'
import { computeKokuhorenBilling } from './build'
import { loadBillingChildren } from './load'
import { resolveUpperLimitTargets } from './upper-limit-targets'
import type { BillingScope } from './scope'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export type CopayListChild = {
  childId: string
  municipalityCode: string
  certificateNumber: string
  childName: string
  totalCost: number
  copayAmount: number
  usedDays: number
  absentDays: number
}

export type CopayListGroup = {
  /** 提供先（上限額管理事業所） */
  managerNumber: string
  managerName: string
  children: CopayListChild[]
}

export type CopayListData = {
  facility: { name: string; facilityNumber: string; address: string; phone: string }
  groups: CopayListGroup[]
}

export async function loadCopayList(supabase: SupabaseLike, scope: BillingScope): Promise<CopayListData> {
  const [{ data: facilityRaw }, childrenInput] = await Promise.all([
    supabase.from('facilities').select('name, address, phone').eq('facility_number', scope.facilityNumber).maybeSingle(),
    loadBillingChildren(supabase, scope),
  ])
  const f = facilityRaw as { name: string; address: string | null; phone: string | null } | null
  const facility = {
    name: f?.name ?? '',
    facilityNumber: scope.facilityNumber,
    address: f?.address ?? '',
    phone: f?.phone ?? '',
  }

  const { children } = computeKokuhorenBilling(
    { facilityNumber: scope.facilityNumber, regionCode: scope.regionCode, unitPrice: scope.unitPrice },
    scope.yearMonth,
    childrenInput,
  )

  const childIds = [...new Set(childrenInput.map((c) => c.childId).filter(Boolean) as string[])]
  const targets = await resolveUpperLimitTargets(supabase, scope.yearMonth, childIds, facility)

  // 欠席回数（出席管理で「欠席」になっている日数）
  const absentByChild = new Map<string, number>()
  if (childIds.length > 0) {
    const y = scope.yearMonth.slice(0, 4)
    const m = scope.yearMonth.slice(4, 6)
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
    const { data: absences } = await supabase
      .from('daily_attendance')
      .select('child_id, date')
      .in('unit_id', scope.unitIds)
      .eq('status', 'absent')
      .in('child_id', childIds)
      .gte('date', `${y}-${m}-01`)
      .lte('date', `${y}-${m}-${String(lastDay).padStart(2, '0')}`)
    const seen = new Set<string>()
    for (const a of absences ?? []) {
      const key = `${a.child_id}:${a.date}`
      if (seen.has(key)) continue
      seen.add(key)
      absentByChild.set(a.child_id, (absentByChild.get(a.child_id) ?? 0) + 1)
    }
  }

  const groups = new Map<string, CopayListGroup>()
  for (const c of children) {
    if (!c.childId) continue
    const target = targets.get(c.childId)
    // 当事業所が管理する児童は結果票の対象なので、一覧表には載せない
    if (!target || target.isSelf) continue
    const { managerNumber, managerName } = target

    const key = managerNumber || managerName
    const g = groups.get(key) ?? { managerNumber, managerName, children: [] }
    g.children.push({
      childId: c.childId,
      municipalityCode: c.municipalityCode,
      certificateNumber: c.certificateNumber,
      childName: c.childName,
      totalCost: c.totalCost,
      copayAmount: c.capAdjusted,
      usedDays: c.totalDays,
      absentDays: absentByChild.get(c.childId) ?? 0,
    })
    groups.set(key, g)
  }

  return { facility, groups: [...groups.values()] }
}
