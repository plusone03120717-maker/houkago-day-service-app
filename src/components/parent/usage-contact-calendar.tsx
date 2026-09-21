'use client'

import { useState } from 'react'
import { getJapaneseHolidayName } from '@/lib/japanese-holidays'
import { Loader2, ChevronLeft, ChevronRight, X, Car, Clock } from 'lucide-react'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import {
  resolveAssignment,
  describeAssignment,
  SERVICE_ASSIGNMENT_LABELS,
  type ServiceAssignmentType,
} from '@/lib/parent-contact-service'
import { formatMonthDay } from '@/lib/parent-reservation-deadline'
import {
  toPlaceValue,
  type ChildTransportPlaces,
  type TransportPlace,
  type LocationType,
} from '@/lib/transport-place'

/**
 * 保護者が利用する日を連絡するカレンダー。
 *
 * 保護者向けの入口は保護者ポータルに一本化しているため、この画面が唯一の実装。
 * データの出し入れは呼び出し側に任せてあるので、ログインの仕組みが変わっても
 * このコンポーネントは触らなくてよい。
 *
 * キャンセルは**前日まで**この画面から送れる。当日のお休みは施設が電話で受ける
 * （連絡が届いたことをその場で確かめる必要があり、欠席時対応加算の扱いにも関わるため）。
 * 送られたキャンセルを「欠席として記録する」か「予定から削除する」かは施設が選ぶ。
 *
 * 利用済みの実績（登園・降園と教室、給付日数の消化）もこの画面に出す。
 * 以前は「出席確認」という別のカレンダーがあったが、同じ月の同じ日を
 * 2つのカレンダーで見ることになり、どちらを見ればよいか分かりにくかった。
 *
 * サービス区分（放デイ / 日中一時）も保護者には選ばせない。使えるかどうかは
 * 受給者証と支給量の残りで決まり、保護者は判断材料を持っていないため、
 * 施設が承認するときに割り振る（@/lib/parent-contact-service）。
 * 保護者が送るのは「利用したい時間」と「送迎の希望」だけ。
 *
 * 送迎の「時刻」も聞かない。承認したサービス区分の利用時間から施設側で決まるため、
 * 保護者に入れてもらっても引き直しになっていた。代わりに、これまで聞けていなかった
 * 「どこへ迎えに行くか・どこへ送るか」を選べるようにしている（@/lib/transport-place）。
 */

export type TransportType = 'none' | 'pickup_only' | 'dropoff_only' | 'both'

export type UsageContactChild = { id: string; name: string }

export type UsageContact = {
  child_id: string
  date: string
  status: 'attending' | 'absent'
  /** 施設が承認時に割り振ったサービス区分。保護者は選ばない */
  service_type: ServiceAssignmentType
  /** 保護者が希望した利用時間 */
  service_start_time: string | null
  service_end_time: string | null
  /** 施設が割り振った放デイ・日中一時の時間 */
  assigned_service_start_time: string | null
  assigned_service_end_time: string | null
  assigned_daytime_start_time: string | null
  assigned_daytime_end_time: string | null
  transport_type: TransportType
  /** 保護者が指定した迎えに行く場所・送り届ける場所 */
  pickup_location_type: LocationType
  pickup_address_id: string | null
  dropoff_location_type: LocationType
  dropoff_address_id: string | null
  note: string | null
  approval_status: 'pending' | 'approved' | 'rejected'
  /** 施設が予定へ反映した時刻。null＝まだ反映されていない */
  applied_at: string | null
}

/** 施設がお休みの日。この日は利用連絡を送れない */
export type FacilityClosure = {
  date: string
  title: string
}

/** 施設側で決まっているその日の状態 */
export type FacilityScheduleDay = {
  child_id: string
  date: string
  kind: 'planned' | 'absent' | 'attended'
  /** 利用済みの日の実績。以前は出席確認の別ページで見せていたもの */
  check_in_time?: string | null
  check_out_time?: string | null
  unit_name?: string | null
  /**
   * いまその日に入っている予定の中身。毎週の利用スケジュールから作られた日も含む。
   * 保護者が「いまの予定」を見たうえで時間を変えられるようにするために使う。
   */
  service_start_time?: string | null
  service_end_time?: string | null
  transport_type?: TransportType | null
  pickup_place?: string | null
  dropoff_place?: string | null
}

/**
 * 利用連絡の申込締切。
 *
 * closed の月は「新しい日」を増やせない。すでに予定が入っている日
 * （施設の利用予定がある・以前に連絡を送った）の時間や送迎の変更は締切後も送れる。
 */
export type UsageDeadline = {
  enabled: boolean
  /** 前月の何日までか */
  day: number
  /** 表示中の月の新規申込が締め切られているか */
  closed: boolean
  /** 表示中の月の締切日（YYYY-MM-DD） */
  deadlineDate: string
}

/** 受給者証の給付日数上限（児童ごと） */
export type BenefitLimit = {
  child_id: string
  max_days_per_month: number
}

/** お子さまごとの「いつもの内容」。前に送った連絡から作る */
export type UsageDefault = {
  childId: string
  serviceStartTime: string | null
  serviceEndTime: string | null
  transportType: TransportType
  pickupPlace: string
  dropoffPlace: string
}

/**
 * 送信の結果。まとめて申し込んだときは、送れた日と送れなかった日が混ざる。
 * どの日が通ったのかを画面で示すために日付を返してもらう。
 */
export type UsageSubmitResult = {
  error?: string
  savedDates?: string[]
  skipped?: { date: string; reason: string }[]
}

export type UsageContactEntry = {
  childId: string
  status: 'attending' | 'absent'
  serviceStartTime: string | null
  serviceEndTime: string | null
  transportType: TransportType
  pickupPlace: string
  dropoffPlace: string
  note: string
}

type EntryState = {
  /** この日は利用する、と選んだか。false の子は送信対象から外れる */
  attending: boolean
  serviceStart: string
  serviceEnd: string
  /** 送迎はその日に「行き」「帰り」の2本しかない。サービスごとには聞かない */
  goPickup: boolean
  goDropoff: boolean
  /** 迎えに行く場所・送り届ける場所（@/lib/transport-place の値） */
  pickupPlace: string
  dropoffPlace: string
  note: string
}

/**
 * 送迎の希望を transport_type に組み立てる。
 *
 * 子どもが家を出るのは1日1回、帰るのも1回。放デイと日中一時を続けて使う日でも
 * 送迎は2本のままなので、サービスごとに聞かず「行き」「帰り」で受け取る。
 * どちらのサービスの送迎として記録するかは、時間から施設側が判定する
 * （@/lib/schedule-defaults の resolveTransportSlot）。
 */
function toTransportType(goPickup: boolean, goDropoff: boolean): TransportType {
  if (goPickup && goDropoff) return 'both'
  if (goPickup) return 'pickup_only'
  if (goDropoff) return 'dropoff_only'
  return 'none'
}

/** DBの time 型（HH:MM:SS）を HH:MM に切り詰める */
function toTimeInput(v: string | null): string {
  return v ? v.slice(0, 5) : ''
}

