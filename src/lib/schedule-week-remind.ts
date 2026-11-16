import { getTodayJST } from '@/lib/utils'
import {
  getAdminClient,
  isMissingTable,
  loadConfirmations,
  loadNotice,
  loadWeekSchedule,
} from '@/lib/schedule-week-confirm-db'
import {
  addDays,
  childWeekState,
  parentWeekState,
  weekLabel,
  weekStartOf,
  type ChildWeekStatus,
} from '@/lib/schedule-week-confirm'

/**
 * 週ごとの予定の「確認しました」を、まだ押していない保護者へ LINE で催促する。
 *
 * - 送る相手は、利用状況の一覧で施設がチェックした児童の保護者だけ（schedule_remind_targets）。
 *   チェックは週ごとではなく、外すまで残る。
 * - 送るのは、その週を保護者に知らせたあとで、保護者の画面で「まだ」か「変わりました」に
 *   なっている児童の分。施設が「変更を知らせる」を押す前の変更では送らない
 *   （保護者の画面にまだ出ていないため。parentWeekState と同じ決め方）。
 * - LINE は保護者ごとに1通。きょうだいは1通にまとめる。同じ週に同じ保護者へ2回は送らない。
 * - 日曜18時の定期実行（/api/cron/schedule-week-remind）が、翌週（月曜から）の分を送る。
 *
 * 保護者へ送る LINE のキーは、保護者用の公式アカウントのもの（LINE_PARENT_CHANNEL_ACCESS_TOKEN）。
 * アプリの LINE_CHANNEL_ACCESS_TOKEN はスタッフ用の公式アカウントなので使わない。
 */

const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push'

/** 表がまだ無い（migration 188 を当てる前）ときのエラーか */
function isMissingRemindTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205'
}

/** 日曜の夜に送るのは、翌日（月曜）から始まる週 */
export function remindWeekStart(today: string = getTodayJST()): string {
  return addDays(weekStartOf(today), 7)
}

// ─────────────────────────────── チェック ───────────────────────────────

export type RemindInfo =
  | { ready: false }
  | {
      ready: true
      /** チェックの入っている児童 */
      targets: string[]
      /** LINE で保護者とつながっている児童 */
      withLine: string[]
      /** その週に催促を送った児童と、送った時刻 */
      sent: Record<string, string>
    }

/** 利用状況の一覧に出す、催促のチェックと送った記録 */
export async function loadRemindInfo(weekStart: string): Promise<RemindInfo> {
  const admin = getAdminClient()
  const [targetsRes, sentRes, linksRes] = await Promise.all([
    admin.from('schedule_remind_targets').select('child_id'),
    admin.from('schedule_week_reminders').select('child_ids, sent_at').eq('week_start', weekStart),
    admin.from('guardian_children').select('child_id, guardians!inner(line_user_id)'),
  ])
  if (isMissingRemindTable(targetsRes.error) || isMissingRemindTable(sentRes.error)) return { ready: false }
  if (targetsRes.error) throw new Error(targetsRes.error.message)
  if (sentRes.error) throw new Error(sentRes.error.message)
  if (linksRes.error) throw new Error(linksRes.error.message)

  const sent: Record<string, string> = {}
  for (const row of (sentRes.data ?? []) as { child_ids: string[]; sent_at: string }[]) {
    for (const id of row.child_ids) {
      if (!sent[id] || sent[id] < row.sent_at) sent[id] = row.sent_at
    }
  }
  return {
    ready: true,
    targets: ((targetsRes.data ?? []) as { child_id: string }[]).map((r) => r.child_id),
    withLine: [...new Set(((linksRes.data ?? []) as { child_id: string }[]).map((r) => r.child_id))],
    sent,
  }
}

/** チェックを入れる・外す。外したら行を消す */
export async function setRemindTarget(
  childId: string,
  on: boolean,
  userId: string
): Promise<{ error?: string }> {
  const admin = getAdminClient()
  const { error } = on
    ? await admin
        .from('schedule_remind_targets')
        .upsert({ child_id: childId, created_by: userId }, { onConflict: 'child_id', ignoreDuplicates: true })
    : await admin.from('schedule_remind_targets').delete().eq('child_id', childId)
  if (isMissingRemindTable(error)) return { error: 'この機能は準備中です' }
  return error ? { error: error.message } : {}
}

