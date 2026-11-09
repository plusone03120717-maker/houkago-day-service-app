import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CertificateForm } from '@/components/children/certificate-form'

export default async function NewCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: child } = await supabase
    .from('children')
    .select('id, name, service_type')
    .eq('id', id)
    .single()

  if (!child) notFound()

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/children/${id}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">受給者証を追加</h1>
          <p className="text-sm text-gray-500 mt-0.5">{child.name}</p>
        </div>
      </div>

      {/* 児発の子は、サービス種別と決定サービスコード（611000）を児発で始める */}
      <CertificateForm
        childId={id}
        initial={child.service_type === 'development_support' ? { service_type: 'development_support' } : undefined}
      />
    </div>
  )
}
