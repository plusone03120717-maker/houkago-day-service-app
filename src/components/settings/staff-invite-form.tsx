'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'staff', label: 'スタッフ' },
  { value: 'admin', label: '管理者' },
  { value: 'driver', label: 'ドライバー' },
]

export function StaffInviteForm() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('staff')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const isDriverRole = role === 'driver'

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    setSuccess(false)

    if (isDriverRole || !email.trim()) {
      // メールなし → staff_membersに直接登録
      const { error: err } = await supabase
        .from('staff_members')
        .insert({ name: name.trim(), role })
      setLoading(false)
      if (err) {
        setError('登録に失敗しました: ' + err.message)
      } else {
        setSuccess(true)
        setName('')
        setEmail('')
        router.refresh()
      }
    } else {
      // メールあり → 招待メール送信
      const res = await fetch('/api/staff/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), role }),
      })
      setLoading(false)
      if (res.ok) {
        setSuccess(true)
        setEmail('')
        setName('')
      } else {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? '招待に失敗しました')
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
              <label className="text-xs font-medium text-gray-700 mb-1 block">氏名 <span className="text-red-500">*</span></label>
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
                <span className="ml-1 text-gray-400 font-normal">（ドライバーは不要）</span>
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@example.com"
                disabled={isDriverRole}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">役職</label>
            <div className="flex gap-2 flex-wrap">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setRole(opt.value); setError('') }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    role === opt.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {isDriverRole && (
            <p className="text-xs text-gray-400">
              ドライバーはアプリにログインしません。登録後、LINE User IDを設定することで送迎通知を受け取れます。
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && (
            <p className="text-sm text-green-600">
              {isDriverRole || !email.trim() ? '登録しました。' : '招待メールを送信しました。'}
            </p>
          )}
          <Button type="submit" disabled={loading || !name.trim()} size="sm">
            {loading ? '処理中...' : isDriverRole || !email.trim() ? '登録する' : '招待メールを送信'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
