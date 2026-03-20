import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, AlertTriangle, FileText, Edit, Pill, ClipboardList, Phone } from 'lucide-react'
import { formatDate, getAge } from '@/lib/utils'
import { EmergencyContactList } from '@/components/children/emergency-contact-form'

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

type AttendanceRecord = {
  id: string
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  units: { name: string } | null
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
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(today.getDate() - 30)

  const { data: recentAttendancesRaw } = await supabase
    .from('daily_attendance')
    .select('id, date, status, check_in_time, check_out_time, units(name)')
    .eq('child_id', id)
    .gte('date', formatDate(thirtyDaysAgo, 'yyyy-MM-dd'))
    .order('date', { ascending: false })
    .limit(10)
  const recentAttendances = (recentAttendancesRaw ?? []) as unknown as AttendanceRecord[]

  const { data: emergencyContactsRaw } = await supabase
    .from('emergency_contacts')
    .select('id, name, relationship, phone_primary, phone_secondary, is_primary_guardian, can_pickup, notes, sort_order')
    .eq('child_id', id)
    .order('sort_order')
  const emergencyContacts = (emergencyContactsRaw ?? []) as unknown as EmergencyContact[]

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
        <Link href={`/children/${id}/assessments`}>
          <Button variant="outline" size="sm">
            <ClipboardList className="h-4 w-4" />
            アセスメント
          </Button>
        </Link>
        <Link href={`/children/${id}/medications`}>
          <Button variant="outline" size="sm">
            <Pill className="h-4 w-4" />
            服薬管理
          </Button>
        </Link>
        <Link href={`/children/${id}/edit`}>
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4" />
            編集
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="生年月日" value={`${formatDate(child.birth_date)} (${getAge(child.birth_date)}歳)`} />
            <Row label="性別" value={child.gender === 'male' ? '男' : child.gender === 'female' ? '女' : 'その他'} />
            <Row label="住所" value={child.address} />
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
                        {isExpired ? (
                          <Badge variant="destructive">期限切れ</Badge>
                        ) : isExpiring ? (
                          <Badge variant="warning">残り{daysLeft}日</Badge>
                        ) : (
                          <Badge variant="success">有効</Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
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

        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">直近30日の出席記録</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAttendances.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">出席記録がありません</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentAttendances.map((att) => (
                  <div key={att.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-700">{formatDate(att.date)}</span>
                    <span className="text-xs text-gray-400">{att.units?.name}</span>
                    <div className="flex items-center gap-2">
                      {att.check_in_time && att.check_out_time && (
                        <span className="text-xs text-gray-500">
                          {att.check_in_time.slice(0, 5)} 〜 {att.check_out_time.slice(0, 5)}
                        </span>
                      )}
                      <Badge
                        variant={att.status === 'attended' ? 'success' : 'secondary'}
                        className="text-xs"
                      >
                        {att.status === 'attended' ? '出席' : att.status === 'absent' ? '欠席' : 'キャンセル待'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
