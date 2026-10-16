'use client'

import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { jfaxAddress } from '@/lib/fax/partner-offices'

export type PartnerOfficeRow = {
  id: string
  name: string
  officeNumber: string
  faxNumber: string
  /** 「、」区切り */
  aliases: string
  note: string
}

const emptyRow = (): PartnerOfficeRow => ({
  id: '',
  name: '',
  officeNumber: '',
  faxNumber: '',
  aliases: '',
  note: '',
})

/** 他事業所の FAX 番号の一覧と編集。1行ずつ保存する */
export function PartnerOfficesForm({ initial }: { initial: PartnerOfficeRow[] }) {
  const supabase = createClient()
  const [rows, setRows] = useState<PartnerOfficeRow[]>(initial)
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  // 削除はもう一度押して確定する
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [messages, setMessages] = useState<Record<number, { ok: boolean; text: string }>>({})

  const update = (i: number, patch: Partial<PartnerOfficeRow>) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    setMessages((m) => ({ ...m, [i]: { ok: true, text: '' } }))
  }

  const validate = (r: PartnerOfficeRow): string | null => {
    if (!r.name.trim()) return '事業所名を入れてください'
    if (r.officeNumber && !/^\d{10}$/.test(r.officeNumber.replace(/\D/g, ''))) {
      return '事業所番号は10桁の数字で入れてください（わからなければ空のまま）'
    }
    if (r.faxNumber && !jfaxAddress(r.faxNumber)) return 'FAX 番号は 0 から始まる市外局番つきで入れてください'
    return null
  }

  const save = async (i: number) => {
    const r = rows[i]
    const invalid = validate(r)
    if (invalid) {
      setMessages((m) => ({ ...m, [i]: { ok: false, text: invalid } }))
      return
    }
    setSavingIndex(i)
    const values = {
      name: r.name.trim(),
      office_number: r.officeNumber.replace(/\D/g, '') || null,
      fax_number: r.faxNumber.trim(),
      aliases: r.aliases
        .split(/[、,]/)
        .map((a) => a.trim())
        .filter(Boolean),
      note: r.note.trim(),
    }
    const res = r.id
      ? await supabase.from('partner_offices').update(values).eq('id', r.id).select('id').single()
      : await supabase.from('partner_offices').insert(values).select('id').single()
    setSavingIndex(null)
    if (res.error) {
      const dup = res.error.code === '23505'
      setMessages((m) => ({
        ...m,
        [i]: { ok: false, text: dup ? 'この事業所番号はもう登録されています' : '保存できませんでした' },
      }))
      return
    }
    if (!r.id && res.data) update(i, { id: (res.data as { id: string }).id })
    setMessages((m) => ({ ...m, [i]: { ok: true, text: '保存しました' } }))
  }

  const remove = async (i: number) => {
    if (confirmDelete !== i) {
      setConfirmDelete(i)
      return
    }
    setConfirmDelete(null)
    const r = rows[i]
    if (r.id) {
      const { error } = await supabase.from('partner_offices').delete().eq('id', r.id)
      if (error) {
        setMessages((m) => ({ ...m, [i]: { ok: false, text: '削除できませんでした' } }))
        return
      }
    }
    setRows((prev) => prev.filter((_, j) => j !== i))
    setMessages({})
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.id || `new-${i}`} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-xs text-gray-600">事業所名</span>
              <input
                className="w-full h-9 rounded-md border border-gray-300 px-2 text-sm"
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-gray-600">事業所番号（10桁）</span>
              <input
                className="w-full h-9 rounded-md border border-gray-300 px-2 text-sm"
                inputMode="numeric"
                value={r.officeNumber}
                placeholder="わからなければ空のまま"
                onChange={(e) => update(i, { officeNumber: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-gray-600">FAX 番号</span>
              <input
                className="w-full h-9 rounded-md border border-gray-300 px-2 text-sm"
                inputMode="tel"
                value={r.faxNumber}
                placeholder="0555-12-3456"
                onChange={(e) => update(i, { faxNumber: e.target.value })}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-gray-600">別名（「、」で区切る）</span>
              <input
                className="w-full h-9 rounded-md border border-gray-300 px-2 text-sm"
                value={r.aliases}
                placeholder="LUPE、ルーペ"
                onChange={(e) => update(i, { aliases: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-gray-600">メモ</span>
              <input
                className="w-full h-9 rounded-md border border-gray-300 px-2 text-sm"
                value={r.note}
                onChange={(e) => update(i, { note: e.target.value })}
              />
            </label>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => save(i)} disabled={savingIndex === i} className="flex items-center gap-1.5">
              <Save className="h-4 w-4" />
              {savingIndex === i ? '保存中…' : '保存'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => remove(i)} className="flex items-center gap-1.5">
              <Trash2 className="h-4 w-4" />
              {confirmDelete === i ? 'もう一度押すと削除' : '削除'}
            </Button>
            {r.faxNumber && jfaxAddress(r.faxNumber) && (
              <span className="text-xs text-gray-500">送り先：{jfaxAddress(r.faxNumber)}</span>
            )}
            {messages[i]?.text && (
              <span className={`text-sm ${messages[i].ok ? 'text-green-700' : 'text-red-600'}`}>{messages[i].text}</span>
            )}
          </div>
        </div>
      ))}
      <Button variant="outline" onClick={() => setRows((prev) => [...prev, emptyRow()])} className="flex items-center gap-1.5">
        <Plus className="h-4 w-4" />
        事業所を追加
      </Button>
    </div>
  )
}
