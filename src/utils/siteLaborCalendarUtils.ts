// 월간 근무시간 달력 공용 유틸 (현장 인건비 산출 보조 섹션).
// SiteLaborCalendar 컴포넌트와 SiteLaborCostPage(저장본/PDF/CSV)가 같은 계산 결과를 보장하도록
// 모든 일자/주차/월간 계산을 이 모듈에 모았다.
//
// ⚠️ 계산 식·기본값·localStorage key 명은 기존 SiteLaborCalendar.tsx의 값과 정확히 동일해야 한다.
//    (회귀 방지 — 직전 commits에서 검증된 결과와 숫자가 달라지면 안 됨)

export const CALENDAR_STORAGE_KEY = 'siteLaborCalendarInputs'

export interface CalendarDayEntry {
  start: string // HH:mm
  end: string // HH:mm
  breakHours: number
  nightHours: number // 야간 가산 적용 시간(시간 단위)
  isHoliday: boolean // 수동 공휴일 체크
  isOff?: boolean // 휴무(연차/휴무) — 옵셔널(하위호환)
  memo: string
}

export interface CalendarBase {
  employeeName: string
  hourlyWage: number
  defaultBreakHours: number
  monthlySalary: number
  lessonAllowance: number
  weeklyHolidayApplied: boolean
  nightApplied: boolean
  selectedMonth: string // YYYY-MM
}

export interface CalendarStorage {
  base: CalendarBase
  monthDays: Record<string, Record<string, CalendarDayEntry>>
}

export const DEFAULT_BASE: Omit<CalendarBase, 'selectedMonth'> = {
  employeeName: '',
  hourlyWage: 10320,
  defaultBreakHours: 1,
  monthlySalary: 1993820,
  lessonAllowance: 350000,
  weeklyHolidayApplied: true,
  nightApplied: false,
}

export const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

