'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateIncidentStatus(
  incidentId: string,
  data: {
    status: string
    followUpNotes: string | null
    reportedToMunicipality: boolean
    municipalityReportDate: string | null
  }
) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('incident_reports')
    .update({
      status: data.status,
      follow_up_notes: data.followUpNotes || null,
      reported_to_municipality: data.reportedToMunicipality,
      municipality_report_date: data.municipalityReportDate || null,
    })
    .eq('id', incidentId)

  if (error) return { error: error.message }

  // ダッシュボードと一覧ページのキャッシュを無効化
  revalidatePath('/dashboard')
  revalidatePath('/incidents')
  revalidatePath(`/incidents/${incidentId}`)

  return { success: true }
}
