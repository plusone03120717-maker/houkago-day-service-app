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
  children: { id: string; name: string } | null
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
  reviewing: boolean
  /** 施設が決めるサービス区分と時間 */
  assignment: ServiceAssignment
  /** 送迎の場所を名前で出すための選択肢 */
  places: ChildTransportPlaces | undefined
  onAssignmentChange: (next: ServiceAssignment) => void
  onReviewed: (id: string) => void
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
              ? 'お休み'
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
              予定に反映済み
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
          // お休みは反映済みになったら押し直せないようにする（二重に記録しない）
          <span className="text-xs text-gray-400">反映済み</span>
        ) : (
          <button
            onClick={() => onReviewed(c.id)}
            disabled={reviewing}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            お休みとして反映
          </button>
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

  // 日付ごとにまとめる
  const pendingByDate = new Map<string, Contact[]>()
  for (const c of visible) {
    const arr = pendingByDate.get(c.date) ?? []
    arr.push(c)
    pendingByDate.set(c.date, arr)
  }

  async function markReviewed(ids: string[]) {
    if (ids.length === 0) return
    setReviewing(true)
    const res = await fetch('/api/parent-contacts/reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      warnings?: string[]
      results?: { id: string; applied: boolean }[]
    }
    // お休みの連絡は欠席として記録される。記録できなかった分だけ理由を出す
    const failed = json.warnings ?? []
    if (failed.length > 0) setWarnings((prev) => [...new Set([...prev, ...failed])])
    // 反映できたかは連絡ごとに違う。まとめて確認したときに
    // 1件失敗しただけで全件が未反映に見えないよう、件ごとの結果で更新する
    setAppliedOverrides((prev) => {
      const next = { ...prev }
      for (const r of json.results ?? []) next[r.id] = r.applied
      return next
    })
    remember(ids)
    setHandledIds((prev) => new Set([...prev, ...ids]))
    setReviewing(false)
    startTransition(() => router.refresh())
  }

  async function setApproval(id: string, next: ApprovalStatus) {
    const target = visible.find((c) => c.id === id)

    // 承認する利用連絡には、施設が決めた区分と時間を必ず添える。
    // 中途半端な割り振り（両方使う日なのに片方の時間しか無いなど）のまま
    // 予定に入れると、出席管理も請求もどちらのサービスか判断できなくなる
    let assignment: ServiceAssignment | undefined
    if (next === 'approved' && target && needsApproval(target)) {
      assignment = assignmentOf(target)
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

  /** 「すべて承認・確認する」: お休みは確認済み、利用の連絡は承認としてまとめて処理する */
  async function reviewAll(list: Contact[]) {
    const absents = list.filter((c) => !needsApproval(c))
    const reservations = list.filter(needsApproval)
    if (absents.length > 0) await markReviewed(absents.map((c) => c.id))
    for (const c of reservations) await setApproval(c.id, 'approved')
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
          お休み・キャンセルの連絡はここには来ません（施設が電話で受け、利用状況ページで記録します）。
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
          {pending.length > 0 && (
            <button
              onClick={() => reviewAll(pending)}
              disabled={reviewing}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {reviewing ? '処理中...' : 'すべて承認・確認する'}
            </button>
          )}
        </div>

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
                        reviewing={reviewing}
                        assignment={assignmentOf(c)}
                        places={placesFor(c.child_id)}
                        onAssignmentChange={(next) =>
                          setAssignments((prev) => ({ ...prev, [c.id]: next }))
                        }
                        onReviewed={(id) => markReviewed([id])}
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
