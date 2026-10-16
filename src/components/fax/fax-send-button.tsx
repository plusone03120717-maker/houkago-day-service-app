'use client'

import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildPdfFromPages, PdfBuildError } from '@/components/documents/pdf-save-button'
import { jfaxAddress, type PartnerOffice } from '@/lib/fax/partner-offices'
import type { FaxSendHistory } from '@/lib/fax/context'

type Props = {
  /** PDF にする帳票（1要素 = A4の1枚） */
  pageSelector: string
  fileName: string
  yearMonth: string
  kind: 'copay_list' | 'result'
  childIds: string[]
  offices: PartnerOffice[]
  /** 上限管理事業所などから決まった送り先。決まらなければ null（職員が選ぶ） */
  defaultOfficeId: string | null
  /** 送り先を決められなかったときに見せる、帳票上の事業所名 */
  targetLabel: string
  defaultSubject: string
  defaultBody: string
  history: FaxSendHistory[]
  senderConfigured: boolean
  /** ボタンの文言（同じ帳票を複数の事業所へ送るときに「○○へ jFax で送る」とする） */
  label?: string
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const digits = (s: string) => s.replace(/\D/g, '')

/**
 * 画面の帳票を PDF にして、You First の Gmail から jFax で他事業所へ送る。
 * 送り先・件名・本文を見て「確かめました」にチェックを入れてからでないと送れない。
 */
export function FaxSendButton(props: Props) {
  const [open, setOpen] = useState(false)
  const [officeId, setOfficeId] = useState(props.defaultOfficeId ?? '')
  const [subject, setSubject] = useState(props.defaultSubject)
  const [body, setBody] = useState(props.defaultBody)
  const [checked, setChecked] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ to: string; sentAt: string } | null>(null)

  const office = props.offices.find((o) => o.id === officeId) ?? null
  const address = office ? jfaxAddress(office.faxNumber) : null

  // この月、この送り先・この児童へもう送っているか
  const previous = useMemo(
    () =>
      office
        ? props.history.filter(
            (h) =>
              h.status === 'sent' &&
              digits(h.faxNumber) === digits(office.faxNumber) &&
              h.childIds.some((id) => props.childIds.includes(id)),
          )
        : [],
    [props.history, props.childIds, office],
  )

  if (!props.senderConfigured) {
    return (
      <p className="text-xs text-gray-500 max-w-xs">
        jFax で送る設定がまだです（管理者が Vercel に Gmail のアプリ パスワードを登録すると使えます）
      </p>
    )
  }

  if (result) {
    return (
      <div className="w-full max-w-md rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 space-y-1">
        <p className="font-semibold">
          {office?.name}へ送信しました（{formatTime(result.sentAt)}）
        </p>
        <p className="text-xs">
          宛先 {result.to}。相手に届いたかは、You First の Gmail に届く jFax の「送信完了」メールで確かめてください。
        </p>
      </div>
    )
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="flex items-center gap-1.5">
        <Send className="h-4 w-4" />
        {props.label ?? 'jFax で送る'}
      </Button>
    )
  }

  const handleSend = async () => {
    if (!office || !address) return
    setSending(true)
    setError('')
    try {
      const pdf = await buildPdfFromPages(props.pageSelector)
      const form = new FormData()
      form.append('partnerOfficeId', office.id)
      form.append('yearMonth', props.yearMonth)
      form.append('kind', props.kind)
      form.append('childIds', props.childIds.join(','))
      form.append('subject', subject)
      form.append('body', body)
      form.append('pageCount', String(pdf.getNumberOfPages()))
      form.append('pdf', new File([pdf.output('blob')], props.fileName, { type: 'application/pdf' }))
      const res = await fetch('/api/fax/send', { method: 'POST', body: form })
      const json = (await res.json().catch(() => ({}))) as { error?: string; to?: string; sentAt?: string }
      if (!res.ok || json.error) {
        setError(json.error ?? `送れませんでした（${res.status}）`)
        return
      }
      setResult({ to: json.to ?? address, sentAt: json.sentAt ?? new Date().toISOString() })
    } catch (e) {
      setError(e instanceof PdfBuildError ? e.message : `送れませんでした: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-indigo-200 bg-white p-4 space-y-3 text-left shadow-sm">
      <p className="text-sm font-semibold text-gray-900">jFax で送る</p>

      <label className="block space-y-1">
        <span className="text-xs text-gray-600">送り先</span>
        <select
          className="w-full h-9 rounded-md border border-gray-300 px-2 text-sm"
          value={officeId}
          onChange={(e) => {
            setOfficeId(e.target.value)
            setChecked(false)
          }}
        >
          <option value="">選んでください</option>
          {props.offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}（{o.faxNumber || 'FAX 番号未登録'}）
            </option>
          ))}
        </select>
        {!props.defaultOfficeId && (
          <span className="block text-xs text-amber-700">
            「{props.targetLabel || '事業所名未登録'}」に当たる事業所を決められませんでした。送り先を選んでください
            （設定 → 他事業所の FAX 番号 で事業所番号や別名を登録すると、次から自動で選ばれます）
          </span>
        )}
        {office && !address && (
          <span className="block text-xs text-red-600">
            FAX 番号が正しくありません。設定 → 他事業所の FAX 番号 で直してください
          </span>
        )}
        {address && <span className="block text-xs text-gray-500">メールの宛先：{address}</span>}
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-gray-600">件名</span>
        <input
          className="w-full h-9 rounded-md border border-gray-300 px-2 text-sm"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-gray-600">本文（jFax の送付状に載ります）</span>
        <textarea
          className="w-full min-h-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>

      {previous.length > 0 && (
        <p className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-800">
          この月、この送り先へは{' '}
          {previous.map((p) => `${formatTime(p.sentAt)}（${p.sentByName || '不明'}）`).join('、')} に送っています。
          訂正版でなければ、二重に送らないよう気をつけてください。
        </p>
      )}

      <label className="flex items-start gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>送り先・帳票の中身・本文を確かめました</span>
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!checked || !address || sending}
          className="flex items-center gap-1.5"
        >
          <Send className="h-4 w-4" />
          {sending ? '送信中…' : '送信する'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={sending}>
          やめる
        </Button>
      </div>
    </div>
  )
}
