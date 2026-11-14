'use client'

import { useState } from 'react'
import { Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'

interface Props {
  childId: string
  settingId: string | null
  initialNotes: string
}

/** 送迎に関する注意事項（備考）。送迎の場所・区分は利用スケジュールで決めるので、ここでは備考だけを書く */
export function ChildTransportNotesForm({ childId, settingId, initialNotes }: Props) {
  const supabase = createClient()
  const [id, setId] = useState<string | null>(settingId)
  const [notes, setNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    const payload = { notes: notes || null, updated_at: new Date().toISOString() }
    let failed: string | null = null
    if (id) {
      const { error: updateError } = await supabase.from('child_transport_settings').update(payload).eq('id', id)
      failed = updateError?.message ?? null
    } else {
      const { data, error: insertError } = await supabase
        .from('child_transport_settings')
        .insert({ child_id: childId, ...payload })
        .select('id')
        .single()
      failed = insertError?.message ?? null
      if (!insertError && data) setId(data.id)
    }
    setSaving(false)
    if (failed) {
      setError(failed)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-600 block">送迎の備考</label>
      <AutoTextarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        minRows={3}
        placeholder="送迎に関する注意事項など"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      <Button onClick={handleSave} disabled={saving} size="sm">
        <Save className="h-4 w-4" />
        {saving ? '保存中...' : saved ? '保存しました' : '備考を保存'}
      </Button>
    </div>
  )
}
