/**
 * 全体スケジュールの予定（schedule_events）の種類と、表示・入力の決まり。
 * PC の全体スケジュールと、スタッフ LINE の「会議・予定」タブで共通に使う。
 *
 * - 書きこめるのはシステム管理者だけ（canEditOperations・2026-11-20 依頼主）。
 *   児童管理 → モニタリングの「モニタリング予定」は、これまでどおり施設長も入れられる（2026-11-17 の決定）。
 * - 参加スタッフ（schedule_event_staff）が0人の予定は「全員」の予定として扱う。
 */

export const EVENT_TYPES = ['meeting', 'monitoring', 'event', 'external', 'other'] as const
export type EventType = (typeof EVENT_TYPES)[number]

export type EventTypeInfo = {
  label: string
  /** 札（バッジ）の色 */
  chip: string
  /** カレンダーのマスの小さな帯の色 */
  bar: string
  /** 点（凡例・一覧）の色 */
  dot: string
  /** タイトル欄の見本 */
  placeholder: string
}

export const EVENT_TYPE_INFO: Record<EventType, EventTypeInfo> = {
  meeting: {
    label: '会議',
    chip: 'bg-violet-100 text-violet-700',
    bar: 'bg-violet-100 text-violet-800 border-l-violet-500',
    dot: 'bg-violet-500',
    placeholder: '例：職員会議',
  },
  monitoring: {
    label: 'モニタリング',
    chip: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-100 text-emerald-800 border-l-emerald-500',
    dot: 'bg-emerald-500',
    placeholder: 'モニタリング',
  },
  event: {
    label: '行事',
    chip: 'bg-pink-100 text-pink-700',
    bar: 'bg-pink-100 text-pink-800 border-l-pink-500',
    dot: 'bg-pink-500',
    placeholder: '例：クリスマス会',
  },
  external: {
    label: '外部',
    chip: 'bg-amber-100 text-amber-700',
    bar: 'bg-amber-100 text-amber-800 border-l-amber-500',
    dot: 'bg-amber-500',
    placeholder: '例：学校との連絡会',
  },
  other: {
    label: 'その他',
    chip: 'bg-gray-100 text-gray-600',
    bar: 'bg-gray-100 text-gray-700 border-l-gray-400',
    dot: 'bg-gray-400',
    placeholder: '例：避難訓練・見学・面談',
  },
}

export function isEventType(v: unknown): v is EventType {
  return typeof v === 'string' && (EVENT_TYPES as readonly string[]).includes(v)
}

export function eventTypeInfo(v: string): EventTypeInfo {
  return isEventType(v) ? EVENT_TYPE_INFO[v] : EVENT_TYPE_INFO.other
}

/** 'HH:MM' または 'HH:MM:SS' → 'HH:MM'。空なら null */
export function hhmm(t: string | null | undefined): string | null {
  return t ? t.slice(0, 5) : null
}

/** 表示用の時間。終日・時刻なしは「終日」 */
export function eventTimeLabel(e: { all_day?: boolean; allDay?: boolean; start_time?: string | null; startTime?: string | null; end_time?: string | null; endTime?: string | null }): string {
  const allDay = e.all_day ?? e.allDay ?? false
  const start = hhmm(e.start_time ?? e.startTime ?? null)
  const end = hhmm(e.end_time ?? e.endTime ?? null)
  if (allDay || !start) return '終日'
  return end ? `${start}〜${end}` : `${start}〜`
}

/** 入力の検査（サーバーで使う）。問題がなければ null、あれば理由 */
export type EventInput = {
  event_type: string
  title: string
  event_date: string
  all_day: boolean
  start_time: string | null
  end_time: string | null
  location: string | null
  note: string | null
  child_id: string | null
  /** 参加スタッフ（users.id）。空なら全員 */
  staff_user_ids: string[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/

export function validateEventInput(v: EventInput): string | null {
  if (!isEventType(v.event_type)) return '種類を選んでください'
  if (!DATE_RE.test(v.event_date)) return '日付を選んでください'
  if (!v.title.trim()) return v.event_type === 'other' ? '内容を書いてください' : 'タイトルを書いてください'
  if (v.title.length > 100) return 'タイトルは100文字までにしてください'
  if (v.event_type === 'monitoring' && !v.child_id) return 'モニタリングは対象の子を選んでください'
  if (!v.all_day) {
    if (!v.start_time || !TIME_RE.test(v.start_time)) return '開始の時刻を入れるか、「終日」にしてください'
    if (v.end_time && !TIME_RE.test(v.end_time)) return '終了の時刻の形がちがいます'
    if (v.end_time && hhmm(v.end_time)! <= hhmm(v.start_time)!) return '終了は開始よりあとの時刻にしてください'
  }
  if ((v.location ?? '').length > 100) return '場所は100文字までにしてください'
  if ((v.note ?? '').length > 1000) return 'メモは1000文字までにしてください'
  return null
}
