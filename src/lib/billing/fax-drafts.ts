// 月初の FAX チェックが読み取った上限管理の FAX（upper_limit_fax_receipts）を、
// 上限管理の画面の入力欄へ先に入れておくための形にする。
// ここで返すのは下書き。職員が FAX と見比べて「この内容で確定」を押したときに、はじめて保存される。

import type { createClient } from '@/lib/supabase/server'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

/** FAX 1通の出どころ（画面に「○日に受信した FAX から」と出す） */
export type FaxDraftSource = { faxFile: string; receivedAt: string | null }

/** 他事業所が管理する児童：管理事業所から届いた結果票の読み取り */
export type FaxResultDraft = FaxDraftSource & {
  officeNumber: string
  officeName: string
  result: '1' | '2' | '3' | null
  /** 結果票の、うちの事業所の行の「管理結果後利用者負担額」 */
  managedCopayAmount: number | null
}

/** うちが管理する児童：他事業所から届いた一覧表の読み取り（事業所ごと） */
export type FaxCopayDraft = FaxDraftSource & {
  officeNumber: string
  officeName: string
  totalCost: number | null
  copayAmount: number | null
}

export type FaxDraft = {
  result: FaxResultDraft | null
  copayLists: FaxCopayDraft[]
}

type ReceiptRow = {
  child_id: string | null
  form_type: 'copay_list' | 'result'
  office_number: string
  office_name: string
  total_cost: number | null
  copay_amount: number | null
  result: '1' | '2' | '3' | null
  managed_copay_amount: number | null
  fax_file: string
  received_at: string | null
  created_at: string
}

/** 同じ事業所から何度か届いたときは、あとから受信した FAX（訂正版）を使う */
const newer = (a: ReceiptRow, b: ReceiptRow) =>
  (a.received_at ?? a.created_at) >= (b.received_at ?? b.created_at)

export async function loadFaxDrafts(
  supabase: SupabaseLike,
  yearMonth: string,
  childIds: string[],
): Promise<Map<string, FaxDraft>> {
  const drafts = new Map<string, FaxDraft>()
  if (childIds.length === 0) return drafts

  const { data } = await supabase
    .from('upper_limit_fax_receipts')
    .select(
      'child_id, form_type, office_number, office_name, total_cost, copay_amount, result, managed_copay_amount, fax_file, received_at, created_at',
    )
    .eq('year_month', yearMonth)
    .in('child_id', childIds)

  // 児童 × 帳票の種類 × 事業所 ごとに、いちばん新しい FAX だけ残す
  const latest = new Map<string, ReceiptRow>()
  for (const r of (data ?? []) as ReceiptRow[]) {
    if (!r.child_id) continue
    const key = `${r.child_id}|${r.form_type}|${r.office_number || r.office_name}`
    const prev = latest.get(key)
    if (!prev || newer(r, prev)) latest.set(key, r)
  }

  for (const r of latest.values()) {
    const d = drafts.get(r.child_id!) ?? { result: null, copayLists: [] }
    const source = { faxFile: r.fax_file, receivedAt: r.received_at }
    if (r.form_type === 'result') {
      const candidate: FaxResultDraft = {
        ...source,
        officeNumber: r.office_number,
        officeName: r.office_name,
        result: r.result,
        managedCopayAmount: r.managed_copay_amount,
      }
      if (!d.result || (candidate.receivedAt ?? '') >= (d.result.receivedAt ?? '')) d.result = candidate
    } else {
      d.copayLists.push({
        ...source,
        officeNumber: r.office_number,
        officeName: r.office_name,
        totalCost: r.total_cost,
        copayAmount: r.copay_amount,
      })
    }
    drafts.set(r.child_id!, d)
  }
  return drafts
}
