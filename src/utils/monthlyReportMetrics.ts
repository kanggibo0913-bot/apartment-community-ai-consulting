import { CommunityData } from '../types/CommunityData'

// ─── 월간 리포트 AI용 사전 계산 지표 ──────────────────────────────────────────
// AI 호출 전에 운영 지표를 숫자로 계산해 프롬프트에 함께 전달한다.
// 목적: AI가 "인건비 비중이 높다 → 인건비 과다" 같은 비율만 본 오진을 하지 않고,
// 인당 인건비·세대당 매출 같은 절대 수준을 근거로 진단하게 만든다.

// ── MIK 내부 참고 기준 (운영 경험에 따라 이 상수만 조정하면 됨) ──
// 2026년 최저임금 시급 → 주휴 포함 월 209시간 환산
export const REFERENCE_MIN_WAGE_HOURLY = 10320
export const REFERENCE_MONTHLY_STANDARD_HOURS = 209
export const REFERENCE_MIN_WAGE_MONTHLY = REFERENCE_MIN_WAGE_HOURLY * REFERENCE_MONTHLY_STANDARD_HOURS // 2,156,880원
// 인당 인건비가 최저임금 월환산의 1.15배 이하면 "최저임금 수준"으로 본다 (4대보험 등 부대비용 여유분)
export const SINGLE_STAFF_MINIMAL_MULTIPLIER = 1.15
// 인당 인건비가 이 금액 이하면 "통상적 1인 운영 수준"으로 본다
export const SINGLE_STAFF_NORMAL_MAX = 3_200_000
// 세대당 월 매출 참고 기준 (원/세대) — 이 미만이면 침투율 낮음, 이상이면 양호
export const REVENUE_PER_UNIT_LOW = 3_000
export const REVENUE_PER_UNIT_GOOD = 8_000

export type LevelJudgment = '낮음' | '보통' | '양호' | '판단불가'
export type StaffWageJudgment = '최저임금 수준' | '통상적 1인 운영 수준' | '통상 수준 초과 가능' | '판단불가'

// 시설 유형별 점검 포인트 — 유형 추가 시 여기에 항목만 더하면 됨 (예: '수영장')
export const FACILITY_RISK_HINTS: Record<string, string> = {
  헬스장: '1인 운영 가능성 점검, PT/소그룹 프로그램 매출화 여지, 청결·혼잡 시간대·기구 고장 리스크',
  골프장: '타석 예약 회전율, 레슨 매출화 여지, 스크린/장비 유지보수 비용 리스크',
  GX룸: '프로그램 참여율 대비 강사 비용 적정성, 시간대별 참여 편중 리스크',
  사우나: '수도·전기 비용 비중 증가 리스크, 위생 민원 리스크',
  카페: '재료비·위생 관리, 상주 인력 필요로 인한 인건비 추가 리스크',
  독서실: '좌석 회전율, 무인 운영 전환 가능성',
  다목적실: '대관 수익화 여지, 예약 충돌 민원 리스크',
  키즈룸: '안전사고 리스크, 보호자 동반 규정 운영',
  게스트하우스: '예약·청소 운영 부담, 요금 정산 체계',
  '기타 시설': '시설별 운영 상태 개별 확인 필요',
}

// 계산에 실제로 쓰는 섹션만 받는다 — 테스트 픽스처를 작게 유지하기 위함
export type MonthlyMetricsSource = Pick<
  CommunityData,
  'apartmentInfo' | 'facilityInfo' | 'operationInfo' | 'costInfo' | 'revenueTarget' | 'laborCost' | 'complaints'
>

export interface MonthlyReportMetrics {
  totalUnits: number
  totalRevenue: number
  totalCost: number
  profit: number
  // 세대당 지표 — 세대수 미입력(0) 시 null
  revenuePerUnit: number | null
  costPerUnit: number | null
  profitPerUnit: number | null
  laborCost: number
  laborToCostRatio: number | null // % (총운영비 0이면 null)
  laborToRevenueRatio: number | null // % (총수익 0이면 null)
  staffCount: number
  laborCostPerStaff: number | null
  staffWageJudgment: StaffWageJudgment
  revenuePenetration: LevelJudgment
  complaintCount: number
  complaintsPer100Units: number | null
  unresolvedComplaints: number
  unresolvedRate: number | null // %
  enabledFacilities: { name: string; paidType: string; operatingStatus: string; monthlyUsageCount: number }[]
  facilityRiskHints: string[]
  // 미입력 데이터 항목 + 그 데이터가 필요한 의사결정 설명
  missingData: string[]
}

const round1 = (v: number) => Math.round(v * 10) / 10

