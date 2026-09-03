import type {
  ChangeLogRow,
  CheckContext,
  Finding,
  Rule,
} from './types'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** "2026-08-03" → 曜日番号（0=日）。ローカルタイムゾーンの影響を受けないよう UTC で解釈する */
function dowOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/** "2026-08-03" → "8/3(月)" */
function label(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}(${WEEKDAYS[dowOf(date)]})`
}

/** "15:15:00" → "15:15" */
function hm(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}

/** "2026-08-03" → "2026-08" */
function ym(date: string): string {
  return date.slice(0, 7)
}

/** "2026-08" → "2026年8月" */
function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${y}年${Number(m)}月`
}

function finding(
  rule: string,
  severity: Finding['severity'],
  row: { child_id: string; date: string; id: string | null },
  tableName: string,
  message: string,
  detail: Record<string, unknown> = {}
): Finding {
  return {
    rule,
    severity,
    childId: row.child_id,
    targetDate: row.date,
    tableName,
    recordId: row.id,
    message,
    detail,
  }
}

/**
 * 変更履歴を「ひとまとまりの入力作業」に切り分ける。
 *
 * 同じ人が続けて入力している間は1セッション。手が止まって gapMinutes 以上
 * 空いたら別セッションとみなす。月の取り違えは「同じ作業の中で1件だけ月が違う」
 * という形で現れるので、この単位でまとめる必要がある。
 */
function buildSessions(logs: ChangeLogRow[], gapMinutes = 60): ChangeLogRow[][] {
  const byActor = new Map<string, ChangeLogRow[]>()
  for (const log of logs) {
    const key = log.changed_by ?? 'unknown'
    const list = byActor.get(key)
    if (list) list.push(log)
    else byActor.set(key, [log])
  }

  const sessions: ChangeLogRow[][] = []
  const gapMs = gapMinutes * 60 * 1000

  for (const list of byActor.values()) {
    list.sort((a, b) => a.changed_at.localeCompare(b.changed_at))
    let current: ChangeLogRow[] = []
    let prev = 0
    for (const log of list) {
      const t = new Date(log.changed_at).getTime()
      if (current.length > 0 && t - prev > gapMs) {
        sessions.push(current)
        current = []
      }
      current.push(log)
      prev = t
    }
    if (current.length > 0) sessions.push(current)
  }

  return sessions
}

/** その日に有効な利用計画があるか（曜日が一致するか） */
function hasPlanFor(ctx: CheckContext, childId: string, date: string): boolean {
  const dow = dowOf(date)
  return ctx.plans.some(
    (p) =>
      p.child_id === childId &&
      p.is_active &&
      p.start_date <= date &&
      (p.end_date === null || p.end_date >= date) &&
      (p.day_of_week ?? []).includes(dow)
  )
}

/** その日に生きている予約があるか（単発利用はこちらで拾う） */
function hasLiveReservation(ctx: CheckContext, childId: string, date: string): boolean {
  return ctx.reservations.some(
    (r) => r.child_id === childId && r.date === date && r.status !== 'cancelled'
  )
}

// =====================================================
// ルール定義
// =====================================================

const futureAttended: Rule = {
  key: 'future_attended',
  label: '未来の日が「出席済み」',
  description:
    'まだ来ていない日付に出席済みの記録が付いています。日付を間違えて入力した可能性があります。',
  enabled: true,
  run: (ctx) =>
    ctx.attendance
      .filter((a) => a.status === 'attended' && a.date > ctx.today)
      .map((a) =>
        finding('future_attended', 'high', a, 'daily_attendance',
          `${label(a.date)} はまだ来ていない日ですが「出席済み」になっています`,
          { status: a.status })
      ),
}

