'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'

type Program = {
  id: string
  name: string
  category: string | null
}

interface Props {
  facilityId: string
  programs: Program[]
}

const CATEGORIES = ['スポーツ', '学習', '創作', '生活訓練', '遊び', 'コミュニケーション', 'その他']

export function ActivityProgramForm({ facilityId, programs }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [name, setName] = useState('')
  const [category, setCategory] = useState('スポーツ')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    await supabase.from('activity_programs').insert({
      facility_id: facilityId,
      name: name.trim(),
      category,
    })
    setSaving(false)
    setName('')
    startTransition(() => router.refresh())
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await supabase.from('activity_programs').delete().eq('id', id)
    setDeleting(null)
    startTransition(() => router.refresh())
  }

  // カテゴリごとにグループ化
  const grouped = CATEGORIES.reduce<Record<string, Program[]>>((acc, cat) => {
    const items = programs.filter((p) => p.category === cat)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})
  const uncategorized = programs.filter((p) => !p.category || !CATEGORIES.includes(p.category))
  if (uncategorized.length > 0) grouped['その他'] = [...(grouped['その他'] ?? []), ...uncategorized]

  return (
    <div className="space-y-6">
      {/* 一覧 */}
      {Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">プログラムがまだ登録されていません</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{cat}</p>
              <div className="space-y-1.5">
                {items.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <span className="text-sm text-gray-900">{p.name}</span>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 追加フォーム */}
      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">プログラムを追加</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              プログラム名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="例：水泳、料理教室"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">カテゴリ</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <Button
          onClick={handleAdd}
          disabled={saving || !name.trim()}
          size="sm"
          className="w-full"
        >
          <Plus className="h-4 w-4" />
          {saving ? '追加中...' : 'プログラムを追加'}
        </Button>
      </div>
    </div>
  )
}
