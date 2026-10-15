import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import {
  BillingNoticeRecipientsForm,
  type BillingNoticeStaff,
} from '@/components/settings/billing-notice-recipients-form'

/**
 * 国保連請求の月初お知らせの受け取り先（請求担当）を選ぶ。
 * 毎月1日の朝、前月分の集計結果と要確認をここで選んだスタッフへ LINE で送る。
 */
export default async function BillingNoticeSettingsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data } = await supabase
    .from('staff_members')
    .select('id, name, line_user_id, receives_billing_notice')
    .order('name')

  const staff: BillingNoticeStaff[] = (
    (data ?? []) as Array<{ id: string; name: string; line_user_id: string | null; receives_billing_notice: boolean }>
  ).map((s) => ({
    id: s.id,
    name: s.name,
    hasLine: !!s.line_user_id,
    receives: s.receives_billing_notice,
  }))

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">国保連請求の月初お知らせ</h1>
          <p className="text-sm text-gray-500 mt-0.5">前月分の集計結果と要確認を LINE で受け取る請求担当を選びます</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">お知らせの内容</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600 space-y-1.5">
          <p>毎月1日の朝7時に、アプリが前月分を全ユニット集計し、次の内容を送ります。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>ユニットごとの人数・日数・請求額</li>
            <li>直してほしいところ（受給者証の期限切れ・提供時間の入力漏れなど）</li>
            <li>上限管理で FAX のやり取りが要る児童（送り先の事業所番号が未登録なども）</li>
          </ul>
          <p>
            まだ誰も手を付けていない月だけ「出席実績から再集計」と同じ処理で明細を作ります。
            手入力した明細・確定済みの児童がある月は書き換えず、集計結果を知らせるだけです。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">受け取るスタッフ</CardTitle>
        </CardHeader>
        <CardContent>
          <BillingNoticeRecipientsForm initial={staff} />
        </CardContent>
      </Card>
    </div>
  )
}
