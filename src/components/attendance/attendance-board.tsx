'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ClipboardEdit,
  LayoutList,
  CalendarDays,
  Trash2,
  Loader2,
} from 'lucide-react'
import { formatDate, getTodayJST } from '@/lib/utils'
import { ALL_UNITS, unitChildKey } from '@/lib/attendance-board-data'
import { transportTimeOf, shiftTime } from '@/lib/schedule-defaults'
import { deleteUsageDay, ABSENT_CLEARED_FIELDS } from '@/lib/usage-day'
import { MonthlyAttendanceView } from './monthly-attendance-view'
import {
  EasyAttendancePanel,
  fieldsFromEasy,
  easyFromFields,
  easyError,
  kindOfServiceType,
  DEFAULT_SWITCH_TIME,
  type EasyState,
} from './easy-attendance-panel'
import { switchTimeFor, SWITCH_TIME_HOLIDAY } from '@/lib/daytime-switch'
import { AbsenceReasonInput } from './absence-reason-input'
import {
  TransportDaytimePanel,
  TransportDaytimeToggle,
  initFields,
  isBlankFields,
  applyScheduleDefaults,
  applyTransportDefaults,
  hasBlankTransport,
  buildTransportUpdate,
  type TransportRow,
  type TransportFields,
  type ScheduleDefaults,
  type StaffMember,
  type Vehicle,
} from '@/components/transport/transport-daytime-panel'

export type Unit = {
  id: string
  name: string
  service_type: string
  capacity: number
  facilities: { id: string; name: string } | null
}

export type Reservation = {
  id: string
  child_id: string
  /** どのユニットの行か（「すべて」表示ではユニットをまたいで並ぶ） */
  unit_id: string
  date: string
  status: string
  children: {
    id: string
    name: string
    name_kana: string | null
    photo_url: string | null
    allergy_info: string | null
    medical_info: string | null
  } | null
}

export type Attendance = TransportRow & {
  id: string
  child_id: string
  unit_id: string
  date: string
  status: string
  pickup_type: string
  health_condition: string | null
  /** 欠席の理由（欠席のときだけ使う） */
  absence_reason: string | null
}

/** 児童ID → 直近の出席日の送迎入力（前回コピー用） */
export type PrevAttendanceRow = TransportRow & { child_id: string; date: string }

interface Props {
  date: string
  units: Unit[]
  /** 選択中のユニットID。ALL_UNITS（'all'）なら全ユニットまとめて表示 */
  selectedUnitId: string
  reservations: Reservation[]
  attendances: Attendance[]
  staffId: string
  staffMembers: StaffMember[]
  vehicles: Vehicle[]
  defaultServiceEndTime: string
  prevByChildId: Record<string, PrevAttendanceRow>
  /** キーは unitChildKey(unitId, childId) */
  scheduleDefaultsByKey: Record<string, ScheduleDefaults>
  /**
   * 送迎・欠席理由の入力と、利用予定の削除ができるか。システム管理者だけ true（施設長・スタッフは閲覧のみ）。
   * 出席・欠席・一括出席は日々の記録を書き始めるのに要るので、canEdit に関係なく全員が押せる（2026-11-12 依頼主）
   */
  canEdit?: boolean
  /** 子どもごとの両方の日の切りかえの既定（学校のある日 16:30・休みの日 16:00） */
  switchTimeByChild?: Record<string, string>
  /** その日の保護者の連絡で、まだ処理していないもの（児童ID → お休みか利用か） */
  pendingContactByChild?: Record<string, 'absent' | 'attending'>
  /** その日の承認ずみの利用連絡の区分（児童ID → service_type） */
  approvedServiceTypeByChild?: Record<string, string>
  /** 過ぎた日で、出席も欠席も付いていない記録（予定のまま）の日と件数 */
  pastUnrecorded?: { date: string; count: number }[]
}

/** "16:30:00" → "16:30"。未設定・00:00 は空文字として扱う */
function fmtTime(t: string | null | undefined): string {
  if (!t) return ''
  const hhmm = t.slice(0, 5)
  return hhmm === '00:00' ? '' : hhmm
}

/** 実際の時刻が入っているか（未設定・00:00 は未入力とみなす） */
function hasTime(t: string | null | undefined): boolean {
  return fmtTime(t) !== ''
}

