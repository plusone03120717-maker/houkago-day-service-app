import { createClient } from '@/lib/supabase/server'
import { MessagesUI } from '@/components/parent/messages-ui'

type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  read_at: string | null
  created_at: string
  attachments: unknown[]
}

type Staff = {
  id: string
  name: string
  email: string
}

export default async function ParentMessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 自分の子供が通う施設のスタッフ一覧を取得
  const { data: parentChildrenRaw } = await supabase
    .from('parent_children')
    .select('child_id, children(children_units(units(facility_id)))')
    .eq('user_id', user.id)

  // 施設IDを抽出
  const facilityIds = new Set<string>()
  ;(parentChildrenRaw ?? []).forEach((pc) => {
    const child = pc.children as unknown as {
      children_units: Array<{ units: { facility_id: string } | null }>
    } | null
    child?.children_units?.forEach((cu) => {
      if (cu.units?.facility_id) facilityIds.add(cu.units.facility_id)
    })
  })

  // 施設のスタッフを取得
  const { data: staffRaw } = facilityIds.size > 0
    ? await supabase
        .from('staff_profiles')
        .select('user_id, users(id, name, email)')
        .in('facility_id', Array.from(facilityIds))
    : { data: [] }
  const staffList = (staffRaw ?? []).map((sp) => sp.users as unknown as Staff).filter(Boolean)

  // メッセージ履歴を取得
  const { data: messagesRaw } = await supabase
    .from('messages')
    .select('id, sender_id, receiver_id, content, read_at, created_at, attachments')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order('created_at', { ascending: true })
    .limit(100)
  const messages = (messagesRaw ?? []) as Message[]

  // 未読メッセージを既読にする
  const unreadIds = messages.filter((m) => m.receiver_id === user.id && !m.read_at).map((m) => m.id)
  if (unreadIds.length > 0) {
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds)
  }

  return (
    <MessagesUI
      currentUserId={user.id}
      messages={messages}
      staffList={staffList}
    />
  )
}
