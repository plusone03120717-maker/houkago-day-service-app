'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'

export type BillingNoticeStaff = {
  id: string
  name: string
  hasLine: boolean
  receives: boolean
}

/**
 * 国保連請求の月初お知らせを受け取る請求担当のチェック。
 * LINE 連携していないスタッフは送り先がないので選べない。
 */
export function BillingNoticeRecipientsForm({ initial }: { initial: BillingNoticeStaff[] }) {
  const supabase = createClient()
  const [rows, setRows] = useState<BillingNoticeStaff[]>(initial)
  // 最後に保存した状態。変わった人だけ書き込む
  const [baseline, setBaseline] = useState<BillingNoticeStaff[]>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, receives: !r.receives } : r)))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const changed = rows.filter((r) => r.receives !== baseline.find((b) => b.id === r.id)?.receives)
    for (const r of changed) {
      const { error: err } = await supabase
        .from('staff_members')
        .update({ receives_billing_notice: r.receives })
        .eq('id', r.id)
      if (err) {
        setSaving(false)
        setError(`${r.name}さんの設定を保存できませんでした`)
        return
      }
    }
    setBaseline(rows)
    setSaving(false)
    setSaved(true)
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">スタッフが登録されていません（設定 → スタッフ管理）。</p>
  }

  const selected = rows.filter((r) => r.receives && r.hasLine).length

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {rows.map((r) => (
          <li key={r.id}>
            <label
              className={`flex items-center gap-3 px-4 py-2.5 ${r.hasLine ? 'cursor-pointer hover:bg-gray-50' : 'opacity-60'}`}
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={r.receives && r.hasLine}
                disabled={!r.hasLine}
                onChange={() => toggle(r.id)}
              />
              <span className="text-sm text-gray-900 flex-1">{r.name}</span>
              {!r.hasLine && <span className="text-xs text-gray-500">LINE 未連携</span>}
            </label>
          </li>
        ))}
      </ul>
      {selected === 0 && (
        <p className="text-sm text-amber-700">
          受け取るスタッフがいないため、1日の朝の集計は行われますが、お知らせは届きません。
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? '保存中…' : '保存'}
        </Button>
        {saved && <span className="text-sm text-green-700">保存しました</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  )
}
