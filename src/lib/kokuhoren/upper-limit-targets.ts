// 上限額管理の対象児童と、管理結果後の利用者負担額をまとめて扱う。
//
// 上限管理事業所の情報は3か所に入りうる。
//   1. upper_limit_managements … 月ごとの記録（入力済みなら最優先）
//   2. child_limit_management  … 児童詳細の「上限管理事業所情報」（開始日つきの履歴）
//   3. benefit_certificates    … 受給者証の「上限管理事業所名・番号・当事業所が管理」
// 実データでは「当事業所が管理」のチェックがなく、事業所名に「ぷらすわん」とだけ
// 書かれていることが多いので、名前でも自事業所かどうかを判定する。

import type { createClient } from '@/lib/supabase/server'

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
 * 上限額管理の結果、当事業所が利用者から受け取る負担額（管理結果後利用者負担額）。
 * 月ごとの記録のうち、当事業所の行があるものだけを返す。
 * この額が請求明細の利用者負担額・保護者への請求額・国保連の決定利用者負担額になる。
 */
export async function loadManagedCopays(
  supabase: SupabaseLike,
  yearMonth: string,
  childIds: string[],
  facilityNumber: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (childIds.length === 0 || !facilityNumber) return map

  const { data } = await supabase
    .from('upper_limit_managements')
    .select('child_id, upper_limit_management_offices (office_number, managed_copay_amount)')
    .eq('year_month', yearMonth)
    .in('child_id', childIds)

  for (const r of (data ?? []) as unknown as Array<{
    child_id: string
    upper_limit_management_offices: Array<{ office_number: string; managed_copay_amount: number }>
  }>) {
    const self = (r.upper_limit_management_offices ?? []).find((o) => o.office_number === facilityNumber)
    if (self) map.set(r.child_id, self.managed_copay_amount)
  }
  return map
}
