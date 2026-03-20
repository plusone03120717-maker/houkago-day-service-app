'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Loader2 } from 'lucide-react'

type Mode = 'staff' | 'parent'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('staff')
  const [email, setEmail] = useState('')
  const [loginCode, setLoginCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    let loginEmail = email

    // 保護者モード：ログインコードからメールアドレスを組み立て
    if (mode === 'parent') {
      loginEmail = `${loginCode.trim().toUpperCase()}@parent.local`
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password })

    if (error) {
      setError(mode === 'parent'
        ? 'ログインコードまたはパスワードが正しくありません'
        : 'メールアドレスまたはパスワードが正しくありません'
      )
      setLoading(false)
      return
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single()

    const dest = userData?.role === 'parent' ? '/parent' : '/dashboard'
    router.push(dest)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Building2 className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">放デイ管理アプリ</h1>
              <p className="text-xs text-gray-500">放課後等デイサービス・児童発達支援</p>
            </div>
          </div>
        </div>

        {/* モード切替タブ */}
        <div className="flex rounded-xl bg-gray-100 p-1 mb-4">
          <button
            onClick={() => { setMode('staff'); setError(null) }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'staff' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            スタッフ
          </button>
          <button
            onClick={() => { setMode('parent'); setError(null) }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'parent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            保護者
          </button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ログイン</CardTitle>
            <CardDescription>
              {mode === 'staff'
                ? 'メールアドレスとパスワードを入力してください'
                : '施設から受け取ったログインコードとパスワードを入力してください'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {mode === 'staff' ? (
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-gray-700">
                    メールアドレス
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@mail.com"
                    required
                    autoComplete="email"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="loginCode" className="text-sm font-medium text-gray-700">
                    ログインコード
                  </label>
                  <Input
                    id="loginCode"
                    type="text"
                    value={loginCode}
                    onChange={(e) => setLoginCode(e.target.value)}
                    placeholder="例：ABC123"
                    required
                    autoComplete="off"
                    className="tracking-widest text-center text-lg font-bold uppercase"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-gray-700">
                  パスワード
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="パスワード"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                ログイン
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
