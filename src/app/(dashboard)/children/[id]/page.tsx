import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, AlertTriangle, FileText, Edit, Phone, BookOpen, ClipboardList, Pill, BarChart2, ShieldAlert, CalendarDays, Building2 } from 'lucide-react'
import { formatDate, getAge, formatWareki } from '@/lib/utils'
import { EmergencyContactList } from '@/components/children/emergency-contact-form'
import { ParentInviteButton } from '@/components/children/parent-invite-button'

type Cert = {
  id: string
  certificate_number: string
  service_type: string
  start_date: string
  end_date: string
  max_days_per_month: number
  copay_limit: number
  copay_category: string | null
  municipality: string | null
}

type ChildUnit = {
  units: { id: string; name: string; service_type: string; facilities: { name: string } | null } | null
}

type Child = {
  id: string
  name: string
  name_kana: string | null
  birth_date: string
  gender: string
  address: string | null
  school_name: string | null
  grade: string | null
  disability_type: string | null
  allergy_info: string | null
  medical_info: string | null
  notes: string | null
  benefit_certificates: Cert[]
  children_units: ChildUnit[]
}

type EmergencyContact = {
  id: string
  name: string
  relationship: string
  phone_primary: string
  phone_secondary: string | null
  is_primary_guardian: boolean
  can_pickup: boolean
  notes: string | null
  sort_order: number
}

type LimitManagement = {
  id: string
  start_date: string
  facility_name: string
}

