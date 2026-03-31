'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus, Copy, Check, Link as LinkIcon } from 'lucide-react'

// 役職オプション（needsAuth=trueはアプリログイン・メールアドレスが必要）
const ROLE_OPTIONS = [
  { value: 'staff',    label: 'スタッフ',  needsAuth: true },
  { value: 'admin',    label: '管理者',    needsAuth: true },
  { value: 'driver',   label: 'ドライバー', needsAuth: false },
  { value: 'therapist',label: '療育士',    needsAuth: false },
]

function getAuthRole(selected: Set<string>): 'admin' | 'staff' | null {
  if (selected.has('admin')) return 'admin'
  if (selected.has('staff')) return 'staff'
  return null
}

export function StaffInviteForm() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(['staff']))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [isExisting, setIsExisting] = useState(false)
  const [copied, setCopied] = useState(false)

  const authRole = getAuthRole(selectedRoles)
  const needsEmail = authRole !== null

  const toggleRole = (value: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    })
    setError('')
    setInviteLink(null)
  }

  const handleCopy = async () => {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (ev: React.BaseSyntheticEvent) => {
    ev.preventDefault()
    if (!name.trim() || selectedRoles.size === 0) return
    setLoading(true)
    setError('')
    setInviteLink(null)

    const nonAuthRoles = [...selectedRoles].filter((r) => !['admin', 'staff'].includes(r))

    if (needsEmail) {
      // アプリログインあり → 招待リンクを生成
      if (!email.trim()) {
        setError('メールアドレスを入力してください')
        setLoading(false)
        return
      }
      const res = await fetch('/api/staff/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          role: authRole,
          jobTitles: nonAuthRoles,
        }),
      })
      setLoading(false)
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setInviteLink(json.inviteLink ?? null)
        setIsExisting(json.isExisting ?? false)
        setEmail('')
        setName('')
        setSelectedRoles(new Set(['staff']))
        router.refresh()
      } else {
        setError(json.error ?? '招待リンクの生成に失敗しました')
      }
    } else {
      // ログイン不要 → staff_members に登録
      const { error: err } = await supabase
        .from('staff_members')
        .insert({
          name: name.trim(),
          role: [...selectedRoles][0] ?? 'driver',
          roles: [...selectedRoles],
        })
      setLoading(false)
      if (err) {
        setError('登録に失敗しました: ' + err.message)
      } else {
        setName('')
        setSelectedRoles(new Set(['driver']))
        router.refresh()
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          スタッフを追加
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">
                氏名 <span className="text-red-500">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田 太郎"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">
                メールアドレス
                {needsEmail
                  ? <span className="text-red-500 ml-0.5">*</span>
                  : <span className="ml-1 text-gray-400 font-normal">（ドライバー等ログイン不要）</span>
                }
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@example.com"
                disabled={!needsEmail}
                required={needsEmail}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">
              役職
              <span className="ml-1 text-gray-400 font-normal">（複数選択可）</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleRole(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    selectedRoles.has(opt.value)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {!needsEmail && selectedRoles.size > 0 && (
              <p className="text-xs text-gray-400 mt-1.5">
                ログイン不要のスタッフとして登録されます。LINE User IDを設定することで送迎通知を受け取れます。
              </p>
            )}
            {needsEmail && (
              <p className="text-xs text-gray-400 mt-1.5">
                招待リンクを生成します。リンクをコピーしてスタッフにメール等でお送りください。
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* 招待リンク表示 */}
          {inviteLink && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-700">
                <LinkIcon className="h-4 w-4" />
                {isExisting ? 'パスワードリセットリンクを生成しました' : 'スタッフ招待リンクが生成されました'}
              </div>
              <p className="text-xs text-indigo-600">
                {isExisting
                  ? 'このメールアドレスは登録済みです。以下のリンクをスタッフに送ることでパスワードを再設定できます。'
                  : '以下のリンクをコピーして、スタッフにメールやLINEでお送りください。リンクは一度のみ使用できます。'
                }
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="flex-1 text-xs bg-white border border-indigo-200 rounded px-2 py-1.5 text-gray-700 select-all"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="shrink-0 border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'コピー済' : 'コピー'}
                </Button>
              </div>
            </div>
          )}

          <Button type="submit" disabled={loading || !name.trim() || selectedRoles.size === 0} size="sm">
            {loading ? '処理中...' : needsEmail ? '招待リンクを生成' : '登録する'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
