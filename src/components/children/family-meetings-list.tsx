'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { FamilyMeetingForm } from './family-meeting-form'

type Meeting = {
  id: string
  meeting_date: string
  attendees: string | null
  content: string
  created_at: string
}

interface Props {
  childId: string
  initialMeetings: Meeting[]
}

export function FamilyMeetingsList({ childId, initialMeetings }: Props) {
  const router = useRouter()
  const [showNew, setShowNew] = useState(false)

  const refresh = useCallback(() => {
    router.refresh()
    setShowNew(false)
  }, [router])

  return (
    <div className="space-y-3">
      {/* 新規追加フォーム */}
      {showNew && (
        <FamilyMeetingForm
          childId={childId}
          onSaved={refresh}
          onDeleted={() => setShowNew(false)}
        />
      )}

      {/* 追加ボタン */}
      {!showNew && (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 w-full py-3 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          会議記録を追加
        </button>
      )}

      {/* 既存記録一覧 */}
      {initialMeetings.length > 0 ? (
        <div className="space-y-2">
          {initialMeetings.map((m) => (
            <FamilyMeetingForm
              key={m.id}
              childId={childId}
              initial={m}
              onSaved={refresh}
              onDeleted={refresh}
            />
          ))}
        </div>
      ) : (
        !showNew && (
          <p className="text-sm text-gray-400 text-center py-8">
            会議記録がありません。「会議記録を追加」から記録してください。
          </p>
        )
      )}
    </div>
  )
}
