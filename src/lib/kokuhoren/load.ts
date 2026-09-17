// 請求CSVと請求書・明細書PDFが同じ数字になるよう、DBからの読み出しを1か所にまとめる。

import type { createClient } from '@/lib/supabase/server'
import type { ChildBillingInput } from './build'
import type { BillingScope } from './scope'
import type { UpperLimitChild, UpperLimitOfficeLine } from './upper-limit'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

type DetailRow = {
  id: string
  total_days: number
  total_units: number
  service_code: string | null
  service_breakdown: Array<{ code: string | null; name?: string; unitCount: number; count: number; units: number }> | null
  copay_amount: number
  billed_amount: number
  upper_limit_office_number: string | null
  upper_limit_result: string | null
  upper_limit_result_amount: number | null
  children: {
    id: string
    name: string
    name_kana: string | null
    benefit_certificates: Array<{
      certificate_number: string
      municipality: string | null
      copay_limit: number
      start_date: string
      end_date: string
      decision_service_code: string | null
      contract_amount: number | null
      contract_start_date: string | null
      contract_end_date: string | null
      contract_line_number: number | null
      max_days_per_month: number
      service_start_date: string | null
      copay_exempt: boolean | null
    }>
  } | null
}

export async function loadBillingChildren(
  supabase: SupabaseLike,
  scope: BillingScope,
): Promise<ChildBillingInput[]> {
  const { data: detailsRaw } = await supabase
    .from('billing_details')
    .select(`
      id, total_days, total_units, service_code, copay_amount, billed_amount, service_breakdown,
      upper_limit_office_number, upper_limit_result, upper_limit_result_amount,
      children (
        id, name, name_kana,
        benefit_certificates (
          certificate_number, municipality, copay_limit, start_date, end_date,
          decision_service_code, contract_amount, contract_start_date, contract_end_date,
          contract_line_number, max_days_per_month, service_start_date, copay_exempt
        )
      )
    `)
    .in('billing_monthly_id', scope.billingMonthlyIds)

  const details = (detailsRaw ?? []) as unknown as DetailRow[]

  const yearMonth = scope.yearMonth
  const monthStart = `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}-01`
  const monthEndDay = new Date(parseInt(yearMonth.slice(0, 4)), parseInt(yearMonth.slice(4, 6)), 0).getDate()
  const monthEnd = `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}-${String(monthEndDay).padStart(2, '0')}`

  // 明細書の開始年月日は「当事業所を初めて利用した日」。受給者証に未入力のときの
  // フォールバックとして、出席実績のうち最も古い日を拾っておく。
  const childIds = details.map((d) => d.children?.id).filter(Boolean) as string[]
  const firstEverByChild = new Map<string, string>()
  if (childIds.length > 0) {
    const { data: attendances } = await supabase
      .from('daily_attendance')
      .select('child_id, date')
      .in('unit_id', scope.unitIds)
      .eq('status', 'attended')
      .in('child_id', childIds)
      .lte('date', monthEnd)
      .order('date')
    for (const a of attendances ?? []) {
      if (!firstEverByChild.has(a.child_id)) firstEverByChild.set(a.child_id, a.date)
    }
  }

  // 上限額管理は専用テーブルを優先する（billing_details の列は旧データ用のフォールバック）
  const upperLimits = await loadUpperLimits(supabase, yearMonth, childIds)

  return details.map((d) => {
    const certs = d.children?.benefit_certificates ?? []
    // サービス提供月に有効な受給者証を優先
    const cert = certs.find((c) => c.start_date <= monthEnd && c.end_date >= monthStart) ?? certs[0]
    return {
      childName: d.children?.name ?? '(不明)',
      childNameKana: d.children?.name_kana ?? null,
      certificateNumber: cert?.certificate_number ?? '',
      municipalityCode: cert?.municipality ?? '',
      copayLimit: cert?.copay_limit ?? 0,
      totalDays: d.total_days,
      totalUnits: d.total_units,
      serviceCode: d.service_code ?? '',
      // 再集計で作られたサービスコード別内訳があれば明細情報レコードにそのまま出力する
      breakdown: (d.service_breakdown ?? [])
        .filter((l) => l.code != null && l.units > 0)
        .map((l) => ({
          code: l.code as string, name: l.name, unitCount: l.unitCount, count: l.count, units: l.units,
        })),
      decisionServiceCode: cert?.decision_service_code ?? '',
      contractDays: cert?.contract_amount ?? cert?.max_days_per_month ?? 0,
      contractStartDate: cert?.contract_start_date ?? null,
      contractEndDate: cert?.contract_end_date ?? null,
      contractLineNumber: cert?.contract_line_number ?? 1,
      serviceStartDate: cert?.service_start_date ?? null,
      firstEverServiceDate: d.children ? firstEverByChild.get(d.children.id) ?? null : null,
      copayExempt: cert?.copay_exempt ?? false,
      storedCopayAmount: d.copay_amount,
      upperLimit: buildUpperLimitInput(
        d.children ? upperLimits.get(d.children.id) ?? null : null,
        scope.facilityNumber,
        d,
      ),
    }
  })
}

/**
 * 明細書（K122）の上限額管理欄に出す値。
 * 当事業所の行の「管理結果後利用者負担額」が、そのまま決定利用者負担額になる。
 */
