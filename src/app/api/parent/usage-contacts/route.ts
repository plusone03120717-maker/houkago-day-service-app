import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getSessionUserId } from '@/lib/auth'
import {
  validateUsageContact,
  validateTransportPlaces,
  saveUsageContacts,
  loadFacilityClosures,
  loadTransportPlaces,
  loadReservationDeadline,
  validateContactTargets,
  type UsageContactEntry,
} from '@/lib/parent-usage-contact'

// parent_attendance_contacts はスタッフ・管理者しか書けないRLSなので、
// ログイン中の保護者の子かどうかをここで確かめてから service role で書き込む。
const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/** 保護者ポータルから利用・お休みを連絡する */
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

    const { date, entries } = await req.json() as {
      date?: string
      entries?: UsageContactEntry[]
    }

    const invalid = validateUsageContact(date, entries)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

    // 自分の子どもの分しか送れないようにする
    const { data: links } = await adminClient
      .from('parent_children')
      .select('child_id')
      .eq('user_id', userId)
    const allowed = new Set(((links ?? []) as { child_id: string }[]).map((l) => l.child_id))

    for (const entry of entries!) {
      if (!allowed.has(entry.childId)) {
        return NextResponse.json(
          { error: '許可されていないお子さまが含まれています' },
          { status: 403 }
        )
      }
    }

    // 施設がお休みの日は受け付けない。画面では入力欄を出していないが、
    // 休業日が後から登録されることもあるので保存の直前にも確かめる
    const [year, month] = date!.split('-').map(Number)
    const closures = await loadFacilityClosures(
      adminClient,
      entries!.map((e) => e.childId),
      year,
      month
    )
    const closure = closures.find((c) => c.date === date)
    if (closure) {
      return NextResponse.json(
        { error: `この日は施設がお休みです（${closure.title}）` },
        { status: 400 }
      )
    }

    // 申込を締め切った月に新しい日を足すことはできない（利用時間などの変更は通す）。
    // キャンセルは、もともと予定がある日にしか送れない。
    // 画面を開いたままにしていた場合に備えて、保存の直前にも確かめる
    const deadline = await loadReservationDeadline(adminClient, entries!.map((e) => e.childId))
    const badTarget = await validateContactTargets(adminClient, date!, entries!, deadline)
    if (badTarget) return NextResponse.json({ error: badTarget }, { status: 400 })

    // 送迎の場所は、その児童の選択肢（学校・登録住所）に無いものを受け付けない。
    // 他人の住所IDや削除済みの住所を指定されると送迎先が実在しなくなるため
    const childIds = entries!.map((e) => e.childId)
    const places = await loadTransportPlaces(adminClient, childIds)
    const badPlace = validateTransportPlaces(places, entries!)
    if (badPlace) return NextResponse.json({ error: badPlace }, { status: 400 })

    const result = await saveUsageContacts(adminClient, date!, entries!)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[parent/usage-contacts]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
