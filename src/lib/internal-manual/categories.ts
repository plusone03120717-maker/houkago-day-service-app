/**
 * 社内マニュアルの分類。
 * 画面（クライアント）とAPI（サーバー）の両方から読むので、
 * Node固有のモジュールに依存しないファイルに分けている。
 *
 * 分類を増やすときは、ここと migration の CHECK 制約の両方を直すこと。
 */

export const CATEGORIES = ['corporate', 'afterschool', 'development', 'other'] as const

export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_META: Record<
  Category,
  { label: string; description: string; className: string }
> = {
  corporate: {
    label: '法人全体',
    description: '就業規則・報連相・個人情報の扱いなど、事業所を問わず共通のこと',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  afterschool: {
    label: '放課後等デイサービス',
    description: '放デイの支援方針・一日の流れ・記録の書き方など',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  development: {
    label: '児童発達支援',
    description: '児発の支援方針・未就学児への関わり方など',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  other: {
    label: 'その他',
    description: '上のどれにも当てはまらないこと',
    className: 'bg-gray-50 text-gray-700 border-gray-200',
  },
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value)
}

export function categoryLabel(value: string): string {
  return isCategory(value) ? CATEGORY_META[value].label : value
}
