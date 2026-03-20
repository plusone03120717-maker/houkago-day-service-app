import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { AssessmentForm, AssessmentAccordion } from '@/components/assessments/assessment-form'

type Assessment = {
  id: string
  assessment_date: string
  child_situation: string | null
  current_issues: string | null
  family_situation: string | null
  related_agencies: string | null
  child_wishes: string | null
  parent_wishes: string | null
  usage_goals: string | null
  notes: string | null
  users: { name: string } | null
}

const SECTION_LABELS: { key: keyof Omit<Assessment, 'id' | 'assessment_date' | 'users'>; label: string }[] = [
  { key: 'child_situation', label: '本人の様子・強み' },
  { key: 'current_issues', label: '現在の課題・困り事' },
  { key: 'family_situation', label: '家族の状況・家庭環境' },
  { key: 'related_agencies', label: '関係機関との連携状況' },
  { key: 'child_wishes', label: '本人の希望' },
  { key: 'parent_wishes', label: '保護者の希望' },
  { key: 'usage_goals', label: '放デイ利用の目標' },
  { key: 'notes', label: '特記事項・補足' },
]

export default async function AssessmentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: childId } = await params
  const supabase = await createClient()

  const [childResult, assessmentsResult, userResult] = await Promise.all([
    supabase.from('children').select('id, name').eq('id', childId).single(),
    supabase
      .from('child_assessments')
      .select('id, assessment_date, child_situation, current_issues, family_situation, related_agencies, child_wishes, parent_wishes, usage_goals, notes, users!child_assessments_assessor_id_fkey(name)')
      .eq('child_id', childId)
      .order('assessment_date', { ascending: false }),
    supabase.auth.getUser(),
  ])

  if (!childResult.data) notFound()
  const child = childResult.data as { id: string; name: string }
  const assessments = (assessmentsResult.data ?? []) as unknown as Assessment[]
  const staffId = userResult.data.user?.id ?? ''

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/children/${childId}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">アセスメントシート</h1>
          <p className="text-sm text-gray-500 mt-0.5">{child.name}</p>
        </div>
      </div>

      {/* 新規作成 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-indigo-600" />
            アセスメントの記録
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AssessmentForm childId={childId} staffId={staffId} />
        </CardContent>
      </Card>

      {/* 過去のアセスメント一覧 */}
      {assessments.length > 0 ? (
        <div className="space-y-4">
          {assessments.map((assessment) => (
            <Card key={assessment.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-800">
                    {formatDate(assessment.assessment_date)}
                  </CardTitle>
                  {assessment.users && (
                    <span className="text-xs text-gray-400">担当: {assessment.users.name}</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {SECTION_LABELS.map(({ key, label }) => (
                  <AssessmentAccordion key={key} label={label} value={assessment[key]} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-gray-400 text-sm">
          まだアセスメントが記録されていません
        </div>
      )}
    </div>
  )
}
