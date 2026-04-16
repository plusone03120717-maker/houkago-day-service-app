'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus, Copy, Check, KeyRound } from 'lucide-react'

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

type InviteResult = { isExisting: boolean; email: string; tempPassword: string }

export function StaffInviteForm() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(['staff']))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<InviteResult | null>(null)
  const [copied, setCopied] = useState(false)

  const authRole = getAuthRole(selectedRoles)
  const needsEmail = authRole !== null

  const toggleRole = (value: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
    setError('')
    setResult(null)
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (ev: React.BaseSyntheticEvent) => {
    ev.preventDefault()
    if (!name.trim() || selectedRoles.size === 0) return
    setLoading(true)
    setError('')
    setResult(null)

    const nonAuthRoles = [...selectedRoles].filter((r) => !['admin', 'staff'].includes(r))

    if (needsEmail) {
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
      if (!res.ok) {
        setError(json.error ?? '登録に失敗しました')
        return
      }
      if (json.isExisting) {
        setResult({ isExisting: true, email: email.trim(), tempPassword: json.tempPassword })
      } else {
        setResult({ isExisting: false, email: email.trim(), tempPassword: json.tempPassword })
      }
      setEmail('')
      setName('')
      setSelectedRoles(new Set(['staff']))
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
        setResult({ isExisting: false, email: '', tempPassword: '' })
        setName('')
        setSelectedRoles(new Set(['driver']))
        window.location.reload()
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
                仮パスワードを発行します。スタッフにメールアドレスと仮パスワードをお伝えください。
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* 登録結果 */}
          {result && (
            result.tempPassword ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-700">
                  <KeyRound className="h-4 w-4" />
                  {result.isExisting ? 'パスワードをリセットしました' : 'スタッフを登録しました'}
                </div>
                <p className="text-xs text-indigo-600">
                  {result.isExisting
                    ? '登録済みのメールアドレスです。情報を更新し新しい仮パスワードを発行しました。以下をスタッフにお伝えください。'
                    : '以下のログイン情報をスタッフにお伝えください。初回ログイン後にパスワードの変更が求められます。'
                  }
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-28 shrink-0">メールアドレス</span>
                    <span className="text-sm font-mono text-gray-800 flex-1">{result.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-28 shrink-0">仮パスワード</span>
                    <span className="text-sm font-mono font-bold text-gray-900 flex-1 tracking-widest">{result.tempPassword}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(`メールアドレス: ${result.email}\n仮パスワード: ${result.tempPassword}`)}
                      className="shrink-0 border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'コピー済' : 'コピー'}
                    </Button>
                  </div>
                </div>
                <div className="pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    確認しました
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-green-600">登録しました。</p>
            )
          )}

          <Button type="submit" disabled={loading || !name.trim() || selectedRoles.size === 0} size="sm">
            {loading ? '処理中...' : needsEmail ? '登録して仮パスワードを発行' : '登録する'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
