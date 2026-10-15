// 国保連請求の月初自動化（段階1）。
// 毎月1日の朝に前月分を全ユニット集計し、請求担当へ LINE で送る要確認をまとめる。
//
// 書き込むのは「まだ誰も手を付けていない月」だけ（画面の「出席実績から再集計」と同じ処理）。
// 状態が下書き以外・確定済みの児童がいる・手入力した明細がある月は書き換えず、
// 読むだけの集計で要確認を知らせる。

import type { createClient } from '@/lib/supabase/server'
import { aggregateUnitMonth } from './aggregate'
import { recalcUnitMonth } from './recalc'
import { resolveUpperLimitTargets } from '@/lib/kokuhoren/upper-limit-targets'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export type MonthStartUnitReport = {
  unitId: string
  unitName: string
  /** 再集計して請求明細を作り直したか */
  recalculated: boolean
  /** 再集計しなかった理由（recalculated が false のとき） */
  skippedReason: string | null
  childCount: number
  totalDays: number
  billedAmount: number
  /** 児童名つきの要確認（出力前に直す必要があるもの） */
  childErrors: string[]
  warnings: string[]
  /** 集計そのものができなかった理由 */
  error: string | null
}

export type MonthStartUpperLimitReport = {
  facilityName: string
  /** 他事業所が管理事業所の児童（うちから総費用額を FAX で送る）。送り先ごと */
  sendTo: Array<{ managerName: string; managerNumber: string; childNames: string[] }>
  /** 当事業所が管理事業所の児童（他事業所から総費用額が届くのを待つ） */
  selfManagedChildNames: string[]
  /** 上限管理で直してほしいところ */
  issues: string[]
}

export type MonthStartReport = {
  yearMonth: string
  units: MonthStartUnitReport[]
  upperLimits: MonthStartUpperLimitReport[]
}

/** JST の今日から見た前月（YYYYMM） */
export function previousYearMonthJST(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const y = jst.getUTCFullYear()
  const m = jst.getUTCMonth() // 0 始まりなので、そのまま前月の月番号になる
  return m === 0 ? `${y - 1}12` : `${y}${String(m).padStart(2, '0')}`
}

/** JST で今日が1日か（Cron は月末の数日に呼ばれるので、ここで1日だけに絞る） */
export function isFirstDayJST(now: Date = new Date()): boolean {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDate() === 1
}

/**
 * その月の請求明細に、まだ誰も手を付けていないか。
 * 手を付けていれば理由を返す（null = 再集計してよい）。
 */
async function touchedReason(
  supabase: SupabaseLike,
  unitId: string,
  yearMonth: string,
): Promise<string | null> {
  const { data: monthly } = await supabase
    .from('billing_monthly')
    .select('id, status')
    .eq('unit_id', unitId)
    .eq('year_month', yearMonth)
    .maybeSingle()
  if (!monthly) return null
  if (monthly.status !== 'draft') return `状態が「${monthly.status}」のため`

  const { data: details } = await supabase
    .from('billing_details')
    .select('is_confirmed, recalculated_at')
    .eq('billing_monthly_id', monthly.id)
  const rows = (details ?? []) as Array<{ is_confirmed: boolean; recalculated_at: string | null }>
  if (rows.some((d) => d.is_confirmed)) return '確定済みの児童がいるため'
  if (rows.some((d) => d.recalculated_at === null)) return '手入力した明細があるため'
  return null
}

/**
 * 前月分の月初集計を実行する。
 * apply が false のときは何も書き込まず、どうなるかだけを返す（確認スクリプト用）。
 */
