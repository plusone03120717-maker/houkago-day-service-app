'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

const TIMINGS = [
  { value: 'after_breakfast', label: '朝食後' },
  { value: 'after_lunch', label: '昼食後' },
  { value: 'after_dinner', label: '夕食後' },
  { value: 'as_needed', label: '必要時' },
  { value: 'other', label: 'その他' },
]

export function MedicationForm({ childId }: { childId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [dosage, setDosage] = useState('')
  const [timing, setTiming] = useState('after_lunch')
  const [instructions, setInstructions] = useState('')
  const [consentDate, setConsentDate] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !dosage.trim()) return
    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    await supabase.from('child_medications').insert({
      child_id: childId,
      medication_name: name.trim(),
      dosage: dosage.trim(),
      timing,
      instructions: instructions.trim() || null,
      parent_consent_date: consentDate || null,
      is_active: true,
      created_by: userData.user?.id ?? null,
    })

    setSaving(false)
    setOpen(false)
    setName('')
    setDosage('')
    setTiming('after_lunch')
    setInstructions('')
    setConsentDate('')
    startTransition(() => router.refresh())
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 text-sm text-gray-500 border-2 border-dashed border-gray-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-colors"
      >
        ＋ 与薬依頼薬を追加する
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">
            薬品名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: リタリン、エビリファイ"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">
            用量・用法 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            placeholder="例: 1錠、2.5mg"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 block mb-2">服薬タイミング</label>
        <div className="flex flex-wrap gap-2">
          {TIMINGS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTiming(t.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                timing === t.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">注意事項</label>
        <input
          type="text"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="例: 水で飲む、食事30分後に服用"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">保護者同意日</label>
        <input
          type="date"
          value={consentDate}
          onChange={(e) => setConsentDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving || !name.trim() || !dosage.trim()} size="sm">
          <Plus className="h-4 w-4" />
          {saving ? '追加中...' : '追加'}
        </Button>
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">
          キャンセル
        </button>
      </div>
    </div>
  )
}
