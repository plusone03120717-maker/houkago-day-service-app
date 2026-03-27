'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function formatJapaneseDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+09:00')
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`
}

/** 予約を確定し、保護者ポータルのメッセージへ通知する */
export async function confirmReservation(reservationId: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  // 現在のスタッフユーザーを取得（メッセージ送信者）
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  // 予約情報を取得
  const { data: reservation, error: resError } = await supabase
    .from('usage_reservations')
    .select('id, child_id, date, children(name), units(name)')
    .eq('id', reservationId)
    .single()

  if (resError || !reservation) return { error: '予約が見つかりません' }

  // ステータスを confirmed に更新
  const { error: updateError } = await supabase
    .from('usage_reservations')
    .update({ status: 'confirmed' })
    .eq('id', reservationId)

  if (updateError) return { error: updateError.message }

  // サービスロールで保護者のuser_idを取得（RLSバイパス）
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: parentLinks } = await adminClient
    .from('parent_children')
    .select('user_id')
    .eq('child_id', reservation.child_id)

  if (!parentLinks || parentLinks.length === 0) return {}

  const childName = (reservation.children as unknown as { name: string } | null)?.name ?? ''
  const unitName = (reservation.units as unknown as { name: string } | null)?.name ?? ''
  const dateStr = formatJapaneseDate(reservation.date)

  const content = `【予約確定のお知らせ】\n\n${childName}さんの利用予約が確定しました。\n\n📅 日付：${dateStr}\n🏫 ユニット：${unitName}\n\nご不明な点はメッセージにてお気軽にお問い合わせください。`

  // 各保護者へメッセージを送信
  await Promise.all(
    parentLinks.map((link) =>
      adminClient.from('messages').insert({
        sender_id: user.id,
        receiver_id: link.user_id,
        child_id: reservation.child_id,
        content,
        attachments: [],
      })
    )
  )

  return {}
}
