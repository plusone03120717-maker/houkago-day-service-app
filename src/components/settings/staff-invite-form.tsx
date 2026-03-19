'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus } from 'lucide-react'

export function StaffInviteForm() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('staff')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !name.trim()) return
    setLoading(true)
    setError('')
    setSuccess(false)
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          スタッフを招待
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">氏名</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田 太郎"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">メールアドレス</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@example.com"
                required
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">役割</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="staff">スタッフ</option>
              <option value="admin">管理者</option>
              <option value="therapist">療育士</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">招待メールを送信しました。</p>}
          <Button type="submit" disabled={loading} size="sm">
            {loading ? '送信中...' : '招待メールを送信'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
