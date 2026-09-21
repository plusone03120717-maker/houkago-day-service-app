'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { formatDate, getTodayJST } from '@/lib/utils'
import {
  Car,
  Clock,
  CheckCircle2,
  XCircle,
  BellRing,
  CalendarDays,
  ThumbsUp,
  ThumbsDown,
  CalendarCheck,
  CalendarRange,
  AlertTriangle,
} from 'lucide-react'
import {
  resolveAssignment,
  defaultAssignment,
  validateAssignment,
  describeAssignment,
  SERVICE_ASSIGNMENT_TYPES,
  SERVICE_ASSIGNMENT_LABELS,
  SERVICE_ASSIGNMENT_BADGE,
  type ServiceAssignment,
  type ServiceAssignmentType,
} from '@/lib/parent-contact-service'
import { placeLabel, type ChildTransportPlaces, type LocationType, toPlaceValue } from '@/lib/transport-place'
import type { AbsentHandling } from '@/lib/parent-contact-schedule'

type TransportType = 'none' | 'pickup_only' | 'dropoff_only' | 'both'
type ApprovalStatus = 'pending' | 'approved' | 'rejected'

type Contact = {
  id: string
  child_id: string
  date: string
  status: 'attending' | 'absent'
  /** 施設が承認時に割り振った区分。保護者は選ばない */
  service_type: ServiceAssignmentType
  /** 保護者が希望した利用時間 */
  service_start_time: string | null
  service_end_time: string | null
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
  reported_at: string
  is_new: boolean
  approval_status: ApprovalStatus
  /** 予定（利用予定・出欠記録）へ反映した時刻。null＝未反映 */
  applied_at: string | null
  /** キャンセル連絡をどう処理したか。null＝未処理 */
  absent_handling: AbsentHandling | null
  children: { id: string; name: string } | null
}

/**
 * キャンセル連絡の処理方法。施設が1件ずつ選ぶ。
 *
 * どちらを選ぶかで国保連請求が変わるので、まとめ処理では決め打ちにしない。
 * 前日・当日の急なお休みは欠席（欠席時対応加算の対象になり得る）、
 * ずっと前からのキャンセルは予定から削除するのが原則。
 */
const HANDLING_LABELS: Record<AbsentHandling, string> = {
  absent: '欠席として記録',
  delete: '予定から削除',
}

const HANDLING_DONE_LABELS: Record<AbsentHandling, string> = {
  absent: '欠席として反映済み',
  delete: '予定から削除済み',
}

