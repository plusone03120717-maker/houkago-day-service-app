import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// スタッフ（staff ロール）が前方一致でアクセスできるパス
const STAFF_ALLOWED_PREFIX = ['/shifts/actual', '/children']
// スタッフが完全一致でアクセスできるパス
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

  // DBクエリを使わず JWT の user_metadata.role を直接使用（RLS の影響を受けない）
  const role = user.user_metadata?.role as string | undefined
  if (!role) return response // metadataにroleがない場合は通す（管理者等）

  if (role === 'staff') {
    const pathname = request.nextUrl.pathname
    const allowed =
      STAFF_ALLOWED_EXACT.includes(pathname) ||
      STAFF_ALLOWED_PREFIX.some((p) => pathname === p || pathname.startsWith(p + '/'))

    if (!allowed) {
      return NextResponse.redirect(new URL('/shifts', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|login|auth|set-password).*)',
  ],
}
