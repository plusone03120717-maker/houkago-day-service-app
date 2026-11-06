import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * ログイン中の職員の ID（記録の「作った人」に入れる用）。
 * getUser() は毎回 Auth サーバーへ聞きに行くので保存のたびに待ちが出る。
 * ここでは手元のセッションから読む（期限切れなら自動で更新される）。
 * 書きこめるかどうかの確認は DB の RLS が行うので、ここでは ID を読むだけ。
 */
export async function getBrowserUserId(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}
