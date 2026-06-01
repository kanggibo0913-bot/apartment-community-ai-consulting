/**
 * siteLaborSnapshots.ts — 현장 인건비 산출 공용 타입·계산 유틸
 *
 * SiteLaborCostPage(작성 화면)와 MonthlyReport(저장본 연동) 사이의 결합도를 낮추기 위해
 * "데이터 타입 + 계산 함수 + 저장본 합계 헬퍼"를 한 파일로 분리했다.
 *
 * 이동 원칙:
 * - 페이지 간 공유가 필요한 타입/계산 로직만 이동(기존 동작·결과 동일).
 * - 페이지 고유 상태(기본값 시드, UI 핸들러 등)는 페이지에 그대로 둔다.
 * - localStorage key·저장본 데이터 구조는 변경하지 않는다.
 */

// ─── 타입 ─────────────────────────────────────────────────────────────────────
export type JobRole = '센터장' | '트레이너' | '골프프로' | '안내데스크' | '미화' | '기타'
export type PayType = '시급' | '월급'

export const ROLES: JobRole[] = ['센터장', '트레이너', '골프프로', '안내데스크', '미화', '기타']

export interface WorkDays {
  mon: boolean
  tue: boolean
  wed: boolean
  thu: boolean
  fri: boolean
  sat: boolean
  sun: boolean
}

export const DAYS: Array<{ key: keyof WorkDays; label: string }> = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
]

export interface Employee {
  id: string
  name: string
  role: JobRole
  payType: PayType
  hourlyWage: number
  monthlySalary: number
  workDays: WorkDays
  startTime: string
  endTime: string
  breakHours: number
  weeklyHolidayApplied: boolean
  nightCalc: boolean
  overtimeCalc: boolean
  memo: string
}

export interface CalcSettings {
  baseMonth: string
  weeksPerMonth: number
  minWage: number
  overtimeMultiplier: number
  nightMultiplier: number
  holidayMultiplier: number
  insuranceRate: number // 4대보험 회사부담률 (%)
  severanceRate: number // 퇴직충당률 (%)
  annualLeaveRate: number // 연차충당률 (%)
  otherIndirectRate: number // 기타 간접비율 (%)
}

export interface SiteLaborCostData {
  settings: CalcSettings
  employees: Employee[]
}

export interface EmpResult {
  workDayCount: number
  dailyWorkHours: number
  weeklyHours: number
  monthlyHours: number
  basePay: number
  holidayPay: number
  overtimePay: number
  nightPay: number
  directPay: number
  insurance: number
  severance: number
  annualLeave: number
  otherIndirect: number
  indirectTotal: number
  total: number
}

export interface LaborCostSnapshot {
  id: string
  title: string
  apartmentName: string
  baseMonth: string
  savedAt: string
  updatedAt?: string
  data: SiteLaborCostData
  // 월간 근무시간 달력 스냅샷(옵셔널, 하위호환).
  // 저장 시점의 siteLaborCalendarInputs 데이터와 주차/월간 합계를 함께 보존해
  // 저장본/PDF/CSV 출력에 같이 포함된다. 과거 저장본에는 이 필드가 없을 수 있다.
  // 타입은 src/utils/siteLaborCalendarUtils.ts의 CalendarSnapshotPart와 구조적으로 동일.
  calendar?: import('./siteLaborCalendarUtils').CalendarSnapshotPart
}