export const todayMonth = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`
}

export const emptyDay = (): CalendarDayEntry => ({
  start: '',
  end: '',
  breakHours: 0,
  nightHours: 0,
  isHoliday: false,
  isOff: false,
  memo: '',
})

// "HH:mm" → 분. 잘못된 입력이면 null.
export const toMin = (s: string): number | null => {
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

// 일자별 근로시간(시간, 소수 허용).
// 퇴근 < 출근 → 익일 퇴근으로 간주(+24h). isOff=true이면 항상 0. 음수/빈값/잘못된 시간은 0.
export const dayWorkHours = (d: CalendarDayEntry): number => {
  if (d.isOff) return 0
  const s = toMin(d.start)
  const e = toMin(d.end)
  if (s == null || e == null) return 0
  let diff = e - s
  if (diff < 0) diff += 24 * 60
  diff -= (d.breakHours || 0) * 60
  if (diff <= 0) return 0
  return diff / 60
}

// 월별 주차 구성 — 일요일 시작, 토요일 종료. 다른 월에 걸친 cell은 inMonth=false.
export const buildWeeksForMonth = (
  yearMonth: string,
): { date: Date; inMonth: boolean; dateKey: string }[][] => {
  const [y, m] = yearMonth.split('-').map(Number)
  if (!y || !m) return []
  const firstDay = new Date(y, m - 1, 1)
  const startDay = new Date(firstDay)
  startDay.setDate(firstDay.getDate() - firstDay.getDay())
  const lastDay = new Date(y, m, 0)
  const weeks: { date: Date; inMonth: boolean; dateKey: string }[][] = []
  const cursor = new Date(startDay)
  while (cursor <= lastDay || cursor.getDay() !== 0) {
    const week: { date: Date; inMonth: boolean; dateKey: string }[] = []
    for (let i = 0; i < 7; i++) {
      const dd = new Date(cursor)
      const inMonth = dd.getMonth() === m - 1
      const key = `${dd.getFullYear()}-${(dd.getMonth() + 1)
        .toString()
        .padStart(2, '0')}-${dd.getDate().toString().padStart(2, '0')}`
      week.push({ date: dd, inMonth, dateKey: key })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
    if (cursor > lastDay && cursor.getDay() === 0) break
  }
  return weeks
}

export interface WeekSummary {
  totalHours: number
  eligibleHoliday: boolean
  holidayHours: number
  holidayPay: number
  nightHours: number
  nightPay: number
  weekPay: number
}

// 주차별 계산 (MVP 기준):
//  - 주 ≥ 15h + weeklyHolidayApplied 일 때 주휴 발생
//  - 주휴시간 = min(8, 주h / 40 × 8)
//  - 주휴수당 = 주휴시간 × 시급
//  - 야간수당 = 야간 적용시 야간시간 × 시급 × 0.5
//  - 주급 = 주 근로 × 시급 + 주휴수당 + 야간수당
export const calculateWeekSummary = (
  week: { date: Date; inMonth: boolean; dateKey: string }[],
  days: Record<string, CalendarDayEntry>,
  base: CalendarBase,
): WeekSummary => {
  let totalHours = 0
  let nightHours = 0
  week.forEach((cell) => {
    if (!cell.inMonth) return
    const day = days[cell.dateKey]
    if (!day) return
    totalHours += dayWorkHours(day)
    if (base.nightApplied) nightHours += day.nightHours || 0
  })
  const eligibleHoliday = base.weeklyHolidayApplied && totalHours >= 15
  const holidayHours = eligibleHoliday ? Math.min(8, (totalHours / 40) * 8) : 0
  const holidayPay = holidayHours * base.hourlyWage
  const nightPay = base.nightApplied ? nightHours * base.hourlyWage * 0.5 : 0
  const weekPay = totalHours * base.hourlyWage + holidayPay + nightPay
  return { totalHours, eligibleHoliday, holidayHours, holidayPay, nightHours, nightPay, weekPay }
}

export interface MonthSummary {
  totalHours: number
  totalHolidayHours: number
  totalHolidayPay: number
  totalNightPay: number
  basePay: number
  expectedTotal: number
  salaryBasedTotal: number
}

export const calculateMonthSummary = (
  weeklyComp: WeekSummary[],
  base: CalendarBase,
): MonthSummary => {
  const totalHours = weeklyComp.reduce((s, w) => s + w.totalHours, 0)
  const totalHolidayHours = weeklyComp.reduce((s, w) => s + w.holidayHours, 0)
  const totalHolidayPay = weeklyComp.reduce((s, w) => s + w.holidayPay, 0)
  const totalNightPay = weeklyComp.reduce((s, w) => s + w.nightPay, 0)
  const basePay = totalHours * base.hourlyWage
  const expectedTotal = basePay + totalHolidayPay + totalNightPay + base.lessonAllowance
  const salaryBasedTotal =
    base.monthlySalary + base.lessonAllowance + totalHolidayPay + totalNightPay
  return {
    totalHours,
    totalHolidayHours,
    totalHolidayPay,
    totalNightPay,
    basePay,
    expectedTotal,
    salaryBasedTotal,
  }
}

export const loadCalendarStorage = (): CalendarStorage => {
  try {
    const raw = window.localStorage.getItem(CALENDAR_STORAGE_KEY)
    if (!raw) {
      return {
        base: { ...DEFAULT_BASE, selectedMonth: todayMonth() },
        monthDays: {},
      }
    }
    const parsed = JSON.parse(raw) as Partial<CalendarStorage>
    return {
      base: { ...DEFAULT_BASE, selectedMonth: todayMonth(), ...(parsed.base || {}) },
      monthDays: parsed.monthDays || {},
    }
  } catch {
    return { base: { ...DEFAULT_BASE, selectedMonth: todayMonth() }, monthDays: {} }
  }
}

// ─── 저장본/PDF/CSV 출력에 함께 포함될 정규화된 캘린더 데이터 ─────────────────
// LaborCostSnapshot.calendar (옵셔널)에 저장된다. 과거 저장본은 이 필드가 없어도 정상 동작.
export interface CalendarSnapshotPart {
  month: string
  base: CalendarBase
  // 일자별 입력 (선택 월만, 빈 일자는 키 생략).
  days: Record<string, CalendarDayEntry>
  monthSummary: MonthSummary
  weeksSummary: {
    weekIndex: number
    range: { start: string; end: string } // YYYY-MM-DD ~ YYYY-MM-DD
    summary: WeekSummary
  }[]
  // 출력 시점 스냅샷이라는 메타.
  capturedAt: string // ISO
}

// 현재 localStorage 값으로 캘린더 스냅샷을 생성. 선택 월이 없으면 null.
export const buildCalendarSnapshot = (
  storage: CalendarStorage = loadCalendarStorage(),
): CalendarSnapshotPart | null => {
  const month = storage.base.selectedMonth
  if (!month) return null
  const days = storage.monthDays[month] || {}
  const weeks = buildWeeksForMonth(month)
  if (weeks.length === 0) return null
  const weeklyComp = weeks.map((w) => calculateWeekSummary(w, days, storage.base))
  const monthSummary = calculateMonthSummary(weeklyComp, storage.base)
  const weeksSummary = weeks.map((w, i) => ({
    weekIndex: i + 1,
    range: { start: w[0].dateKey, end: w[6].dateKey },
    summary: weeklyComp[i],
  }))
  return {
    month,
    base: storage.base,
    days,
    monthSummary,
    weeksSummary,
    capturedAt: new Date().toISOString(),
  }
}

// 출력 포맷 헬퍼 (PDF/CSV/UI에서 동일하게 사용).
export const fmtWon = (n: number): string =>
  Math.round(Number.isFinite(n) ? n : 0).toLocaleString('ko-KR')

export const fmtHours = (n: number): string => (Number.isFinite(n) ? n : 0).toFixed(1)
