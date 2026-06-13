import { describe, expect, it } from 'vitest'
import {
  buildMetricsPromptBlock,
  computeMonthlyReportMetrics,
  MonthlyMetricsSource,
  REFERENCE_MIN_WAGE_MONTHLY,
} from '../monthlyReportMetrics'
import { ComplaintItem, FacilityDetail } from '../../types/CommunityData'

// 계산에 쓰이는 섹션만 채운 최소 픽스처 생성기
const makeSource = (overrides?: Partial<MonthlyMetricsSource>): MonthlyMetricsSource => ({
  apartmentInfo: {
    name: '테스트단지',
    region: '경기',
    totalUnits: 1764,
    buildingCount: 10,
    builtYear: 2020,
    communityArea: 500,
    officeName: '테스트관리',
    remarks: '',
  },
  facilityInfo: { items: [] },
  operationInfo: {
    weekdayHours: '06:00~22:00',
    weekendHours: '08:00~20:00',
    holidays: '',
    staffCount: 1,
    openStaffNeeded: false,
    closeStaffNeeded: false,
    unmannedHours: '',
    currentIssues: '',
  },
  costInfo: {
    salaries: 2090000,
    electricity: 300000,
    water: 100000,
    hvac: 200000,
    supplies: 0,
    maintenance: 0,
    cleaning: 0,
    other: 0,
  },
  revenueTarget: {
    currentMembers: 100,
    avgMembershipPrice: 30000,
    ptForecast: 0,
    gxForecast: 0,
    otherServiceRevenue: 0,
    currentMonthTarget: 0,
    nextMonthTarget: 0,
  },
  laborCost: { employees: [] },
  complaints: [],
  ...overrides,
})

const gymFacility: FacilityDetail = {
  id: 1,
  name: '헬스장',
  enabled: true,
  operatingStatus: '운영중',
  paidType: '유료',
  peakHours: '',
  notes: '',
  roomCount: 1,
  perUseFee: 0,
  monthlyUsageCount: 0,
  reservationType: '',
  needsCleaningStaff: false,
}

const makeComplaint = (id: number, status: ComplaintItem['status']): ComplaintItem => ({
  id,
  content: '민원',
  type: '시설 고장',
  status,
  date: '2026-06-01',
  action: '',
})

describe('computeMonthlyReportMetrics — 1,764세대 / 월매출 300만 / 1인 인건비 209만 케이스', () => {
  const metrics = computeMonthlyReportMetrics(makeSource())

  it('총수익·총운영비를 전체 항목 기준으로 계산한다', () => {
    expect(metrics.totalRevenue).toBe(3000000)
    // salaries + electricity + water + hvac (supplies 등 0 포함 8개 항목 합산)
    expect(metrics.totalCost).toBe(2690000)
    expect(metrics.profit).toBe(310000)
  })

  it('세대당 지표를 계산한다 (300만 / 1764세대 ≈ 1,701원)', () => {
    expect(metrics.revenuePerUnit).toBe(1701)
    expect(metrics.costPerUnit).toBe(Math.round(2690000 / 1764))
  })

  it('인건비 비중이 높아도(약 77.7%) 인당 인건비는 최저임금 수준으로 판정한다', () => {
    expect(metrics.laborToCostRatio).toBe(77.7)
    expect(metrics.staffCount).toBe(1)
    expect(metrics.laborCostPerStaff).toBe(2090000)
    // 209만원 ≤ 최저임금 월환산(2,156,880) × 1.15 → 인건비 과다가 아님
    expect(metrics.laborCostPerStaff!).toBeLessThanOrEqual(REFERENCE_MIN_WAGE_MONTHLY * 1.15)
    expect(metrics.staffWageJudgment).toBe('최저임금 수준')
  })

  it('세대당 매출 1,701원 → 매출 침투율 낮음으로 판정한다', () => {
    expect(metrics.revenuePenetration).toBe('낮음')
  })

  it('프롬프트 블록에 "인건비 과다 진단 금지"와 "매출 침투율 부족" 진단 근거가 포함된다', () => {
    const block = buildMetricsPromptBlock(metrics)
    expect(block).toContain('최저임금 수준')
    expect(block).toContain('"인건비 과다"로 진단하지 말 것')
    expect(block).toContain('세대수 대비 매출 침투율 부족')
  })
})

