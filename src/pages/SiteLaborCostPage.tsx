import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import Button from '../components/Button'
import './SiteLaborCostPage.css'

// 현장 인건비 산출 (현장 운영 기능). 실제 근무표·실제 시급/월급·회사 적용 요율 기준 운영 원가 계산용.
// ⚠️ 입찰 제출용 산출표(입찰용 기능)와는 별개 기능이며 서로의 데이터를 공유하지 않는다.
// ⚠️ 최저임금/보험요율은 매년 바뀌므로 어떤 값도 하드코딩하지 않는다. 모든 요율은 사용자 입력값.

const STORAGE_KEY = 'siteLaborCostData'

type JobRole = '센터장' | '트레이너' | '골프프로' | '안내데스크' | '미화' | '기타'
type PayType = '시급' | '월급'

const ROLES: JobRole[] = ['센터장', '트레이너', '골프프로', '안내데스크', '미화', '기타']

interface WorkDays {
  mon: boolean
  tue: boolean
  wed: boolean
  thu: boolean
  fri: boolean
  sat: boolean
  sun: boolean
}

const DAYS: Array<{ key: keyof WorkDays; label: string }> = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
]

interface Employee {
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

interface CalcSettings {
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

interface SiteLaborCostData {
  settings: CalcSettings
  employees: Employee[]
}

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

// "HH:MM" → 분 단위. 형식이 잘못되면 null.
const parseTime = (t: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

// 하루 내 [t0,t1) 구간 중 야간(00:00~06:00, 22:00~24:00) 분
const nightMinutesInDay = (t0: number, t1: number): number => {
  const ov = (a: number, b: number, lo: number, hi: number) => Math.max(0, Math.min(b, hi) - Math.max(a, lo))
  return ov(t0, t1, 0, 360) + ov(t0, t1, 1320, 1440)
}

// 절대 분 구간 [s,e)의 야간 근로 분 (익일까지 걸쳐도 일자별로 누적)
const nightOverlapMinutes = (s: number, e: number): number => {
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

interface EmpResult {
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

const computeEmployee = (emp: Employee, st: CalcSettings): EmpResult => {
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

const fmtWon = (n: number) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString('ko-KR')
const fmtHours = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(1)

const SiteLaborCostPage: React.FC = () => {
  const initial = loadData()
  const [settings, setSettings] = useState<CalcSettings>(initial.settings)
  const [employees, setEmployees] = useState<Employee[]>(initial.employees)
  const [msg, setMsg] = useState('')

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

  const hasEmployees = employees.length > 0

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
        <Button variant="secondary" onClick={handlePrint} disabled={!hasEmployees}>PDF 저장 / 인쇄</Button>
        <Button variant="secondary" onClick={exportCsv} disabled={!hasEmployees}>CSV 내보내기</Button>
        {!hasEmployees && <span className="slc-actions-hint">직원 데이터를 먼저 추가해주세요.</span>}
        {hasEmployees && msg && <span className="slc-msg">{msg}</span>}
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

      <div className="slc-disclaimer">
        <p>본 계산은 내부 운영비 검토를 위한 참고 산출값입니다. 실제 급여 지급, 4대보험, 세무·노무 처리는 근로계약, 취업규칙, 최신 법령 및 전문가 검토에 따라 확정해야 합니다.</p>
        <p>입찰 제출용 산출표는 본 페이지가 아니라 입찰용 기능의 산출표 작성 메뉴에서 별도 관리합니다.</p>
      </div>

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
