import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionUserId } from '@/lib/auth'
import { readDocsFile } from '@/lib/support/manual'

/**
 * アプリの操作マニュアル（docs/manual.html）をそのまま配信する。
 *
 * public/ に置くとログインなしで誰でも読めてしまうのと、サポートボットの
 * 知識源と実体が二重になるため、docs/ の1ファイルをここから読んで返す。
 * docs/ は自動トレースでは関数バンドルに含まれないので、next.config.ts の
 * outputFileTracingIncludes に '/manual' を登録している。
 */

// 280KBほどあるので、関数インスタンスが生きている間は読み直さない。
// デプロイのたびに新しいインスタンスになるため、更新は自動的に反映される。
let cache: string | null = null

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (cache === null) {
    cache = await readDocsFile('manual.html')
  }

  if (cache === null) {
    return new NextResponse('操作マニュアルを読み込めませんでした', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  return new NextResponse(cache, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // ログインしている本人のブラウザにだけ、短時間だけ持たせる
      'cache-control': 'private, max-age=300',
    },
  })
}