export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: childRaw } = await supabase
    .from('children')
    .select(`
      id, name, name_kana, birth_date, gender, address, school_name, grade,
      disability_type, allergy_info, medical_info, notes,
      benefit_certificates (id, certificate_number, service_type, start_date, end_date, max_days_per_month, copay_limit, copay_category, municipality),
      children_units (units (id, name, service_type, facilities (name)))
    `)
    .eq('id', id)
    .single()

  if (!childRaw) notFound()
  const child = childRaw as unknown as Child

  const today = new Date()

  const { data: emergencyContactsRaw } = await supabase
    .from('emergency_contacts')
    .select('id, name, relationship, phone_primary, phone_secondary, is_primary_guardian, can_pickup, notes, sort_order')
    .eq('child_id', id)
    .order('sort_order')
  const emergencyContacts = (emergencyContactsRaw ?? []) as unknown as EmergencyContact[]

  const { data: addressesRaw } = await supabase
    .from('child_addresses')
    .select('id, label, postal_code, address, is_default')
    .eq('child_id', id)
    .order('sort_order')
  type ChildAddress = { id: string; label: string; postal_code: string | null; address: string; is_default: boolean }
  const childAddresses = (addressesRaw ?? []) as unknown as ChildAddress[]

  const { data: phonesRaw } = await supabase
    .from('child_phone_numbers')
    .select('id, label, phone_number')
    .eq('child_id', id)
    .order('sort_order')
  type ChildPhone = { id: string; label: string; phone_number: string }
  const childPhones = (phonesRaw ?? []) as unknown as ChildPhone[]

  const { data: limitManagementsRaw } = await supabase
    .from('child_limit_management')
    .select('id, start_date, facility_name')
    .eq('child_id', id)
    .order('start_date', { ascending: false })
  const limitManagements = (limitManagementsRaw ?? []) as unknown as LimitManagement[]

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/children" className="p-2 rounded-lg hover:bg-gray-100">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{child.name}</h1>
          <p className="text-sm text-gray-500">{child.name_kana}</p>
        </div>
        <Link href={`/children/${id}/edit`}>
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4" />
            編集
          </Button>
        </Link>
        <ParentInviteButton childId={id} childName={child.name} />
      </div>

      {/* クイックアクセス */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { href: `/children/${id}/contact-notes`, icon: BookOpen, label: '連絡帳', color: 'text-blue-600 bg-blue-50' },
          { href: `/support-plans/${id}`, icon: ClipboardList, label: '個別支援計画', color: 'text-indigo-600 bg-indigo-50' },
          { href: `/support-plans/${id}/monitoring`, icon: BarChart2, label: 'モニタリング', color: 'text-violet-600 bg-violet-50' },
          { href: `/attendance/child/${id}`, icon: CalendarDays, label: '支援記録', color: 'text-teal-600 bg-teal-50' },
          { href: `/children/${id}/schedule`, icon: CalendarDays, label: '利用スケジュール', color: 'text-cyan-600 bg-cyan-50' },
          { href: `/children/${id}/assessments`, icon: BarChart2, label: 'アセスメント', color: 'text-purple-600 bg-purple-50' },
          { href: `/children/${id}/medications`, icon: Pill, label: '服薬管理', color: 'text-green-600 bg-green-50' },
          { href: `/incidents?childId=${id}`, icon: ShieldAlert, label: '事故報告', color: 'text-red-600 bg-red-50' },
        ].map(({ href, icon: Icon, label, color }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium text-gray-700">{label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="生年月日" value={`${formatWareki(child.birth_date)}（${getAge(child.birth_date)}歳）`} />
            <Row label="性別" value={child.gender === 'male' ? '男' : child.gender === 'female' ? '女' : 'その他'} />
            {childAddresses.length > 0 ? (
              <div>
                <p className="text-xs text-gray-500 mb-1">住所</p>
                <div className="space-y-1">
                  {childAddresses.map((a) => (
                    <div key={a.id} className="flex items-start gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${a.is_default ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                        {a.label}
                      </span>
                      <span className="text-gray-800">{a.address}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Row label="住所" value={child.address} />
            )}
            {childPhones.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">電話番号</p>
                <div className="space-y-1">
                  {childPhones.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-600 shrink-0">{p.label}</span>
                      <span className="text-gray-800">{p.phone_number}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Row label="学校名" value={child.school_name} />
            <Row label="学年" value={child.grade} />
            <Row label="障害種別" value={child.disability_type} />
            {child.allergy_info && (
              <div className="flex items-start gap-2 p-2 bg-red-50 rounded">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-700">アレルギー情報</p>
                  <p className="text-red-600">{child.allergy_info}</p>
                </div>
              </div>
            )}
            {child.medical_info && (
              <div className="p-2 bg-blue-50 rounded">
                <p className="font-medium text-blue-700">医療的ケア</p>
                <p className="text-blue-600">{child.medical_info}</p>
              </div>
            )}
            {child.notes && (
              <div>
                <p className="font-medium text-gray-600">特記事項</p>
                <p className="text-gray-700 mt-1">{child.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">所属ユニット</CardTitle>
          </CardHeader>
          <CardContent>
            {child.children_units.map((cu) => {
              const unit = cu.units
              if (!unit) return null
              return (
                <div key={unit.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{unit.name}</p>
                    <p className="text-xs text-gray-400">{unit.facilities?.name}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {unit.service_type === 'afterschool' ? '放デイ' : '児発'}
                  </Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">受給者証</CardTitle>
              <Link href={`/children/${id}/certificates/new`}>
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4" />
                  追加
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {child.benefit_certificates.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">受給者証が登録されていません</p>
            ) : (
              <div className="space-y-3">
                {child.benefit_certificates.map((cert) => {
                  const endDate = new Date(cert.end_date)
                  const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                  const isExpired = daysLeft < 0
                  const isExpiring = !isExpired && daysLeft <= 30

                  return (
                    <div key={cert.id} className={`p-3 rounded-lg border ${isExpired ? 'border-red-200 bg-red-50' : isExpiring ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">証番号: {cert.certificate_number}</span>
                            <Badge variant="secondary" className="text-xs">
                              {cert.service_type === 'afterschool' ? '放デイ' : '児発'}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-xs text-gray-600">
                            <span>有効期間: {formatDate(cert.start_date)} 〜 {formatDate(cert.end_date)}</span>
                            <span>月の給付量: {cert.max_days_per_month}日</span>
                            <span>負担上限月額: {cert.copay_limit.toLocaleString()}円</span>
                            {cert.municipality && <span>支給決定自治体: {cert.municipality}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
                          {isExpired ? (
                            <Badge variant="destructive">期限切れ</Badge>
                          ) : isExpiring ? (
                            <Badge variant="warning">残り{daysLeft}日</Badge>
                          ) : (
                            <Badge variant="success">有効</Badge>
                          )}
                          <Link href={`/children/${id}/certificates/${cert.id}`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs">
                              <Edit className="h-3 w-3" />
                              編集
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 上限管理事業所 */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-orange-500" />
                上限管理事業所情報
              </CardTitle>
              <Link href={`/children/${id}/limit-management/new`}>
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4" />
                  追加
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {limitManagements.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">上限管理事業所が登録されていません</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {limitManagements.map((lm) => (
                  <div key={lm.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{lm.facility_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        適用開始: {formatWareki(lm.start_date)}から
                      </p>
                    </div>
                    <Link href={`/children/${id}/limit-management/${lm.id}`}>
                      <Button variant="outline" size="sm">
                        <Edit className="h-3.5 w-3.5" />
                        編集
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4 text-red-500" />
              緊急連絡先
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmergencyContactList childId={id} contacts={emergencyContacts} />
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-3">
      <span className="text-gray-500 w-24 flex-shrink-0">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  )
}
