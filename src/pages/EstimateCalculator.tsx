import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import { formatMoney } from '../utils/formatUtils'
import {
  EstimateDirectCosts,
  EstimateJobRole,
  EstimateSheet,
  EstimateStaffRow,
  TenderNotice,
} from '../types/CommunityData'
import { loadEstimateSheets, loadTenderNotices, saveEstimateSheets } from '../utils/storage'
import './EstimateCalculator.css'

const defaultJobRoles: EstimateJobRole[] = [
  {
    id: 1,
    name: '오전 트레이너',
    active: true,
    weekdayHoursText: '06:00 ~ 14:00',
    weekendHoursText: '09:00 ~ 18:00',
    weekdayDailyHours: 7,
    weekendDailyHours: 8,
    nightHours: 0,
    positionAllowance: 0,
  },
  {
    id: 2,
    name: '오후 트레이너',
    active: true,
    weekdayHoursText: '14:00 ~ 22:00',
    weekendHoursText: '09:00 ~ 18:00',
    weekdayDailyHours: 7,
    weekendDailyHours: 8,
    nightHours: 0,
    positionAllowance: 0,
  },
  {
    id: 3,
    name: '골프 프로',
    active: true,
    weekdayHoursText: '14:00 ~ 22:00',
    weekendHoursText: '09:00 ~ 18:00',
    weekdayDailyHours: 7,
    weekendDailyHours: 8,
    nightHours: 0,
    positionAllowance: 0,
  },
  {
    id: 4,
    name: '안내데스크',
    active: true,
    weekdayHoursText: '14:00 ~ 22:00',
    weekendHoursText: '09:00 ~ 18:00',
    weekdayDailyHours: 7,
    weekendDailyHours: 8,
    nightHours: 0,
    positionAllowance: 0,
  },
]

const defaultStaffRow: EstimateStaffRow = {
  id: 1,
  role: '센터장',
  count: 1,
  workDaysPerMonth: 20,
  hoursPerDay: 8,
  payType: '시급제',
  hourlyWage: 12000,
  monthlySalary: 0,
  nightHours: 0,
  overtimeHours: 0,
  weeklyHoliday: true,
  note: '',
}

const defaultDirectCosts: EstimateDirectCosts = {
  consumables: 0,
  cleaningSupplies: 0,
  officeSupplies: 0,
  fitnessMaintenance: 0,
  golfMaintenance: 0,
  programBudget: 0,
  insurance: 0,
  training: 0,
  uniforms: 0,
  communication: 0,
  other: 0,
}

const defaultEstimateSheet = (): EstimateSheet => ({
  id: Date.now(),
  name: '새 산출표',
  createdAt: new Date().toISOString(),
  selectedTenderId: undefined,
  selectedTenderTitle: '',
  siteName: '',
  region: '',
  totalUnits: 0,
  title: '',
  contractStartDate: '',
  contractEndDate: '',
  biddingMethod: '',
  awardMethod: '',
  participationLikelihood: '보통',
  riskLevel: '보통',
  estimateMonth: '',
  biddingYear: 2025,
  baseHourlyRate: 10030,
  contractMonthsOverride: 24,
  feeRate: 2,
  healthInsuranceRate: 3.545,
  longTermCareRate: 12.95,
  pensionRate: 4.5,
  employmentInsuranceRate: 1.8,
  industrialAccidentRate: 0.72,
  roundingUnit: '천원',
  weekendBasis: '토요일 또는 일요일',
  monthlyStandardHours: 0,
  weeklyHolidayApplied: true,
  nightAllowanceApplied: true,
  overtimeAllowanceApplied: true,
  insuranceRate: 10,
  retirementRate: 8.33,
  annualLeaveRate: 4,
  generalAdminRate: 5,
  profitRate: 5,
  vatRate: 10,
  staffRows: [defaultStaffRow],
  directOperatingCosts: defaultDirectCosts,
  jobRoles: defaultJobRoles,
  notes: '',
})

