'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  AlertTriangle,
  FileText,
  BookOpen,
  Sparkles,
  Wand2,
  Save,
  CheckCircle,
  Pill,
  Car,
} from 'lucide-react'
import { MedicationLogForm } from '@/components/medications/medication-log-form'
import { formatDate } from '@/lib/utils'

type Child = {
  id: string
  name: string
  name_kana: string | null
  photo_url: string | null
  allergy_info: string | null
  medical_info: string | null
  disability_type: string | null
}

type Attendance = {
  id: string
  check_in_time: string | null
  check_out_time: string | null
  body_temperature: number | null
  pickup_type: string
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
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
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>(
    activities.filter((a) => a.participated).map((a) => a.program_id ?? '').filter(Boolean)
  )
  const [contactNoteContent, setContactNoteContent] = useState(initialContactNote?.content ?? '')
  const [aiLoading, setAiLoading] = useState(false)
  const [refineLoading, setRefineLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 送迎時間
  const [pickupDepartureTime, setPickupDepartureTime] = useState(attendance?.pickup_departure_time?.slice(0, 5) ?? '')
  const [pickupArrivalTime, setPickupArrivalTime] = useState(attendance?.pickup_arrival_time?.slice(0, 5) ?? '')
  const [dropoffDepartureTime, setDropoffDepartureTime] = useState(attendance?.dropoff_departure_time?.slice(0, 5) ?? '')
  const [dropoffArrivalTime, setDropoffArrivalTime] = useState(attendance?.dropoff_arrival_time?.slice(0, 5) ?? '')

  // "HH:MM" に分を加減算して "HH:MM" を返す
  const addMinutes = (hhmm: string, minutes: number): string => {
    const [h, m] = hhmm.split(':').map(Number)
    const total = h * 60 + m + minutes
    const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60)
    const mm = ((total % 1440) + 1440) % 1440 % 60
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  const handlePickupDepartureChange = (val: string) => {
    setPickupDepartureTime(val)
    if (val && !pickupArrivalTime) setPickupArrivalTime(addMinutes(val, 10))
  }

  const handleDropoffArrivalChange = (val: string) => {
    setDropoffArrivalTime(val)
    if (val && !dropoffDepartureTime) setDropoffDepartureTime(addMinutes(val, -10))
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
            bodyTemperature: attendance.body_temperature,
          } : null,
        }),
      })
      const data = await res.json()
      if (data.draft) setContactNoteContent(data.draft)
    } finally {
      setAiLoading(false)
    }
  }

  const handleSave = async () => {
    if (!attendance) return
    setSaving(true)

    // 日常記録を保存
    const existingDaily = dailyRecords.find((r) => r.record_type === 'daily_record')
    if (dailyContent) {
      if (existingDaily) {
        await supabase
          .from('daily_records')
          .update({ content: dailyContent, has_notable_flag: false })
          .eq('id', existingDaily.id)
      } else {
        await supabase.from('daily_records').insert({
          attendance_id: attendance.id,
          record_type: 'daily_record',
          content: dailyContent,
          has_notable_flag: false,
          created_by: staffId,
        })
      }
    }

    // 特記事項を保存
    const existingNotable = dailyRecords.find((r) => r.record_type === 'notable')
    if (hasNotable && notableContent) {
      if (existingNotable) {
        await supabase
          .from('daily_records')
          .update({ content: notableContent, has_notable_flag: true })
          .eq('id', existingNotable.id)
      } else {
        await supabase.from('daily_records').insert({
          attendance_id: attendance.id,
          record_type: 'notable',
          content: notableContent,
          has_notable_flag: true,
          created_by: staffId,
        })
      }
    }

    // 活動記録を保存
    for (const programId of selectedPrograms) {
      const existing = activities.find((a) => a.program_id === programId)
      if (existing) {
        await supabase
          .from('daily_activities')
          .update({
            participated: true,
            achievement_level: null,
            evaluation_notes: activityNotes[programId] ?? null,
          })
          .eq('id', existing.id)
      } else {
        await supabase.from('daily_activities').insert({
          attendance_id: attendance.id,
          program_id: programId,
          participated: true,
          achievement_level: null,
          evaluation_notes: activityNotes[programId] ?? null,
        })
      }
    }

    // 送迎時間を保存
    await supabase
      .from('daily_attendance')
      .update({
        pickup_departure_time: pickupDepartureTime || null,
        pickup_arrival_time: pickupArrivalTime || null,
        dropoff_departure_time: dropoffDepartureTime || null,
        dropoff_arrival_time: dropoffArrivalTime || null,
      })
      .eq('id', attendance.id)

    // 連絡帳を保存
    if (contactNoteContent) {
      if (initialContactNote) {
        await supabase
          .from('contact_notes')
          .update({ content: contactNoteContent })
          .eq('id', initialContactNote.id)
      } else {
        await supabase.from('contact_notes').insert({
          attendance_id: attendance.id,
          child_id: child.id,
          date,
          unit_id: unitId,
          content: contactNoteContent,
          staff_id: staffId,
        })
      }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    startTransition(() => router.refresh())
  }

  // プログラムをカテゴリごとにグルーピング
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
          href={`/attendance?date=${date}&unit=${unitId}`}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{child.name} さんの記録</h1>
          <p className="text-sm text-gray-500">{formatDate(date, 'yyyy年MM月dd日')}</p>
        </div>
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

      {/* 活動プログラム */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5 text-indigo-500" />
            活動記録
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(programsByCategory).map(([category, progs]) => (
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
          {programs.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              活動プログラムがまだ登録されていません
            </p>
          )}
        </CardContent>
      </Card>

      {/* 送迎時間 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Car className="h-5 w-5 text-teal-500" />
            送迎時間
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* お迎え */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">お迎え</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">お迎えに行った時間</label>
                <input
                  type="time"
                  value={pickupDepartureTime}
                  onChange={(e) => handlePickupDepartureChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">事務所に到着した時間</label>
                <input
                  type="time"
                  value={pickupArrivalTime}
                  onChange={(e) => setPickupArrivalTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">※ お迎え時間を入力すると事務所到着時間を10分後で自動入力します</p>
          </div>

          {/* 送り */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">送り</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">事務所を出た時間</label>
                <input
                  type="time"
                  value={dropoffDepartureTime}
                  onChange={(e) => setDropoffDepartureTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">自宅に到着した時間</label>
                <input
                  type="time"
                  value={dropoffArrivalTime}
                  onChange={(e) => handleDropoffArrivalChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">※ 自宅到着時間を入力すると事務所出発時間を10分前で自動入力します</p>
          </div>
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
          <textarea
            value={dailyContent}
            onChange={(e) => setDailyContent(e.target.value)}
            placeholder="本日の様子、活動内容、気づいたことなどを記入してください..."
            rows={4}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />

          {/* 特記事項 */}
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
              <textarea
                value={notableContent}
                onChange={(e) => setNotableContent(e.target.value)}
                placeholder="特記事項の内容（保護者への報告・ヒヤリハット・体調異変など）"
                rows={3}
                className="mt-2 w-full text-sm border border-red-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none bg-red-50"
              />
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
          </div>
        </CardHeader>
        <CardContent>
          <textarea
            value={contactNoteContent}
            onChange={(e) => setContactNoteContent(e.target.value)}
            placeholder="保護者へのメッセージを入力してください..."
            rows={5}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            ※ AI生成後、内容を確認・編集してから保存してください
          </p>
        </CardContent>
      </Card>

      {/* 保存ボタン */}
      <div className="flex justify-end gap-3 pb-6">
        <Button
          onClick={handleSave}
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
              {saving ? '保存中...' : '記録を保存'}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
