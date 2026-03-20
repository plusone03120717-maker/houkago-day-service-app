'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function CallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const supabase = createClient()
    const next = searchParams.get('next') ?? '/dashboard'

    const doRedirect = () => router.replace(next)
    const doError = () => router.replace('/login?error=auth_error')

    // --- PKCE フロー: URLに ?code= がある場合 ---
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) doError()
        else doRedirect()
      })
      return
    }

    // --- ハッシュフロー: #access_token= がある場合（implicit flow）---
    const hash = window.location.hash.substring(1)
    const hashParams = new URLSearchParams(hash)
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) doError()
          else doRedirect()
        })
      return
    }

    // --- フォールバック: 既存セッションを確認 ---
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) doRedirect()
      else doError()
    })
  }, [])

  return null
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500">認証処理中...</p>
        <Suspense>
          <CallbackInner />
        </Suspense>
      </div>
    </div>
  )
}
