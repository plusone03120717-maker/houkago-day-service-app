'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/**
 * 直前のページに戻るボタン。
 * 履歴がない場合（直接URLを開いた場合など）は fallbackHref に遷移する。
 */
export function BackButton({
  fallbackHref,
  className = 'p-2 rounded-lg border border-gray-200 hover:bg-gray-50',
  label = '戻る',
}: {
  fallbackHref: string
  className?: string
  label?: string
}) {
  const router = useRouter()

  const handleClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <button type="button" onClick={handleClick} className={className} aria-label={label}>
      <ArrowLeft className="h-4 w-4" />
    </button>
  )
}
