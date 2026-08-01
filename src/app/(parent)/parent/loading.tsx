export default function Loading() {
  return (
    <div className="space-y-5 pb-20 sm:pb-5 animate-pulse">
      {/* 子供カード */}
      <div className="space-y-3">
        {[...Array(1)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex-shrink-0" />
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-24" />
              <div className="h-3 bg-gray-100 rounded w-16" />
            </div>
          </div>
        ))}
      </div>

      {/* クイックアクション */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-200 rounded-lg flex-shrink-0" />
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-16" />
              <div className="h-3 bg-gray-100 rounded w-20" />
            </div>
          </div>
        ))}
      </div>

      {/* リスト */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="px-4 py-3 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-100 rounded w-2/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