// 6:00〜21:00 を15分刻みで選択肢にする。
// input[type=time] のネイティブピッカーは端末により現在時刻より前を選びにくいため、
// 端末差の出ないプルダウンで時刻を選ばせる。
const TIME_OPTIONS = Array.from({ length: (21 - 6) * 4 + 1 }, (_, i) => {
  const total = 6 * 60 + i * 15
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})

function TimeSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  ariaLabel: string
}) {
  // 選択肢の刻みに載らない既存データ（例: 15:20）も失わずに表示する
  const options = value && !TIME_OPTIONS.includes(value)
    ? [...TIME_OPTIONS, value].sort()
    : TIME_OPTIONS

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
    >
      <option value="">指定なし</option>
      {options.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  )
}

/** 送迎の行き先・帰り先を選ぶプルダウン */
function PlaceSelect({
  places,
  value,
  onChange,
  ariaLabel,
}: {
  places: TransportPlace[]
  value: string
  onChange: (v: string) => void
  ariaLabel: string
}) {
  if (places.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        住所が登録されていません。施設にお問い合わせください
      </p>
    )
  }
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
    >
      {places.map((p) => (
        <option key={p.value} value={p.value}>{p.label}</option>
      ))}
    </select>
  )
}

/**
 * お子さま1人分の「利用時間」と「送迎」の入力欄。
 *
 * 1日ずつ連絡する画面と、複数日をまとめて申し込む画面の両方で同じものを使う。
 * 入力する項目がズレると「まとめて出すと指定できない項目がある」ことになるため、
 * 1か所にまとめてある。
 */
function ChildEntryFields({
  childName,
  entry,
  places,
  onChange,
}: {
  childName: string
  entry: EntryState
  places: TransportPlace[]
  onChange: (patch: Partial<EntryState>) => void
}) {
  return (
    <>
{/* 利用時間 */}
<div className="bg-white rounded-xl px-4 py-3 mb-3 border border-gray-200">
  <div className="flex items-center gap-1.5 mb-2">
    <Clock className="h-3.5 w-3.5 text-indigo-500" />
    <span className="text-xs font-semibold text-gray-600">利用時間</span>
    <span className="text-[10px] text-gray-400">（任意）</span>
  </div>
  <div className="grid grid-cols-2 gap-2">
    <div>
      <label className="text-[10px] text-gray-400 mb-1 block">開始</label>
      <TimeSelect
        ariaLabel={`${childName}の利用開始時刻`}
        value={entry.serviceStart}
        onChange={(v) => onChange({ serviceStart: v })}
      />
    </div>
    <div>
      <label className="text-[10px] text-gray-400 mb-1 block">終了</label>
      <TimeSelect
        ariaLabel={`${childName}の利用終了時刻`}
        value={entry.serviceEnd}
        onChange={(v) => onChange({ serviceEnd: v })}
      />
    </div>
  </div>
</div>

{/* 送迎。その日の「行き」「帰り」を1回ずつ聞く。
    通しで使う日でも家を出るのは1回・帰るのも1回なので、
    サービスごとには分けない */}
<div className="bg-white rounded-xl px-4 py-3 mb-3 border border-gray-200">
  <div className="flex items-center gap-1.5 mb-2">
    <Car className="h-3.5 w-3.5 text-indigo-500" />
    <span className="text-xs font-semibold text-gray-600">送迎</span>
    <span className="text-[10px] text-gray-400">（必要なものを選ぶ）</span>
  </div>
  <div className="grid grid-cols-2 gap-2">
    <button
      onClick={() => onChange({ goPickup: !entry.goPickup })}
      className={`rounded-lg py-2.5 text-xs font-medium transition-colors ${
        entry.goPickup
          ? 'bg-indigo-500 text-white shadow-sm'
          : 'bg-gray-50 text-gray-600 border border-gray-200'
      }`}
    >
      行き
    </button>
    <button
      onClick={() => onChange({ goDropoff: !entry.goDropoff })}
      className={`rounded-lg py-2.5 text-xs font-medium transition-colors ${
        entry.goDropoff
          ? 'bg-indigo-500 text-white shadow-sm'
          : 'bg-gray-50 text-gray-600 border border-gray-200'
      }`}
    >
      帰り
    </button>
  </div>
  {!entry.goPickup && !entry.goDropoff && (
    <p className="mt-2 text-[10px] text-gray-400">
      どちらも選ばない場合は「送迎なし」として連絡します
    </p>
  )}

  {/* 時刻は聞かない。施設が利用時間から決める。
      代わりに「どこへ」を選んでもらう */}
  {entry.goPickup && (
    <div className="mt-3">
      <label className="text-[10px] text-gray-400 mb-1 block">
        行き：どこへ迎えに行きますか
      </label>
      <PlaceSelect
        ariaLabel={`${childName}の迎えに行く場所`}
        places={places}
        value={entry.pickupPlace}
        onChange={(v) => onChange({ pickupPlace: v })}
      />
    </div>
  )}

  {entry.goDropoff && (
    <div className="mt-3">
      <label className="text-[10px] text-gray-400 mb-1 block">
        帰り：どこへ送り届けますか
      </label>
      <PlaceSelect
        ariaLabel={`${childName}の送り届ける場所`}
        places={places}
        value={entry.dropoffPlace}
        onChange={(v) => onChange({ dropoffPlace: v })}
      />
    </div>
  )}

  {(entry.goPickup || entry.goDropoff) && (
    <p className="mt-2 text-[10px] text-gray-400">
      送迎の時刻は利用時間をもとに施設で決めてご連絡します
    </p>
  )}
</div>
    </>
  )
}

/** 保護者に見せる送迎の言い方。スタッフ側の「迎え・送り」とは言い換えている */
const TRANSPORT_TEXT: Record<TransportType, string> = {
  none: '送迎なし',
  both: '行き帰りの送迎',
  pickup_only: '行きの送迎',
  dropoff_only: '帰りの送迎',
}

