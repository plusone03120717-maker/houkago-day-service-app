'use client'

import { useState, useEffect } from 'react'
import type Liff from '@line/liff'

type LiffState =
  | { status: 'loading' }
  | { status: 'ready'; liff: typeof Liff; lineUserId: string; displayName: string }
  | { status: 'error'; message: string }

export function useLiff() {
  const [state, setState] = useState<LiffState>({ status: 'loading' })

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID
    if (!liffId) {
      setState({ status: 'error', message: 'LIFF IDが設定されていません' })
      return
    }

    import('@line/liff').then(async (mod) => {
      const liff = mod.default
      try {
        await liff.init({ liffId })
        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }
        const profile = await liff.getProfile()
        setState({
          status: 'ready',
          liff,
          lineUserId: profile.userId,
          displayName: profile.displayName,
        })
      } catch (err) {
        setState({ status: 'error', message: String(err) })
      }
    })
  }, [])

  return state
}
