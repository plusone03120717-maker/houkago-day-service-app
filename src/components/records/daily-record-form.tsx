'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileText,
  BookOpen,
  Sparkles,
  Wand2,
  Save,
  CheckCircle,
  Pill,
  Car,
  Bot,
} from 'lucide-react'
import { MedicationLogForm } from '@/components/medications/medication-log-form'
import { formatDate } from '@/lib/utils'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { DEFAULT_PARTICIPATION_PROGRAM_NAMES, isDefaultParticipationChild } from '@/lib/billing/default-activities'

type Child = {
  id: string
  name: string
  name_kana: string | null
  photo_url: string | null
  allergy_info: string | null
  medical_info: string | null
  disability_type: string | null
  service_type: string | null
}

type Attendance = {
  id: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  pickup_type: string
  service_start_time: string | null
  service_end_time: string | null
  basic_service: boolean
  daytime_support: boolean
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
}

type Program = {
  id: string
  name: string
  category: string | null
}

type Activity = {
  id: string
  attendance_id: string
  program_id: string | null
  participated: boolean
  achievement_level: number | null
  evaluation_notes: string | null
  activity_programs: Program | null
}

type DailyRecord = {
  id: string
  record_type: string
  content: string
  has_notable_flag: boolean
}

type ContactNote = {
  id: string
  content: string
  ai_generated: boolean
  published_at: string | null
}

type Medication = {
  id: string
  medication_name: string
  dosage: string
  timing: string
}

type MedicationLog = {
  id: string
  medication_id: string
  log_date: string
  status: string
  notes: string | null
  administered_at: string | null
}

interface Props {
  child: Child
  attendance: Attendance | null
  date: string
  unitId: string
  dailyRecords: DailyRecord[]
  activities: Activity[]
  programs: Program[]
  contactNote: ContactNote | null
  staffId: string
  medications: Medication[]
  medicationLogs: MedicationLog[]
  isSchoolHoliday: boolean
  defaultServiceEndTime: string
  holidayServiceEndTime: string
  /** 連絡帳の本文を書けるか。システム管理者だけ true（施設長・スタッフは見るだけ・2026-11-12 依頼主） */
  canEditContactNote?: boolean
  /** 日中一時の有無と利用時間を変えられるか。システム管理者だけ true（施設長・スタッフは見るだけ・2026-11-12 依頼主） */
  canEditAttendance?: boolean
  /** 保存していない入力があるかを外へ知らせる（1画面で全員分の左の一覧が、子を変える前に聞くのに使う） */
  onDirtyChange?: (dirty: boolean) => void
  /** 「保存して次の未記録の子へ」を押して保存できたあとに呼ぶ。渡さなければボタンを出さない */
  onSaveNext?: () => void
  /** 次の未記録の子の名前（ボタンに出す）。いなければ null */
  nextName?: string | null
  /** 帯に出す「3人目 / 6名」など */
  positionLabel?: string
}


