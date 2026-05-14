export default function Loading() {
  return (
    <div className="space-y-5 max-w-3xl animate-pulse">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gray-200 rounded-lg" />
        <div className="space-y-1.5">
          <div className="h-6 bg-gray-200 rounded w-32" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
      </div>

      {/* 月ナビ */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
        <div className="h-8 w-20 bg-gray-200 rounded-lg" />
        <div className="space-y-1.5 text-center">
          <div className="h-5 bg-gray-200 rounded w-20 mx-auto" />
          <div className="h-3 bg-gray-100 rounded w-24 mx-auto" />
        </div>
        <div className="h-8 w-20 bg-gray-200 rounded-lg" />
      </div>

      {/* 学校休日カード */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="h-5 bg-gray-200 rounded w-24" />
        <div className="h-3 bg-gray-100 rounded w-48" />
      </div>

      {/* 出席記録一覧 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-200 rounded w-40" />
        </div>
        <div className="divide-y divide-gray-100">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-4">
              <div className="space-y-1.5">
                <div className="h-4 bg-gray-200 rounded w-28" />
                <div className="h-3 bg-gray-100 rounded w-16" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 bg-gray-100 rounded w-20" />
                <div className="h-7 bg-gray-200 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
