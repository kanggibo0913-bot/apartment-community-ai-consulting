// 근태/급여 계산 — 주 근로시간·주휴시간·주휴수당 회귀 테스트.
//
// 기준 (2026-06 수정):
//   - 일 근로 = 출근~퇴근 체류 분 - 휴게 분(정수 반올림) → 정수 분
//   - 주 근로 = 일 근로 분 합계 / 60 (소수 hour 중간 누적 금지)
//   - 주휴시간 = min(주 소정근로시간, 40h) / 40 × 8 — 최대 8h, 주 15h 미만이면 0
//   - 반올림은 표시 단계(fmtHours)에서만 적용
//
// 검증 시나리오 (2026년 최저시급 10,320원):
//   1) 14:00~21:10, 휴게 10분, 월~금 5일 → 일 7.0h / 주 35.0h / 주휴 7.0h
//      / 주휴수당 72,240원 / 주급 433,440원
//   2) 주 40시간 초과 → 주휴시간 최대 8h
//   3) 주 15시간 미만 → 주휴 0h

import { describe, expect, it } from 'vitest'
import {
  CalendarBase,
  CalendarDayEntry,
  calculateWeekSummary,
  dayWorkHours,
  dayWorkMinutes,
  fmtHours,
} from '../siteLaborCalendarUtils'
import { CalcSettings, Employee, computeEmployee } from '../siteLaborSnapshots'

const WAGE_2026 = 10320

// ─── 캘린더(월간 근무시간 달력) 테스트 헬퍼 ──────────────────────────────────

const baseFor = (overrides?: Partial<CalendarBase>): CalendarBase => ({
  employeeName: '테스트',
  hourlyWage: WAGE_2026,
  defaultBreakHours: 0,
  monthlySalary: 0,
  lessonAllowance: 0,
  weeklyHolidayApplied: true,
  nightApplied: false,
  selectedMonth: '2026-06',
  ...overrides,
})

const entry = (start: string, end: string, breakHours: number): CalendarDayEntry => ({
  start,
  end,
  breakHours,
  nightHours: 0,
  isHoliday: false,
  isOff: false,
  memo: '',
})

// 2026-06-01(월)~06-07(일) 한 주. days에 키가 있는 날만 근무로 계산된다.
const week2026Jun = () =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2026, 5, 1 + i)
    return {
      date: d,
      inMonth: true,
      dateKey: `2026-06-${String(1 + i).padStart(2, '0')}`,
    }
  })

const weekdaysOnly = (dayEntry: CalendarDayEntry): Record<string, CalendarDayEntry> => ({
  '2026-06-01': dayEntry, // 월
  '2026-06-02': dayEntry, // 화
  '2026-06-03': dayEntry, // 수
  '2026-06-04': dayEntry, // 목
  '2026-06-05': dayEntry, // 금
})

// ─── 직원별 계산(computeEmployee) 테스트 헬퍼 ────────────────────────────────

const settingsFor = (overrides?: Partial<CalcSettings>): CalcSettings => ({
  baseMonth: '2026-06',
  weeksPerMonth: 1, // 주 단위 값 검증을 위해 1로 고정
  minWage: WAGE_2026,
  overtimeMultiplier: 1.5,
  nightMultiplier: 0.5,
  holidayMultiplier: 1.5,
  insuranceRate: 0,
  severanceRate: 0,
  annualLeaveRate: 0,
  otherIndirectRate: 0,
  ...overrides,
})

const employeeFor = (overrides?: Partial<Employee>): Employee => ({
  id: 'emp-test',
  name: '테스트',
  role: '기타',
  payType: '시급',
  hourlyWage: WAGE_2026,
  monthlySalary: 0,
  workDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  startTime: '14:00',
  endTime: '21:10',
  breakHours: 10 / 60,
  weeklyHolidayApplied: true,
  nightCalc: false,
  overtimeCalc: false,
  memo: '',
  ...overrides,
})

// ─── 1) 14:00~21:10 · 휴게 10분 · 주 5일 ─────────────────────────────────────

