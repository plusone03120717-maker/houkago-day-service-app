// 日本の国民の祝日を動的に算出するユーティリティ（1980〜2099年対応）
// 振替休日・国民の休日を含む

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDay() // 0=日, 1=月, ..., 6=土
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// 第n月曜日の日付を返す
function getNthMonday(year: number, month: number, nth: number): string {
  const firstDay = new Date(year, month - 1, 1)
  const dow = firstDay.getDay()
  const firstMonday = dow === 1 ? 1 : 1 + (8 - dow) % 7
  return toDateStr(year, month, firstMonday + (nth - 1) * 7)
}

// 春分の日（国立天文台の略算式、1980〜2099年有効）
function calcVernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

// 秋分の日（国立天文台の略算式、1980〜2099年有効）
function calcAutumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

function computeJapaneseHolidaysForYear(year: number): Set<string> {
  // ── 基本の国民の祝日 ──────────────────────────────────────
  const base = new Set<string>([
    toDateStr(year, 1, 1),                                    // 元日
    getNthMonday(year, 1, 2),                                  // 成人の日（第2月曜）
    toDateStr(year, 2, 11),                                   // 建国記念の日
    toDateStr(year, 2, year >= 2020 ? 23 : 12),               // 天皇誕生日（2020〜: 2/23）
    toDateStr(year, 3, calcVernalEquinoxDay(year)),            // 春分の日
    toDateStr(year, 4, 29),                                   // 昭和の日
    toDateStr(year, 5, 3),                                    // 憲法記念日
    toDateStr(year, 5, 4),                                    // みどりの日
    toDateStr(year, 5, 5),                                    // こどもの日
    getNthMonday(year, 7, 3),                                  // 海の日（第3月曜）
    toDateStr(year, 8, 11),                                   // 山の日（2016〜）
    getNthMonday(year, 9, 3),                                  // 敬老の日（第3月曜）
    toDateStr(year, 9, calcAutumnalEquinoxDay(year)),          // 秋分の日
    getNthMonday(year, 10, 2),                                 // スポーツの日（第2月曜、2020〜）
    toDateStr(year, 11, 3),                                   // 文化の日
    toDateStr(year, 11, 23),                                  // 勤労感謝の日
  ])

  // ── 国民の休日: 前後が祝日の平日（日曜以外）────────────────
  // 変化がなくなるまで繰り返す（連鎖的な国民の休日に対応）
  const withKokumin = new Set(base)
  let changed = true
  while (changed) {
    changed = false
    for (const d of [...withKokumin].sort()) {
      const middle = addDays(d, 1)
      const after = addDays(d, 2)
      if (!withKokumin.has(middle) && getDayOfWeek(middle) !== 0 && withKokumin.has(after)) {
        withKokumin.add(middle)
        changed = true
      }
    }
  }

  // ── 振替休日: 日曜に当たる祝日の翌最初の平日（祝日・日曜でない日）──
  const result = new Set(withKokumin)
  const sundayHolidays = [...withKokumin].filter((d) => getDayOfWeek(d) === 0).sort()

  for (const sundayH of sundayHolidays) {
    let candidate = addDays(sundayH, 1)
    while (getDayOfWeek(candidate) === 0 || result.has(candidate)) {
      candidate = addDays(candidate, 1)
    }
    result.add(candidate)
  }

  return result
}

// 年ごとにキャッシュ（同一年のチェックは1回のみ計算）
const cache = new Map<number, Set<string>>()

export function isJapaneseNationalHoliday(dateStr: string): boolean {
  const year = parseInt(dateStr.slice(0, 4), 10)
  if (year < 1980 || year > 2099) return false
  if (!cache.has(year)) {
    cache.set(year, computeJapaneseHolidaysForYear(year))
  }
  return cache.get(year)!.has(dateStr)
}