describe('computeMonthlyReportMetrics — 민원/시설/결측 데이터', () => {
  it('민원 0건이면 수집 체계 부재 가능성 문구를 프롬프트 블록에 넣는다', () => {
    const metrics = computeMonthlyReportMetrics(makeSource())
    expect(metrics.complaintCount).toBe(0)
    expect(buildMetricsPromptBlock(metrics)).toContain('민원 수집 체계')
  })

  it('미해결율을 계산한다 (4건 중 2건 미해결 → 50%)', () => {
    const metrics = computeMonthlyReportMetrics(
      makeSource({
        complaints: [
          makeComplaint(1, '완료'),
          makeComplaint(2, '완료'),
          makeComplaint(3, '접수'),
          makeComplaint(4, '진행 중'),
        ],
      }),
    )
    expect(metrics.unresolvedComplaints).toBe(2)
    expect(metrics.unresolvedRate).toBe(50)
  })

  it('헬스장 시설이 있으면 유형별 점검 포인트(PT/소그룹·청결·기구 고장)를 포함한다', () => {
    const metrics = computeMonthlyReportMetrics(makeSource({ facilityInfo: { items: [gymFacility] } }))
    expect(metrics.facilityRiskHints).toHaveLength(1)
    expect(metrics.facilityRiskHints[0]).toContain('헬스장')
    expect(metrics.facilityRiskHints[0]).toContain('PT/소그룹')
    expect(metrics.facilityRiskHints[0]).toContain('기구 고장')
  })

  it('회원수·이용자수 미입력 시 어떤 의사결정에 필요한지 설명을 남긴다', () => {
    const metrics = computeMonthlyReportMetrics(
      makeSource({
        revenueTarget: {
          currentMembers: 0,
          avgMembershipPrice: 0,
          ptForecast: 0,
          gxForecast: 0,
          otherServiceRevenue: 0,
          currentMonthTarget: 0,
          nextMonthTarget: 0,
        },
        facilityInfo: { items: [gymFacility] },
      }),
    )
    expect(metrics.missingData.some((d) => d.includes('유료 회원수') && d.includes('가격 정책'))).toBe(true)
    expect(metrics.missingData.some((d) => d.includes('시설 이용자수'))).toBe(true)
  })

  it('세대수 0·인건비 0이어도 나누기 오류 없이 null/판단불가 처리한다', () => {
    const metrics = computeMonthlyReportMetrics(
      makeSource({
        apartmentInfo: {
          name: '',
          region: '',
          totalUnits: 0,
          buildingCount: 0,
          builtYear: 0,
          communityArea: 0,
          officeName: '',
          remarks: '',
        },
        costInfo: { salaries: 0, electricity: 0, water: 0, hvac: 0, supplies: 0, maintenance: 0, cleaning: 0, other: 0 },
        operationInfo: {
          weekdayHours: '',
          weekendHours: '',
          holidays: '',
          staffCount: 0,
          openStaffNeeded: false,
          closeStaffNeeded: false,
          unmannedHours: '',
          currentIssues: '',
        },
      }),
    )
    expect(metrics.revenuePerUnit).toBeNull()
    expect(metrics.laborCostPerStaff).toBeNull()
    expect(metrics.staffWageJudgment).toBe('판단불가')
    expect(metrics.laborToCostRatio).toBeNull()
    expect(metrics.revenuePenetration).toBe('판단불가')
    // 운영시간 결측 → 인력 배치 판단 영향 설명 포함
    expect(metrics.missingData.some((d) => d.includes('운영시간') && d.includes('인력 배치'))).toBe(true)
  })

  it('인당 인건비가 통상 1인 운영 상한(320만)을 넘으면 초과 가능으로 판정한다', () => {
    const metrics = computeMonthlyReportMetrics(
      makeSource({
        costInfo: { salaries: 7000000, electricity: 0, water: 0, hvac: 0, supplies: 0, maintenance: 0, cleaning: 0, other: 0 },
        operationInfo: {
          weekdayHours: '06:00~22:00',
          weekendHours: '',
          holidays: '',
          staffCount: 2,
          openStaffNeeded: false,
          closeStaffNeeded: false,
          unmannedHours: '',
          currentIssues: '',
        },
      }),
    )
    expect(metrics.laborCostPerStaff).toBe(3500000)
    expect(metrics.staffWageJudgment).toBe('통상 수준 초과 가능')
  })
})
