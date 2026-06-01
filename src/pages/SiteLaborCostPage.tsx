import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import Button from '../components/Button'
import SiteLaborCalendar from '../components/SiteLaborCalendar'
import SitePayrollPanel from '../components/SitePayrollPanel'
import {
  CalendarSnapshotPart,
  DOW_LABELS,
  buildCalendarSnapshot,
  dayWorkHours,
  fmtHours as fmtHoursCal,
  fmtWon as fmtWonCal,
  loadCalendarStorage,
} from '../utils/siteLaborCalendarUtils'
import {
  PayrollDraft,
  buildPayrollDraftFromCalendar,
  loadPayrollState,
} from '../utils/sitePayrollUtils'
import {
  CalcSettings,
  DAYS,
  Employee,
  JobRole,
  LaborCostSnapshot,
  PayType,
  ROLES,
  SiteLaborCostData,
  WorkDays,
  computeEmployee,
  snapshotEmpCount,
  snapshotMonthlyTotal,
} from '../utils/siteLaborSnapshots'
import './SiteLaborCostPage.css'

// 현장 인건비 산출 (현장 운영 기능). 실제 근무표·실제 시급/월급·회사 적용 요율 기준 운영 원가 계산용.
// ⚠️ 입찰 제출용 산출표(입찰용 기능)와는 별개 기능이며 서로의 데이터를 공유하지 않는다.
// ⚠️ 최저임금/보험요율은 매년 바뀌므로 어떤 값도 하드코딩하지 않는다. 모든 요율은 사용자 입력값.
// 공용 타입·계산 함수는 ../utils/siteLaborSnapshots.ts 로 분리(파일 분리만, 동작/결과 동일).

const STORAGE_KEY = 'siteLaborCostData'

// 요율 기본값: 법정 수치(최저임금·보험요율)는 0/공란으로 두어 하드코딩을 피한다.
// 가산 배율(연장 1.5/야간 0.5/휴일 1.5)·월 환산 주수(4.345)만 관행적 기본값을 제공한다.
const defaultSettings: CalcSettings = {
  baseMonth: new Date().toISOString().slice(0, 7),
  weeksPerMonth: 4.345,
  minWage: 0,
  overtimeMultiplier: 1.5,
  nightMultiplier: 0.5,
  holidayMultiplier: 1.5,
  insuranceRate: 0,
  severanceRate: 0,
  annualLeaveRate: 0,
  otherIndirectRate: 0,
}

const newEmployee = (): Employee => ({
  id: 'emp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
  name: '',
  role: '기타',
  payType: '시급',
  hourlyWage: 0,
  monthlySalary: 0,
  workDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  startTime: '09:00',
  endTime: '18:00',
  breakHours: 1,
  weeklyHolidayApplied: true,
  nightCalc: false,
  overtimeCalc: false,
  memo: '',
})

const sampleEmployees = (): Employee[] => [
  {
    id: 'emp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    name: '안내데스크 직원',
    role: '안내데스크',
    payType: '시급',
    hourlyWage: 10000,
    monthlySalary: 0,
    workDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    startTime: '09:00',
    endTime: '18:00',
    breakHours: 1,
    weeklyHolidayApplied: true,
    nightCalc: false,
    overtimeCalc: false,
    memo: '샘플: 시급제 안내데스크',
  },
  {
    id: 'emp-' + (Date.now() + 1) + '-' + Math.random().toString(36).slice(2, 7),
    name: '트레이너',
    role: '트레이너',
    payType: '월급',
    hourlyWage: 0,
    monthlySalary: 2800000,
    workDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    startTime: '14:00',
    endTime: '22:00',
    breakHours: 1,
    weeklyHolidayApplied: false,
    nightCalc: false,
    overtimeCalc: false,
    memo: '샘플: 월급제 트레이너',
  },
]

const loadData = (): SiteLaborCostData => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { settings: defaultSettings, employees: [] }
    const parsed = JSON.parse(raw) as Partial<SiteLaborCostData>
    return {
      settings: { ...defaultSettings, ...(parsed.settings || {}) },
      employees: Array.isArray(parsed.employees) ? parsed.employees : [],
    }
  } catch {
    return { settings: defaultSettings, employees: [] }
  }
}

const fmtWon = (n: number) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString('ko-KR')
const fmtHours = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(1)

// ─── 저장본(스냅샷) 관리 ───────────────────────────────────────────────────────
// 현재 산출(siteLaborCostData)을 단지명/기준월/저장명 기준으로 별도 key에 보관한다.
// ⚠️ 기존 siteLaborCostData 구조는 변경하지 않는다. 저장본은 별도 key(siteLaborCostSnapshots)로만 관리.
// LaborCostSnapshot 타입과 합계 헬퍼는 ../utils/siteLaborSnapshots 에서 import.
const SNAPSHOT_KEY = 'siteLaborCostSnapshots'

const loadSnapshots = (): LaborCostSnapshot[] => {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LaborCostSnapshot[]) : []
  } catch {
    return []
  }
}

