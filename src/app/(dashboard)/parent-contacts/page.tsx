import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { ParentContactsBoard } from '@/components/parent-contacts/parent-contacts-board'

export default async function ParentContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; filter?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const today = params.date ?? formatDate(new Date(), 'yyyy-MM-dd')
  const filter = params.filter ?? 'all'

  // その日の保護者連絡を取得
  const { data: contactsRaw } = await supabase
    .from('parent_attendance_contacts')
    .select('id, child_id, date, status, pickup_required, note, reported_at, children (id, name)')
    .eq('date', today)
    .order('reported_at', { ascending: false })

  type ContactRow = {
    id: string
    child_id: string
    date: string
    status: 'attending' | 'absent'
    pickup_required: boolean
    note: string | null
    reported_at: string
    children: { id: string; name: string } | null
  }
  const contacts = (contactsRaw ?? []) as unknown as ContactRow[]

  // その日の全登録児童を取得（連絡が来ていない児童を把握するため）
  const { data: allChildrenRaw } = await supabase
    .from('guardian_children')
    .select('children (id, name)')

  type GcRow = { children: { id: string; name: string } | null }
  const allChildren = ((allChildrenRaw ?? []) as unknown as GcRow[])
    .flatMap((r) => (r.children ? [r.children] : []))
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)

  const contactedChildIds = new Set(contacts.map((c) => c.child_id))
  const uncontactedChildren = allChildren.filter((c) => !contactedChildIds.has(c.id))

  return (
    <ParentContactsBoard
      date={today}
      filter={filter}
      contacts={contacts}
      uncontactedChildren={uncontactedChildren}
    />
  )
}
