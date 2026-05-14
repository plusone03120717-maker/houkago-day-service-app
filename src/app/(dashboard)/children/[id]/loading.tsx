export default function Loading() {
  return (
    <div className="space-y-5 max-w-3xl animate-pulse">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 bg-gray-200 rounded-lg" />
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gray-200 rounded-full" />
          <div className="space-y-2">
            <div className="h-6 bg-gray-200 rounded w-32" />
            <div className="h-3 bg-gray-100 rounded w-20" />
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex-1 h-8 bg-gray-200 rounded-lg" />
        ))}
      </div>

      {/* 情報カード */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-200 rounded w-24" />
        </div>
        <div className="p-5 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 bg-gray-200 rounded w-20 flex-shrink-0" />
              <div className="h-4 bg-gray-100 rounded flex-1" />
            </div>
          ))}
        </div>
      </div>

      {/* メニューカード */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <div className="w-9 h-9 bg-gray-200 rounded-lg" />
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-3 bg-gray-100 rounded w-28" />
          </div>
        ))}
      </div>
    </div>
  )
}
