import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Bell } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'

type Announcement = {
  id: string
  title: string
  content: string
  target_type: string
  published_at: string
  units: { name: string } | null
}

export default async function ParentAnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: annRaw } = await supabase
    .from('announcements')
    .select('id, title, content, target_type, published_at, units:target_unit_id(name)')
    .eq('id', id)
    .not('published_at', 'is', null)
    .single()

  if (!annRaw) notFound()
  const ann = annRaw as unknown as Announcement

  return (
    <div className="space-y-4 pb-20 sm:pb-5">
      <div className="flex items-center gap-2">
        <Link href="/parent/announcements" className="p-2 rounded-lg hover:bg-gray-100">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-bold text-gray-900 flex-1 line-clamp-1">{ann.title}</h1>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Bell className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{formatDate(ann.published_at, 'yyyy年MM月dd日')}</p>
              {ann.target_type !== 'all' && ann.units && (
                <p className="text-xs text-indigo-500">{ann.units.name} 向け</p>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
        </CardContent>
      </Card>
    </div>
  )
}
