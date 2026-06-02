// 세전 급여 요약 + 급여명세서 초안 — 현장 인건비 산출 보조 섹션.
// ⚠️ 이 화면은 "급여명세서 초안" / "세전 급여 검토표"이며, 공식 급여명세서/확정 공제액
//    계산이 아니다. 자동 4대보험/소득세 계산을 하지 않는다. 사용자가 세무사가 확정한
//    공제액을 직접 입력하는 방식.
//
// 데이터 흐름:
//   - 입력 보존(localStorage): siteLaborPayrollDraft → { extras, deductions, payDate, note }
//   - 계산 입력값(메모리): 월간 근무시간 달력 스냅샷 (CalendarSnapshotPart) — 캘린더 기반 monthSummary
//   - 출력: PayrollDraft (현재 화면 표시 / 저장본 / PDF / CSV에서 공용 사용)

import {
  buildCalendarSnapshot,
  loadCalendarStorageByProject,
  type CalendarSnapshotPart,
} from './siteLaborCalendarUtils'
import { loadProjectScoped } from './projectScopedStorage'

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

// ─── 월급제 예외 조정 (실비 적용) ────────────────────────────────────────────
// 월급제 직원은 매월 달력으로 전체 산출하기보다 "기본 월급 + 결근/무급 조정 + 추가수당"으로
// 실제 지급액을 정한다. 시급제(calendar) 모드에서는 일별 입력에 이미 결근이 반영되므로
// 이 조정은 calc 모드일 때만 의미가 있다(UI에서도 calc 적용 시에만 노출).
//
// 결근 공제 계산 방식 — 사용자가 선택:
//   - 'calendarDays': 공제액 = 월급 × (결근일수 + 무급휴가일수) ÷ 당월일수(28~31)
//   - 'workDays'    : 공제액 = 월급 × (결근일수 + 무급휴가일수) ÷ 소정근무일수(사용자 입력)
//   - 'manual'      : 공제액 = manualDeduction (직접 입력값 그대로)
// 최종 세전급여 = 기본 월급 - 공제액 - 기타공제 + 추가수당
//
// ⚠️ 이 입력은 PayrollPersistedState에 옵셔널로 추가되며, 기존 저장본은 이 필드 없이도 그대로 동작.
export type AbsenceDeductionMode = 'calendarDays' | 'workDays' | 'manual'

export interface PayrollMonthlyAdjustment {
  enabled: boolean // 체크 시 calc draft의 최종 세전급여를 finalGross로 대체
  baseMonthlySalary: number // 기본 월급(입력 비어 있으면 calcSnapshot.basePay fallback)
  absenceDays: number
  unpaidLeaveDays: number
  additionalAllowance: number
  otherDeduction: number
  reason: string
  deductionMode: AbsenceDeductionMode
  workDaysOverride: number // workDays 모드 분모(소정근무일수)
  manualDeduction: number // manual 모드 직접 입력 공제액
}

export const emptyMonthlyAdjustment = (): PayrollMonthlyAdjustment => ({
  enabled: false,
  baseMonthlySalary: 0,
  absenceDays: 0,
  unpaidLeaveDays: 0,
  additionalAllowance: 0,
  otherDeduction: 0,
  reason: '',
  deductionMode: 'calendarDays',
  workDaysOverride: 0,
  manualDeduction: 0,
})

// localStorage에 보존되는 입력값 (사용자가 직접 채우는 부분).
// nonTaxableItems / monthlyAdjustment는 옵셔널 — 과거 저장된 데이터에는 이 필드가 없을 수 있다(하위호환).
export interface PayrollPersistedState {
  extras: PayrollExtra[]
  nonTaxableItems?: PayrollNonTaxableItem[]
  deductions: PayrollDeductions
  payDate: string // YYYY-MM-DD (예상 임금지급일)
  note: string
  // 월급제 예외 조정(실비 적용). 옵셔널 — 미존재 시 emptyMonthlyAdjustment 적용.
  monthlyAdjustment?: PayrollMonthlyAdjustment
}

