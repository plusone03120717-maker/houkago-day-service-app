export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* 統計カード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 bg-gray-200 rounded w-16" />
              <div className="w-8 h-8 bg-gray-100 rounded-lg" />
            </div>
            <div className="h-7 bg-gray-200 rounded w-12" />
            <div className="h-3 bg-gray-100 rounded w-20" />
          </div>
        ))}
      </div>

      {/* メインカード 2列 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(2)].map((_, col) => (
          <div key={col} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="h-5 bg-gray-200 rounded w-28" />
              <div className="h-4 bg-gray-100 rounded w-16" />
            </div>
            <div className="divide-y divide-gray-100">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-gray-200 rounded w-24" />
                    <div className="h-3 bg-gray-100 rounded w-16" />
                  </div>
                  <div className="h-5 bg-gray-100 rounded w-12" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 下部カード */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-200 rounded w-36" />
        </div>
        <div className="divide-y divide-gray-100">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
              <div className="h-5 bg-gray-100 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
