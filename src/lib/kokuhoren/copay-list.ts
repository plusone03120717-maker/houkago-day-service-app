// 「利用者負担額一覧表」: 他事業所が上限額管理事業所になっている児童について、
// 当事業所の総費用額・利用者負担額・利用回数・欠席回数を管理事業所へ伝える帳票のデータ。

import type { createClient } from '@/lib/supabase/server'
import { computeKokuhorenBilling } from './build'
import { loadBillingChildren, loadUpperLimits } from './load'
import type { BillingScope } from './scope'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export type CopayListChild = {
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

  // 受給者証番号 → 児童ID・管理事業所の指定
  const { data: detailRows } = await supabase
    .from('billing_details')
    .select(`
      child_id,
      children (benefit_certificates (
        certificate_number, is_upper_limit_manager, upper_limit_manager, upper_limit_manager_number
      ))
    `)
    .in('billing_monthly_id', scope.billingMonthlyIds)

  type Cert = {
    certificate_number: string
    is_upper_limit_manager: boolean | null
    upper_limit_manager: string | null
    upper_limit_manager_number: string | null
  }
  const byCert = new Map<string, { childId: string; cert: Cert }>()
  for (const r of (detailRows ?? []) as unknown as Array<{
    child_id: string
    children: { benefit_certificates: Cert[] } | null
  }>) {
    for (const cert of r.children?.benefit_certificates ?? []) {
      byCert.set(cert.certificate_number, { childId: r.child_id, cert })
    }
  }

  const childIds = [...new Set([...byCert.values()].map((v) => v.childId))]
  const records = await loadUpperLimits(supabase, scope.yearMonth, childIds)

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
    const hit = byCert.get(c.certificateNumber)
    if (!hit) continue
    const record = records.get(hit.childId)
    if (record?.isSelfManaged) continue // 当事業所が管理する児童は結果票の対象
    const managerNumber = record?.managerOfficeNumber ?? hit.cert.upper_limit_manager_number ?? ''
    const managerName = hit.cert.upper_limit_manager ?? ''
    const hasManager =
      record != null || (!hit.cert.is_upper_limit_manager && (managerNumber !== '' || managerName !== ''))
    if (!hasManager) continue

    const key = managerNumber || managerName
    const g = groups.get(key) ?? { managerNumber, managerName, children: [] }
    g.children.push({
      municipalityCode: c.municipalityCode,
      certificateNumber: c.certificateNumber,
      childName: c.childName,
      totalCost: c.totalCost,
      copayAmount: c.capAdjusted,
      usedDays: c.totalDays,
      absentDays: absentByChild.get(hit.childId) ?? 0,
    })
    groups.set(key, g)
  }

  return { facility, groups: [...groups.values()] }
}
