'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Save, CheckCircle } from 'lucide-react'
import { updateIncidentStatus } from '@/app/actions/incidents'

interface Props {
  incidentId: string
  currentStatus: string
  currentFollowUpNotes: string | null
  currentReportedToMunicipality: boolean
}

export function IncidentStatusForm({
  incidentId,
  currentStatus,
  currentFollowUpNotes,
  currentReportedToMunicipality,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [status, setStatus] = useState(currentStatus)
  const [followUpNotes, setFollowUpNotes] = useState(currentFollowUpNotes ?? '')
  const [reportedToMunicipality, setReportedToMunicipality] = useState(currentReportedToMunicipality)
  const [municipalityDate, setMunicipalityDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)

    const result = await updateIncidentStatus(incidentId, {
      status,
      followUpNotes: followUpNotes || null,
      reportedToMunicipality,
      municipalityReportDate: reportedToMunicipality && municipalityDate ? municipalityDate : null,
    })

    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      // Server ActionでrevalidatePathを呼んでいるが、
      // クライアント側のルーターキャッシュも更新する
      startTransition(() => router.refresh())
    }
  }

  return (
    <div className="space-y-4">
      {/* ステータス */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-2">対応状況</label>
        <div className="flex gap-3">
          {[
            { value: 'open', label: '未対応・対応中' },
            { value: 'closed', label: '対応完了' },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => { setStatus(s.value); setSaved(false) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                status === s.value
                  ? s.value === 'closed'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 行政報告 */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={reportedToMunicipality}
            onChange={(e) => { setReportedToMunicipality(e.target.checked); setSaved(false) }}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600"
          />
          <span className="text-sm text-gray-700">行政（市区町村）へ報告済み</span>
        </label>
        {reportedToMunicipality && (
          <div className="ml-6">
            <label className="text-xs text-gray-500 block mb-1">報告日</label>
            <input
              type="date"
              value={municipalityDate}
              onChange={(e) => { setMunicipalityDate(e.target.value); setSaved(false) }}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}
      </div>

      {/* フォローアップ記録 */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">フォローアップ記録</label>
        <textarea
          value={followUpNotes}
          onChange={(e) => { setFollowUpNotes(e.target.value); setSaved(false) }}
          placeholder="その後の経過・対応内容を記録してください"
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '更新'}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="h-3.5 w-3.5" />
            保存しました
          </span>
        )}
        {error && (
          <span className="text-xs text-red-600">{error}</span>
        )}
      </div>
    </div>
  )
}
