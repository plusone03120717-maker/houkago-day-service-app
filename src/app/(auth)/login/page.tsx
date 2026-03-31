'use client'

import { useState, useEffect } from 'react'
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

  // 招待リンク・パスワードリセットリンクのトークンを処理してパスワード設定画面へ転送
  useEffect(() => {
    const handleAuthToken = async () => {
      // PKCE フロー: ?code= がある場合
      const searchParams = new URLSearchParams(window.location.search)
      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          router.replace('/set-password')
        }
        return
      }

      // Implicit フロー: #access_token= がある場合
      const hash = window.location.hash.substring(1)
      const hashParams = new URLSearchParams(hash)
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const type = hashParams.get('type')
      if (accessToken && refreshToken && (type === 'invite' || type === 'recovery')) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (!error) {
          router.replace('/set-password')
        }
      }
    }
    handleAuthToken()
  }, [])
  const [email, setEmail] = useState('')
  const [childName, setChildName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    let loginEmail = email

    // 保護者モード：児童名から保護者のメールを検索
    if (mode === 'parent') {
      const res = await fetch('/api/auth/parent-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childName: childName.trim() }),
      })
      const json = await res.json() as { email?: string; error?: string }
      if (!res.ok || !json.email) {
        setError(json.error ?? 'お子さんの名前が見つかりません')
        setLoading(false)
        return
      }
      loginEmail = json.email
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password })

    if (error) {
      setError(mode === 'parent'
        ? 'パスワードが正しくありません。管理者に再設定を依頼してください'
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
                : 'お子さんの名前とパスワードを入力してください'}
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
                  <label htmlFor="childName" className="text-sm font-medium text-gray-700">
                    お子さんの名前
                  </label>
                  <Input
                    id="childName"
                    type="text"
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    placeholder="例：田中 あきと"
                    required
                    autoComplete="off"
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
