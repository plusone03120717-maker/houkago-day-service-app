'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Loader2 } from 'lucide-react'

type Mode = 'staff' | 'parent'

// Cloudflare Turnstile（保護者ログインのロボット対策）。サイトキーがなければ出さない
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

type Turnstile = {
  render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; language?: string }) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window { turnstile?: Turnstile }
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('staff')

  const [phone, setPhone] = useState('')
  const [childName, setChildName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<HTMLDivElement>(null)
  const turnstileWidgetId = useRef<string | null>(null)

  // 保護者モードのときだけ Turnstile を読み込んで表示する
  useEffect(() => {
    if (mode !== 'parent' || !TURNSTILE_SITE_KEY) return
    let cancelled = false

    const render = () => {
      if (cancelled || !turnstileRef.current || !window.turnstile) return
      turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        language: 'ja',
      })
    }

    if (window.turnstile) {
      render()
    } else {
      const src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      let script = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
      if (!script) {
        script = document.createElement('script')
        script.src = src
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', render)
    }

    return () => {
      cancelled = true
      if (turnstileWidgetId.current && window.turnstile) window.turnstile.remove(turnstileWidgetId.current)
      turnstileWidgetId.current = null
      setTurnstileToken('')
    }
  }, [mode])

  const handleLogin = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // 保護者モード：名前の照合からパスワードの確認までサーバーで行う
    if (mode === 'parent') {
      const res = await fetch('/api/auth/parent-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childName: childName.trim(), password, turnstileToken }),
      })
      const json = await res.json().catch(() => ({})) as { needsPasswordChange?: boolean; error?: string }
      if (!res.ok) {
        setError(json.error ?? 'ログインできませんでした。時間をおいてもう一度お試しください')
        setLoading(false)
        // Turnstile の印は1回しか使えないので取り直す
        if (turnstileWidgetId.current && window.turnstile) window.turnstile.reset(turnstileWidgetId.current)
        setTurnstileToken('')
        return
      }
      router.push(json.needsPasswordChange ? '/set-password' : '/parent')
      router.refresh()
      return
    }

    let loginEmail = ''

    if (mode === 'staff') {
      // 電話番号を疑似メールに変換（既存のメールアドレスはそのまま使用）
      if (phone.includes('@')) {
        loginEmail = phone.trim()
      } else {
        const digits = phone.replace(/[\s\-\(\)\.]/g, '').replace(/^\+81/, '0')
        loginEmail = `${digits}@staff.internal`
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password })

    if (error) {
      setError('電話番号またはパスワードが正しくありません')
      setLoading(false)
      return
    }

    // 初回ログイン（仮パスワード）の場合はパスワード設定画面へ
    if (data.user.user_metadata?.needs_password_change) {
      router.push('/set-password')
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
                ? '電話番号とパスワードを入力してください'
                : 'お子さんの名前とパスワードを入力してください'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {mode === 'staff' ? (
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium text-gray-700">
                    電話番号
                  </label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="090-1234-5678"
                    required
                    autoComplete="tel"
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

              {mode === 'parent' && TURNSTILE_SITE_KEY && (
                <div ref={turnstileRef} className="flex justify-center" />
              )}

              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || (mode === 'parent' && !!TURNSTILE_SITE_KEY && !turnstileToken)}
              >
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
