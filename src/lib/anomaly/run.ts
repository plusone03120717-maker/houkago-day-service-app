import type { SupabaseClient } from '@supabase/supabase-js'
import { getTodayJST } from '@/lib/utils'
import { RULES, findingKey } from './rules'
import type {
  AttendanceRow,
  BillingMonthRow,
  ChangeLogRow,
  CheckContext,
  Finding,
  OverrideRow,
  PlanRow,
  ReservationRow,
} from './types'

/** 変更履歴を遡る日数。夜間バッチが数日止まっても取りこぼさない長さにしてある */
const CHANGE_LOG_DAYS = 7

export type RunResult = {
  runId: string | null
  from: string
  to: string
  found: number
  created: number
  reopened: number
  resolved: number
}

/** YYYY-MM-DD の日付を月単位でずらす（月末は自動的に丸められる） */
function shiftMonth(today: string, months: number, day: 'first' | 'last'): string {
  const [y, m] = today.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1 + months, 1))
  if (day === 'first') {
    return base.toISOString().slice(0, 10)
  }
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0))
  return end.toISOString().slice(0, 10)
}

/**
 * 入力チェックを実行して anomaly_findings を差分更新する。
 *
 * 職員が「確認済み」「無視」にした判断を上書きしないよう、全消し＆再作成では
 * なく finding_key による差分更新にしている。詳細は migration 127 を参照。
 */
export async function runAnomalyCheck(
  supabase: SupabaseClient,
  options: { triggerSource?: 'cron' | 'manual'; triggeredBy?: string | null } = {}
): Promise<RunResult> {
  const startedAt = new Date().toISOString()
  const today = getTodayJST()
  // 過去は請求作業中の前月分まで、未来は登録済みの予定が届く範囲まで見る。
  // 過去を広げすぎると初回に古い指摘が大量に出て読まれなくなるので前月で止める。
  const from = shiftMonth(today, -1, 'first')
  const to = shiftMonth(today, 3, 'last')
  const changeLogSince = new Date(
    Date.now() - CHANGE_LOG_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const { data: runRow } = await supabase
    .from('anomaly_check_runs')
    .insert({
      started_at: startedAt,
      trigger_source: options.triggerSource ?? 'cron',
      triggered_by: options.triggeredBy ?? null,
      checked_from: from,
      checked_to: to,
    })
    .select('id')
    .single()
  const runId = (runRow as { id: string } | null)?.id ?? null

  try {
    const [attendance, plans, reservations, overrides, billingMonths, changeLogs, children] =
      await Promise.all([
        supabase
          .from('daily_attendance')
          .select(
            'id, child_id, unit_id, date, status, check_in_time, check_out_time, service_start_time, service_end_time, daytime_support, daytime_support_start_time, daytime_support_end_time'
          )
          .gte('date', from)
          .lte('date', to),
        supabase
          .from('usage_plans')
          .select('id, child_id, day_of_week, start_date, end_date, is_active'),
        supabase
          .from('usage_reservations')
          .select('child_id, date, status')
          .gte('date', from)
          .lte('date', to),
        supabase
          .from('usage_plan_date_overrides')
          .select('plan_id, date, is_cancelled')
          .gte('date', from)
          .lte('date', to),
        supabase.from('billing_monthly').select('unit_id, year_month, status'),
        supabase
          .from('record_change_logs')
          .select('id, table_name, record_id, operation, child_id, record_date, changed_by, changed_at')
          .gte('changed_at', changeLogSince)
          .order('changed_at'),
        supabase.from('children').select('id, name'),
      ])

    const ctx: CheckContext = {
      today,
      from,
      to,
      childNames: new Map(
        ((children.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
      ),
      attendance: (attendance.data ?? []) as AttendanceRow[],
      plans: (plans.data ?? []) as PlanRow[],
      reservations: (reservations.data ?? []) as ReservationRow[],
      overrides: (overrides.data ?? []) as OverrideRow[],
      billingMonths: (billingMonths.data ?? []) as BillingMonthRow[],
      changeLogs: (changeLogs.data ?? []) as ChangeLogRow[],
    }

    const activeRules = RULES.filter((r) => r.enabled)
    const findings: Finding[] = []
    for (const rule of activeRules) {
      findings.push(...rule.run(ctx))
    }

    // 同じキーが複数ルールから出ることはないが、念のため重複を潰す
    const byKey = new Map<string, Finding>()
    for (const f of findings) byKey.set(findingKey(f), f)

    // 既存分の対応状況を読み出しておく。1件ずつ UPDATE すると検知数に比例して
    // 往復が増え、Vercel の実行時間上限（30秒）に当たるため、
    // 読み出した状態をそのまま載せて1回の upsert にまとめる。
    type ExistingRow = {
      finding_key: string
      status: string
      detected_at: string
      closed_at: string | null
      closed_by: string | null
      closed_note: string | null
    }
    const keys = [...byKey.keys()]
    const existing = new Map<string, ExistingRow>()
    for (let i = 0; i < keys.length; i += 200) {
      const { data } = await supabase
        .from('anomaly_findings')
        .select('finding_key, status, detected_at, closed_at, closed_by, closed_note')
        .in('finding_key', keys.slice(i, i + 200))
      for (const row of (data ?? []) as ExistingRow[]) existing.set(row.finding_key, row)
    }

    const seenAt = new Date().toISOString()
    const rows: Record<string, unknown>[] = []
    let created = 0
    let reopened = 0

    for (const [key, f] of byKey) {
      const prev = existing.get(key)
      // 「無視」にした判断は尊重する。いったん解消扱いになったものが
      // また出てきた場合だけ open に戻す。
      const revive = prev?.status === 'resolved'
      if (!prev) created++
      if (revive) reopened++

      rows.push({
        finding_key: key,
        rule: f.rule,
        severity: f.severity,
        child_id: f.childId,
        target_date: f.targetDate,
        table_name: f.tableName,
        record_id: f.recordId,
        message: f.message,
        detail: f.detail,
        last_seen_at: seenAt,
        detected_at: prev?.detected_at ?? seenAt,
        status: !prev || revive ? 'open' : prev.status,
        closed_at: !prev || revive ? null : prev.closed_at,
        closed_by: !prev || revive ? null : prev.closed_by,
        closed_note: !prev || revive ? null : prev.closed_note,
      })
    }

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase
        .from('anomaly_findings')
        .upsert(rows.slice(i, i + 200), { onConflict: 'finding_key' })
      if (error) throw new Error(error.message)
    }

    // 今回検知されなかった未対応分は「直った」とみなす。
    // オフにしたルールの結果まで消さないよう、有効なルールに限る。
    const { data: resolvedRaw } = await supabase
      .from('anomaly_findings')
      .update({ status: 'resolved', closed_at: seenAt })
      .eq('status', 'open')
      .in('rule', activeRules.map((r) => r.key))
      .lt('last_seen_at', startedAt)
      .select('id')
    const resolved = (resolvedRaw ?? []).length

    if (runId) {
      await supabase
        .from('anomaly_check_runs')
        .update({
          finished_at: new Date().toISOString(),
          found_count: byKey.size,
          new_count: created,
          resolved_count: resolved,
        })
        .eq('id', runId)
    }

    return {
      runId,
      from,
      to,
      found: byKey.size,
      created,
      reopened,
      resolved,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (runId) {
      await supabase
        .from('anomaly_check_runs')
        .update({ finished_at: new Date().toISOString(), error: message })
        .eq('id', runId)
    }
    throw e
  }
}
