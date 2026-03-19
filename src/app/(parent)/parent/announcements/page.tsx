import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Bell, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Announcement = {
  id: string
  title: string
  content: string
  target_type: string
  published_at: string
  units: { name: string } | null
}

export default async function ParentAnnouncementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 保護者が所属するユニットを取得
  const { data: parentChildrenRaw } = await supabase
    .from('parent_children')
    .select('children(children_units(unit_id))')
    .eq('user_id', user.id)
  type PCRow = { children: { children_units: { unit_id: string }[] } | null }
  const unitIds = (parentChildrenRaw ?? []).flatMap((pc) => {
    const r = pc as unknown as PCRow
    return r.children?.children_units.map((cu) => cu.unit_id) ?? []
  })

  // 公開中のお知らせ（全体 or 自分のユニット宛）
  const { data: announcementsRaw } = await supabase
    .from('announcements')
    .select('id, title, content, target_type, published_at, units:target_unit_id(name)')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(100)

  const announcements = ((announcementsRaw ?? []) as unknown as Announcement[]).filter(
    (ann) =>
      ann.target_type === 'all' ||
      unitIds.length === 0 ||
      ann.units !== null
  )

  return (
    <div className="space-y-4 pb-20 sm:pb-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">お知らせ</h1>
        <p className="text-xs text-gray-400 mt-0.5">施設からのお知らせ一覧</p>
      </div>

      {announcements.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          <Bell className="h-8 w-8 mx-auto mb-3 opacity-30" />
          お知らせはありません
        </div>
      ) : (
        <div className="space-y-2">
          {announcements.map((ann) => (
            <Link key={ann.id} href={`/parent/announcements/${ann.id}`}>
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bell className="h-4 w-4 text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 line-clamp-1">{ann.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ann.content}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-gray-400">{formatDate(ann.published_at)}</span>
                        {ann.target_type !== 'all' && ann.units && (
                          <span className="text-xs text-indigo-500">{ann.units.name}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
