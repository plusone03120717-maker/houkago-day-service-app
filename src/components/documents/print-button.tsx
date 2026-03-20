'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()} className="flex items-center gap-1.5">
      <Printer className="h-4 w-4" />
      印刷
    </Button>
  )
}
