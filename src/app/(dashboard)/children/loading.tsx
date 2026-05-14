export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="h-7 bg-gray-200 rounded-lg w-24" />
        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
      </div>

      {/* タブ */}
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-9 w-24 bg-gray-200 rounded-lg" />
        ))}
      </div>

      {/* 児童カード一覧 */}
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 bg-gray-200 rounded w-24" />
                  <div className="h-5 bg-gray-100 rounded w-16" />
                </div>
                <div className="h-3 bg-gray-100 rounded w-32" />
              </div>
              <div className="h-4 bg-gray-100 rounded w-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
