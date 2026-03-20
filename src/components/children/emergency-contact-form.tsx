'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Phone, Trash2, Plus, Star } from 'lucide-react'

type EmergencyContact = {
  id: string
  name: string
  relationship: string
  phone_primary: string
  phone_secondary: string | null
  is_primary_guardian: boolean
  can_pickup: boolean
  notes: string | null
  sort_order: number
}

export function EmergencyContactList({
  childId,
  contacts,
}: {
  childId: string
  contacts: EmergencyContact[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('母')
  const [phonePrimary, setPhonePrimary] = useState('')
  const [phoneSecondary, setPhoneSecondary] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)
  const [canPickup, setCanPickup] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !phonePrimary.trim()) return
    setSaving(true)
    await supabase.from('emergency_contacts').insert({
      child_id: childId,
      name: name.trim(),
      relationship: relationship.trim(),
      phone_primary: phonePrimary.trim(),
      phone_secondary: phoneSecondary.trim() || null,
      is_primary_guardian: isPrimary,
      can_pickup: canPickup,
      notes: notes.trim() || null,
      sort_order: contacts.length,
    })
    setSaving(false)
    setOpen(false)
    setName('')
    setRelationship('母')
    setPhonePrimary('')
    setPhoneSecondary('')
    setIsPrimary(false)
    setCanPickup(false)
    setNotes('')
    startTransition(() => router.refresh())
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この緊急連絡先を削除しますか？')) return
    setDeleting(id)
    await supabase.from('emergency_contacts').delete().eq('id', id)
    setDeleting(null)
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-3">
      {contacts.length > 0 && (
        <div className="divide-y divide-gray-100">
          {contacts.map((c) => (
            <div key={c.id} className="py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-900">{c.name}</span>
                  <span className="text-xs text-gray-500">（{c.relationship}）</span>
                  {c.is_primary_guardian && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Star className="h-2.5 w-2.5" />
                      主保護者
                    </Badge>
                  )}
                  {c.can_pickup && (
                    <Badge variant="outline" className="text-xs text-green-700 border-green-200">
                      送迎可
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-700">
                  <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <a href={`tel:${c.phone_primary}`} className="hover:text-indigo-600 transition-colors">
                    {c.phone_primary}
                  </a>
                  {c.phone_secondary && (
                    <span className="text-gray-400">/ {c.phone_secondary}</span>
                  )}
                </div>
                {c.notes && (
                  <p className="text-xs text-gray-400">{c.notes}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                disabled={deleting === c.id}
                className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                氏名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 山田 花子"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">続柄</label>
              <input
                type="text"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="例: 父・母・祖父"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                電話番号（主） <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phonePrimary}
                onChange={(e) => setPhonePrimary(e.target.value)}
                placeholder="000-0000-0000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">電話番号（副）</label>
              <input
                type="tel"
                value={phoneSecondary}
                onChange={(e) => setPhoneSecondary(e.target.value)}
                placeholder="任意"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">備考</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="勤務先など（任意）"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">主保護者</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={canPickup}
                onChange={(e) => setCanPickup(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">送迎可</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim() || !phonePrimary.trim()}
              size="sm"
            >
              <Plus className="h-4 w-4" />
              {saving ? '追加中...' : '追加'}
            </Button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full py-2.5 text-sm text-gray-500 border-2 border-dashed border-gray-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-colors"
        >
          ＋ 緊急連絡先を追加する
        </button>
      )}
    </div>
  )
}
