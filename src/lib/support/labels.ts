/**
 * 問い合わせの区分・状態の表示名。
 * 画面（クライアント側）とAPI（サーバー側）の両方から読むので、
 * Node固有のモジュールに依存しないファイルに分けている。
 */

export type InquiryCategory = 'bug' | 'input_mistake' | 'how_to' | 'request' | 'other'
export type InquirySeverity = 'high' | 'medium' | 'low'
export type InquiryStatus = 'bot_only' | 'open' | 'in_progress' | 'resolved' | 'dismissed'

export const CATEGORY_LABELS: Record<InquiryCategory, string> = {
  bug: '不具合',
  input_mistake: '入力ミス・データ修正',
  how_to: '使い方',
  request: '要望',
  other: 'その他',
}

export const SEVERITY_LABELS: Record<InquirySeverity, { label: string; className: string }> = {
  high: { label: '至急', className: 'bg-red-100 text-red-700 border-red-200' },
  medium: { label: '通常', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  low: { label: '低', className: 'bg-gray-100 text-gray-700 border-gray-200' },
}

export const STATUS_LABELS: Record<InquiryStatus, { label: string; className: string }> = {
  bot_only: { label: 'ボット対応のみ', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  open: { label: '未対応', className: 'bg-red-100 text-red-700 border-red-200' },
  in_progress: { label: '対応中', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  resolved: { label: '対応済み', className: 'bg-green-100 text-green-700 border-green-200' },
  dismissed: { label: '対応不要', className: 'bg-gray-100 text-gray-600 border-gray-200' },
}
