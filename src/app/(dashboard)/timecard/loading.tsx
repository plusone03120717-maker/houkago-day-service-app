export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* タイトル */}
      <div className="space-y-2">
        <div className="h-7 bg-gray-200 rounded-lg w-40" />
        <div className="h-3 bg-gray-100 rounded w-64" />
      </div>

      {/* 操作バー */}
      <div className="flex items-center gap-3">
        <div className="h-10 bg-gray-200 rounded-lg w-48" />
        <div className="h-10 bg-gray-200 rounded-lg w-36" />
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-200 rounded w-32" />
        </div>
        <div className="divide-y divide-gray-100">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="h-4 bg-gray-200 rounded w-20" />
              <div className="h-4 bg-gray-100 rounded w-16" />
              <div className="h-4 bg-gray-100 rounded w-16" />
              <div className="h-4 bg-gray-100 rounded flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
