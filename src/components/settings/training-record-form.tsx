'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'

const TRAINING_TYPES = [
  { value: 'initial', label: '初任者研修' },
  { value: 'regular', label: '定期研修' },
  { value: 'specialized', label: '専門研修' },
  { value: 'career', label: 'キャリアパス研修' },
  { value: 'other', label: 'その他' },
] as const

type TrainingRecord = {
  id: string
  training_name: string
  training_type: string
  organizer: string | null
  completed_date: string
  certificate_number: string | null
  hours: number | null
  notes: string | null
}

const TYPE_LABELS: Record<string, string> = {
  initial: '初任者',
  regular: '定期',
  specialized: '専門',
  career: 'キャリア',
  other: 'その他',
}

const TYPE_COLORS: Record<string, string> = {
  initial: 'bg-blue-100 text-blue-700',
  regular: 'bg-green-100 text-green-700',
  specialized: 'bg-purple-100 text-purple-700',
  career: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-600',
}

export function TrainingRecordForm({
  staffProfileId,
  records,
}: {
  staffProfileId: string
  records: TrainingRecord[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [open, setOpen] = useState(false)
  const [trainingName, setTrainingName] = useState('')
  const [trainingType, setTrainingType] = useState<string>('regular')
  const [organizer, setOrganizer] = useState('')
  const [completedDate, setCompletedDate] = useState('')
  const [certificateNumber, setCertificateNumber] = useState('')
  const [hours, setHours] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleSave = async () => {
    if (!trainingName.trim() || !completedDate) return
    setSaving(true)
    await supabase.from('staff_training_records').insert({
      staff_profile_id: staffProfileId,
      training_name: trainingName.trim(),
      training_type: trainingType,
      organizer: organizer.trim() || null,
      completed_date: completedDate,
      certificate_number: certificateNumber.trim() || null,
      hours: hours ? parseFloat(hours) : null,
      notes: notes.trim() || null,
    })
    setSaving(false)
    setOpen(false)
    setTrainingName('')
    setTrainingType('regular')
    setOrganizer('')
    setCompletedDate('')
    setCertificateNumber('')
    setHours('')
    setNotes('')
    startTransition(() => router.refresh())
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この研修記録を削除しますか？')) return
    setDeleting(id)
    await supabase.from('staff_training_records').delete().eq('id', id)
    setDeleting(null)
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-4">
      {/* 研修記録一覧 */}
      {records.length > 0 ? (
        <div className="space-y-2">
          {records.map((rec) => (
            <div key={rec.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[rec.training_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {TYPE_LABELS[rec.training_type] ?? rec.training_type}
                  </span>
                  <p className="text-sm font-medium text-gray-900 truncate">{rec.training_name}</p>
                </div>
                <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
                  <span>{rec.completed_date}</span>
                  {rec.organizer && <span>{rec.organizer}</span>}
                  {rec.hours != null && <span>{rec.hours}時間</span>}
                  {rec.certificate_number && <span>証明書: {rec.certificate_number}</span>}
                </div>
                {rec.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{rec.notes}</p>}
              </div>
              <button
                onClick={() => handleDelete(rec.id)}
                disabled={deleting === rec.id}
                className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        !open && (
          <p className="text-sm text-gray-400 text-center py-4">研修記録がありません</p>
        )
      )}

      {/* 追加フォーム */}
      {open ? (
        <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-700 block mb-1">
                研修名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={trainingName}
                onChange={(e) => setTrainingName(e.target.value)}
                placeholder="例: 強度行動障害支援者養成研修（基礎研修）"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">研修種別</label>
              <select
                value={trainingType}
                onChange={(e) => setTrainingType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              >
                {TRAINING_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                修了日 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={completedDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">主催機関</label>
              <input
                type="text"
                value={organizer}
                onChange={(e) => setOrganizer(e.target.value)}
                placeholder="例: 都道府県・事業団体"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">研修時間（h）</label>
              <input
                type="number"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="例: 6.5"
                min="0"
                step="0.5"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">修了証番号</label>
              <input
                type="text"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                placeholder="任意"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-700 block mb-1">メモ</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="任意"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || !trainingName.trim() || !completedDate}
              size="sm"
            >
              <Plus className="h-4 w-4" />
              {saving ? '追加中...' : '追加'}
            </Button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full py-2.5 text-sm text-gray-500 border-2 border-dashed border-gray-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-colors"
        >
          ＋ 研修記録を追加
        </button>
      )}
    </div>
  )
}
