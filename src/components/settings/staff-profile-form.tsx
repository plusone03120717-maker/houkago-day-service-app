'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save, CheckCircle } from 'lucide-react'

// 放デイで一般的な資格一覧
const QUALIFICATION_OPTIONS = [
  { value: '児童指導員', label: '児童指導員' },
  { value: '保育士', label: '保育士' },
  { value: '社会福祉士', label: '社会福祉士' },
  { value: '精神保健福祉士', label: '精神保健福祉士' },
  { value: '理学療法士（PT）', label: '理学療法士（PT）' },
  { value: '作業療法士（OT）', label: '作業療法士（OT）' },
  { value: '言語聴覚士（ST）', label: '言語聴覚士（ST）' },
  { value: '臨床心理士', label: '臨床心理士' },
  { value: '公認心理師', label: '公認心理師' },
  { value: '特別支援学校教諭', label: '特別支援学校教諭' },
  { value: '介護福祉士', label: '介護福祉士' },
  { value: '強度行動障害支援者養成研修修了', label: '強度行動障害支援者養成研修修了' },
  { value: '行動援護従業者', label: '行動援護従業者' },
  { value: '看護師', label: '看護師' },
]

type Unit = { id: string; name: string }

// ログインユーザーに付与できる追加役職
const JOB_TITLE_OPTIONS = [
  { value: 'driver',    label: 'ドライバー' },
  { value: 'therapist', label: '療育士' },
  { value: 'nurse',     label: '看護師' },
]

interface Props {
  userId: string
  profileId: string | null
  initialEmploymentType: string
  initialQualification: string
  initialUnitIds: string[]
  units: Unit[]
  facilityId: string
  initialLineUserId: string
  initialJobTitles: string[]
}

export function StaffProfileForm({
  userId,
  profileId,
  initialEmploymentType,
  initialQualification,
  initialUnitIds,
  units,
  facilityId,
  initialLineUserId,
  initialJobTitles,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [employmentType, setEmploymentType] = useState(initialEmploymentType || 'full_time')
  const [qualification, setQualification] = useState(initialQualification || '')
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set(initialUnitIds))
  const [hireDate, setHireDate] = useState('')
  const [lineUserId, setLineUserId] = useState(initialLineUserId || '')
  const [jobTitles, setJobTitles] = useState<Set<string>>(new Set(initialJobTitles))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const toggleJobTitle = (value: string) => {
    setJobTitles((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
    setSaved(false)
  }

  const toggleUnit = (unitId: string) => {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)

    let currentProfileId = profileId

    if (!currentProfileId) {
      // プロファイルを新規作成
      const { data: newProfile } = await supabase
        .from('staff_profiles')
        .insert({
          user_id: userId,
          facility_id: facilityId,
          employment_type: employmentType,
          qualification: qualification || null,
          hire_date: hireDate || null,
        })
        .select('id')
        .single()
      currentProfileId = newProfile?.id ?? null
    } else {
      // プロファイルを更新
      await supabase
        .from('staff_profiles')
        .update({
          employment_type: employmentType,
          qualification: qualification || null,
          hire_date: hireDate || null,
        })
        .eq('id', currentProfileId)
    }

    if (currentProfileId) {
      // ユニット割当を再設定（既存を削除→追加）
      await supabase
        .from('staff_unit_assignments')
        .delete()
        .eq('staff_id', currentProfileId)

      if (selectedUnitIds.size > 0) {
        await supabase
          .from('staff_unit_assignments')
          .insert(
            Array.from(selectedUnitIds).map((unitId) => ({
              staff_id: currentProfileId,
              unit_id: unitId,
            }))
          )
      }
    }

    // LINE User ID と役職を更新
    await supabase
      .from('users')
      .update({ line_user_id: lineUserId || null, job_titles: [...jobTitles] })
      .eq('id', userId)

    setSaving(false)
    setSaved(true)
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-5">
      {/* 雇用形態 */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-2 block">雇用形態</label>
        <div className="flex gap-3">
          {[
            { value: 'full_time', label: '常勤' },
            { value: 'part_time', label: '非常勤' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setEmploymentType(opt.value); setSaved(false) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                employmentType === opt.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 資格 */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-2 block">
          保有資格
          <span className="ml-1 text-gray-400 font-normal">（複数ある場合は「、」区切りで入力）</span>
        </label>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {QUALIFICATION_OPTIONS.map((opt) => {
              const selected = qualification.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSaved(false)
                    setQualification((prev) => {
                      const current = prev.split('、').map((s) => s.trim()).filter(Boolean)
                      if (selected) {
                        return current.filter((q) => q !== opt.value).join('、')
                      } else {
                        return [...current, opt.value].join('、')
                      }
                    })
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selected
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <input
            type="text"
            value={qualification}
            onChange={(e) => { setQualification(e.target.value); setSaved(false) }}
            placeholder="例: 保育士、社会福祉士"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 入職日 */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">入職日</label>
        <input
          type="date"
          value={hireDate}
          onChange={(e) => { setHireDate(e.target.value); setSaved(false) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* 役職（追加） */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-2 block">
          役職
          <span className="ml-1 text-gray-400 font-normal">（複数選択可）</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {JOB_TITLE_OPTIONS.map((opt) => {
            const selected = jobTitles.has(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleJobTitle(opt.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  selected
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* LINE User ID */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">
          LINE User ID
          <span className="ml-1 text-gray-400 font-normal">（送迎通知を受け取るために必要）</span>
        </label>
        <input
          type="text"
          value={lineUserId}
          onChange={(e) => { setLineUserId(e.target.value); setSaved(false) }}
          placeholder="U1234567890abcdef..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
        />
        <p className="text-xs text-gray-400 mt-1">
          LINE Developers のMessaging API設定画面 → チャンネルのユーザーIDで確認できます
        </p>
      </div>

      {/* ユニット割当 */}
      {units.length > 0 && (
        <div>
          <label className="text-xs font-medium text-gray-700 mb-2 block">担当ユニット</label>
          <div className="flex flex-wrap gap-2">
            {units.map((unit) => {
              const selected = selectedUnitIds.has(unit.id)
              return (
                <button
                  key={unit.id}
                  onClick={() => toggleUnit(unit.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    selected
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {unit.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '保存'}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="h-3.5 w-3.5" />
            保存しました
          </span>
        )}
      </div>
    </div>
  )
}
