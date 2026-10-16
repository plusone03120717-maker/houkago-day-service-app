// 上限管理でやり取りする他事業所（partner_offices）の扱い。画面とサーバーの両方から使う。

export type PartnerOffice = {
  id: string
  name: string
  officeNumber: string
  faxNumber: string
  aliases: string[]
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** カタカナ→ひらがな・空白除去・小文字化して比較しやすくする */
function normalize(s: string): string {
  return s
    .replace(/[\s　]/g, '')
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .toLowerCase()
}

/**
 * 上限管理事業所（番号・名称）に当たる他事業所を探す。
 * 事業所番号が一致すればそれ、なければ名称・別名が完全に一致するものが1つだけのときにそれを返す。
 * 「ココロン」のように複数に当たりうる名前では決めない（職員が選ぶ）。
 */
export function findPartnerOffice(
  offices: PartnerOffice[],
  target: { officeNumber?: string | null; name?: string | null },
): PartnerOffice | null {
  const number = digits(target.officeNumber)
  if (number) {
    const byNumber = offices.find((o) => digits(o.officeNumber) === number)
    if (byNumber) return byNumber
  }
  const name = normalize(target.name ?? '')
  if (!name) return null
  const byName = offices.filter((o) => [o.name, ...o.aliases].some((n) => normalize(n) === name))
  return byName.length === 1 ? byName[0] : null
}

/**
 * jFax の送信先アドレス。国番号 81 を付け、市外局番の先頭の 0 を外す。
 * 例：0555-22-2307 → 81555222307@jfaxsend.com
 */
export function jfaxAddress(faxNumber: string): string | null {
  const d = digits(faxNumber)
  if (!/^0\d{9,10}$/.test(d)) return null
  return `81${d.slice(1)}@jfaxsend.com`
}