export const emptyPayrollState = (): PayrollPersistedState => ({
  extras: [],
  nonTaxableItems: [],
  deductions: emptyDeductions(),
  payDate: '',
  note: '',
  monthlyAdjustment: emptyMonthlyAdjustment(),
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
      monthlyAdjustment: { ...emptyMonthlyAdjustment(), ...(parsed.monthlyAdjustment || {}) },
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
  // ─── 월급제 실비 적용 결과(옵셔널) ─────────────────────────────────────────
  // calc 모드 + adjustment.enabled=true 일 때만 채워진다. 세전급여요약 영역에
  // "적용 기준 / 기본 금액 / 공제 금액 / 추가 금액 / 최종 세전급여 / 조정 사유" 표시용.
  // adjustment가 적용된 경우 gross.grossTotal과 netPay 는 finalGross를 반영한다.
  adjustment?: {
    enabled: boolean
    basis: AbsenceDeductionMode
    monthDays?: number // calendarDays 모드의 분모(당월일수)
    workDaysOverride?: number // workDays 모드의 분모(소정근무일수)
    baseAmount: number // 기본 금액 (월급)
    absenceDays: number
    unpaidLeaveDays: number
    deductionAmount: number // 결근/무급 공제액
    otherDeduction: number // 기타공제
    additionAmount: number // 추가수당
    finalGross: number // 최종 세전급여 = base - deduction - otherDeduction + addition
    reason: string
  }
}

export const sumExtras = (extras: PayrollExtra[]): number =>
  extras.reduce((s, e) => s + (Number.isFinite(e.amount) ? e.amount : 0), 0)

export const sumNonTaxable = (items: PayrollNonTaxableItem[] | undefined): number =>
  (items || []).reduce((s, e) => s + (Number.isFinite(e.amount) ? e.amount : 0), 0)

export const sumDeductions = (d: PayrollDeductions): number =>
  d.pension + d.health + d.longTermCare + d.employment + d.incomeTax + d.localIncomeTax + d.etc

// ─── 급여요약 적용 기준(소스) ─────────────────────────────────────────────
// 사용자가 "직원별 계산결과" 또는 "월별 달력 월간합계" 중 하나를 선택해 [적용]하면
// 그 시점의 값으로 세전 급여 요약/급여 초안이 갱신된다.
//   - 'calendar': 캘린더 monthSummary + base.lessonAllowance 기반 (시급제 권장)
//   - 'calc'    : SiteLaborCostPage 직원별 계산결과 합계 스냅샷 기반 (월급제 권장)
// calc 적용 시에는 적용 시점의 합계 스냅샷을 함께 보존해, 이후 캘린더 입력값이
// 바뀌어도 calc 기준의 세전 급여 요약은 변하지 않는다(= 적용된 값이 유지된다).
export type PayrollSource = 'calendar' | 'calc'

// 직원별 계산결과 합계 스냅샷(SiteLaborCostPage.totals의 부분집합).
// 적용 시점 그대로 보존 → 캘린더 입력/직원 변경에 영향받지 않음.
// dominantPayType은 권장 기본값 추정용 메타: 시급 우세면 calendar, 월급 우세면 calc 권장.
export interface CalcResultSnapshot {
  monthlyHours: number
  basePay: number
  holidayPay: number
  overtimePay: number
  nightPay: number
  directPay: number
  indirectTotal: number
  total: number
  employeeCount: number
  baseMonth?: string // 기준 월 표시용
  dominantPayType?: '시급' | '월급' | 'mixed'
}

export interface AppliedPayrollSource {
  source: PayrollSource
  appliedAt: string // ISO. 비어 있으면 미적용 상태(기본 표시는 calendar fallback).
  // calc 적용 시점의 합계 스냅샷(소스가 'calc'일 때만 의미 있음).
  calcSnapshot?: CalcResultSnapshot
}

export const emptyAppliedPayrollSource = (): AppliedPayrollSource => ({
  source: 'calendar',
  appliedAt: '',
})

// ─── 단지별 storage 키 (Panel/Page 공용) ───────────────────────────────────────
// SitePayrollPanel과 SiteLaborCostPage(CSV/인쇄/저장본 저장 로직)가 같은 키를 보도록
// 한 곳에서 export. 새 키 추가 아님 — 기존 SitePayrollPanel.tsx 내부 상수를 utils로 승격.
export const PAYROLL_BY_PROJECT_KEY = 'siteLaborPayrollDraftByProject'
export const PAYROLL_SOURCE_BY_PROJECT_KEY = 'siteLaborPayrollSourcePrefByProject'

// calc 합계 스냅샷 기반 PayrollDraft 생성.
// - 직원별 계산결과 합계를 세전 항목(basePay/holidayPay/nightPay)에 매핑한다.
// - 직원별 계산결과는 시급제 알바의 "달력에서 제외한 레슨수당" 같은 개별 조정값을 가지지 않으므로
//   lessonAllowance는 항상 0으로 둔다(달력 기준이 살아나서 다시 합산되는 회귀를 차단).
// - 사용자가 명시적으로 입력한 기타수당(extras)·비과세는 그대로 반영해 표시.
// ⚠️ 이 함수는 calcSnapshot이 null이면 source='none' 빈 draft를 반환한다.
export const buildPayrollDraftFromCalcSnapshot = (
  snap: CalcResultSnapshot | null | undefined,
  state: PayrollPersistedState,
  meta?: { employeeName?: string; month?: string },
): PayrollDraft => {
  // snap이 비어 있으면 calc 기준이지만 표시할 합계가 없는 상태로 빈 draft를 생성.
  // 이 경우 source='none'으로 표시해 패널이 "캘린더 데이터 없음"과 동일한 안내를 띄울 수 있게 한다.
  if (!snap) {
    const emptyExtras = sumExtras(state.extras)
    const emptyDed = sumDeductions(state.deductions)
    const emptyNonTax = sumNonTaxable(state.nonTaxableItems)
    const empty: PayrollDraft = {
      employeeName: '',
      month: '',
      payDate: state.payDate,
      workDays: 0,
      totalHours: 0,
      gross: { totalHours: 0, basePay: 0, holidayPay: 0, nightPay: 0, lessonAllowance: 0, extrasTotal: emptyExtras, grossTotal: emptyExtras },
      extras: state.extras,
      nonTaxableItems: state.nonTaxableItems || [],
      nonTaxableTotal: emptyNonTax,
      taxablePayReference: Math.max(0, emptyExtras - emptyNonTax),
      deductions: state.deductions,
      deductionsTotal: emptyDed,
      netPay: emptyExtras - emptyDed,
      note: state.note,
      source: 'none',
      capturedAt: new Date().toISOString(),
    }
    return empty
  }
  const employeeName = (meta?.employeeName || '').trim()
  const month = (meta?.month || snap.baseMonth || '').trim()
  const totalHours = snap.monthlyHours || 0
  const basePay = snap.basePay || 0
  const holidayPay = snap.holidayPay || 0
  const nightPay = snap.nightPay || 0
  const lessonAllowance = 0 // calc 기준에서는 레슨수당을 다시 가져오지 않는다(회귀 차단)
  const extrasTotal = sumExtras(state.extras)

  // ─── 월급제 실비 적용(monthlyAdjustment) ───────────────────────────────────
  // adjustment.enabled=true 일 때만 finalGross로 grossTotal을 대체.
  // - baseAmount: 입력된 baseMonthlySalary가 0보다 크면 그 값, 아니면 calc basePay를 fallback.
  // - 공제 분모: calendarDays 모드는 month(YYYY-MM)로 당월 일수, workDays 모드는 workDaysOverride.
  //   분모가 0이거나 음수면 안전하게 공제 0 처리(0 나누기 방지).
  // - manual 모드는 분모 무관, manualDeduction을 그대로 공제.
  // adjustment.enabled=false이면 기존 grossTotal/netPay 흐름 유지(하위호환).
  const adj = state.monthlyAdjustment
  let grossTotal = basePay + holidayPay + nightPay + lessonAllowance + extrasTotal
  let adjustmentMeta: PayrollDraft['adjustment'] | undefined
  if (adj?.enabled) {
    const baseAmount = adj.baseMonthlySalary > 0 ? adj.baseMonthlySalary : basePay
    const absent = (adj.absenceDays || 0) + (adj.unpaidLeaveDays || 0)
    let monthDays: number | undefined
    let denom = 0
    if (adj.deductionMode === 'calendarDays') {
      monthDays = computeMonthDays(month)
      denom = monthDays
    } else if (adj.deductionMode === 'workDays') {
      denom = adj.workDaysOverride || 0
    }
    let deductionAmount = 0
    if (adj.deductionMode === 'manual') {
      deductionAmount = Math.max(0, adj.manualDeduction || 0)
    } else if (denom > 0) {
      deductionAmount = Math.max(0, (baseAmount * absent) / denom)
    }
    const otherDeduction = Math.max(0, adj.otherDeduction || 0)
    const additionAmount = Math.max(0, adj.additionalAllowance || 0)
    const finalGross = baseAmount - deductionAmount - otherDeduction + additionAmount
    grossTotal = finalGross
    adjustmentMeta = {
      enabled: true,
      basis: adj.deductionMode,
      monthDays,
      workDaysOverride: adj.deductionMode === 'workDays' ? adj.workDaysOverride : undefined,
      baseAmount,
      absenceDays: adj.absenceDays || 0,
      unpaidLeaveDays: adj.unpaidLeaveDays || 0,
      deductionAmount,
      otherDeduction,
      additionAmount,
      finalGross,
      reason: adj.reason || '',
    }
  }
  const deductionsTotal = sumDeductions(state.deductions)
  const netPay = grossTotal - deductionsTotal
  const nonTaxableItems = state.nonTaxableItems || []
  const nonTaxableTotal = sumNonTaxable(nonTaxableItems)
  const taxablePayReference = Math.max(0, grossTotal - nonTaxableTotal)
  return {
    employeeName,
    month,
    payDate: state.payDate,
    workDays: 0, // calc 기준에는 실 출근 일수 개념이 없음(직원별 계산은 월합산값)
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
    source: 'calendar', // PayrollDraft.source 필드는 기존 union('calendar'|'none')만 허용 →
    // calc 기준 표시는 AppliedPayrollSource를 별도 추적하므로 PayrollDraft 내부 source는 calendar로 둔다.
    capturedAt: new Date().toISOString(),
    ...(adjustmentMeta ? { adjustment: adjustmentMeta } : {}),
  }
}

// month(YYYY-MM) → 해당 월의 일수(28~31). 잘못된 값이면 30 fallback.
// function 선언으로 hoisting → calc 빌더보다 뒤에 있어도 forward reference 가능.
export function computeMonthDays(month: string): number {
  const m = (month || '').match(/^(\d{4})-(\d{2})$/)
  if (!m) return 30
  const y = Number(m[1])
  const mo = Number(m[2])
  if (!y || !mo || mo < 1 || mo > 12) return 30
  return new Date(y, mo, 0).getDate()
}

// 캘린더 스냅샷 기반 PayrollDraft 생성. 캘린더가 없으면 빈 객체(source='none').
// ⚠️ netPay = grossTotal - deductionsTotal 그대로 — 비과세를 실지급액에서 빼지 않는다.
// 비과세 합계와 과세대상 급여 참고액은 표시용으로만 계산해 함께 반환.
//
// ⚠️ lessonAllowance는 반드시 **monthSummary.lessonAllowance**(=캘린더 월간 합계가 표시하는 값)을
//    사용한다. 직원별 계산결과(calc snapshot)의 레슨수당이나 다른 source의 값을 fallback으로
//    쓰지 않는다. 캘린더에서 레슨수당을 0으로 두었다면 세전 급여 요약도 0이어야 한다.
//    (구버전 저장본 호환: monthSummary.lessonAllowance가 undefined인 경우에 한해서만
//     cal.base.lessonAllowance를 사용 — 신규 버전에서는 항상 monthSummary.lessonAllowance가 채워진다.)
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
  // calendar source 적용 시 lessonAllowance는 monthSummary 값만 사용.
  // monthSummary.lessonAllowance가 명시적으로 존재하면 그 값(0 포함)을 그대로 사용.
  // 구버전 스냅샷(이 필드가 undefined)인 경우에만 cal.base.lessonAllowance fallback.
  const lessonAllowance =
    cal?.monthSummary.lessonAllowance !== undefined
      ? cal.monthSummary.lessonAllowance
      : cal?.base.lessonAllowance || 0
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

// ─── 단지별 storage 로더 (Panel/Page 공용) ───────────────────────────────────
// SitePayrollPanel에 있던 로컬 헬퍼를 utils로 승격. CSV/인쇄/저장본 저장 로직에서도
// 같은 함수를 호출해 화면과 일치한 draft를 생성할 수 있게 한다.
//
// loadProjectScoped 정책:
//   - byProject 슬롯에 해당 projectId 데이터가 있으면 그 값 반환
//   - 없으면 전역 key(legacy)에 1회 fallback (projectScopedLegacyMigration 정책)
//   - 둘 다 없으면 인자로 받은 fallback 사용 (여기선 null 또는 emptyXxx)
export const loadPayrollStateByProject = (projectId: string | undefined): PayrollPersistedState => {
  const raw = loadProjectScoped<Partial<PayrollPersistedState> | null>(
    PAYROLL_STORAGE_KEY,
    PAYROLL_BY_PROJECT_KEY,
    projectId,
    null,
  )
  if (!raw) return loadPayrollState()
  return {
    extras: Array.isArray(raw.extras) ? raw.extras : [],
    nonTaxableItems: Array.isArray(raw.nonTaxableItems) ? raw.nonTaxableItems : [],
    deductions: { ...emptyPayrollState().deductions, ...(raw.deductions || {}) },
    payDate: raw.payDate || '',
    note: raw.note || '',
    monthlyAdjustment: { ...emptyMonthlyAdjustment(), ...(raw.monthlyAdjustment || {}) },
  }
}

export const loadAppliedPayrollSourceByProject = (
  projectId: string | undefined,
): AppliedPayrollSource => {
  // 적용 기준에는 legacy 전역 key가 없으므로 byProject만 읽는다(loadProjectScoped 호출은
  // 첫 번째 인자에 글로벌 key를 주지만, 전역 데이터가 없으면 fallback으로 미적용 상태 반환).
  const raw = loadProjectScoped<Partial<AppliedPayrollSource> | null>(
    'siteLaborPayrollSourcePref',
    PAYROLL_SOURCE_BY_PROJECT_KEY,
    projectId,
    null,
  )
  if (!raw) return emptyAppliedPayrollSource()
  const source: PayrollSource = raw.source === 'calc' ? 'calc' : 'calendar'
  return {
    source,
    appliedAt: typeof raw.appliedAt === 'string' ? raw.appliedAt : '',
    ...(raw.calcSnapshot ? { calcSnapshot: raw.calcSnapshot } : {}),
  }
}

// ─── 적용 기준 기반 통합 draft 빌더 ───────────────────────────────────────────
// 화면(SitePayrollPanel)과 CSV/인쇄/저장본(SiteLaborCostPage)이 모두 이 함수를 호출하면
// 동일한 적용 기준 + 동일한 캘린더 byProject 데이터 + 동일한 payroll state를 사용하므로
// 표시값과 출력값이 어긋날 수 없다.
//
// 입력:
//   - projectId: 현재 단지 (없으면 'default')
//   - liveState (옵션): 미저장 변경분이 있는 경우 화면이 자기 state를 그대로 전달.
//                       전달하지 않으면 storage에서 다시 읽음(CSV/인쇄 시 사용 패턴).
//   - liveApplied (옵션): 동일 — 화면이 자기 applied state를 전달.
//                         미전달 시 storage 기준.
//   - liveCalSnapshot (옵션): 화면이 useMemo로 들고 있는 snapshot. 미전달 시 byProject에서 재빌드.
export interface AppliedDraftBundle {
  draft: PayrollDraft
  applied: AppliedPayrollSource
  calSnapshot: CalendarSnapshotPart | null
  state: PayrollPersistedState
}

export const buildAppliedPayrollDraft = (
  projectId: string | undefined,
  overrides?: {
    state?: PayrollPersistedState
    applied?: AppliedPayrollSource
    calSnapshot?: CalendarSnapshotPart | null
  },
): AppliedDraftBundle => {
  const state = overrides?.state ?? loadPayrollStateByProject(projectId)
  const applied = overrides?.applied ?? loadAppliedPayrollSourceByProject(projectId)
  const calSnapshot =
    overrides?.calSnapshot !== undefined
      ? overrides.calSnapshot
      : buildCalendarSnapshot(loadCalendarStorageByProject(projectId))

  let draft: PayrollDraft
  if (applied.source === 'calc') {
    draft = buildPayrollDraftFromCalcSnapshot(applied.calcSnapshot ?? null, state, {
      employeeName: calSnapshot?.base.employeeName,
      month: applied.calcSnapshot?.baseMonth || calSnapshot?.month,
    })
  } else {
    draft = buildPayrollDraftFromCalendar(calSnapshot, state)
  }
  return { draft, applied, calSnapshot, state }
}

// 적용 기준 한글 라벨 (CSV/인쇄에서 공용 사용).
export const PAYROLL_SOURCE_LABELS: Record<PayrollSource, string> = {
  calendar: '월별 달력 월간합계',
  calc: '직원별 계산결과',
}

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