export async function runMonthStartBilling(
  supabase: SupabaseLike,
  yearMonth: string,
  { apply }: { apply: boolean },
): Promise<MonthStartReport> {
  const { data: unitRows } = await supabase
    .from('units')
    .select('id, name, facility_id, facilities (name, facility_number)')
    .eq('is_billing_target', true)
    .order('name')

  type UnitRow = {
    id: string
    name: string
    facility_id: string
    facilities: { name: string; facility_number: string } | null
  }
  const units = (unitRows ?? []) as unknown as UnitRow[]

  const reports: MonthStartUnitReport[] = []
  // 施設ごとに、上限管理の判定に使う児童をためる
  const byFacility = new Map<string, { name: string; facilityNumber: string; childNames: Map<string, string> }>()

  for (const unit of units) {
    const reason = await touchedReason(supabase, unit.id, yearMonth)
    const aggregate = await aggregateUnitMonth(supabase, unit.id, yearMonth)

    const base: MonthStartUnitReport = {
      unitId: unit.id,
      unitName: unit.name,
      recalculated: false,
      skippedReason: reason,
      childCount: 0,
      totalDays: 0,
      billedAmount: 0,
      childErrors: [],
      warnings: [],
      error: null,
    }

    if (aggregate.fatal) {
      reports.push({ ...base, error: aggregate.fatal })
      continue
    }
    // 利用のなかったユニットは知らせない
    if (aggregate.children.length === 0 && !reason) continue

    const facility = byFacility.get(unit.facility_id) ?? {
      name: unit.facilities?.name ?? '',
      facilityNumber: unit.facilities?.facility_number ?? '',
      childNames: new Map<string, string>(),
    }
    for (const c of aggregate.children) facility.childNames.set(c.childId, c.childName)
    byFacility.set(unit.facility_id, facility)

    if (apply && !reason) {
      const r = await recalcUnitMonth(supabase, unit.id, yearMonth)
      if (r.error) {
        reports.push({ ...base, error: r.error })
        continue
      }
      reports.push({
        ...base,
        recalculated: true,
        childCount: r.childCount,
        totalDays: r.totalDays,
        billedAmount: r.billedAmount,
        childErrors: r.childErrors,
        warnings: r.warnings,
      })
      continue
    }

    reports.push({
      ...base,
      childCount: aggregate.children.length,
      totalDays: aggregate.children.reduce((s, c) => s + c.totalDays, 0),
      billedAmount: aggregate.children.reduce((s, c) => s + c.billedAmount, 0),
      childErrors: aggregate.children.flatMap((c) => c.errors.map((e) => `${c.childName}: ${e}`)),
      warnings: aggregate.warnings,
    })
  }

  const upperLimits: MonthStartUpperLimitReport[] = []
  for (const facility of byFacility.values()) {
    const childIds = [...facility.childNames.keys()]
    const targets = await resolveUpperLimitTargets(supabase, yearMonth, childIds, {
      name: facility.name,
      facilityNumber: facility.facilityNumber,
    })
    if (targets.size === 0) continue

    const sendTo = new Map<string, { managerName: string; managerNumber: string; childNames: string[] }>()
    const selfManagedChildNames: string[] = []
    const issues: string[] = []
    const missingNumber = new Set<string>()
    const sorted = [...targets.values()].sort((a, b) =>
      (facility.childNames.get(a.childId) ?? '').localeCompare(facility.childNames.get(b.childId) ?? '', 'ja'),
    )
    for (const t of sorted) {
      const childName = facility.childNames.get(t.childId) ?? ''
      if (t.conflict) issues.push(`${childName}: ${t.conflict}`)
      if (t.isSelf) {
        selfManagedChildNames.push(childName)
        continue
      }
      if (!t.managerNumber) missingNumber.add(t.managerName || '事業所名未登録')
      const key = t.managerNumber || t.managerName || '（事業所名未登録）'
      const g = sendTo.get(key) ?? { managerName: t.managerName, managerNumber: t.managerNumber, childNames: [] }
      g.childNames.push(childName)
      sendTo.set(key, g)
    }

    if (missingNumber.size > 0) {
      issues.push(
        `上限管理事業所の事業所番号が未登録です：${[...missingNumber].sort((a, b) => a.localeCompare(b, 'ja')).join('、')}` +
          '（児童詳細 → 受給者証の「上限管理事業所番号（10桁）」に入れてください）',
      )
    }

    upperLimits.push({
      facilityName: facility.name,
      sendTo: [...sendTo.values()].sort((a, b) => a.managerName.localeCompare(b.managerName, 'ja')),
      selfManagedChildNames,
      issues,
    })
  }

  return { yearMonth, units: reports, upperLimits }
}

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`

/** 1つの見出しの下に並べる要確認の上限（LINE の1通 5000 文字に収めるため） */
const MAX_ITEMS = 12

function listLines(items: string[]): string[] {
  const shown = items.slice(0, MAX_ITEMS).map((s) => `・${s}`)
  if (items.length > MAX_ITEMS) shown.push(`・ほか ${items.length - MAX_ITEMS} 件（アプリで確認してください）`)
  return shown
}

/** 請求担当へ送る LINE の本文 */
export function monthStartNotice(report: MonthStartReport, appUrl: string): string {
  const month = parseInt(report.yearMonth.slice(4, 6))
  const lines: string[] = [`【国保連請求】${month}月分の集計ができました`]

  let issueCount = 0
  for (const u of report.units) {
    lines.push('')
    if (u.error) {
      lines.push(`■ ${u.unitName}：集計できませんでした`)
      lines.push(`・${u.error}`)
      issueCount++
      continue
    }
    lines.push(`■ ${u.unitName}：${u.childCount}名・${u.totalDays}日・請求額 ${yen(u.billedAmount)}`)
    lines.push(
      u.recalculated
        ? '（出席実績から明細を作りました）'
        : `（${u.skippedReason ?? ''}明細は書き換えていません。数字は今の出席実績での集計です）`,
    )
    const items = [...u.childErrors, ...u.warnings]
    issueCount += items.length
    if (items.length > 0) {
      lines.push(`要確認 ${items.length}件`)
      lines.push(...listLines(items))
    }
  }

  for (const ul of report.upperLimits) {
    lines.push('')
    lines.push(`■ 上限管理（${ul.facilityName}）`)
    for (const g of ul.sendTo) {
      lines.push(`・${g.managerName || '事業所名未登録'}へ総費用額を送る：${g.childNames.join('、')}`)
    }
    if (ul.selfManagedChildNames.length > 0) {
      lines.push(`・当事業所が管理：${ul.selfManagedChildNames.join('、')}（他の事業所から総費用額が届くのを待ちます）`)
    }
    issueCount += ul.issues.length
    if (ul.issues.length > 0) {
      lines.push(`要確認 ${ul.issues.length}件`)
      lines.push(...listLines(ul.issues))
    }
  }

  lines.push('')
  lines.push(
    issueCount > 0
      ? '直したら、アプリの「国保連請求」で「出席実績から再集計」を押してください。'
      : '要確認はありません。アプリの「国保連請求」で内容を確かめてください。',
  )
  lines.push(`${appUrl}/billing/${report.yearMonth}`)
  return lines.join('\n')
}
