import { redirect } from 'next/navigation'

/**
 * サイドバーの「上限管理」の入口。
 * 上限管理は月初に前月分を行うので、前月の画面を開く。
 */
export default function UpperLimitIndexPage() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  redirect(`/billing/${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}/upper-limit`)
}
