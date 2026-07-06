'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  attendanceId: string
  serviceStartTime: string | null
  serviceEndTime: string | null
  daytimeSupport: boolean
  daytimeSupportStartTime: string | null
  daytimeSupportEndTime: string | null
}

export function AttendanceTimeEditor({
  attendanceId,
  serviceStartTime,
  serviceEndTime,
  daytimeSupport,
  daytimeSupportStartTime,
  daytimeSupportEndTime,
}: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  const updateField = async (field: string, value: string) => {
    setSaving(true)
    await supabase.from('daily_attendance').update({ [field]: value || null }).eq('id', attendanceId)
    setSaving(false)
  }

  const inputClass = 'border border-gray-200 rounded px-1 py-0.5 w-[82px] text-center text-xs focus:outline-none focus:border-indigo-400'

  return (
    <div className="flex flex-col gap-1 items-end">
      <div className="flex items-center gap-1 text-xs text-indigo-600">
        <span className="shrink-0 font-medium">利用:</span>
        <input
          type="time"
          defaultValue={serviceStartTime?.slice(0, 5) ?? ''}
          className={inputClass}
          onBlur={(e) => updateField('service_start_time', e.target.value)}
        />
        <span className="text-gray-400">〜</span>
        <input
          type="time"
          defaultValue={serviceEndTime?.slice(0, 5) ?? ''}
          className={inputClass}
          onBlur={(e) => updateField('service_end_time', e.target.value)}
        />
      </div>
      {daytimeSupport && (
        <div className="flex items-center gap-1 text-xs text-teal-600">
          <span className="shrink-0 font-medium">日中一時:</span>
          <input
            type="time"
            defaultValue={daytimeSupportStartTime?.slice(0, 5) ?? ''}
            className={inputClass}
            onBlur={(e) => updateField('daytime_support_start_time', e.target.value)}
          />
          <span className="text-gray-400">〜</span>
          <input
            type="time"
            defaultValue={daytimeSupportEndTime?.slice(0, 5) ?? ''}
            className={inputClass}
            onBlur={(e) => updateField('daytime_support_end_time', e.target.value)}
          />
        </div>
      )}
      {saving && <span className="text-[10px] text-gray-400">保存中…</span>}
    </div>
  )
}
