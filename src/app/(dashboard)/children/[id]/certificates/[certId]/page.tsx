import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CertificateForm } from '@/components/children/certificate-form'

export default async function EditCertificatePage({
  params,
}: {
  params: Promise<{ id: string; certId: string }>
}) {
  const { id, certId } = await params
  const supabase = await createClient()

  const [{ data: child }, { data: cert }] = await Promise.all([
    supabase.from('children').select('id, name').eq('id', id).single(),
    supabase
      .from('benefit_certificates')
      .select('id, certificate_number, service_type, start_date, end_date, max_days_per_month, copay_limit, copay_category, municipality')
      .eq('id', certId)
      .eq('child_id', id)
      .single(),
  ])

  if (!child || !cert) notFound()

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/children/${id}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">受給者証を編集</h1>
          <p className="text-sm text-gray-500 mt-0.5">{child.name}</p>
        </div>
      </div>

      <CertificateForm
        childId={id}
        initial={{
          id: cert.id,
          certificate_number: cert.certificate_number,
          service_type: cert.service_type,
          start_date: cert.start_date,
          end_date: cert.end_date,
          max_days_per_month: cert.max_days_per_month,
          copay_limit: cert.copay_limit,
          copay_category: cert.copay_category ?? '',
          municipality: cert.municipality ?? '',
        }}
      />
    </div>
  )
}
