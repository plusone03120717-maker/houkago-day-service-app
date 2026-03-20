import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Calendar, ChevronRight, ClipboardList, MessageSquare, Receipt } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Child = {
  id: string
  name: string
  name_kana: string | null
  gender: string
}

type Announcement = {
  id: string
  title: string
  content: string
  published_at: string
}

type Reservation = {
  id: string
  date: string
  status: string
  units: { name: string } | null
}

type ContactNote = {
  id: string
  date: string
  content: string
  published_at: string
  children: { name: string } | null
}

export default async function ParentHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 自分の子供を取得
  const { data: parentChildrenRaw } = await supabase
    .from('parent_children')
    .select('child_id, children (id, name, name_kana, gender)')
    .eq('user_id', user.id)
  const children = (parentChildrenRaw ?? []).map((pc) => pc.children as unknown as Child).filter(Boolean)

  const childIds = children.map((c) => c.id)

  // 今後1週間の利用予約
  const today = formatDate(new Date(), 'yyyy-MM-dd')
  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 7)
  const { data: reservationsRaw } = childIds.length > 0
    ? await supabase
        .from('usage_reservations')
        .select('id, date, status, units(name)')
        .in('child_id', childIds)
        .gte('date', today)
        .lte('date', formatDate(nextWeek, 'yyyy-MM-dd'))
        .in('status', ['confirmed', 'reserved'])
        .order('date')
        .limit(5)
    : { data: [] }
  const upcomingReservations = (reservationsRaw ?? []) as unknown as Reservation[]

  // 最新のお知らせ（3件）
  const { data: announcementsRaw } = await supabase
    .from('announcements')
    .select('id, title, content, published_at')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(3)
  const announcements = (announcementsRaw ?? []) as unknown as Announcement[]

  // 未読の連絡帳
  const { data: contactNotesRaw } = childIds.length > 0
    ? await supabase
        .from('contact_notes')
        .select('id, date, content, published_at, children(name)')
        .in('child_id', childIds)
        .not('published_at', 'is', null)
        .order('date', { ascending: false })
        .limit(3)
    : { data: [] }
  const contactNotes = (contactNotesRaw ?? []) as unknown as ContactNote[]

  // メッセージ未読数
  const { count: unreadCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', user.id)
    .is('read_at', null)

  return (
    <div className="space-y-5 pb-20 sm:pb-5">
      {/* 子供カード */}
      <div className="space-y-3">
        {children.map((child) => (
          <div
            key={child.id}
            className={`flex items-center gap-3 p-4 rounded-xl ${
              child.gender === 'male' ? 'bg-blue-50 border border-blue-100'
              : child.gender === 'female' ? 'bg-pink-50 border border-pink-100'
              : 'bg-gray-50 border border-gray-100'
            }`}
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                child.gender === 'male' ? 'bg-blue-200 text-blue-800'
                : child.gender === 'female' ? 'bg-pink-200 text-pink-800'
                : 'bg-gray-200 text-gray-800'
              }`}
            >
              {child.name.charAt(0)}
            </div>
            <div>
              <p className="font-bold text-gray-900">{child.name}</p>
              <p className="text-xs text-gray-400">{child.name_kana}</p>
            </div>
          </div>
        ))}
      </div>

      {/* クイックアクション */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/parent/contact-notes">
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
            <div className="p-2 bg-green-100 rounded-lg">
              <BookOpen className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">連絡帳</p>
              <p className="text-xs text-gray-400">今日の様子を確認</p>
            </div>
          </div>
        </Link>
        <Link href="/parent/attendance">
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <ClipboardList className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">出席確認</p>
              <p className="text-xs text-gray-400">出席記録・給付日数</p>
            </div>
          </div>
        </Link>
        <Link href="/parent/calendar">
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
            <div className="p-2 bg-teal-100 rounded-lg">
              <Calendar className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">利用予約</p>
              <p className="text-xs text-gray-400">申し込み・確認</p>
            </div>
          </div>
        </Link>
        <Link href="/parent/messages">
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:shadow-sm transition-shadow relative">
            <div className="p-2 bg-purple-100 rounded-lg">
              <MessageSquare className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">メッセージ</p>
              <p className="text-xs text-gray-400">施設との連絡</p>
            </div>
            {(unreadCount ?? 0) > 0 && (
              <span className="absolute top-2 right-2 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
        </Link>
        <Link href="/parent/invoices">
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Receipt className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">請求書</p>
              <p className="text-xs text-gray-400">月次請求の確認</p>
            </div>
          </div>
        </Link>
      </div>

      {/* 今週の予定 */}
      {upcomingReservations.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">今後の予定</h2>
            <Link href="/parent/calendar" className="text-xs text-indigo-600">すべて見る</Link>
          </div>
          <Card>
            <CardContent className="p-0 divide-y divide-gray-100">
              {upcomingReservations.map((res) => (
                <div key={res.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatDate(res.date, 'MM月dd日')}</p>
                    <p className="text-xs text-gray-400">{res.units?.name}</p>
                  </div>
                  <Badge variant={res.status === 'confirmed' ? 'success' : 'secondary'} className="text-xs">
                    {res.status === 'confirmed' ? '確定' : '予約済'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* 最新連絡帳 */}
      {contactNotes.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">最新の連絡帳</h2>
            <Link href="/parent/contact-notes" className="text-xs text-indigo-600">すべて見る</Link>
          </div>
          <div className="space-y-2">
            {contactNotes.map((note) => (
              <Link key={note.id} href={`/parent/contact-notes/${note.id}`}>
                <Card className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-indigo-600">
                        {formatDate(note.date, 'MM月dd日')}
                      </span>
                      {note.children && (
                        <span className="text-xs text-gray-400">{note.children.name}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{note.content}</p>
                    <div className="flex justify-end mt-2">
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* お知らせ */}
      {announcements.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">お知らせ</h2>
            <Link href="/parent/announcements" className="text-xs text-indigo-600">すべて見る</Link>
          </div>
          <div className="space-y-2">
            {announcements.map((ann) => (
              <Link key={ann.id} href={`/parent/announcements/${ann.id}`}>
                <Card className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{ann.title}</p>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatDate(ann.published_at)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ann.content}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
