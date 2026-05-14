export default function Loading() {
  return (
    <div className="space-y-5 max-w-3xl animate-pulse">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gray-200 rounded-lg" />
        <div className="space-y-1.5">
          <div className="h-6 bg-gray-200 rounded w-28" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
      </div>

      {/* モニタリングリンクカード */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-lg" />
          <div className="space-y-1.5">
            <div className="h-4 bg-gray-200 rounded w-28" />
            <div className="h-3 bg-gray-100 rounded w-36" />
          </div>
        </div>
      </div>

      {/* 特記事項カード */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="h-5 bg-gray-200 rounded w-24" />
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-4/5" />
      </div>

      {/* 新規作成フォーム */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-200 rounded w-28" />
        </div>
        <div className="p-5 space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-gray-200 rounded w-24" />
              <div className="h-20 bg-gray-100 rounded-lg" />
            </div>
          ))}
          <div className="h-10 bg-indigo-100 rounded-lg w-full" />
        </div>
      </div>
    </div>
  )
}
