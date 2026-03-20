'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Save } from 'lucide-react'

type Props = {
  childId: string
  staffId: string
}

const SECTIONS = [
  {
    key: 'child_situation',
    label: '本人の様子・強み',
    placeholder: '得意なこと、好きなこと、本人の強みや特性を記入してください',
  },
  {
    key: 'current_issues',
    label: '現在の課題・困り事',
    placeholder: '日常生活・学習・コミュニケーションなどの課題を記入してください',
  },
  {
    key: 'family_situation',
    label: '家族の状況・家庭環境',
    placeholder: '家族構成、家庭での様子、支援状況を記入してください',
  },
  {
    key: 'related_agencies',
    label: '関係機関との連携状況',
    placeholder: '学校、医療機関、相談支援専門員など連携先を記入してください',
  },
  {
    key: 'child_wishes',
    label: '本人の希望・やりたいこと',
    placeholder: '本人が望んでいること、挑戦したいことを記入してください',
  },
  {
    key: 'parent_wishes',
    label: '保護者の希望・期待すること',
    placeholder: '保護者が子どもに望むこと、放デイへの期待を記入してください',
  },
  {
    key: 'usage_goals',
    label: '放デイ利用の目標',
    placeholder: '放課後デイサービスを通じて達成したい目標を記入してください',
  },
  {
    key: 'notes',
    label: '特記事項・補足',
    placeholder: 'その他、支援に必要な情報を記入してください',
  },
] as const

type FieldKey = typeof SECTIONS[number]['key']

export function AssessmentForm({ childId, staffId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [open, setOpen] = useState(false)
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().slice(0, 10))
  const [fields, setFields] = useState<Record<FieldKey, string>>({
    child_situation: '',
    current_issues: '',
    family_situation: '',
    related_agencies: '',
    child_wishes: '',
    parent_wishes: '',
    usage_goals: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('child_assessments').insert({
      child_id: childId,
      assessment_date: assessmentDate,
      assessor_id: staffId || null,
      child_situation: fields.child_situation.trim() || null,
      current_issues: fields.current_issues.trim() || null,
      family_situation: fields.family_situation.trim() || null,
      related_agencies: fields.related_agencies.trim() || null,
      child_wishes: fields.child_wishes.trim() || null,
      parent_wishes: fields.parent_wishes.trim() || null,
      usage_goals: fields.usage_goals.trim() || null,
      notes: fields.notes.trim() || null,
    })
    setSaving(false)
    setOpen(false)
    setFields({
      child_situation: '', current_issues: '', family_situation: '',
      related_agencies: '', child_wishes: '', parent_wishes: '',
      usage_goals: '', notes: '',
    })
    startTransition(() => router.refresh())
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 text-sm text-gray-500 border-2 border-dashed border-gray-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-colors"
      >
        ＋ 新しいアセスメントを記録する
      </button>
    )
  }

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">
          アセスメント実施日 <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={assessmentDate}
          onChange={(e) => setAssessmentDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {SECTIONS.map((section) => (
        <div key={section.key}>
          <label className="text-xs font-medium text-gray-700 block mb-1">{section.label}</label>
          <textarea
            value={fields[section.key]}
            onChange={(e) => setFields((prev) => ({ ...prev, [section.key]: e.target.value }))}
            placeholder={section.placeholder}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving || !assessmentDate} size="sm">
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '保存する'}
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

export function AssessmentAccordion({ label, value }: { label: string; value: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!value) return null
  const preview = value.length > 60 ? value.slice(0, 60) + '…' : value
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-2 text-left"
      >
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {expanded ? <ChevronUp className="h-3 w-3 text-gray-400" /> : <ChevronDown className="h-3 w-3 text-gray-400" />}
      </button>
      <p className="text-sm text-gray-700 pb-2 whitespace-pre-wrap">
        {expanded ? value : preview}
      </p>
    </div>
  )
}
