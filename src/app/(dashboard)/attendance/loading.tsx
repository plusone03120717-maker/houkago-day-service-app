export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* 日付ナビ */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
        <div className="h-8 w-20 bg-gray-200 rounded-lg" />
        <div className="h-5 w-28 bg-gray-200 rounded" />
        <div className="h-8 w-20 bg-gray-200 rounded-lg" />
      </div>

      {/* ユニットタブ */}
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-9 w-24 bg-gray-200 rounded-lg" />
        ))}
      </div>

      {/* 出席ボード */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="h-5 bg-gray-200 rounded w-40" />
          <div className="h-4 bg-gray-100 rounded w-20" />
        </div>
        <div className="divide-y divide-gray-100">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-20" />
                <div className="h-3 bg-gray-100 rounded w-14" />
              </div>
              <div className="h-8 w-20 bg-gray-100 rounded-lg" />
              <div className="h-8 w-8 bg-gray-100 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
