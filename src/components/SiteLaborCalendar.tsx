import { useEffect, useMemo, useState } from 'react'
import Card from './Card'
import Button from './Button'
import {
  CalendarBase,
  CalendarDayEntry as DayEntry,
  CALENDAR_STORAGE_KEY,
  DOW_LABELS,
  buildWeeksForMonth,
  calculateMonthSummary,
  calculateWeekSummary,
  dayWorkHours,
  emptyDay,
  fmtHours,
  fmtWon,
  loadCalendarStorage,
  toMin,
  todayMonth,
} from '../utils/siteLaborCalendarUtils'
import './SiteLaborCalendar.css'

// 월간 근무시간 달력 (현장 운영 - 현장 인건비 산출 보조 섹션).
// ⚠️ 입찰용 산출표/EstimateCalculator와 별개 기능.
// ⚠️ 기존 SiteLaborCostPage의 직원별 입력/계산 로직은 손대지 않는다.
// ⚠️ 본 계산은 내부 검토용 참고 계산 — 실제 급여 확정 전 근로계약/근로기준법 기준 검토 필요.
// ⚠️ 계산/저장 로직은 src/utils/siteLaborCalendarUtils.ts에 모여 있다(저장본/PDF/CSV와 공용).
const STORAGE_KEY = CALENDAR_STORAGE_KEY

// 부모 컴포넌트가 캘린더 데이터 변경(저장)을 감지해 다른 패널(SitePayrollPanel 등)을
// 즉시 갱신할 수 있도록 callback prop을 제공. localStorage 저장이 일어날 때마다 호출.
interface SiteLaborCalendarProps {
  onCalendarChange?: () => void
}

const SiteLaborCalendar: React.FC<SiteLaborCalendarProps> = ({ onCalendarChange }) => {
  const initial = loadCalendarStorage()
  const [base, setBase] = useState<CalendarBase>(initial.base)
  const [monthDays, setMonthDays] = useState<
    Record<string, Record<string, DayEntry>>
  >(initial.monthDays)
  // 평일 일괄 입력용 임시 상태 (저장 대상 아님 — 매 세션 기본값).
  const [bulkStart, setBulkStart] = useState('06:00')
  const [bulkEnd, setBulkEnd] = useState('14:00')
  const [bulkBreak, setBulkBreak] = useState(1)
  const [msg, setMsg] = useState('')

  // localStorage 자동 저장 + 부모에 변경 통지 (있을 때만).
  // 초기 마운트 시점에도 한 번 호출되지만, 부모가 idempotent nonce 증가만 하므로 안전.
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ base, monthDays }))
    if (onCalendarChange) onCalendarChange()
  }, [base, monthDays, onCalendarChange])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2500)
  }

  const currentDays = monthDays[base.selectedMonth] || {}
  const weeks = useMemo(() => buildWeeksForMonth(base.selectedMonth), [base.selectedMonth])

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

  // 일자별 입력 초기화 (휴지통). 해당 날짜의 출근/퇴근/휴게/야간/메모/공휴일 체크/휴무 체크 모두 비운다.
  // 다른 날짜·다른 월 데이터는 손대지 않는다. localStorage는 useEffect로 자동 동기화.
  const clearDay = (key: string) => {
    setMonthDays((prev) => {
      const month = base.selectedMonth
      const curMonth = prev[month] || {}
      if (!curMonth[key]) return prev // 이미 비어 있으면 변경 없음
      const { [key]: _removed, ...rest } = curMonth
      return { ...prev, [month]: rest }
    })
  }

  // 휴무(연차/휴무) 토글. 휴무로 체크하면 해당 날짜의 입력값은 비우고 isOff=true로 표시.
  // 다시 휴무를 해제하면 isOff=false로 두어 입력 가능 상태로 돌아온다(입력값은 빈 채 유지).
  const toggleOff = (key: string, on: boolean) => {
    setMonthDays((prev) => {
      const month = base.selectedMonth
      const cur = (prev[month] || {})[key] || emptyDay()
      const next: DayEntry = on
        ? { ...emptyDay(), isOff: true }
        : { ...cur, isOff: false }
      return {
        ...prev,
        [month]: { ...(prev[month] || {}), [key]: next },
      }
    })
  }

  // 주차별 계산 — utility(calculateWeekSummary)로 위임. 동일 식 사용.
  const weeklyComp = useMemo(
    () => weeks.map((week) => calculateWeekSummary(week, currentDays, base)),
    [weeks, currentDays, base],
  )

  // 월간 합계 — utility(calculateMonthSummary)로 위임. 동일 식 사용.
  const monthly = useMemo(() => calculateMonthSummary(weeklyComp, base), [weeklyComp, base])

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

  // 요일 이름은 utility에서 import.

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
                        const isOff = !!day.isOff
                        // 휴무가 우선 시각적으로 표시되지만 공휴일도 같이 체크된 경우 공휴일 색상을 유지(사양 §3).
                        const cellCls =
                          'labor-day-cell' +
                          (!cell.inMonth ? ' labor-day-cell--outside' : '') +
                          (day.isHoliday ? ' labor-day-cell--holiday' : '') +
                          (isOff && !day.isHoliday ? ' labor-day-cell--off' : '')
                        return (
                          <td key={cell.dateKey} className={cellCls}>
                            {!cell.inMonth ? (
                              <span className="labor-day-empty">·</span>
                            ) : (
                              <>
                                {/* 셀 우측 상단 휴지통 — 이 날짜만 초기화 (다른 날짜·다른 월 영향 없음) */}
                                <div className="labor-day-actions">
                                  <button
                                    type="button"
                                    className="labor-day-clear"
                                    onClick={() => clearDay(cell.dateKey)}
                                    title="이 날짜 입력 초기화"
                                    aria-label="이 날짜 입력 초기화"
                                  >
                                    🗑
                                  </button>
                                </div>
                                <div className="labor-day-field">
                                  <span>출근</span>
                                  <input
                                    type="time"
                                    className="labor-time-input"
                                    value={day.start}
                                    disabled={isOff}
                                    onChange={(e) => updateDay(cell.dateKey, { start: e.target.value })}
                                  />
                                </div>
                                <div className="labor-day-field">
                                  <span>퇴근</span>
                                  <input
                                    type="time"
                                    className="labor-time-input"
                                    value={day.end}
                                    disabled={isOff}
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
                                    disabled={isOff}
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
                                      disabled={isOff}
                                      onChange={(e) =>
                                        updateDay(cell.dateKey, { nightHours: numVal(e.target.value) })
                                      }
                                    />
                                  </div>
                                )}
                                <div className="labor-day-result">
                                  {isOff ? '휴무' : `근로 ${fmtHours(hours)}`}
                                </div>
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
                                <label className="labor-day-off">
                                  <input
                                    type="checkbox"
                                    checked={isOff}
                                    onChange={(e) => toggleOff(cell.dateKey, e.target.checked)}
                                  />
                                  휴무
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
