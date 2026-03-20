'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Trash2, Plus } from 'lucide-react'

type ActualCost = {
  id: string
  child_id: string
  date: string
  item_name: string
  amount: number
  children: { name: string } | null
}

type ChildOption = {
  child_id: string
  name: string
}

const ITEM_PRESETS = ['昼食代', '材料費', '行事参加費', '交通費', 'その他']

export function ActualCostForm({
  billingMonthlyId,
  unitId,
  yearMonth,
  children,
  costs,
}: {
  billingMonthlyId: string
  unitId: string
  yearMonth: string   // YYYYMM
  children: ChildOption[]
  costs: ActualCost[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const year = yearMonth.slice(0, 4)
  const month = yearMonth.slice(4, 6)

  const [open, setOpen] = useState(false)
  const [childId, setChildId] = useState(children[0]?.child_id ?? '')
  const [date, setDate] = useState(`${year}-${month}-01`)
  const [itemName, setItemName] = useState('昼食代')
  const [customItem, setCustomItem] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const resolvedItemName = itemName === 'その他' ? customItem : itemName

  const handleSave = async () => {
    if (!childId || !date || !resolvedItemName.trim() || !amount) return
    setSaving(true)
    await supabase.from('billing_actual_costs').insert({
      child_id: childId,
      unit_id: unitId,
      date,
      item_name: resolvedItemName.trim(),
      amount: parseInt(amount, 10),
      billing_monthly_id: billingMonthlyId,
    })
    setSaving(false)
    setOpen(false)
    setAmount('')
    setCustomItem('')
    startTransition(() => router.refresh())
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この実費を削除しますか？')) return
    setDeleting(id)
    await supabase.from('billing_actual_costs').delete().eq('id', id)
    setDeleting(null)
    startTransition(() => router.refresh())
  }

  const totalAmount = costs.reduce((s, c) => s + c.amount, 0)

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          実費・その他請求
          {costs.length > 0 && (
            <span className="ml-2 text-xs text-gray-400">
              合計 {totalAmount.toLocaleString()}円（{costs.length}件）
            </span>
          )}
        </p>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            追加
          </button>
        )}
      </div>

      {/* 既存の実費一覧 */}
      {costs.length > 0 && (
        <div className="divide-y divide-gray-100">
          {costs.map((cost) => (
            <div key={cost.id} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="text-gray-400 w-20 flex-shrink-0 text-xs">{cost.date.slice(5).replace('-', '/')}</span>
              <span className="text-gray-600 flex-shrink-0">{cost.children?.name ?? '—'}</span>
              <span className="flex-1 text-gray-700">{cost.item_name}</span>
              <span className="font-medium text-gray-900">{cost.amount.toLocaleString()}円</span>
              <button
                onClick={() => handleDelete(cost.id)}
                disabled={deleting === cost.id}
                className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 追加フォーム */}
      {open && (
        <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                対象児童 <span className="text-red-500">*</span>
              </label>
              <select
                value={childId}
                onChange={(e) => setChildId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {children.map((c) => (
                  <option key={c.child_id} value={c.child_id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                日付 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={`${year}-${month}-01`}
                max={`${year}-${month}-${String(new Date(parseInt(year), parseInt(month), 0).getDate()).padStart(2, '0')}`}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1.5">項目</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {ITEM_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setItemName(preset)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    itemName === preset
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            {itemName === 'その他' && (
              <input
                type="text"
                value={customItem}
                onChange={(e) => setCustomItem(e.target.value)}
                placeholder="項目名を入力"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              金額（円） <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例: 500"
              min="0"
              step="10"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || !childId || !date || !resolvedItemName.trim() || !amount}
              size="sm"
            >
              <Plus className="h-4 w-4" />
              {saving ? '追加中...' : '追加'}
            </Button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {costs.length === 0 && !open && (
        <p className="text-xs text-gray-400 text-center py-2">実費の登録はありません</p>
      )}
    </div>
  )
}