export function DailyRecordForm({
  child,
  attendance,
  date,
  unitId,
  dailyRecords,
  activities,
  programs,
  contactNote: initialContactNote,
  staffId,
  medications,
  medicationLogs,
  isSchoolHoliday,
  defaultServiceEndTime,
  holidayServiceEndTime,
  canEditContactNote = true,
  canEditAttendance = true,
  onDirtyChange,
  onSaveNext,
  nextName,
  positionLabel,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [dailyContent, setDailyContent] = useState(
    dailyRecords.find((r) => r.record_type === 'daily_record')?.content ?? ''
  )
  const [notableContent, setNotableContent] = useState(
    dailyRecords.find((r) => r.record_type === 'notable')?.content ?? ''
  )
  const [hasNotable, setHasNotable] = useState(
    dailyRecords.some((r) => r.has_notable_flag)
  )
  const [activityNotes, setActivityNotes] = useState<Record<string, string>>(
    Object.fromEntries(activities.map((a) => [a.program_id ?? '', a.evaluation_notes ?? '']))
  )
  // 放デイの児童が出席した日は おやつ・学習教材 を既定でチェック済みにする（記録済みの日は、その内容のまま）
  // 児発の児童は既定のチェックなし
  const usesDefaultPrograms = attendance?.status === 'attended' && isDefaultParticipationChild(child.service_type)
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>(() => {
    const saved = activities.filter((a) => a.participated).map((a) => a.program_id ?? '').filter(Boolean)
    if (!usesDefaultPrograms) return saved
    const recorded = new Set(activities.map((a) => a.program_id))
    const defaults = programs
      .filter((p) => DEFAULT_PARTICIPATION_PROGRAM_NAMES.includes(p.name) && !recorded.has(p.id))
      .map((p) => p.id)
    return [...saved, ...defaults]
  })
  const [contactNoteContent, setContactNoteContent] = useState(initialContactNote?.content ?? '')
  const [aiLoading, setAiLoading] = useState(false)
  const [refineLoading, setRefineLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // メモ（箇条書き）は保存の対象ではないので、書きかけをこの端末に残しておく（子ども＋日付ごと）。
  // 以前はページを離れると消えていた
  const memoKey = `daily-memo:${child.id}:${date}`
  const [bulletPoints, setBulletPointsState] = useState(() => {
    if (typeof window === 'undefined') return ''
    try { return window.localStorage.getItem(memoKey) ?? '' } catch { return '' }
  })
  const setBulletPoints = (v: string) => {
    setBulletPointsState(v)
    try {
      if (v) window.localStorage.setItem(memoKey, v)
      else window.localStorage.removeItem(memoKey)
    } catch { /* 残せなくても入力はできる */ }
  }
  const clearMemoDraft = () => {
    try { window.localStorage.removeItem(memoKey) } catch { /* なにもしない */ }
  }
  const [saveError, setSaveError] = useState<string | null>(null)
  // 特記を消すかを聞いた答え（handleSave の中で使う）
  const lastConfirm = useRef(false)
  const [generatingDaily, setGeneratingDaily] = useState(false)
  const [refiningNotable, setRefiningNotable] = useState(false)

  // 日中一時利用
  const [daytimeSupport, setDaytimeSupport] = useState(attendance?.daytime_support ?? false)
  const [daytimeSupportStartTime, setDaytimeSupportStartTime] = useState(attendance?.daytime_support_start_time?.slice(0, 5) ?? '')
  const [daytimeSupportEndTime, setDaytimeSupportEndTime] = useState(attendance?.daytime_support_end_time?.slice(0, 5) ?? '')

  // ── 保存していない入力があるか ──
  // 保存の対象（日常記録・特記・活動・日中一時・連絡帳）を、開いたとき（保存したとき）の中身と比べる。
  // メモ（箇条書き）は端末に下書きで残るので数えない
  const snapshotOf = () => JSON.stringify([
    dailyContent, hasNotable ? notableContent : '', hasNotable,
    [...selectedPrograms].sort(), Object.entries(activityNotes).filter(([, v]) => v).sort(),
    contactNoteContent, daytimeSupport, daytimeSupportStartTime, daytimeSupportEndTime,
  ])
  const [savedSnapshot, setSavedSnapshot] = useState(snapshotOf)
  const dirty = snapshotOf() !== savedSnapshot
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  // ── 活動は「いつもどおり」なら1行にたたむ（施設長への提案の4） ──
  // いつもどおり＝既定の活動（おやつ・学習教材）だけにチェックがあり、コメントが無い
  const defaultProgramIds = useMemo(
    () => programs.filter((p) => DEFAULT_PARTICIPATION_PROGRAM_NAMES.includes(p.name)).map((p) => p.id).sort(),
    [programs]
  )
  const isUsualActivities =
    usesDefaultPrograms &&
    JSON.stringify([...selectedPrograms].sort()) === JSON.stringify(defaultProgramIds) &&
    selectedPrograms.every((id) => !activityNotes[id])
  const [activitiesOpen, setActivitiesOpen] = useState(!isUsualActivities)

  const generateDailyRecord = async () => {
    if (!bulletPoints.trim()) return
    setGeneratingDaily(true)
    try {
      const res = await fetch('/api/daily-records/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId: child.id,
          bulletPoints,
          activities: selectedPrograms.map((pid) => ({
            name: programs.find((p) => p.id === pid)?.name ?? '',
            notes: activityNotes[pid] ?? '',
          })),
        }),
      })
      const data = await res.json()
      if (data.content) setDailyContent(data.content)
    } finally {
      setGeneratingDaily(false)
    }
  }

  const refineNotableRecord = async () => {
    if (!notableContent.trim()) return
    setRefiningNotable(true)
    try {
      const res = await fetch('/api/support-plans/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldType: 'notable_record', content: notableContent }),
      })
      const data = await res.json()
      if (data.refined) setNotableContent(data.refined)
    } finally {
      setRefiningNotable(false)
    }
  }

  const toggleProgram = (programId: string) => {
    setSelectedPrograms((prev) =>
      prev.includes(programId) ? prev.filter((id) => id !== programId) : [...prev, programId]
    )
  }

  const refineContactNote = async () => {
    if (!contactNoteContent.trim()) return
    setRefineLoading(true)
    try {
      const res = await fetch('/api/contact-notes/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contactNoteContent }),
      })
      const data = await res.json()
      if (data.refined) setContactNoteContent(data.refined)
    } finally {
      setRefineLoading(false)
    }
  }

  const generateAiDraft = async () => {
    if (!attendance) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/contact-notes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId: child.id,
          date,
          childName: child.name,
          dailyRecord: dailyContent,
          notableRecord: hasNotable ? notableContent : '',
          activities: selectedPrograms.map((pid) => ({
            name: programs.find((p) => p.id === pid)?.name ?? '',
            notes: activityNotes[pid] ?? '',
          })),
          attendance: attendance ? {
            checkInTime: attendance.check_in_time,
            checkOutTime: attendance.check_out_time,
          } : null,
        }),
      })
      const data = await res.json()
      if (data.draft) setContactNoteContent(data.draft)
    } finally {
      setAiLoading(false)
    }
  }

  const handleSave = async (): Promise<boolean> => {
    if (!attendance) return false

    // 特記のチェックを外した（または本文を空にした）ときは、前の特記を消すかをその場で聞く。
    // 以前は何もせず、取り消したつもりの特記が残っていた
    const existingNotable = dailyRecords.find((r) => r.record_type === 'notable')
    const removeNotable = !!existingNotable && !(hasNotable && notableContent.trim())
    lastConfirm.current = removeNotable
      ? window.confirm('前に保存した特記を消しますか？\n「キャンセル」なら特記は残したまま、ほかの内容を保存します。')
      : false
    const confirmedRemoveNotable = removeNotable && lastConfirm.current

    setSaving(true)
    setSaveError(null)
    // どの保存でも、失敗したら覚えておく（以前は結果を見ず、失敗しても「保存しました」と出ていた）
    const errors: string[] = []
    const check = (label: string, res: { error: { message: string } | null }) => {
      if (res.error) errors.push(`${label}：${res.error.message}`)
    }

    const existingDaily = dailyRecords.find((r) => r.record_type === 'daily_record')
    if (dailyContent) {
      if (existingDaily) {
        check('日常記録', await supabase
          .from('daily_records')
          .update({ content: dailyContent, has_notable_flag: false })
          .eq('id', existingDaily.id))
      } else {
        check('日常記録', await supabase.from('daily_records').insert({
          attendance_id: attendance.id,
          record_type: 'daily_record',
          content: dailyContent,
          has_notable_flag: false,
          created_by: staffId,
        }))
      }
    }

    if (hasNotable && notableContent.trim()) {
      if (existingNotable) {
        check('特記', await supabase
          .from('daily_records')
          .update({ content: notableContent, has_notable_flag: true })
          .eq('id', existingNotable.id))
      } else {
        check('特記', await supabase.from('daily_records').insert({
          attendance_id: attendance.id,
          record_type: 'notable',
          content: notableContent,
          has_notable_flag: true,
          created_by: staffId,
        }))
      }
    } else if (confirmedRemoveNotable && existingNotable) {
      check('特記の削除', await supabase.from('daily_records').delete().eq('id', existingNotable.id))
    }

    for (const programId of selectedPrograms) {
      const existing = activities.find((a) => a.program_id === programId)
      if (existing) {
        check('活動記録', await supabase
          .from('daily_activities')
          .update({
            participated: true,
            achievement_level: null,
            evaluation_notes: activityNotes[programId] ?? null,
          })
          .eq('id', existing.id))
      } else {
        check('活動記録', await supabase.from('daily_activities').insert({
          attendance_id: attendance.id,
          program_id: programId,
          participated: true,
          achievement_level: null,
          evaluation_notes: activityNotes[programId] ?? null,
        }))
      }
    }

    // チェックを外した活動は「参加なし」にする。おやつ・学習教材は既定で参加扱いなので、
    // 記録のない状態から外した場合も「参加なし」の行を残す（残さないと既定の参加に戻ってしまう）
    for (const prog of programs) {
      if (selectedPrograms.includes(prog.id)) continue
      const existing = activities.find((a) => a.program_id === prog.id)
      if (existing) {
        if (existing.participated) {
          check('活動記録', await supabase.from('daily_activities').update({ participated: false }).eq('id', existing.id))
        }
      } else if (usesDefaultPrograms && DEFAULT_PARTICIPATION_PROGRAM_NAMES.includes(prog.name)) {
        check('活動記録', await supabase.from('daily_activities').insert({
          attendance_id: attendance.id,
          program_id: prog.id,
          participated: false,
        }))
      }
    }

    // 日中一時利用の利用時間のみ保存（送迎は一覧側で管理）。
    // 施設長・スタッフは見るだけなので、出欠の行には触れない
    if (canEditAttendance) {
      check('日中一時', await supabase
        .from('daily_attendance')
        .update({
          daytime_support: daytimeSupport,
          daytime_support_start_time: daytimeSupport ? (daytimeSupportStartTime || null) : null,
          daytime_support_end_time: daytimeSupport ? (daytimeSupportEndTime || null) : null,
        })
        .eq('id', attendance.id))
    }

    // 連絡帳はシステム管理者だけが書く（施設長・スタッフの保存では連絡帳に触れない）
    if (canEditContactNote && contactNoteContent) {
      if (initialContactNote) {
        check('連絡帳', await supabase
          .from('contact_notes')
          .update({ content: contactNoteContent })
          .eq('id', initialContactNote.id))
      } else {
        check('連絡帳', await supabase.from('contact_notes').insert({
          attendance_id: attendance.id,
          child_id: child.id,
          date,
          unit_id: unitId,
          content: contactNoteContent,
          staff_id: staffId,
        }))
      }
    }

    setSaving(false)
    if (errors.length > 0) {
      // 失敗したら「保存しました」は出さず、入力は残したまま赤で知らせる
      setSaveError(errors.join('\n'))
      startTransition(() => router.refresh())
      return false
    }
    clearMemoDraft()
    // 保存できた中身を「保存ずみ」にする（これで子を変えても聞かれない）
    setSavedSnapshot(snapshotOf())
    onDirtyChange?.(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    startTransition(() => router.refresh())
    return true
  }

  const handleSaveNext = async () => {
    const ok = await handleSave()
    if (ok) onSaveNext?.()
  }

  const programsByCategory = programs.reduce<Record<string, Program[]>>((acc, p) => {
    const cat = p.category ?? 'その他'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* 戻るボタン・ヘッダー */}
      <div className="flex items-center gap-3">
        <Link
          href={`/records?date=${date}`}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{child.name} さんの記録</h1>
          <p className="text-sm text-gray-500">{formatDate(date, 'yyyy年MM月dd日')}</p>
        </div>
      </div>

      {/* 書いている子の名前と日付を、いつも上に出す（取り違えを防ぐ） */}
      <div
        className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-2 border-indigo-500 bg-indigo-50 px-4 py-2"
        data-testid="record-band"
      >
        <span className="text-lg font-black text-gray-900">{child.name} さん</span>
        <span className="text-sm font-semibold text-indigo-800">{formatDate(date, 'MM/dd')}</span>
        {positionLabel && <span className="text-xs font-medium text-indigo-700">{positionLabel}</span>}
        {attendance && (
          <span className="ml-auto text-xs text-indigo-700">
            送迎 {({ both: '行き帰り', pickup_only: '行きだけ', dropoff_only: '帰りだけ', none: 'なし' } as Record<string, string>)[attendance.pickup_type] ?? 'なし'}
            {attendance.daytime_support ? '・日中一時あり' : ''}
          </span>
        )}
        {dirty && <span className="w-full text-[11px] font-semibold text-amber-700">保存していない入力があります</span>}
      </div>

      {/* 基本情報 */}
      {(child.allergy_info || child.medical_info) && (
        <div className="flex gap-2 flex-wrap">
          {child.allergy_info && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle className="h-4 w-4" />
              アレルギー: {child.allergy_info}
            </div>
          )}
          {child.medical_info && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              医療的ケア: {child.medical_info}
            </div>
          )}
        </div>
      )}

      {!attendance && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          出席記録がありません。先に出席登録してください。
        </div>
      )}

      {/* 日中一時利用（利用時間のみ）。施設長・スタッフは見るだけ */}
      <fieldset disabled={!canEditAttendance} className="min-w-0">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={daytimeSupport}
                onChange={(e) => setDaytimeSupport(e.target.checked)}
                className="w-4 h-4 accent-purple-600"
                disabled={!attendance}
              />
              <Car className="h-5 w-5 text-purple-500" />
              日中一時利用
            </label>
          </CardTitle>
        </CardHeader>
        {daytimeSupport && (
          <CardContent className="space-y-3">
            <p className="text-xs font-semibold text-gray-500">利用時間</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">開始時間</label>
                <input
                  type="time"
                  value={daytimeSupportStartTime}
                  onChange={(e) => setDaytimeSupportStartTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">終了時間</label>
                <input
                  type="time"
                  value={daytimeSupportEndTime}
                  onChange={(e) => setDaytimeSupportEndTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              {canEditAttendance
                ? '※ 送迎時間の入力は「日々の記録」一覧の送迎入力から行ってください'
                : '※ 日中一時の有無と利用時間は見るだけです。変えるのはシステム管理者です'}
            </p>
          </CardContent>
        )}
      </Card>
      </fieldset>

      {/* 活動プログラム */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5 text-indigo-500" />
            活動記録
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!activitiesOpen && (
            <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="activities-usual">
              <span className="text-gray-600">いつもどおり：</span>
              {selectedPrograms.map((pid) => (
                <span key={pid} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  {programs.find((p) => p.id === pid)?.name}
                </span>
              ))}
              <button
                type="button"
                onClick={() => setActivitiesOpen(true)}
                className="ml-auto text-xs font-medium text-indigo-700 hover:underline"
              >
                変える
              </button>
            </div>
          )}
          {activitiesOpen && Object.entries(programsByCategory).map(([category, progs]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{category}</p>
              <div className="space-y-2">
                {progs.map((prog) => {
                  const selected = selectedPrograms.includes(prog.id)
                  return (
                    <div key={prog.id} className={`rounded-lg border p-3 transition-colors ${selected ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`prog-${prog.id}`}
                          checked={selected}
                          onChange={() => toggleProgram(prog.id)}
                          className="w-4 h-4 accent-indigo-600"
                        />
                        <label htmlFor={`prog-${prog.id}`} className="flex-1 text-sm font-medium cursor-pointer">
                          {prog.name}
                        </label>
                      </div>
                      {selected && (
                        <input
                          type="text"
                          placeholder="コメント（任意）"
                          value={activityNotes[prog.id] ?? ''}
                          onChange={(e) => setActivityNotes((prev) => ({ ...prev, [prog.id]: e.target.value }))}
                          className="mt-2 w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {activitiesOpen && programs.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              活動プログラムがまだ登録されていません
            </p>
          )}
        </CardContent>
      </Card>

      {/* 日常記録 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-green-500" />
            日常記録
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 space-y-2">
            <p className="text-xs font-medium text-indigo-700 flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              箇条書きから文章を生成（個別支援計画と照合）
            </p>
            <AutoTextarea
              value={bulletPoints}
              onChange={(e) => setBulletPoints(e.target.value)}
              placeholder={"・〇〇に積極的に取り組んだ\n・△△で支援が必要だった\n・□□ができるようになった"}
              minRows={3}
              className="w-full text-sm leading-relaxed border border-indigo-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={generateDailyRecord}
              disabled={generatingDaily || !bulletPoints.trim()}
              className="text-indigo-600 border-indigo-300 hover:bg-indigo-100"
            >
              <Bot className="h-3.5 w-3.5" />
              {generatingDaily ? 'AI生成中...' : 'AI文章生成'}
            </Button>
          </div>

          <AutoTextarea
            value={dailyContent}
            onChange={(e) => setDailyContent(e.target.value)}
            placeholder="本日の様子、活動内容、気づいたことなどを記入してください..."
            minRows={4}
            className="w-full text-sm leading-relaxed border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasNotable}
                onChange={(e) => setHasNotable(e.target.checked)}
                className="w-4 h-4 accent-red-500"
              />
              <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                <AlertTriangle className="h-4 w-4" />
                特記事項あり
              </span>
            </label>
            {hasNotable && (
              <div className="mt-2 space-y-1.5">
                <AutoTextarea
                  value={notableContent}
                  onChange={(e) => setNotableContent(e.target.value)}
                  placeholder="特記事項の内容（保護者への報告・ヒヤリハット・体調異変など）"
                  minRows={3}
                  className="w-full text-sm leading-relaxed border border-red-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400 bg-red-50"
                />
                <button
                  type="button"
                  onClick={refineNotableRecord}
                  disabled={refiningNotable || !notableContent.trim()}
                  className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Wand2 className="h-3 w-3" />
                  {refiningNotable ? '整えています...' : '文章を整える'}
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 服薬記録 */}
      {medications.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Pill className="h-5 w-5 text-green-500" />
              与薬記録
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MedicationLogForm
              childId={child.id}
              medications={medications}
              todayLogs={medicationLogs}
              today={date}
            />
          </CardContent>
        </Card>
      )}

      {/* 連絡帳 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-purple-500" />
              連絡帳
            </CardTitle>
            {canEditContactNote && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={generateAiDraft}
                disabled={aiLoading || refineLoading || !attendance}
                className="text-purple-600 border-purple-200 hover:bg-purple-50"
              >
                <Sparkles className="h-4 w-4" />
                {aiLoading ? 'AI生成中...' : 'AIで下書き生成'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={refineContactNote}
                disabled={refineLoading || aiLoading || !contactNoteContent.trim()}
                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                <Wand2 className="h-4 w-4" />
                {refineLoading ? '整えています...' : '文章を整える'}
              </Button>
            </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {canEditContactNote ? (
            <>
              <AutoTextarea
                value={contactNoteContent}
                onChange={(e) => setContactNoteContent(e.target.value)}
                placeholder="保護者へのメッセージを入力してください..."
                minRows={5}
                className="w-full text-sm leading-relaxed border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                ※ AI生成後、内容を確認・編集してから保存してください
              </p>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 min-h-[3rem]">
                {contactNoteContent || 'まだ書かれていません'}
              </p>
              <p className="text-xs text-gray-400 mt-1.5">
                連絡帳は見るだけです。書く・直すのはシステム管理者が行います。
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* 保存に失敗したとき（入力は残っているので、もう一度保存できる） */}
      {saveError && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-bold">保存できていない内容があります。もう一度「記録を保存」を押してください。</p>
          <p className="mt-1 whitespace-pre-line text-xs text-red-700">{saveError}</p>
        </div>
      )}

      {/* 保存ボタン */}
      <div className="flex flex-wrap justify-end gap-3 pb-6">
        <Button
          variant={onSaveNext ? 'outline' : undefined}
          onClick={() => { void handleSave() }}
          disabled={saving || !attendance}
          className="px-8"
        >
          {saved ? (
            <>
              <CheckCircle className="h-4 w-4" />
              保存しました
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {saving ? '保存中...' : onSaveNext ? '保存だけ' : '記録を保存'}
            </>
          )}
        </Button>
        {onSaveNext && (
          <Button onClick={() => { void handleSaveNext() }} disabled={saving || !attendance} className="px-6">
            {nextName ? `保存して次の未記録の子へ（${nextName}さん）` : '保存して一覧へ（全員済み）'}
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
