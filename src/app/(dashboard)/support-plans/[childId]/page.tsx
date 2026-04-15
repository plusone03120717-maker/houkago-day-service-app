import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { SupportPlanForm } from '@/components/support-plans/support-plan-form'
import { SupportPlanEditCard } from '@/components/support-plans/support-plan-edit-card'
import { NotableRecordsSummary } from '@/components/support-plans/notable-records-summary'

type SupportPlan = {
  id: string
  plan_date: string
  review_date: string | null
  status: string
  long_term_goals: string | null
  short_term_goals: string | null
  support_content: string | null
  monitoring_notes: string | null
  long_term_goal_rating: number | null
  short_term_goal_rating: number | null
  created_at: string
}

type Child = {
  id: string
  name: string
  name_kana: string | null
  birth_date: string | null
  diagnosis: string | null
}

export default async function SupportPlanDetailPage({
  params,
}: {
  params: Promise<{ childId: string }>
}) {
  const { childId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isReadOnly = (user?.user_metadata?.role as string | undefined) === 'staff'

  const { data: childRaw } = await supabase
    .from('children')
    .select('id, name, name_kana, birth_date, diagnosis')
    .eq('id', childId)
    .single()
  const child = childRaw as unknown as Child | null

  if (!child) return <div className="p-4 text-gray-500">児童が見つかりません</div>

  const { data: plansRaw } = await supabase
    .from('support_plans')
    .select('id, plan_date, review_date, status, long_term_goals, short_term_goals, support_content, monitoring_notes, long_term_goal_rating, short_term_goal_rating, created_at')
    .eq('child_id', childId)
    .order('plan_date', { ascending: false })
  const plans = (plansRaw ?? []) as unknown as SupportPlan[]

  const { data: recentRecordsRaw } = await supabase
    .from('daily_records')
    .select('date, activities, notable_events, contact_note')
    .eq('child_id', childId)
    .order('date', { ascending: false })
    .limit(10)
  const recentRecords = (recentRecordsRaw ?? []) as unknown as Array<{
    date: string
    activities: unknown[]
    notable_events: string | null
    contact_note: string | null
  }>

  // 直近3ヶ月の特記事項
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10)

  const { data: notableRaw } = await supabase
    .from('daily_attendance')
    .select('date, daily_records!inner(content, record_type)')
    .eq('child_id', childId)
    .gte('date', threeMonthsAgoStr)
    .eq('daily_records.record_type', 'notable')
    .order('date', { ascending: false })

  type NotableRow = { date: string; daily_records: { content: string; record_type: string } | { content: string; record_type: string }[] }
  const notableRecords = ((notableRaw ?? []) as unknown as NotableRow[]).flatMap((row) => {
    const records = Array.isArray(row.daily_records) ? row.daily_records : [row.daily_records]
    return records
      .filter((r) => r.record_type === 'notable')
      .map((r) => ({ date: row.date, content: r.content }))
  })

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/support-plans" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{child.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">個別支援計画</p>
        </div>
      </div>

      {/* モニタリング記録へのリンク */}
      <Link href={`/support-plans/${childId}/monitoring`}>
        <Card className="hover:bg-gray-50 transition-colors cursor-pointer border-indigo-100">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">モニタリング記録</p>
              <p className="text-xs text-gray-500">支援目標の達成状況・進捗を記録</p>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* 特記事項まとめ */}
      <NotableRecordsSummary records={notableRecords} />

      {/* 新規作成フォーム */}
      <SupportPlanForm
        childId={childId}
        childName={child.name}
        diagnosis={child.diagnosis}
        recentRecords={recentRecords}
        readOnly={isReadOnly}
      />

      {/* 既存の計画一覧（編集可能） */}
      {plans.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-700">過去の支援計画</h2>
          {plans.map((plan) => (
            <SupportPlanEditCard key={plan.id} plan={plan} readOnly={isReadOnly} />
          ))}
        </div>
      )}
    </div>
  )
}
