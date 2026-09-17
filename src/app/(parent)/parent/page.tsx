import { createClient } from '@/lib/supabase/server'
import { getSessionUserId } from '@/lib/auth'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, CalendarCheck, Receipt } from 'lucide-react'
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

export default async function ParentHomePage() {
  const supabase = await createClient()
  const userId = await getSessionUserId()
  if (!userId) return null

  // 自分の子供を取得
  const { data: parentChildrenRaw } = await supabase
    .from('parent_children')
    .select('child_id, children (id, name, name_kana, gender)')
    .eq('user_id', userId)
  const children = (parentChildrenRaw ?? []).map((pc) => pc.children as unknown as Child).filter(Boolean)

  // 最新のお知らせ（3件）。連絡帳は準備中のあいだ画面に出さないので取りにいかない
  const { data: announcementsRaw } = await supabase
    .from('announcements')
    .select('id, title, content, published_at')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(3)
  const announcements = (announcementsRaw ?? []) as unknown as Announcement[]

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

      {/* クイックアクション。利用の連絡も利用済みの実績も利用連絡の画面にまとめてある */}
      <Link href="/parent/usage-contacts">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
          <div className="p-2 bg-green-100 rounded-lg">
            <CalendarCheck className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">利用連絡</p>
            <p className="text-xs text-gray-400">利用の連絡・利用予定・給付日数</p>
          </div>
        </div>
      </Link>

      {/* 準備中の機能。隠さずに並べて、今後使えるようになることを伝える */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: BookOpen, label: '連絡帳', desc: '今日の様子を確認' },
          { icon: Receipt, label: '明細', desc: '月次請求の確認' },
        ].map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            aria-disabled="true"
            className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-3"
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <Icon className="h-5 w-5 text-gray-400" />
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-gray-400">
                {label}
                <span className="text-[10px] rounded-full bg-gray-200 px-1.5 py-0.5 text-gray-500">
                  準備中
                </span>
              </p>
              <p className="text-xs text-gray-300">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 最新の連絡帳は、連絡帳が準備中のあいだは出さない。
          画面ごとは残してあるので、公開するときはここを戻すだけでよい。 */}

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
