export default function Loading() {
  return (
    <div className="space-y-5 max-w-2xl animate-pulse">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gray-200 rounded-lg" />
        <div className="space-y-2">
          <div className="h-6 bg-gray-200 rounded w-40" />
          <div className="h-3 bg-gray-100 rounded w-24" />
        </div>
      </div>

      {/* 本文カード */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-200 rounded w-24" />
        </div>
        <div className="p-5 space-y-3">
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-11/12" />
          <div className="h-4 bg-gray-100 rounded w-4/5" />
          <div className="h-4 bg-gray-100 rounded w-2/3" />
        </div>
      </div>

      {/* コメントカード */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-200 rounded w-32" />
        </div>
        <div className="p-5">
          <div className="h-16 bg-gray-100 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
