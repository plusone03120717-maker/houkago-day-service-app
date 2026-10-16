// 「jFax で送る」ボタンに渡すもの（送り先の候補と、同じ月に送った記録）を読む。

import type { createClient } from '@/lib/supabase/server'
import { jfaxSenderConfigured } from './send-jfax'
import type { PartnerOffice } from './partner-offices'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export type FaxSendHistory = {
  officeName: string
  faxNumber: string
  childIds: string[]
  sentAt: string
  sentByName: string
  status: 'sent' | 'failed'
}

export type FaxSendContext = {
  offices: PartnerOffice[]
  history: FaxSendHistory[]
  senderConfigured: boolean
}

export async function loadFaxSendContext(
  supabase: SupabaseLike,
  yearMonth: string,
  kind: 'copay_list' | 'result',
): Promise<FaxSendContext> {
  const [{ data: officeRows }, { data: logRows }] = await Promise.all([
    supabase.from('partner_offices').select('id, name, office_number, fax_number, aliases').order('name'),
    supabase
      .from('fax_send_logs')
      .select('office_name, fax_number, child_ids, sent_at, sent_by_name, status')
      .eq('year_month', yearMonth)
      .eq('kind', kind)
      .order('sent_at', { ascending: false }),
  ])
  return {
    offices: ((officeRows ?? []) as Array<{
      id: string
      name: string
      office_number: string | null
      fax_number: string
      aliases: string[] | null
    }>).map((o) => ({
      id: o.id,
      name: o.name,
      officeNumber: o.office_number ?? '',
      faxNumber: o.fax_number,
      aliases: o.aliases ?? [],
    })),
    history: ((logRows ?? []) as Array<{
      office_name: string
      fax_number: string
      child_ids: string[] | null
      sent_at: string
      sent_by_name: string
      status: 'sent' | 'failed'
    }>).map((l) => ({
      officeName: l.office_name,
      faxNumber: l.fax_number,
      childIds: l.child_ids ?? [],
      sentAt: l.sent_at,
      sentByName: l.sent_by_name,
      status: l.status,
    })),
    senderConfigured: jfaxSenderConfigured(),
  }
}
