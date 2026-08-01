import { createClient } from '@/lib/supabase/server'
import { ParentContactsBoard } from '@/components/parent-contacts/parent-contacts-board'

export default async function ParentContactsPage() {
  const supabase = await createClient()

  // 未確認の連絡のみを日付順に取得する
  const { data: unconfirmedRaw } = await supabase
    .from('parent_attendance_contacts')
    .select(
      'id, child_id, date, status, service_type, service_start_time, service_end_time, transport_type, pickup_time, dropoff_time, note, reported_at, is_new, approval_status, children (id, name)'
    )
    .eq('is_new', true)
    .order('date', { ascending: true })
    .order('reported_at', { ascending: false })

  type ContactRow = {
    id: string
    child_id: string
    date: string
    status: 'attending' | 'absent'
    service_type: 'regular' | 'daytime_support'
    service_start_time: string | null
    service_end_time: string | null
    transport_type: 'none' | 'pickup_only' | 'dropoff_only' | 'both'
    pickup_time: string | null
    dropoff_time: string | null
    note: string | null
    reported_at: string
    is_new: boolean
    approval_status: 'pending' | 'approved' | 'rejected'
    children: { id: string; name: string } | null
  }
  const unconfirmedContacts = (unconfirmedRaw ?? []) as unknown as ContactRow[]

  return <ParentContactsBoard unconfirmedContacts={unconfirmedContacts} />
}
