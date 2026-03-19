import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Calendar, ClipboardList, Receipt } from 'lucide-react'

type Unit = { id: string; name: string }

const now = new Date()
const currentYear = now.getFullYear()
const currentMonth = now.getMonth() + 1
const yearMonth = `${currentYear}${String(currentMonth).padStart(2, '0')}`

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const params = await searchParams
  const year = parseInt(params.year ?? String(currentYear))
  const month = parseInt(params.month ?? String(currentMonth))
  const ym = `${year}${String(month).padStart(2, '0')}`

  const supabase = await createClient()

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)

  const documents = [
    {
      icon: ClipboardList,
      label: 'サービス提供実績記録票',
      description: '月次の利用実績・送迎記録の帳票',
      color: 'text-indigo-600',
      bg: 'bg-indigo-100',
      href: `/documents/service-record?year=${year}&month=${month}`,
    },
    {
      icon: Calendar,
      label: 'シフト表',
      description: 'スタッフの月次シフト一覧',
      color: 'text-teal-600',
      bg: 'bg-teal-100',
      href: `/documents/shift-table?year=${year}&month=${month}`,
    },
    {
      icon: FileText,
      label: '個別支援計画書',
      description: '支援計画のPDF出力（児童選択）',
      color: 'text-purple-600',
      bg: 'bg-purple-100',
      href: `/support-plans`,
    },
    {
      icon: Receipt,
      label: '請求書・領収書',
      description: '保護者向け請求書・領収書の発行',
      color: 'text-orange-600',
      bg: 'bg-orange-100',
      href: `/billing/${ym}`,
    },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">帳票出力</h1>
        <p className="text-sm text-gray-500 mt-0.5">各種帳票の確認・印刷・出力</p>
      </div>

      {/* 年月選択 */}
      <div className="flex items-center gap-3">
        <Link
          href={`/documents?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
        >
          ‹
        </Link>
        <span className="text-sm font-semibold">{year}年{month}月</span>
        <Link
          href={`/documents?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
        >
          ›
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {documents.map((doc) => {
          const Icon = doc.icon
          return (
            <Link key={doc.label} href={doc.href}>
              <Card className="hover:bg-gray-50 transition-colors cursor-pointer h-full">
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${doc.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`h-6 w-6 ${doc.color}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{doc.label}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{doc.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* ユニット別サービス提供実績 */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          ユニット別 サービス提供実績記録票
        </h2>
        <div className="space-y-2">
          {units.map((unit) => (
            <Link
              key={unit.id}
              href={`/documents/service-record?year=${year}&month=${month}&unit=${unit.id}`}
            >
              <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ClipboardList className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm font-medium text-gray-900">{unit.name}</span>
                  </div>
                  <span className="text-xs text-indigo-600 hover:underline">印刷用を開く →</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
