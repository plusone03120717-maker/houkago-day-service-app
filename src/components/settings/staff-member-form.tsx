'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save, CheckCircle, Trash2 } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'driver', label: 'ドライバー' },
  { value: 'staff', label: 'スタッフ' },
]

interface Props {
  memberId: string
  initialName: string
  initialRole: string
  initialLineUserId: string
}

export function StaffMemberForm({ memberId, initialName, initialRole, initialLineUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [name, setName] = useState(initialName)
  const [role, setRole] = useState(initialRole)
  const [lineUserId, setLineUserId] = useState(initialLineUserId)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setSaved(false)
    await supabase
      .from('staff_members')
      .update({
        name: name.trim(),
        role,
        line_user_id: lineUserId.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
    setSaving(false)
    setSaved(true)
    startTransition(() => router.refresh())
  }

  const handleDelete = async () => {
    if (!confirm(`「${name}」を削除しますか？`)) return
    setDeleting(true)
    await supabase.from('staff_members').delete().eq('id', memberId)
    router.push('/settings/staff')
  }

  return (
    <div className="space-y-5">
      {/* 氏名 */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">氏名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setSaved(false) }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* 役職 */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-2 block">役職</label>
        <div className="flex gap-2">
          {ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setRole(opt.value); setSaved(false) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                role === opt.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* LINE User ID */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">
          LINE User ID
          <span className="ml-1 text-gray-400 font-normal">（送迎通知を受け取るために必要）</span>
        </label>
        <input
          type="text"
          value={lineUserId}
          onChange={(e) => { setLineUserId(e.target.value); setSaved(false) }}
          placeholder="U1234567890abcdef..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
        />
        <p className="text-xs text-gray-400 mt-1">
          LINE公式アカウントにメッセージを送ると自動返信されます
        </p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || !name.trim()} size="sm">
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存'}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="h-3.5 w-3.5" />
              保存しました
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="text-red-400 hover:text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          削除
        </Button>
      </div>
    </div>
  )
}
