import { createClient } from '@/lib/supabase/server'
import { findCandidates, type CandidateChild } from '@/lib/guardian-registration'
import { LineRegistrationsManager } from '@/components/settings/line-registrations-manager'

export default async function LineRegistrationsPage() {
  const supabase = await createClient()

  const [{ data: requestsRaw }, { data: childrenRaw }, { data: guardiansRaw }] = await Promise.all([
    supabase
      .from('guardian_registration_requests')
      .select('id, line_display_name, child_name_kana, birth_date, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('children')
      .select('id, name, name_kana, birth_date')
      .eq('is_active', true)
      .order('name_kana', { ascending: true, nullsFirst: false }),
    supabase
      .from('guardians')
      .select('id, name, created_at, guardian_children (child_id, children (id, name))')
      .order('created_at', { ascending: false }),
  ])

  type RequestRow = {
    id: string
    line_display_name: string | null
    child_name_kana: string
    birth_date: string
    created_at: string
  }
  type GuardianRow = {
    id: string
    name: string | null
    created_at: string
    guardian_children: { child_id: string; children: { id: string; name: string } | null }[]
  }

  const children = (childrenRaw ?? []) as CandidateChild[]

  // 候補探しはサーバーで済ませ、画面には結果だけを渡す
  const requests = ((requestsRaw ?? []) as RequestRow[]).map((r) => ({
    ...r,
    candidates: findCandidates(children, r.child_name_kana, r.birth_date).map((c) => ({
      id: c.id,
      name: c.name,
      birth_date: c.birth_date,
      birthMatch: c.birthMatch,
      nameMatch: c.nameMatch,
    })),
  }))

  const guardians = ((guardiansRaw ?? []) as unknown as GuardianRow[]).map((g) => ({
    id: g.id,
    name: g.name,
    created_at: g.created_at,
    children: g.guardian_children
      .map((gc) => gc.children)
      .filter((c): c is { id: string; name: string } => c !== null),
  }))

  return (
    <LineRegistrationsManager
      requests={requests}
      guardians={guardians}
      childList={children.map((c) => ({ id: c.id, name: c.name, birth_date: c.birth_date }))}
    />
  )
}