function buildUpperLimitInput(
  record: UpperLimitRecord | null,
  facilityNumber: string,
  detail: Pick<DetailRow, 'upper_limit_office_number' | 'upper_limit_result' | 'upper_limit_result_amount'>,
): { officeNumber: string; result: string; resultAmount: number | null } | null {
  if (record) {
    const self = record.offices.find((o) => o.officeNumber === facilityNumber)
    return {
      officeNumber: record.managerOfficeNumber,
      result: record.result,
      resultAmount: self ? self.managedCopayAmount : null,
    }
  }
  if (detail.upper_limit_office_number) {
    return {
      officeNumber: detail.upper_limit_office_number,
      result: detail.upper_limit_result ?? '',
      resultAmount: detail.upper_limit_result_amount,
    }
  }
  return null
}

export type UpperLimitRecord = {
  childId: string
  managerOfficeNumber: string
  isSelfManaged: boolean
  result: string
  copayLimit: number
  offices: UpperLimitOfficeLine[]
}

/**
 * その月の利用者負担上限額管理を児童ごとに読む。
 * 明細書（K122）の上限額管理欄・上限額管理結果票（K411）・結果票PDFで共用する。
 */
export async function loadUpperLimits(
  supabase: SupabaseLike,
  yearMonth: string,
  childIds: string[],
): Promise<Map<string, UpperLimitRecord>> {
  const map = new Map<string, UpperLimitRecord>()
  if (childIds.length === 0) return map

  const { data: rows } = await supabase
    .from('upper_limit_managements')
    .select(`
      id, child_id, manager_office_number, is_self_managed, result, copay_limit,
      upper_limit_management_offices (
        line_no, office_number, office_name, total_cost, copay_amount, managed_copay_amount
      )
    `)
    .eq('year_month', yearMonth)
    .in('child_id', childIds)

  type Row = {
    id: string
    child_id: string
    manager_office_number: string
    is_self_managed: boolean
    result: string
    copay_limit: number
    upper_limit_management_offices: Array<{
      line_no: number
      office_number: string
      office_name: string
      total_cost: number
      copay_amount: number
      managed_copay_amount: number
    }>
  }

  for (const r of (rows ?? []) as unknown as Row[]) {
    map.set(r.child_id, {
      childId: r.child_id,
      managerOfficeNumber: r.manager_office_number,
      isSelfManaged: r.is_self_managed,
      result: r.result,
      copayLimit: r.copay_limit,
      offices: (r.upper_limit_management_offices ?? [])
        .map((o) => ({
          lineNo: o.line_no,
          officeNumber: o.office_number,
          officeName: o.office_name,
          totalCost: o.total_cost,
          copayAmount: o.copay_amount,
          managedCopayAmount: o.managed_copay_amount,
        }))
        .sort((a, b) => a.lineNo - b.lineNo),
    })
  }
  return map
}

/** 上限額管理結果票（K411）に出す児童。当事業所が管理事業所の分だけ */
export async function loadUpperLimitChildren(
  supabase: SupabaseLike,
  scope: BillingScope,
): Promise<UpperLimitChild[]> {
  const children = await loadBillingChildren(supabase, scope)
  const byCert = new Map(children.map((c) => [c.certificateNumber, c]))

  const { data: rows } = await supabase
    .from('upper_limit_managements')
    .select(`
      child_id, is_self_managed, result, copay_limit,
      children (name, name_kana, benefit_certificates (certificate_number, municipality)),
      upper_limit_management_offices (
        line_no, office_number, office_name, total_cost, copay_amount, managed_copay_amount
      )
    `)
    .eq('year_month', scope.yearMonth)
    .eq('is_self_managed', true)

  type Row = {
    child_id: string
    result: string
    copay_limit: number
    children: {
      name: string
      name_kana: string | null
      benefit_certificates: Array<{ certificate_number: string; municipality: string | null }>
    } | null
    upper_limit_management_offices: Array<{
      line_no: number
      office_number: string
      office_name: string
      total_cost: number
      copay_amount: number
      managed_copay_amount: number
    }>
  }

  const out: UpperLimitChild[] = []
  for (const r of (rows ?? []) as unknown as Row[]) {
    const cert = r.children?.benefit_certificates?.[0]
    const certNumber = cert?.certificate_number ?? ''
    // 請求対象になっている児童だけを出す（在籍のみで実績がない児童は結果票に載せない）
    const billing = byCert.get(certNumber)
    out.push({
      childName: r.children?.name ?? '(不明)',
      childNameKana: r.children?.name_kana ?? null,
      certificateNumber: certNumber,
      municipalityCode: billing?.municipalityCode ?? cert?.municipality ?? '',
      copayLimit: r.copay_limit,
      result: r.result,
      offices: (r.upper_limit_management_offices ?? [])
        .map((o) => ({
          lineNo: o.line_no,
          officeNumber: o.office_number,
          officeName: o.office_name,
          totalCost: o.total_cost,
          copayAmount: o.copay_amount,
          managedCopayAmount: o.managed_copay_amount,
        }))
        .sort((a, b) => a.lineNo - b.lineNo),
    })
  }
  return out.sort((a, b) => a.certificateNumber.localeCompare(b.certificateNumber))
}
