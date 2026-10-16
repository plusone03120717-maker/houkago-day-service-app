// 国保連請求の月初自動化：他事業所から届く上限管理の FAX がそろったかを判定する。
//
// FAX の読み取りは Claude Code のルーティンが行い（Gmail で jFax の受信メールを開いて PDF を読む）、
// 結果を upper_limit_fax_receipts に残す。ここでは
//   ・届くはずの FAX（待つ先）を推定し
//   ・届いた分と突き合わせて、そろった／未着を出し
//   ・おかしな点（違和感）を拾う
// 金額は下書き。上限管理の記録（upper_limit_managements）には書き込まない。

import type { createClient } from '@/lib/supabase/server'
import { resolveUpperLimitTargets } from '@/lib/kokuhoren/upper-limit-targets'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

/** ルーティンが読み取った1つの帳票 */
export type FaxFormInput = {
  /** copay_list = 利用者負担額一覧表／result = 上限額管理結果票 */
  formType: 'copay_list' | 'result'
  /** 帳票に書かれたサービス提供月（YYYYMM） */
  formYearMonth: string
  /** 帳票を出した事業所（一覧表は提供事業所、結果票は管理事業所） */
  officeNumber: string
  officeName: string
  entries: Array<{
    certificateNumber: string
    /** 一覧表：その事業所の総費用額・利用者負担額 */
    totalCost?: number | null
    copayAmount?: number | null
    /** 結果票：管理結果（1〜3） */
    result?: '1' | '2' | '3' | null
    /** 結果票：事業所ごとの行（うちの行を含む） */
    offices?: Array<{
      officeNumber: string
      officeName?: string
      totalCost?: number | null
      copayAmount?: number | null
      managedCopayAmount?: number | null
    }>
  }>
}

/** ルーティンが読んだ1通の FAX */
export type FaxInput = {
  /** jFax が付けた PDF のファイル名 */
  faxFile: string
  /** 受信日時（ISO 8601） */
  receivedAt?: string | null
  forms: FaxFormInput[]
  /** 読んでいて引っかかったこと（読めないページ・手書きで自信がない数字など） */
  concerns?: string[]
  /** 上限管理と関係がないときのメモ */
  note?: string
}

export type FaxRunInput = {
  yearMonth: string
  faxes: FaxInput[]
  /** FAX に限らず、ルーティンが気づいたこと */
  concerns?: string[]
}

/** 届くはずの FAX 1件 */
export type ExpectedFax = {
  childId: string
  childName: string
  formType: 'copay_list' | 'result'
  officeNumber: string
  officeName: string
}

/**
 * 違和感。key が同じものは二度知らせない（中身が少し変わっても同じ件として扱いたいときは key を固定する）。
 */
export type Concern = { key: string; text: string }

const concern = (text: string, key: string = text): Concern => ({ key, text })

export type ArrivalStatus = {
  yearMonth: string
  expected: ExpectedFax[]
  arrived: ExpectedFax[]
  missing: ExpectedFax[]
  /** 待つ先を決められなかった・予定にない FAX など、確かめてほしいこと */
  concerns: Concern[]
}

