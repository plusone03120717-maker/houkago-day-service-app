// 帳票の印刷ページで使う「対象者の絞り込み」（URL の ?children=id1,id2）

/** ?children=a,b,c を配列にする。指定なしは空配列（＝全員） */
export function parseChildrenParam(param: string | undefined): string[] {
  return (param ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/** PDF のファイル名に付ける対象者の表記（例: 「山田太郎ほか2名」） */
export function childrenFileLabel(names: string[]): string {
  if (names.length === 0) return ''
  return names.length === 1 ? names[0] : `${names[0]}ほか${names.length - 1}名`
}
