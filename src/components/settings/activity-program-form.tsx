'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'

type Program = {
  id: string
  name: string
  category: string | null
  extra_charge: number | null
}

interface Props {
  facilityId: string
  programs: Program[]
}

const CATEGORIES = ['スポーツ', '学習', '創作', '生活訓練', '遊び', 'コミュニケーション', 'その他']

export function ActivityProgramForm({ facilityId, programs: initial }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [programs, setPrograms] = useState<Program[]>(initial)

  // 追加フォーム
  const [name, setName] = useState('')
  const [category, setCategory] = useState('スポーツ')
  const [extraCharge, setExtraCharge] = useState('')
  const [saving, setSaving] = useState(false)

  // インライン編集
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', extra_charge: '' })
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    const charge = extraCharge !== '' ? parseInt(extraCharge) : null
    const { data, error } = await supabase
      .from('activity_programs')
      .insert({ facility_id: facilityId, name: name.trim(), category, extra_charge: charge })
      .select('id, name, category, extra_charge')
      .single()
    setSaving(false)
    if (error || !data) return
    setPrograms((prev) => [...prev, data as Program])
    setName('')
    setExtraCharge('')
  }

  const startEdit = (p: Program) => {
    setEditingId(p.id)
    setEditForm({ name: p.name, extra_charge: p.extra_charge != null ? String(p.extra_charge) : '' })
  }

  const handleEditSave = async (id: string) => {
    const charge = editForm.extra_charge !== '' ? parseInt(editForm.extra_charge) : null
    const { error } = await supabase
      .from('activity_programs')
      .update({ name: editForm.name.trim(), extra_charge: charge })
      .eq('id', id)
    if (error) return
    setPrograms((prev) =>
      prev.map((p) => p.id === id ? { ...p, name: editForm.name.trim(), extra_charge: charge } : p)
    )
    setEditingId(null)
    startTransition(() => router.refresh())
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このプログラムを削除しますか？')) return
    setDeleting(id)
    await supabase.from('activity_programs').delete().eq('id', id)
    setPrograms((prev) => prev.filter((p) => p.id !== id))
    setDeleting(null)
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
                  <div key={p.id} className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                    {editingId === p.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className="flex-1 border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-gray-500">追加料金</span>
                          <input
                            type="number"
                            min={0}
                            value={editForm.extra_charge}
                            onChange={(e) => setEditForm((f) => ({ ...f, extra_charge: e.target.value }))}
                            placeholder="なし"
                            className="w-20 border border-indigo-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <span className="text-xs text-gray-500">円</span>
                        </div>
                        <button onClick={() => handleEditSave(p.id)} className="p-1 rounded text-green-600 hover:bg-green-100">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-900">{p.name}</span>
                          {p.extra_charge != null && (
                            <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                              +{p.extra_charge.toLocaleString()}円
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(p)}
                            className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            disabled={deleting === p.id}
                            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
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
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">
            保険適用外追加料金（任意）
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={extraCharge}
              onChange={(e) => setExtraCharge(e.target.value)}
              placeholder="なし"
              className="w-36 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-500">円（参加した児童のみ課金）</span>
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
