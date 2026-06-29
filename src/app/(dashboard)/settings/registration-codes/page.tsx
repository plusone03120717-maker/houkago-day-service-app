import { createClient } from '@/lib/supabase/server'
import { RegistrationCodesManager } from '@/components/settings/registration-codes-manager'

export default async function RegistrationCodesPage() {
  const supabase = await createClient()

  const [{ data: codesRaw }, { data: childrenRaw }] = await Promise.all([
    supabase
      .from('registration_codes')
      .select('code, child_id, used, created_at, children (id, name)')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('children')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
  ])

  type CodeRow = {
    code: string
    child_id: string
    used: boolean
    created_at: string
    children: { id: string; name: string } | null
  }

  const codes = (codesRaw ?? []) as unknown as CodeRow[]
  const children = (childrenRaw ?? []) as { id: string; name: string }[]

  return <RegistrationCodesManager codes={codes} children={children} />
}
