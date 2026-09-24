'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

/** よくある欠席理由。押すとそのまま入る（入力欄で書き足し・書き換えもできる） */
export const ABSENCE_REASON_PRESETS = ['体調不良', '通院', '家庭の事情', '学校行事', '私用'] as const

interface Props {
  value: string | null
  /** 保存に成功したら true を返す */
  onSave: (reason: string | null) => Promise<boolean>
}

/**
 * 欠席理由の入力欄。
 * 入力欄から離れたとき（またはEnter）・候補ボタンを押したときに保存する。
 */
export function AbsenceReasonInput({ value, onSave }: Props) {
  const saved = value ?? ''
  const [draft, setDraft] = useState(saved)
  const [syncedValue, setSyncedValue] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // 他の職員の変更などで保存値が変わったら、入力中でない限り追従する
  if (syncedValue !== saved) {
    setSyncedValue(saved)
    setDraft(saved)
  }

  const save = async (next: string) => {
    const trimmed = next.trim()
    if (trimmed === saved) return
    setSaving(true)
    const ok = await onSave(trimmed || null)
    setSaving(false)
    if (ok) {
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1500)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <label className="text-xs font-medium text-red-600 flex-shrink-0">欠席理由</label>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          placeholder="例：発熱のため"
          className="flex-1 min-w-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
        />
        <span className="w-4 flex-shrink-0">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : justSaved ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : null}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {ABSENCE_REASON_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            // 入力欄の blur 保存より先に候補を反映させる
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setDraft(p)
              void save(p)
            }}
            disabled={saving}
            className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
              draft === p
                ? 'bg-red-500 border-red-500 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-700'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}