describe('주 5일 × 일 7시간 (14:00~21:10, 휴게 10분)', () => {
  const day = entry('14:00', '21:10', 10 / 60)

  it('일 근로는 정수 분 420분 = 정확히 7.0시간', () => {
    expect(dayWorkMinutes(day)).toBe(420)
    expect(dayWorkHours(day)).toBe(7)
  })

  it('휴게를 0.17h로 입력해도(10.2분) 반올림되어 일 7.0시간', () => {
    const approx = entry('14:00', '21:10', 0.17)
    expect(dayWorkMinutes(approx)).toBe(420)
    expect(dayWorkHours(approx)).toBe(7)
  })

  it('캘린더 주간: 주 근로 35.0h / 주휴 7.0h / 주휴수당 72,240원 / 주급 433,440원', () => {
    const sum = calculateWeekSummary(week2026Jun(), weekdaysOnly(day), baseFor())
    expect(sum.totalHours).toBe(35) // 35.2 회귀 방지 — 정확히 35
    expect(sum.eligibleHoliday).toBe(true)
    expect(sum.holidayHours).toBe(7)
    expect(sum.holidayPay).toBe(7 * WAGE_2026) // 72,240
    expect(sum.holidayPay).toBe(72240)
    expect(sum.weekPay).toBe(35 * WAGE_2026 + 72240) // 433,440
    expect(sum.weekPay).toBe(433440)
  })

  it('직원별 계산: 주 근로 35.0h / 주휴수당 72,240원 / 직접인건비 433,440원 (weeks=1)', () => {
    const r = computeEmployee(employeeFor(), settingsFor())
    expect(r.dailyWorkHours).toBe(7)
    expect(r.weeklyHours).toBe(35)
    expect(r.holidayPay).toBe(72240)
    expect(r.basePay).toBe(35 * WAGE_2026) // 361,200
    expect(r.directPay).toBe(433440)
  })

  it('반올림은 표시 단계에서만 — fmtHours(35) === "35.0"', () => {
    expect(fmtHours(35)).toBe('35.0')
  })
})

// ─── 2) 주 40시간 초과 → 주휴시간 최대 8h ────────────────────────────────────

describe('주 40시간 초과 시 주휴시간 상한 8h', () => {
  it('캘린더: 6일 × 8h = 48h → 주휴 8.0h', () => {
    const day = entry('09:00', '18:00', 1) // 8h/일
    const days: Record<string, CalendarDayEntry> = {
      ...weekdaysOnly(day),
      '2026-06-06': day, // 토
    }
    const sum = calculateWeekSummary(week2026Jun(), days, baseFor())
    expect(sum.totalHours).toBe(48)
    expect(sum.holidayHours).toBe(8)
    expect(sum.holidayPay).toBe(8 * WAGE_2026)
  })

  it('직원별 계산: 6일 × 8h = 48h → 주휴수당 = 8h × 시급', () => {
    const r = computeEmployee(
      employeeFor({
        startTime: '09:00',
        endTime: '18:00',
        breakHours: 1,
        workDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: false },
      }),
      settingsFor(),
    )
    expect(r.weeklyHours).toBe(48)
    expect(r.holidayPay).toBe(8 * WAGE_2026)
  })
})

// ─── 3) 주 15시간 미만 → 주휴 0h ─────────────────────────────────────────────

describe('주 15시간 미만이면 주휴 0', () => {
  it('캘린더: 2일 × 7h = 14h → 주휴 0h / 주휴수당 0원', () => {
    const day = entry('14:00', '21:10', 10 / 60)
    const days: Record<string, CalendarDayEntry> = {
      '2026-06-01': day,
      '2026-06-02': day,
    }
    const sum = calculateWeekSummary(week2026Jun(), days, baseFor())
    expect(sum.totalHours).toBe(14)
    expect(sum.eligibleHoliday).toBe(false)
    expect(sum.holidayHours).toBe(0)
    expect(sum.holidayPay).toBe(0)
  })

  it('직원별 계산: 2일 × 7h = 14h → 주휴수당 0원', () => {
    const r = computeEmployee(
      employeeFor({
        workDays: { mon: true, tue: true, wed: false, thu: false, fri: false, sat: false, sun: false },
      }),
      settingsFor(),
    )
    expect(r.weeklyHours).toBe(14)
    expect(r.holidayPay).toBe(0)
  })
})
