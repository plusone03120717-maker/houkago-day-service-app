import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// スタッフ（staff ロール）がアクセスできるパス（完全一致 or 前方一致）
// /shifts/summary・/settings は含めない
const STAFF_ALLOWED = ['/shifts/actual', '/children']
// 完全一致のみ許可するパス
const STAFF_ALLOWED_EXACT = ['/shifts']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return response

  const pathname = request.nextUrl.pathname

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role === 'staff') {
    const allowed =
      STAFF_ALLOWED_EXACT.includes(pathname) ||
      STAFF_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + '/'))
    if (!allowed) {
      return NextResponse.redirect(new URL('/shifts', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    // api・静的ファイル・認証フロー・set-password は除外
    '/((?!api|_next/static|_next/image|favicon\\.ico|login|auth|set-password).*)',
  ],
}