// ─────────────────────────────── 送る相手 ───────────────────────────────

export type RemindRecipient = {
  lineUserId: string
  children: { id: string; name: string; status: ChildWeekStatus }[]
}

export type RemindPlan = {
  weekStart: string
  /** その週を保護者に知らせていない（知らせていなければ催促もしない） */
  notNotified: boolean
  recipients: RemindRecipient[]
  /** 送らない理由のある児童（LINE の登録がない・もう送った） */
  skipped: { childName: string; reason: string }[]
}

/** チェックの入った児童のうち、保護者の画面で確認がまだの子と、その保護者の LINE */
export async function planReminders(weekStart: string): Promise<RemindPlan> {
  const admin = getAdminClient()
  const today = getTodayJST()

  const { notice, error: noticeError } = await loadNotice(admin, weekStart)
  // migration 187 の前は、知らせた週がないのと同じに扱う（定期実行をエラーにしない）
  if (isMissingTable(noticeError)) return { weekStart, notNotified: true, recipients: [], skipped: [] }
  if (noticeError) throw new Error(noticeError.message)
  if (!notice) return { weekStart, notNotified: true, recipients: [], skipped: [] }

  const { data: targetRows, error: targetError } = await admin
    .from('schedule_remind_targets')
    .select('child_id, children!inner(id, name, is_active)')
  if (targetError) throw new Error(targetError.message)
  const targets = ((targetRows ?? []) as unknown as {
    child_id: string
    children: { id: string; name: string; is_active: boolean }
  }[])
    .filter((r) => r.children.is_active)
    .map((r) => ({ id: r.child_id, name: r.children.name }))
  if (targets.length === 0) return { weekStart, notNotified: false, recipients: [], skipped: [] }

  const childIds = targets.map((c) => c.id)
  const [{ snapshots }, { rows: confirmations, error: confirmError }] = await Promise.all([
    loadWeekSchedule(admin, childIds, weekStart),
    loadConfirmations(admin, weekStart, childIds),
  ])
  if (confirmError) throw new Error(confirmError.message)
  const confirmByChild = new Map(confirmations.map((c) => [c.child_id, c]))

  // 保護者の画面での状態（loadParentWeeks と同じ決め方）
  const pending: { id: string; name: string; status: ChildWeekStatus }[] = []
  for (const child of targets) {
    const confirmation = confirmByChild.get(child.id)
    const staffState = childWeekState({
      current: snapshots.get(child.id),
      notified: true,
      noticeSnapshot: notice.snapshot?.[child.id],
      confirmSnapshot: confirmation?.snapshot,
      today,
    })
    if (staffState.status === 'no_plan') continue
    const state = parentWeekState(staffState, {
      noticeSnapshot: notice.snapshot?.[child.id],
      confirmSnapshot: confirmation?.snapshot,
      lastNotifiedAt: notice.last_notified_at,
      confirmedAt: confirmation?.confirmed_at ?? null,
      today,
    })
    if (state.status === 'waiting' || state.status === 'changed') {
      pending.push({ ...child, status: state.status })
    }
  }
  if (pending.length === 0) return { weekStart, notNotified: false, recipients: [], skipped: [] }

  const [{ data: linkRows, error: linkError }, { data: sentRows, error: sentError }] = await Promise.all([
    admin
      .from('guardian_children')
      .select('child_id, guardians!inner(line_user_id)')
      .in('child_id', pending.map((c) => c.id)),
    admin.from('schedule_week_reminders').select('line_user_id').eq('week_start', weekStart),
  ])
  if (linkError) throw new Error(linkError.message)
  if (sentError) throw new Error(sentError.message)
  const alreadySent = new Set(((sentRows ?? []) as { line_user_id: string }[]).map((r) => r.line_user_id))

  const byLine = new Map<string, RemindRecipient>()
  const skipped: RemindPlan['skipped'] = []
  for (const child of pending) {
    const lines = ((linkRows ?? []) as unknown as { child_id: string; guardians: { line_user_id: string | null } }[])
      .filter((r) => r.child_id === child.id && r.guardians.line_user_id)
      .map((r) => r.guardians.line_user_id as string)
    if (lines.length === 0) {
      skipped.push({ childName: child.name, reason: '保護者の LINE の登録がない' })
      continue
    }
    for (const line of lines) {
      if (alreadySent.has(line)) {
        skipped.push({ childName: child.name, reason: 'この週はもう送った' })
        continue
      }
      const r = byLine.get(line) ?? { lineUserId: line, children: [] }
      r.children.push(child)
      byLine.set(line, r)
    }
  }
  return { weekStart, notNotified: false, recipients: [...byLine.values()], skipped }
}