const SiteLaborCostPage: React.FC = () => {
  const initial = loadData()
  const [settings, setSettings] = useState<CalcSettings>(initial.settings)
  const [employees, setEmployees] = useState<Employee[]>(initial.employees)
  const [msg, setMsg] = useState('')
  // 캘린더 입력 변경을 SitePayrollPanel에 즉시 전파하는 nonce.
  // SiteLaborCalendar의 onCalendarChange가 호출될 때마다 증가 → Panel이 monthSummary를 다시 읽음.
  const [payrollRefreshNonce, setPayrollRefreshNonce] = useState(0)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, employees }))
  }, [settings, employees])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2500)
  }

  const setSetting = <K extends keyof CalcSettings>(key: K, value: CalcSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  const numVal = (v: string) => {
    if (v.trim() === '') return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const updateEmp = (id: string, patch: Partial<Employee>) =>
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  const toggleDay = (id: string, day: keyof WorkDays) =>
    setEmployees((prev) =>
      prev.map((e) => (e.id === id ? { ...e, workDays: { ...e.workDays, [day]: !e.workDays[day] } } : e)),
    )

  const addEmployee = () => setEmployees((prev) => [...prev, newEmployee()])
  const addSample = () => {
    setEmployees((prev) => [...prev, ...sampleEmployees()])
    flash('샘플 직원 2명이 추가되었습니다.')
  }
  const removeEmp = (id: string) => setEmployees((prev) => prev.filter((e) => e.id !== id))
  const resetAll = () => {
    if (!window.confirm('계산 기준과 직원 데이터를 모두 초기화하시겠습니까?')) return
    setSettings(defaultSettings)
    setEmployees([])
    flash('전체 초기화되었습니다.')
  }

  const results = useMemo(
    () => employees.map((emp) => ({ emp, r: computeEmployee(emp, settings) })),
    [employees, settings],
  )

  const totals = useMemo(() => {
    const acc = {
      count: results.length,
      monthlyHours: 0,
      basePay: 0,
      holidayPay: 0,
      overtimePay: 0,
      nightPay: 0,
      directPay: 0,
      insurance: 0,
      severance: 0,
      annualLeave: 0,
      otherIndirect: 0,
      indirectTotal: 0,
      total: 0,
    }
    results.forEach(({ r }) => {
      acc.monthlyHours += r.monthlyHours
      acc.basePay += r.basePay
      acc.holidayPay += r.holidayPay
      acc.overtimePay += r.overtimePay
      acc.nightPay += r.nightPay
      acc.directPay += r.directPay
      acc.insurance += r.insurance
      acc.severance += r.severance
      acc.annualLeave += r.annualLeave
      acc.otherIndirect += r.otherIndirect
      acc.indirectTotal += r.indirectTotal
      acc.total += r.total
    })
    return acc
  }, [results])

  const byRole = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {}
    results.forEach(({ emp, r }) => {
      if (!map[emp.role]) map[emp.role] = { count: 0, total: 0 }
      map[emp.role].count += 1
      map[emp.role].total += r.total
    })
    return ROLES.filter((role) => map[role]).map((role) => ({ role, ...map[role] }))
  }, [results])

  // PDF/인쇄: 결과 영역만 출력. body.site-labor-printing 스코프로만 #root를 숨겨
  // 입주민 안내 보고서/공개 보고서 인쇄와 충돌하지 않게 한다.
  const [printing, setPrinting] = useState(false)

  const handlePrint = () => {
    if (employees.length === 0) {
      flash('직원 데이터를 먼저 추가해주세요.')
      return
    }
    setPrinting(true)
  }

  useEffect(() => {
    if (!printing) return
    document.body.classList.add('site-labor-printing')
    const cleanup = () => {
      document.body.classList.remove('site-labor-printing')
      setPrinting(false)
    }
    window.addEventListener('afterprint', cleanup)
    const t = window.setTimeout(() => window.print(), 80)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('afterprint', cleanup)
      document.body.classList.remove('site-labor-printing')
    }
  }, [printing])

  // CSV 내보내기: 요약 + 직원별 상세. 엑셀 한글 깨짐 방지용 UTF-8 BOM. 금액은 콤마 없는 정수.
  const csvField = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const exportCsv = () => {
    if (employees.length === 0) {
      flash('직원 데이터를 먼저 추가해주세요.')
      return
    }
    const r0 = (n: number) => String(Math.round(Number.isFinite(n) ? n : 0))
    const lines: string[] = []
    lines.push('[요약]')
    lines.push(['기준 월', settings.baseMonth || ''].map(csvField).join(','))
    lines.push(['직원 수', totals.count].map(csvField).join(','))
    lines.push(['총 월 근로시간', fmtHours(totals.monthlyHours)].map(csvField).join(','))
    lines.push(['총 기본급', r0(totals.basePay)].map(csvField).join(','))
    lines.push(['총 주휴수당', r0(totals.holidayPay)].map(csvField).join(','))
    lines.push(['총 연장수당', r0(totals.overtimePay)].map(csvField).join(','))
    lines.push(['총 야간수당', r0(totals.nightPay)].map(csvField).join(','))
    lines.push(['총 직접 인건비', r0(totals.directPay)].map(csvField).join(','))
    lines.push(['총 4대보험 회사부담', r0(totals.insurance)].map(csvField).join(','))
    lines.push(['총 퇴직충당', r0(totals.severance)].map(csvField).join(','))
    lines.push(['총 연차충당', r0(totals.annualLeave)].map(csvField).join(','))
    lines.push(['총 기타 간접비', r0(totals.otherIndirect)].map(csvField).join(','))
    lines.push(['월 총 예상 인건비', r0(totals.total)].map(csvField).join(','))
    lines.push('')
    lines.push('[직원별 상세]')
    const header = [
      '기준 월', '직원명', '직무', '급여 형태', '주 근로시간', '월 근로시간', '기본급', '주휴수당',
      '연장수당', '야간수당', '직접 인건비', '4대보험 회사부담', '퇴직충당', '연차충당', '기타 간접비', '총 예상 인건비', '메모',
    ]
    lines.push(header.map(csvField).join(','))
    results.forEach(({ emp, r }) => {
      lines.push(
        [
          settings.baseMonth || '', emp.name, emp.role, emp.payType,
          fmtHours(r.weeklyHours), fmtHours(r.monthlyHours), r0(r.basePay), r0(r.holidayPay),
          r0(r.overtimePay), r0(r.nightPay), r0(r.directPay), r0(r.insurance), r0(r.severance),
          r0(r.annualLeave), r0(r.otherIndirect), r0(r.total), emp.memo || '',
        ]
          .map(csvField)
          .join(','),
      )
    })
    const csv = '﻿' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = settings.baseMonth ? `site-labor-cost-${settings.baseMonth}.csv` : 'site-labor-cost.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    flash('CSV 파일을 내보냈습니다.')
  }

  // ─── 월간 근무표 CSV 내보내기 (기존 인건비 CSV와 분리) ────────────────────
  // 파일명: site-labor-calendar-YYYY-MM.csv. 해당 월의 모든 날짜 포함(빈 날짜는 근로시간 0).
  // 컬럼: 기준월, 직원명, 날짜, 요일, 출근, 퇴근, 휴게시간, 야간시간, 근로시간, 휴무여부, 공휴일여부, 메모.
  const exportCalendarCsv = () => {
    const storage = loadCalendarStorage()
    const cal = buildCalendarSnapshot(storage)
    if (!cal) {
      flash('근무표 데이터가 없습니다. 월간 근무시간 달력에서 기준 월을 선택해주세요.')
      return
    }
    const lines: string[] = []
    const header = [
      '기준월', '직원명', '날짜', '요일', '출근', '퇴근', '휴게시간', '야간시간',
      '근로시간', '휴무여부', '공휴일여부', '메모',
    ]
    lines.push(header.map(csvField).join(','))
    // 해당 월의 in-month 날짜만 순회. 빈 날짜는 입력 없음 → 근로 0으로 표시.
    cal.weeksSummary // weeks 구조에서 in-month 추출 — weeksSummary는 합계만, 일자 순회는 별도.
    // 일자 순회는 storage.monthDays[cal.month] + 빈 일자 보강을 위해 weeks 재생성 활용.
    const [yStr, mStr] = cal.month.split('-')
    const y = Number(yStr); const m = Number(mStr)
    const lastDay = new Date(y, m, 0).getDate()
    for (let d = 1; d <= lastDay; d++) {
      const dateKey = `${y}-${mStr}-${d.toString().padStart(2, '0')}`
      const dow = new Date(y, m - 1, d).getDay()
      const day = cal.days[dateKey]
      const work = day ? dayWorkHours(day) : 0
      lines.push(
        [
          cal.month,
          cal.base.employeeName,
          dateKey,
          DOW_LABELS[dow],
          day?.start || '',
          day?.end || '',
          day ? day.breakHours : 0,
          day ? day.nightHours : 0,
          work.toFixed(1),
          day?.isOff ? 'Y' : 'N',
          day?.isHoliday ? 'Y' : 'N',
          day?.memo || '',
        ]
          .map(csvField)
          .join(','),
      )
    }
    const csv = '﻿' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `site-labor-calendar-${cal.month}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    flash('근무표 CSV 파일을 내보냈습니다.')
  }

  const hasEmployees = employees.length > 0
  // PDF 출력 시점에 현재 달력 스냅샷을 한 번 더 읽어 인쇄 영역에 함께 노출.
  // 인쇄 영역은 portal로 렌더되므로 매 렌더마다 loadCalendarStorage()를 호출해도 비용 작음.
  const printCalendar: CalendarSnapshotPart | null = printing ? buildCalendarSnapshot() : null
  // 급여명세서 초안도 인쇄 시점에 매번 빌드 (가장 최신 상태 반영).
  const printPayroll: PayrollDraft | null = printing
    ? buildPayrollDraftFromCalendar(printCalendar, loadPayrollState())
    : null

  // 급여요약 CSV — 단일 행. 파일명 site-labor-payroll-summary-YYYY-MM.csv.
  const exportPayrollCsv = () => {
    const cal = buildCalendarSnapshot()
    const state = loadPayrollState()
    const draft = buildPayrollDraftFromCalendar(cal, state)
    if (draft.source === 'none' && draft.gross.extrasTotal === 0 && draft.deductionsTotal === 0) {
      flash('급여 요약 데이터가 없습니다. 월간 근무시간 달력 또는 기타수당/공제액을 먼저 입력해주세요.')
      return
    }
    const r0 = (n: number) => String(Math.round(Number.isFinite(n) ? n : 0))
    // 비과세 항목 내역 — "항목명 금액 / 항목명 금액" 형태로 한 셀에 직렬화.
    // 금액은 콤마 포맷(엑셀 표시 편의)으로 직렬화하되 CSV escape는 csvField가 처리.
    const nontaxDetail = (draft.nonTaxableItems || [])
      .map((e) => `${e.label || '비과세'} ${(e.amount || 0).toLocaleString('ko-KR')}`)
      .join(' / ')
    const header = [
      '기준월','직원명','총근로시간','기본급','주휴수당','야간수당','레슨수당','기타수당',
      '세전총지급액','국민연금','건강보험','장기요양','고용보험','소득세','지방소득세','기타공제',
      '공제합계','예상실지급액','비과세항목내역','비과세합계','과세대상급여참고액','비고',
    ]
    const row = [
      draft.month,
      draft.employeeName,
      draft.totalHours.toFixed(1),
      r0(draft.gross.basePay),
      r0(draft.gross.holidayPay),
      r0(draft.gross.nightPay),
      r0(draft.gross.lessonAllowance),
      r0(draft.gross.extrasTotal),
      r0(draft.gross.grossTotal),
      r0(draft.deductions.pension),
      r0(draft.deductions.health),
      r0(draft.deductions.longTermCare),
      r0(draft.deductions.employment),
      r0(draft.deductions.incomeTax),
      r0(draft.deductions.localIncomeTax),
      r0(draft.deductions.etc),
      r0(draft.deductionsTotal),
      r0(draft.netPay),
      nontaxDetail,
      r0(draft.nonTaxableTotal || 0),
      r0(draft.taxablePayReference || 0),
      draft.note,
    ]
    const csv = '﻿' + [header, row].map((cols) => cols.map(csvField).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const monthLabel = draft.month || new Date().toISOString().slice(0, 7)
    a.download = `site-labor-payroll-summary-${monthLabel}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    flash('급여요약 CSV 파일을 내보냈습니다.')
  }

  // ─── 저장본 관리 ───────────────────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState<LaborCostSnapshot[]>(loadSnapshots)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveApt, setSaveApt] = useState('')
  const [saveMonth, setSaveMonth] = useState('')
  const [snapQuery, setSnapQuery] = useState('')
  const [snapSort, setSnapSort] = useState<'latest' | 'oldest' | 'month' | 'apartment' | 'totalDesc' | 'totalAsc'>('latest')

  useEffect(() => {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots))
  }, [snapshots])

  const openSaveModal = () => {
    setSaveTitle(`${settings.baseMonth || ''} 현장 인건비 산출`.trim())
    setSaveApt('')
    setSaveMonth(settings.baseMonth || '')
    setSaveOpen(true)
  }

  const doSave = () => {
    const now = new Date().toISOString()
    const month = saveMonth.trim() || settings.baseMonth
    // 저장 시점의 월간 근무시간 달력 스냅샷 + 급여명세서 초안 동시 보존(옵셔널).
    const calendar = buildCalendarSnapshot() || undefined
    // 급여 초안: localStorage(siteLaborPayrollDraft) 입력값 + 캘린더 monthSummary 기반.
    // 캘린더가 없어도 사용자가 기타수당/공제만 입력했을 가능성이 있으므로 무조건 빌드.
    const payrollDraft = buildPayrollDraftFromCalendar(calendar || null, loadPayrollState())
    const snap: LaborCostSnapshot = {
      id: 'slc-snap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      title: saveTitle.trim() || `${month || ''} 현장 인건비 산출`.trim() || '현장 인건비 산출',
      apartmentName: saveApt.trim(),
      baseMonth: month,
      savedAt: now,
      data: { settings, employees },
      calendar,
      payrollDraft,
    }
    setSnapshots((prev) => [snap, ...prev])
    setSaveOpen(false)
    flash(
      calendar
        ? '현장 인건비 저장본에 월간 근무표와 급여명세서 초안이 함께 저장되었습니다.'
        : '현재 산출이 저장본으로 저장되었습니다(급여 초안 포함).',
    )
  }

  const loadSnapshot = (snap: LaborCostSnapshot) => {
    if (!window.confirm('현재 입력 중인 내용이 저장본으로 대체됩니다. 불러오시겠습니까?')) return
    setSettings({ ...defaultSettings, ...snap.data.settings })
    setEmployees(snap.data.employees ?? [])
    flash(`"${snap.title}" 저장본을 불러왔습니다.`)
  }

  const overwriteSnapshot = (id: string) => {
    if (!window.confirm('현재 입력 중인 내용으로 이 저장본을 덮어쓰시겠습니까?')) return
    const now = new Date().toISOString()
    // 덮어쓰기 시점에도 캘린더/급여초안 스냅샷을 갱신해 함께 보존.
    const calendar = buildCalendarSnapshot() || undefined
    const payrollDraft = buildPayrollDraftFromCalendar(calendar || null, loadPayrollState())
    setSnapshots((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              data: { settings, employees },
              baseMonth: settings.baseMonth || s.baseMonth,
              updatedAt: now,
              calendar,
              payrollDraft,
            }
          : s,
      ),
    )
    flash('저장본을 현재 내용으로 덮어썼습니다.')
  }

  const deleteSnapshot = (id: string) => {
    if (!window.confirm('이 저장본을 삭제하시겠습니까?')) return
    setSnapshots((prev) => prev.filter((s) => s.id !== id))
    flash('저장본을 삭제했습니다.')
  }

  // JSON 백업/가져오기 (저장본이 0개여도 백업 가능, 가져오기는 병합)
  const importInputRef = useRef<HTMLInputElement>(null)

  const backupSnapshotsJson = () => {
    const payload = {
      backupVersion: 1,
      backupType: 'siteLaborCostSnapshots',
      exportedAt: new Date().toISOString(),
      source: 'HOMEBASE AI',
      count: snapshots.length,
      items: snapshots,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `site-labor-cost-snapshots-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    flash(`저장본 ${snapshots.length}건을 JSON으로 백업했습니다.`)
  }

  const importSnapshotsJson = (file: File) => {
    if (!window.confirm('선택한 JSON 저장본을 현재 저장본 목록에 병합합니다. 기존 저장본은 삭제되지 않습니다. 가져오시겠습니까?')) return
    const reader = new FileReader()
    reader.onload = () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(String(reader.result))
      } catch {
        flash('JSON 파일을 읽을 수 없습니다.')
        return
      }
      const obj = parsed as { backupType?: string; items?: unknown }
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.items)) {
        flash('올바른 저장본 백업 파일이 아닙니다.')
        return
      }
      if (obj.backupType !== 'siteLaborCostSnapshots') {
        flash('현재 페이지와 다른 종류의 백업 파일입니다.')
        return
      }
      const now = new Date().toISOString()
      const imported: LaborCostSnapshot[] = (obj.items as LaborCostSnapshot[])
        .filter((it) => it && typeof it === 'object' && it.data && Array.isArray(it.data.employees))
        .map((it) => ({
          ...it,
          id: 'slc-snap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          title: `${it.title || '저장본'} (가져옴)`,
          savedAt: it.savedAt || now,
          updatedAt: now,
        }))
      if (imported.length === 0) {
        flash('가져올 수 있는 저장본이 없습니다.')
        return
      }
      setSnapshots((prev) => [...prev, ...imported])
      flash(`${imported.length}개의 저장본을 가져왔습니다.`)
    }
    reader.onerror = () => flash('JSON 파일을 읽을 수 없습니다.')
    reader.readAsText(file)
  }

  const visibleSnapshots = useMemo(() => {
    const q = snapQuery.trim().toLowerCase()
    const withMeta = snapshots.map((s) => ({
      s,
      total: snapshotMonthlyTotal(s.data),
      count: snapshotEmpCount(s.data),
    }))
    const filtered = withMeta.filter(
      ({ s }) => !q || [s.title, s.apartmentName, s.baseMonth].filter(Boolean).join(' ').toLowerCase().includes(q),
    )
    const dv = (x?: string) => (x ? new Date(x).getTime() || 0 : 0)
    return filtered.slice().sort((a, b) => {
      switch (snapSort) {
        case 'oldest':
          return dv(a.s.savedAt) - dv(b.s.savedAt)
        case 'month':
          return (b.s.baseMonth || '').localeCompare(a.s.baseMonth || '', 'ko')
        case 'apartment':
          return (a.s.apartmentName || '').localeCompare(b.s.apartmentName || '', 'ko')
        case 'totalDesc':
          return b.total - a.total
        case 'totalAsc':
          return a.total - b.total
        case 'latest':
        default:
          return dv(b.s.savedAt) - dv(a.s.savedAt)
      }
    })
  }, [snapshots, snapQuery, snapSort])

  return (
    <div className="page slc-page">
      <PageHeader
        title="현장 인건비 산출"
        description="실제 근무표와 회사 적용 요율을 기준으로 월 예상 인건비를 계산합니다. 입찰 제출용 산출표와는 별도 기능입니다."
      />

      <div className="slc-info-box">
        이 페이지는 실제 현장 운영비 계산용입니다. 입찰용 산출표는 입찰 공고 조건과 제출 양식에 맞춰 별도 작성해야 합니다.
      </div>

      <div className="slc-actions">
        <Button variant="primary" onClick={openSaveModal}>현재 산출 저장</Button>
        <Button variant="secondary" onClick={handlePrint} disabled={!hasEmployees}>PDF 저장 / 인쇄</Button>
        <Button variant="secondary" onClick={exportCsv} disabled={!hasEmployees}>CSV 내보내기</Button>
        {/* 근무표 CSV는 직원 등록 없이도 달력 입력만으로 내보낼 수 있다. */}
        <Button variant="secondary" onClick={exportCalendarCsv}>근무표 CSV 내보내기</Button>
        {/* 급여요약 CSV — 캘린더 monthSummary + 사용자 입력 기타수당/공제액 단일 행. */}
        <Button variant="secondary" onClick={exportPayrollCsv}>급여요약 CSV 내보내기</Button>
        {!hasEmployees && !msg && <span className="slc-actions-hint">직원 데이터를 먼저 추가해주세요.</span>}
        {msg && <span className="slc-msg">{msg}</span>}
      </div>

      <Card title="결과 요약" className="slc-summary-card">
        <div className="slc-summary-grid">
          <div className="slc-sum-item"><span>직원 수</span><strong>{totals.count}명</strong></div>
          <div className="slc-sum-item"><span>총 월 근로시간</span><strong>{fmtHours(totals.monthlyHours)}h</strong></div>
          <div className="slc-sum-item"><span>총 기본급</span><strong>{fmtWon(totals.basePay)}원</strong></div>
          <div className="slc-sum-item"><span>총 주휴수당</span><strong>{fmtWon(totals.holidayPay)}원</strong></div>
          <div className="slc-sum-item"><span>총 연장수당</span><strong>{fmtWon(totals.overtimePay)}원</strong></div>
          <div className="slc-sum-item"><span>총 야간수당</span><strong>{fmtWon(totals.nightPay)}원</strong></div>
          <div className="slc-sum-item"><span>총 직접 인건비</span><strong>{fmtWon(totals.directPay)}원</strong></div>
          <div className="slc-sum-item"><span>총 회사부담(4대보험)</span><strong>{fmtWon(totals.insurance)}원</strong></div>
          <div className="slc-sum-item"><span>총 퇴직충당</span><strong>{fmtWon(totals.severance)}원</strong></div>
          <div className="slc-sum-item"><span>총 연차충당</span><strong>{fmtWon(totals.annualLeave)}원</strong></div>
          <div className="slc-sum-item"><span>총 기타 간접비</span><strong>{fmtWon(totals.otherIndirect)}원</strong></div>
          <div className="slc-sum-item slc-sum-total"><span>월 총 예상 인건비</span><strong>{fmtWon(totals.total)}원</strong></div>
        </div>
        {byRole.length > 0 && (
          <div className="slc-byrole">
            <h4>직무별 합계</h4>
            <div className="slc-byrole-list">
              {byRole.map((b) => (
                <span key={b.role} className="slc-byrole-item">
                  {b.role} {b.count}명 · {fmtWon(b.total)}원
                </span>
              ))}
            </div>
          </div>
        )}
        <p className="slc-note">주휴수당은 현장별 계약 형태·법 해석에 따라 달라질 수 있는 <strong>참고 계산값</strong>입니다.</p>
      </Card>

      <Card title="계산 기준 설정">
        <div className="slc-settings-grid">
          <label>
            기준 월
            <input type="month" value={settings.baseMonth} onChange={(e) => setSetting('baseMonth', e.target.value)} />
          </label>
          <label>
            월 환산 주수
            <input type="number" step="0.001" value={settings.weeksPerMonth} onChange={(e) => setSetting('weeksPerMonth', numVal(e.target.value))} />
          </label>
          <label>
            최저시급 (참고·선택)
            <input type="number" value={settings.minWage} onChange={(e) => setSetting('minWage', numVal(e.target.value))} placeholder="직접 입력" />
          </label>
          <label>
            연장수당 배율
            <input type="number" step="0.1" value={settings.overtimeMultiplier} onChange={(e) => setSetting('overtimeMultiplier', numVal(e.target.value))} />
          </label>
          <label>
            야간수당 배율(가산)
            <input type="number" step="0.1" value={settings.nightMultiplier} onChange={(e) => setSetting('nightMultiplier', numVal(e.target.value))} />
          </label>
          <label>
            휴일수당 배율
            <input type="number" step="0.1" value={settings.holidayMultiplier} onChange={(e) => setSetting('holidayMultiplier', numVal(e.target.value))} />
          </label>
          <label>
            4대보험 회사부담률 (%)
            <input type="number" step="0.1" value={settings.insuranceRate} onChange={(e) => setSetting('insuranceRate', numVal(e.target.value))} placeholder="직접 입력" />
          </label>
          <label>
            퇴직충당률 (%)
            <input type="number" step="0.1" value={settings.severanceRate} onChange={(e) => setSetting('severanceRate', numVal(e.target.value))} placeholder="직접 입력" />
          </label>
          <label>
            연차충당률 (%)
            <input type="number" step="0.1" value={settings.annualLeaveRate} onChange={(e) => setSetting('annualLeaveRate', numVal(e.target.value))} placeholder="직접 입력" />
          </label>
          <label>
            기타 간접비율 (%)
            <input type="number" step="0.1" value={settings.otherIndirectRate} onChange={(e) => setSetting('otherIndirectRate', numVal(e.target.value))} placeholder="직접 입력" />
          </label>
        </div>
        <p className="slc-note">최저임금·보험요율은 매년 변경되므로 기본값을 강제하지 않습니다. 현재 적용 요율을 직접 입력하세요.</p>
      </Card>

      <Card title="직원별 입력">
        <div className="slc-emp-toolbar">
          <Button variant="primary" onClick={addEmployee}>직원 추가</Button>
          <Button variant="secondary" onClick={addSample}>샘플 직원 추가</Button>
          <Button variant="danger" onClick={resetAll}>전체 초기화</Button>
          {msg && <span className="slc-msg">{msg}</span>}
        </div>

        {employees.length === 0 ? (
          <p className="slc-empty">등록된 직원이 없습니다. "직원 추가" 또는 "샘플 직원 추가"로 시작하세요.</p>
        ) : (
          <div className="slc-emp-list">
            {employees.map((emp) => (
              <div key={emp.id} className="slc-emp-card">
                <div className="slc-emp-row">
                  <label className="slc-f-name">
                    직원명
                    <input type="text" value={emp.name} onChange={(e) => updateEmp(emp.id, { name: e.target.value })} placeholder="이름" />
                  </label>
                  <label>
                    직무
                    <select value={emp.role} onChange={(e) => updateEmp(emp.id, { role: e.target.value as JobRole })}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label>
                    급여 형태
                    <select value={emp.payType} onChange={(e) => updateEmp(emp.id, { payType: e.target.value as PayType })}>
                      <option value="시급">시급</option>
                      <option value="월급">월급</option>
                    </select>
                  </label>
                  {emp.payType === '시급' ? (
                    <label>
                      시급
                      <input type="number" value={emp.hourlyWage} onChange={(e) => updateEmp(emp.id, { hourlyWage: numVal(e.target.value) })} />
                    </label>
                  ) : (
                    <label>
                      월급
                      <input type="number" value={emp.monthlySalary} onChange={(e) => updateEmp(emp.id, { monthlySalary: numVal(e.target.value) })} />
                    </label>
                  )}
                </div>

                <div className="slc-emp-row">
                  <label>
                    출근 시간
                    <input type="time" value={emp.startTime} onChange={(e) => updateEmp(emp.id, { startTime: e.target.value })} />
                  </label>
                  <label>
                    퇴근 시간
                    <input type="time" value={emp.endTime} onChange={(e) => updateEmp(emp.id, { endTime: e.target.value })} />
                  </label>
                  <label>
                    휴게 시간(h)
                    <input type="number" step="0.5" value={emp.breakHours} onChange={(e) => updateEmp(emp.id, { breakHours: numVal(e.target.value) })} />
                  </label>
                </div>

                <div className="slc-emp-days">
                  <span className="slc-days-label">근무 요일</span>
                  {DAYS.map((d) => (
                    <label key={d.key} className={`slc-day ${emp.workDays[d.key] ? 'on' : ''}`}>
                      <input type="checkbox" checked={emp.workDays[d.key]} onChange={() => toggleDay(emp.id, d.key)} />
                      {d.label}
                    </label>
                  ))}
                </div>

                <div className="slc-emp-flags">
                  <label><input type="checkbox" checked={emp.weeklyHolidayApplied} onChange={(e) => updateEmp(emp.id, { weeklyHolidayApplied: e.target.checked })} /> 주휴 적용</label>
                  <label><input type="checkbox" checked={emp.overtimeCalc} onChange={(e) => updateEmp(emp.id, { overtimeCalc: e.target.checked })} /> 연장 계산</label>
                  <label><input type="checkbox" checked={emp.nightCalc} onChange={(e) => updateEmp(emp.id, { nightCalc: e.target.checked })} /> 야간 계산</label>
                  <label className="slc-f-memo">
                    메모
                    <input type="text" value={emp.memo} onChange={(e) => updateEmp(emp.id, { memo: e.target.value })} placeholder="내부 메모" />
                  </label>
                  <Button variant="danger" onClick={() => removeEmp(emp.id)}>삭제</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="직원별 계산 결과">
        {results.length === 0 ? (
          <p className="slc-empty">계산할 직원이 없습니다.</p>
        ) : (
          <div className="slc-result-wrap">
            <table className="slc-result-table">
              <thead>
                <tr>
                  <th>직원명</th>
                  <th>직무</th>
                  <th>주 근로시간</th>
                  <th>월 근로시간</th>
                  <th>기본급</th>
                  <th>주휴수당</th>
                  <th>연장수당</th>
                  <th>야간수당</th>
                  <th>직접 인건비</th>
                  <th>간접비 합계</th>
                  <th>총 예상 인건비</th>
                </tr>
              </thead>
              <tbody>
                {results.map(({ emp, r }) => (
                  <tr key={emp.id}>
                    <td>{emp.name || '(미입력)'}</td>
                    <td>{emp.role}</td>
                    <td className="num">{fmtHours(r.weeklyHours)}</td>
                    <td className="num">{fmtHours(r.monthlyHours)}</td>
                    <td className="num">{fmtWon(r.basePay)}</td>
                    <td className="num">{fmtWon(r.holidayPay)}</td>
                    <td className="num">{fmtWon(r.overtimePay)}</td>
                    <td className="num">{fmtWon(r.nightPay)}</td>
                    <td className="num">{fmtWon(r.directPay)}</td>
                    <td className="num">{fmtWon(r.indirectTotal)}</td>
                    <td className="num slc-total-cell">{fmtWon(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>합계</td>
                  <td className="num">-</td>
                  <td className="num">{fmtHours(totals.monthlyHours)}</td>
                  <td className="num">{fmtWon(totals.basePay)}</td>
                  <td className="num">{fmtWon(totals.holidayPay)}</td>
                  <td className="num">{fmtWon(totals.overtimePay)}</td>
                  <td className="num">{fmtWon(totals.nightPay)}</td>
                  <td className="num">{fmtWon(totals.directPay)}</td>
                  <td className="num">{fmtWon(totals.indirectTotal)}</td>
                  <td className="num slc-total-cell">{fmtWon(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* 월간 근무시간 달력 (보조 섹션) — 직원별 입력/요율과 별개의 일자별 실제 근무 입력.
          캘린더 입력 변경 시 onCalendarChange가 호출되어 payrollRefreshNonce가 증가하고,
          아래 SitePayrollPanel이 monthSummary를 즉시 다시 읽어 세전 급여 요약/급여명세서
          초안을 갱신한다. */}
      <SiteLaborCalendar onCalendarChange={() => setPayrollRefreshNonce((v) => v + 1)} />

      {/* 세전 급여 요약 + 급여명세서 초안 (보조 섹션). 캘린더 monthSummary를 입력으로 사용. */}
      <SitePayrollPanel refreshNonce={payrollRefreshNonce} />

      <Card title={`저장본 관리 (${snapshots.length})`}>
        <div className="slc-snap-tools">
          <input
            type="search"
            className="slc-snap-search"
            placeholder="저장명·단지명·기준월 검색"
            value={snapQuery}
            onChange={(e) => setSnapQuery(e.target.value)}
          />
          <select className="slc-snap-sort" value={snapSort} onChange={(e) => setSnapSort(e.target.value as typeof snapSort)} aria-label="정렬">
            <option value="latest">최신 저장순</option>
            <option value="oldest">오래된 저장순</option>
            <option value="month">기준월순</option>
            <option value="apartment">단지명순</option>
            <option value="totalDesc">총 인건비 높은순</option>
            <option value="totalAsc">총 인건비 낮은순</option>
          </select>
          <Button variant="secondary" onClick={backupSnapshotsJson}>JSON 백업</Button>
          <Button variant="secondary" onClick={() => importInputRef.current?.click()}>JSON 가져오기</Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importSnapshotsJson(f)
              e.target.value = ''
            }}
          />
          <span className="slc-snap-count">총 {snapshots.length}건 / 표시 {visibleSnapshots.length}건</span>
        </div>

        {snapshots.length === 0 ? (
          <p className="slc-empty">저장된 산출본이 없습니다. 상단 "현재 산출 저장"으로 현재 계산을 저장하세요.</p>
        ) : visibleSnapshots.length === 0 ? (
          <p className="slc-empty">검색 조건에 맞는 저장본이 없습니다.</p>
        ) : (
          <div className="slc-snap-wrap">
            <table className="slc-snap-table">
              <thead>
                <tr>
                  <th>저장명</th>
                  <th>단지명</th>
                  <th>기준월</th>
                  <th>저장일</th>
                  <th>직원 수</th>
                  <th>월 총 예상 인건비</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {visibleSnapshots.map(({ s, total, count }) => (
                  <tr key={s.id}>
                    <td>
                      {s.title}
                      {s.calendar && (
                        <span className="slc-snap-badge" title="월간 근무표가 함께 저장됨">
                          근무표 포함
                        </span>
                      )}
                      {s.payrollDraft && (
                        <span className="slc-snap-badge slc-snap-badge--payroll" title="급여명세서 초안이 함께 저장됨">
                          급여초안 포함
                        </span>
                      )}
                    </td>
                    <td>{s.apartmentName || '-'}</td>
                    <td>{s.baseMonth || '-'}</td>
                    <td>
                      {new Date(s.savedAt).toLocaleString('ko-KR')}
                      {s.updatedAt && <span className="slc-snap-updated"> · 수정 {new Date(s.updatedAt).toLocaleString('ko-KR')}</span>}
                    </td>
                    <td className="num">{count}명</td>
                    <td className="num">{fmtWon(total)}원</td>
                    <td className="slc-snap-actions">
                      <button type="button" onClick={() => loadSnapshot(s)}>불러오기</button>
                      <button type="button" onClick={() => overwriteSnapshot(s.id)}>덮어쓰기</button>
                      <button type="button" className="danger" onClick={() => deleteSnapshot(s.id)}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="slc-note">저장본은 현재 브라우저에 저장됩니다. JSON 백업을 내려받아두면 다른 PC 또는 브라우저에서 다시 가져올 수 있습니다.</p>
      </Card>

      <div className="slc-disclaimer">
        <p>본 계산은 내부 운영비 검토를 위한 참고 산출값입니다. 실제 급여 지급, 4대보험, 세무·노무 처리는 근로계약, 취업규칙, 최신 법령 및 전문가 검토에 따라 확정해야 합니다.</p>
        <p>입찰 제출용 산출표는 본 페이지가 아니라 입찰용 기능의 산출표 작성 메뉴에서 별도 관리합니다.</p>
      </div>

      {saveOpen && (
        <div className="slc-modal-backdrop" onClick={() => setSaveOpen(false)}>
          <div className="slc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="slc-modal-head">
              <h3>현재 산출 저장</h3>
              <button type="button" className="slc-modal-close" onClick={() => setSaveOpen(false)} aria-label="닫기">✕</button>
            </div>
            <div className="slc-modal-body">
              <label>
                저장명
                <input type="text" value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} placeholder="예: 2026-05 현장 인건비 산출" />
              </label>
              <label>
                단지명
                <input type="text" value={saveApt} onChange={(e) => setSaveApt(e.target.value)} placeholder="예: 행복아파트" />
              </label>
              <label>
                기준월
                <input type="month" value={saveMonth} onChange={(e) => setSaveMonth(e.target.value)} />
              </label>
              <p className="slc-modal-hint">현재 직원 {employees.length}명 / 계산 기준이 저장본으로 보관됩니다.</p>
            </div>
            <div className="slc-modal-foot">
              <Button variant="secondary" onClick={() => setSaveOpen(false)}>취소</Button>
              <Button variant="primary" onClick={doSave}>저장</Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF/인쇄 전용 영역 (화면 숨김, body.site-labor-printing 인쇄 시에만 노출). 결과 요약·직원별 결과만 출력 — 입력폼/버튼/사이드바 제외 */}
      {printing &&
        createPortal(
          <div className="slc-print-area" aria-hidden="true">
            <article className="slc-print-doc">
              <header className="slc-print-head">
                <h1>현장 인건비 산출</h1>
                <div className="slc-print-month">기준 월: {settings.baseMonth || '-'}</div>
              </header>

              <section className="slc-print-section">
                <h2>계산 기준</h2>
                <div className="slc-print-kv">
                  <span>월 환산 주수: {settings.weeksPerMonth}</span>
                  {settings.minWage > 0 && <span>최저시급: {fmtWon(settings.minWage)}원</span>}
                  <span>연장 배율: {settings.overtimeMultiplier}</span>
                  <span>야간 배율: {settings.nightMultiplier}</span>
                  <span>휴일 배율: {settings.holidayMultiplier}</span>
                  <span>4대보험 회사부담: {settings.insuranceRate}%</span>
                  <span>퇴직충당: {settings.severanceRate}%</span>
                  <span>연차충당: {settings.annualLeaveRate}%</span>
                  <span>기타 간접비: {settings.otherIndirectRate}%</span>
                </div>
              </section>

              <section className="slc-print-section">
                <h2>총 인건비 요약</h2>
                <div className="slc-print-kv">
                  <span>직원 수: {totals.count}명</span>
                  <span>총 월 근로시간: {fmtHours(totals.monthlyHours)}h</span>
                  <span>총 기본급: {fmtWon(totals.basePay)}원</span>
                  <span>총 주휴수당: {fmtWon(totals.holidayPay)}원</span>
                  <span>총 연장수당: {fmtWon(totals.overtimePay)}원</span>
                  <span>총 야간수당: {fmtWon(totals.nightPay)}원</span>
                  <span>총 직접 인건비: {fmtWon(totals.directPay)}원</span>
                  <span>총 회사부담(4대보험): {fmtWon(totals.insurance)}원</span>
                  <span>총 퇴직충당: {fmtWon(totals.severance)}원</span>
                  <span>총 연차충당: {fmtWon(totals.annualLeave)}원</span>
                  <span>총 기타 간접비: {fmtWon(totals.otherIndirect)}원</span>
                  <span className="slc-print-grand">월 총 예상 인건비: {fmtWon(totals.total)}원</span>
                </div>
              </section>

              {byRole.length > 0 && (
                <section className="slc-print-section">
                  <h2>직무별 합계</h2>
                  <div className="slc-print-kv">
                    {byRole.map((b) => (
                      <span key={b.role}>{b.role} {b.count}명 · {fmtWon(b.total)}원</span>
                    ))}
                  </div>
                </section>
              )}

              <section className="slc-print-section">
                <h2>직원별 결과</h2>
                <table className="slc-print-table">
                  <thead>
                    <tr>
                      <th>직원명</th>
                      <th>직무</th>
                      <th>주</th>
                      <th>월</th>
                      <th>기본급</th>
                      <th>주휴</th>
                      <th>연장</th>
                      <th>야간</th>
                      <th>직접</th>
                      <th>간접</th>
                      <th>총액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(({ emp, r }) => (
                      <tr key={emp.id}>
                        <td>{emp.name || '(미입력)'}</td>
                        <td>{emp.role}</td>
                        <td>{fmtHours(r.weeklyHours)}</td>
                        <td>{fmtHours(r.monthlyHours)}</td>
                        <td>{fmtWon(r.basePay)}</td>
                        <td>{fmtWon(r.holidayPay)}</td>
                        <td>{fmtWon(r.overtimePay)}</td>
                        <td>{fmtWon(r.nightPay)}</td>
                        <td>{fmtWon(r.directPay)}</td>
                        <td>{fmtWon(r.indirectTotal)}</td>
                        <td>{fmtWon(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>합계</td>
                      <td>-</td>
                      <td>{fmtHours(totals.monthlyHours)}</td>
                      <td>{fmtWon(totals.basePay)}</td>
                      <td>{fmtWon(totals.holidayPay)}</td>
                      <td>{fmtWon(totals.overtimePay)}</td>
                      <td>{fmtWon(totals.nightPay)}</td>
                      <td>{fmtWon(totals.directPay)}</td>
                      <td>{fmtWon(totals.indirectTotal)}</td>
                      <td>{fmtWon(totals.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </section>

              {/* 월간 근무시간 달력 — 직원 등록과 별개의 보조 섹션. 데이터가 있을 때만 노출. */}
              {printCalendar && (
                <section className="slc-print-section slc-print-calendar">
                  <h2>월간 근무시간 달력 (참고 계산)</h2>
                  <div className="slc-print-kv">
                    <span>직원명: {printCalendar.base.employeeName || '-'}</span>
                    <span>기준 월: {printCalendar.month}</span>
                    <span>시급: {fmtWonCal(printCalendar.base.hourlyWage)}원</span>
                    <span>월급여: {fmtWonCal(printCalendar.base.monthlySalary)}원</span>
                    <span>레슨수당: {fmtWonCal(printCalendar.base.lessonAllowance)}원</span>
                    <span>주휴 적용: {printCalendar.base.weeklyHolidayApplied ? '예' : '아니오'}</span>
                    <span>야간 적용: {printCalendar.base.nightApplied ? '예' : '아니오'}</span>
                  </div>
                  <div className="slc-print-kv">
                    <span>총 근로시간: {fmtHoursCal(printCalendar.monthSummary.totalHours)}h</span>
                    <span>총 주휴시간: {fmtHoursCal(printCalendar.monthSummary.totalHolidayHours)}h</span>
                    <span>총 주휴수당: {fmtWonCal(printCalendar.monthSummary.totalHolidayPay)}원</span>
                    <span>총 야간수당: {fmtWonCal(printCalendar.monthSummary.totalNightPay)}원</span>
                    <span>기본급: {fmtWonCal(printCalendar.monthSummary.basePay)}원</span>
                    <span className="slc-print-grand">
                      예상 총지급액 (시급 기준): {fmtWonCal(printCalendar.monthSummary.expectedTotal)}원
                    </span>
                    {printCalendar.base.monthlySalary > 0 && (
                      <span>월급여 기준 총액: {fmtWonCal(printCalendar.monthSummary.salaryBasedTotal)}원</span>
                    )}
                  </div>
                  <h3 className="slc-print-subtitle">주차별 요약</h3>
                  <table className="slc-print-table">
                    <thead>
                      <tr>
                        <th>주차</th><th>기간</th><th>근로시간</th>
                        <th>주휴시간</th><th>주휴수당</th>
                        {printCalendar.base.nightApplied && (<><th>야간시간</th><th>야간수당</th></>)}
                        <th>주급</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printCalendar.weeksSummary.map((w) => (
                        <tr key={w.weekIndex}>
                          <td>{w.weekIndex}주차</td>
                          <td>{w.range.start} ~ {w.range.end}</td>
                          <td>{fmtHoursCal(w.summary.totalHours)}</td>
                          <td>{w.summary.eligibleHoliday ? fmtHoursCal(w.summary.holidayHours) : '-'}</td>
                          <td>{fmtWonCal(w.summary.holidayPay)}</td>
                          {printCalendar.base.nightApplied && (
                            <>
                              <td>{fmtHoursCal(w.summary.nightHours)}</td>
                              <td>{fmtWonCal(w.summary.nightPay)}</td>
                            </>
                          )}
                          <td>{fmtWonCal(w.summary.weekPay)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h3 className="slc-print-subtitle">일자별 요약</h3>
                  <table className="slc-print-table slc-print-calendar-days">
                    <thead>
                      <tr>
                        <th>날짜</th><th>요일</th>
                        <th>출근</th><th>퇴근</th><th>휴게</th><th>근로</th>
                        <th>휴무</th><th>공휴일</th><th>메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const [yStr, mStr] = printCalendar.month.split('-')
                        const y = Number(yStr); const m = Number(mStr)
                        const lastDay = new Date(y, m, 0).getDate()
                        const rows = []
                        for (let d = 1; d <= lastDay; d++) {
                          const key = `${y}-${mStr}-${d.toString().padStart(2, '0')}`
                          const dow = new Date(y, m - 1, d).getDay()
                          const day = printCalendar.days[key]
                          const work = day ? dayWorkHours(day) : 0
                          rows.push(
                            <tr key={key}>
                              <td>{key}</td>
                              <td>{DOW_LABELS[dow]}</td>
                              <td>{day?.start || '-'}</td>
                              <td>{day?.end || '-'}</td>
                              <td>{day ? day.breakHours : 0}</td>
                              <td>{fmtHoursCal(work)}</td>
                              <td>{day?.isOff ? 'Y' : ''}</td>
                              <td>{day?.isHoliday ? 'Y' : ''}</td>
                              <td>{day?.memo || ''}</td>
                            </tr>,
                          )
                        }
                        return rows
                      })()}
                    </tbody>
                  </table>
                  <p className="slc-print-calendar-note">
                    본 계산은 내부 검토용 참고 계산입니다. 실제 급여 확정 전 근로계약 조건과 근로기준법 기준을 확인하세요.
                  </p>
                </section>
              )}

              {/* 세전 급여 요약 + 급여명세서 초안 (참고). 데이터 있을 때만 노출. */}
              {printPayroll && (printPayroll.source === 'calendar' || printPayroll.gross.grossTotal > 0 || printPayroll.deductionsTotal > 0) && (
                <section className="slc-print-section slc-print-payroll">
                  <h2>세전 급여 요약 (참고)</h2>
                  <div className="slc-print-kv">
                    <span>직원명: {printPayroll.employeeName || '-'}</span>
                    <span>기준 월: {printPayroll.month || '-'}</span>
                    <span>총 근로시간: {fmtHoursCal(printPayroll.totalHours)}h</span>
                    <span>기본급: {fmtWonCal(printPayroll.gross.basePay)}원</span>
                    <span>주휴수당: {fmtWonCal(printPayroll.gross.holidayPay)}원</span>
                    <span>야간수당: {fmtWonCal(printPayroll.gross.nightPay)}원</span>
                    <span>레슨수당: {fmtWonCal(printPayroll.gross.lessonAllowance)}원</span>
                    <span>기타수당: {fmtWonCal(printPayroll.gross.extrasTotal)}원</span>
                    <span className="slc-print-grand">
                      세전 총지급액: {fmtWonCal(printPayroll.gross.grossTotal)}원
                    </span>
                  </div>

                  <h3 className="slc-print-subtitle">급여명세서 초안 (확정 명세서 아님)</h3>
                  <div className="slc-print-kv">
                    <span>성명: {printPayroll.employeeName || '-'}</span>
                    <span>기준 월: {printPayroll.month || '-'}</span>
                    <span>임금지급일: {printPayroll.payDate || '-'}</span>
                    <span>근로일수: {printPayroll.workDays}일</span>
                  </div>
                  <table className="slc-print-table slc-print-payroll-table">
                    <thead>
                      <tr><th colSpan={2}>지급 항목</th><th colSpan={2}>공제 항목</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>기본급</th><td>{fmtWonCal(printPayroll.gross.basePay)}</td>
                        <th>국민연금</th><td>{fmtWonCal(printPayroll.deductions.pension)}</td>
                      </tr>
                      <tr>
                        <th>주휴수당</th><td>{fmtWonCal(printPayroll.gross.holidayPay)}</td>
                        <th>건강보험</th><td>{fmtWonCal(printPayroll.deductions.health)}</td>
                      </tr>
                      <tr>
                        <th>야간수당</th><td>{fmtWonCal(printPayroll.gross.nightPay)}</td>
                        <th>장기요양</th><td>{fmtWonCal(printPayroll.deductions.longTermCare)}</td>
                      </tr>
                      <tr>
                        <th>레슨수당</th><td>{fmtWonCal(printPayroll.gross.lessonAllowance)}</td>
                        <th>고용보험</th><td>{fmtWonCal(printPayroll.deductions.employment)}</td>
                      </tr>
                      <tr>
                        <th>기타수당</th><td>{fmtWonCal(printPayroll.gross.extrasTotal)}</td>
                        <th>소득세</th><td>{fmtWonCal(printPayroll.deductions.incomeTax)}</td>
                      </tr>
                      <tr>
                        <th></th><td></td>
                        <th>지방소득세</th><td>{fmtWonCal(printPayroll.deductions.localIncomeTax)}</td>
                      </tr>
                      <tr>
                        <th></th><td></td>
                        <th>기타공제</th><td>{fmtWonCal(printPayroll.deductions.etc)}</td>
                      </tr>
                      <tr className="slc-print-payroll-total">
                        <th>지급 합계</th>
                        <td>{fmtWonCal(printPayroll.gross.grossTotal)}</td>
                        <th>공제 합계</th>
                        <td>{fmtWonCal(printPayroll.deductionsTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="slc-print-kv slc-print-netpay">
                    <span className="slc-print-grand">
                      예상 실지급액: {fmtWonCal(printPayroll.netPay)}원
                    </span>
                  </div>

                  {/* 비과세 항목 (세무사 확인용 참고) — 입력 있을 때만 노출. compact table. */}
                  {(printPayroll.nonTaxableItems || []).length > 0 && (
                    <>
                      <h3 className="slc-print-subtitle">비과세 항목 (세무사 확인용 참고)</h3>
                      <table className="slc-print-table slc-print-payroll-table slc-print-nontax-table">
                        <thead>
                          <tr><th>항목명</th><th>금액</th><th>참고한도/비고</th></tr>
                        </thead>
                        <tbody>
                          {(printPayroll.nonTaxableItems || []).map((e) => (
                            <tr key={e.id}>
                              <th>{e.label || '비과세'}</th>
                              <td>{fmtWonCal(e.amount)}</td>
                              <td>{e.limitNote || ''}{e.memo ? ` · ${e.memo}` : ''}</td>
                            </tr>
                          ))}
                          <tr className="slc-print-payroll-total">
                            <th>비과세 합계</th>
                            <td>{fmtWonCal(printPayroll.nonTaxableTotal || 0)}</td>
                            <td></td>
                          </tr>
                          <tr>
                            <th>과세대상 급여 참고액</th>
                            <td>{fmtWonCal(printPayroll.taxablePayReference || 0)}</td>
                            <td>세전 - 비과세 (표시용)</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="slc-print-payroll-note">
                        과세대상 급여 참고액은 비과세 입력액을 차감한 내부 검토용 금액입니다. 실제 과세/공제 계산은 세무사 확정값을 따르세요.
                      </p>
                    </>
                  )}

                  {printPayroll.note && (
                    <p className="slc-print-payroll-note">비고: {printPayroll.note}</p>
                  )}
                  <p className="slc-print-payroll-disclaimer">
                    본 초안은 내부 검토용입니다. 4대보험·소득세는 자동 계산되지 않으며, 실제 지급 전 세무사/노무사 검토 후 확정하세요.
                  </p>
                </section>
              )}

              <footer className="slc-print-footer">
                본 산출 결과는 내부 운영비 검토를 위한 참고 자료입니다. 실제 급여 지급 및 노무 처리는 근로계약, 취업규칙, 최신 법령 및 전문가 검토에 따라 확정해야 합니다.
              </footer>
            </article>
          </div>,
          document.body,
        )}
    </div>
  )
}

export default SiteLaborCostPage
