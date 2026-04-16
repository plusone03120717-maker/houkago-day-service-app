'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  userId: string
  staffName: string
}

export function DeleteStaffButton({ userId, staffName }: Props) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    const res = await fetch('/api/staff/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error ?? '削除に失敗しました')
      setDeleting(false)
      return
    }
    router.push('/settings/staff')
    router.refresh()
  }

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        このスタッフを削除
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-red-700">
            {staffName} を削除しますか？
          </p>
          <p className="text-xs text-red-500 mt-0.5">
            ログインアカウントと関連データがすべて削除されます。この操作は元に戻せません。
          </p>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {deleting ? '削除中...' : '削除する'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirm(false)}
          disabled={deleting}
        >
          キャンセル
        </Button>
      </div>
    </div>
  )
}
