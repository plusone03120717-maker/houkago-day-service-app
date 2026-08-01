import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const STAFF_BLOCKED_PREFIX = ['/shifts', '/settings', '/billing']

export async function proxy(request: NextRequest) {
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

  const role = user.user_metadata?.role as string | undefined
  if (!role) return response

  if (role === 'staff') {
    const pathname = request.nextUrl.pathname
    const blocked = STAFF_BLOCKED_PREFIX.some((p) => pathname === p || pathname.startsWith(p + '/'))
    if (blocked) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|login|auth|set-password|liff).*)',
  ],
}
