import { createClient } from '@/lib/supabase/server'
import { AnnouncementForm } from '@/components/announcements/announcement-form'
import { AnnouncementItem, type AnnouncementItemData } from '@/components/announcements/announcement-item'

type Unit = { id: string; name: string }

export default async function AnnouncementsPage() {
  const supabase = await createClient()

  const { data: announcementsRaw } = await supabase
    .from('announcements')
    .select('id, title, content, target_type, target_unit_id, published_at, created_at, updated_at, units:target_unit_id(name)')
    .order('created_at', { ascending: false })
    .limit(50)
  const announcements = (announcementsRaw ?? []) as unknown as AnnouncementItemData[]

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
          <AnnouncementItem key={ann.id} announcement={ann} units={units} />
        ))}
        {announcements.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">お知らせがありません</div>
        )}
      </div>
    </div>
  )
}
