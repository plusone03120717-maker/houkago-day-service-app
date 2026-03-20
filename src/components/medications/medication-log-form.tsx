'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

const STATUS_OPTIONS = [
  { value: 'given', label: '与薬済', className: 'bg-green-600 text-white border-green-600' },
  { value: 'refused', label: '拒否', className: 'bg-yellow-500 text-white border-yellow-500' },
  { value: 'skipped', label: 'スキップ', className: 'bg-gray-400 text-white border-gray-400' },
  { value: 'not_needed', label: '不要', className: 'bg-gray-300 text-gray-700 border-gray-300' },
]

const STATUS_INACTIVE: Record<string, string> = {
  given: 'bg-white text-green-700 border-green-300 hover:bg-green-50',
  refused: 'bg-white text-yellow-700 border-yellow-300 hover:bg-yellow-50',
  skipped: 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
  not_needed: 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50',
}

export function MedicationLogForm({
  childId,
  medications,
  todayLogs,
  today,
}: {
  childId: string
  medications: Medication[]
  todayLogs: MedicationLog[]
  today: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState<string | null>(null)

  const logMap = new Map(todayLogs.map((l) => [l.medication_id, l]))

  const handleRecord = async (medicationId: string, status: string) => {
    setSaving(medicationId)
    const { data: userData } = await supabase.auth.getUser()
    const existingLog = logMap.get(medicationId)

    if (existingLog) {
      if (existingLog.status === status) {
        // toggle off — delete the log
        await supabase.from('medication_logs').delete().eq('id', existingLog.id)
      } else {
        await supabase
          .from('medication_logs')
          .update({ status, administered_at: status === 'given' ? new Date().toISOString() : null })
          .eq('id', existingLog.id)
      }
    } else {
      await supabase.from('medication_logs').insert({
        child_id: childId,
        medication_id: medicationId,
        log_date: today,
        status,
        staff_id: userData.user?.id ?? null,
        administered_at: status === 'given' ? new Date().toISOString() : null,
      })
    }

    setSaving(null)
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-3">
      {medications.map((med) => {
        const log = logMap.get(med.id)
        const currentStatus = log?.status ?? null
        const isSaving = saving === med.id

        return (
          <div key={med.id} className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{med.medication_name}</p>
              <p className="text-xs text-gray-500">{med.dosage}</p>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleRecord(med.id, opt.value)}
                  disabled={isSaving}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                    currentStatus === opt.value ? opt.className : STATUS_INACTIVE[opt.value]
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
