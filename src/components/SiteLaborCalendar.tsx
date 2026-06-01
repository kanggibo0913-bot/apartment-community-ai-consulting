import { useEffect, useMemo, useState } from 'react'
import Card from './Card'
import Button from './Button'
import './SiteLaborCalendar.css'

// 월간 근무시간 달력 (현장 운영 - 현장 인건비 산출 보조 섹션).
// ⚠️ 입찰용 산출표/EstimateCalculator와 별개 기능.
// ⚠️ 기존 SiteLaborCostPage의 직원별 입력/계산 로직은 손대지 않는다.
// ⚠️ 본 계산은 내부 검토용 참고 계산 — 실제 급여 확정 전 근로계약/근로기준법 기준 검토 필요.

const STORAGE_KEY = 'siteLaborCalendarInputs'

// 기본 입력값 (사양 §2 예시값). 사용자 변경 즉시 localStorage에 반영된다.
const DEFAULT_BASE = {
  employeeName: '',
  hourlyWage: 10320,
  defaultBreakHours: 1,
  monthlySalary: 1993820,
  lessonAllowance: 350000,
  weeklyHolidayApplied: true,
  nightApplied: false,
}

interface DayEntry {
  start: string // HH:mm
  end: string // HH:mm
  breakHours: number
  nightHours: number // 야간 가산 적용 시간(시간 단위)
  isHoliday: boolean // 수동 공휴일 체크
  memo: string
}

interface CalendarBase {
  employeeName: string
  hourlyWage: number
  defaultBreakHours: number
  monthlySalary: number
  lessonAllowance: number
  weeklyHolidayApplied: boolean
  nightApplied: boolean
  selectedMonth: string // YYYY-MM
}

interface CalendarStorage {
  base: CalendarBase
  monthDays: Record<string, Record<string, DayEntry>> // YYYY-MM → dateKey(YYYY-MM-DD) → DayEntry
}