// ─── 시간 파싱 유틸 ──────────────────────────────────────────────────────────
// "HH:MM" → 분 단위. 형식이 잘못되면 null.
export const parseTime = (t: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

// 하루 내 [t0,t1) 구간 중 야간(00:00~06:00, 22:00~24:00) 분
export const nightMinutesInDay = (t0: number, t1: number): number => {
  const ov = (a: number, b: number, lo: number, hi: number) => Math.max(0, Math.min(b, hi) - Math.max(a, lo))
  return ov(t0, t1, 0, 360) + ov(t0, t1, 1320, 1440)
}

// 절대 분 구간 [s,e)의 야간 근로 분 (익일까지 걸쳐도 일자별로 누적)
export const nightOverlapMinutes = (s: number, e: number): number => {
  let total = 0
  let cur = s
  while (cur < e) {
    const dayStart = Math.floor(cur / 1440) * 1440
    const dayEnd = dayStart + 1440
    const segEnd = Math.min(e, dayEnd)
    total += nightMinutesInDay(cur - dayStart, segEnd - dayStart)
    cur = segEnd
  }
  return total
}

// 직원 1명 월간 산출(기존 동작/결과 동일 — 파일만 이동).
export const computeEmployee = (emp: Employee, st: CalcSettings): EmpResult => {
  const weeks = st.weeksPerMonth > 0 ? st.weeksPerMonth : 0
  const s = parseTime(emp.startTime)
  const e0 = parseTime(emp.endTime)
  let stayMin = 0
  let nightMin = 0
  if (s !== null && e0 !== null) {
    let e = e0
    if (e <= s) e += 1440 // 익일 퇴근 처리
    stayMin = e - s
    nightMin = nightOverlapMinutes(s, e)
  }
  const breakMin = Math.max(0, (emp.breakHours || 0) * 60)
  const dailyWorkHours = Math.max(0, (stayMin - breakMin) / 60)
  const dailyNightHours = nightMin / 60
  const workDayCount = DAYS.filter((d) => emp.workDays[d.key]).length
  const weeklyHours = dailyWorkHours * workDayCount
  const monthlyHours = weeklyHours * weeks

  // 가산수당용 시급: 시급제는 입력 시급, 월급제는 통상시급(월급/월근로시간)으로 환산
  const hourlyBase =
    emp.payType === '시급' ? emp.hourlyWage : monthlyHours > 0 ? emp.monthlySalary / monthlyHours : 0

  const basePay = emp.payType === '시급' ? emp.hourlyWage * monthlyHours : emp.monthlySalary

  // 주휴수당(참고 계산값): 시급제 + 주휴 적용 + 주 15시간 이상
  let holidayPay = 0
  if (emp.weeklyHolidayApplied && emp.payType === '시급' && weeklyHours >= 15) {
    const weeklyHolidayHours = Math.min(dailyWorkHours, 8) * weeks
    holidayPay = emp.hourlyWage * weeklyHolidayHours
  }

  // 연장수당: 주 40시간 초과분
  let overtimePay = 0
  if (emp.overtimeCalc && weeklyHours > 40) {
    const overtimeHours = (weeklyHours - 40) * weeks
    overtimePay = hourlyBase * overtimeHours * st.overtimeMultiplier
  }

  // 야간수당: 22:00~06:00 근로분
  let nightPay = 0
  if (emp.nightCalc) {
    const monthlyNightHours = dailyNightHours * workDayCount * weeks
    nightPay = hourlyBase * monthlyNightHours * st.nightMultiplier
  }

  const directPay = basePay + holidayPay + overtimePay + nightPay
  const insurance = directPay * (st.insuranceRate / 100)
  const severance = directPay * (st.severanceRate / 100)
  const annualLeave = directPay * (st.annualLeaveRate / 100)
  const otherIndirect = directPay * (st.otherIndirectRate / 100)
  const indirectTotal = insurance + severance + annualLeave + otherIndirect
  const total = directPay + indirectTotal

  return {
    workDayCount,
    dailyWorkHours,
    weeklyHours,
    monthlyHours,
    basePay,
    holidayPay,
    overtimePay,
    nightPay,
    directPay,
    insurance,
    severance,
    annualLeave,
    otherIndirect,
    indirectTotal,
    total,
  }
}

// 저장본 요약치(목록 표시·정렬·월간 리포트 미리보기·요약 본문 공용).
// 방어적으로 누락 필드(undefined / 빈 배열) 처리.
export const snapshotEmpCount = (data: SiteLaborCostData): number => data?.employees?.length ?? 0
export const snapshotMonthlyTotal = (data: SiteLaborCostData): number =>
  (data?.employees ?? []).reduce((sum, emp) => sum + computeEmployee(emp, data.settings).total, 0)
