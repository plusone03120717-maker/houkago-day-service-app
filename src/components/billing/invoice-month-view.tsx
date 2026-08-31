'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Printer,
  Receipt,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { issueInvoices, recordPayment, deleteInvoice } from '@/app/actions/invoices'
import type { ChildInvoice } from '@/lib/billing/copay-invoice'

const CATEGORY_LABEL: Record<string, string> = {
  copay: '放デイ1割',
  daytime: '日中一時1割',
  daytime_transport: '日中一時送迎',
  extra: '活動プログラム',
  actual: '実費',
}

const CATEGORY_COLOR: Record<string, string> = {
  copay: 'bg-indigo-50 text-indigo-700',
  daytime: 'bg-purple-50 text-purple-700',
  daytime_transport: 'bg-purple-50 text-purple-700',
  extra: 'bg-amber-50 text-amber-700',
  actual: 'bg-gray-100 text-gray-600',
}

export function InvoiceMonthView({
  unitId,
  unitName,
  yearMonth,
  invoices,
}: {
  unitId: string
  unitName: string
  yearMonth: string
  invoices: ChildInvoice[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [paymentFor, setPaymentFor] = useState<string | null>(null)
  const [paidAt, setPaidAt] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('現金')
  const [receiptNo, setReceiptNo] = useState('')

  const billable = useMemo(() => invoices.filter((c) => c.total > 0), [invoices])
  const totalAmount = billable.reduce((s, c) => s + c.total, 0)
  const issuedCount = billable.filter((c) => c.issued).length
  const paidCount = billable.filter((c) => c.issued?.paidAt).length
  const outdated = billable.filter((c) => c.issued && c.issued.totalAmount !== c.total)

  const allSelected = selected.length > 0 && selected.length === billable.length
  const toggleAll = () => setSelected(allSelected ? [] : billable.map((c) => c.childId))
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const handleIssue = async (childIds?: string[]) => {
    setBusy(true)
    setMessage(null)
    const res = await issueInvoices(unitId, yearMonth, childIds)
    setBusy(false)
    if (res.error) {
      setMessage({ type: 'error', text: res.error })
      return
    }
    setMessage({
      type: 'ok',
      text: `${res.issuedCount}名分の請求書を発行しました（合計 ${res.totalAmount.toLocaleString()}円）${
        res.skipped.length > 0 ? ` / 請求額0円のため除外: ${res.skipped.join('、')}` : ''
      }`,
    })
    setSelected([])
    startTransition(() => router.refresh())
  }

  const handlePayment = async (invoiceId: string, clear = false) => {
    setBusy(true)
    const res = await recordPayment(invoiceId, yearMonth, {
      paidAt: clear ? null : paidAt || null,
      paymentMethod: clear ? null : paymentMethod,
      receiptNo: clear ? null : receiptNo || null,
    })
    setBusy(false)
    if (res.error) {
      setMessage({ type: 'error', text: res.error })
      return
    }
    setPaymentFor(null)
    setReceiptNo('')
    startTransition(() => router.refresh())
  }

  const handleDelete = async (invoiceId: string) => {
    if (!confirm('発行済みの請求書を取り消しますか？（保護者アプリからも見えなくなります）')) return
    setBusy(true)
    const res = await deleteInvoice(invoiceId, yearMonth)
    setBusy(false)
    if (res.error) setMessage({ type: 'error', text: res.error })
    startTransition(() => router.refresh())
  }

  const printHref = (type: 'invoice' | 'receipt', childIds?: string[]) => {
    const ids = childIds ?? (selected.length > 0 ? selected : billable.map((c) => c.childId))
    return `/print/invoice/${yearMonth}?unit=${unitId}&type=${type}&children=${ids.join(',')}`
  }

  return (
    <div className="space-y-4">
      {/* サマリー */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-gray-500">請求対象</p>
              <p className="text-lg font-bold text-gray-900">{billable.length}名</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">請求額合計</p>
              <p className="text-lg font-bold text-gray-900">{totalAmount.toLocaleString()}円</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">発行済み</p>
              <p className="text-lg font-bold text-gray-900">
                {issuedCount}<span className="text-sm font-normal text-gray-400"> / {billable.length}名</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">入金済み</p>
              <p className="text-lg font-bold text-gray-900">
                {paidCount}<span className="text-sm font-normal text-gray-400"> / {billable.length}名</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => handleIssue(selected.length > 0 ? selected : undefined)} disabled={busy || billable.length === 0}>
              <RefreshCw className="h-4 w-4" />
              {selected.length > 0 ? `${selected.length}名を発行` : '全員分を発行'}
            </Button>
            <Link href={printHref('invoice')} target="_blank">
              <Button variant="outline" disabled={billable.length === 0}>
                <Printer className="h-4 w-4" />
                請求書を印刷
              </Button>
            </Link>
            <Link href={printHref('receipt')} target="_blank">
              <Button variant="outline" disabled={billable.length === 0}>
                <Receipt className="h-4 w-4" />
                領収書を印刷
              </Button>
            </Link>
          </div>
        </div>

        {outdated.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              発行後に実績が変わった児童が{outdated.length}名います（{outdated.map((c) => c.childName).join('、')}）。
              「発行」を実行すると最新の金額で上書きされます。
            </span>
          </div>
        )}

        {message && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              message.type === 'ok'
                ? 'border border-green-200 bg-green-50 text-green-800'
                : 'border border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* 児童別一覧 */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-xs font-medium text-gray-500">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-indigo-600" />
          <span className="flex-1">{unitName} の利用者（{invoices.length}名）</span>
        </div>

        {invoices.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-gray-400">この月の利用実績がありません</p>
        )}

        <div className="divide-y divide-gray-100">
          {invoices.map((child) => {
            const open = expanded === child.childId
            const changed = child.issued && child.issued.totalAmount !== child.total
            return (
              <div key={child.childId}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(child.childId)}
                    onChange={() => toggle(child.childId)}
                    disabled={child.total <= 0}
                    className="h-4 w-4 accent-indigo-600 disabled:opacity-30"
                  />
                  <button
                    onClick={() => setExpanded(open ? null : child.childId)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="font-medium text-gray-900">{child.childName}</span>
                    {child.warnings.length > 0 && (
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    )}
                  </button>

                  <div className="hidden sm:flex items-center gap-1.5">
                    {child.benefitCopay > 0 && (
                      <span className="rounded px-1.5 py-0.5 text-xs bg-indigo-50 text-indigo-700">
                        放デイ {child.benefitCopay.toLocaleString()}
                      </span>
                    )}
                    {child.daytimeCopay + child.daytimeTransportAmount > 0 && (
                      <span className="rounded px-1.5 py-0.5 text-xs bg-purple-50 text-purple-700">
                        日中一時 {(child.daytimeCopay + child.daytimeTransportAmount).toLocaleString()}
                      </span>
                    )}
                    {child.extraTotal > 0 && (
                      <span className="rounded px-1.5 py-0.5 text-xs bg-amber-50 text-amber-700">
                        加算 {child.extraTotal.toLocaleString()}
                      </span>
                    )}
                    {child.actualTotal > 0 && (
                      <span className="rounded px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600">
                        実費 {child.actualTotal.toLocaleString()}
                      </span>
                    )}
                  </div>

                  <span className="w-24 text-right font-bold text-gray-900">
                    {child.total.toLocaleString()}円
                  </span>

                  <div className="w-24 text-right">
                    {child.issued?.paidAt ? (
                      <Badge variant="success">入金済</Badge>
                    ) : child.issued ? (
                      <Badge variant={changed ? 'warning' : 'default'}>{changed ? '要再発行' : '発行済'}</Badge>
                    ) : child.total > 0 ? (
                      <Badge variant="secondary">未発行</Badge>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-4 py-3">
                    {child.warnings.length > 0 && (
                      <ul className="space-y-1">
                        {child.warnings.map((w, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                            {w}
                          </li>
                        ))}
                      </ul>
                    )}

                    {child.lines.length === 0 ? (
                      <p className="text-sm text-gray-400">請求対象の項目がありません</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500">
                            <th className="w-24 text-left font-medium">区分</th>
                            <th className="text-left font-medium">項目</th>
                            <th className="w-20 text-right font-medium">単価</th>
                            <th className="w-14 text-right font-medium">数量</th>
                            <th className="w-24 text-right font-medium">金額</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {child.lines.map((line, i) => (
                            <tr key={i}>
                              <td className="py-1.5">
                                <span className={`rounded px-1.5 py-0.5 text-xs ${CATEGORY_COLOR[line.category]}`}>
                                  {CATEGORY_LABEL[line.category]}
                                </span>
                              </td>
                              <td className="py-1.5 text-gray-800">
                                {line.name}
                                {line.detail && <span className="ml-2 text-xs text-gray-400">{line.detail}</span>}
                              </td>
                              <td className="py-1.5 text-right text-gray-600">
                                {line.unitPrice != null ? `${line.unitPrice.toLocaleString()}円` : '—'}
                              </td>
                              <td className="py-1.5 text-right text-gray-600">{line.count > 0 ? line.count : '—'}</td>
                              <td className="py-1.5 text-right font-medium text-gray-900">
                                {line.amount.toLocaleString()}円
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {child.daytimeDays.length > 0 && (
                      <div className="rounded-lg border border-purple-100 bg-white p-2.5">
                        <p className="mb-1.5 text-xs font-medium text-purple-700">
                          日中一時支援の利用日（児区分 {child.daytimeCategory ?? '未設定'}）
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {child.daytimeDays.map((d) => (
                            <span
                              key={d.date}
                              className="rounded border border-purple-100 bg-purple-50 px-1.5 py-0.5 text-xs text-purple-800"
                            >
                              {parseInt(d.date.slice(5, 7))}/{parseInt(d.date.slice(8, 10))}{' '}
                              {d.startTime && d.endTime ? `${d.startTime}〜${d.endTime}` : '時刻未入力'}{' '}
                              {d.unitCount > 0 ? `${d.unitCount}単位` : ''}
                              {d.pickup && ' 往'}
                              {d.dropoff && ' 復'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => handleIssue([child.childId])} disabled={busy || child.total <= 0}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        {child.issued ? '再発行' : '発行'}
                      </Button>
                      <Link href={printHref('invoice', [child.childId])} target="_blank">
                        <Button size="sm" variant="outline" disabled={child.total <= 0}>
                          <FileText className="h-3.5 w-3.5" />
                          請求書
                        </Button>
                      </Link>
                      {child.issued && (
                        <>
                          <Link href={printHref('receipt', [child.childId])} target="_blank">
                            <Button size="sm" variant="outline">
                              <Receipt className="h-3.5 w-3.5" />
                              領収書
                            </Button>
                          </Link>
                          {child.issued.paidAt ? (
                            <span className="flex items-center gap-2 text-xs text-gray-500">
                              入金日 {child.issued.paidAt}
                              <button
                                onClick={() => handlePayment(child.issued!.id, true)}
                                className="text-gray-400 underline hover:text-gray-700"
                              >
                                取り消す
                              </button>
                            </span>
                          ) : paymentFor === child.issued.id ? (
                            <span className="flex flex-wrap items-center gap-1.5">
                              <input
                                type="date"
                                value={paidAt}
                                onChange={(e) => setPaidAt(e.target.value)}
                                className="rounded border border-gray-200 px-2 py-1 text-xs"
                              />
                              <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                              >
                                <option>現金</option>
                                <option>口座振替</option>
                                <option>振込</option>
                              </select>
                              <input
                                type="text"
                                value={receiptNo}
                                onChange={(e) => setReceiptNo(e.target.value)}
                                placeholder="領収番号（任意）"
                                className="w-32 rounded border border-gray-200 px-2 py-1 text-xs"
                              />
                              <Button size="sm" onClick={() => handlePayment(child.issued!.id)} disabled={busy || !paidAt}>
                                保存
                              </Button>
                              <button onClick={() => setPaymentFor(null)} className="text-xs text-gray-500 hover:underline">
                                キャンセル
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setPaymentFor(child.issued!.id)
                                setPaidAt(new Date().toISOString().slice(0, 10))
                              }}
                              className="text-xs text-indigo-600 hover:underline"
                            >
                              入金を記録
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(child.issued!.id)}
                            className="ml-auto text-gray-300 transition-colors hover:text-red-400"
                            title="請求書を取り消す"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