// 로컬 타임존 기준 YYYY-MM (UTC 변환에 따른 월 밀림 방지).
const todayMonth = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`
}

const emptyDay = (): DayEntry => ({
  start: '',
  end: '',
  breakHours: 0,
  nightHours: 0,
  isHoliday: false,
  memo: '',
})

const loadStorage = (): CalendarStorage => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
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

const fmtWon = (n: number): string => Math.round(Number.isFinite(n) ? n : 0).toLocaleString('ko-KR')
const fmtHours = (n: number): string => (Number.isFinite(n) ? n : 0).toFixed(1)

// "HH:mm" → 분. 잘못된 입력이면 null.
const toMin = (s: string): number | null => {
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

// 일자별 근로시간 (시간 단위, 소수 허용).
// 퇴근 < 출근이면 익일 퇴근으로 간주 (예: 22:00 ~ 02:00 → 4시간 + 휴게 차감).
const dayWorkHours = (d: DayEntry): number => {
  const s = toMin(d.start)
  const e = toMin(d.end)
  if (s == null || e == null) return 0
  let diff = e - s
  if (diff < 0) diff += 24 * 60
  diff -= (d.breakHours || 0) * 60
  if (diff <= 0) return 0
  return diff / 60
}

// 월별 주차 구성 — 일요일 시작, 토요일 종료. 다른 월에 걸친 cell은 inMonth=false로 표시.
const buildWeeks = (
  yearMonth: string,
): { date: Date; inMonth: boolean; dateKey: string }[][] => {
  const [y, m] = yearMonth.split('-').map(Number)
  if (!y || !m) return []
  const firstDay = new Date(y, m - 1, 1)
  const startDay = new Date(firstDay)
  startDay.setDate(firstDay.getDate() - firstDay.getDay()) // 그 주의 일요일로
  const lastDay = new Date(y, m, 0) // 해당 월 마지막 날
  const weeks: { date: Date; inMonth: boolean; dateKey: string }[][] = []
  const cursor = new Date(startDay)
  // 마지막 주의 토요일까지 채운다.
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

const SiteLaborCalendar: React.FC = () => {
  const initial = loadStorage()
  const [base, setBase] = useState<CalendarBase>(initial.base)
  const [monthDays, setMonthDays] = useState<
    Record<string, Record<string, DayEntry>>
  >(initial.monthDays)
  // 평일 일괄 입력용 임시 상태 (저장 대상 아님 — 매 세션 기본값).
  const [bulkStart, setBulkStart] = useState('06:00')
  const [bulkEnd, setBulkEnd] = useState('14:00')
  const [bulkBreak, setBulkBreak] = useState(1)
  const [msg, setMsg] = useState('')

  // localStorage 자동 저장.
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ base, monthDays }))
  }, [base, monthDays])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2500)
  }

  const currentDays = monthDays[base.selectedMonth] || {}
  const weeks = useMemo(() => buildWeeks(base.selectedMonth), [base.selectedMonth])

  // 일자별 입력 수정.
  const updateDay = (key: string, patch: Partial<DayEntry>) => {
    setMonthDays((prev) => {
      const month = base.selectedMonth
      const cur = (prev[month] || {})[key] || emptyDay()
      return {
        ...prev,
        [month]: { ...(prev[month] || {}), [key]: { ...cur, ...patch } },
      }
    })
  }

  // 주차별 계산 (사양 §6).
  const weeklyComp = useMemo(
    () =>
      weeks.map((week) => {
        let totalHours = 0
        let nightHours = 0
        week.forEach((cell) => {
          if (!cell.inMonth) return
          const day = currentDays[cell.dateKey]
          if (!day) return
          totalHours += dayWorkHours(day)
          if (base.nightApplied) nightHours += day.nightHours || 0
        })
        // 주휴수당 MVP 기준:
        //  - 주 근로시간 ≥ 15 + 주휴 적용 시에만 발생
        //  - 주휴시간 = min(8, 주 근로시간 / 40 * 8)
        //  - 주휴수당 = 주휴시간 × 시급
        const eligibleHoliday = base.weeklyHolidayApplied && totalHours >= 15
        const holidayHours = eligibleHoliday ? Math.min(8, (totalHours / 40) * 8) : 0
        const holidayPay = holidayHours * base.hourlyWage
        // 야간수당: 야간 적용 시 야간시간 × 시급 × 0.5 (가산).
        const nightPay = base.nightApplied ? nightHours * base.hourlyWage * 0.5 : 0
        const weekPay = totalHours * base.hourlyWage + holidayPay + nightPay
        return {
          totalHours,
          eligibleHoliday,
          holidayHours,
          holidayPay,
          nightHours,
          nightPay,
          weekPay,
        }
      }),
    [weeks, currentDays, base],
  )

  // 월간 합계 (사양 §7).
  const monthly = useMemo(() => {
    const totalHours = weeklyComp.reduce((s, w) => s + w.totalHours, 0)
    const totalHolidayHours = weeklyComp.reduce((s, w) => s + w.holidayHours, 0)
    const totalHolidayPay = weeklyComp.reduce((s, w) => s + w.holidayPay, 0)
    const totalNightPay = weeklyComp.reduce((s, w) => s + w.nightPay, 0)
    const basePay = totalHours * base.hourlyWage
    const expectedTotal = basePay + totalHolidayPay + totalNightPay + base.lessonAllowance
    // 월급여 기준 총액 — 월급여 + 레슨수당 + 주휴수당 + 야간수당.
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
  }, [weeklyComp, base])

  // 평일 일괄 입력 (월~금).
  const bulkFillWeekdays = () => {
    if (!toMin(bulkStart) || !toMin(bulkEnd)) {
      flash('출근/퇴근 시간을 HH:mm 형식으로 입력해주세요.')
      return
    }
    const newMonth = { ...currentDays }
    weeks.flat().forEach((cell) => {
      if (!cell.inMonth) return
      const dow = cell.date.getDay()
      if (dow >= 1 && dow <= 5) {
        // 월~금
        const prev = newMonth[cell.dateKey] || emptyDay()
        newMonth[cell.dateKey] = {
          ...prev,
          start: bulkStart,
          end: bulkEnd,
          breakHours: bulkBreak,
        }
      }
    })
    setMonthDays((prev) => ({ ...prev, [base.selectedMonth]: newMonth }))
    flash('평일 일괄 입력이 적용되었습니다.')
  }

  const resetMonth = () => {
    if (!window.confirm(`${base.selectedMonth} 근무표를 초기화하시겠습니까?`)) return
    setMonthDays((prev) => {
      const copy = { ...prev }
      delete copy[base.selectedMonth]
      return copy
    })
    flash('현재 월 근무표가 초기화되었습니다.')
  }

  const setBaseField = <K extends keyof CalendarBase>(key: K, value: CalendarBase[K]) =>
    setBase((prev) => ({ ...prev, [key]: value }))

  const numVal = (v: string) => {
    if (v.trim() === '') return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  // 요일 이름 (헤더용).
  const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <Card title="월간 근무시간 달력 (참고 계산)" className="labor-calendar-card">
      <p className="labor-calendar-note">
        직원별 출근/퇴근 시간을 일자별로 입력하면 주별 근로시간·주휴수당·월 인건비를 자동으로 산출합니다.
        <strong> 본 계산은 내부 검토용 참고 계산입니다.</strong> 실제 급여 확정 전 근로계약 조건과 근로기준법 기준을 확인하세요.
      </p>

      {/* 1. 기본 입력 영역 (사양 §2) */}
      <div className="labor-base-grid">
        <label>
          직원명
          <input
            type="text"
            value={base.employeeName}
            onChange={(e) => setBaseField('employeeName', e.target.value)}
            placeholder="예: 홍길동"
          />
        </label>
        <label>
          기준 월
          <input
            type="month"
            value={base.selectedMonth}
            onChange={(e) => setBaseField('selectedMonth', e.target.value || todayMonth())}
          />
        </label>
        <label>
          시급 (원)
          <input
            type="number"
            min="0"
            step="1"
            value={base.hourlyWage}
            onChange={(e) => setBaseField('hourlyWage', numVal(e.target.value))}
          />
        </label>
        <label>
          기본 휴게시간 (h)
          <input
            type="number"
            min="0"
            step="0.5"
            value={base.defaultBreakHours}
            onChange={(e) => setBaseField('defaultBreakHours', numVal(e.target.value))}
          />
        </label>
        <label>
          월급여 (원)
          <input
            type="number"
            min="0"
            step="1"
            value={base.monthlySalary}
            onChange={(e) => setBaseField('monthlySalary', numVal(e.target.value))}
          />
        </label>
        <label>
          레슨수당 (원)
          <input
            type="number"
            min="0"
            step="1"
            value={base.lessonAllowance}
            onChange={(e) => setBaseField('lessonAllowance', numVal(e.target.value))}
          />
        </label>
        <label className="labor-base-flag">
          <input
            type="checkbox"
            checked={base.weeklyHolidayApplied}
            onChange={(e) => setBaseField('weeklyHolidayApplied', e.target.checked)}
          />
          주휴수당 적용
        </label>
        <label className="labor-base-flag">
          <input
            type="checkbox"
            checked={base.nightApplied}
            onChange={(e) => setBaseField('nightApplied', e.target.checked)}
          />
          야간수당 적용
        </label>
      </div>

      {/* 2. 빠른 입력 (사양 §8) */}
      <div className="labor-month-toolbar">
        <div className="labor-bulk-row">
          <span className="labor-bulk-label">평일 일괄 입력</span>
          <label>
            출근
            <input
              type="time"
              value={bulkStart}
              onChange={(e) => setBulkStart(e.target.value)}
              className="labor-time-input"
            />
          </label>
          <label>
            퇴근
            <input
              type="time"
              value={bulkEnd}
              onChange={(e) => setBulkEnd(e.target.value)}
              className="labor-time-input"
            />
          </label>
          <label>
            휴게(h)
            <input
              type="number"
              step="0.5"
              min="0"
              value={bulkBreak}
              onChange={(e) => setBulkBreak(numVal(e.target.value))}
              className="labor-num-input"
            />
          </label>
          <Button variant="secondary" onClick={bulkFillWeekdays}>월~금 일괄 입력</Button>
          <Button variant="danger" onClick={resetMonth}>현재 월 초기화</Button>
        </div>
        {msg && <span className="labor-flash">{msg}</span>}
      </div>

      {/* 3. 주차별 달력형 근무표 (사양 §3, §4) */}
      <div className="site-labor-calendar">
        {weeks.length === 0 ? (
          <p className="labor-empty">기준 월을 선택해주세요.</p>
        ) : (
          weeks.map((week, wi) => {
            const w = weeklyComp[wi]
            return (
              <section key={wi} className="labor-week-table">
                <header className="labor-week-header">
                  <h4>{wi + 1}주차</h4>
                  <span className="labor-week-range">
                    {week[0].date.getMonth() + 1}월 {week[0].date.getDate()}일 ~{' '}
                    {week[6].date.getMonth() + 1}월 {week[6].date.getDate()}일
                  </span>
                </header>
                <table className="labor-week-grid">
                  <thead>
                    <tr>
                      {week.map((cell) => {
                        const dow = cell.date.getDay()
                        const day = currentDays[cell.dateKey]
                        const isHol = !!day?.isHoliday
                        const cls =
                          'labor-day-header' +
                          (dow === 0 ? ' labor-day-header--sunday' : '') +
                          (dow === 6 ? ' labor-day-header--saturday' : '') +
                          (isHol ? ' labor-day-header--holiday' : '') +
                          (!cell.inMonth ? ' labor-day-header--outside' : '')
                        return (
                          <th key={cell.dateKey} className={cls}>
                            <div className="labor-day-date">
                              {(cell.date.getMonth() + 1).toString().padStart(2, '0')}월{' '}
                              {cell.date.getDate().toString().padStart(2, '0')}일
                            </div>
                            <div className="labor-day-dow">{DOW_LABELS[dow]}</div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {week.map((cell) => {
                        const day = currentDays[cell.dateKey] || emptyDay()
                        const hours = dayWorkHours(day)
                        const cellCls =
                          'labor-day-cell' +
                          (!cell.inMonth ? ' labor-day-cell--outside' : '') +
                          (day.isHoliday ? ' labor-day-cell--holiday' : '')
                        return (
                          <td key={cell.dateKey} className={cellCls}>
                            {!cell.inMonth ? (
                              <span className="labor-day-empty">·</span>
                            ) : (
                              <>
                                <div className="labor-day-field">
                                  <span>출근</span>
                                  <input
                                    type="time"
                                    className="labor-time-input"
                                    value={day.start}
                                    onChange={(e) => updateDay(cell.dateKey, { start: e.target.value })}
                                  />
                                </div>
                                <div className="labor-day-field">
                                  <span>퇴근</span>
                                  <input
                                    type="time"
                                    className="labor-time-input"
                                    value={day.end}
                                    onChange={(e) => updateDay(cell.dateKey, { end: e.target.value })}
                                  />
                                </div>
                                <div className="labor-day-field">
                                  <span>휴게</span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    className="labor-num-input"
                                    value={day.breakHours}
                                    onChange={(e) =>
                                      updateDay(cell.dateKey, { breakHours: numVal(e.target.value) })
                                    }
                                  />
                                </div>
                                {base.nightApplied && (
                                  <div className="labor-day-field">
                                    <span>야간</span>
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      className="labor-num-input"
                                      value={day.nightHours}
                                      onChange={(e) =>
                                        updateDay(cell.dateKey, { nightHours: numVal(e.target.value) })
                                      }
                                    />
                                  </div>
                                )}
                                <div className="labor-day-result">근로 {fmtHours(hours)}</div>
                                <label className="labor-day-holiday">
                                  <input
                                    type="checkbox"
                                    checked={day.isHoliday}
                                    onChange={(e) =>
                                      updateDay(cell.dateKey, { isHoliday: e.target.checked })
                                    }
                                  />
                                  공휴일
                                </label>
                              </>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
                {/* 주차 요약 */}
                <div className="labor-week-summary">
                  <span>주 근로 {fmtHours(w.totalHours)}시간</span>
                  <span>
                    주휴 {w.eligibleHoliday ? `${fmtHours(w.holidayHours)}시간` : '미적용'}
                  </span>
                  <span>주휴수당 {fmtWon(w.holidayPay)}원</span>
                  {base.nightApplied && (
                    <>
                      <span>야간 {fmtHours(w.nightHours)}시간</span>
                      <span>야간수당 {fmtWon(w.nightPay)}원</span>
                    </>
                  )}
                  <span className="labor-week-pay">주급 {fmtWon(w.weekPay)}원</span>
                </div>
              </section>
            )
          })
        )}
      </div>

      {/* 4. 월간 합계 카드 (사양 §7) */}
      <div className="labor-month-summary">
        <h4>월간 합계</h4>
        <div className="labor-month-grid">
          <div><span>총 근로시간</span><strong>{fmtHours(monthly.totalHours)}시간</strong></div>
          <div><span>총 주휴시간</span><strong>{fmtHours(monthly.totalHolidayHours)}시간</strong></div>
          <div><span>총 주휴수당</span><strong>{fmtWon(monthly.totalHolidayPay)}원</strong></div>
          <div><span>총 야간수당</span><strong>{fmtWon(monthly.totalNightPay)}원</strong></div>
          <div><span>기본급(시급×시간)</span><strong>{fmtWon(monthly.basePay)}원</strong></div>
          <div><span>레슨수당</span><strong>{fmtWon(base.lessonAllowance)}원</strong></div>
          <div className="labor-month-grand">
            <span>예상 총지급액 (시급 기준)</span>
            <strong>{fmtWon(monthly.expectedTotal)}원</strong>
          </div>
          {base.monthlySalary > 0 && (
            <div className="labor-month-grand labor-month-grand--salary">
              <span>월급여 기준 총액</span>
              <strong>{fmtWon(monthly.salaryBasedTotal)}원</strong>
            </div>
          )}
        </div>
        <p className="labor-month-disclaimer">
          본 계산은 내부 검토용 참고 계산입니다. 실제 급여 확정 전 근로계약 조건과 근로기준법 기준(연장·야간·휴일 가산, 주휴수당 산정 방식 등)을 확인하세요.
        </p>
      </div>
    </Card>
  )
}

export default SiteLaborCalendar