const timeInconsistent: Rule = {
  key: 'time_inconsistent',
  label: '提供時間が登降園時刻と噛み合わない',
  description:
    '提供時間が、その日の登園〜降園の時間帯とまったく重なっていません。別の日の時間を書き込んでしまった可能性があります。',
  enabled: true,
  run: (ctx) => {
    const out: Finding[] = []
    for (const a of ctx.attendance) {
      if (a.status !== 'attended') continue
      if (!a.check_in_time || !a.check_out_time) continue
      if (!a.service_start_time || !a.service_end_time) continue

      // この施設は送迎時間を提供時間に含めて記録している（提供開始が登園の
      // 40〜50分前になるのが通常）。そのため「提供開始が登園より前」「提供終了が
      // 降園より後」で判定すると、正常な記録の 2割超が引っかかってしまう。
      // 実データで確認したところ、単純比較では 459件中135件が該当し使いものに
      // ならなかった一方、「まったく重ならない」は 1件だけだった。
      // どんな記録の仕方をしていても時間帯が完全に離れることは起きないので、
      // ここだけを見る。
      const overlaps =
        a.service_end_time > a.check_in_time && a.service_start_time < a.check_out_time
      if (overlaps) continue

      out.push(
        finding('time_inconsistent', 'high', a, 'daily_attendance',
          `${label(a.date)} 提供時間 ${hm(a.service_start_time)}〜${hm(a.service_end_time)} が、` +
            `登降園 ${hm(a.check_in_time)}〜${hm(a.check_out_time)} とまったく重なっていません`,
          { checkIn: a.check_in_time, checkOut: a.check_out_time })
      )
    }
    return out
  },
}

const offPlanDay: Rule = {
  key: 'off_plan_day',
  label: '利用予定のない曜日に予定が入っている',
  description:
    'これから先の日付で、利用計画にない曜日に予定が作られています。曜日や月を取り違えて入力した可能性があります。',
  enabled: true,
  run: (ctx) =>
    ctx.attendance
      .filter(
        (a) =>
          // 過去日は対象にしない。利用計画は随時書き換えられるため、当時は
          // 計画どおりだった日でも、今の計画と突き合わせると「計画外」に
          // なってしまう（実データでは過去分の 48件がこれに該当した）。
          // 実績が付いている日は実際に来たということでもあるので、
          // 「これから先の予定」だけを見る。
          a.date >= ctx.today &&
          a.status === 'scheduled' &&
          !hasPlanFor(ctx, a.child_id, a.date) &&
          !hasLiveReservation(ctx, a.child_id, a.date)
      )
      .map((a) =>
        finding('off_plan_day', 'medium', a, 'daily_attendance',
          `${label(a.date)} は利用計画にない曜日ですが予定が入っています`,
          { weekday: WEEKDAYS[dowOf(a.date)] })
      ),
}

const cancelledButRecorded: Rule = {
  key: 'cancelled_but_recorded',
  label: 'キャンセル済みの日に記録',
  description:
    '利用をキャンセルした日に、あとから予定や実績が作られています。誤って復活させてしまった可能性があります。',
  enabled: true,
  run: (ctx) => {
    // 予約のキャンセルと、利用計画の特定日キャンセルの両方を集める
    const cancelled = new Set<string>()
    for (const r of ctx.reservations) {
      if (r.status === 'cancelled') cancelled.add(`${r.child_id}:${r.date}`)
    }
    const planChild = new Map(ctx.plans.map((p) => [p.id, p.child_id]))
    for (const o of ctx.overrides) {
      if (!o.is_cancelled) continue
      const childId = planChild.get(o.plan_id)
      if (childId) cancelled.add(`${childId}:${o.date}`)
    }

    return ctx.attendance
      .filter(
        (a) =>
          // 実績（attended）が付いている日は、キャンセル後に実際に来たという
          // ことなので誤りではない。予定だけが復活しているものに絞る。
          a.status === 'scheduled' && cancelled.has(`${a.child_id}:${a.date}`)
      )
      .map((a) =>
        finding('cancelled_but_recorded', 'high', a, 'daily_attendance',
          `${label(a.date)} はキャンセル済みの日ですが、予定が入っています`,
          { status: a.status })
      )
  },
}

