export default function Loading() {
  return (
    <div className="space-y-5 max-w-3xl animate-pulse">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 bg-gray-200 rounded-lg" />
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gray-200 rounded-full" />
          <div className="space-y-2">
            <div className="h-6 bg-gray-200 rounded w-32" />
            <div className="h-3 bg-gray-100 rounded w-20" />
          </div>
        </div>
      </div>

      {/* フォームカード */}
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="h-5 bg-gray-200 rounded w-28" />
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="h-10 bg-gray-100 rounded-lg" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
            <div className="h-24 bg-gray-100 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}
