'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Medication = {
  id: string
  medication_name: string
  dosage: string
  timing: string
  instructions: string | null
  parent_consent_date: string | null
  is_active: boolean
}

const TIMING_LABELS: Record<string, string> = {
  after_breakfast: '朝食後',
  after_lunch: '昼食後',
  after_dinner: '夕食後',
  as_needed: '必要時',
  other: 'その他',
}

interface Props {
  activeMeds: Medication[]
  inactiveMeds: Medication[]
}

export function MedicationList({ activeMeds: initialActive, inactiveMeds: initialInactive }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [activeMeds, setActiveMeds] = useState(initialActive)
  const [inactiveMeds, setInactiveMeds] = useState(initialInactive)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (med: Medication) => {
    const action = med.is_active ? '終了' : '削除'
    if (!confirm(`「${med.medication_name}」を${action}しますか？`)) return

    setDeleting(med.id)

    if (med.is_active) {
      // 与薬記録があっても安全に終了扱いにする
      const { error } = await supabase
        .from('child_medications')
        .update({ is_active: false })
        .eq('id', med.id)

      setDeleting(null)
      if (error) { alert(error.message); return }

      setActiveMeds((prev) => prev.filter((m) => m.id !== med.id))
      setInactiveMeds((prev) => [{ ...med, is_active: false }, ...prev])
    } else {
      // 与薬記録の有無を確認してから削除
      const { count } = await supabase
        .from('medication_logs')
        .select('id', { count: 'exact', head: true })
        .eq('medication_id', med.id)

      if ((count ?? 0) > 0) {
        setDeleting(null)
        alert('与薬記録が残っているため完全削除できません。\n（終了済みリストから除くことはできません）')
        return
      }

      const { error } = await supabase.from('child_medications').delete().eq('id', med.id)
      setDeleting(null)
      if (error) { alert(error.message); return }

      setInactiveMeds((prev) => prev.filter((m) => m.id !== med.id))
    }

    startTransition(() => router.refresh())
  }

  return (
    <>
      {/* 処方中の薬一覧 */}
      {activeMeds.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">処方中の薬（{activeMeds.length}件）</p>
          {activeMeds.map((med) => (
            <div key={med.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-gray-900">{med.medication_name}</p>
                    <Badge variant="secondary" className="text-xs">{TIMING_LABELS[med.timing] ?? med.timing}</Badge>
                  </div>
                  <p className="text-sm text-gray-600">{med.dosage}</p>
                  {med.instructions && (
                    <p className="text-xs text-gray-500 mt-1">{med.instructions}</p>
                  )}
                  {med.parent_consent_date && (
                    <p className="text-xs text-indigo-500 mt-1">
                      保護者同意日: {formatDate(med.parent_consent_date)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(med)}
                  disabled={deleting === med.id}
                  title="終了にする"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 終了した薬一覧 */}
      {inactiveMeds.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-400">終了した薬（{inactiveMeds.length}件）</p>
          {inactiveMeds.map((med) => (
            <div key={med.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-400 line-through flex-1">{med.medication_name}</span>
              <span className="text-xs text-gray-400">{med.dosage}</span>
              <button
                onClick={() => handleDelete(med)}
                disabled={deleting === med.id}
                title="削除"
                className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
