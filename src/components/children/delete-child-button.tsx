'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteChild } from '@/app/actions/children'

export function DeleteChildButton({ childId, childName }: { childId: string; childName: string }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const handleDelete = () => {
    setError('')
    startTransition(async () => {
      try {
        await deleteChild(childId)
      } catch (e) {
        setError(e instanceof Error ? e.message : '削除に失敗しました')
      }
    })
  }

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        この児童を削除
      </button>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-700 flex-1">
          <span className="font-medium">「{childName}」</span>を削除します。出席記録・連絡帳など全てのデータが削除されます。この操作は取り消せません。
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? '削除中...' : '削除する'}
          </button>
        </div>
      </div>
    </div>
  )
}
