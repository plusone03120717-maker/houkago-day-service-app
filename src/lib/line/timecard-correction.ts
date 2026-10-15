// LINEで送られた「出勤・退勤の付け忘れ報告」を読み取り、タイムカードへ自動で反映する。
// 承認は挟まず、書き換えた内容は time_record_corrections に残す。

export type PunchType = 'clock_in' | 'clock_out'

export type ParsedEntry = { type: PunchType | null; hour: number; minute: number }

export type ParsedReport = {
  /** 文中に日付があればその日（YYYY-MM-DD）。無ければ null */
  date: string | null
  entries: ParsedEntry[]
}

export type ParseResult =
  | { ok: true; report: ParsedReport }
  | { ok: false; reason: 'no_time' | 'ambiguous' | 'invalid_date' | 'invalid_time' }

const CLOCK_IN_WORDS = ['出勤', '出社', '始業', '到着', '着いた', '入り']
const CLOCK_OUT_WORDS = ['退勤', '退社', '終業', '帰宅', '帰った', '帰り', '上がり', 'あがり', '終わり', '終了']

/** 打刻の話をしているらしい文か（時刻が無いときに書き方を案内するかどうかの判定） */
export function looksLikePunchReport(text: string): boolean {
  const t = text.normalize('NFKC')
  return /忘れ|打刻/.test(t) || [...CLOCK_IN_WORDS, ...CLOCK_OUT_WORDS].some((w) => t.includes(w))
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function ymd(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

function parseDate(t: string, today: string): string | null | 'invalid' {
  if (/一昨日|おととい/.test(t)) return addDays(today, -2)
  if (/昨日|きのう|昨晩|昨夜/.test(t)) return addDays(today, -1)
  if (/今日|本日|きょう/.test(t)) return today

  const [ty, tm] = today.split('-').map(Number)

  // 10/14・10月14日
  const md = t.match(/(\d{1,2})\s*(?:\/|月)\s*(\d{1,2})\s*日?/)
  if (md) {
    const m = Number(md[1])
    const d = Number(md[2])
    let date = ymd(ty, m, d)
    if (!date) return 'invalid'
    if (date > today) date = ymd(ty - 1, m, d)
    return date ?? 'invalid'
  }

  // 14日（曜日の「日」は除く）
  const dOnly = t.match(/(?<![\d月])(\d{1,2})\s*日(?!曜)/)
  if (dOnly) {
    const d = Number(dOnly[1])
    let date = ymd(ty, tm, d)
    if (!date || date > today) date = tm === 1 ? ymd(ty - 1, 12, d) : ymd(ty, tm - 1, d)
    return date ?? 'invalid'
  }

  return null
}

type TimeHit = { index: number; end: number; hour: number; minute: number; meridiem: 'am' | 'pm' | null }

function findTimes(t: string): TimeHit[] {
  const hits: TimeHit[] = []
  const meridiemOf = (s: string | undefined): 'am' | 'pm' | null =>
    !s ? null : /午前|am/i.test(s) ? 'am' : 'pm'

  // 17:30 / 午後5:30
  for (const m of t.matchAll(/(午前|午後|am|pm)?\s*(\d{1,2})\s*:\s*(\d{2})/gi)) {
    // 位置は数字の先頭で測る（前の空白や「午後」は含めない）
    hits.push({ index: m.index! + m[0].search(/\d/), end: m.index! + m[0].length, hour: Number(m[2]), minute: Number(m[3]), meridiem: meridiemOf(m[1]) })
  }
  // 17時30分 / 17時半 / 17時
  for (const m of t.matchAll(/(午前|午後)?\s*(\d{1,2})\s*時\s*(?:(半)|(\d{1,2})\s*分)?/g)) {
    // 「17時間」は時刻ではない
    if (t[m.index! + m[0].length] === '間') continue
    const minute = m[3] ? 30 : m[4] ? Number(m[4]) : 0
    hits.push({ index: m.index! + m[0].search(/\d/), end: m.index! + m[0].length, hour: Number(m[2]), minute, meridiem: meridiemOf(m[1]) })
  }
  return hits.sort((a, b) => a.index - b.index)
}

function findKeywords(t: string): { index: number; end: number; type: PunchType }[] {
  const found: { index: number; end: number; type: PunchType }[] = []
  const scan = (words: string[], type: PunchType) => {
    for (const w of words) {
      let i = t.indexOf(w)
      while (i !== -1) {
        found.push({ index: i, end: i + w.length, type })
        i = t.indexOf(w, i + w.length)
      }
    }
  }
  scan(CLOCK_IN_WORDS, 'clock_in')
  scan(CLOCK_OUT_WORDS, 'clock_out')
  return found
}

/** 午前・午後の書き添えが無い小さい数字は午後とみなす（放デイの勤務時間帯に合わせる） */
function toHour24(hit: TimeHit, type: PunchType | null): number {
  if (hit.meridiem === 'pm' && hit.hour < 12) return hit.hour + 12
  if (hit.meridiem === 'am') return hit.hour === 12 ? 0 : hit.hour
  if (hit.hour < 7) return hit.hour + 12
  if (hit.hour === 7 && type === 'clock_out') return 19
  return hit.hour
}

/** 文中の日付（無ければ null、読めなければ 'invalid'） */
export function parseReportDate(text: string, today: string): string | null | 'invalid' {
  return parseDate(text.normalize('NFKC'), today)
}

/** 文中に「出勤」「退勤」のどちらか一方だけが書かれていればそれを返す */
export function parseReportType(text: string): PunchType | null {
  const types = new Set(findKeywords(text.normalize('NFKC')).map((k) => k.type))
  return types.size === 1 ? [...types][0] : null
}

export function parsePunchReport(text: string, today: string): ParseResult {
  const t = text.normalize('NFKC')
  const times = findTimes(t)
  if (times.length === 0) return { ok: false, reason: 'no_time' }
  if (times.length > 2) return { ok: false, reason: 'ambiguous' }

  const date = parseDate(t, today)
  if (date === 'invalid') return { ok: false, reason: 'invalid_date' }

  const keywords = findKeywords(t)
  let types: (PunchType | null)[]
  if (keywords.length === 0) {
    // 「9:00〜17:30」のように2つ並んでいれば早い方が出勤
    types = times.length === 1 ? [null] : ['clock_in', 'clock_out']
  } else {
    // 時刻との間の文字数がいちばん少ない言葉を採る（「9時出勤 18時退勤」「出勤9:00 退勤18:00」）
    const gap = (k: { index: number; end: number }, h: TimeHit) =>
      k.index >= h.end ? k.index - h.end : Math.max(0, h.index - k.end)
    types = times.map((h) => {
      let best = keywords[0]
      for (const k of keywords) {
        if (gap(k, h) < gap(best, h)) best = k
      }
      return best.type
    })
    // 「退勤17:30じゃなくて18:00」のような文はどちらが正しいか決められないので聞き返す
    if (types.length === 2 && types[0] === types[1]) return { ok: false, reason: 'ambiguous' }
  }

  const entries: ParsedEntry[] = []
  for (let i = 0; i < times.length; i++) {
    const hour = toHour24(times[i], types[i])
    const minute = times[i].minute
    if (hour > 23 || minute > 59) return { ok: false, reason: 'invalid_time' }
    entries.push({ type: types[i], hour, minute })
  }
  if (keywords.length === 0 && entries.length === 2) {
    entries.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
    entries[0].type = 'clock_in'
    entries[1].type = 'clock_out'
  }

  return { ok: true, report: { date, entries } }
}

// ─── 反映 ────────────────────────────────────────────────────────────────────

type DbRecord = { id: string; type: PunchType; recorded_at: string }

export type DayPunches = { clock_in: DbRecord | null; clock_out: DbRecord | null }

export function jstIso(date: string, hour: number, minute: number): string {
  return new Date(
    `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`,
  ).toISOString()
}

function missingType(day: DayPunches): PunchType | null {
  if (day.clock_in && !day.clock_out) return 'clock_out'
  if (!day.clock_in && day.clock_out) return 'clock_in'
  return null
}

export type ResolvedEntry = { date: string; type: PunchType; hour: number; minute: number }

/**
 * 日付つきの報告を、その日の出勤・退勤に割り当てる。
 * 「出勤」「退勤」が書かれていなければ、その日に抜けている方とみなす。
 */
export function resolveEntries(
  date: string,
  entries: ParsedEntry[],
  nowIso: string,
  day: DayPunches,
): ResolvedEntry[] | { error: 'unknown_type' | 'future' } {
  const out: ResolvedEntry[] = []
  for (const e of entries) {
    const type = e.type ?? missingType(day)
    if (!type) return { error: 'unknown_type' }
    if (new Date(jstIso(date, e.hour, e.minute)).getTime() > new Date(nowIso).getTime() + 10 * 60 * 1000) {
      return { error: 'future' }
    }
    out.push({ date, type, hour: e.hour, minute: e.minute })
  }
  return out
}

/** time_records を読み書きするためのクライアント（service role） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export async function loadDayPunches(admin: AdminClient, staffId: string, date: string): Promise<DayPunches> {
  const { data } = await admin
    .from('time_records')
    .select('id, type, recorded_at')
    .eq('staff_member_id', staffId)
    .in('type', ['clock_in', 'clock_out'])
    .gte('recorded_at', new Date(`${date}T00:00:00+09:00`).toISOString())
    .lt('recorded_at', new Date(`${addDays(date, 1)}T00:00:00+09:00`).toISOString())
    .order('recorded_at')
  const rows = (data ?? []) as DbRecord[]
  // タイムカード画面と同じく、出勤は最初・退勤は最後の打刻をその日の値とする
  return {
    clock_in: rows.find((r) => r.type === 'clock_in') ?? null,
    clock_out: [...rows].reverse().find((r) => r.type === 'clock_out') ?? null,
  }
}

export type MissingPunch = { staff_member_id: string; date: string; type: PunchType }

/**
 * from〜to（JSTの日付）の間で、出勤だけ・退勤だけの日を探す（新しい日付順）。
 * staffIds を省くと全スタッフが対象。
 */
export async function findMissingPunches(
  admin: AdminClient,
  from: string,
  to: string,
  staffIds?: string[],
): Promise<MissingPunch[]> {
  let q = admin
    .from('time_records')
    .select('staff_member_id, type, recorded_at')
    .in('type', ['clock_in', 'clock_out'])
    .gte('recorded_at', new Date(`${from}T00:00:00+09:00`).toISOString())
    .lt('recorded_at', new Date(`${addDays(to, 1)}T00:00:00+09:00`).toISOString())
  if (staffIds) q = q.in('staff_member_id', staffIds)
  const { data } = await q
  const days = new Map<string, Set<PunchType>>()
  for (const r of (data ?? []) as { staff_member_id: string; type: PunchType; recorded_at: string }[]) {
    const date = new Date(new Date(r.recorded_at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const key = `${r.staff_member_id}|${date}`
    if (!days.has(key)) days.set(key, new Set())
    days.get(key)!.add(r.type)
  }
  const out: MissingPunch[] = []
  for (const [key, types] of days) {
    if (types.size !== 1) continue
    const [staff_member_id, date] = key.split('|')
    out.push({ staff_member_id, date, type: types.has('clock_in') ? 'clock_out' : 'clock_in' })
  }
  return out.sort((x, y) => y.date.localeCompare(x.date))
}

export type AppliedChange = ResolvedEntry & { before: string | null }

export async function applyPunchCorrections(
  admin: AdminClient,
  staffId: string,
  entries: ResolvedEntry[],
  message: string,
): Promise<{ ok: true; changes: AppliedChange[] } | { ok: false; reason: 'order' }> {
  const byDate = new Map<string, DayPunches>()
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, await loadDayPunches(admin, staffId, e.date))
  }

  // 書き換えた結果、出勤が退勤より後になるなら反映しない
  for (const [date, day] of byDate) {
    const inIso = entries.find((e) => e.date === date && e.type === 'clock_in')
    const outIso = entries.find((e) => e.date === date && e.type === 'clock_out')
    const inAt = inIso ? jstIso(date, inIso.hour, inIso.minute) : day.clock_in?.recorded_at
    const outAt = outIso ? jstIso(date, outIso.hour, outIso.minute) : day.clock_out?.recorded_at
    if (inAt && outAt && new Date(inAt).getTime() >= new Date(outAt).getTime()) return { ok: false, reason: 'order' }
  }

  const now = new Date().toISOString()
  const changes: AppliedChange[] = []
  for (const e of entries) {
    const day = byDate.get(e.date)!
    const existing = day[e.type]
    const after = jstIso(e.date, e.hour, e.minute)
    let recordId: string
    if (existing) {
      await admin
        .from('time_records')
        .update({ recorded_at: after, edited_at: now, note: 'LINEで修正' })
        .eq('id', existing.id)
      recordId = existing.id
    } else {
      const { data } = await admin
        .from('time_records')
        .insert({ staff_member_id: staffId, type: e.type, recorded_at: after, edited_at: now, note: 'LINEで追加' })
        .select('id')
        .single()
      recordId = (data as { id: string }).id
    }
    await admin.from('time_record_corrections').insert({
      staff_member_id: staffId,
      time_record_id: recordId,
      type: e.type,
      target_date: e.date,
      before_recorded_at: existing?.recorded_at ?? null,
      after_recorded_at: after,
      source: 'line',
      message,
    })
    changes.push({ ...e, before: existing?.recorded_at ?? null })
  }
  return { ok: true, changes }
}

// ─── 返信文 ──────────────────────────────────────────────────────────────────

const LABEL: Record<PunchType, string> = { clock_in: '出勤', clock_out: '退勤' }

function md(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${m}月${d}日`
}

function hhmmJst(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(11, 16)
}

export const HOW_TO_REPORT =
  '付け忘れは、このトークに日付と時刻を送ると自動で反映されます。\n例：「10/14 退勤 17:30」「昨日 出勤 9:00」「今日 9時出勤 18時退勤」'

export function changesReply(name: string, changes: AppliedChange[]): string {
  const lines = changes.map((c) => {
    const time = `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`
    const before = c.before ? `（${hhmmJst(c.before)} から変更）` : ''
    return `・${md(c.date)} ${LABEL[c.type]} ${time}${before}`
  })
  return `✏️ ${name}さんのタイムカードに反映しました\n${lines.join('\n')}\n\n違っていたら、正しい日付と時刻をもう一度送ってください。`
}

function slashDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}`
}

function exampleLine(date: string, type: PunchType, time?: string): string {
  return `例：「${slashDate(date)} ${LABEL[type]} ${time ?? (type === 'clock_in' ? '9:00' : '17:30')}」`
}

/**
 * 日付か時刻が欠けている報告への聞き返し。
 * 記録が抜けている日が分かっていれば、その日と出勤/退勤を例に入れる。
 */
export function askAgainReply(opts: {
  today: string
  date: string | null
  type: PunchType | null
  time: string | null
  missing: MissingPunch | null
}): string {
  const { today, date, type, time, missing } = opts
  const exDate = date ?? missing?.date ?? today
  const exType = type ?? (missing && missing.date === exDate ? missing.type : null) ?? 'clock_out'
  const label = LABEL[exType]
  const hint = !date && missing ? `\n（記録されていないのは ${md(missing.date)}の${LABEL[missing.type]} です）` : ''
  if (!date && !time) {
    return `📅⏰ 日付と時刻が入っていません。\n${label}した日付と時刻を入れて、もう一度送ってください。${hint}\n\n${exampleLine(exDate, exType)}`
  }
  if (!date) {
    return `📅 日付が入っていません。\n何日の${label}か、日付を入れてもう一度送ってください。${hint}\n\n${exampleLine(exDate, exType, time ?? undefined)}`
  }
  return `⏰ 時刻が入っていません。\n${md(date)}の${label}の時刻を入れて、もう一度送ってください。\n\n${exampleLine(exDate, exType)}`
}

/** 夜の確認で打刻の抜けが見つかったときに本人へ送る文 */
export function missingPunchNotice(name: string, missing: MissingPunch[]): string {
  const lines = missing.map((m) => `・${md(m.date)}の${LABEL[m.type]}`)
  const first = missing[0]
  return `⚠️ ${name}さん、次の打刻が記録されていません。\n${lines.join('\n')}\n\n${LABEL[first.type]}した時刻を、日付と一緒にこのトークに送ってください。自動でタイムカードに反映されます。\n${exampleLine(first.date, first.type)}`
}

export function errorReply(reason: string): string {
  switch (reason) {
    case 'ambiguous':
      return `時刻を読み取れませんでした。出勤・退勤を1つずつ、日付と時刻を添えて送ってください。\n\n${HOW_TO_REPORT}`
    case 'invalid_date':
      return `日付を読み取れませんでした。\n\n${HOW_TO_REPORT}`
    case 'invalid_time':
      return `時刻を読み取れませんでした。\n\n${HOW_TO_REPORT}`
    case 'unknown_type':
      return `出勤と退勤のどちらの時刻か分かりませんでした。「出勤」か「退勤」を添えて、もう一度送ってください。\n\n${HOW_TO_REPORT}`
    case 'future':
      return 'これから先の時刻は反映できません。日付と時刻を確かめて、もう一度送ってください。'
    case 'too_old':
      return '1か月より前の分はLINEから直せません。管理者に連絡してください。'
    case 'order':
      return '出勤が退勤より後の時刻になってしまうため反映しませんでした。日付と時刻を確認してもう一度送ってください。'
    default:
      return HOW_TO_REPORT
  }
}

/**
 * スタッフから届いた文を報告として処理する。処理した（返信すべき文を返した）ら文字列、
 * 報告ではなさそうなら null を返す。日付か時刻が欠けていれば反映せず、入れ直すよう促す。
 */
export async function handlePunchReport(
  admin: AdminClient,
  staff: { id: string; name: string },
  text: string,
  now: Date = new Date(),
): Promise<string | null> {
  const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const date = parseReportDate(text, today)
  const parsed = parsePunchReport(text, today)

  const latestMissing = async () =>
    (await findMissingPunches(admin, addDays(today, -7), today, [staff.id]))[0] ?? null

  if (!parsed.ok) {
    if (parsed.reason !== 'no_time') return errorReply(parsed.reason)
    if (date === null && !looksLikePunchReport(text)) return null
    if (date === 'invalid') return errorReply('invalid_date')
    return askAgainReply({ today, date, type: parseReportType(text), time: null, missing: await latestMissing() })
  }

  const report = parsed.report
  if (!report.date) {
    const first = report.entries[0]
    return askAgainReply({
      today,
      date: null,
      type: first.type,
      time: report.entries.length === 1 ? `${first.hour}:${String(first.minute).padStart(2, '0')}` : null,
      missing: await latestMissing(),
    })
  }
  if (report.date < addDays(today, -31)) return errorReply('too_old')

  const day = await loadDayPunches(admin, staff.id, report.date)
  const resolved = resolveEntries(report.date, report.entries, now.toISOString(), day)
  if ('error' in resolved) return errorReply(resolved.error)

  // 履歴を残せない状態（テーブル未作成など）では書き換えない
  const { error: logTableError } = await admin.from('time_record_corrections').select('id').limit(1)
  if (logTableError) return 'ただいまLINEからの打刻修正を受け付けられません。管理者に連絡してください。'

  const applied = await applyPunchCorrections(admin, staff.id, resolved, text)
  if (!applied.ok) return errorReply(applied.reason)
  return changesReply(staff.name, applied.changes)
}
