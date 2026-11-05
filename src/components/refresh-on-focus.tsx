'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 別のタブ・画面から戻ってきたときに、サーバーの最新の内容で読み直す。
 * 上限管理を別のタブで保存したあと、開いたままの国保連請求のタブに古い明細が出続けないようにするため。
 */
export function RefreshOnFocus({ minIntervalMs = 15000 }: { minIntervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    let last = Date.now()
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - last < minIntervalMs) return
      last = Date.now()
      router.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [router, minIntervalMs])
  return null
}
