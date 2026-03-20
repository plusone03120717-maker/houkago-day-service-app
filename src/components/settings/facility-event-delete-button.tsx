'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Trash2 } from 'lucide-react'

export function FacilityEventDeleteButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const handleDelete = async () => {
    if (!confirm('この予定を削除しますか？')) return
    await supabase.from('facility_events').delete().eq('id', eventId)
    startTransition(() => router.refresh())
  }

  return (
    <button
      onClick={handleDelete}
      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
      title="削除"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
