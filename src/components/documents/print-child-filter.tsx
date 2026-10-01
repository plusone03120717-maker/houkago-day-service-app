'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type PrintChildOption = {
  id: string
  name: string
  /** 受給者証番号など、名前の横に小さく出す補足 */
  note?: string
}

/**
 * 帳票の印刷ページで「この人とこの人だけ」に絞るためのパネル。
 * 選んだ児童は URL の ?children=id1,id2 に入れ、ページ側（サーバー）で絞り込む。
 * 何も選ばない（children なし）ときは全員分。
 */
export function PrintChildFilter({
  options,
  selectedIds,
  requireSelection = false,
}: {
  options: PrintChildOption[]
  /** 現在 URL で絞り込まれている児童。空なら全員表示中 */
  selectedIds: string[]
  /**
   * 「選ばない＝全員」にしない画面（1人ずつ重い表を出す月次実績など）。
   * 空のときは何も表示せず、全員を選んだ場合も URL に全員分を入れる。
   */
  requireSelection?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(selectedIds.length > 0 || requireSelection)
  const [checked, setChecked] = useState<string[]>(selectedIds)

  const filtered = selectedIds.length > 0
  const allChecked = checked.length > 0 && checked.length === options.length

  const toggle = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const apply = (ids: string[]) => {
    const url = new URL(window.location.href)
    if (ids.length > 0 && (requireSelection || ids.length < options.length)) url.searchParams.set('children', ids.join(','))
    else url.searchParams.delete('children')
    router.push(`${url.pathname}${url.search}`)
  }

  if (options.length === 0 && !requireSelection) return null

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 font-medium text-indigo-900"
        >
          <Users className="h-4 w-4" />
          対象者：
          {filtered
            ? `${selectedIds.length}名を表示中（全${options.length}名）`
            : requireSelection
              ? '未選択'
              : `全員（${options.length}名）`}
          <span className="text-xs font-normal text-indigo-600 underline">
            {open ? '閉じる' : '対象者を選ぶ'}
          </span>
        </button>
        {filtered && !requireSelection && (
          <Button size="sm" variant="outline" onClick={() => { setChecked([]); apply([]) }}>
            全員に戻す
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => setChecked(allChecked ? [] : options.map((o) => o.id))}
              className="h-4 w-4 accent-indigo-600"
            />
            すべて選択
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
            {options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white">
                <input
                  type="checkbox"
                  checked={checked.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  className="h-4 w-4 accent-indigo-600"
                />
                <span className="text-gray-900">{o.name}</span>
                {o.note && <span className="text-[10px] text-gray-400">{o.note}</span>}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => apply(checked)} disabled={checked.length === 0}>
              {checked.length > 0 ? `選んだ${checked.length}名だけ表示` : '児童を選んでください'}
            </Button>
            <span className="text-xs text-gray-500">表示を絞ってから「PDFで保存」「印刷」を押してください</span>
          </div>
        </div>
      )}
    </div>
  )
}
