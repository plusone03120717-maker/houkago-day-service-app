import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Receipt, FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Invoice = {
  id: string
  year_month: string
  invoice_type: string
  copay_amount: number
  actual_cost_total: number
  total_amount: number
  issued_at: string | null
  pdf_url: string | null
  children: { name: string } | null
}

export default async function ParentInvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: parentChildrenRaw } = await supabase
    .from('parent_children')
    .select('child_id')
    .eq('user_id', user.id)
  const childIds = (parentChildrenRaw ?? []).map((pc) => pc.child_id as string)

  const { data: invoicesRaw } = childIds.length > 0
    ? await supabase
        .from('billing_invoices')
        .select('id, year_month, invoice_type, copay_amount, actual_cost_total, total_amount, issued_at, pdf_url, children(name)')
        .in('child_id', childIds)
        .order('year_month', { ascending: false })
        .limit(24)
    : { data: [] }
  const invoices = (invoicesRaw ?? []) as unknown as Invoice[]

  const typeLabel: Record<string, string> = {
    invoice: '請求書',
    receipt: '領収書',
    proxy_notice: '代理受領通知書',
  }

  const grouped = invoices.reduce<Record<string, Invoice[]>>((acc, inv) => {
    if (!acc[inv.year_month]) acc[inv.year_month] = []
    acc[inv.year_month].push(inv)
    return acc
  }, {})

  return (
    <div className="space-y-5 pb-20 sm:pb-5">
      <h1 className="text-lg font-bold text-gray-900">請求書・領収書</h1>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          請求書がまだありません
        </div>
      ) : (
        Object.entries(grouped).map(([yearMonth, monthInvoices]) => {
          const y = yearMonth.slice(0, 4)
          const m = yearMonth.slice(4, 6)
          return (
            <section key={yearMonth}>
              <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">
                {y}年{m}月
              </h2>
              <div className="space-y-2">
                {monthInvoices.map((inv) => (
                  <Card key={inv.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Receipt className="h-4 w-4 text-orange-500" />
                          <span className="font-medium text-sm text-gray-900">
                            {typeLabel[inv.invoice_type] ?? inv.invoice_type}
                          </span>
                          {inv.children && (
                            <span className="text-xs text-gray-400">{inv.children.name}</span>
                          )}
                        </div>
                        {inv.issued_at && (
                          <span className="text-xs text-gray-400">{formatDate(inv.issued_at)}</span>
                        )}
                      </div>

                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between text-gray-600">
                          <span>利用者負担額</span>
                          <span>{inv.copay_amount.toLocaleString()}円</span>
                        </div>
                        {inv.actual_cost_total > 0 && (
                          <div className="flex justify-between text-gray-600">
                            <span>実費</span>
                            <span>{inv.actual_cost_total.toLocaleString()}円</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-100">
                          <span>合計</span>
                          <span>{inv.total_amount.toLocaleString()}円</span>
                        </div>
                      </div>

                      {inv.pdf_url && (
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 mt-3 text-xs text-indigo-600 hover:underline"
                        >
                          <FileText className="h-3 w-3" />
                          PDFを開く
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