export function AttendanceBoard({
  date,
  units,
  selectedUnitId,
  reservations,
  attendances,
  staffId,
  staffMembers,
  vehicles,
  defaultServiceEndTime,
  prevByChildId,
  scheduleDefaultsByKey,
  canEdit = true,
  switchTimeByChild = {},
  pendingContactByChild = {},
  approvedServiceTypeByChild = {},
  pastUnrecorded = [],
}: Props) {
  const router = useRouter()
  // ユニット未選択（＝すべて）。既定はこちらで、ユニットボタンで絞り込む
  const isAllUnits = selectedUnitId === ALL_UNITS
  const supabase = createClient()
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Reservation | null>(null)
  const [view, setView] = useState<'day' | 'month'>('day')

  // 送迎・日中一時入力（日々の記録と同じUI）
  const [expanded, setExpanded] = useState<string | null>(null)
  const [fieldStates, setFieldStates] = useState<Record<string, TransportFields>>({})
  const [transportSaving, setTransportSaving] = useState<string | null>(null)
  const [transportSavedIds, setTransportSavedIds] = useState<Set<string>>(new Set())
  const [savedOnce, setSavedOnce] = useState<Set<string>>(new Set())
  // 「くわしく直す」（今の入力画面）を開いている行
  const [detailOpen, setDetailOpen] = useState<Set<string>>(new Set())
  // 「予定どおりで確定」を押している行
  const [confirming, setConfirming] = useState<string | null>(null)
  // 前の日までは「予定の確定」、当日からは「出席」にする（試作・安全策）
  const isFutureDate = date > getTodayJST()
  // まとめて確定・一括出席の結果（外した子とその理由）
  const [bulkNote, setBulkNote] = useState<string | null>(null)

  // ── 出席・予約はローカル状態として持つ ──
  // 以前は保存のたびに router.refresh() でページ全体（サーバー4往復）を取り直していた。
  // 更新後の行でローカル状態を差し替えれば、保存時のサーバー往復は0になる。
  // props への同期は日付・ユニットが変わったときだけ行う。
  const boardKey = `${selectedUnitId}|${date}`
  const [syncedKey, setSyncedKey] = useState(boardKey)
  const [rows, setRows] = useState<Attendance[]>(attendances)
  const [resList, setResList] = useState<Reservation[]>(reservations)
  if (syncedKey !== boardKey) {
    setSyncedKey(boardKey)
    setRows(attendances)
    setResList(reservations)
  }

  // 「すべて」表示では同じ児童が別ユニットの行として並びうるため、
  // 出席記録はユニット×児童で引く
  const attendanceMap = Object.fromEntries(
    rows.map((a) => [unitChildKey(a.unit_id, a.child_id), a])
  )
  const attOf = (r: { child_id: string; unit_id: string }) =>
    attendanceMap[unitChildKey(r.unit_id, r.child_id)]

  /** 保存結果の行を反映（同じidがあれば置換、なければ追加） */
  const applyRow = (row: Attendance) =>
    setRows((prev) => {
      const i = prev.findIndex((a) => a.id === row.id)
      if (i === -1) return [...prev, row]
      const next = [...prev]
      next[i] = row
      return next
    })

  /** 児童の出席行をローカルから除去 */
  const dropRow = (unitId: string, childId: string) =>
    setRows((prev) => prev.filter((a) => !(a.child_id === childId && a.unit_id === unitId)))

  // 他の職員による変更の取り込み。
  // 保存ごとの router.refresh() が副次的に担っていた同期を、Realtime と
  // タブ復帰時の再取得に置き換える（Realtime 未設定の環境でも後者で追従できる）。
  useEffect(() => {
    if (!selectedUnitId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const reload = async () => {
      let query = supabase.from('daily_attendance').select('*').eq('date', date)
      if (!isAllUnits) query = query.eq('unit_id', selectedUnitId)
      const { data } = await query
      if (!cancelled && data) setRows(data as unknown as Attendance[])
    }
    // 自分の保存でも通知が飛ぶため、連続保存はまとめて1回だけ取り直す
    const scheduleReload = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void reload() }, 500)
    }

    // 「すべて」表示では unit_id で絞らず、全ユニットの変更を受け取る
    const changeFilter = isAllUnits
      ? { event: '*' as const, schema: 'public', table: 'daily_attendance' }
      : {
          event: '*' as const,
          schema: 'public',
          table: 'daily_attendance',
          filter: `unit_id=eq.${selectedUnitId}`,
        }

    const channel = supabase
      .channel(`attendance:${selectedUnitId}:${date}`)
      .on('postgres_changes', changeFilter, scheduleReload)
      .subscribe()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [supabase, selectedUnitId, isAllUnits, date])

  // DBの値が空の場合は利用スケジュールの初期値を自動セット
  const buildInitialFields = (a: Attendance): TransportFields => {
    const base = initFields(a, defaultServiceEndTime)
    const sched = scheduleDefaultsByKey[unitChildKey(a.unit_id, a.child_id)]
    if (!sched) return base
    if (isBlankFields(base)) {
      return applyScheduleDefaults(base, sched, defaultServiceEndTime)
    }
    // 保護者の利用連絡を承認した日は利用時間だけが先に入るため、
    // 上の条件に当てはまらない。空いている送迎の欄だけを埋める
    return applyTransportDefaults(base, sched)
  }

  // スケジュール初期値が表示中（未保存）かどうか
  const isSchedulePreset = (a: Attendance): boolean => {
    const sched = scheduleDefaultsByKey[unitChildKey(a.unit_id, a.child_id)]
    if (!sched || savedOnce.has(a.id)) return false
    const base = initFields(a, defaultServiceEndTime)
    // 両方の日の帰りは日中一時の欄に入るので、放デイの帰りが空でも「未入力」ではない
    if (base.daytimeSupport && (base.daytimeDropoffDepartureTime || base.daytimeDropoffArrivalTime)) {
      if (isBlankFields(base)) return true
      const pickupBlank = !base.pickupDepartureTime && !base.pickupArrivalTime &&
        !base.daytimePickupDepartureTime && !base.daytimePickupArrivalTime
      return pickupBlank
    }
    // 送迎の欄だけを埋めた場合も「予定値を表示中」であることに変わりはない
    return isBlankFields(base) || hasBlankTransport(base)
  }

  const getFields = (a: Attendance): TransportFields =>
    fieldStates[a.id] ?? buildInitialFields(a)

  const setField = (a: Attendance, patch: Partial<TransportFields>) => {
    setFieldStates((prev) => ({
      ...prev,
      [a.id]: { ...(prev[a.id] ?? buildInitialFields(a)), ...patch },
    }))
  }

  // 前回（直近の出席日）の入力内容をまるごと複写
  const handleCopyPrevious = (a: Attendance) => {
    const prev = prevByChildId[a.child_id]
    if (!prev) return
    setFieldStates((s) => ({ ...s, [a.id]: initFields(prev, defaultServiceEndTime) }))
  }

  /** 予定がどこから来たか（保護者の連絡・特定日・いつも） */
  const sourceLabelOf = (sched: ScheduleDefaults | undefined): string | null => {
    if (!sched) return null
    // いつもの予定がなく、承認した連絡の予約だけで入った子は page.tsx で 'request' を付けている
    const src = Object.values(sched.sources ?? {})
    if (src.includes('request')) return '保護者の連絡'
    if (src.includes('override')) return '特定日の変更'
    return 'いつもどおり'
  }

  /** その子の両方の日の切りかえの既定（学校のある日 16:30・休みの日 16:00） */
  const switchOf = (childId: string) => switchTimeByChild[childId] ?? DEFAULT_SWITCH_TIME
  /** いつもの予定の切りかえを使うときの時刻（休みの日は予定より 16:00 を優先） */
  const plannedSwitchOf = (childId: string, sched: ScheduleDefaults) =>
    switchTimeFor(switchOf(childId) === SWITCH_TIME_HOLIDAY, sched.daytimeSupportStartTime)

  /**
   * 予定から、その日の20欄を組み立てる。
   * すでに決めてあるドライバー・車種は消さない（夜に送迎管理で決めた分が空になる事故を防ぐ・カード8）
   */
  const fieldsFromSchedule = (sched: ScheduleDefaults, childId: string, existing?: Attendance): TransportFields => {
    const showPickup = sched.transportType === 'pickup_only' || sched.transportType === 'both'
    const showDropoff = sched.transportType === 'dropoff_only' || sched.transportType === 'both'
    const prev = existing ? easyFromFields(initFields(existing, defaultServiceEndTime), switchOf(childId)) : null
    const easy: EasyState = {
      kind: sched.daytimeSupport ? 'both' : 'hd',
      switchTime: plannedSwitchOf(childId, sched),
      order: 'hd_first',
      noPickup: !showPickup || !sched.pickupTime,
      pickupTime: showPickup ? fmtTime(sched.pickupTime) : '',
      pickupDriverId: showPickup ? prev?.pickupDriverId ?? '' : '',
      pickupVehicleId: showPickup ? prev?.pickupVehicleId ?? '' : '',
      noDropoff: !showDropoff || !sched.dropoffTime,
      dropoffTime: showDropoff ? fmtTime(sched.dropoffTime) : '',
      dropoffDriverId: showDropoff ? prev?.dropoffDriverId ?? '' : '',
      dropoffVehicleId: showDropoff ? prev?.dropoffVehicleId ?? '' : '',
    }
    const blank = initFields({} as TransportRow, defaultServiceEndTime)
    const base: TransportFields = {
      ...blank,
      serviceStartTime: fmtTime(sched.serviceStartTime),
      serviceEndTime: fmtTime(sched.serviceEndTime) || fmtTime(sched.dropoffTime) || defaultServiceEndTime,
    }
    const f = fieldsFromEasy(easy, base, defaultServiceEndTime)
    // 利用開始は予定の利用時間を優先（なければお迎えの10分後）。カード1と同じ決め方
    const planned = fmtTime(sched.serviceStartTime)
    return planned ? { ...f, serviceStartTime: planned } : f
  }

  /** その日の記録に、承認などで時刻がもう入っているか */
  const hasPlannedTimes = (att: Attendance | undefined) =>
    !!att && (hasTime(att.service_start_time) || hasTime(att.daytime_support_start_time))

  /**
   * 「予定どおりで確定」で保存する20欄。
   * 承認などで時刻が入っている記録はその中身を正とする（予約には日中一時の区分が無く、
   * 予定から組み立て直すと承認で決めた「両方」が「放デイだけ」に変わってしまうため）。
   * 入っていなければ予定から組み立てる。
   */
  const confirmFieldsOf = (res: Reservation, sched: ScheduleDefaults): TransportFields => {
    const existing = attOf(res)
    if (existing && hasPlannedTimes(existing)) {
      const base = initFields(existing, defaultServiceEndTime)
      return fieldsFromEasy(easyFromFields(base, switchOf(res.child_id)), base, defaultServiceEndTime)
    }
    return fieldsFromSchedule(sched, res.child_id, existing)
  }

  /** 確定できない理由（時刻のまちがい・予定がない）。確定できるなら null */
  const confirmProblemOf = (res: Reservation): string | null => {
    const sched = scheduleDefaultsByKey[unitChildKey(res.unit_id, res.child_id)]
    if (!sched) return '予定がありません'
    const f = confirmFieldsOf(res, sched)
    return easyError(easyFromFields(f, switchOf(res.child_id)), f)
  }

  /**
   * 「予定どおりで確定」。予定の時刻・送迎を、送迎の欄まで実際に保存する。
   * 前の日までは予定の確定だけ（status は scheduled のまま＝出席の実績にしない）、
   * 当日からは出席にする。時刻のまちがいがあるときは保存しない（不具合 B）。
   * 戻り値：保存できたら null、できなければ理由
   */
  const confirmAsScheduled = async (res: Reservation, opts: { bulk?: boolean } = {}): Promise<string | null> => {
    if (!canEdit) return '編集できません'
    const sched = scheduleDefaultsByKey[unitChildKey(res.unit_id, res.child_id)]
    if (!sched) return '予定がありません'
    const problem = confirmProblemOf(res)
    if (problem) {
      if (!opts.bulk) alert(`確定できません：${problem}\n「くわしく直す」で時刻を確かめてください。`)
      return problem
    }
    const pending = pendingContactByChild[res.child_id]
    if (pending && !opts.bulk) {
      const ok = window.confirm(
        `この子には、保護者からの${pending === 'absent' ? 'お休み' : '利用'}の連絡がまだ処理されていません。\n` +
        '先に利用連絡の画面で承認・処理するのがおすすめです。このまま確定しますか？'
      )
      if (!ok) return '取りやめ'
    }
    const key = unitChildKey(res.unit_id, res.child_id)
    setConfirming(key)
    const update = {
      ...buildTransportUpdate(confirmFieldsOf(res, sched)),
      status: isFutureDate ? 'scheduled' : 'attended',
      absence_reason: null,
    }
    const existing = attOf(res)
    const { data, error } = existing
      ? await supabase.from('daily_attendance').update(update).eq('id', existing.id).select('*').single()
      : await supabase
          .from('daily_attendance')
          .insert({ child_id: res.child_id, unit_id: res.unit_id, date, created_by: staffId, ...update })
          .select('*')
          .single()
    setConfirming(null)
    if (error) {
      if (!opts.bulk) alert(`確定エラー: ${error.message}`)
      return `保存に失敗しました（${error.message}）`
    }
    if (data) {
      applyRow(data as unknown as Attendance)
      setFieldStates((prev) => { const n = { ...prev }; delete n[(data as { id: string }).id]; return n })
      setSavedOnce((prev) => new Set(prev).add((data as { id: string }).id))
    }
    return null
  }

  const nameOfRes = (r: Reservation) => r.children?.name ?? '（名前なし）'

  /** まだ確定していない行（記録なし・予定のまま） */
  const isOpenRow = (res: Reservation) => {
    const att = attOf(res)
    return res.status !== 'cancel_waiting' && (!att || att.status === 'scheduled')
  }

  /** 予定どおりで確定ずみか（予定のままで、送迎か利用時間がすでに保存されている） */
  const isConfirmedPlan = (att: Attendance | undefined) =>
    !!att && att.status === 'scheduled' && (hasTime(att.service_start_time) || hasTime(att.daytime_support_start_time))

  /** まとめての確定の対象（いつもどおりで、まだ確定していない子） */
  const usualOpenRows = () => resList.filter((r) => {
    if (!isOpenRow(r) || isConfirmedPlan(attOf(r))) return false
    return sourceLabelOf(scheduleDefaultsByKey[unitChildKey(r.unit_id, r.child_id)]) === 'いつもどおり'
  })

  /**
   * 「いつもどおり」の子をまとめて確定（保護者の連絡・特定日の変更がある子は1人ずつ見る）。
   * 未処理の保護者の連絡がある子と、時刻のまちがいがある子は外して、名前と理由を出す（カード1・不具合 B）
   */
  const confirmAllUsual = async () => {
    setBulkNote(null)
    const skipped: string[] = []
    let done = 0
    for (const r of usualOpenRows()) {
      const pending = pendingContactByChild[r.child_id]
      if (pending) {
        skipped.push(`${nameOfRes(r)}（保護者の${pending === 'absent' ? 'お休み' : '利用'}の連絡が未処理）`)
        continue
      }
      const problem = await confirmAsScheduled(r, { bulk: true })
      if (problem) skipped.push(`${nameOfRes(r)}（${problem}）`)
      else done++
    }
    setBulkNote(
      `${done}人を${isFutureDate ? '確定' : '出席に'}しました。` +
      (skipped.length > 0 ? `1人ずつ確かめてください：${skipped.join('、')}` : '')
    )
  }

  const handleSaveTransport = async (a: Attendance) => {
    if (!canEdit) return
    setTransportSaving(a.id)
    // 更新後の行を受け取ってローカルへ反映する（ページ全体の再取得は不要）
    const { data, error } = await supabase
      .from('daily_attendance')
      .update(buildTransportUpdate(getFields(a)))
      .eq('id', a.id)
      .select('*')
      .single()
    setTransportSaving(null)
    if (error) { alert(`保存エラー: ${error.message}`); return }
    if (data) applyRow(data as unknown as Attendance)

    setSavedOnce((prev) => new Set(prev).add(a.id))
    setTransportSavedIds((prev) => new Set(prev).add(a.id))
    setTimeout(() => setTransportSavedIds((prev) => { const s = new Set(prev); s.delete(a.id); return s }), 2000)
  }

  // 日付を1日前後に移動
  const changeDate = (delta: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    const params = new URLSearchParams({ date: formatDate(d, 'yyyy-MM-dd'), unit: selectedUnitId })
    router.push(`/attendance?${params.toString()}`)
  }

  const changeUnit = (unitId: string) => {
    router.push(`/attendance?date=${date}&unit=${unitId}`)
  }

  /** 利用時間の更新は service_* と check_*_time の両方に同じ値を書き込む */
  type UsageTimes = {
    service_start_time?: string
    service_end_time?: string
    check_in_time?: string
    check_out_time?: string
  }

  // 利用スケジュールから当日の利用時間を取得（特定日上書き > 曜日別設定 > プランのデフォルト）
  // 以前はブラウザから usage_plans / usage_plan_date_overrides / usage_plan_day_settings を
  // 引き直していたが（児童1人につき2〜3往復）、サーバーが同じ優先順で計算した
  // scheduleDefaultsByKey を props で受け取っているため往復ゼロで求められる。
  const getScheduledTimes = (unitId: string, childId: string): UsageTimes => {
    const sched = scheduleDefaultsByKey[unitChildKey(unitId, childId)]
    if (!sched) return {}
    const result: UsageTimes = {}
    // ほかの画面（入力パネル・承認・送迎管理）と同じ決め方にそろえる（試作・カード1）。
    // 開始＝予定の利用時間。なければお迎え（学校などに着く時刻）の10分後＝事業所に着く時刻。
    // 以前はお迎えの時刻そのままを入れていて、ほかの画面と10分ずれていた
    const start = fmtTime(sched.serviceStartTime) ||
      (sched.pickupTime ? fmtTime(shiftTime(sched.pickupTime.slice(0, 5), 10)) : '')
    const end = fmtTime(sched.serviceEndTime) || fmtTime(sched.dropoffTime)
    if (start) {
      result.service_start_time = start
      result.check_in_time = start
    }
    if (end) {
      result.service_end_time = end
      result.check_out_time = end
    }
    return result
  }

  // 出席記録を作成/更新
  const upsertAttendance = async (
    unitId: string,
    childId: string,
    updates: Partial<Attendance>
  ) => {
    // 安全策（試作）：前の日までに「出席」を付けると、休んだ日に出席が残って請求がまちがう
    if (updates.status === 'attended' && isFutureDate) {
      const ok = window.confirm(
        'まだ当日ではありません。「出席」は実際に来た記録として請求に使われます。\n' +
        '予定を確定したいだけなら「予定どおりで確定」を使ってください。\n\nこのまま出席にしますか？'
      )
      if (!ok) return
    }
    setSaving(unitChildKey(unitId, childId))
    const existing = attendanceMap[unitChildKey(unitId, childId)]

    // 出席マーク時に利用スケジュールの時間を自動同期する。
    // ただし「すでに時刻が入っている項目」は上書きしない。
    // 出席カレンダーで個別に直した時刻は status='scheduled' の行として残るため、
    // ここで一律にスケジュールの時刻を入れると、直した時刻が消えてしまう。
    let scheduledTimes: UsageTimes = {}
    if (updates.status === 'attended' && existing?.status !== 'attended') {
      scheduledTimes = getScheduledTimes(unitId, childId)
      if (existing) {
        if (hasTime(existing.service_start_time) || hasTime(existing.check_in_time)) {
          delete scheduledTimes.service_start_time
          delete scheduledTimes.check_in_time
        }
        if (hasTime(existing.service_end_time) || hasTime(existing.check_out_time)) {
          delete scheduledTimes.service_end_time
          delete scheduledTimes.check_out_time
        }
      }
    }

    // 欠席にする場合は送迎時間・利用時間のクリアも同じ1回のUPDATEにまとめる
    // 出席に戻したときは、前に入れた欠席理由を残さない
    const mergedUpdates = updates.status === 'absent'
      ? { ...scheduledTimes, ...updates, ...ABSENT_CLEARED_FIELDS }
      : updates.status === 'attended'
      ? { ...scheduledTimes, ...updates, absence_reason: null }
      : { ...scheduledTimes, ...updates }

    if (existing) {
      const { data, error } = await supabase
        .from('daily_attendance')
        .update(mergedUpdates)
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) { alert(`更新エラー: ${error.message}`); setSaving(null); return }
      if (data) applyRow(data as unknown as Attendance)
    } else {
      const { data, error } = await supabase
        .from('daily_attendance')
        .insert({
          child_id: childId,
          unit_id: unitId,
          date,
          status: 'attended',
          pickup_type: 'none',
          created_by: staffId,
          ...mergedUpdates,
        })
        .select('*')
        .single()
      if (error) { alert(`登録エラー: ${error.message}`); setSaving(null); return }
      if (data) applyRow(data as unknown as Attendance)
    }

    // 欠席になった場合、送迎スケジュールからも削除
    if (updates.status === 'absent') {
      const { data: schedules } = await supabase
        .from('transport_schedules')
        .select('id')
        .eq('unit_id', unitId)
        .eq('date', date)
      if (schedules && schedules.length > 0) {
        const scheduleIds = schedules.map((s: { id: string }) => s.id)
        await supabase
          .from('transport_details')
          .delete()
          .eq('child_id', childId)
          .in('schedule_id', scheduleIds)
      }
    }

    setSaving(null)
  }

  // 欠席理由の保存
  const saveAbsenceReason = async (attendanceId: string, reason: string | null) => {
    if (!canEdit) return false
    const { data, error } = await supabase
      .from('daily_attendance')
      .update({ absence_reason: reason })
      .eq('id', attendanceId)
      .select('*')
      .single()
    if (error) { alert(`欠席理由の保存エラー: ${error.message}`); return false }
    if (data) applyRow(data as unknown as Attendance)
    return true
  }

  // 出席取り消し（レコードを削除して未記録に戻す）
  // 出席の取り消しは記録ごと消える（日々の記録・活動記録も消える）ので、システム管理者だけ
  const cancelAttendance = async (unitId: string, childId: string) => {
    if (!canEdit) return
    const existing = attendanceMap[unitChildKey(unitId, childId)]
    if (!existing) return
    setSaving(unitChildKey(unitId, childId))
    const { error } = await supabase.from('daily_attendance').delete().eq('id', existing.id)
    if (error) { alert(`取り消しエラー: ${error.message}`); setSaving(null); return }
    dropRow(unitId, childId)
    setSaving(null)
  }

  // 利用予定ごと削除（そもそも利用予定がない児童を誤って入れてしまった場合）
  // 「欠席」にすると記録が残り請求にも出てくるため、なかったことにする操作を用意する
  // 一覧の行は予約由来・利用計画由来・出欠記録由来が混在するため、
  // 予約IDではなく児童・ユニット・日付で消す（利用状況ページと共通処理）
  const deleteReservation = async (res: Reservation) => {
    if (!canEdit) return
    setDeleting(unitChildKey(res.unit_id, res.child_id))
    const { error } = await deleteUsageDay(supabase, {
      childId: res.child_id,
      unitId: res.unit_id,
      date,
    })
    if (error) { alert(`削除エラー: ${error}`); setDeleting(null); return }
    setResList((prev) =>
      prev.filter((r) => !(r.child_id === res.child_id && r.unit_id === res.unit_id))
    )
    dropRow(res.unit_id, res.child_id)
    setDeleting(null)
    setConfirmDelete(null)
  }

  // 一括出席登録
  const markAllPresent = async () => {
    if (isFutureDate && !window.confirm(
      'まだ当日ではありません。「出席」は実際に来た記録として請求に使われます。\n' +
      '予定を確定したいだけなら「いつもどおりの子をまとめて確定」を使ってください。\n\nこのまま全員を出席にしますか？'
    )) return
    setSaving('all')
    setBulkNote(null)
    // 未処理の保護者の連絡がある子は外す（お休みの連絡を見落として出席にしないように・カード1）
    const unrecorded = resList.filter(
      (r) => r.status !== 'cancel_waiting' && !attOf(r) && !pendingContactByChild[r.child_id]
    )
    const skippedPending = resList.filter(
      (r) => r.status !== 'cancel_waiting' && !attOf(r) && pendingContactByChild[r.child_id]
    )
    if (skippedPending.length > 0) {
      setBulkNote(
        `保護者の連絡が未処理の子は外しました：${skippedPending
          .map((r) => `${nameOfRes(r)}（${pendingContactByChild[r.child_id] === 'absent' ? 'お休み' : '利用'}の連絡）`)
          .join('、')}。利用連絡の画面で処理してから付けてください。`
      )
    }

    // スケジュール時間は props から求まるので、追加の取得往復は発生しない。
    // 他の職員が同じ児童を先に登録していた場合に一括処理ごと失敗しないよう、
    // (child_id, unit_id, date) の重複はスキップする。
    const { data, error } = await supabase
      .from('daily_attendance')
      .upsert(
        unrecorded.map((r) => ({
          child_id: r.child_id,
          unit_id: r.unit_id,
          date,
          status: 'attended',
          pickup_type: 'none',
          created_by: staffId,
          ...getScheduledTimes(r.unit_id, r.child_id),
        })),
        { onConflict: 'child_id,unit_id,date', ignoreDuplicates: true }
      )
      .select('*')
    setSaving(null)
    if (error) { alert(`一括登録エラー: ${error.message}`); return }
    if (data) for (const row of data as unknown as Attendance[]) applyRow(row)
  }

  const attending = resList.filter((r) => attOf(r)?.status === 'attended')
  const absent = resList.filter((r) => {
    const att = attOf(r)
    return att?.status === 'absent' || r.status === 'cancel_waiting'
  })
  const unrecorded = resList.filter((r) => !attOf(r) && r.status !== 'cancel_waiting')

  const selectedUnit = units.find((u) => u.id === selectedUnitId)
  const unitNameById = new Map(units.map((u) => [u.id, u.name]))
  // 「すべて」表示の定員は全ユニットの合計
  const capacity = isAllUnits
    ? units.reduce((sum, u) => sum + (u.capacity ?? 0), 0)
    : selectedUnit?.capacity ?? 0

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">出席管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">出席・欠席・利用時間の記録</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {view === 'day' && canEdit && usualOpenRows().length > 0 && (
            <Button variant="outline" onClick={confirmAllUsual} disabled={confirming !== null}>
              <CheckCircle className="h-4 w-4" />
              いつもどおりの子をまとめて{isFutureDate ? '確定' : '出席'}
            </Button>
          )}
          {view === 'day' && unrecorded.length > 0 && (
            <Button onClick={markAllPresent} disabled={saving === 'all'}>
              <CheckCircle className="h-4 w-4" />
              未記録を一括出席登録
            </Button>
          )}
        </div>
      </div>

      {/* 過ぎた日で、出席も欠席も付いていない記録（カード3） */}
      {pastUnrecorded.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <p className="font-semibold">
            過ぎた日で、出席も欠席も付いていない記録が {pastUnrecorded.reduce((n, d) => n + d.count, 0)} 件あります（このままだと請求に出ません）
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {pastUnrecorded.map((d) => (
              <Link
                key={d.date}
                href={`/attendance?date=${d.date}`}
                className="rounded-full border border-red-300 bg-white px-2.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                {Number(d.date.slice(5, 7))}/{Number(d.date.slice(8, 10))} {d.count}人
              </Link>
            ))}
          </div>
        </div>
      )}

      {bulkNote && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>{bulkNote}</p>
          <button type="button" onClick={() => setBulkNote(null)} className="text-xs text-amber-700 hover:underline flex-shrink-0">閉じる</button>
        </div>
      )}

      {!canEdit && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          出席管理では、出席・欠席を付けることだけできます。送迎・欠席理由の入力と、利用予定の削除はできません（日々の記録は入力できます）。
        </p>
      )}

      {/* 日付・ユニット選択バー */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <button onClick={() => changeDate(-1)} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const params = new URLSearchParams({ date: e.target.value, unit: selectedUnitId })
              router.push(`/attendance?${params.toString()}`)
            }}
            className="text-sm font-medium text-gray-900 border-none outline-none cursor-pointer"
          />
          <button onClick={() => changeDate(1)} className="p-1 hover:bg-gray-100 rounded">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 flex-wrap flex-1">
          {/* 既定は「すべて」。そこからユニットごとに絞り込む */}
          <button
            onClick={() => changeUnit(ALL_UNITS)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isAllUnits
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            すべて
          </button>
          {units.map((u) => (
            <button
              key={u.id}
              onClick={() => changeUnit(u.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                u.id === selectedUnitId
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {u.name}
            </button>
          ))}
        </div>

        {/* ビュー切替 */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-shrink-0">
          <button
            onClick={() => setView('day')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'day' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            日別
          </button>
          <button
            onClick={() => setView('month')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'month' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            月別
          </button>
        </div>
      </div>

      {/* 月別ビュー */}
      {view === 'month' && (
        <MonthlyAttendanceView
          baseDate={date}
          selectedUnitId={selectedUnitId}
          units={units}
        />
      )}

      {/* 日別ビュー */}
      {view === 'day' && (
        <>
      {/* 統計 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-indigo-600">{attending.length}</div>
            <div className="text-xs text-gray-500 mt-1">出席</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-500">{absent.length}</div>
            <div className="text-xs text-gray-500 mt-1">欠席/キャンセル</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-500">{unrecorded.length}</div>
            <div className="text-xs text-gray-500 mt-1">未記録</div>
          </CardContent>
        </Card>
        <Card className="hidden sm:block">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-700">
              {attending.length}/{capacity || '-'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              定員充足率{isAllUnits ? '（全ユニット）' : ''}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 未記録アラート */}
      {unrecorded.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{unrecorded.length}名の記録が未入力です</span>
        </div>
      )}

      {/* 児童一覧 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">
          利用予定児童一覧{isAllUnits ? '（全ユニット）' : selectedUnit ? `（${selectedUnit.name}）` : ''}
        </h2>
        <div className="space-y-3">
            {resList.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-gray-500 text-center">
                  この日の利用予定はありません
                </CardContent>
              </Card>
            ) : (
              resList.map((res) => {
                const child = res.children
                if (!child) return null
                const att = attOf(res)
                const rowKey = unitChildKey(res.unit_id, child.id)
                const unitName = unitNameById.get(res.unit_id)
                const isPresent = att?.status === 'attended'
                const isAbsent = att?.status === 'absent' || res.status === 'cancel_waiting'
                const isUnrecorded = !att && res.status !== 'cancel_waiting'

                // 送迎・日中一時入力（出席の日と、予定どおりで確定した日）
                const fields = att ? getFields(att) : null
                const isTransportExpanded = !!att && expanded === att.id
                const sched = scheduleDefaultsByKey[rowKey]
                const sourceLabel = sourceLabelOf(sched)
                const confirmedPlan = isConfirmedPlan(att)
                const canConfirm = canEdit && !!sched && isOpenRow(res) && !confirmedPlan

                // 送迎時間の表示（お迎え＝学校などに着く時刻 〜 お送り＝事業所を出る時刻）。
                // 送迎管理の時刻と同じ値を出す（どちらも出発時間の欄。
                // @/lib/schedule-defaults の transportTimeOf）
                const transportStart = fmtTime(transportTimeOf(att?.pickup_departure_time, att?.pickup_arrival_time))
                const transportEnd = fmtTime(transportTimeOf(att?.dropoff_departure_time, att?.dropoff_arrival_time))
                const transportRange =
                  transportStart || transportEnd ? `${transportStart || '—'}〜${transportEnd || '—'}` : ''

                // 日中一時利用の送迎時間
                // 日中一時まで残る児童は放デイ側の送りが空になるため、
                // 実際の最終お送りはこちらに入る
                const daytimeTransportStart = fmtTime(
                  transportTimeOf(att?.daytime_pickup_departure_time, att?.daytime_pickup_arrival_time)
                )
                const daytimeTransportEnd = fmtTime(
                  transportTimeOf(att?.daytime_dropoff_departure_time, att?.daytime_dropoff_arrival_time)
                )
                const daytimeTransportRange =
                  att?.daytime_support && (daytimeTransportStart || daytimeTransportEnd)
                    ? `${daytimeTransportStart || '—'}〜${daytimeTransportEnd || '—'}`
                    : ''

                return (
                  <div key={`${res.unit_id}|${res.id}`}>
                  <Card
                    className={`overflow-hidden ${isUnrecorded ? 'bg-yellow-50' : ''} ${
                      isAbsent ? 'opacity-70' : ''
                    } ${isTransportExpanded ? 'rounded-b-none border-b-0' : ''}`}
                  >
                  <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                    {/* 児童情報 */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                          isPresent
                            ? 'bg-green-100 text-green-700'
                            : isAbsent
                            ? 'bg-red-100 text-red-500'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {child.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/attendance/child/${child.id}`} className="font-medium text-gray-900 hover:text-indigo-600 hover:underline">{child.name}</Link>
                          {/* 「すべて」表示ではどのユニットの子か分かるようにする */}
                          {isAllUnits && unitName && (
                            <Badge variant="secondary" className="text-xs">{unitName}</Badge>
                          )}
                          {child.allergy_info && (
                            <Badge variant="destructive" className="text-xs">アレルギー</Badge>
                          )}
                          {isUnrecorded && (
                            <Badge variant="warning" className="text-xs">未記録</Badge>
                          )}
                          {confirmedPlan && (
                            <Badge variant="secondary" className="text-xs bg-indigo-50 text-indigo-700">予定確定ずみ（出席はまだ）</Badge>
                          )}
                          {pendingContactByChild[child.id] && (
                            <Link
                              href="/parent-contacts"
                              className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                            >
                              保護者の{pendingContactByChild[child.id] === 'absent' ? 'お休み' : '利用'}の連絡（未処理）
                            </Link>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {child.name_kana}
                          {sourceLabel && (
                            <span className={`ml-2 ${sourceLabel === 'いつもどおり' ? 'text-gray-400' : 'text-amber-600 font-medium'}`}>
                              予定の元：{sourceLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 送迎時間（表示のみ・入力は下の「送迎・日中一時入力」から） */}
                    {isPresent && (transportRange || daytimeTransportRange) && (
                      <div className="flex flex-col gap-0.5">
                        {transportRange && (
                          <div
                            className="flex items-center gap-1.5 text-xs"
                            title="お迎え＝学校などに着く時刻〜お送り＝事業所を出る時刻（送迎管理の時刻と同じ）"
                          >
                            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-500 w-16 flex-shrink-0">送迎時間</span>
                            <span className="text-gray-700">{transportRange}</span>
                          </div>
                        )}
                        {daytimeTransportRange && (
                          <div
                            className="flex items-center gap-1.5 text-xs"
                            title="日中一時利用のお迎え（学校などに着く時刻）〜お送り（事業所を出る時刻）"
                          >
                            <Clock className="h-4 w-4 text-purple-400 flex-shrink-0" />
                            <span className="text-purple-600 w-16 flex-shrink-0">日中一時</span>
                            <span className="text-gray-700">{daytimeTransportRange}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 出席/欠席ボタン */}
                    <div className="flex items-center gap-2">
                      {canConfirm && (
                        <button
                          onClick={() => confirmAsScheduled(res)}
                          disabled={confirming === rowKey}
                          title={isFutureDate
                            ? '予定の時刻・送迎を保存します。出席の実績にはなりません'
                            : '予定の時刻・送迎で出席にします'}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                        >
                          {confirming === rowKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                          {isFutureDate ? '予定どおりで確定' : '予定どおり出席'}
                        </button>
                      )}
                      {res.status !== 'cancel_waiting' && (
                        <>
                          <button
                            onClick={() => isPresent
                              ? (canEdit ? cancelAttendance(res.unit_id, child.id) : undefined)
                              : upsertAttendance(res.unit_id, child.id, { status: 'attended' })}
                            disabled={saving === rowKey}
                            title={isPresent
                              ? (canEdit ? 'もう一度押すと取り消し' : '出席の取り消しはシステム管理者だけができます')
                              : '出席にする'}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              isPresent
                                ? 'bg-green-500 text-white hover:bg-green-600'
                                : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700'
                            }`}
                          >
                            <CheckCircle className="h-4 w-4" />
                            出席
                          </button>
                          <button
                            onClick={() => upsertAttendance(res.unit_id, child.id, { status: 'absent' })}
                            disabled={saving === rowKey}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              isAbsent && res.status !== 'cancel_waiting'
                                ? 'bg-red-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-700'
                            }`}
                          >
                            <XCircle className="h-4 w-4" />
                            欠席
                          </button>
                        </>
                      )}

                      {res.status === 'cancel_waiting' && (
                        <Badge variant="secondary">キャンセル待ち</Badge>
                      )}

                      {/* 記録ページへのリンク */}
                      {isPresent && (
                        <Link
                          href={`/records/${child.id}?date=${date}&unit=${res.unit_id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                        >
                          <ClipboardEdit className="h-4 w-4" />
                          記録
                        </Link>
                      )}

                      {/* 利用予定ごと削除（誤って予定に入れた児童を一覧から消す） */}
                      {canEdit && (
                      <button
                        onClick={() => setConfirmDelete(res)}
                        disabled={deleting === rowKey}
                        title="この日の利用予定を削除（欠席にするのではなく、一覧から消して未登録に戻す）"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {deleting === rowKey
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </button>
                      )}
                    </div>
                  </CardContent>

                    {/* 欠席理由（欠席にした児童のみ） */}
                    {att?.status === 'absent' && res.status !== 'cancel_waiting' && (
                      <div className="border-t border-red-100 bg-red-50/50 px-4 py-2.5">
                        <fieldset disabled={!canEdit} className="contents">
                          <AbsenceReasonInput
                            value={att.absence_reason}
                            onSave={(reason) => saveAbsenceReason(att.id, reason)}
                          />
                        </fieldset>
                      </div>
                    )}

                    {/* 送迎・日中一時入力トグル（日々の記録と同じUI） */}
                    {(isPresent || confirmedPlan) && att && fields && (
                      <TransportDaytimeToggle
                        expanded={isTransportExpanded}
                        onToggle={() => setExpanded(isTransportExpanded ? null : att.id)}
                        fields={fields}
                        isSchedulePreset={isSchedulePreset(att)}
                      />
                    )}
                  </Card>

                  {/* 展開された入力エリア */}
                  {isTransportExpanded && att && fields && (
                    <Card className="rounded-t-none border-t-0">
                      <CardContent className="p-4">
                        <fieldset disabled={!canEdit} className="contents">
                        {detailOpen.has(att.id) ? (
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={() => setDetailOpen((p) => { const n = new Set(p); n.delete(att.id); return n })}
                              className="text-xs font-medium text-indigo-700 hover:underline"
                            >
                              ← かんたん入力に戻る
                            </button>
                            <TransportDaytimePanel
                              fields={fields}
                              onChange={(patch) => setField(att, patch)}
                              staffMembers={staffMembers}
                              vehicles={vehicles}
                              defaultServiceEndTime={defaultServiceEndTime}
                              isSchedulePreset={isSchedulePreset(att)}
                              previousDate={prevByChildId[child.id]?.date ?? null}
                              onCopyPrevious={() => handleCopyPrevious(att)}
                              onSave={() => handleSaveTransport(att)}
                              saving={transportSaving === att.id}
                              saved={transportSavedIds.has(att.id)}
                            />
                          </div>
                        ) : (
                          <EasyAttendancePanel
                            fields={fields}
                            onChange={(next) => setFieldStates((prev) => ({ ...prev, [att.id]: next }))}
                            schedule={sched}
                            staffMembers={staffMembers}
                            vehicles={vehicles}
                            defaultServiceEndTime={defaultServiceEndTime}
                            defaultSwitchTime={switchOf(child.id)}
                            approvedKind={kindOfServiceType(approvedServiceTypeByChild[child.id])}
                            onSave={() => handleSaveTransport(att)}
                            saving={transportSaving === att.id}
                            saved={transportSavedIds.has(att.id)}
                            detailOpen={false}
                            onOpenDetail={() => setDetailOpen((p) => new Set(p).add(att.id))}
                          />
                        )}
                        </fieldset>
                      </CardContent>
                    </Card>
                  )}
                  </div>
                )
              })
            )}
        </div>
      </div>
        </>
      )}

      {/* ── 利用予定の削除確認ダイアログ ─────────────────────── */}
      {confirmDelete && (() => {
        const childName = confirmDelete.children?.name ?? 'この児童'
        const isDeleting = deleting === unitChildKey(confirmDelete.unit_id, confirmDelete.child_id)
        const hasAttendance = !!attOf(confirmDelete)
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => { if (!isDeleting) setConfirmDelete(null) }}
          >
            <div
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-red-50 flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900">
                    {formatDate(date)}の{childName}さんの利用予定を削除します
                  </h3>
                  <p className="text-sm text-red-700 font-medium mt-2 leading-relaxed">
                    これは「欠席」にする操作ではありません。<br />
                    <span className="underline">利用予定そのものが削除され</span>、一覧から消えて記録がなかった状態に戻ります。
                  </p>
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                <li>・この日の利用予定（予約）を削除します</li>
                {hasAttendance && <li>・出席／欠席の記録と、支援記録・活動記録も削除します</li>}
                <li>・毎週の利用計画がある場合も、この日だけ利用なしにします</li>
                <li>・この日の送迎予定からも外します</li>
                <li>・国保連請求の対象からも外れます</li>
              </ul>

              <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                削除すると元に戻せません。実際に利用予定があってお休みした場合（欠席時対応加算を算定する場合など）は「いいえ」を選び、「欠席」ボタンを使ってください。
              </p>

              <p className="mt-4 text-sm font-semibold text-gray-900 text-center">
                削除してもよろしいですか？
              </p>

              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isDeleting}
                  onClick={() => setConfirmDelete(null)}
                >
                  いいえ
                </Button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => deleteReservation(confirmDelete)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                  はい、削除する
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