function shiftMonth(yearMonth: string, diff: number): string {
  const y = parseInt(yearMonth.slice(0, 4))
  const m = parseInt(yearMonth.slice(4, 6)) - 1 + diff
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

type MonthChild = { childId: string; childName: string; totalCost: number; facilityName: string; facilityNumber: string }

/** その月に請求明細がある児童（請求対象ユニットのみ）と、うちの総費用額 */
async function loadMonthChildren(supabase: SupabaseLike, yearMonth: string): Promise<MonthChild[]> {
  const { data } = await supabase
    .from('billing_details')
    .select(
      'child_id, copay_amount, billed_amount, children (name), billing_monthly!inner (year_month, units!inner (is_billing_target, facilities (name, facility_number)))',
    )
    .eq('billing_monthly.year_month', yearMonth)
    .eq('billing_monthly.units.is_billing_target', true)

  type Row = {
    child_id: string
    copay_amount: number
    billed_amount: number
    children: { name: string } | null
    billing_monthly: { units: { facilities: { name: string; facility_number: string } | null } | null } | null
  }
  const byChild = new Map<string, MonthChild>()
  for (const r of (data ?? []) as unknown as Row[]) {
    const f = r.billing_monthly?.units?.facilities
    const prev = byChild.get(r.child_id)
    byChild.set(r.child_id, {
      childId: r.child_id,
      childName: r.children?.name ?? '',
      totalCost: (prev?.totalCost ?? 0) + (r.copay_amount ?? 0) + (r.billed_amount ?? 0),
      facilityName: f?.name ?? '',
      facilityNumber: f?.facility_number ?? '',
    })
  }
  return [...byChild.values()]
}

/**
 * 届くはずの FAX（待つ先）を推定する。
 * ・他事業所が上限管理する児童 → その管理事業所から結果票が届く
 * ・うちが上限管理する児童     → 前月に一覧表をくれた事業所から、今月も一覧表が届く
 */
export async function loadExpectedFaxes(
  supabase: SupabaseLike,
  yearMonth: string,
): Promise<{ expected: ExpectedFax[]; concerns: Concern[]; children: MonthChild[]; unknownSelf: MonthChild[] }> {
  const children = await loadMonthChildren(supabase, yearMonth)
  const expected: ExpectedFax[] = []
  const concerns: Concern[] = []
  // うちが管理しているが、前月の記録がなくて待つ先がわからない児童
  const unknownSelf: MonthChild[] = []
  if (children.length === 0) {
    concerns.push(concern(`${parseInt(yearMonth.slice(4, 6))}月分の請求明細がまだありません（1日の朝の集計が動いたか確かめてください）`))
    return { expected, concerns, children, unknownSelf }
  }

  // 施設ごとに上限管理の対象を判定する（いまは施設1つだが、分かれても動くように）
  const byFacility = new Map<string, MonthChild[]>()
  for (const c of children) {
    const list = byFacility.get(c.facilityNumber) ?? []
    list.push(c)
    byFacility.set(c.facilityNumber, list)
  }

  const prevMonth = shiftMonth(yearMonth, -1)
  for (const [facilityNumber, list] of byFacility) {
    const facility = { name: list[0].facilityName, facilityNumber }
    const targets = await resolveUpperLimitTargets(
      supabase,
      yearMonth,
      list.map((c) => c.childId),
      facility,
    )
    const selfIds = [...targets.values()].filter((t) => t.isSelf).map((t) => t.childId)

    // うちが管理する児童：前月に他事業所の行があった事業所を待つ
    const { data: prevRows } = selfIds.length
      ? await supabase
          .from('upper_limit_managements')
          .select('child_id, upper_limit_management_offices (office_number, office_name, total_cost)')
          .eq('year_month', prevMonth)
          .in('child_id', selfIds)
      : { data: [] }
    const prevByChild = new Map(
      ((prevRows ?? []) as unknown as Array<{
        child_id: string
        upper_limit_management_offices: Array<{ office_number: string; office_name: string; total_cost: number }>
      }>).map((r) => [r.child_id, r.upper_limit_management_offices ?? []]),
    )

    for (const c of list) {
      const t = targets.get(c.childId)
      if (!t) continue
      if (!t.isSelf) {
        expected.push({
          childId: c.childId,
          childName: c.childName,
          formType: 'result',
          officeNumber: t.managerNumber,
          officeName: t.managerName,
        })
        continue
      }
      const offices = (prevByChild.get(c.childId) ?? []).filter(
        (o) => o.office_number !== facilityNumber && o.total_cost > 0,
      )
      if (offices.length === 0) {
        unknownSelf.push(c)
        continue
      }
      for (const o of offices) {
        expected.push({
          childId: c.childId,
          childName: c.childName,
          formType: 'copay_list',
          officeNumber: o.office_number,
          officeName: o.office_name,
        })
      }
    }
  }
  return { expected, concerns, children, unknownSelf }
}

export type ReceiptRow = {
  year_month: string
  fax_file: string
  received_at: string | null
  form_type: 'copay_list' | 'result'
  office_number: string
  office_name: string
  certificate_number: string
  child_id: string | null
  total_cost: number | null
  copay_amount: number | null
  result: string | null
  managed_copay_amount: number | null
  raw: { entry?: unknown; ourRow?: { totalCost?: number | null } | null } | null
}

/** 届いた分と待つ先を突き合わせる */
export async function loadArrivalStatus(
  supabase: SupabaseLike,
  yearMonth: string,
  /** まだ保存していない読み取り結果（dry-run で、記録したらどうなるかを見るため） */
  pending: ReceiptRow[] = [],
): Promise<ArrivalStatus> {
  const { expected, concerns, children, unknownSelf } = await loadExpectedFaxes(supabase, yearMonth)
  const { data } = await supabase
    .from('upper_limit_fax_receipts')
    .select('year_month, fax_file, received_at, form_type, office_number, office_name, certificate_number, child_id, total_cost, copay_amount, result, managed_copay_amount, raw')
    .eq('year_month', yearMonth)
  const receipts = [...((data ?? []) as unknown as ReceiptRow[]), ...pending]

  // 待つ先がわからない児童は、届いた一覧表をそのまま待つ先に加える（届いた分はそろったとみなす）
  const unknownIds = new Set(unknownSelf.map((c) => c.childId))
  for (const r of receipts) {
    if (r.form_type !== 'copay_list' || !r.child_id || !unknownIds.has(r.child_id)) continue
    if (expected.some((e) => e.childId === r.child_id && e.formType === 'copay_list' && digits(e.officeNumber) === digits(r.office_number))) continue
    const c = unknownSelf.find((u) => u.childId === r.child_id)!
    expected.push({ childId: c.childId, childName: c.childName, formType: 'copay_list', officeNumber: r.office_number, officeName: r.office_name })
  }
  const stillUnknown = unknownSelf.filter((c) => !receipts.some((r) => r.child_id === c.childId && r.form_type === 'copay_list'))
  if (stillUnknown.length > 0) {
    // 届くたびに名前が減るが、同じ件として1回だけ知らせる
    concerns.push(
      concern(
        `うちが上限管理する児童のうち、前月の記録がなく、どこから一覧表が届くかわからない児童：${stillUnknown.map((c) => c.childName).join('、')}（届いた分から数えます。全員分そろったかは職員の方でも確かめてください）`,
        'unknown_self',
      ),
    )
  }

  const isMatch = (e: ExpectedFax, r: ReceiptRow) =>
    r.child_id === e.childId &&
    r.form_type === e.formType &&
    (e.officeNumber === '' || digits(r.office_number) === digits(e.officeNumber))

  const arrived = expected.filter((e) => receipts.some((r) => isMatch(e, r)))
  const missing = expected.filter((e) => !arrived.includes(e))

  const nameOf = new Map(children.map((c) => [c.childId, c.childName]))
  const costOf = new Map(children.map((c) => [c.childId, c.totalCost]))
  const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`

  for (const r of receipts) {
    const label = `${r.office_name || r.office_number}の${r.form_type === 'result' ? '結果票' : '一覧表'}`
    if (!r.child_id) {
      concerns.push(concern(`${label}にある受給者証番号 ${r.certificate_number} の児童がアプリに見つかりません`))
      continue
    }
    const childName = nameOf.get(r.child_id) ?? '（この月に利用のない児童）'
    if (!expected.some((e) => isMatch(e, r))) {
      concerns.push(concern(`${childName}: 待っていなかった${label}が届きました（上限管理の対象・事業所を確かめてください）`))
    }
    // 結果票のうちの行の総費用額が、うちの請求明細と合っているか
    const ourTotal = r.raw?.ourRow?.totalCost
    const billed = costOf.get(r.child_id)
    if (r.form_type === 'result' && ourTotal != null && billed != null && ourTotal !== billed) {
      concerns.push(concern(`${childName}: ${label}のうちの総費用額 ${yen(ourTotal)} が、請求明細の ${yen(billed)} と違います`))
    }
  }

  // 同じ児童・同じ事業所・同じ帳票で、金額の違う FAX が2通以上
  const groups = new Map<string, ReceiptRow[]>()
  for (const r of receipts) {
    if (!r.child_id) continue
    const key = `${r.child_id}|${digits(r.office_number)}|${r.form_type}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  for (const rows of groups.values()) {
    const amounts = new Set(rows.map((r) => `${r.total_cost}/${r.copay_amount}/${r.result}/${r.managed_copay_amount}`))
    if (amounts.size > 1) {
      const r = rows[0]
      concerns.push(
        concern(`${nameOf.get(r.child_id!) ?? ''}: ${r.office_name || r.office_number}から金額の違う FAX が${rows.length}通届いています（訂正版かもしれません）`),
      )
    }
  }

  return { yearMonth, expected, arrived, missing, concerns }
}

type FaxFileRow = {
  fax_file: string
  year_month: string
  received_at: string | null
  has_upper_limit_forms: boolean
  note: string
}

/**
 * ルーティンの読み取り結果を、保存する行に直す（まだ保存しない）。
 * concerns は、この回の入力そのものについての違和感（月が違う・番号の桁が違うなど）。
 */
export async function prepareFaxRun(
  supabase: SupabaseLike,
  input: FaxRunInput,
): Promise<{ receipts: ReceiptRow[]; files: FaxFileRow[]; concerns: Concern[] }> {
  const concerns: Concern[] = (input.concerns ?? []).map((c) => concern(c))
  const receipts: ReceiptRow[] = []
  const files: FaxFileRow[] = []

  // 受給者証番号 → 児童（有効期間は問わない。番号が変わらない限り同じ児童）
  const certNumbers = [
    ...new Set(input.faxes.flatMap((f) => f.forms.flatMap((form) => form.entries.map((e) => digits(e.certificateNumber))))),
  ].filter(Boolean)
  const { data: certRows } = certNumbers.length
    ? await supabase.from('benefit_certificates').select('certificate_number, child_id').in('certificate_number', certNumbers)
    : { data: [] }
  const childByCert = new Map(
    ((certRows ?? []) as Array<{ certificate_number: string; child_id: string }>).map((r) => [r.certificate_number, r.child_id]),
  )

  const { data: facilityRows } = await supabase.from('facilities').select('facility_number')
  const ourNumbers = new Set(
    ((facilityRows ?? []) as Array<{ facility_number: string | null }>).map((f) => digits(f.facility_number)).filter(Boolean),
  )

  for (const fax of input.faxes) {
    for (const c of fax.concerns ?? []) concerns.push(concern(`${fax.faxFile}: ${c}`))

    const rows: ReceiptRow[] = []
    for (const form of fax.forms) {
      if (form.formYearMonth && form.formYearMonth !== input.yearMonth) {
        concerns.push(
          concern(`${fax.faxFile}: ${form.officeName || form.officeNumber}の帳票が ${form.formYearMonth.slice(0, 4)}年${parseInt(form.formYearMonth.slice(4, 6))}月分になっています（今回は数えません）`),
        )
        continue
      }
      if (form.officeNumber && digits(form.officeNumber).length !== 10) {
        concerns.push(concern(`${fax.faxFile}: 事業所番号「${form.officeNumber}」が10桁ではありません（読み違いかもしれません）`))
      }
      for (const e of form.entries) {
        const cert = digits(e.certificateNumber)
        if (cert.length !== 10) {
          concerns.push(concern(`${fax.faxFile}: 受給者証番号「${e.certificateNumber}」が10桁ではありません（読み違いかもしれません）`))
        }
        const ourRow = e.offices?.find((o) => ourNumbers.has(digits(o.officeNumber)))
        if (form.formType === 'result' && e.offices && !ourRow) {
          concerns.push(concern(`${fax.faxFile}: 受給者証番号 ${cert} の結果票に、うちの事業所の行が見つかりません`))
        }
        rows.push({
          year_month: input.yearMonth,
          fax_file: fax.faxFile,
          received_at: fax.receivedAt ?? null,
          form_type: form.formType,
          office_number: digits(form.officeNumber),
          office_name: form.officeName ?? '',
          certificate_number: cert,
          child_id: childByCert.get(cert) ?? null,
          total_cost: e.totalCost ?? null,
          copay_amount: e.copayAmount ?? null,
          result: e.result ?? null,
          managed_copay_amount: ourRow?.managedCopayAmount ?? null,
          raw: { entry: e, ourRow: ourRow ?? null },
        })
      }
    }

    receipts.push(...rows)
    files.push({
      fax_file: fax.faxFile,
      year_month: input.yearMonth,
      received_at: fax.receivedAt ?? null,
      has_upper_limit_forms: rows.length > 0,
      note: fax.note ?? '',
    })
  }

  return { receipts, files, concerns }
}

/** prepareFaxRun の結果を保存する */
export async function saveFaxRun(
  supabase: SupabaseLike,
  prepared: { receipts: ReceiptRow[]; files: FaxFileRow[] },
): Promise<void> {
  if (prepared.receipts.length > 0) {
    const { error } = await supabase
      .from('upper_limit_fax_receipts')
      .upsert(prepared.receipts, { onConflict: 'fax_file,office_number,certificate_number,form_type' })
    if (error) throw new Error(`FAX の読み取り結果を保存できませんでした: ${error.message}`)
  }
  if (prepared.files.length > 0) {
    const { error } = await supabase.from('upper_limit_fax_files').upsert(prepared.files, { onConflict: 'fax_file' })
    if (error) throw new Error(`読んだ FAX の控えを保存できませんでした: ${error.message}`)
  }
}

/** 待つ先を「事業所 → 児童」でまとめた行 */
function groupByOffice(list: ExpectedFax[]): string[] {
  const groups = new Map<string, { name: string; form: string; children: string[] }>()
  for (const e of list) {
    const key = `${e.officeNumber || e.officeName}|${e.formType}`
    const g = groups.get(key) ?? {
      name: e.officeName || e.officeNumber || '事業所名未登録',
      form: e.formType === 'result' ? '結果票' : '一覧表',
      children: [],
    }
    g.children.push(e.childName)
    groups.set(key, g)
  }
  return [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map((g) => `・${g.name}（${g.form}）：${g.children.join('、')}`)
}

export function faxCompleteNotice(status: ArrivalStatus, appUrl: string): string {
  const month = parseInt(status.yearMonth.slice(4, 6))
  return [
    `【国保連請求】${month}月分の上限管理の FAX が全員分そろいました（${status.arrived.length}件）`,
    '',
    ...groupByOffice(status.arrived),
    '',
    'FAX の画像（You First の Gmail）と見比べて、上限管理の画面で金額を入れて確定してください。読み取った内容は下書きです。',
    `${appUrl}/billing/${status.yearMonth}/upper-limit`,
  ].join('\n')
}

export function faxMissingNotice(status: ArrivalStatus, appUrl: string): string {
  const month = parseInt(status.yearMonth.slice(4, 6))
  return [
    `【国保連請求】${month}月分の上限管理の FAX で、まだ届いていないものがあります（${status.missing.length}件）`,
    '',
    ...groupByOffice(status.missing),
    '',
    `届いている分：${status.arrived.length}件`,
    '必要なら、各事業所へ催促の連絡をお願いします。',
    `${appUrl}/billing/${status.yearMonth}/upper-limit`,
  ].join('\n')
}

export function faxConcernNotice(yearMonth: string, concerns: string[]): string {
  const month = parseInt(yearMonth.slice(4, 6))
  const shown = concerns.slice(0, 15).map((c) => `・${c}`)
  if (concerns.length > 15) shown.push(`・ほか ${concerns.length - 15} 件`)
  return [
    `【国保連請求】${month}月分の上限管理の FAX を読んでいて、気になる点があります`,
    '',
    ...shown,
    '',
    'FAX の画像（You First の Gmail）と、アプリの上限管理の画面を確かめてください。',
  ].join('\n')
}
