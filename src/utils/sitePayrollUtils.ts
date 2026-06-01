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

// 비과세 항목 1건 — 세무사 확인용 참고 입력.
// ⚠️ 한도 자동 확정 X / 한도 초과분 자동 과세 처리 X / 실지급액에서 차감 X.
//    세전 총지급액에서 빼서 "과세대상 급여 참고액"을 보여주기만 한다.
export interface PayrollNonTaxableItem {
  id: string
  label: string // 항목명 (예: 식대 / 자가운전보조금 / 출산·보육수당 / 기타 비과세)
  amount: number
  limitNote?: string // 참고한도/비고 (자유 텍스트, 예: "월 20만원 한도")
  memo?: string
}

// 비과세 빠른 추가 프리셋 — 한도 표시는 사용자에게 참고 정보로만 노출.
// 실제 한도 정책은 매년 바뀌므로 코드에 금액을 하드코딩하지 않는다.
export const NON_TAXABLE_PRESETS: { label: string; limitNote: string }[] = [
  { label: '식대', limitNote: '세무사 확인 (월 한도 참고)' },
  { label: '자가운전보조금', limitNote: '세무사 확인 (월 한도 참고)' },
  { label: '출산·보육수당', limitNote: '세무사 확인 (월 한도 참고)' },
  { label: '기타 비과세', limitNote: '세무사 확인 필요' },
]

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
// nonTaxableItems는 옵셔널 — 과거 저장된 데이터에는 이 필드가 없을 수 있다(하위호환).
export interface PayrollPersistedState {
  extras: PayrollExtra[]
  nonTaxableItems?: PayrollNonTaxableItem[]
  deductions: PayrollDeductions
  payDate: string // YYYY-MM-DD (예상 임금지급일)
  note: string
}

export const emptyPayrollState = (): PayrollPersistedState => ({
  extras: [],
  nonTaxableItems: [],
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
      nonTaxableItems: Array.isArray(parsed.nonTaxableItems) ? parsed.nonTaxableItems : [],
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
// nonTaxableItems / nonTaxableTotal / taxablePayReference는 옵셔널/0 기본값 — 과거 저장본 하위호환.
// ⚠️ taxablePayReference(과세대상 급여 참고액)는 표시용 참고 값일 뿐 실지급액에서 차감되지 않는다.
export interface PayrollDraft {
  employeeName: string
  month: string // YYYY-MM (없을 수도 있음)
  payDate: string // YYYY-MM-DD
  workDays: number // 실 출근 일수(isOff=false + 출근/퇴근 입력 있음)
  totalHours: number
  gross: PayrollGross
  extras: PayrollExtra[]
  // 비과세 항목 (옵셔널 — 과거 저장본은 이 필드 없음).
  nonTaxableItems?: PayrollNonTaxableItem[]
  // 비과세 합계 (없으면 0).
  nonTaxableTotal?: number
  // 과세대상 급여 참고액 = max(0, grossTotal - nonTaxableTotal). 표시용 참고 값.
  taxablePayReference?: number
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

export const sumNonTaxable = (items: PayrollNonTaxableItem[] | undefined): number =>
  (items || []).reduce((s, e) => s + (Number.isFinite(e.amount) ? e.amount : 0), 0)

export const sumDeductions = (d: PayrollDeductions): number =>
  d.pension + d.health + d.longTermCare + d.employment + d.incomeTax + d.localIncomeTax + d.etc

// 캘린더 스냅샷 기반 PayrollDraft 생성. 캘린더가 없으면 빈 객체(source='none').
// ⚠️ netPay = grossTotal - deductionsTotal 그대로 — 비과세를 실지급액에서 빼지 않는다.
// 비과세 합계와 과세대상 급여 참고액은 표시용으로만 계산해 함께 반환.
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
  const netPay = grossTotal - deductionsTotal // ← 비과세 미차감
  // 비과세 (옵셔널 입력 → 합계).
  const nonTaxableItems = state.nonTaxableItems || []
  const nonTaxableTotal = sumNonTaxable(nonTaxableItems)
  const taxablePayReference = Math.max(0, grossTotal - nonTaxableTotal)
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
    nonTaxableItems,
    nonTaxableTotal,
    taxablePayReference,
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

// 새 비과세 항목 1건 생성 헬퍼. 프리셋(label/limitNote)을 받을 수도 있다.
export const newNonTaxableItem = (preset?: { label?: string; limitNote?: string }): PayrollNonTaxableItem => ({
  id: 'nt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
  label: preset?.label || '',
  amount: 0,
  limitNote: preset?.limitNote || '',
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