// ─────────────────────────────── 送る ───────────────────────────────

/** 保護者ポータルを LINE の中で開く URL（LINE のアカウントでそのまま入れる） */
export function portalUrl(): string | null {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID
  return liffId ? `https://liff.line.me/${liffId}` : null
}

/** 催促の文面。きょうだいは「Aさん・Bさん」とまとめる */
export function remindMessage(
  weekStart: string,
  children: { name: string; status: ChildWeekStatus }[],
  url: string | null
): string {
  const names = children.map((c) => `${c.name}さん`).join('・')
  const changed = children.some((c) => c.status === 'changed')
  const lines = [
    'いつもありがとうございます。',
    changed
      ? `${weekLabel(weekStart)}の、${names}のご利用予定に変更があり、保護者ポータルでお知らせしています。`
      : `${weekLabel(weekStart)}の、${names}のご利用予定を保護者ポータルでお知らせしています。`,
    'まだ「確認しました」が押されていないようです。',
    'お手数ですが、予定をご覧になって「確認しました」を押してください。',
  ]
  if (url) lines.push('', '▼保護者ポータル', url)
  lines.push('', '予定を変えたいときは、ポータルの「利用連絡」からご連絡ください。')
  return lines.join('\n')
}

export type RemindResult = {
  weekStart: string
  dryRun: boolean
  notNotified: boolean
  sent: number
  failed: { childNames: string[]; status: number }[]
  skipped: RemindPlan['skipped']
  /** dryRun のときだけ。送るはずだった相手（LINE の ID は出さない）と文面 */
  preview?: { childNames: string[]; text: string }[]
}

/**
 * 催促を送る。dryRun のときは送らずに、送る相手と文面だけを返す。
 * 送ったら schedule_week_reminders に記録し、同じ週に同じ保護者へ2回送らない。
 */
export async function sendReminders(
  weekStart: string,
  opts: { dryRun: boolean; token: string | null }
): Promise<RemindResult> {
  const plan = await planReminders(weekStart)
  const url = portalUrl()
  const base: RemindResult = {
    weekStart,
    dryRun: opts.dryRun,
    notNotified: plan.notNotified,
    sent: 0,
    failed: [],
    skipped: plan.skipped,
  }
  if (opts.dryRun) {
    return {
      ...base,
      preview: plan.recipients.map((r) => ({
        childNames: r.children.map((c) => c.name),
        text: remindMessage(weekStart, r.children, url),
      })),
    }
  }
  if (!opts.token) throw new Error('LINE_PARENT_CHANNEL_ACCESS_TOKEN が未設定です')

  const admin = getAdminClient()
  for (const r of plan.recipients) {
    const childNames = r.children.map((c) => c.name)
    // 先に記録を作る。2つの実行が重なっても、記録を作れたほうだけが送る
    const { error: claimError } = await admin.from('schedule_week_reminders').insert({
      week_start: weekStart,
      line_user_id: r.lineUserId,
      child_ids: r.children.map((c) => c.id),
    })
    if (claimError) {
      base.skipped.push({ childName: childNames.join('・'), reason: 'この週はもう送った' })
      continue
    }
    const res = await fetch(LINE_PUSH_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: r.lineUserId,
        messages: [{ type: 'text', text: remindMessage(weekStart, r.children, url) }],
      }),
    })
    if (res.ok) {
      base.sent++
    } else {
      // 送れなかったら記録を消し、次の実行でもう一度送れるようにする
      await admin
        .from('schedule_week_reminders')
        .delete()
        .eq('week_start', weekStart)
        .eq('line_user_id', r.lineUserId)
      base.failed.push({ childNames, status: res.status })
    }
  }
  return base
}