// 保護者の画面では「行き」「帰り」で聞いている。
// スタッフ側は送迎管理・出席管理と同じ「迎え」「送り」で表示する。
// 送迎の時刻は保護者に聞いていない（承認した利用時間から決まる）ので、
// ここに出るのは行き先・帰り先だけ。
const TRANSPORT_LABELS: Record<TransportType, string> = {
  none: '送迎なし',
  both: '送り迎え',
  pickup_only: '迎えのみ',
  dropoff_only: '送りのみ',
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']

/** DBの time 型（HH:MM:SS）を HH:MM で表示する */
function fmtTime(v: string | null) {
  return v ? v.slice(0, 5) : null
}

function hasTransport(c: Contact) {
  return c.status === 'attending' && c.transport_type !== 'none'
}

/** 承認の対象は「利用」の連絡のみ。お休みは確認済み操作だけ行う */
function needsApproval(c: Contact) {
  return c.status === 'attending'
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return formatDate(d, 'yyyy-MM-dd')
}

/** "2026-08-05" → "8月5日（火）" */
function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）`
}

/**
 * その日のキャンセルをどちらで処理するのがよさそうか。
 *
 * 前日・当日の急なお休みは欠席時対応加算の対象になり得るので「欠席として記録」、
 * それより前のキャンセルは予定そのものを外すのが正しい扱いなので「予定から削除」。
 * あくまで目安で、決めるのはスタッフ。
 */
function recommendedHandling(dateStr: string, today: string): AbsentHandling {
  return dateStr <= addDays(today, 1) ? 'absent' : 'delete'
}

/**
 * 同じ内容として1枚にまとめてよい連絡かを表す鍵。
 *
 * 保護者が「まとめて申し込む」で送ると、同じ内容の連絡が日数ぶん届く。
 * 日付だけが違う連絡を1枚にまとめて、区分の割り振りと承認を1回で済ませる。
 * 内容が1つでも違えば別の鍵になるので、違う条件の日が混ざることはない。
 */
function contentKey(c: Contact): string {
  return [
    c.child_id,
    c.status,
    c.service_start_time ?? '',
    c.service_end_time ?? '',
    c.transport_type,
    c.pickup_location_type,
    c.pickup_address_id ?? '',
    c.dropoff_location_type,
    c.dropoff_address_id ?? '',
    c.note ?? '',
  ].join('|')
}

/** 今日/明日/過去日の相対ラベル（該当しない日は null） */
function relativeLabel(dateStr: string, today: string): string | null {
  if (dateStr === today) return '今日'
  if (dateStr === addDays(today, 1)) return '明日'
  if (dateStr < today) return '過去日'
  return null
}

type Props = {
  /** 全日付の未確認連絡（日付昇順） */
  unconfirmedContacts: Contact[]
  /** その日の出席記録にすでに入っている予定。連絡IDごとの初期値になる */
  initialAssignments: Record<string, ServiceAssignment>
  /** 児童ごとの送迎の場所の選択肢。行き先・帰り先を名前で出すために使う */
  transportPlaces: ChildTransportPlaces[]
}

/** 割り振りの時刻欄。空欄は「指定なし」として扱う */
function TimeRange({
  label,
  start,
  end,
  onStart,
  onEnd,
}: {
  label: string
  start: string | null
  end: string | null
  onStart: (v: string) => void
  onEnd: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <span className="w-14 shrink-0 text-[11px] font-medium text-gray-600">{label}</span>
      <input
        type="time"
        aria-label={`${label}の開始時刻`}
        value={start ?? ''}
        onChange={(e) => onStart(e.target.value)}
        className="rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-700"
      />
      <span className="text-[11px] text-gray-400">〜</span>
      <input
        type="time"
        aria-label={`${label}の終了時刻`}
        value={end ?? ''}
        onChange={(e) => onEnd(e.target.value)}
        className="rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-700"
      />
    </div>
  )
}

/**
 * サービス区分の割り振り欄。
 *
 * 保護者は「利用したい時間」と「送迎」しか送ってこない。放デイか日中一時か、
 * 同じ日に両方使うのかは受給者証と支給量の残りを見て施設が決めるので、
 * 承認する前にここで割り振る（@/lib/parent-contact-service）。
 */
function AssignmentEditor({
  contact,
  value,
  onChange,
}: {
  contact: Contact
  value: ServiceAssignment
  onChange: (next: ServiceAssignment) => void
}) {
  const showBasic = value.serviceType !== 'daytime_support'
  const showDaytime = value.serviceType !== 'regular'
  const invalid = validateAssignment(value)

  function setTime(key: keyof Omit<ServiceAssignment, 'serviceType'>, v: string) {
    const next: ServiceAssignment = { ...value, [key]: v || null }
    // 両方使う日の切り替え時刻は、日中一時の終わり＝放デイの始まりになるのが通常。
    // 片方だけ入れたときに、もう片方が空ならそろえる（重なりのまま承認するのを防ぐ）
    if (value.serviceType === 'both') {
      if (key === 'daytimeEndTime' && !value.serviceStartTime) next.serviceStartTime = v || null
      if (key === 'serviceStartTime' && !value.daytimeEndTime) next.daytimeEndTime = v || null
    }
    onChange(next)
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold text-gray-600">サービス区分を決める</p>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {SERVICE_ASSIGNMENT_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => onChange(defaultAssignment(contact, t))}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              value.serviceType === t
                ? 'bg-indigo-600 text-white'
                : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {SERVICE_ASSIGNMENT_LABELS[t]}
          </button>
        ))}
      </div>

      {/* 通しで使う日は日中一時が先に来ることが多いので、その順で並べる */}
      {showDaytime && (
        <TimeRange
          label="日中一時"
          start={value.daytimeStartTime}
          end={value.daytimeEndTime}
          onStart={(v) => setTime('daytimeStartTime', v)}
          onEnd={(v) => setTime('daytimeEndTime', v)}
        />
      )}
      {showBasic && (
        <TimeRange
          label="放デイ"
          start={value.serviceStartTime}
          end={value.serviceEndTime}
          onStart={(v) => setTime('serviceStartTime', v)}
          onEnd={(v) => setTime('serviceEndTime', v)}
        />
      )}

      {invalid ? (
        <p className="mt-1.5 text-[11px] text-red-600">{invalid}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-gray-400">
          送迎の時刻はこの利用時間から決まります（迎え＝いちばん早い開始、送り＝いちばん遅い終了）
        </p>
      )}
    </div>
  )
}

/** 連絡1件分のカード */
function ContactCard({
  contact: c,
  approval,
  applied,
  handling,
  today,
  reviewing,
  assignment,
  places,
  onAssignmentChange,
  onReviewed,
  onApproval,
}: {
  contact: Contact
  approval: ApprovalStatus
  /** 予定へ反映済みか */
  applied: boolean
  /** キャンセル連絡をどう処理したか。null＝未処理 */
  handling: AbsentHandling | null
  today: string
  reviewing: boolean
  /** 施設が決めるサービス区分と時間 */
  assignment: ServiceAssignment
  /** 送迎の場所を名前で出すための選択肢 */
  places: ChildTransportPlaces | undefined
  onAssignmentChange: (next: ServiceAssignment) => void
  onReviewed: (id: string, handling: AbsentHandling) => void
  onApproval: (id: string, next: ApprovalStatus) => void
}) {
  const editable = needsApproval(c) && approval === 'pending'
  const assignmentError = validateAssignment(assignment)
  return (
    <div className="rounded-xl px-4 py-3 shadow-sm border bg-amber-50 border-amber-200 flex items-start gap-3">
      <div className="mt-0.5">
        {c.status === 'attending' ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <XCircle className="h-5 w-5 text-red-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 text-sm">
            {c.children?.name ?? '不明'}
          </span>
          {/* 区分は施設が決めたもの。まだ決めていない連絡は「区分未定」と出す */}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              c.status !== 'attending'
                ? 'bg-red-100 text-red-600'
                : editable
                  ? 'bg-gray-100 text-gray-500'
                  : SERVICE_ASSIGNMENT_BADGE[assignment.serviceType]
            }`}
          >
            {c.status !== 'attending'
              ? 'キャンセル'
              : editable
                ? '区分未定'
                : SERVICE_ASSIGNMENT_LABELS[assignment.serviceType]}
          </span>
          {hasTransport(c) && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
              <Car className="h-3 w-3" />
              {TRANSPORT_LABELS[c.transport_type]}
            </span>
          )}
          {/* 承認状態（利用の連絡のみ） */}
          {needsApproval(c) && approval !== 'pending' && (
            <span
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold ${
                approval === 'approved'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-500 text-white'
              }`}
            >
              {approval === 'approved' ? (
                <><ThumbsUp className="h-3 w-3" />承認済み</>
              ) : (
                <><ThumbsDown className="h-3 w-3" />非承認</>
              )}
            </span>
          )}
          {/* 承認・確認によって実際の予定へ入ったことを示す */}
          {applied && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
              <CalendarCheck className="h-3 w-3" />
              {c.status === 'attending'
                ? '予定に反映済み'
                : HANDLING_DONE_LABELS[handling ?? 'absent']}
            </span>
          )}
        </div>

        {/* 保護者が希望した利用時間・送迎時間 */}
        {c.status === 'attending' && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {(fmtTime(c.service_start_time) || fmtTime(c.service_end_time)) && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3 text-indigo-400" />
                希望 {fmtTime(c.service_start_time) ?? '—'}〜{fmtTime(c.service_end_time) ?? '—'}
              </span>
            )}
            {/* 保護者が指定した迎えに行く場所・送り届ける場所 */}
            {(c.transport_type === 'pickup_only' || c.transport_type === 'both') && (
              <span className="text-xs text-gray-500">
                迎え {placeLabel(places?.places ?? [], toPlaceValue(c.pickup_location_type, c.pickup_address_id))}
              </span>
            )}
            {(c.transport_type === 'dropoff_only' || c.transport_type === 'both') && (
              <span className="text-xs text-gray-500">
                送り {placeLabel(places?.places ?? [], toPlaceValue(c.dropoff_location_type, c.dropoff_address_id))}
              </span>
            )}
          </div>
        )}

        {c.note && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.note}</p>
        )}

        {/* キャンセルの処理はどちらを選ぶかで請求が変わる。判断の材料をその場に出す */}
        {c.status !== 'attending' && !applied && (
          <p className="mt-1.5 text-[11px] text-gray-500">
            前日・当日の急なお休みは<strong>欠席として記録</strong>（欠席時対応加算の対象になり得ます）、
            それより前のキャンセルは<strong>予定から削除</strong>が原則です。
          </p>
        )}

        {/* 承認前は区分を決める欄、承認後は決まった内容を出す */}
        {editable ? (
          <AssignmentEditor contact={c} value={assignment} onChange={onAssignmentChange} />
        ) : (
          needsApproval(c) &&
          approval === 'approved' && (
            <p className="mt-1 text-xs text-gray-500">{describeAssignment(assignment)}</p>
          )
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date(c.reported_at).toLocaleString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          受信
        </p>
        {/* 利用の連絡：承認する / 承認しない。お休み：確認するのみ */}
        {needsApproval(c) ? (
          approval === 'pending' ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onApproval(c.id, 'approved')}
                disabled={reviewing || assignmentError !== null}
                title={assignmentError ?? undefined}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                承認する
              </button>
              <button
                onClick={() => onApproval(c.id, 'rejected')}
                disabled={reviewing}
                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                承認しない
              </button>
            </div>
          ) : (
            <button
              onClick={() => onApproval(c.id, 'pending')}
              disabled={reviewing}
              className="text-xs text-gray-400 underline hover:text-gray-600 disabled:opacity-50"
            >
              取り消す
            </button>
          )
        ) : applied ? (
          // キャンセルは反映済みになったら押し直せないようにする（二重に処理しない）
          <span className="text-xs text-gray-400">反映済み</span>
        ) : (
          // 欠席として残すか、予定ごと消すかを1件ずつ選ぶ。
          // おすすめは日付から決まるが、決めるのはスタッフなので両方押せるままにする
          <div className="flex flex-col items-end gap-1">
            {(['absent', 'delete'] as AbsentHandling[]).map((h) => {
              const recommended = recommendedHandling(c.date, today) === h
              return (
                <button
                  key={h}
                  onClick={() => onReviewed(c.id, h)}
                  disabled={reviewing}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                    recommended
                      ? 'bg-gray-700 text-white hover:bg-gray-800'
                      : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {HANDLING_LABELS[h]}
                  {recommended && (
                    <span className="rounded bg-white/20 px-1 text-[10px] font-bold">おすすめ</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function ParentContactsBoard({
  unconfirmedContacts,
  initialAssignments,
  transportPlaces,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // 処理した行をその場で反映する（再取得を待たずベルバッジと揃える）
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set())
  const [approvalOverrides, setApprovalOverrides] = useState<Record<string, ApprovalStatus>>({})
  // 施設が決めたサービス区分と時間。承認するまでは画面の中だけに持つ
  const [assignments, setAssignments] = useState<Record<string, ServiceAssignment>>({})
  // 予定へ反映できたかをその場で反映する（再取得を待たずバッジを出す）
  const [appliedOverrides, setAppliedOverrides] = useState<Record<string, boolean>>({})
  // キャンセルをどちらで処理したか。押した直後からバッジに出す
  const [handlingOverrides, setHandlingOverrides] = useState<Record<string, AbsentHandling>>({})
  // まとめて届いた連絡の割り振り。1枚のカードで決めて、日数ぶんに同じものを当てる
  const [groupAssignments, setGroupAssignments] = useState<Record<string, ServiceAssignment>>({})
  // 処理した連絡の送迎の場所。承認するとサーバーの未確認一覧から消えるため、
  // 選択肢も一緒に消えてしまう。控えておかないと「祖父母宅」が
  // ただの「登録住所」に見えてしまい、送り先を読み違える
  const [placeCache, setPlaceCache] = useState<Record<string, ChildTransportPlaces>>({})
  // 反映できなかった連絡の理由（ユニット未設定・予定が無い日のお休みなど）
  const [warnings, setWarnings] = useState<string[]>([])
  const [reviewing, setReviewing] = useState(false)

  // この画面で処理した連絡。サーバー側では未確認から外れるが、
  // 「取り消す」を押せるようこの画面を開いているあいだは残しておく。
  // （残さないと承認した瞬間にカードが消え、押し間違いを戻せなくなる）
  const [handledContacts, setHandledContacts] = useState<Contact[]>([])

  const today = getTodayJST()
  const approvalOf = (c: Contact): ApprovalStatus => approvalOverrides[c.id] ?? c.approval_status
  const appliedOf = (c: Contact): boolean => appliedOverrides[c.id] ?? c.applied_at !== null
  const handlingOf = (c: Contact): AbsentHandling | null =>
    handlingOverrides[c.id] ?? c.absent_handling
  // 初期値は「その日の出席記録に入っている予定」→「保存済みの割り振り」→
  // 「保護者の希望時間をそのまま放デイとして」の順に決める
  const assignmentOf = (c: Contact): ServiceAssignment =>
    assignments[c.id] ?? initialAssignments[c.id] ?? resolveAssignment(c)
  // 承認待ちに戻した行は再び未処理として扱う
  const isPending = (c: Contact) =>
    approvalOverrides[c.id] === 'pending' || !handledIds.has(c.id)

  const placesFor = (childId: string): ChildTransportPlaces | undefined =>
    transportPlaces.find((p) => p.childId === childId) ?? placeCache[childId]

  const remember = (ids: string[]) => {
    const targets = unconfirmedContacts.filter((c) => ids.includes(c.id))
    setHandledContacts((prev) => [
      ...prev,
      ...targets.filter((t) => !prev.some((p) => p.id === t.id)),
    ])
    setPlaceCache((prev) => {
      const next = { ...prev }
      for (const t of targets) {
        const own = transportPlaces.find((p) => p.childId === t.child_id)
        if (own) next[t.child_id] = own
      }
      return next
    })
  }

  // 未確認の連絡＋この画面で処理したもの。日付順に並べ直す
  const visible = [
    ...unconfirmedContacts,
    ...handledContacts.filter((h) => !unconfirmedContacts.some((u) => u.id === h.id)),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const pending = visible.filter(isPending)

  // 同じ内容で複数の日に届いた連絡は、1枚にまとめて承認できるようにする。
  // 保護者が「まとめて申し込む」で送ると日数ぶんのカードが並ぶため
  const groups = (() => {
    const byKey = new Map<string, Contact[]>()
    for (const c of pending.filter(needsApproval)) {
      const key = contentKey(c)
      byKey.set(key, [...(byKey.get(key) ?? []), c])
    }
    return [...byKey.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([key, list]) => ({ key, contacts: [...list].sort((a, b) => a.date.localeCompare(b.date)) }))
      .sort((a, b) => a.contacts[0].date.localeCompare(b.contacts[0].date))
  })()
  const groupedIds = new Set(groups.flatMap((g) => g.contacts.map((c) => c.id)))
  const groupAssignmentOf = (g: { key: string; contacts: Contact[] }): ServiceAssignment =>
    groupAssignments[g.key] ?? assignmentOf(g.contacts[0])

  // 日付ごとにまとめる（まとめカードに出している分は除く）
  const pendingByDate = new Map<string, Contact[]>()
  for (const c of visible) {
    if (groupedIds.has(c.id)) continue
    const arr = pendingByDate.get(c.date) ?? []
    arr.push(c)
    pendingByDate.set(c.date, arr)
  }

  /** まとめて届いた連絡を、同じ割り振りで一度に承認する／しない */
  async function setGroupApproval(
    g: { key: string; contacts: Contact[] },
    next: ApprovalStatus
  ) {
    const assignment = groupAssignmentOf(g)
    if (next === 'approved') {
      const invalid = validateAssignment(assignment)
      if (invalid) {
        const name = g.contacts[0].children?.name ?? '不明'
        setWarnings((prev) => [...new Set([...prev, `${name}さん ${g.contacts.length}日分：${invalid}`])])
        return
      }
    }
    for (const c of g.contacts) {
      await setApproval(c.id, next, next === 'approved' ? assignment : undefined)
    }
  }

  /**
   * キャンセルの連絡を処理する。
   * handling で「欠席として記録」か「予定から削除」かを選ぶ。
   */
  async function markReviewed(ids: string[], handling: AbsentHandling) {
    if (ids.length === 0) return
    setReviewing(true)
    const res = await fetch('/api/parent-contacts/reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, handling }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      warnings?: string[]
      results?: { id: string; applied: boolean; handling?: AbsentHandling }[]
    }
    // 反映できなかった分（もともと予定が無い日など）だけ理由を出す
    const failed = json.warnings ?? []
    if (failed.length > 0) setWarnings((prev) => [...new Set([...prev, ...failed])])
    // 反映できたかは連絡ごとに違う。まとめて確認したときに
    // 1件失敗しただけで全件が未反映に見えないよう、件ごとの結果で更新する
    setAppliedOverrides((prev) => {
      const next = { ...prev }
      for (const r of json.results ?? []) next[r.id] = r.applied
      return next
    })
    setHandlingOverrides((prev) => {
      const next = { ...prev }
      for (const r of json.results ?? []) {
        if (r.applied) next[r.id] = r.handling ?? handling
      }
      return next
    })
    remember(ids)
    setHandledIds((prev) => new Set([...prev, ...ids]))
    setReviewing(false)
    startTransition(() => router.refresh())
  }

  /**
   * 1件の連絡の承認状態を変える。
   * forced は、まとめて承認するときに全日へ同じ割り振りを当てるために使う
   * （state の反映を待たずに確実に同じ内容を送るため）。
   */
  async function setApproval(
    id: string,
    next: ApprovalStatus,
    forced?: ServiceAssignment
  ) {
    const target = visible.find((c) => c.id === id)

    // 承認する利用連絡には、施設が決めた区分と時間を必ず添える。
    // 中途半端な割り振り（両方使う日なのに片方の時間しか無いなど）のまま
    // 予定に入れると、出席管理も請求もどちらのサービスか判断できなくなる
    let assignment: ServiceAssignment | undefined
    if (next === 'approved' && target && needsApproval(target)) {
      assignment = forced ?? assignmentOf(target)
      const invalid = validateAssignment(assignment)
      if (invalid) {
        const name = target.children?.name ?? '不明'
        setWarnings((prev) => [
          ...new Set([...prev, `${name}さん ${formatDateLabel(target.date)}：${invalid}`]),
        ])
        return
      }
    }

    setReviewing(true)
    const res = await fetch('/api/parent-contacts/approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, approvalStatus: next, assignment }),
    })
    const json = (await res.json().catch(() => ({}))) as { warning?: string; error?: string }
    const problem = json.warning ?? json.error
    if (problem) setWarnings((prev) => [...new Set([...prev, problem])])
    if (json.error) {
      setReviewing(false)
      return
    }
    setAppliedOverrides((prev) => ({
      ...prev,
      [id]: next === 'approved' && !json.warning,
    }))
    if (assignment) setAssignments((prev) => ({ ...prev, [id]: assignment! }))
    remember([id])
    setApprovalOverrides((prev) => ({ ...prev, [id]: next }))
    setHandledIds((prev) => {
      const nextSet = new Set(prev)
      if (next === 'pending') nextSet.delete(id)
      else nextSet.add(id)
      return nextSet
    })
    setReviewing(false)
    startTransition(() => router.refresh())
  }

  /**
   * 「利用の連絡をすべて承認する」。
   *
   * キャンセルの連絡は含めない。欠席として残すか予定ごと消すかで国保連請求が
   * 変わるため、まとめ処理で決め打ちにせず1件ずつ選んでもらう。
   */
  async function reviewAll(list: Contact[]) {
    for (const c of list.filter(needsApproval)) await setApproval(c.id, 'approved')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">保護者からの利用連絡</h1>
        <p className="text-xs text-gray-500 mt-1">
          保護者が送るのは「利用したい時間」と「送迎の希望」だけです。
          放デイ・日中一時のどちらでお預かりするかは、承認するときにここで決めてください。
          送迎の時刻は聞いていません（承認した利用時間から決まります）。行き先・帰り先だけ保護者が選びます。
          承認した利用連絡はそのまま利用状況・出席管理の利用予定になります。
          同じ内容でまとめて届いた連絡は1枚のカードにまとめています（承認も1回で済みます）。
          保護者は前日までなら予定をキャンセルできます。届いたキャンセルは
          「欠席として記録」するか「予定から削除」するかをここで選んでください
          （当日のお休みは従来どおり施設が電話で受けます）。
        </p>
      </div>

      {/* 予定へ反映できなかったものだけ理由を出す（承認の記録そのものは残っている） */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-sm font-bold text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              予定に反映できなかった連絡があります
            </p>
            <button
              onClick={() => setWarnings([])}
              className="text-xs text-amber-700 underline hover:text-amber-900"
            >
              閉じる
            </button>
          </div>
          <ul className="mt-1.5 space-y-0.5 list-disc list-inside">
            {warnings.map((w) => (
              <li key={w} className="text-xs text-amber-700">{w}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-amber-600">
            該当分は利用状況ページから手動で予定を追加してください。承認の記録は残っています。
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-gray-100 bg-amber-50/60">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-bold text-gray-900">
              未確認の連絡
              {pending.length > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {pending.length}
                </span>
              )}
            </p>
            {/* 処理した連絡もこの画面を閉じるまでは残す（取り消せるように） */}
            {pending.length === 0 && visible.length > 0 && (
              <span className="text-xs text-gray-400">すべて処理しました</span>
            )}
          </div>
          {pending.some(needsApproval) && (
            <div className="flex items-center gap-2">
              {pending.some((c) => !needsApproval(c)) && (
                <span className="text-[11px] text-gray-500">
                  キャンセルは1件ずつお選びください
                </span>
              )}
              <button
                onClick={() => reviewAll(pending)}
                disabled={reviewing}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {reviewing ? '処理中...' : '利用の連絡をすべて承認する'}
              </button>
            </div>
          )}
        </div>

        {/* まとめて届いた連絡。日付だけが違う連絡を1枚にして、割り振りと承認を1回で済ませる */}
        {groups.length > 0 && (
          <div className="border-b border-gray-100 bg-indigo-50/40 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-bold text-gray-900">まとめて届いた連絡</span>
              <span className="text-xs text-gray-400">
                同じ内容の日をまとめています。承認は1回で済みます
              </span>
            </div>
            {groups.map((g) => {
              const c = g.contacts[0]
              const assignment = groupAssignmentOf(g)
              const invalid = validateAssignment(assignment)
              const places = placesFor(c.child_id)
              return (
                <div key={g.key} className="rounded-xl border border-indigo-200 bg-white px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">
                      {c.children?.name ?? '不明'}
                    </span>
                    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
                      {g.contacts.length}日分
                    </span>
                    {hasTransport(c) && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        <Car className="h-3 w-3" />
                        {TRANSPORT_LABELS[c.transport_type]}
                      </span>
                    )}
                    {(fmtTime(c.service_start_time) || fmtTime(c.service_end_time)) && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="h-3 w-3 text-indigo-400" />
                        希望 {fmtTime(c.service_start_time) ?? '—'}〜{fmtTime(c.service_end_time) ?? '—'}
                      </span>
                    )}
                    {(c.transport_type === 'pickup_only' || c.transport_type === 'both') && (
                      <span className="text-xs text-gray-500">
                        迎え {placeLabel(places?.places ?? [], toPlaceValue(c.pickup_location_type, c.pickup_address_id))}
                      </span>
                    )}
                    {(c.transport_type === 'dropoff_only' || c.transport_type === 'both') && (
                      <span className="text-xs text-gray-500">
                        送り {placeLabel(places?.places ?? [], toPlaceValue(c.dropoff_location_type, c.dropoff_address_id))}
                      </span>
                    )}
                  </div>

                  {/* どの日が含まれているか。ここで日を外すことはできないので、
                      違う扱いにしたい日は承認したあとに利用状況ページで直す */}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {g.contacts.map((gc) => (
                      <span
                        key={gc.id}
                        className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600"
                      >
                        {formatDateLabel(gc.date)}
                      </span>
                    ))}
                  </div>

                  {c.note && <p className="text-xs text-gray-500 mt-1">{c.note}</p>}

                  <AssignmentEditor
                    contact={c}
                    value={assignment}
                    onChange={(next) => setGroupAssignments((prev) => ({ ...prev, [g.key]: next }))}
                  />

                  <div className="mt-2 flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setGroupApproval(g, 'approved')}
                      disabled={reviewing || invalid !== null}
                      title={invalid ?? undefined}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {g.contacts.length}日分をまとめて承認
                    </button>
                    <button
                      onClick={() => setGroupApproval(g, 'rejected')}
                      disabled={reviewing}
                      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      承認しない
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            未確認の連絡はありません
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {[...pendingByDate.entries()].map(([d, dayContacts]) => {
              const rel = relativeLabel(d, today)
              return (
                <div key={d} className="px-4 py-3">
                  {/* 日付ヘッダー */}
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm font-bold text-gray-900">
                      {formatDateLabel(d)}
                    </span>
                    {rel && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                          rel === '今日'
                            ? 'bg-indigo-600 text-white'
                            : rel === '明日'
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {rel}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{dayContacts.length}件</span>
                  </div>
                  <div className="space-y-2">
                    {dayContacts.map((c) => (
                      <ContactCard
                        key={c.id}
                        contact={c}
                        approval={approvalOf(c)}
                        applied={appliedOf(c)}
                        handling={handlingOf(c)}
                        today={today}
                        reviewing={reviewing}
                        assignment={assignmentOf(c)}
                        places={placesFor(c.child_id)}
                        onAssignmentChange={(next) =>
                          setAssignments((prev) => ({ ...prev, [c.id]: next }))
                        }
                        onReviewed={(id, handling) => markReviewed([id], handling)}
                        onApproval={setApproval}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        処理済みの連絡は、児童ごとの詳細ページと利用スケジュールで確認できます。
        承認を「取り消す」と、この連絡で追加された予定も一緒に取り消されます
      </p>
    </div>
  )
}
