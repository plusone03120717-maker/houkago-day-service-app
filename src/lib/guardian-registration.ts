/**
 * 保護者のLINE登録申請で、入力された「名前（ひらがな）＋生年月日」から
 * 該当しそうな児童を探す。
 *
 * 入力は候補を出すための手がかりにすぎず、紐付ける児童は最後にスタッフが選ぶ。
 * そのため完全一致は求めず、かな表記のゆれ（カタカナ／ひらがな、空白、全角半角）は
 * 同じものとして扱う。
 */

/** かな表記をそろえる：NFKC → カタカナをひらがなへ → 空白類を除く */
export function normalizeKana(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s　・･]/g, '')
}

export type CandidateChild = {
  id: string
  name: string
  name_kana: string | null
  birth_date: string
}

export type MatchedCandidate = CandidateChild & {
  birthMatch: boolean
  nameMatch: boolean
}

/**
 * 候補の児童を、当てはまりの強い順に返す。
 * 生年月日一致＋名前一致 → 生年月日一致 → 名前一致 の順。どちらも合わない児童は返さない。
 * 名前は「下の名前だけ」の入力にも当たるよう、部分一致も一致とみなす。
 */
export function findCandidates(
  children: CandidateChild[],
  nameKana: string,
  birthDate: string
): MatchedCandidate[] {
  const input = normalizeKana(nameKana)
  return children
    .map((c) => {
      const kana = normalizeKana(c.name_kana)
      const nameMatch =
        input.length > 0 && kana.length > 0 && (kana === input || kana.includes(input) || input.includes(kana))
      return { ...c, birthMatch: c.birth_date === birthDate, nameMatch }
    })
    .filter((c) => c.birthMatch || c.nameMatch)
    .sort((a, b) => {
      const score = (c: MatchedCandidate) => (c.birthMatch ? 2 : 0) + (c.nameMatch ? 1 : 0)
      return score(b) - score(a)
    })
}
