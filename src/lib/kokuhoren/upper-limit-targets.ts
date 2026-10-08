// 上限額管理の対象児童と、管理結果後の利用者負担額をまとめて扱う。
//
// 上限管理事業所の情報は3か所に入りうる。
//   1. upper_limit_managements … 月ごとの記録（入力済みなら最優先）
//   2. child_limit_management  … 児童詳細の「上限管理事業所情報」（開始日つきの履歴）
//   3. benefit_certificates    … 受給者証の「上限管理事業所名・番号・当事業所が管理」
// 実データでは「当事業所が管理」のチェックがなく、事業所名に「ぷらすわん」とだけ
// 書かれていることが多いので、名前でも自事業所かどうかを判定する。

import type { createClient } from '@/lib/supabase/server'
import { FACILITY_ADDITION_MAP } from '@/lib/billing/facility-additions'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export type UpperLimitTarget = {
  childId: string
  /** 当事業所が上限額管理事業所か */
  isSelf: boolean
  /** 上限額管理事業所の名称（他事業所のとき） */
  managerName: string
  /** 上限額管理事業所の事業所番号（10桁・未登録なら空） */
  managerNumber: string
  /** 情報源どうしで「自事業所か」が食い違っているときの説明 */
  conflict: string | null
}

/** カタカナ→ひらがな・空白除去・小文字化して比較しやすくする */
function normalizeName(s: string): string {
  return s
    .replace(/[\s　]/g, '')
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .toLowerCase()
}

/** 事業所名が当事業所を指しているか（「ぷらすわん」と「プラスワン」を同一視する） */
export function isSameOffice(name: string | null | undefined, facilityName: string): boolean {
  if (!name || !facilityName) return false
  const a = normalizeName(name)
  const b = normalizeName(facilityName)
  return a !== '' && b !== '' && (a === b || a.includes(b))
}

