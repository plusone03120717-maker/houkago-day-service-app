/**
 * LINE IDトークンをLINEのサーバーで検証し、line_user_id (sub) を返す。
 * クライアントから送られたトークンを信用せず必ずサーバー側で検証すること。
 */
export async function verifyLineIdToken(idToken: string): Promise<string> {
  const channelId = process.env.LINE_CHANNEL_ID
  if (!channelId) throw new Error('LINE_CHANNEL_ID が設定されていません')

  const params = new URLSearchParams({ id_token: idToken, client_id: channelId })
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LINE token verification failed: ${text}`)
  }

  const json = await res.json() as { sub?: string; error?: string }
  if (!json.sub) throw new Error('LINE token に sub が含まれていません')

  return json.sub
}
