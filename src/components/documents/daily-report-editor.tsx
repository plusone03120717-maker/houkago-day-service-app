'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Save, Printer, CheckCircle, Users, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type ShiftEntry = {
  id: string
  staff_id: string
  shift_type: string
  start_time: string | null
  end_time: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  is_attendance_confirmed: boolean
  users: { name: string }
}

type AttendanceRow = {
  name: string
  unit: string | null
  status: string
}

type DailyReport = {
  id: string
  report_date: string
  manager_comment: string | null
  safety_check: boolean
  medication_records: string | null
  incident_notes: string | null
}

interface Props {
  date: string
  dayLabel: string
  shifts: ShiftEntry[]
  presentCount: number
  absentCount: number
  attendances: AttendanceRow[]
  initial: DailyReport | null
}

const SHIFT_LABEL: Record<string, string> = {
  full: '全日', morning: '午前', afternoon: '午後',
}

export function DailyReportEditor({
  date, dayLabel, shifts, presentCount, absentCount, attendances, initial,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [safetyCheck, setSafetyCheck] = useState(initial?.safety_check ?? false)
  const [managerComment, setManagerComment] = useState(initial?.manager_comment ?? '')
  const [medicationRecords, setMedicationRecords] = useState(initial?.medication_records ?? '')
  const [incidentNotes, setIncidentNotes] = useState(initial?.incident_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      report_date: date,
      safety_check: safetyCheck,
      manager_comment: managerComment || null,
      medication_records: medicationRecords || null,
      incident_notes: incidentNotes || null,
    }
    if (initial?.id) {
      await supabase.from('daily_reports').update(payload).eq('id', initial.id)
    } else {
      await supabase.from('daily_reports').insert(payload)
    }
    setSaving(false)
    setSaved(true)
    startTransition(() => router.refresh())
  }

  const staffCount = shifts.length
  const confirmedCount = shifts.filter((s) => s.is_attendance_confirmed).length

  return (
    <div className="space-y-4">
      {/* 印刷用タイトル */}
      <div className="hidden print:block text-center border-b pb-3 mb-4">
        <h1 className="text-xl font-bold">業務日報</h1>
        <p className="text-base mt-1">{dayLabel}</p>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-indigo-50 rounded-xl p-3 text-center">
          <UserCheck className="h-5 w-5 text-indigo-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-indigo-700">{presentCount}</p>
          <p className="text-xs text-indigo-500">出席児童</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <Users className="h-5 w-5 text-gray-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-500">{absentCount}</p>
          <p className="text-xs text-gray-400">欠席</p>
        </div>
        <div className="bg-teal-50 rounded-xl p-3 text-center">
          <Users className="h-5 w-5 text-teal-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-teal-700">{staffCount}</p>
          <p className="text-xs text-teal-500">出勤予定</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <CheckCircle className="h-5 w-5 text-green-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-green-700">{confirmedCount}</p>
          <p className="text-xs text-green-500">出勤確認済</p>
        </div>
      </div>

      {/* スタッフ出勤状況 */}
      {shifts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">スタッフ出勤状況</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="text-left py-1 font-medium">氏名</th>
                  <th className="text-left py-1 font-medium">予定</th>
                  <th className="text-left py-1 font-medium">実績</th>
                  <th className="text-center py-1 font-medium">確認</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shifts.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1.5 text-gray-800">{s.users?.name ?? '—'}</td>
                    <td className="py-1.5 text-gray-500">
                      {SHIFT_LABEL[s.shift_type] ?? s.shift_type}
                      {s.start_time && (
                        <span className="text-xs text-gray-400 ml-1">
                          {s.start_time.slice(0, 5)}〜{s.end_time?.slice(0, 5)}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-gray-600 text-xs">
                      {s.actual_start_time ? (
                        <span>
                          {s.actual_start_time.slice(0, 5)}〜{s.actual_end_time?.slice(0, 5) ?? '—'}
                        </span>
                      ) : (
                        <span className="text-gray-300">未入力</span>
                      )}
                    </td>
                    <td className="py-1.5 text-center">
                      {s.is_attendance_confirmed ? (
                        <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 出席児童一覧 */}
      {attendances.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">出欠状況</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {attendances.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    a.status === 'present' ? 'bg-green-400' : 'bg-gray-300'
                  )} />
                  <span className={a.status === 'present' ? 'text-gray-800' : 'text-gray-400'}>
                    {a.name}
                  </span>
                  {a.unit && (
                    <span className="text-xs text-gray-400">({a.unit})</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 記録フォーム */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">日報記録</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 安全確認 */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="safety"
              checked={safetyCheck}
              onChange={(e) => { setSafetyCheck(e.target.checked); setSaved(false) }}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <label htmlFor="safety" className="text-sm font-medium text-gray-800">
              安全確認実施済み（避難経路・設備・薬品管理等）
            </label>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              管理者コメント・申し送り事項
            </label>
            <textarea
              value={managerComment}
              onChange={(e) => { setManagerComment(e.target.value); setSaved(false) }}
              rows={3}
              placeholder="本日の業務全般・申し送り事項など"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              服薬記録
            </label>
            <textarea
              value={medicationRecords}
              onChange={(e) => { setMedicationRecords(e.target.value); setSaved(false) }}
              rows={2}
              placeholder="服薬が必要な児童の記録（児童名・薬名・時間・確認者）"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              事故・ヒヤリハット記録
            </label>
            <textarea
              value={incidentNotes}
              onChange={(e) => { setIncidentNotes(e.target.value); setSaved(false) }}
              rows={2}
              placeholder="事故・ヒヤリハット・保護者からのクレーム等"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* アクションボタン */}
      <div className="flex items-center gap-3 print:hidden">
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '日報を保存'}
        </Button>
        <Button
          onClick={() => window.print()}
          variant="outline"
          size="sm"
        >
          <Printer className="h-4 w-4" />
          印刷
        </Button>
        {saved && <span className="text-xs text-green-600">保存しました</span>}
      </div>

      {/* 印刷用フッター */}
      <div className="hidden print:block mt-8 pt-4 border-t text-xs text-gray-400 flex justify-between">
        <span>記録者: _______________</span>
        <span>確認者: _______________</span>
        <span>印刷日: {new Date().toLocaleDateString('ja-JP')}</span>
      </div>
    </div>
  )
}
