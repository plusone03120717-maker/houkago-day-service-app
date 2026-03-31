'use client'

import { Star } from 'lucide-react'

interface Props {
  value: number | null
  onChange?: (v: number) => void
  readOnly?: boolean
}

export function StarRating({ value, onChange, readOnly }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={readOnly ? 'cursor-default' : 'hover:scale-110 transition-transform'}
        >
          <Star
            className={`h-5 w-5 ${
              value != null && n <= value
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300'
            }`}
          />
        </button>
      ))}
      {value != null && !readOnly && (
        <button
          type="button"
          onClick={() => onChange?.(0)}
          className="ml-1 text-xs text-gray-400 hover:text-gray-600"
        >
          クリア
        </button>
      )}
    </div>
  )
}
