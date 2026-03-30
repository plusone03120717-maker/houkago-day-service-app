import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UserPlus, AlertTriangle, Search } from 'lucide-react'
import { formatDate, getAge, formatWareki } from '@/lib/utils'

type Child = {
  id: string
  name: string
  name_kana: string | null
  birth_date: string
  gender: string
  disability_type: string | null
  allergy_info: string | null
  photo_url: string | null
  benefit_certificates: Array<{
    id: string
    end_date: string
    service_type: string
    max_days_per_month: number
  }>
  children_units: Array<{
    units: { id: string; name: string; service_type: string } | null
  }>
}

export default async function ChildrenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('children')
    .select(`
      id, name, name_kana, birth_date, gender, disability_type, allergy_info, photo_url,
      benefit_certificates (id, end_date, service_type, max_days_per_month),
      children_units (units (id, name, service_type))
    `)
    .order('name_kana')

  if (params.q) {
    query = query.or(`name.ilike.%${params.q}%,name_kana.ilike.%${params.q}%`)
  }

  const { data: childrenRaw } = await query
  const children = (childrenRaw ?? []) as unknown as Child[]

  const today = new Date()
  const thirtyDaysLater = new Date()
  thirtyDaysLater.setDate(today.getDate() + 30)

  const childrenWithAlerts = children.map((child) => {
    const expiringCert = child.benefit_certificates?.find((cert) => {
      const endDate = new Date(cert.end_date)
      return endDate >= today && endDate <= thirtyDaysLater
    })
    const expiredCert = child.benefit_certificates?.find((cert) => new Date(cert.end_date) < today)
    return { ...child, expiringCert, expiredCert }
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">児童管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">登録児童: {children.length}名</p>
        </div>
        <Link href="/children/new">
          <Button>
            <UserPlus className="h-4 w-4" />
            新規登録
          </Button>
        </Link>
      </div>

      <form method="GET" className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          name="q"
          defaultValue={params.q}
          placeholder="名前・かなで検索..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
        />
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {childrenWithAlerts.map((child) => (
          <Link key={child.id} href={`/children/${child.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                      child.gender === 'male' ? 'bg-blue-100 text-blue-700'
                      : child.gender === 'female' ? 'bg-pink-100 text-pink-700'
                      : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {child.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{child.name}</span>
                      {child.expiredCert && <Badge variant="destructive" className="text-xs">証期限切れ</Badge>}
                      {!child.expiredCert && child.expiringCert && <Badge variant="warning" className="text-xs">証期限間近</Badge>}
                      {child.allergy_info && <Badge variant="destructive" className="text-xs">AL</Badge>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{child.name_kana}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>{getAge(child.birth_date)}歳</span>
                      <span>{formatWareki(child.birth_date)} 生</span>
                    </div>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {child.children_units?.map((cu) => cu.units && (
                        <Badge key={cu.units.id} variant="secondary" className="text-xs">
                          {cu.units.name}
                        </Badge>
                      ))}
                    </div>
                    {child.expiringCert && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-yellow-600">
                        <AlertTriangle className="h-3 w-3" />
                        受給者証: {formatDate(child.expiringCert.end_date)} まで
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {children.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>登録されている児童がいません</p>
        </div>
      )}
    </div>
  )
}
