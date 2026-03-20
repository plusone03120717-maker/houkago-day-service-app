'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

const EVENT_TYPES = [
  { value: 'closed', label: '休業日', color: 'bg-red-50 border-red-300 text-red-700' },
  { value: 'half_day', label: '短縮営業', color: 'bg-yellow-50 border-yellow-300 text-yellow-700' },
  { value: 'event', label: '行事', color: 'bg-indigo-50 border-indigo-300 text-indigo-700' },
  { value: 'training', label: '職員研修', color: 'bg-purple-50 border-purple-300 text-purple-700' },
  { value: 'holiday', label: '祝日', color: 'bg-gray-50 border-gray-300 text-gray-700' },
]

interface Props {
  facilityId: string
  defaultYear: number
  defaultMonth: number
}

export function FacilityEventForm({ facilityId, defaultYear, defaultMonth }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const defaultDate = `${defaultYear}-${String(defaultMonth).padStart(2, '0')}-01`

  const [eventDate, setEventDate] = useState(defaultDate)
  const [eventType, setEventType] = useState('closed')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [affectsReservation, setAffectsReservation] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim() || !eventDate) return
    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    await supabase.from('facility_events').insert({
      facility_id: facilityId || null,
      event_date: eventDate,
      event_type: eventType,
      title: title.trim(),
      description: description.trim() || null,
      affects_reservation: eventType === 'closed' ? true : affectsReservation,
      created_by: userData.user?.id ?? null,
    })

    setSaving(false)
    setTitle('')
    setDescription('')
    setAffectsReservation(false)
    startTransition(() => router.refresh())
  }

  // 休業日は自動的に予約停止
  const isAutoBlock = eventType === 'closed'

  return (
    <div className="space-y-3">
      {/* 日付 */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">日付</label>
        <input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* 種別 */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-2">種別</label>
        <div className="grid grid-cols-2 gap-2">
          {EVENT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setEventType(t.value)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left ${
                eventType === t.value ? t.color : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* タイトル */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">
          タイトル <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 創立記念日休業、秋の遠足"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* 備考 */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">備考</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="保護者向けの追加説明（任意）"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* 予約停止 */}
      {!isAutoBlock && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={affectsReservation}
            onChange={(e) => setAffectsReservation(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600"
          />
          <span className="text-sm text-gray-700">保護者の予約を停止する</span>
        </label>
      )}
      {isAutoBlock && (
        <p className="text-xs text-red-500">※ 休業日は自動的に保護者予約を停止します</p>
      )}

      <Button
        onClick={handleSave}
        disabled={saving || !title.trim()}
        size="sm"
        className="w-full"
      >
        <Plus className="h-4 w-4" />
        {saving ? '追加中...' : '予定を追加'}
      </Button>
    </div>
  )
}
