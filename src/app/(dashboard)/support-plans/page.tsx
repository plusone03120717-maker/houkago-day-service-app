import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, ChevronRight, AlertCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type SupportPlan = {
  id: string
  plan_date: string
  review_date: string | null
  status: string
}

type ChildWithPlan = {
  id: string
  name: string
  name_kana: string | null
  support_plans: SupportPlan[]
}

export default async function SupportPlansPage() {
  const supabase = await createClient()

  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, name, name_kana, support_plans(id, plan_date, review_date, status)')
    .eq('is_active', true)
    .order('name_kana')
  const children = (childrenRaw ?? []) as unknown as ChildWithPlan[]

  const today = new Date()
  const threeMonthsLater = new Date(today)
  threeMonthsLater.setMonth(today.getMonth() + 3)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">個別支援計画</h1>
        <p className="text-sm text-gray-500 mt-0.5">児童ごとの支援計画管理・AI下書き</p>
      </div>

      <div className="space-y-2">
        {children.map((child) => {
          const plans = (child.support_plans ?? []).sort((a, b) =>
            b.plan_date.localeCompare(a.plan_date)
          )
          const latestPlan = plans[0]
          const reviewDate = latestPlan?.review_date ? new Date(latestPlan.review_date) : null
          const needsReview = reviewDate ? reviewDate <= threeMonthsLater : !latestPlan

          return (
            <Link key={child.id} href={`/support-plans/${child.id}`}>
              <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <ClipboardList className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{child.name}</p>
                      {child.name_kana && (
                        <p className="text-xs text-gray-400">{child.name_kana}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {latestPlan ? (
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          作成: {formatDate(latestPlan.plan_date)}
                        </p>
                        {latestPlan.review_date && (
                          <p className={`text-xs ${needsReview ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                            見直し: {formatDate(latestPlan.review_date)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <Badge variant="warning" className="text-xs">未作成</Badge>
                    )}
                    {needsReview && (
                      <AlertCircle className="h-4 w-4 text-orange-400 flex-shrink-0" />
                    )}
                    <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}

        {children.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            登録された児童がいません
          </div>
        )}
      </div>
    </div>
  )
}
