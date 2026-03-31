import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bell } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { AnnouncementForm } from '@/components/announcements/announcement-form'

type Announcement = {
  id: string
  title: string
  content: string
  target_type: string
  published_at: string | null
  created_at: string
  units: { name: string } | null
}

type Unit = { id: string; name: string }

export default async function AnnouncementsPage() {
  const supabase = await createClient()

  const { data: announcementsRaw } = await supabase
    .from('announcements')
    .select('id, title, content, target_type, published_at, created_at, units:target_unit_id(name)')
    .order('created_at', { ascending: false })
    .limit(50)
  const announcements = (announcementsRaw ?? []) as unknown as Announcement[]

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  const { data: facilityRaw } = await supabase
    .from('facilities')
    .select('id')
    .limit(1)
    .single()
  const facilityId = facilityRaw?.id ?? ''

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">お知らせ管理</h1>
        <p className="text-sm text-gray-500 mt-0.5">保護者向けお知らせの作成・管理</p>
      </div>

      {/* 新規作成フォーム */}
      <AnnouncementForm units={units} facilityId={facilityId} />

      {/* 一覧 */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-700">過去のお知らせ</h2>
        {announcements.map((ann) => (
          <Card key={ann.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bell className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{ann.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{ann.content}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-400">{formatDate(ann.created_at)}</span>
                      <Badge variant="secondary" className="text-xs">
                        {ann.target_type === 'all' ? '全保護者' : ann.units?.name ?? 'ユニット限定'}
                      </Badge>
                    </div>
                  </div>
                </div>
                <Badge variant={ann.published_at ? 'success' : 'secondary'} className="flex-shrink-0">
                  {ann.published_at ? '公開中' : '下書き'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {announcements.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">お知らせがありません</div>
        )}
      </div>
    </div>
  )
}
