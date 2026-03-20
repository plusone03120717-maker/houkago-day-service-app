'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'

type Child = { id: string; name: string }

const INCIDENT_TYPES = [
  { value: 'near_miss', label: 'ヒヤリハット' },
  { value: 'injury', label: '負傷' },
  { value: 'elopement', label: '無断外出' },
  { value: 'medication', label: '服薬事故' },
  { value: 'property', label: '器物破損' },
  { value: 'other', label: 'その他' },
]

const SEVERITIES = [
  { value: 'near_miss', label: 'ヒヤリハット', color: 'bg-blue-50 border-blue-300 text-blue-700' },
  { value: 'minor', label: '軽微（治療不要）', color: 'bg-gray-50 border-gray-300 text-gray-700' },
  { value: 'moderate', label: '中程度（要治療）', color: 'bg-yellow-50 border-yellow-300 text-yellow-700' },
  { value: 'serious', label: '重大（入院等）', color: 'bg-red-50 border-red-300 text-red-700' },
]

interface Props {
  children: Child[]
  facilityId: string
}

export function IncidentForm({ children, facilityId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString().slice(0, 16)

  const [childId, setChildId] = useState('')
  const [incidentType, setIncidentType] = useState('near_miss')
  const [severity, setSeverity] = useState('near_miss')
  const [reportDate, setReportDate] = useState(today)
  const [occurredAt, setOccurredAt] = useState(now)
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [immediateResponse, setImmediateResponse] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [preventiveMeasures, setPreventiveMeasures] = useState('')
  const [reportedToFamily, setReportedToFamily] = useState(false)
  const [reportedToMunicipality, setReportedToMunicipality] = useState(false)
  const [followUpRequired, setFollowUpRequired] = useState(false)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const handleSave = async () => {
    if (!description.trim()) return
    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    await supabase.from('incident_reports').insert({
      facility_id: facilityId || null,
      child_id: childId || null,
      incident_type: incidentType,
      severity,
      report_date: reportDate,
      occurred_at: new Date(occurredAt).toISOString(),
      location: location || null,
      description,
      immediate_response: immediateResponse || null,
      root_cause: rootCause || null,
      preventive_measures: preventiveMeasures || null,
      reported_to_family: reportedToFamily,
      reported_to_municipality: reportedToMunicipality,
      follow_up_required: followUpRequired,
      status: 'open',
      created_by: userData.user?.id ?? null,
    })

    setSaving(false)
    setOpen(false)
    // フォームリセット
    setChildId('')
    setIncidentType('near_miss')
    setSeverity('near_miss')
    setReportDate(today)
    setOccurredAt(now)
    setLocation('')
    setDescription('')
    setImmediateResponse('')
    setRootCause('')
    setPreventiveMeasures('')
    setReportedToFamily(false)
    setReportedToMunicipality(false)
    setFollowUpRequired(false)
    startTransition(() => router.refresh())
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 text-sm text-gray-500 border-2 border-dashed border-gray-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-colors"
      >
        ＋ 新しいインシデントを報告する
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {/* 発生日時 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">報告日</label>
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">発生日時</label>
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 関係する児童 */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">関係する児童（任意）</label>
        <select
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">選択してください</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* インシデント種別 */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-2">インシデント種別</label>
        <div className="flex flex-wrap gap-2">
          {INCIDENT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setIncidentType(t.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                incidentType === t.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 重症度 */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-2">重症度</label>
        <div className="grid grid-cols-2 gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s.value}
              onClick={() => setSeverity(s.value)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left ${
                severity === s.value ? s.color : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 発生場所 */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">発生場所</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="例: 活動室、玄関付近"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* 状況説明 */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">
          状況説明 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="何が起きたかを具体的に記入してください"
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
        />
      </div>

      {/* 即時対応 */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">即時対応内容</label>
        <textarea
          value={immediateResponse}
          onChange={(e) => setImmediateResponse(e.target.value)}
          placeholder="その場でとった対応を記入してください"
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
        />
      </div>

      {/* 原因・再発防止策 */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">原因・背景</label>
          <textarea
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            placeholder="なぜ起きたか"
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">再発防止策</label>
          <textarea
            value={preventiveMeasures}
            onChange={(e) => setPreventiveMeasures(e.target.value)}
            placeholder="今後の対策"
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
        </div>
      </div>

      {/* チェックボックス */}
      <div className="space-y-2">
        {[
          { value: reportedToFamily, setter: setReportedToFamily, label: '家族への報告済み' },
          { value: reportedToMunicipality, setter: setReportedToMunicipality, label: '行政（市区町村）への報告済み' },
          { value: followUpRequired, setter: setFollowUpRequired, label: 'フォローアップが必要' },
        ].map(({ value, setter, label }) => (
          <label key={label} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => setter(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">{label}</span>
          </label>
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving || !description.trim()} size="sm">
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '報告を保存'}
        </Button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
