'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'

type Status = 'attended' | 'absent'

interface Props {
  attendanceId: string
  currentStatus: string
}

export function AttendanceStatusToggle({ attendanceId, currentStatus }: Props) {
  const [status, setStatus] = useState<string>(currentStatus)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const toggle = async () => {
    if (loading) return
    const next: Status = status === 'attended' ? 'absent' : 'attended'
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('daily_attendance')
      .update({ status: next })
      .eq('id', attendanceId)
    if (!error) {
      setStatus(next)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="disabled:opacity-50 disabled:cursor-not-allowed"
      title={status === 'attended' ? 'クリックして欠席に変更' : 'クリックして出席に変更'}
    >
      <Badge
        variant={status === 'attended' ? 'success' : 'secondary'}
        className="text-xs cursor-pointer hover:opacity-75 transition-opacity"
      >
        {status === 'attended' ? '出席' : status === 'absent' ? '欠席' : 'その他'}
      </Badge>
    </button>
  )
}