/** 「14:00〜17:30／行き帰りの送迎」のように、その日の予定の中身を1行で表す */
function describeScheduleDay(sched: FacilityScheduleDay): string | null {
  const start = sched.service_start_time ?? null
  const end = sched.service_end_time ?? null
  const time = start || end ? `${start ?? '—'}〜${end ?? '—'}` : null
  const transport = sched.transport_type ? TRANSPORT_TEXT[sched.transport_type] : null
  const parts = [time, transport].filter((v): v is string => !!v)
  return parts.length > 0 ? parts.join('／') : null
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']

/**
 * 保護者が選べるのは「利用する」だけ。
 *
 * お休みは、いつ連絡があったかで欠席時対応加算の算定可否が変わり、
 * 事前のキャンセルなのか当日の欠席なのかを保護者に選ばせると手続きが煩雑になる。
 * お休みの連絡は施設で直接受け、スタッフが利用状況ページで
 * 「欠席」か「削除」かを判断して記録する。
 *
 * サービス区分も選ばせないので、カレンダーの丸は「連絡済み」の1種類だけでよい。
 */
const CONTACT_DOT = 'bg-indigo-500'

/** キャンセルの連絡。利用の連絡と見分けられるよう色を分ける */
const CANCEL_DOT = 'bg-red-400'

/** 施設側の予定。自分の連絡（下の丸）と区別できるよう、マス目の右上に四角で出す */
const SCHEDULE_META: Record<FacilityScheduleDay['kind'], { label: string; box: string }> = {
  planned: { label: '利用予定', box: 'bg-blue-500' },
  attended: { label: '利用済み', box: 'bg-gray-400' },
  absent: { label: '欠席', box: 'bg-red-300' },
}

/**
 * 送った連絡が施設でどう扱われているかを伝える文言。
 *
 * お休みの連絡は承認の対象外で approval_status が pending のまま変わらないため、
 * 承認状態ではなく「予定へ反映されたか（applied_at）」で判断する。
 * ここを承認状態だけで見ていると、反映済みでも「確認中」と出続けてしまう。
 */
function statusMessage(c: UsageContact): { text: string; tone: 'ok' | 'ng' | 'wait' } {
  if (c.status === 'absent') {
    return c.applied_at
      ? { text: '施設がキャンセルを受け付けました', tone: 'ok' }
      : { text: 'キャンセルのご連絡を送信しました。施設で確認中です', tone: 'wait' }
  }
  if (c.approval_status === 'approved') {
    // どのサービスとして受けてもらえたかは保護者にも関わる（利用者負担が別枠になる）
    const a = resolveAssignment(c)
    return {
      text: `施設が承認しました（${SERVICE_ASSIGNMENT_LABELS[a.serviceType]}）`,
      tone: 'ok',
    }
  }
  if (c.approval_status === 'rejected') {
    return { text: 'この日は受け入れができませんでした。施設にお問い合わせください', tone: 'ng' }
  }
  return { text: '施設で確認中です', tone: 'wait' }
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** '2026-10-05' -> '10/5（月）' */
function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）`
}

function todayStr(): string {
  const n = new Date()
  return toDateStr(n.getFullYear(), n.getMonth() + 1, n.getDate())
}

type Props = {
  childrenList: UsageContactChild[]
  contacts: UsageContact[]
  /** 施設側ですでに決まっている利用日 */
  schedule: FacilityScheduleDay[]
  /** 施設がお休みの日 */
  closures: FacilityClosure[]
  /** 児童ごとの送迎の行き先・帰り先の選択肢 */
  places: ChildTransportPlaces[]
  /** 児童ごとの給付日数上限 */
  benefits: BenefitLimit[]
  /** 利用連絡の申込締切。null なら締切なし */
  deadline: UsageDeadline | null
  /** お子さまごとの前回の内容。入力欄の初期値に使う */
  defaults: UsageDefault[]
  year: number
  month: number
  loading: boolean
  onMonthChange: (year: number, month: number) => void
  /** 連絡を送る。まとめて申し込むときは日付が複数になる */
  onSubmit: (dates: string[], entries: UsageContactEntry[]) => Promise<UsageSubmitResult>
  /**
   * 「先月と同じ曜日」で選ぶための、前の月に利用した曜日（0=日）。
   * 押されたときだけ呼ぶ（毎月ぶんを先読みしないで済むように）
   */
  onSuggestDows?: () => Promise<number[]>
  /** 「お子さまを追加登録する」のリンク先。null なら出さない */
  addChildHref?: string | null
}

export function UsageContactCalendar({
  childrenList,
  contacts,
  schedule,
  closures,
  places,
  benefits,
  deadline,
  defaults,
  year,
  month,
  loading,
  onMonthChange,
  onSubmit,
  onSuggestDows,
  addChildHref = null,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [entries, setEntries] = useState<Record<string, EntryState>>({})
  const [submitting, setSubmitting] = useState(false)
  // キャンセルの確認中のお子さま。押し間違いで予定が消えないよう2段階にする
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  // まとめて申し込むモード。毎日のように利用する子が1日ずつ送らずに済むようにする
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkDates, setBulkDates] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkEntries, setBulkEntries] = useState<Record<string, EntryState>>({})
  const [bulkResult, setBulkResult] = useState<UsageSubmitResult | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null)

  function buildCells(): (number | null)[] {
    const firstDow = new Date(year, month - 1, 1).getDay()
    const lastDay = new Date(year, month, 0).getDate()
    const cells: (number | null)[] = Array(firstDow).fill(null)
    for (let d = 1; d <= lastDay; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }

  function contactsOn(dateStr: string): UsageContact[] {
    return contacts.filter((c) => c.date === dateStr)
  }

  function placesFor(childId: string): ChildTransportPlaces | undefined {
    return places.find((p) => p.childId === childId)
  }

  /** その日が施設のお休みなら、その予定名を返す */
  function closureOn(dateStr: string): string | null {
    return closures.find((c) => c.date === dateStr)?.title ?? null
  }

  function scheduleOn(dateStr: string): FacilityScheduleDay[] {
    return schedule.filter((s) => s.date === dateStr)
  }

  /** マス目の右上に出す印。同じ日に複数いる場合は「利用予定」を優先して1つだけ出す */
  function scheduleMarkOn(dateStr: string): FacilityScheduleDay['kind'] | null {
    const kinds = scheduleOn(dateStr).map((s) => s.kind)
    if (kinds.includes('planned')) return 'planned'
    if (kinds.includes('attended')) return 'attended'
    if (kinds.includes('absent')) return 'absent'
    return null
  }

  /**
   * その日・そのお子さまの連絡を「新しい日の追加」として扱うかどうか。
   *
   * 締切後は新しい日を増やせないが、すでに施設側に予定がある日
   * （利用予定が入っている・以前に連絡を送った）は、時間や送迎の変更として送れる。
   */
  function canContact(childId: string, dateStr: string): boolean {
    if (!deadline?.closed) return true
    // キャンセル済みの日は含めない。一度キャンセルした日を締切後に入れ直せると
    // 締切の意味が無くなるため（入れ直したいときは施設へ電話）
    if (contactsOn(dateStr).some((c) => c.child_id === childId && c.status === 'attending')) {
      return true
    }
    return scheduleOn(dateStr).some((s) => s.child_id === childId && s.kind === 'planned')
  }

  /**
   * その日・そのお子さまの予定を、保護者がキャンセルできるか。
   *
   * キャンセルできるのは**前日まで**で、もともと予定が入っている日だけ。
   * 当日のお休みは施設が電話で受ける（@/lib/parent-usage-contact）。
   */
  function canCancel(childId: string, dateStr: string): boolean {
    if (dateStr <= today) return false
    const sent = contactsOn(dateStr).find((c) => c.child_id === childId)
    // すでにキャンセルを送っている日は二重に送らせない
    if (sent?.status === 'absent') return false
    if (sent?.status === 'attending') return true
    return scheduleOn(dateStr).some((s) => s.child_id === childId && s.kind === 'planned')
  }

  /** その日に1人でも連絡を送れるお子さまがいるか（送信ボタンの出し分けに使う） */
  function anyContactable(dateStr: string): boolean {
    return childrenList.some((c) => canContact(c.id, dateStr))
  }

  function prevMonth() {
    const p = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
    setSelectedDate(null)
    onMonthChange(p.y, p.m)
  }

  function nextMonth() {
    const n = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
    setSelectedDate(null)
    onMonthChange(n.y, n.m)
  }

  /**
   * まだ連絡していない日の入力欄の初期値。
   *
   * 前に送った内容（いつもの時間・送迎）があればそれを使う。毎回同じ内容を
   * 入れ直すのは、日数が多いほど負担になるため。
   * 一度も送っていないお子さまは、施設に登録されている送迎設定に従う。
   */
  function blankEntry(childId: string): EntryState {
    const own = placesFor(childId)
    const last = defaults.find((d) => d.childId === childId)
    const transport = last?.transportType ?? 'none'
    return {
      attending: false,
      serviceStart: last?.serviceStartTime ?? '',
      serviceEnd: last?.serviceEndTime ?? '',
      goPickup: transport === 'pickup_only' || transport === 'both',
      goDropoff: transport === 'dropoff_only' || transport === 'both',
      pickupPlace: last?.pickupPlace ?? own?.defaultPickup ?? 'home',
      dropoffPlace: last?.dropoffPlace ?? own?.defaultDropoff ?? 'home',
      note: '',
    }
  }

  /**
   * すでに予定が入っている日の入力欄の初期値。
   *
   * 毎週の利用スケジュールから作られた日も、施設が個別に入れた日も、
   * **いまの予定をそのまま初期値**にする。時間を変えたい保護者は、
   * 入っている時間から直すほうが分かりやすく、うっかり別の時間で
   * 送ってしまうこともないため。
   */
  function plannedEntry(childId: string, sched: FacilityScheduleDay): EntryState {
    const own = placesFor(childId)
    const transport = sched.transport_type ?? 'none'
    return {
      attending: false,
      serviceStart: sched.service_start_time ?? '',
      serviceEnd: sched.service_end_time ?? '',
      goPickup: transport === 'pickup_only' || transport === 'both',
      goDropoff: transport === 'dropoff_only' || transport === 'both',
      pickupPlace: sched.pickup_place ?? own?.defaultPickup ?? 'home',
      dropoffPlace: sched.dropoff_place ?? own?.defaultDropoff ?? 'home',
      note: '',
    }
  }

  function openDate(dateStr: string) {
    const dayContacts = contactsOn(dateStr)
    const init: Record<string, EntryState> = {}
    for (const child of childrenList) {
      const existing = dayContacts.find((c) => c.child_id === child.id)
      const transport = existing?.transport_type ?? 'none'
      // 連絡がまだ無い日は、施設の予定が入っていればその内容から始める
      const planned = scheduleOn(dateStr).find(
        (sc) => sc.child_id === child.id && sc.kind === 'planned'
      )
      init[child.id] = existing
        ? {
            attending: existing.status === 'attending',
            serviceStart: toTimeInput(existing.service_start_time),
            serviceEnd: toTimeInput(existing.service_end_time),
            goPickup: transport === 'pickup_only' || transport === 'both',
            goDropoff: transport === 'dropoff_only' || transport === 'both',
            pickupPlace: toPlaceValue(existing.pickup_location_type, existing.pickup_address_id),
            dropoffPlace: toPlaceValue(existing.dropoff_location_type, existing.dropoff_address_id),
            note: existing.note ?? '',
          }
        : planned
          ? plannedEntry(child.id, planned)
          : blankEntry(child.id)
    }
    setEntries(init)
    setSelectedDate(dateStr)
    setToast(null)
    setCancelTarget(null)
  }

  function closeSheet() {
    setSelectedDate(null)
    setToast(null)
    setCancelTarget(null)
  }

  function updateEntry(childId: string, patch: Partial<EntryState>) {
    setEntries((prev) => ({ ...prev, [childId]: { ...prev[childId], ...patch } }))
  }

  /**
   * その日のご利用をキャンセルする。
   *
   * 連絡の送り先は「利用します」と同じで、status だけが違う。
   * 受け取った施設が「欠席として記録する」か「予定から削除する」かを選ぶ。
   */
  function handleCancel(childId: string) {
    if (!selectedDate) return
    const e = entries[childId]
    setSubmitting(true)
    setToast(null)
    onSubmit([selectedDate], [
      {
        childId,
        status: 'absent',
        serviceStartTime: null,
        serviceEndTime: null,
        transportType: 'none',
        pickupPlace: e?.pickupPlace ?? 'home',
        dropoffPlace: e?.dropoffPlace ?? 'home',
        note: e?.note.trim() ?? '',
      },
    ])
      .then((result) => {
        setToast(
          result.error
            ? { ok: false, message: result.error }
            : { ok: true, message: 'キャンセルのご連絡を送信しました' }
        )
        setCancelTarget(null)
      })
      .finally(() => setSubmitting(false))
  }

  // ── まとめて申し込む ──────────────────────────────

  /** その月の日付（1日〜末日）をすべて返す */
  function datesInMonth(): string[] {
    const lastDay = new Date(year, month, 0).getDate()
    return Array.from({ length: lastDay }, (_, i) => toDateStr(year, month, i + 1))
  }

  /** まとめて申し込むときに選べる日か。過ぎた日と施設のお休みは選べない */
  function isSelectable(dateStr: string): boolean {
    return dateStr >= today && !closureOn(dateStr)
  }

  /**
   * 曜日でまとめて選ぶときの対象。
   * すでに予定が入っている日・連絡済みの日は外す（重ねて送らなくて済むように）。
   */
  function isFreshDay(dateStr: string): boolean {
    return (
      isSelectable(dateStr) &&
      contactsOn(dateStr).length === 0 &&
      scheduleOn(dateStr).length === 0
    )
  }

  function toggleBulkDate(dateStr: string) {
    setBulkDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    )
  }

  /**
   * 曜日でまとめて選ぶ・外す。
   * その曜日がすべて選ばれていれば外し、そうでなければ足す（同じボタンで戻せる）。
   */
  function toggleDows(dows: number[]) {
    const targets = datesInMonth().filter(
      (d) => dows.includes(new Date(d + 'T00:00:00').getDay()) && isFreshDay(d)
    )
    if (targets.length === 0) return
    const allSelected = targets.every((d) => bulkDates.includes(d))
    setBulkDates((prev) =>
      allSelected
        ? prev.filter((d) => !targets.includes(d))
        : [...new Set([...prev, ...targets])]
    )
  }

  /** 前の月に利用した曜日をそのまま選ぶ */
  function selectLikeLastMonth() {
    if (!onSuggestDows) return
    setSuggesting(true)
    onSuggestDows()
      .then((dows) => {
        if (dows.length === 0) {
          setToast({ ok: false, message: '前の月のご利用がないため、曜日を選べませんでした' })
          return
        }
        const targets = datesInMonth().filter(
          (d) => dows.includes(new Date(d + 'T00:00:00').getDay()) && isFreshDay(d)
        )
        setBulkDates([...new Set(targets)])
      })
      .finally(() => setSuggesting(false))
  }

  function startBulk() {
    setSelectedDate(null)
    setBulkMode(true)
    setBulkDates([])
    setToast(null)
  }

  function stopBulk() {
    setBulkMode(false)
    setBulkDates([])
    setBulkOpen(false)
    setBulkResult(null)
    setToast(null)
  }

  /** 選んだ日の内容を入力する画面へ */
  function openBulkSheet() {
    const init: Record<string, EntryState> = {}
    for (const child of childrenList) {
      // お子さまが1人だけなら、そのまま申し込む想定で最初から選んでおく
      init[child.id] = { ...blankEntry(child.id), attending: childrenList.length === 1 }
    }
    setBulkEntries(init)
    setBulkResult(null)
    setToast(null)
    setBulkOpen(true)
  }

  function updateBulkEntry(childId: string, patch: Partial<EntryState>) {
    setBulkEntries((prev) => ({ ...prev, [childId]: { ...prev[childId], ...patch } }))
  }

  function handleBulkSubmit() {
    const targets = childrenList.filter((c) => bulkEntries[c.id]?.attending)
    if (targets.length === 0) {
      setToast({ ok: false, message: '利用するお子さまを選択してください' })
      return
    }
    for (const c of targets) {
      const e = bulkEntries[c.id]
      if (e.serviceStart && e.serviceEnd && e.serviceStart >= e.serviceEnd) {
        setToast({ ok: false, message: `${c.name}さんの利用時間は終了を開始より後にしてください` })
        return
      }
    }

    const payload: UsageContactEntry[] = targets.map((c) => {
      const e = bulkEntries[c.id]
      return {
        childId: c.id,
        status: 'attending',
        serviceStartTime: e.serviceStart,
        serviceEndTime: e.serviceEnd,
        transportType: toTransportType(e.goPickup, e.goDropoff),
        pickupPlace: e.pickupPlace,
        dropoffPlace: e.dropoffPlace,
        note: e.note.trim(),
      }
    })

    setSubmitting(true)
    setToast(null)
    onSubmit([...bulkDates].sort(), payload)
      .then((result) => {
        if (result.error && !result.savedDates?.length) {
          setToast({ ok: false, message: result.error })
          return
        }
        setBulkResult(result)
        setBulkDates([])
        setToast({
          ok: true,
          message: `${result.savedDates?.length ?? 0}日分の連絡を送信しました`,
        })
      })
      .finally(() => setSubmitting(false))
  }

  function handleSubmit() {
    if (!selectedDate) return

    const targets = childrenList.filter((c) => entries[c.id]?.attending)
    if (targets.length === 0) {
      setToast({ ok: false, message: '利用するお子さまを選択してください' })
      return
    }

    // 締切後の月に新しい日を足そうとしていないか（APIでも同じ判定をする）
    const locked = targets.find((c) => !canContact(c.id, selectedDate))
    if (locked) {
      setToast({
        ok: false,
        message: `${locked.name}さんの新しいご利用日のお申し込みは締め切りました`,
      })
      return
    }

    // 利用時間の前後関係を送信前に確認する
    for (const c of targets) {
      const e = entries[c.id]
      if (e.serviceStart && e.serviceEnd && e.serviceStart >= e.serviceEnd) {
        setToast({ ok: false, message: `${c.name}さんの利用時間は終了を開始より後にしてください` })
        return
      }
    }

    const payload: UsageContactEntry[] = targets.map((c) => {
      const e = entries[c.id]
      return {
        childId: c.id,
        status: 'attending',
        serviceStartTime: e.serviceStart,
        serviceEndTime: e.serviceEnd,
        transportType: toTransportType(e.goPickup, e.goDropoff),
        pickupPlace: e.pickupPlace,
        dropoffPlace: e.dropoffPlace,
        note: e.note.trim(),
      }
    })

    setSubmitting(true)
    setToast(null)
    onSubmit([selectedDate], payload)
      .then((result) => {
        setToast(
          result.error
            ? { ok: false, message: result.error }
            : { ok: true, message: '連絡を送信しました' }
        )
      })
      .finally(() => setSubmitting(false))
  }

  const cells = buildCells()
  const today = todayStr()
  // 過ぎた日は連絡できないが、利用済みの実績を見るために開けるようにしてある
  const readOnly = selectedDate !== null && selectedDate < today
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null
  const selectedHolidayName = selectedDate ? getJapaneseHolidayName(selectedDate) : null

  return (
    <div>
      {/* 給付日数の消化。利用済みの日数は施設側の予定（schedule）から数える */}
      {benefits.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-4 py-3 mb-3 space-y-3">
          <p className="text-xs font-semibold text-gray-600">今月の利用状況</p>
          {childrenList.map((child) => {
            const limit = benefits.find((b) => b.child_id === child.id)
            if (!limit) return null
            const used = new Set(
              schedule.filter((s) => s.child_id === child.id && s.kind === 'attended').map((s) => s.date)
            ).size
            const remaining = limit.max_days_per_month - used
            const percent = Math.min(100, Math.round((used / limit.max_days_per_month) * 100))
            return (
              <div key={child.id}>
                {childrenList.length > 1 && (
                  <p className="text-xs text-gray-500 mb-1">{child.name}</p>
                )}
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-indigo-600">{used}</span>
                  <span className="text-xs text-gray-400">/ {limit.max_days_per_month}日</span>
                  <span
                    className={`ml-auto text-xs font-semibold ${
                      remaining <= 3 ? 'text-orange-500' : 'text-green-600'
                    }`}
                  >
                    残り {remaining}日
                  </span>
                </div>
                <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      remaining <= 0 ? 'bg-red-400' : remaining <= 3 ? 'bg-orange-400' : 'bg-indigo-400'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            )
          })}
          <p className="text-[10px] text-gray-400">
            前日までにご利用いただいた日を数えています。当日分は翌日に反映されます
          </p>
        </div>
      )}

      {/* 月ナビゲーション */}
      <div className="bg-white border border-gray-100 rounded-2xl flex items-center justify-between px-4 py-2.5 shadow-sm">
        <button
          onClick={prevMonth}
          aria-label="前の月"
          className="p-2 text-gray-400 hover:text-gray-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-gray-800 text-sm">{year}年{month}月</span>
        <button
          onClick={nextMonth}
          aria-label="次の月"
          className="p-2 text-gray-400 hover:text-gray-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* 申込締切。締め切った月は「新しい日」を増やせないことを開く前に伝える */}
      {deadline?.enabled && (
        deadline.closed ? (
          <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3">
            <p className="text-xs font-semibold text-amber-800">
              {month}月分の新しいご利用日のお申し込みは締め切りました
            </p>
            <p className="mt-1 text-xs text-amber-700">
              締切は{formatMonthDay(deadline.deadlineDate)}でした。
              すでにご予定が入っている日の<strong>利用時間・送迎の変更</strong>は、このあとも送れます。
              新しい日の追加をご希望の場合は、施設へお電話ください。
            </p>
          </div>
        ) : (
          <p className="mt-3 text-center text-xs text-gray-400">
            {month}月分の新しいご利用日のお申し込みは{formatMonthDay(deadline.deadlineDate)}までです
          </p>
        )
      )}

      {/* まとめて申し込む。毎日のように利用する子が1日ずつ送らずに済むようにする。
          締め切った月は新しい日を足せないので出さない */}
      {!deadline?.closed && childrenList.length > 0 && (
        bulkMode ? (
          <div className="mt-3 rounded-2xl bg-indigo-50 border border-indigo-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-indigo-900">まとめて申し込む</p>
              <button
                onClick={stopBulk}
                className="text-xs text-indigo-700 underline"
              >
                やめる
              </button>
            </div>
            <p className="mt-1 text-[11px] text-indigo-700">
              利用する日をタップして選びます。曜日のボタンでまとめて選べます
            </p>

            {/* 曜日でまとめて選ぶ。もう一度押すとその曜日を外せる */}
            <div className="mt-2 flex gap-1">
              {DOW.map((d, i) => (
                <button
                  key={d}
                  onClick={() => toggleDows([i])}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium border transition-colors ${
                    i === 0 ? 'text-red-500 border-red-100 bg-white'
                    : i === 6 ? 'text-blue-500 border-blue-100 bg-white'
                    : 'text-gray-600 border-gray-200 bg-white'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => toggleDows([1, 2, 3, 4, 5])}
                className="rounded-lg bg-white border border-indigo-200 px-2.5 py-1.5 text-xs font-medium text-indigo-700"
              >
                平日（月〜金）
              </button>
              {onSuggestDows && (
                <button
                  onClick={selectLikeLastMonth}
                  disabled={suggesting}
                  className="rounded-lg bg-white border border-indigo-200 px-2.5 py-1.5 text-xs font-medium text-indigo-700 disabled:opacity-50"
                >
                  {suggesting ? '読み込み中...' : '先月と同じ曜日'}
                </button>
              )}
              {bulkDates.length > 0 && (
                <button
                  onClick={() => setBulkDates([])}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 underline"
                >
                  選択を解除
                </button>
              )}
            </div>
            <p className="mt-2 text-[10px] text-indigo-600">
              曜日で選ぶときは、施設のお休みと、すでに予定・連絡がある日を自動で外します
            </p>
          </div>
        ) : (
          <button
            onClick={startBulk}
            className="mt-3 w-full rounded-2xl bg-white border border-indigo-200 py-3 text-sm font-semibold text-indigo-700 shadow-sm"
          >
            まとめて申し込む（複数の日をいちどに）
          </button>
        )
      )}

      {/* カレンダー */}
      <div className="bg-white mt-3 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DOW.map((d, i) => (
            <div
              key={d}
              className={`py-2 text-center text-xs font-medium ${
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          </div>
        ) : (
          <div className="grid grid-cols-7 p-1">
            {cells.map((day, idx) => {
              if (day === null) return <div key={idx} className="h-12" />
              const dateStr = toDateStr(year, month, day)
              const dayContacts = contactsOn(dateStr)
              const isToday = dateStr === today
              const isPast = dateStr < today
              const isSelected = dateStr === selectedDate
              const dow = idx % 7
              const holidayName = getJapaneseHolidayName(dateStr)
              const scheduleMark = scheduleMarkOn(dateStr)
              const closure = closureOn(dateStr)
              // まとめて申し込むモードでは、タップで選ぶ／外す
              const picked = bulkMode && bulkDates.includes(dateStr)
              const blocked = bulkMode && !isSelectable(dateStr)
              return (
                <button
                  key={idx}
                  onClick={() => (bulkMode ? toggleBulkDate(dateStr) : openDate(dateStr))}
                  disabled={blocked}
                  title={closure ?? holidayName ?? undefined}
                  className={`relative flex flex-col items-center justify-start pt-1.5 h-12 rounded-xl mx-0.5 mb-0.5 transition-colors ${
                    picked ? 'bg-indigo-600' :
                    blocked ? 'opacity-40' :
                    isSelected ? 'bg-indigo-100' :
                    closure ? 'bg-gray-100' :
                    isToday ? 'bg-indigo-50' :
                    isPast ? '' :
                    holidayName ? 'bg-red-50/60 hover:bg-gray-50 active:bg-gray-100' : 'hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  <span className={`text-sm font-medium leading-none ${
                    picked ? 'text-white' :
                    isSelected ? 'text-indigo-700' :
                    closure ? 'text-gray-400 line-through' :
                    isToday ? 'text-indigo-600' :
                    isPast ? 'text-gray-300' :
                    dow === 0 || holidayName ? 'text-red-500' :
                    dow === 6 ? 'text-blue-500' :
                    'text-gray-700'
                  }`}>
                    {isToday ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs">{day}</span>
                    ) : day}
                  </span>
                  {/* 施設がお休みの日は連絡を送れないことがひと目で分かるようにする */}
                  {closure && (
                    <span className="mt-0.5 text-[9px] leading-none font-medium text-gray-400">休</span>
                  )}
                  <div className="flex gap-0.5 mt-1">
                    {dayContacts.slice(0, 3).map((c, i) => (
                      <span
                        key={i}
                        aria-label={c.status === 'absent' ? 'キャンセル連絡済み' : '連絡済み'}
                        className={`w-1.5 h-1.5 rounded-full ${
                          c.status === 'absent' ? CANCEL_DOT : CONTACT_DOT
                        } ${isPast ? 'opacity-40' : ''}`}
                      />
                    ))}
                  </div>
                  {/* 施設側の予定。自分の連絡（下の丸）と見分けられるよう右上に四角で出す */}
                  {scheduleMark && (
                    <span
                      aria-label={SCHEDULE_META[scheduleMark].label}
                      className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-[2px] ${SCHEDULE_META[scheduleMark].box} ${isPast ? 'opacity-40' : ''}`}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* 凡例。自分が送った連絡（下の丸）と、施設の予定（右上の四角）を分けて示す */}
        <div className="border-t border-gray-100 px-3 py-3 space-y-1.5">
          <div className="flex gap-3 justify-center flex-wrap">
            <span className="text-xs text-gray-400">自分の連絡</span>
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${CONTACT_DOT}`} />
              <span className="text-xs text-gray-400">連絡済み</span>
            </div>
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${CANCEL_DOT}`} />
              <span className="text-xs text-gray-400">キャンセル連絡済み</span>
            </div>
          </div>
          <div className="flex gap-3 justify-center flex-wrap">
            <span className="text-xs text-gray-400">施設の予定</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] leading-none text-gray-400">休</span>
              <span className="text-xs text-gray-400">休業日</span>
            </div>
            {(Object.keys(SCHEDULE_META) as FacilityScheduleDay['kind'][]).map((k) => (
              <div key={k} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-[2px] ${SCHEDULE_META[k].box}`} />
                <span className="text-xs text-gray-400">{SCHEDULE_META[k].label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-3">日付をタップして利用連絡</p>
      <p className="text-center text-xs text-gray-400 mt-1">
        キャンセルは前日までこの画面から。当日のお休みは施設へお電話ください
      </p>

      {addChildHref && (
        <div className="text-center mt-4">
          <a href={addChildHref} className="text-xs text-indigo-600 underline">
            お子さまを追加登録する
          </a>
        </div>
      )}

      {/* 選んだ日数と、内容の入力へ進むボタン。画面の下に固定して指が届く位置に置く */}
      {bulkMode && bulkDates.length > 0 && !bulkOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <p className="text-sm font-bold text-gray-900">
              {bulkDates.length}日
              <span className="ml-1 text-xs font-normal text-gray-500">を選択中</span>
            </p>
            <button
              onClick={openBulkSheet}
              className="ml-auto rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md"
            >
              内容を入力する
            </button>
          </div>
        </div>
      )}

      {/* まとめて申し込む内容の入力シート。利用時間・送迎は1回だけ入力する */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBulkOpen(false)} />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto mx-auto w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100">
              <p className="font-bold text-gray-900">
                まとめて申し込む
                {!bulkResult && (
                  <span className="ml-1.5 text-sm font-normal text-gray-400">
                    {bulkDates.length}日分
                  </span>
                )}
              </p>
              <button
                onClick={() => setBulkOpen(false)}
                aria-label="閉じる"
                className="p-1.5 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4 pt-3 pb-8 space-y-3">
              {toast && (
                <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                  toast.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {toast.message}
                </div>
              )}

              {bulkResult ? (
                <>
                  {/* 送れた日・送れなかった日をはっきり見せる。
                      まとめて出したときに「どれが通ったのか」が分からないと確かめようがない */}
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold text-gray-600">送信した日</p>
                    <p className="mt-1 text-sm text-gray-800">
                      {(bulkResult.savedDates ?? []).map(shortDate).join('、') || 'なし'}
                    </p>
                  </div>
                  {(bulkResult.skipped ?? []).length > 0 && (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                      <p className="text-xs font-semibold text-amber-800">送れなかった日</p>
                      <ul className="mt-1 space-y-0.5">
                        {(bulkResult.skipped ?? []).map((sk) => (
                          <li key={sk.date} className="text-xs text-amber-700">
                            {shortDate(sk.date)}：{sk.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    onClick={stopBulk}
                    className="w-full rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white shadow-md"
                  >
                    閉じる
                  </button>
                </>
              ) : (
                <>
                  {/* 選んだ日。多いので折り返して並べる */}
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold text-gray-600">選んだ日</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {[...bulkDates].sort().map((d) => (
                        <button
                          key={d}
                          onClick={() => toggleBulkDate(d)}
                          className="rounded-lg bg-white border border-gray-200 px-2 py-1 text-[11px] text-gray-600"
                        >
                          {shortDate(d)} ×
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[10px] text-gray-400">
                      タップすると、その日を外せます
                    </p>
                  </div>

                  {childrenList.map((child) => {
                    const entry = bulkEntries[child.id]
                    if (!entry) return null
                    const childPlaces = placesFor(child.id)?.places ?? []
                    return (
                      <div key={child.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                        <p className="font-semibold text-gray-900 mb-3">{child.name}</p>
                        <button
                          onClick={() => updateBulkEntry(child.id, { attending: !entry.attending })}
                          className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors mb-3 ${
                            entry.attending
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white text-gray-600 border border-gray-200'
                          }`}
                        >
                          {entry.attending ? '選んだ日に利用します' : '選んだ日に利用する'}
                        </button>

                        {entry.attending && (
                          <>
                            <ChildEntryFields
                              childName={child.name}
                              entry={entry}
                              places={childPlaces}
                              onChange={(patch) => updateBulkEntry(child.id, patch)}
                            />
                            <AutoTextarea
                              value={entry.note}
                              onChange={(e) => updateBulkEntry(child.id, { note: e.target.value })}
                              placeholder="備考（任意・選んだ日すべてに付きます）"
                              minRows={2}
                              maxRows={10}
                              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-700 placeholder-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                          </>
                        )}
                      </div>
                    )
                  })}

                  <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3">
                    <p className="text-xs text-blue-800">
                      <strong>入力した内容は、選んだ日すべてに同じように届きます</strong>
                    </p>
                    <p className="mt-1 text-xs text-blue-700">
                      日によって時間や送迎が違う場合は、送信したあとにその日をタップして変更できます。
                    </p>
                  </div>

                  <button
                    onClick={handleBulkSubmit}
                    disabled={submitting || bulkDates.length === 0}
                    className="w-full rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                  >
                    {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                    {bulkDates.length}日分を送信する
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 日付詳細シート */}
      {selectedDate && selectedDateObj && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={closeSheet} />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto mx-auto w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100">
              <p className={`font-bold ${selectedHolidayName || selectedDateObj.getDay() === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                {selectedDateObj.getMonth() + 1}月{selectedDateObj.getDate()}日
                <span className="ml-1 font-normal text-gray-400 text-sm">（{DOW[selectedDateObj.getDay()]}）</span>
                {selectedHolidayName && (
                  <span className="ml-2 text-xs font-medium text-red-500">{selectedHolidayName}</span>
                )}
              </p>
              <button onClick={closeSheet} aria-label="閉じる" className="p-1.5 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4 pt-3 pb-8 space-y-3">
              {toast && (
                <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                  toast.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {toast.message}
                </div>
              )}

              {readOnly ? (
                <p className="text-xs text-gray-400 text-center">
                  過ぎた日です。内容の確認のみできます
                </p>
              ) : contactsOn(selectedDate).length > 0 && !toast && !closureOn(selectedDate) ? (
                <p className="text-xs text-gray-400 text-center">
                  送信済みの連絡です。変更して再送信できます
                </p>
              ) : null}

              {/* 施設がお休みの日は入力欄そのものを出さない。
                  選ばせてから断るより、開いた時点で伝えるほうが分かりやすい */}
              {closureOn(selectedDate) ? (
                <div className="rounded-2xl bg-gray-100 border border-gray-200 px-4 py-5 text-center">
                  <p className="text-sm font-bold text-gray-700">この日は施設がお休みです</p>
                  <p className="mt-1 text-sm text-gray-600">{closureOn(selectedDate)}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    ご利用いただけないため、利用連絡は送れません
                  </p>
                </div>
              ) : (
                <>
              {childrenList.map((child) => {
                const entry = entries[child.id]
                if (!entry) return null
                const sched = scheduleOn(selectedDate).find((s) => s.child_id === child.id)
                const sent = contactsOn(selectedDate).find((c) => c.child_id === child.id)
                const childPlaces = placesFor(child.id)?.places ?? []
                // 締切後でも、すでに予定がある日は時間・送迎の変更として送れる
                const contactable = canContact(child.id, selectedDate)
                return (
                  <div key={child.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p className="font-semibold text-gray-900 mb-3">{child.name}</p>

                    {/* 施設側の状況。すでに予定がある日に重ねて連絡しなくて済むようにする。
                        まだ反映されていない連絡を送っている日は「連絡は不要」と言わない
                        （お休みを伝えた直後にそう出ると、伝わっていないように見えるため） */}
                    {sched && (
                      <div className="mb-3 flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                        <span className={`mt-1 w-2 h-2 shrink-0 rounded-[2px] ${SCHEDULE_META[sched.kind].box}`} />
                        <p className="text-xs text-blue-800">
                          {sched.kind === 'planned' && (
                            <>
                              {sent && !sent.applied_at
                                ? '施設の予定では、この日は利用することになっています'
                                : 'この日はすでに利用予定が入っています。変更がなければ連絡は不要です'}
                              {/* いまの予定の中身。時間を変えるときの「変更前」になる */}
                              {describeScheduleDay(sched) && (
                                <>
                                  <br />
                                  いまの予定：{describeScheduleDay(sched)}
                                </>
                              )}
                            </>
                          )}
                          {sched.kind === 'attended' && (
                            <>
                              この日はご利用済みです
                              {(sched.check_in_time || sched.check_out_time) && (
                                <>
                                  {'　'}
                                  {toTimeInput(sched.check_in_time ?? null) || '—'}
                                  〜
                                  {toTimeInput(sched.check_out_time ?? null) || '—'}
                                </>
                              )}
                              {sched.unit_name && `（${sched.unit_name}）`}
                            </>
                          )}
                          {sched.kind === 'absent' && 'この日はお休みとして登録されています'}
                        </p>
                      </div>
                    )}

                    {/* 送信済みの連絡が、施設でどう扱われているか */}
                    {sent && (() => {
                      const { text, tone } = statusMessage(sent)
                      return (
                        <div className="mb-3">
                          <p
                            className={`text-xs ${
                              tone === 'ok' ? 'text-emerald-600'
                              : tone === 'ng' ? 'text-red-600'
                              : 'text-gray-500'
                            }`}
                          >
                            {text}
                          </p>
                          {/* どのサービスとして何時から何時までになったか。
                              日中一時は利用者負担が放デイと別枠なので保護者にも関わる */}
                          {sent.status === 'attending' && sent.applied_at && (
                            <p className="mt-0.5 text-[11px] text-gray-500">
                              {describeAssignment(resolveAssignment(sent))}
                            </p>
                          )}
                        </div>
                      )
                    })()}

                    {/* 締め切った月に新しい日を足すことはできない。
                        選ばせてから断るより、開いた時点で伝えるほうが分かりやすい */}
                    {!readOnly && !contactable && (
                      <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                        <p className="text-xs text-amber-800">
                          この日の新しいお申し込みは締め切りました
                          {deadline && `（${formatMonthDay(deadline.deadlineDate)}まで）`}
                        </p>
                        <p className="mt-1 text-xs text-amber-700">
                          ご利用をご希望の場合は、施設へお電話ください
                        </p>
                      </div>
                    )}

                    {/* 締切後に変更だけ送れる日は、何ができるのかを先に伝えておく */}
                    {!readOnly && contactable && deadline?.closed && (
                      <p className="mb-3 text-xs text-gray-500">
                        締切後のため日にちの追加はできませんが、利用時間・送迎の変更は送れます
                      </p>
                    )}

                    {/* 選ぶのは「利用するかどうか」だけ。
                        放デイか日中一時かは施設が承認するときに割り振る */}
                    {!readOnly && contactable && (
                    <button
                      onClick={() => updateEntry(child.id, { attending: !entry.attending })}
                      className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors mb-3 ${
                        entry.attending
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white text-gray-600 border border-gray-200'
                      }`}
                    >
                      {entry.attending
                        ? (sched?.kind === 'planned' ? 'この内容に変更します' : 'この日は利用します')
                        : sched?.kind === 'planned'
                          ? '利用時間・送迎を変更する'
                          : '利用する日として連絡する'}
                    </button>
                    )}

                    {!readOnly && contactable && entry.attending && sched?.kind === 'planned' && (
                      <p className="mb-2 text-[11px] text-gray-500">
                        いま入っている予定を初期値にしています。変更したいところだけ直して送信してください
                      </p>
                    )}

                    {!readOnly && contactable && entry.attending && (
                      <ChildEntryFields
                        childName={child.name}
                        entry={entry}
                        places={childPlaces}
                        onChange={(patch) => updateEntry(child.id, patch)}
                      />
                    )}

                    {!readOnly && contactable && (
                    <AutoTextarea
                      value={entry.note}
                      onChange={(e) => updateEntry(child.id, { note: e.target.value })}
                      placeholder="備考（任意）"
                      minRows={2}
                      maxRows={10}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-700 placeholder-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    )}

                    {/* 過去日は備考も読むだけ */}
                    {readOnly && sent?.note && (
                      <p className="text-xs text-gray-500 whitespace-pre-wrap">{sent.note}</p>
                    )}

                    {/* この日のキャンセル。前日まで・予定が入っている日だけ出す。
                        押し間違いで予定が消えないよう、確認を挟む */}
                    {canCancel(child.id, selectedDate) && (
                      <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                        {cancelTarget === child.id ? (
                          <>
                            <p className="text-xs font-semibold text-red-800">
                              {child.name}さんの{selectedDateObj.getMonth() + 1}月
                              {selectedDateObj.getDate()}日のご利用をキャンセルします。よろしいですか？
                            </p>
                            <p className="mt-1 text-[11px] text-red-700">
                              施設で確認のうえ、この日の予定を取り消します
                            </p>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleCancel(child.id)}
                                disabled={submitting}
                                className="rounded-lg bg-red-600 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                              >
                                キャンセルする
                              </button>
                              <button
                                onClick={() => setCancelTarget(null)}
                                disabled={submitting}
                                className="rounded-lg border border-gray-200 bg-white py-2.5 text-xs font-medium text-gray-600 disabled:opacity-50"
                              >
                                やめる
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            onClick={() => setCancelTarget(child.id)}
                            className="w-full text-xs font-medium text-red-600 underline"
                          >
                            この日のご利用をキャンセルする
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {!readOnly && anyContactable(selectedDate) && (
              <>
              {/* 保護者に区分を選ばせない代わりに、誰が決めるのかは伝えておく */}
              <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3">
                <p className="text-xs text-blue-800">
                  <strong>サービスの種類について</strong>
                </p>
                <p className="mt-1 text-xs text-blue-700">
                  放課後等デイサービスと日中一時支援のどちらでお預かりするかは、
                  受給者証の内容をもとに施設で決めてご連絡します。
                  ご希望の時間と送迎だけお知らせください。
                </p>
              </div>

              {/* 当日のお休みはこの画面から送れない。どうすればよいかを必ず示す */}
              <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3">
                <p className="text-xs text-amber-800">
                  <strong>お休みのご連絡について</strong>
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  キャンセルは<strong>前日まで</strong>、お子さまごとの
                  「この日のご利用をキャンセルする」からお送りいただけます。
                  当日のお休みはこの画面からは送れませんので、
                  お手数ですが施設へ直接お電話でご連絡ください。
                </p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
              >
                {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                連絡を送信する
              </button>
              </>
              )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
