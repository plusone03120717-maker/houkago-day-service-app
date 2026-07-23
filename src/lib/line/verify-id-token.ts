export async function verifyLineIdToken(idToken: string, channelId?: string): Promise<string> {
  const effectiveChannelId = channelId ?? process.env.LINE_CHANNEL_ID
  if (!effectiveChannelId) throw new Error('LINE_CHANNEL_ID が設定されていません')

  const params = new URLSearchParams({ id_token: idToken, client_id: effectiveChannelId })
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

// アクセストークンをLINE Profile APIで検証し、lineUserIdを返す。
// openid スコープ不要で profile スコープのみで動作する。
export async function verifyLineAccessToken(accessToken: string): Promise<string> {
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LINE access token verification failed: ${text}`)
  }

  const json = await res.json() as { userId?: string }
  if (!json.userId) throw new Error('LINE profile に userId が含まれていません')

  return json.userId
}