const monthOutlier: Rule = {
  key: 'month_outlier',
  label: '入力した月が他とずれている',
  description:
    'ひと続きの入力作業の中で、一部だけ違う月に入力されています。カレンダーの月を送り忘れたまま入力した可能性があります。',
  enabled: true,
  run: (ctx) => {
    const out: Finding[] = []
    const inserts = ctx.changeLogs.filter(
      (l) => l.table_name === 'daily_attendance' && l.operation === 'INSERT' && l.record_date
    )

    for (const session of buildSessions(inserts)) {
      // 少ない件数では「たまたま」と区別がつかない
      if (session.length < 8) continue

      const counts = new Map<string, number>()
      for (const log of session) {
        const key = ym(log.record_date!)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      if (counts.size < 2) continue

      let mode = ''
      let modeCount = 0
      for (const [key, n] of counts) {
        if (n > modeCount) {
          mode = key
          modeCount = n
        }
      }
      // 主流の月がはっきりしているときだけ、外れた分を疑う
      if (modeCount / session.length < 0.6) continue

      // 児童ごと・月ごとにまとめる（1日1件ずつ出すと大量になり読めなくなる）
      const groups = new Map<string, ChangeLogRow[]>()
      for (const log of session) {
        if (ym(log.record_date!) === mode) continue
        if (!log.child_id) continue
        const key = `${log.child_id}:${ym(log.record_date!)}`
        const list = groups.get(key)
        if (list) list.push(log)
        else groups.set(key, [log])
      }

      for (const [key, logs] of groups) {
        const [childId, month] = key.split(':')
        const dates = logs.map((l) => l.record_date!).sort()
        out.push({
          rule: 'month_outlier',
          severity: 'high',
          childId,
          targetDate: dates[0],
          tableName: 'daily_attendance',
          recordId: null,
          message:
            `${dates.length}件が ${monthLabel(month)} に入力されましたが、` +
            `同じ作業では主に ${monthLabel(mode)} 分が入力されています。月の取り違えの可能性があります`,
          detail: { dates, enteredMonth: month, expectedMonth: mode, sessionSize: session.length },
        })
      }
    }
    return out
  },
}

const lockedMonthChanged: Rule = {
  key: 'locked_month_changed',
  label: '請求確定済みの月が変更された',
  description:
    'CSV出力や提出が済んでいる月の記録が、あとから変更されています。請求内容と実際の記録がずれる可能性があります。',
  enabled: true,
  run: (ctx) => {
    const locked = new Set(
      ctx.billingMonths
        .filter((b) => ['exported', 'submitted', 'finalized'].includes(b.status))
        // billing_monthly は "YYYYMM"、record_date は "YYYY-MM-DD"
        .map((b) => `${b.year_month.slice(0, 4)}-${b.year_month.slice(4, 6)}`)
    )
    if (locked.size === 0) return []

    const out: Finding[] = []
    const seen = new Set<string>()
    for (const log of ctx.changeLogs) {
      if (log.table_name !== 'daily_attendance') continue
      if (log.operation === 'INSERT' && !log.record_date) continue
      if (!log.record_date || !locked.has(ym(log.record_date))) continue
      // 同じ日付・同じ児童で何度も出さない
      const key = `${log.child_id}:${log.record_date}`
      if (seen.has(key)) continue
      seen.add(key)

      out.push({
        rule: 'locked_month_changed',
        severity: 'high',
        childId: log.child_id,
        targetDate: log.record_date,
        tableName: 'daily_attendance',
        recordId: log.record_id,
        message: `${label(log.record_date)} は請求処理済みの月ですが、記録が変更されました`,
        detail: { operation: log.operation, changedAt: log.changed_at },
      })
    }
    return out
  },
}

// --- 以下は誤検知が出やすいため既定でオフ。運用を見ながら有効化する ---

const pastMonthEdit: Rule = {
  key: 'past_month_edit',
  label: '前月以前の記録が編集された',
  description:
    '当月より前の記録があとから変更されています。通常の修正でも出るため、既定ではオフにしています。',
  enabled: false,
  run: (ctx) => {
    const thisMonth = ym(ctx.today)
    const seen = new Set<string>()
    const out: Finding[] = []
    for (const log of ctx.changeLogs) {
      if (log.table_name !== 'daily_attendance' || log.operation !== 'UPDATE') continue
      if (!log.record_date || ym(log.record_date) >= thisMonth) continue
      const key = `${log.child_id}:${log.record_date}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        rule: 'past_month_edit',
        severity: 'low',
        childId: log.child_id,
        targetDate: log.record_date,
        tableName: 'daily_attendance',
        recordId: log.record_id,
        message: `${label(log.record_date)}（前月以前）の記録が変更されました`,
        detail: { changedAt: log.changed_at },
      })
    }
    return out
  },
}

const rapidBulkEntry: Rule = {
  key: 'rapid_bulk_entry',
  label: '短時間に大量の入力',
  description:
    '短い時間に同じ児童の記録が大量に作られています。一括操作の押し間違いを拾いますが、通常の月初入力でも出ます。',
  enabled: false,
  run: (ctx) => {
    const out: Finding[] = []
    const inserts = ctx.changeLogs.filter(
      (l) => l.table_name === 'daily_attendance' && l.operation === 'INSERT'
    )
    for (const session of buildSessions(inserts, 10)) {
      const byChild = new Map<string, ChangeLogRow[]>()
      for (const log of session) {
        if (!log.child_id) continue
        const list = byChild.get(log.child_id)
        if (list) list.push(log)
        else byChild.set(log.child_id, [log])
      }
      for (const [childId, logs] of byChild) {
        if (logs.length < 20) continue
        const dates = logs.map((l) => l.record_date).filter(Boolean).sort() as string[]
        out.push({
          rule: 'rapid_bulk_entry',
          severity: 'low',
          childId,
          targetDate: dates[0] ?? null,
          tableName: 'daily_attendance',
          recordId: null,
          message: `10分以内に ${logs.length}件 の記録が作られました`,
          detail: { dates },
        })
      }
    }
    return out
  },
}

const overlappingPlans: Rule = {
  key: 'overlapping_plans',
  label: '利用スケジュールが重複している',
  description:
    '同じ児童・同じユニットに、期間も曜日も重なる利用スケジュールが2本以上あります。古い方に終了日を入れずに新しい予定を足したときに起きます。出席管理に同じ児童が2行出たり、送迎の時間・送迎区分がどちらの計画のものか定まらなくなります。',
  enabled: true,
  run: (ctx) => {
    // ユニットごとに見る。別ユニットを掛け持ちしている児童は重複ではない。
    const byChildUnit = new Map<string, typeof ctx.plans>()
    for (const p of ctx.plans) {
      if (!p.is_active) continue
      const key = `${p.child_id}|${p.unit_id ?? '-'}`
      const list = byChildUnit.get(key)
      if (list) list.push(p)
      else byChildUnit.set(key, [p])
    }

    const out: Finding[] = []
    for (const plans of byChildUnit.values()) {
      if (plans.length < 2) continue

      // 期間と曜日の両方が重なる組み合わせだけが実害のある重複。
      // 「4〜5月の旧計画 ＋ 6月からの新計画」のような正しい引き継ぎは除かれる。
      for (let i = 0; i < plans.length; i++) {
        for (let j = i + 1; j < plans.length; j++) {
          const a = plans[i]
          const b = plans[j]
          const days = (a.day_of_week ?? []).filter((d) => (b.day_of_week ?? []).includes(d))
          if (days.length === 0) continue

          const from = a.start_date > b.start_date ? a.start_date : b.start_date
          const ends = [a.end_date, b.end_date].filter((e): e is string => !!e)
          const to = ends.length === 2 ? (ends[0] < ends[1] ? ends[0] : ends[1]) : (ends[0] ?? null)
          if (to !== null && to < from) continue
          // すでに終わった重複は知らせない。過ぎた日の二重表示は直せないし、
          // 夏休みなどの臨時計画を重ねた形が過去分に何件も残っているため、
          // そのまま出すと本当に直すべき指摘が埋もれる。
          if (to !== null && to < ctx.today) continue
          if (from > ctx.to) continue

          // 実際に採用される方（開始日が新しい方）を先に挙げる
          const [primary, ignored] = a.start_date >= b.start_date ? [a, b] : [b, a]
          const weekdays = days.sort().map((d) => WEEKDAYS[d]).join('・')
          out.push({
            rule: 'overlapping_plans',
            severity: 'high',
            childId: a.child_id,
            targetDate: from,
            tableName: 'usage_plans',
            recordId: ignored.id,
            message:
              `${weekdays}曜の利用スケジュールが2本重なっています` +
              `（${from} 〜${to ? ` ${to}` : ''}）。使われていない方に終了日を入れてください`,
            detail: {
              weekdays: days.map((d) => WEEKDAYS[d]),
              from,
              to,
              使われる計画: { id: primary.id, start_date: primary.start_date, end_date: primary.end_date },
              使われない計画: { id: ignored.id, start_date: ignored.start_date, end_date: ignored.end_date },
            },
          })
        }
      }
    }
    return out
  },
}

/**
 * ルール一覧。追加するときはここに足すだけでよい。
 * 画面（/checks）はこの配列から説明とオン・オフ状況を表示する。
 */
export const RULES: Rule[] = [
  futureAttended,
  timeInconsistent,
  offPlanDay,
  cancelledButRecorded,
  monthOutlier,
  lockedMonthChanged,
  pastMonthEdit,
  rapidBulkEntry,
  overlappingPlans,
]

export const RULE_LABELS: Record<string, string> = Object.fromEntries(
  RULES.map((r) => [r.key, r.label])
)

/** 検知結果の同一性を決めるキー。差分更新（再検知・解消判定）に使う */
export function findingKey(f: Finding): string {
  return [f.rule, f.childId ?? '-', f.targetDate ?? '-', f.recordId ?? '-'].join(':')
}
