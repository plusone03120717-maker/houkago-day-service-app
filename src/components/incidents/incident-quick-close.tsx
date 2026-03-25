'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { updateIncidentStatus } from '@/app/actions/incidents'

interface Props {
  incidentId: string
}

export function IncidentQuickClose({ incidentId }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const handleClose = async (e: React.MouseEvent) => {
    e.preventDefault() // カードのリンク遷移を防ぐ
    e.stopPropagation()
    if (!confirm('このインシデントを対応済みにしますか？')) return
    setSaving(true)
    const result = await updateIncidentStatus(incidentId, {
      status: 'closed',
      followUpNotes: null,
      reportedToMunicipality: false,
      municipalityReportDate: null,
    })
    setSaving(false)
    if (!result.error) {
      setDone(true)
      startTransition(() => router.refresh())
    }
  }

  if (done) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        対応済
      </span>
    )
  }

  return (
    <button
      onClick={handleClose}
      disabled={saving}
      className="flex items-center gap-1 text-xs text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-2.5 py-1 rounded-full font-medium transition-colors"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      {saving ? '保存中...' : '対応済みにする'}
    </button>
  )
}
