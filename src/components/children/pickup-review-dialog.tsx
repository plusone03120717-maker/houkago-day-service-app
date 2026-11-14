'use client'

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { applyPickupReview } from '@/app/actions/transport-location'
import { PICKUP_REVIEW_NOTES, type PickupReviewItem } from '@/lib/pickup-review'

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function formatDay(date: string) {
  const d = new Date(`${date}T00:00:00`)
  return `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）`
}

interface Props {
  childId: string
  items: PickupReviewItem[]
  /** 閉じたとき。changed は「変える」にして書きかえた行の数 */
  onClose: (changed: number) => void
}

/**
 * お迎え場所を変えたあと、注意が要る日（送迎管理で選んだ場所・保護者の利用連絡・
 * 特定日の上書き・土日祝）を並べ、日ごとに変えるかどうかを選んでもらう。
 */
export function PickupReviewDialog({ childId, items, onClose }: Props) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.recommended).map((i) => i.id))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleApply = async () => {
    if (checked.size === 0) {
      onClose(0)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await applyPickupReview(childId, [...checked])
      onClose(res.updated)
    } catch {
      setError('送迎管理への反映に失敗しました。もう一度押してください。')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-bold text-gray-900">確認が要る日があります</h2>
              <p className="text-xs text-gray-500 mt-1">
                お迎え場所は保存しました。次の日の送迎管理のお迎え場所を変えるかどうかを選んでください。
                チェックを付けた日だけ変わります。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose(0)}
            disabled={saving}
            aria-label="どれも変えずに閉じる"
            className="p-1 rounded-lg hover:bg-gray-100"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <ul className="space-y-2 overflow-y-auto">
          {items.map((item) => {
            const info = PICKUP_REVIEW_NOTES[item.reason]
            const on = checked.has(item.id)
            return (
              <li key={item.id}>
                <label
                  className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    on ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(item.id)}
                    className="mt-1 h-4 w-4 accent-indigo-600"
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{formatDay(item.date)}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">{info.label}</span>
                      <span className="text-xs text-gray-500">{on ? '変える' : '変えない'}</span>
                    </div>
                    <p className="text-xs text-gray-700 break-words">
                      今：{item.from ?? '（未設定）'}
                      <br />
                      変えると：{item.to}
                    </p>
                    <p className="text-xs text-gray-500">{info.note}</p>
                  </div>
                </label>
              </li>
            )
          })}
        </ul>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onClose(0)} disabled={saving}>
            どれも変えない
          </Button>
          <Button type="button" onClick={handleApply} disabled={saving}>
            {saving ? '反映中...' : `チェックした日を変える（${checked.size}件）`}
          </Button>
        </div>
      </div>
    </div>
  )
}
