import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth'
import { jfaxAddress } from '@/lib/fax/partner-offices'
import { sendJfaxMail } from '@/lib/fax/send-jfax'
import { hasMoneyAccess } from '@/lib/require-admin'

// PDF をメールに添付して送るので、少し長めに待つ
export const maxDuration = 60

const MAX_PDF_BYTES = 10 * 1024 * 1024

/**
 * 上限管理の一覧表・結果票を jFax で他事業所へ送る。
 * 画面で職員が宛先・件名・本文を確かめて「送信する」を押したときだけ呼ばれる。
 * 宛先の FAX 番号は画面から受け取らず、他事業所の登録（partner_offices）から引く。
 */
export async function POST(request: NextRequest) {
  if (!(await hasMoneyAccess())) {
    return NextResponse.json({ error: '請求・給与はシステム管理者だけが扱えます' }, { status: 403 })
  }
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  // role が未設定なのは初期の管理者アカウント（require-admin と同じ扱い）
  if (user.role !== 'admin' && user.role !== 'staff' && user.role !== null) {
    return NextResponse.json({ error: '送信できるのはスタッフだけです' }, { status: 403 })
  }

  const form = await request.formData()
  const partnerOfficeId = String(form.get('partnerOfficeId') ?? '')
  const yearMonth = String(form.get('yearMonth') ?? '')
  const kind = String(form.get('kind') ?? '')
  const subject = String(form.get('subject') ?? '').trim()
  const body = String(form.get('body') ?? '')
  const childIds = String(form.get('childIds') ?? '').split(',').filter(Boolean)
  const pageCount = Number(form.get('pageCount') ?? 0) || null
  const file = form.get('pdf')

  if (!/^\d{6}$/.test(yearMonth)) return NextResponse.json({ error: '月の指定が正しくありません' }, { status: 400 })
  if (kind !== 'copay_list' && kind !== 'result') {
    return NextResponse.json({ error: '帳票の種類が正しくありません' }, { status: 400 })
  }
  if (!(file instanceof File) || file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'PDF がありません' }, { status: 400 })
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF が大きすぎます（10MB まで）' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: office } = await supabase
    .from('partner_offices')
    .select('id, name, fax_number')
    .eq('id', partnerOfficeId)
    .maybeSingle()
  if (!office) return NextResponse.json({ error: '送り先の事業所が見つかりません' }, { status: 400 })
  const to = jfaxAddress(office.fax_number)
  if (!to) {
    return NextResponse.json(
      { error: `${office.name}の FAX 番号（${office.fax_number || '未登録'}）が正しくありません。設定 → 他事業所の FAX 番号 で直してください` },
      { status: 400 },
    )
  }

  // 記録は送れなかったときも残す（職員の画面からは書けない表なので service role で書く）
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const log = {
    year_month: yearMonth,
    kind,
    partner_office_id: office.id,
    office_name: office.name,
    fax_number: office.fax_number,
    child_ids: childIds,
    subject,
    body,
    file_name: file.name,
    page_count: pageCount,
    sent_by: user.id,
    sent_by_name: user.name ?? '',
  }

  try {
    await sendJfaxMail({
      to,
      subject,
      body,
      fileName: file.name,
      pdf: Buffer.from(await file.arrayBuffer()),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await admin.from('fax_send_logs').insert({ ...log, status: 'failed', error: message })
    return NextResponse.json({ error: `送れませんでした: ${message}` }, { status: 502 })
  }

  const { data: saved } = await admin
    .from('fax_send_logs')
    .insert({ ...log, status: 'sent' })
    .select('sent_at')
    .single()
  return NextResponse.json({ ok: true, to, sentAt: saved?.sent_at ?? new Date().toISOString() })
}