const parseNumber = (value: string | number) => {
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

const roundUp10 = (value: number) => Math.ceil(value / 10) * 10

const applyTruncation = (value: number, unit: '백원' | '천원') => {
  if (unit === '천원') {
    return Math.floor(value / 1000) * 1000
  }
  return Math.floor(value / 100) * 100
}

const normalizeEstimateSheet = (sheet: Partial<EstimateSheet>): EstimateSheet => {
  const base = defaultEstimateSheet()
  return {
    ...base,
    ...sheet,
    staffRows: sheet.staffRows ?? base.staffRows,
    directOperatingCosts: {
      ...base.directOperatingCosts,
      ...(sheet.directOperatingCosts ?? {}),
    },
    jobRoles: sheet.jobRoles
      ? sheet.jobRoles.map((role) => ({
          ...defaultJobRoles.find((item) => item.id === role.id) ?? defaultJobRoles[0],
          ...role,
        }))
      : base.jobRoles,
  }
}

const computeContractMonths = (start: string, end: string): number => {
  if (!start || !end) return 0
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return 0
  }
  const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.ceil(diffDays / 30))
}

const EstimateCalculator = () => {
  const [tenderNotices, setTenderNotices] = useState<TenderNotice[]>([])
  const [sheets, setSheets] = useState<EstimateSheet[]>([])
  const [currentSheet, setCurrentSheet] = useState<EstimateSheet>(defaultEstimateSheet())

  useEffect(() => {
    setTenderNotices(loadTenderNotices())
    const saved = loadEstimateSheets().map(normalizeEstimateSheet)
    if (saved.length > 0) {
      setSheets(saved)
      setCurrentSheet(saved[0])
    }
  }, [])

  useEffect(() => {
    saveEstimateSheets(sheets)
  }, [sheets])

  useEffect(() => {
    setSheets((prev) =>
      prev.some((sheet) => sheet.id === currentSheet.id)
        ? prev.map((sheet) => (sheet.id === currentSheet.id ? currentSheet : sheet))
        : prev
    )
  }, [currentSheet])

  const handleSheetChange = (next: Partial<EstimateSheet>) => {
    setCurrentSheet((prev) => normalizeEstimateSheet({ ...prev, ...next }))
  }

  const handleTenderSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const noticeId = parseNumber(event.target.value)
    const notice = tenderNotices.find((item) => item.id === noticeId)
    if (!notice) return
    handleSheetChange({
      selectedTenderId: notice.id,
      selectedTenderTitle: notice.title,
      siteName: notice.siteName,
      region: notice.region,
      totalUnits: notice.totalUnits,
      title: notice.title,
      contractStartDate: notice.contractStartDate,
      contractEndDate: notice.contractEndDate,
      biddingMethod: notice.biddingMethod,
      awardMethod: notice.awardMethod,
      participationLikelihood: notice.participationLikelihood,
      riskLevel: notice.riskLevel,
    })
  }

  const handleJobRoleChange = (
    id: number,
    field: keyof EstimateJobRole,
    value: string | number | boolean
  ) => {
    setCurrentSheet((prev) => ({
      ...prev,
      jobRoles: prev.jobRoles.map((role) =>
        role.id === id ? { ...role, [field]: value } : role
      ),
    }))
  }

  const createNewSheet = () => {
    const sheet = defaultEstimateSheet()
    setCurrentSheet(sheet)
    setSheets((prev) => [...prev, sheet])
  }

  const saveCurrentSheet = () => {
    setSheets((prev) => {
      const existingIndex = prev.findIndex((sheet) => sheet.id === currentSheet.id)
      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = currentSheet
        return next
      }
      return [...prev, currentSheet]
    })
  }

  const deleteCurrentSheet = () => {
    setSheets((prev) => prev.filter((sheet) => sheet.id !== currentSheet.id))
    setCurrentSheet(defaultEstimateSheet())
  }

  const loadSheet = (event: ChangeEvent<HTMLSelectElement>) => {
    const sheetId = parseNumber(event.target.value)
    const sheet = sheets.find((item) => item.id === sheetId)
    if (sheet) {
      setCurrentSheet(sheet)
    }
  }

  const contractMonthsFromDates = useMemo(
    () => computeContractMonths(currentSheet.contractStartDate, currentSheet.contractEndDate),
    [currentSheet.contractStartDate, currentSheet.contractEndDate]
  )

  const contractMonths = currentSheet.contractMonthsOverride || contractMonthsFromDates || 24

  const jobCalculations = useMemo(
    () =>
      currentSheet.jobRoles.map((role) => {
        const weekdayDailyHours = role.weekdayDailyHours || 0
        const weekendDailyHours = role.weekendDailyHours || 0
        const standardHours = role.active ? (weekdayDailyHours * 4 + weekendDailyHours) / 5 : 0
        const monthlyHours = standardHours * 4.345 * 6
        const monthlyRoundedHours = role.active ? Math.ceil(monthlyHours) : 0
        const baseSalary = role.active ? monthlyRoundedHours * currentSheet.baseHourlyRate : 0
        const nightAllowance = role.active ? currentSheet.baseHourlyRate * role.nightHours * 0.5 : 0
        const positionAllowance = role.active ? role.positionAllowance : 0
        const directSubtotal = baseSalary + nightAllowance + positionAllowance
        const annualLeave = role.active && monthlyRoundedHours > 0
          ? roundUp10(((baseSalary + positionAllowance) / monthlyRoundedHours) * standardHours * 15 / 12)
          : 0
        const retirementReserve = role.active
          ? roundUp10((directSubtotal + annualLeave) / 12)
          : 0
        const directTotal = directSubtotal + annualLeave + retirementReserve
        const indirectBase = directTotal - retirementReserve
        const healthInsurance = role.active
          ? roundUp10(indirectBase * (currentSheet.healthInsuranceRate / 100))
          : 0
        const longTermCare = role.active
          ? roundUp10(healthInsurance * (currentSheet.longTermCareRate / 100))
          : 0
        const pension = role.active
          ? roundUp10(indirectBase * (currentSheet.pensionRate / 100))
          : 0
        const employment = role.active
          ? roundUp10(indirectBase * (currentSheet.employmentInsuranceRate / 100))
          : 0
        const industrialAccident = role.active
          ? roundUp10(indirectBase * (currentSheet.industrialAccidentRate / 100))
          : 0
        const indirectTotal =
          healthInsurance + longTermCare + pension + employment + industrialAccident
        const jobTotal = directTotal + indirectTotal

        return {
          role,
          weekdayDailyHours,
          weekendDailyHours,
          standardHours,
          monthlyHours,
          monthlyRoundedHours,
          baseSalary,
          nightAllowance,
          positionAllowance,
          directSubtotal,
          annualLeave,
          retirementReserve,
          directTotal,
          indirectBase,
          healthInsurance,
          longTermCare,
          pension,
          employment,
          industrialAccident,
          indirectTotal,
          jobTotal,
        }
      }),
    [currentSheet]
  )

  const activeRoleCount = currentSheet.jobRoles.filter((role) => role.active).length
  const totalDirectLabor = jobCalculations.reduce((sum, item) => sum + item.directTotal, 0)
  const totalIndirectLabor = jobCalculations.reduce((sum, item) => sum + item.indirectTotal, 0)
  const overallSubtotal = jobCalculations.reduce((sum, item) => sum + item.jobTotal, 0)
  const monthlyFee = roundUp10(overallSubtotal * (currentSheet.feeRate / 100))
  const monthlyTrustTotal = applyTruncation(overallSubtotal + monthlyFee, currentSheet.roundingUnit)
  const bidAmount = applyTruncation(monthlyTrustTotal * contractMonths, currentSheet.roundingUnit)

  return (
    <div className="estimate-page">
      <PageHeader
        title="산출표 자동 계산"
        description="입찰 산출내역서 양식에 맞춘 근무시간과 비용 계산 테이블을 제공합니다."
      />

      <div className="estimate-actions">
        <div className="estimate-sheet-select">
          <FormGroup label="저장된 산출표 선택">
            <select value={currentSheet.id} onChange={loadSheet}>
              {sheets.length === 0 && <option value="">저장된 산출표가 없습니다.</option>}
              {sheets.map((sheet) => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.name}
                </option>
              ))}
            </select>
          </FormGroup>
        </div>
        <div className="estimate-sheet-buttons">
          <Button type="button" variant="secondary" onClick={createNewSheet}>
            새 산출표
          </Button>
          <Button type="button" variant="primary" onClick={saveCurrentSheet}>
            저장
          </Button>
          <Button type="button" variant="danger" onClick={deleteCurrentSheet}>
            삭제
          </Button>
        </div>
      </div>

      <div className="estimate-settings-grid">
        <Card title="입찰공고 및 계약 정보">
          <div className="estimate-form-grid">
            <FormGroup label="입찰공고 선택">
              <select value={currentSheet.selectedTenderId ?? ''} onChange={handleTenderSelect}>
                <option value="">공고를 선택해주세요</option>
                {tenderNotices.map((notice) => (
                  <option key={notice.id} value={notice.id}>
                    {notice.siteName} - {notice.title}
                  </option>
                ))}
              </select>
            </FormGroup>
            <FormGroup label="단지명">
              <input type="text" value={currentSheet.siteName} readOnly />
            </FormGroup>
            <FormGroup label="지역">
              <input type="text" value={currentSheet.region} readOnly />
            </FormGroup>
            <FormGroup label="세대수">
              <input type="number" value={currentSheet.totalUnits} readOnly />
            </FormGroup>
            <FormGroup label="계약 시작일">
              <input type="date" value={currentSheet.contractStartDate} onChange={(e) => handleSheetChange({ contractStartDate: e.target.value })} />
            </FormGroup>
            <FormGroup label="계약 종료일">
              <input type="date" value={currentSheet.contractEndDate} onChange={(e) => handleSheetChange({ contractEndDate: e.target.value })} />
            </FormGroup>
            <FormGroup label="계약개월수">
              <input
                type="number"
                min="1"
                value={currentSheet.contractMonthsOverride}
                onChange={(e) => handleSheetChange({ contractMonthsOverride: parseNumber(e.target.value) })}
              />
            </FormGroup>
            <FormGroup label="계약기간 산출 기준">
              <input type="text" value={currentSheet.weekendBasis} onChange={(e) => handleSheetChange({ weekendBasis: e.target.value })} />
            </FormGroup>
          </div>
        </Card>

        <Card title="기본 산출 조건">
          <div className="estimate-form-grid">
            <FormGroup label="기준연도">
              <input
                type="number"
                min="2024"
                value={currentSheet.biddingYear}
                onChange={(e) => handleSheetChange({ biddingYear: parseNumber(e.target.value) })}
              />
            </FormGroup>
            <FormGroup label="기준 시급">
              <input
                type="number"
                min="0"
                value={currentSheet.baseHourlyRate}
                onChange={(e) => handleSheetChange({ baseHourlyRate: parseNumber(e.target.value) })}
              />
            </FormGroup>
            <FormGroup label="위탁수수료율 (%)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={currentSheet.feeRate}
                onChange={(e) => handleSheetChange({ feeRate: parseNumber(e.target.value) })}
              />
            </FormGroup>
            <FormGroup label="건강보험 요율 (%)">
              <input
                type="number"
                min="0"
                step="0.001"
                value={currentSheet.healthInsuranceRate}
                onChange={(e) => handleSheetChange({ healthInsuranceRate: parseNumber(e.target.value) })}
              />
            </FormGroup>
            <FormGroup label="장기요양보험 요율 (%)">
              <input
                type="number"
                min="0"
                step="0.001"
                value={currentSheet.longTermCareRate}
                onChange={(e) => handleSheetChange({ longTermCareRate: parseNumber(e.target.value) })}
              />
            </FormGroup>
            <FormGroup label="국민연금 요율 (%)">
              <input
                type="number"
                min="0"
                step="0.001"
                value={currentSheet.pensionRate}
                onChange={(e) => handleSheetChange({ pensionRate: parseNumber(e.target.value) })}
              />
            </FormGroup>
            <FormGroup label="고용보험 요율 (%)">
              <input
                type="number"
                min="0"
                step="0.001"
                value={currentSheet.employmentInsuranceRate}
                onChange={(e) => handleSheetChange({ employmentInsuranceRate: parseNumber(e.target.value) })}
              />
            </FormGroup>
            <FormGroup label="산재보험 요율 (%)">
              <input
                type="number"
                min="0"
                step="0.001"
                value={currentSheet.industrialAccidentRate}
                onChange={(e) => handleSheetChange({ industrialAccidentRate: parseNumber(e.target.value) })}
              />
            </FormGroup>
            <FormGroup label="절사 단위">
              <select
                value={currentSheet.roundingUnit}
                onChange={(e) => handleSheetChange({ roundingUnit: e.target.value as '백원' | '천원' })}
              >
                <option value="백원">백원</option>
                <option value="천원">천원</option>
              </select>
            </FormGroup>
          </div>
          <div className="estimate-form-grid estimate-job-name-grid">
            {currentSheet.jobRoles.map((role) => (
              <FormGroup key={role.id} label={`직무명 (${role.name})`}>
                <input
                  type="text"
                  value={role.name}
                  onChange={(e) => handleJobRoleChange(role.id, 'name', e.target.value)}
                />
              </FormGroup>
            ))}
          </div>
        </Card>
      </div>

      <div className="estimate-summary-grid">
        <div className="result-card result-card-highlight">
          <p className="result-label">월간위탁 총계</p>
          <p className="result-value">{formatMoney(monthlyTrustTotal)}</p>
        </div>
        <div className="result-card result-card-highlight">
          <p className="result-label">입찰가액</p>
          <p className="result-value">{formatMoney(bidAmount)}</p>
        </div>
        <div className="result-card">
          <p className="result-label">계약개월수</p>
          <p className="result-value">{contractMonths}</p>
        </div>
        <div className="result-card">
          <p className="result-label">적용 인원 수</p>
          <p className="result-value">{activeRoleCount}</p>
        </div>
        <div className="result-card">
          <p className="result-label">직접노무비 합계</p>
          <p className="result-value">{formatMoney(totalDirectLabor)}</p>
        </div>
        <div className="result-card">
          <p className="result-label">간접노무비 합계</p>
          <p className="result-value">{formatMoney(totalIndirectLabor)}</p>
        </div>
        <div className="result-card">
          <p className="result-label">월 위탁수수료</p>
          <p className="result-value">{formatMoney(monthlyFee)}</p>
        </div>
      </div>

      <div className="estimate-sheet-wrapper">
        <div className="estimate-table-container">
          <table className="estimate-table">
            <thead>
              <tr>
                <th>구분</th>
                <th>세부구분</th>
                {currentSheet.jobRoles.map((role) => (
                  <th key={role.id}>{role.name}</th>
                ))}
                <th>산출근거</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td rowSpan={2}>근무시간</td>
                <td>평일(화~금)</td>
                {currentSheet.jobRoles.map((role) => (
                  <td key={`weekdayText-${role.id}`}>
                    <input
                      type="text"
                      value={role.weekdayHoursText}
                      onChange={(e) => handleJobRoleChange(role.id, 'weekdayHoursText', e.target.value)}
                    />
                  </td>
                ))}
                <td>각 직무별 평일 근무시간 입력</td>
              </tr>
              <tr>
                <td>토,일요일</td>
                {currentSheet.jobRoles.map((role) => (
                  <td key={`weekendText-${role.id}`}>
                    <input
                      type="text"
                      value={role.weekendHoursText}
                      onChange={(e) => handleJobRoleChange(role.id, 'weekendHoursText', e.target.value)}
                    />
                  </td>
                ))}
                <td>주말 근무시간 입력</td>
              </tr>
              <tr>
                <td>기준</td>
                <td>주말 근무 기준</td>
                <td colSpan={4}>
                  <input
                    type="text"
                    value={currentSheet.weekendBasis}
                    onChange={(e) => handleSheetChange({ weekendBasis: e.target.value })}
                  />
                </td>
                <td>토/일 중 기준 선택</td>
              </tr>
              <tr>
                <td>근무시간</td>
                <td>평일 일 근무시간</td>
                {jobCalculations.map((item) => (
                  <td key={`weekdayHours-${item.role.id}`}>
                    <input
                      type="number"
                      min="0"
                      value={item.weekdayDailyHours}
                      onChange={(e) => handleJobRoleChange(item.role.id, 'weekdayDailyHours', parseNumber(e.target.value))}
                    />
                  </td>
                ))}
                <td>주당 평일 4일 기준</td>
              </tr>
              <tr>
                <td>근무시간</td>
                <td>주말 일 근무시간</td>
                {jobCalculations.map((item) => (
                  <td key={`weekendHours-${item.role.id}`}>
                    <input
                      type="number"
                      min="0"
                      value={item.weekendDailyHours}
                      onChange={(e) => handleJobRoleChange(item.role.id, 'weekendDailyHours', parseNumber(e.target.value))}
                    />
                  </td>
                ))}
                <td>주말 1일 기준</td>
              </tr>
              <tr>
                <td>근로시간</td>
                <td>소정근로시간</td>
                {jobCalculations.map((item) => (
                  <td key={`standard-${item.role.id}`}>{item.standardHours.toFixed(2)}</td>
                ))}
                <td>(평일×4 + 주말) / 5</td>
              </tr>
              <tr>
                <td>근로시간</td>
                <td>월근무시간</td>
                {jobCalculations.map((item) => (
                  <td key={`monthly-${item.role.id}`}>{item.monthlyHours.toFixed(2)}</td>
                ))}
                <td>소정근로시간 × 4.345 × 6</td>
              </tr>
              <tr>
                <td>근로시간</td>
                <td>월근무시간 절상</td>
                {jobCalculations.map((item) => (
                  <td key={`monthlyRound-${item.role.id}`}>{item.monthlyRoundedHours}</td>
                ))}
                <td>월근무시간 소수점 절상</td>
              </tr>
              <tr>
                <td>적용</td>
                <td>활성화</td>
                {currentSheet.jobRoles.map((role) => (
                  <td key={`active-${role.id}`}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={role.active}
                        onChange={(e) => handleJobRoleChange(role.id, 'active', e.target.checked)}
                      />
                      적용
                    </label>
                  </td>
                ))}
                <td>해당 직무 미적용 시 합계에서 제외</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="estimate-table-container">
          <table className="estimate-table">
            <thead>
              <tr>
                <th>구분</th>
                <th>세부항목</th>
                {currentSheet.jobRoles.map((role) => (
                  <th key={`cost-${role.id}`}>{role.name}</th>
                ))}
                <th>산출근거</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td rowSpan={7}>직접노무비</td>
                <td>기본급</td>
                {jobCalculations.map((item) => (
                  <td key={`basic-${item.role.id}`}>{formatMoney(item.baseSalary)}</td>
                ))}
                <td>월근무시간 절상 × 기준시급</td>
              </tr>
              <tr>
                <td>야간수당</td>
                {jobCalculations.map((item) => (
                  <td key={`night-${item.role.id}`}>{formatMoney(item.nightAllowance)}</td>
                ))}
                <td>기준시급 × 야간시간 × 50%</td>
              </tr>
              <tr>
                <td>직책수당</td>
                {jobCalculations.map((item) => (
                  <td key={`position-${item.role.id}`}>{formatMoney(item.positionAllowance)}</td>
                ))}
                <td>사용자 입력</td>
              </tr>
              <tr>
                <td>소계</td>
                {jobCalculations.map((item) => (
                  <td key={`subtotal-${item.role.id}`}>{formatMoney(item.directSubtotal)}</td>
                ))}
                <td>기본급 + 야간수당 + 직책수당</td>
              </tr>
              <tr>
                <td>연차수당</td>
                {jobCalculations.map((item) => (
                  <td key={`annual-${item.role.id}`}>{formatMoney(item.annualLeave)}</td>
                ))}
                <td>(기본급+직책수당)/월근무시간절상 × 소정근로시간 × 15일 / 12개월</td>
              </tr>
              <tr>
                <td>퇴직적립금</td>
                {jobCalculations.map((item) => (
                  <td key={`retire-${item.role.id}`}>{formatMoney(item.retirementReserve)}</td>
                ))}
                <td>(직접노무비 소계 + 연차수당) / 12개월</td>
              </tr>
              <tr>
                <td>직접노무비 합계</td>
                {jobCalculations.map((item) => (
                  <td key={`directTotal-${item.role.id}`}>{formatMoney(item.directTotal)}</td>
                ))}
                <td>직접노무비 소계 + 연차수당 + 퇴직적립금</td>
              </tr>
              <tr>
                <td rowSpan={6}>간접노무비</td>
                <td>건강보험료</td>
                {jobCalculations.map((item) => (
                  <td key={`health-${item.role.id}`}>{formatMoney(item.healthInsurance)}</td>
                ))}
                <td>(직접노무비 합계 - 퇴직적립금) × 건강보험 요율</td>
              </tr>
              <tr>
                <td>장기요양보험</td>
                {jobCalculations.map((item) => (
                  <td key={`care-${item.role.id}`}>{formatMoney(item.longTermCare)}</td>
                ))}
                <td>건강보험료 × 장기요양보험 요율</td>
              </tr>
              <tr>
                <td>국민연금</td>
                {jobCalculations.map((item) => (
                  <td key={`pension-${item.role.id}`}>{formatMoney(item.pension)}</td>
                ))}
                <td>(직접노무비 합계 - 퇴직적립금) × 국민연금 요율</td>
              </tr>
              <tr>
                <td>고용보험료</td>
                {jobCalculations.map((item) => (
                  <td key={`employment-${item.role.id}`}>{formatMoney(item.employment)}</td>
                ))}
                <td>(직접노무비 합계 - 퇴직적립금) × 고용보험 요율</td>
              </tr>
              <tr>
                <td>산재보험료</td>
                {jobCalculations.map((item) => (
                  <td key={`industrial-${item.role.id}`}>{formatMoney(item.industrialAccident)}</td>
                ))}
                <td>산재요율 적용</td>
              </tr>
              <tr>
                <td>간접노무비 합계</td>
                {jobCalculations.map((item) => (
                  <td key={`indirectTotal-${item.role.id}`}>{formatMoney(item.indirectTotal)}</td>
                ))}
                <td>건강보험료 + 장기요양보험 + 국민연금 + 고용보험료 + 산재보험료</td>
              </tr>
              <tr>
                <td>총괄</td>
                <td>소계</td>
                <td colSpan={4}>{formatMoney(overallSubtotal)}</td>
                <td>직접노무비 합계 + 간접노무비 합계</td>
              </tr>
              <tr>
                <td>총괄</td>
                <td>합계</td>
                <td colSpan={4}>{formatMoney(overallSubtotal)}</td>
                <td>4개 직무 소계 합산</td>
              </tr>
              <tr>
                <td>총괄</td>
                <td>월 위탁수수료</td>
                <td colSpan={4}>{formatMoney(monthlyFee)}</td>
                <td>합계 × 수수료율</td>
              </tr>
              <tr>
                <td>총괄</td>
                <td>월간위탁 총계</td>
                <td colSpan={4}>{formatMoney(monthlyTrustTotal)}</td>
                <td>합계 + 월 위탁수수료</td>
              </tr>
              <tr>
                <td>총괄</td>
                <td>입찰가액</td>
                <td colSpan={4}>{formatMoney(bidAmount)}</td>
                <td>월간위탁 총계 × 계약개월수 / 절사 단위 적용</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Card title="산출표 유의사항">
        <ol className="estimate-note-list">
          <li>주 4일 근무기준, 주말반 근무, 휴무일은 공고 조건에 따라 조정 가능함.</li>
          <li>최저임금법, 근로기준법 등 관련 법령에 위배되거나 발주처 양식에 적합하지 않을 경우 무효 처리될 수 있음.</li>
          <li>입찰금액은 기준연도 최저시급을 기준으로 계산한 1개월 위탁비에 계약기간을 곱하여 산정함.</li>
          <li>아파트 사정에 따라 운영시간과 인원은 조정될 수 있으며 세부사항은 낙찰자와 협의함.</li>
          <li>야간근무수당은 연차수당 산정 시 포함되지 않음.</li>
          <li>직접노무비, 간접노무비, 월 위탁수수료는 원단위 이하 절상하고, 월간위탁 총계 및 입찰가액은 설정된 절사 단위에 따라 처리함.</li>
          <li>산출내역서의 합산 금액과 입찰서 기재금액이 불일치할 경우 무효 처리될 수 있음.</li>
        </ol>
      </Card>
    </div>
  )
}

export default EstimateCalculator
