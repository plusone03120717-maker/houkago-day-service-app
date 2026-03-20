'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const next = searchParams.get('next') ?? '/dashboard'

    const redirect = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login?error=auth_error')
        return
      }
      router.replace(next)
    }

    // PKCE フロー: URL に ?code= がある場合
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          router.replace('/login?error=auth_error')
        } else {
          redirect()
        }
      })
      return
    }

    // ハッシュフロー: #access_token= がある場合（パスワードリセットなど）
    // Supabase クライアントが自動的にセッションを検出するのを待つ
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        if (session) {
          subscription.unsubscribe()
          redirect()
        }
      }
    })

    // 既にセッションがある場合はそのままリダイレクト
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe()
        redirect()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500">認証処理中...</p>
      </div>
    </div>
  )
}
