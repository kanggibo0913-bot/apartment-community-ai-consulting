// 세전 급여 요약 + 급여명세서 초안 — 현장 인건비 산출 보조 섹션.
// ⚠️ 이 화면은 "급여명세서 초안" / "세전 급여 검토표"이며, 공식 급여명세서/확정 공제액
//    계산이 아니다. 자동 4대보험/소득세 계산을 하지 않는다. 사용자가 세무사가 확정한
//    공제액을 직접 입력하는 방식.
//
// 데이터 흐름:
//   - 입력 보존(localStorage): siteLaborPayrollDraft → { extras, deductions, payDate, note }
//   - 계산 입력값(메모리): 월간 근무시간 달력 스냅샷 (CalendarSnapshotPart) — 캘린더 기반 monthSummary
//   - 출력: PayrollDraft (현재 화면 표시 / 저장본 / PDF / CSV에서 공용 사용)

import type { CalendarSnapshotPart } from './siteLaborCalendarUtils'

export const PAYROLL_STORAGE_KEY = 'siteLaborPayrollDraft'

// 기타수당 1건 (식대/교통비 등). UI에서 추가/삭제 가능.
export interface PayrollExtra {
  id: string
  name: string
  amount: number
  memo: string
}

// 공제액 — 사용자 직접 입력(자동 계산 X).
export interface PayrollDeductions {
  pension: number // 국민연금
  health: number // 건강보험
  longTermCare: number // 장기요양보험
  employment: number // 고용보험
  incomeTax: number // 소득세
  localIncomeTax: number // 지방소득세
  etc: number // 기타공제
}

export const emptyDeductions = (): PayrollDeductions => ({
  pension: 0,
  health: 0,
  longTermCare: 0,
  employment: 0,
  incomeTax: 0,
  localIncomeTax: 0,
  etc: 0,
})

// localStorage에 보존되는 입력값 (사용자가 직접 채우는 부분).
export interface PayrollPersistedState {
  extras: PayrollExtra[]
  deductions: PayrollDeductions
  payDate: string // YYYY-MM-DD (예상 임금지급일)
  note: string
}

export const emptyPayrollState = (): PayrollPersistedState => ({
  extras: [],
  deductions: emptyDeductions(),
  payDate: '',
  note: '',
})

export const loadPayrollState = (): PayrollPersistedState => {
  try {
    const raw = window.localStorage.getItem(PAYROLL_STORAGE_KEY)
    if (!raw) return emptyPayrollState()
    const parsed = JSON.parse(raw) as Partial<PayrollPersistedState>
    return {
      extras: Array.isArray(parsed.extras) ? parsed.extras : [],
      deductions: { ...emptyDeductions(), ...(parsed.deductions || {}) },
      payDate: parsed.payDate || '',
      note: parsed.note || '',
    }
  } catch {
    return emptyPayrollState()
  }
}

export const savePayrollState = (s: PayrollPersistedState) => {
  window.localStorage.setItem(PAYROLL_STORAGE_KEY, JSON.stringify(s))
}

export interface PayrollGross {
  totalHours: number
  basePay: number
  holidayPay: number
  nightPay: number
  lessonAllowance: number
  extrasTotal: number
  grossTotal: number
}

// 출력용 정규화된 초안. 저장본/PDF/CSV에서 동일한 객체를 사용한다.
export interface PayrollDraft {
  employeeName: string
  month: string // YYYY-MM (없을 수도 있음)
  payDate: string // YYYY-MM-DD
  workDays: number // 실 출근 일수(isOff=false + 출근/퇴근 입력 있음)
  totalHours: number
  gross: PayrollGross
  extras: PayrollExtra[]
  deductions: PayrollDeductions
  deductionsTotal: number
  netPay: number
  note: string
  // 입력 출처: 'calendar' = 캘린더 monthSummary 기반 / 'none' = 캘린더 데이터 없음(empty 0)
  source: 'calendar' | 'none'
  capturedAt: string
}

export const sumExtras = (extras: PayrollExtra[]): number =>
  extras.reduce((s, e) => s + (Number.isFinite(e.amount) ? e.amount : 0), 0)

export const sumDeductions = (d: PayrollDeductions): number =>
  d.pension + d.health + d.longTermCare + d.employment + d.incomeTax + d.localIncomeTax + d.etc

// 캘린더 스냅샷 기반 PayrollDraft 생성. 캘린더가 없으면 빈 객체(source='none').
export const buildPayrollDraftFromCalendar = (
  cal: CalendarSnapshotPart | null,
  state: PayrollPersistedState,
): PayrollDraft => {
  const employeeName = cal?.base.employeeName || ''
  const month = cal?.month || ''
  const totalHours = cal?.monthSummary.totalHours || 0
  const basePay = cal?.monthSummary.basePay || 0
  const holidayPay = cal?.monthSummary.totalHolidayPay || 0
  const nightPay = cal?.monthSummary.totalNightPay || 0
  const lessonAllowance = cal?.base.lessonAllowance || 0
  const extrasTotal = sumExtras(state.extras)
  const grossTotal = basePay + holidayPay + nightPay + lessonAllowance + extrasTotal
  const deductionsTotal = sumDeductions(state.deductions)
  const netPay = grossTotal - deductionsTotal
  // 실 출근 일수: isOff=false + 출근/퇴근 시간 둘 다 입력된 날.
  const workDays = cal
    ? Object.values(cal.days).filter((d) => !d.isOff && !!d.start && !!d.end).length
    : 0
  return {
    employeeName,
    month,
    payDate: state.payDate,
    workDays,
    totalHours,
    gross: { totalHours, basePay, holidayPay, nightPay, lessonAllowance, extrasTotal, grossTotal },
    extras: state.extras,
    deductions: state.deductions,
    deductionsTotal,
    netPay,
    note: state.note,
    source: cal ? 'calendar' : 'none',
    capturedAt: new Date().toISOString(),
  }
}

// 새 기타수당 1건 생성 헬퍼.
export const newExtra = (): PayrollExtra => ({
  id: 'extra-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
  name: '',
  amount: 0,
  memo: '',
})

// 출력 라벨(PDF/CSV 공용).
export const DEDUCTION_LABELS: Record<keyof PayrollDeductions, string> = {
  pension: '국민연금',
  health: '건강보험',
  longTermCare: '장기요양보험',
  employment: '고용보험',
  incomeTax: '소득세',
  localIncomeTax: '지방소득세',
  etc: '기타공제',
}