export const computeMonthlyReportMetrics = (data: MonthlyMetricsSource): MonthlyReportMetrics => {
  const totalUnits = Math.max(0, data.apartmentInfo.totalUnits || 0)

  const rt = data.revenueTarget
  const membershipRevenue = (rt.currentMembers || 0) * (rt.avgMembershipPrice || 0)
  const totalRevenue = membershipRevenue + (rt.ptForecast || 0) + (rt.gxForecast || 0) + (rt.otherServiceRevenue || 0)

  // costInfo 8개 항목 전체 합산 (salaries/electricity/water/hvac/supplies/maintenance/cleaning/other)
  const totalCost = Object.values(data.costInfo).reduce((a, b) => a + (b || 0), 0)
  const laborCost = data.costInfo.salaries || 0
  const profit = totalRevenue - totalCost

  // 직원 수: 인건비 계산기에 등록된 인원 우선, 없으면 운영정보의 직원 수
  const staffCount = data.laborCost.employees.length > 0 ? data.laborCost.employees.length : data.operationInfo.staffCount || 0
  const laborCostPerStaff = staffCount > 0 && laborCost > 0 ? Math.round(laborCost / staffCount) : null

  let staffWageJudgment: StaffWageJudgment = '판단불가'
  if (laborCostPerStaff != null) {
    if (laborCostPerStaff <= REFERENCE_MIN_WAGE_MONTHLY * SINGLE_STAFF_MINIMAL_MULTIPLIER) staffWageJudgment = '최저임금 수준'
    else if (laborCostPerStaff <= SINGLE_STAFF_NORMAL_MAX) staffWageJudgment = '통상적 1인 운영 수준'
    else staffWageJudgment = '통상 수준 초과 가능'
  }

  const revenuePerUnit = totalUnits > 0 ? Math.round(totalRevenue / totalUnits) : null
  const costPerUnit = totalUnits > 0 ? Math.round(totalCost / totalUnits) : null
  const profitPerUnit = totalUnits > 0 ? Math.round(profit / totalUnits) : null

  let revenuePenetration: LevelJudgment = '판단불가'
  if (revenuePerUnit != null) {
    if (revenuePerUnit < REVENUE_PER_UNIT_LOW) revenuePenetration = '낮음'
    else if (revenuePerUnit < REVENUE_PER_UNIT_GOOD) revenuePenetration = '보통'
    else revenuePenetration = '양호'
  }

  const complaintCount = data.complaints.length
  const unresolvedComplaints = data.complaints.filter((c) => c.status !== '완료').length
  const complaintsPer100Units = totalUnits > 0 ? round1((complaintCount / totalUnits) * 100) : null
  const unresolvedRate = complaintCount > 0 ? round1((unresolvedComplaints / complaintCount) * 100) : null

  const enabledFacilities = data.facilityInfo.items
    .filter((f) => f.enabled)
    .map((f) => ({
      name: f.name,
      paidType: f.paidType,
      operatingStatus: f.operatingStatus,
      monthlyUsageCount: f.monthlyUsageCount || 0,
    }))
  const facilityRiskHints = enabledFacilities.map(
    (f) => `${f.name}(${f.paidType}): ${FACILITY_RISK_HINTS[f.name] || '시설별 운영 상태 개별 확인 필요'}`,
  )

  // 미입력 데이터: 단순 나열이 아니라 "어떤 의사결정에 필요한지"를 함께 남긴다
  const missingData: string[] = []
  if (!data.operationInfo.weekdayHours.trim() && !data.operationInfo.weekendHours.trim()) {
    missingData.push('운영시간 — 시간대별 인력 배치, 무인운영 전환, 혼잡 시간대 프로그램 편성 판단에 필요')
  }
  if ((rt.currentMembers || 0) <= 0) {
    missingData.push('유료 회원수 — 세대수 대비 유료 전환율 계산과 가격 정책·프로모션 판단에 필요')
  }
  if (enabledFacilities.length > 0 && enabledFacilities.every((f) => f.monthlyUsageCount <= 0)) {
    missingData.push('시설 이용자수 — 시설별 운영시간 조정과 유료 전환 우선순위 판단에 필요')
  }
  if ((rt.gxForecast || 0) <= 0 && (rt.ptForecast || 0) <= 0) {
    missingData.push('PT/프로그램 매출·참여율 — 프로그램 매출화 여지와 강사 운영 손익 판단에 필요')
  }

  return {
    totalUnits,
    totalRevenue,
    totalCost,
    profit,
    revenuePerUnit,
    costPerUnit,
    profitPerUnit,
    laborCost,
    laborToCostRatio: totalCost > 0 ? round1((laborCost / totalCost) * 100) : null,
    laborToRevenueRatio: totalRevenue > 0 ? round1((laborCost / totalRevenue) * 100) : null,
    staffCount,
    laborCostPerStaff,
    staffWageJudgment,
    revenuePenetration,
    complaintCount,
    complaintsPer100Units,
    unresolvedComplaints,
    unresolvedRate,
    enabledFacilities,
    facilityRiskHints,
    missingData,
  }
}

