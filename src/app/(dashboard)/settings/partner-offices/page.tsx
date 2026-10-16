import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { PartnerOfficesForm, type PartnerOfficeRow } from '@/components/settings/partner-offices-form'

/**
 * 上限管理でやり取りする他事業所の FAX 番号。
 * 上限管理の一覧表・結果票を「jFax で送る」ときの宛先になる。
 * 請求をする職員（スタッフ）も直せるよう、管理者だけに絞らない。
 */
export default async function PartnerOfficesSettingsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin' && user.role !== 'staff' && user.role !== null) redirect('/')
  const supabase = await createClient()
  const { data } = await supabase
    .from('partner_offices')
    .select('id, name, office_number, fax_number, aliases, note')
    .order('name')

  const rows: PartnerOfficeRow[] = (
    (data ?? []) as Array<{
      id: string
      name: string
      office_number: string | null
      fax_number: string
      aliases: string[] | null
      note: string
    }>
  ).map((o) => ({
    id: o.id,
    name: o.name,
    officeNumber: o.office_number ?? '',
    faxNumber: o.fax_number,
    aliases: (o.aliases ?? []).join('、'),
    note: o.note,
  }))

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">他事業所の FAX 番号</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            上限管理の一覧表・結果票を「jFax で送る」ときの宛先です
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 text-sm text-gray-600 space-y-1.5">
          <p>
            送り先は、上限管理事業所の<strong>事業所番号</strong>で決まります。番号がわからない事業所は、
            受給者証や上限管理事業所情報に書かれている呼び方（「LUPE」など）を<strong>別名</strong>に入れると、名前で決まります。
          </p>
          <p>決まらないときは、送る画面で職員が送り先を選びます。</p>
        </CardContent>
      </Card>

      <PartnerOfficesForm initial={rows} />
    </div>
  )
}