function monthBounds(yearMonth: string) {
  const y = parseInt(yearMonth.slice(0, 4))
  const m = parseInt(yearMonth.slice(4, 6))
  const lastDay = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

/**
 * 上限額管理の対象になっている児童を判定する（月ごとの記録がない児童も含む）。
 * 月ごとの記録 > 上限管理事業所情報（開始日が当月以前の最新） > 受給者証 の順に採用する。
 */
export async function resolveUpperLimitTargets(
  supabase: SupabaseLike,
  yearMonth: string,
  childIds: string[],
  facility: { name: string; facilityNumber: string },
): Promise<Map<string, UpperLimitTarget>> {
  const map = new Map<string, UpperLimitTarget>()
  if (childIds.length === 0) return map
  const { start, end } = monthBounds(yearMonth)

  const [{ data: certRows }, { data: historyRows }, { data: recordRows }] = await Promise.all([
    supabase
      .from('benefit_certificates')
      .select('child_id, start_date, end_date, is_upper_limit_manager, upper_limit_manager, upper_limit_manager_number')
      .in('child_id', childIds),
    supabase
      .from('child_limit_management')
      .select('child_id, start_date, facility_name')
      .in('child_id', childIds)
      .lte('start_date', end)
      .order('start_date', { ascending: false }),
    supabase
      .from('upper_limit_managements')
      .select('child_id, manager_office_number, is_self_managed')
      .eq('year_month', yearMonth)
      .in('child_id', childIds),
  ])

  type Cert = {
    child_id: string
    start_date: string
    end_date: string
    is_upper_limit_manager: boolean | null
    upper_limit_manager: string | null
    upper_limit_manager_number: string | null
  }
  const certByChild = new Map<string, Cert>()
  for (const c of (certRows ?? []) as Cert[]) {
    const current = certByChild.get(c.child_id)
    const inMonth = c.start_date <= end && c.end_date >= start
    // 当月に有効な受給者証を優先
    if (!current || (inMonth && !(current.start_date <= end && current.end_date >= start))) {
      certByChild.set(c.child_id, c)
    }
  }

  const historyByChild = new Map<string, string>()
  for (const h of (historyRows ?? []) as Array<{ child_id: string; facility_name: string }>) {
    if (!historyByChild.has(h.child_id) && h.facility_name?.trim()) {
      historyByChild.set(h.child_id, h.facility_name.trim())
    }
  }

  const recordByChild = new Map(
    ((recordRows ?? []) as Array<{ child_id: string; manager_office_number: string; is_self_managed: boolean }>)
      .map((r) => [r.child_id, r]),
  )

  for (const childId of childIds) {
    const cert = certByChild.get(childId)
    const historyName = historyByChild.get(childId) ?? null
    const record = recordByChild.get(childId)

    const certName = cert?.upper_limit_manager?.trim() || null
    const certNumber = cert?.upper_limit_manager_number?.trim() || ''
    const certSaysSelf =
      cert?.is_upper_limit_manager === true ||
      (certNumber !== '' && certNumber === facility.facilityNumber) ||
      isSameOffice(certName, facility.name)
    const certHasManager = certSaysSelf || certName != null || certNumber !== ''
    const historySaysSelf = isSameOffice(historyName, facility.name)

    if (!record && !certHasManager && !historyName) continue

    let isSelf: boolean
    if (record) isSelf = record.is_self_managed
    else if (historyName) isSelf = historySaysSelf
    else isSelf = certSaysSelf

    // 他事業所の名称は受給者証の方が正式名称で書かれていることが多いので優先する
    const managerName = isSelf
      ? facility.name
      : (certName && !certSaysSelf ? certName : null) ?? (historyName && !historySaysSelf ? historyName : null) ?? ''
    const managerNumber = isSelf
      ? facility.facilityNumber
      : record?.manager_office_number || (certSaysSelf ? '' : certNumber)

    let conflict: string | null = null
    if (historyName && certHasManager && historySaysSelf !== certSaysSelf) {
      conflict = `受給者証では「${certName ?? (certSaysSelf ? facility.name : '')}」、上限管理事業所情報では「${historyName}」になっています。どちらが正しいか確認してください`
    }

    map.set(childId, { childId, isSelf, managerName, managerNumber, conflict })
  }
  return map
}

/**
 * 利用者負担上限額管理加算（月1回・150単位）のサービスコード。
 * 放デイは令和6年度サービスコード表「放デイ上限額管理加算」で確認済み。
 * 児発はコード表の並び（専門的支援実施加算 615702 / 635702 など）から 61 に置き換えたもの。
 */
export const UPPER_LIMIT_ADDITION = {
  name: '利用者負担上限額管理加算',
  unitCount: 150,
  code: (serviceType: string) => (serviceType === 'development_support' ? '615370' : '635370'),
}

export type UpperLimitBillingInfo = {
  /** 管理結果後利用者負担額（当事業所の行）。null = 当事業所の行がない */
  managedCopay: number | null
  /**
   * 利用者負担上限額管理加算を算定するか。
   * 当事業所が管理事業所で、その月に他事業所の利用（総費用額あり）があるときだけ算定できる。
   * 管理事業所しか利用していない月は、上限額に達していても算定できない。
   */
  managementAddition: boolean
}

/**
 * 上限額管理の記録から、請求の計算に必要な値だけを児童ごとに読む。
 * 管理結果後利用者負担額が、請求明細の利用者負担額・保護者への請求額・国保連の決定利用者負担額になる。
 */
export async function loadUpperLimitBillingInfo(
  supabase: SupabaseLike,
  yearMonth: string,
  childIds: string[],
  facilityNumber: string,
): Promise<Map<string, UpperLimitBillingInfo>> {
  const map = new Map<string, UpperLimitBillingInfo>()
  if (childIds.length === 0 || !facilityNumber) return map

  const { data } = await supabase
    .from('upper_limit_managements')
    .select('child_id, is_self_managed, upper_limit_management_offices (office_number, total_cost, managed_copay_amount)')
    .eq('year_month', yearMonth)
    .in('child_id', childIds)

  for (const r of (data ?? []) as unknown as Array<{
    child_id: string
    is_self_managed: boolean
    upper_limit_management_offices: Array<{ office_number: string; total_cost: number; managed_copay_amount: number }>
  }>) {
    const offices = r.upper_limit_management_offices ?? []
    const self = offices.find((o) => o.office_number === facilityNumber)
    map.set(r.child_id, {
      managedCopay: self ? self.managed_copay_amount : null,
      managementAddition:
        r.is_self_managed && offices.some((o) => o.office_number !== facilityNumber && o.total_cost > 0),
    })
  }
  return map
}

/** 管理結果後利用者負担額（当事業所の行があるものだけ） */
export async function loadManagedCopays(
  supabase: SupabaseLike,
  yearMonth: string,
  childIds: string[],
  facilityNumber: string,
): Promise<Map<string, number>> {
  const info = await loadUpperLimitBillingInfo(supabase, yearMonth, childIds, facilityNumber)
  const map = new Map<string, number>()
  for (const [childId, i] of info) if (i.managedCopay != null) map.set(childId, i.managedCopay)
  return map
}

/**
 * 当事業所が上限管理する児童の「上限額管理加算を付けた／外したときの総費用額」を計算する材料。
 * 加算は上限管理を保存したあとで請求明細に付くので、保存前の画面では請求明細の総費用額と
 * 他事業所が計算した額（加算込み）がずれる。画面で見込み額を出せるように、
 * 処遇改善加算・上限額管理加算を除いた単位数と処遇改善加算の率を返す。
 */
export async function loadSelfCostBases(
  supabase: SupabaseLike,
  billingMonthlyIds: string[],
  childIds: string[],
): Promise<Map<string, { baseUnits: number; treatmentRate: number; additionUnits: number }>> {
  const map = new Map<string, { baseUnits: number; treatmentRate: number; additionUnits: number }>()
  if (billingMonthlyIds.length === 0 || childIds.length === 0) return map

  const [{ data: detailRows }, { data: monthlyRows }] = await Promise.all([
    supabase
      .from('billing_details')
      .select('child_id, billing_monthly_id, total_units, service_breakdown')
      .in('billing_monthly_id', billingMonthlyIds)
      .in('child_id', childIds),
    supabase.from('billing_monthly').select('id, unit_id').in('id', billingMonthlyIds),
  ])
  const unitByMonthly = new Map(
    ((monthlyRows ?? []) as Array<{ id: string; unit_id: string }>).map((m) => [m.id, m.unit_id]),
  )
  const unitIds = [...new Set(unitByMonthly.values())]
  const { data: rateRows } = unitIds.length
    ? await supabase
        .from('unit_addition_settings')
        .select('unit_id, rate')
        .eq('addition_key', 'treatment_improvement')
        .in('unit_id', unitIds)
    : { data: [] }
  const rateByUnit = new Map(
    ((rateRows ?? []) as Array<{ unit_id: string; rate: number | null }>).map((r) => [r.unit_id, Number(r.rate) || 0]),
  )

  for (const d of (detailRows ?? []) as Array<{
    child_id: string
    billing_monthly_id: string
    total_units: number
    service_breakdown: Array<{ name?: string; units: number }> | null
  }>) {
    if (map.has(d.child_id)) continue
    const lines = d.service_breakdown ?? []
    const treatment = lines.filter((l) => l.name?.startsWith(TREATMENT_LINE_PREFIX))
    const addition = lines.filter((l) => l.name === UPPER_LIMIT_ADDITION.name)
    const sum = (ls: Array<{ units: number }>) => ls.reduce((s, l) => s + (Number(l.units) || 0), 0)
    map.set(d.child_id, {
      baseUnits: d.total_units - sum(treatment) - sum(addition),
      // 処遇改善加算の行がない（算定していない）児童は率 0 として扱う
      treatmentRate: treatment.length > 0 ? rateByUnit.get(unitByMonthly.get(d.billing_monthly_id) ?? '') ?? 0 : 0,
      additionUnits: UPPER_LIMIT_ADDITION.unitCount,
    })
  }
  return map
}

/** 請求明細の内訳で、処遇改善加算の行の名前の先頭（「福祉・介護職員等処遇改善加算（Ⅰ）」など） */
const TREATMENT_LINE_PREFIX = FACILITY_ADDITION_MAP.get('treatment_improvement')?.label ?? '福祉・介護職員等処遇改善加算'