const won = (v: number) => '₩' + Math.round(v).toLocaleString('ko-KR')
const wonOrNa = (v: number | null) => (v == null ? '계산 불가(데이터 부족)' : won(v))
const pctOrNa = (v: number | null) => (v == null ? '계산 불가(데이터 부족)' : `${v}%`)

// AI 프롬프트에 그대로 삽입할 한국어 지표 블록.
// 숫자 + 사전 판정 + 시설 점검 포인트 + 미입력 데이터 영향까지 포함한다.
export const buildMetricsPromptBlock = (m: MonthlyReportMetrics): string => {
  const lines: string[] = []

  lines.push('【사전 계산 운영 지표】')
  lines.push(`- 세대수: ${m.totalUnits.toLocaleString('ko-KR')}세대`)
  lines.push(`- 월 총수익: ${won(m.totalRevenue)} / 월 총운영비: ${won(m.totalCost)} / 월 손익: ${won(m.profit)}`)
  lines.push(
    `- 세대당 월 매출: ${wonOrNa(m.revenuePerUnit)} / 세대당 월 운영비: ${wonOrNa(m.costPerUnit)} / 세대당 월 손익: ${wonOrNa(m.profitPerUnit)}`,
  )
  lines.push(`- 인건비: ${won(m.laborCost)} (총운영비 대비 ${pctOrNa(m.laborToCostRatio)}, 총수익 대비 ${pctOrNa(m.laborToRevenueRatio)})`)
  lines.push(`- 운영 인력: ${m.staffCount}명 / 인당 월 인건비: ${wonOrNa(m.laborCostPerStaff)}`)
  lines.push(
    `- 민원: 총 ${m.complaintCount}건 (100세대당 ${m.complaintsPer100Units ?? '계산 불가'}건) / 미해결 ${m.unresolvedComplaints}건 (미해결율 ${pctOrNa(m.unresolvedRate)})`,
  )

  lines.push('')
  lines.push('【계산 기반 사전 진단 — 리포트 판단의 근거로 사용할 것】')
  if (m.laborCostPerStaff != null) {
    lines.push(
      `- 인당 인건비 판정: ${m.staffWageJudgment} (참고: 2026년 최저임금 월 환산 ${won(REFERENCE_MIN_WAGE_MONTHLY)}, 통상적 1인 운영 상한 ${won(SINGLE_STAFF_NORMAL_MAX)})`,
    )
    if (m.staffWageJudgment === '최저임금 수준' || m.staffWageJudgment === '통상적 1인 운영 수준') {
      lines.push('- 인건비 비중이 높더라도 인당 인건비가 위 수준이므로 "인건비 과다"로 진단하지 말 것. 비용 절감이 아니라 매출 구조가 우선 검토 대상.')
    }
  } else {
    lines.push('- 인당 인건비 판정: 판단불가 (인력 수 또는 인건비 미입력)')
  }
  lines.push(
    `- 세대수 대비 매출 침투율 판정: ${m.revenuePenetration} (참고 기준: 세대당 월 매출 ${REVENUE_PER_UNIT_LOW.toLocaleString('ko-KR')}원 미만 낮음 / ${REVENUE_PER_UNIT_GOOD.toLocaleString('ko-KR')}원 이상 양호)`,
  )
  if (m.revenuePenetration === '낮음' && m.totalUnits > 0) {
    lines.push('- 세대수 규모 대비 매출이 낮으므로 "세대수 대비 매출 침투율 부족"을 핵심 문제로 지적할 것. 유료회원 전환율·PT/소그룹 매출·시간대별 이용률 확인이 우선.')
  }
  if (m.complaintCount === 0) {
    lines.push('- 민원 0건: 만족도가 높다고 단정하지 말 것. 민원 수집 체계(접수 창구·기록 절차) 부재 가능성을 함께 검토할 것.')
  }

  if (m.facilityRiskHints.length > 0) {
    lines.push('')
    lines.push('【시설 유형별 점검 포인트】')
    m.facilityRiskHints.forEach((h) => lines.push(`- ${h}`))
  }

  if (m.missingData.length > 0) {
    lines.push('')
    lines.push('【미입력 데이터와 의사결정 영향 — "확인 필요"로 끝내지 말고 아래 영향을 설명할 것】')
    m.missingData.forEach((d) => lines.push(`- ${d}`))
  }

  return lines.join('\n')
}
