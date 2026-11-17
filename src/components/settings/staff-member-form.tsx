'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save, CheckCircle, Trash2, UserX, UserCheck } from 'lucide-react'
import { deleteStaffMemberIfUnused, setStaffRetired } from '@/app/actions/retire'
import { todayJst } from '@/lib/retired'

const ROLE_OPTIONS = [
  { value: 'driver',    label: 'ドライバー' },
  { value: 'therapist', label: '療育士' },
  { value: 'nurse',     label: '看護師' },
]

interface Props {
  memberId: string
  initialName: string
  initialRoles: string[]
  initialLineUserId: string
  /** 退職日（在籍中は null） */
  initialRetiredAt?: string | null
  /** 名前・役職・LINE の変更と削除ができるか。システム管理者だけ true（施設長は閲覧のみ） */
  canEdit?: boolean
}

export function StaffMemberForm({
  memberId,
  initialName,
  initialRoles,
  initialLineUserId,
  initialRetiredAt = null,
  canEdit = true,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [name, setName] = useState(initialName)
  const [roles, setRoles] = useState<Set<string>>(new Set(initialRoles))
  const [lineUserId, setLineUserId] = useState(initialLineUserId)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [retiredAt, setRetiredAt] = useState<string | null>(initialRetiredAt)
  const [retireDate, setRetireDate] = useState<string>(initialRetiredAt ?? todayJst())
  const [retireSaving, setRetireSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const handleRetire = async (next: string | null) => {
    if (!canEdit) return
    if (next && !confirm(`「${name}」を ${next} で退職にしますか？\n翌日から、送迎のドライバーなどの選ぶ欄と打刻の知らせから外れます。タイムカードや送迎の記録は残ります。`)) return
    setRetireSaving(true)
    setMessage(null)
    const res = await setStaffRetired(memberId, next)
    setRetireSaving(false)
    if (!res.ok) {
      setMessage({ kind: 'error', text: res.message })
      return
    }
    setRetiredAt(next)
    setMessage({ kind: 'ok', text: next ? `${next} で退職にしました` : '在籍に戻しました' })
    startTransition(() => router.refresh())
  }

  const toggleRole = (value: string) => {
    if (!canEdit) return
    setRoles((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
    setSaved(false)
  }

  const handleSave = async () => {
    if (!canEdit) return
    if (!name.trim()) return
    setSaving(true)
    setSaved(false)
    const rolesArr = [...roles]
    await supabase
      .from('staff_members')
      .update({
        name: name.trim(),
        role: rolesArr[0] ?? 'driver',
        roles: rolesArr,
        line_user_id: lineUserId.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
    setSaving(false)
    setSaved(true)
    startTransition(() => router.refresh())
  }

  /** 削除は、記録が1件もないとき（まちがえて登録したときなど）だけ。記録があればサーバーが断る */
  const handleDelete = async () => {
    if (!canEdit) return
    if (!confirm(`「${name}」を削除しますか？\n記録が1件もないときだけ削除できます。辞めた人は「退職にする」を使ってください。`)) return
    setDeleting(true)
    setMessage(null)
    const res = await deleteStaffMemberIfUnused(memberId)
    setDeleting(false)
    if (!res.ok) {
      setMessage({ kind: 'error', text: res.message })
      return
    }
    router.push('/settings/staff')
  }

  return (
    <div className="space-y-5">
      {/* 閲覧のみのときは、中のボタン・入力欄をまとめて押せなくする */}
      <fieldset disabled={!canEdit} className="space-y-5 min-w-0">
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
        <label className="text-xs font-medium text-gray-700 mb-2 block">
          役職
          <span className="ml-1 text-gray-400 font-normal">（複数選択可）</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleRole(opt.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                roles.has(opt.value)
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
          <span className="ml-1 text-gray-400 font-normal">（LINE連携・タイムカード打刻に必要）</span>
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
      </fieldset>

      {canEdit && (
      <div className="flex items-center justify-between pt-2 border-b border-gray-100 pb-5">
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
      </div>
      )}

      {/* 退職（消さずに選ぶ欄から外す・2026-11-17 依頼主） */}
      <div className="space-y-2" data-testid="retire-section">
        <p className="text-xs font-medium text-gray-700">在籍</p>
        {retiredAt ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2">
            <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs font-bold text-white" data-testid="retired-badge">退職</span>
            <span className="text-sm text-gray-700">退職日 {retiredAt}（翌日から選ぶ欄・打刻の知らせから外れています）</span>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => handleRetire(null)} disabled={retireSaving} className="ml-auto">
                <UserCheck className="h-4 w-4" />
                在籍に戻す
              </Button>
            )}
          </div>
        ) : canEdit ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <span className="text-sm text-gray-700">在籍中</span>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600">
              退職日
              <input
                type="date"
                value={retireDate}
                onChange={(e) => setRetireDate(e.target.value)}
                aria-label="退職日"
                className="border border-gray-200 rounded px-2 py-1 text-sm"
              />
            </label>
            <Button variant="outline" size="sm" onClick={() => retireDate && handleRetire(retireDate)} disabled={retireSaving || !retireDate}>
              <UserX className="h-4 w-4" />
              退職にする
            </Button>
          </div>
        ) : (
          <p className="text-sm text-gray-700">在籍中</p>
        )}
        <p className="text-[11px] text-gray-400">
          退職にすると、退職日の翌日から送迎のドライバーなどの選ぶ欄と打刻の知らせから外れます。タイムカード・有給・送迎の記録は消えずに残ります。
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${message.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}
          data-testid="retire-message"
        >
          {message.text}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <p className="text-[11px] text-gray-400">削除は、まちがえて登録したときなど、記録が1件もないときだけできます。</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
          >
            <Trash2 className="h-4 w-4" />
            削除
          </Button>
        </div>
      )}

    </div>
  )
}
