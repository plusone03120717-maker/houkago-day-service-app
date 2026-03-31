import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import { StaffMessagesUI } from '@/components/messages/staff-messages-ui'

type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  read_at: string | null
  created_at: string
}

type ParentUser = {
  id: string
  name: string
  email: string
}

export default async function StaffMessagesPage() {
  await requireAdmin()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 保護者一覧（role='parent'）
  const { data: parentsRaw } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('role', 'parent')
    .order('name')
  const parents = (parentsRaw ?? []) as unknown as ParentUser[]

  // 自分が関係するメッセージ（送受信）
  const parentIds = parents.map((p) => p.id)
  const { data: messagesRaw } = parentIds.length > 0
    ? await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, content, read_at, created_at')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: true })
        .limit(200)
    : { data: [] }
  const messages = (messagesRaw ?? []) as unknown as Message[]

  // 未読件数（保護者から自分への未読）
  const unreadByParent: Record<string, number> = {}
  messages.forEach((m) => {
    if (m.receiver_id === user.id && !m.read_at && parentIds.includes(m.sender_id)) {
      unreadByParent[m.sender_id] = (unreadByParent[m.sender_id] ?? 0) + 1
    }
  })

  return (
    <StaffMessagesUI
      currentUserId={user.id}
      parents={parents}
      messages={messages}
      unreadByParent={unreadByParent}
    />
  )
}
