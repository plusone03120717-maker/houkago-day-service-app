import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getSessionUserId } from '@/lib/auth'
import {
  validateUsageContact,
  saveUsageContacts,
  loadFacilityClosures,
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

    const result = await saveUsageContacts(adminClient, date!, entries!)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[parent/usage-contacts]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
