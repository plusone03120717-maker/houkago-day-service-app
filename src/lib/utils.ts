import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, format = 'yyyy/MM/dd') {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return format
    .replace('yyyy', String(year))
    .replace('MM', month)
    .replace('dd', day)
}

export function formatTime(time: string) {
  // HH:MM:SS -> HH:MM
  return time ? time.slice(0, 5) : ''
}

export function getAge(birthDate: string): number {
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

/** 西暦を和暦に変換して返す（例: "2015-04-01" → "平成27年4月1日"） */
export function formatWareki(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)

  // Intl.DateTimeFormat の japanese カレンダーを使用
  const era = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', {
    era: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)

  return era
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}
