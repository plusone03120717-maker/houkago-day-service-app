'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, CalendarClock, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MonitoringSchedule = {
  id: string
  event_date: string
  start_time: string | null
  end_time: string | null
  note: string | null
}

interface Props {
  childId: string
  facilityId: string | null
  schedules: MonitoringSchedule[]
  readOnly?: boolean
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function MonitoringScheduleSection({ childId, facilityId, schedules, readOnly }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    event_date: localDateStr(new Date()),
    start_time: '',
    end_time: '',
    note: '',
  })

  const today = localDateStr(new Date())
  const upcoming = schedules.filter((s) => s.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date))
  const past     = schedules.filter((s) => s.event_date < today).sort((a, b) => b.event_date.localeCompare(a.event_date))

  async function handleSave() {
    if (!form.event_date) return
    setSaving(true)
    await supabase.from('schedule_events').insert({
      facility_id: facilityId,
      child_id: childId,
      title: 'モニタリング',
      event_type: 'monitoring',
      event_date: form.event_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      all_day: !form.start_time,
      note: form.note || null,
    })
    setSaving(false)
    setShowForm(false)
    setForm({ event_date: localDateStr(new Date()), start_time: '', end_time: '', note: '' })
    startTransition(() => router.refresh())
  }

  async function handleDelete(id: string) {
    if (!confirm('このモニタリング予定を削除しますか？')) return
    await supabase.from('schedule_events').delete().eq('id', id)
    startTransition(() => router.refresh())
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
  }

  return (
    <div className="space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <CalendarClock className="h-4 w-4 text-teal-500" />
          モニタリング予定
        </h3>
        {!readOnly && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1 text-xs text-teal-700 hover:text-teal-900 font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            予定を追加
          </button>
        )}
      </div>

      {/* 追加フォーム */}
      {showForm && (
        <div className="border border-teal-200 rounded-lg p-3 bg-teal-50/40 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-500 mb-1 block">予定日 *</label>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">開始時刻（任意）</label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">終了時刻（任意）</label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">メモ（任意）</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="場所・担当者など"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void handleSave()}
              disabled={saving || !form.event_date}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <X className="h-3.5 w-3.5" />
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 予定一覧 */}
      {schedules.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 py-1">モニタリング予定はありません</p>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500">今後の予定</p>
          {upcoming.map((s) => (
            <ScheduleRow key={s.id} schedule={s} formatDate={formatDate} onDelete={readOnly ? undefined : handleDelete} isUpcoming />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-400 mt-2">過去の予定</p>
          {past.map((s) => (
            <ScheduleRow key={s.id} schedule={s} formatDate={formatDate} onDelete={readOnly ? undefined : handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleRow({ schedule, formatDate, onDelete, isUpcoming }: {
  schedule: MonitoringSchedule
  formatDate: (d: string) => string
  onDelete?: (id: string) => void
  isUpcoming?: boolean
}) {
  return (
    <div className={cn(
      'flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm',
      isUpcoming ? 'border-teal-200 bg-teal-50/40' : 'border-gray-100 bg-gray-50/40 text-gray-500'
    )}>
      <div className="flex items-center gap-2 min-w-0">
        <CalendarClock className={cn('h-3.5 w-3.5 flex-shrink-0', isUpcoming ? 'text-teal-500' : 'text-gray-400')} />
        <div className="min-w-0">
          <span className="font-medium">{formatDate(schedule.event_date)}</span>
          {schedule.start_time && (
            <span className="ml-2 text-xs">
              {schedule.start_time.slice(0, 5)}
              {schedule.end_time ? `〜${schedule.end_time.slice(0, 5)}` : ''}
            </span>
          )}
          {schedule.note && (
            <span className="ml-2 text-xs text-gray-400 truncate">{schedule.note}</span>
          )}
        </div>
      </div>
      {onDelete && (
        <button
          onClick={() => onDelete(schedule.id)}
          className="text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors"
          title="削除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
