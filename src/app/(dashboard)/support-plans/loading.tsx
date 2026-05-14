export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* ヘッダー */}
      <div className="h-7 bg-gray-200 rounded-lg w-32" />

      {/* アラートカード */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-200 rounded w-36" />
        </div>
        <div className="divide-y divide-gray-100">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <div className="w-9 h-9 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-24" />
                <div className="h-3 bg-gray-100 rounded w-32" />
              </div>
              <div className="h-6 bg-orange-100 rounded w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* 児童一覧カード */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-200 rounded w-28" />
        </div>
        <div className="divide-y divide-gray-100">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <div className="w-9 h-9 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-20" />
                <div className="h-3 bg-gray-100 rounded w-28" />
              </div>
              <div className="h-6 bg-gray-100 rounded w-14" />
              <div className="h-4 bg-gray-100 rounded w-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
