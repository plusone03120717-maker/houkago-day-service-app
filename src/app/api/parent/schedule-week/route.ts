import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/auth'
import { confirmWeek, getAdminClient, loadParentWeeks } from '@/lib/schedule-week-confirm-db'
import { isWeekStart } from '@/lib/schedule-week-confirm'

/** ログイン中の保護者のお子さま（自分の子の分しか読み書きさせない） */
async function myChildren(userId: string): Promise<{ id: string; name: string }[]> {
  const { data } = await getAdminClient()
    .from('parent_children')
    .select('children (id, name)')
    .eq('user_id', userId)
  return ((data ?? []) as unknown as { children: { id: string; name: string } | null }[])
    .map((r) => r.children)
    .filter((c): c is { id: string; name: string } => c !== null)
}

/** 保護者の画面の「予定の確認」：知らせが届いている週と、わが子の予定・確認の状態 */
export async function GET() {
  try {
    const userId = await getSessionUserId()
    if (!userId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    const children = await myChildren(userId)
    const result = await loadParentWeeks(children)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[parent/schedule-week GET]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

/** 「確認しました」：その週のわが子の予定を、今の中身で確認ずみにする */
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    const { weekStart } = await req.json() as { weekStart?: string }
    if (!weekStart || !isWeekStart(weekStart)) {
      return NextResponse.json({ error: '週の指定が正しくありません' }, { status: 400 })
    }
    const children = await myChildren(userId)
    if (children.length === 0) {
      return NextResponse.json({ error: 'お子さまの情報がありません' }, { status: 400 })
    }
    const result = await confirmWeek(children.map((c) => c.id), weekStart, userId)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true, confirmed: result.confirmed })
  } catch (err) {
    console.error('[parent/schedule-week POST]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
