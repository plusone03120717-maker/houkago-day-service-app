import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, FileText, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Child = {
  id: string
  name: string
  name_kana: string | null
  planCount: number
  hasActive: boolean
}

export default async function SupportPlanDocumentSelectPage() {
  const supabase = await createClient()

  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, name, name_kana')
    .order('name_kana')

  const children = (childrenRaw ?? []) as { id: string; name: string; name_kana: string | null }[]

  // 有効な支援計画の有無を取得
  const { data: plansRaw } = await supabase
    .from('support_plans')
    .select('child_id, status')

  const plansByChild = new Map<string, { count: number; hasActive: boolean }>()
  for (const p of (plansRaw ?? []) as { child_id: string; status: string }[]) {
    const existing = plansByChild.get(p.child_id) ?? { count: 0, hasActive: false }
    plansByChild.set(p.child_id, {
      count: existing.count + 1,
      hasActive: existing.hasActive || p.status === 'active',
    })
  }

  const childRows: Child[] = children.map((c) => ({
    id: c.id,
    name: c.name,
    name_kana: c.name_kana,
    planCount: plansByChild.get(c.id)?.count ?? 0,
    hasActive: plansByChild.get(c.id)?.hasActive ?? false,
  }))

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/documents" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">個別支援計画書</h1>
          <p className="text-sm text-gray-500 mt-0.5">印刷する児童を選択してください</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple-600" />
            児童一覧 ({childRows.length}名)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {childRows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">児童が登録されていません</p>
          ) : (
            <div className="space-y-1">
              {childRows.map((child) => (
                <Link
                  key={child.id}
                  href={`/documents/support-plan/${child.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{child.name}</p>
                      {child.name_kana && (
                        <p className="text-xs text-gray-400">{child.name_kana}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {child.planCount === 0 ? (
                      <span className="text-xs text-gray-400">計画なし</span>
                    ) : (
                      <>
                        <Badge variant={child.hasActive ? 'success' : 'secondary'} className="text-xs">
                          {child.hasActive ? '有効' : '下書き'}
                        </Badge>
                        <span className="text-xs text-gray-400">{child.planCount}件</span>
                      </>
                    )}
                    <span className="text-xs text-purple-500 group-hover:underline">印刷 →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
