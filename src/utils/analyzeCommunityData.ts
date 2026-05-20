import { CommunityData, AnalysisResult, DiagnosisGrade } from '../types/CommunityData'
import { formatMoney } from './formatUtils'

const parseHourRange = (value: string): number => {
  const matches = value.match(/\d{1,2}(?::\d{2})?/g)
  if (!matches || matches.length < 2) return 0
  const start = parseInt(matches[0], 10)
  const end = parseInt(matches[1], 10)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, end - start)
}

const formatPercent = (value: number) => `${value.toFixed(1)}%`

export const analyzeCommunityData = (data: CommunityData): AnalysisResult => {
  const totalCost = Object.values(data.costInfo).reduce((sum, value) => sum + value, 0)
  const totalRevenue = Object.values(data.revenueInfo).reduce((sum, value) => sum + value, 0)
  const profit = totalRevenue - totalCost
  const laborRatio = totalCost > 0 ? (data.costInfo.salaries / totalCost) * 100 : 0
  const unresolvedComplaints = data.complaints.filter(item => item.status !== '완료').length
  const repeatComplaints = data.complaints.filter(item => item.status === '반복 민원').length
  const activeFacilityCount = data.facilityInfo.items.filter(item => item.enabled).length
  const weekdayHours = parseHourRange(data.operationInfo.weekdayHours)
  const weekendHours = parseHourRange(data.operationInfo.weekendHours)
  const hasUnmannedHours = data.operationInfo.unmannedHours.trim().length > 0
  const totalUnits = data.apartmentInfo.totalUnits
  const staffCount = data.operationInfo.staffCount

  const complaintTypeCounts = data.complaints.reduce<Record<string, number>>((counts, item) => {
    counts[item.type] = (counts[item.type] || 0) + 1
    return counts
  }, {})

  const getComplaintTypeSummary = () => {
    const types = Object.entries(complaintTypeCounts)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${type} ${count}건`)
    return types.length > 0 ? `민원 유형별로는 ${types.join(', ')}가 주로 발생합니다.` : '등록된 민원이 없습니다.'
  }

  const isLargeDeficit = profit <= -2000000
  const positiveProfit = profit >= 0

  const getGrade = (): DiagnosisGrade => {
    if (positiveProfit) return '양호'
    if (isLargeDeficit) return '위험'
    return '주의'
  }

  const grade = getGrade()

  const laborCostAnalysis = totalCost === 0
    ? '운영비 데이터가 충분하지 않습니다. 비용 정보를 입력하면 인건비 적정성을 보다 정확히 평가할 수 있습니다.'
    : laborRatio >= 60
      ? '총 운영비 대비 인건비 비중이 60% 이상으로 높아, 인력 운영 효율과 예산 재검토가 필요합니다.'
      : laborRatio >= 50
        ? '인건비 비중이 50% 이상입니다. 인건비 관리가 필요하며 인력 배치와 업무 우선순위를 점검하십시오.'
        : '인건비 비중은 비교적 안정적인 수준입니다. 현재 인력 운영을 유지하면서 비용 집중 관리를 권장합니다.'

  const costAnalysis = totalCost === 0
    ? '월간 운영비가 입력되지 않았습니다. 비용 집계 정보를 확인하면 운영 부담도를 명확히 파악할 수 있습니다.'
    : positiveProfit
      ? '현 수준의 비용 구조는 수익성과 비교해 관리 가능한 범위에 있습니다. 비대상 시설 중심 비용 검토를 권장합니다.'
      : '월 손익이 적자를 기록하고 있어 비용 구조와 지출 우선순위 재검토가 필요합니다.'

  const revenueAnalysis = totalRevenue === 0
    ? '수익 데이터가 입력되지 않았습니다. 정기 수익 항목 입력을 통해 재무 건전성을 평가하십시오.'
    : '수익 구조가 입력되어 있습니다. 다양한 수익원의 균형과 추가 수익 기회를 검토하십시오.'

  const complaintTypeAnalysis = getComplaintTypeSummary()

  const complaintAnalysis = unresolvedComplaints === 0
    ? '미해결 민원이 없습니다. 민원 처리 프로세스를 유지하되, 지속적인 현황 모니터링을 권장합니다.'
    : unresolvedComplaints >= 5
      ? '미해결 민원이 5건 이상입니다. 민원 리스크가 있으므로 대응 속도를 높이고 필요 시 전담 팀을 배치해야 합니다.'
      : '미해결 민원이 존재합니다. 우선순위별 민원 처리와 후속 관리가 필요합니다.'

  const repeatComplaintRisk = repeatComplaints > 0
    ? '동일 유형의 반복 민원이 발생하고 있어 시설 개선 또는 운영 기준 재정비가 필요합니다.'
    : '반복 민원이 확인되지 않았습니다. 현재 체계를 유지하며 모니터링이 필요합니다.'

  const facilityStaffAnalysis = activeFacilityCount >= 4 && staffCount < 3
    ? '시설 수 대비 인력이 부족해 보입니다. 운영 동선과 근무 배치 재검토가 필요합니다.'
    : '시설과 인력 배치가 현재 수준에서는 비교적 안정적입니다.'

  const operationOptimization = totalUnits >= 200 && weekdayHours > 0 && weekdayHours <= 8
    ? '세대수 대비 평일 운영시간이 비교적 짧습니다. 운영시간 확대 또는 프로그램 다변화 검토가 가능합니다.'
    : weekdayHours === 0 && weekendHours === 0
      ? '운영시간 정보가 부족합니다. 평일 및 주말 운영시간 정보를 추가 입력하시기 바랍니다.'
      : '운영시간은 현재 수준에서 기본적으로 안정적입니다. 특정 시간대 집중 프로그램을 검토할 수 있습니다.'

  const improvementAdviceParts = []
  if (activeFacilityCount >= 4 && staffCount < 3) {
    improvementAdviceParts.push('활성 시설 수에 비해 직원 수가 적습니다. 인력 배치와 교대 운영을 재검토할 필요가 있습니다.')
  }
  if (totalUnits >= 400 && weekdayHours > 0 && weekdayHours <= 8) {
    improvementAdviceParts.push('세대수가 많은 편임에도 평일 운영시간이 짧습니다. 운영시간 확대 또는 프로그램 다변화를 고려하세요.')
  }
  if (!hasUnmannedHours) {
    improvementAdviceParts.push('무인 운영 가능 시간이 입력되지 않았습니다. 자동화를 도입할 수 있는 영역을 검토하십시오.')
  }
  if (!positiveProfit) {
    improvementAdviceParts.push('월 손익이 적자입니다. 비용 절감 및 수익 증대 방안을 우선 적용하십시오.')
  }
  if (improvementAdviceParts.length === 0) {
    improvementAdviceParts.push('현재 운영 체계는 기본적으로 안정적입니다. 주요 지표를 주기적으로 점검하며 개선 기회를 탐색하십시오.')
  }

  const automationReview = (data.operationInfo.openStaffNeeded || data.operationInfo.closeStaffNeeded) && hasUnmannedHours
    ? '오픈/마감 담당이 필요하고 무인운영 가능 시간이 있으므로 자동화 검토가 권장됩니다.'
    : hasUnmannedHours
      ? '무인 운영 가능 시간이 입력되어 있습니다. 자동화 도입 가능성을 확인해보십시오.'
      : '무인 운영 가능 시간이 아직 입력되지 않았습니다. 자동화 실행 가능성을 확인하는 것이 좋습니다.'

  const summary = `현재 단지는 ${grade} 단계로 평가됩니다. ${positiveProfit ? `월 손익은 ${formatMoney(profit)} 흑자` : `월 손익은 ${formatMoney(Math.abs(profit))} 적자`}이며, ${laborRatio >= 50 ? '인건비 관리가 필요합니다.' : '인건비 비중은 비교적 안정적입니다.'} ${unresolvedComplaints >= 5 ? '민원 리스크가 높아 대응 체계를 강화해야 합니다.' : '민원 대응 체계를 지속 점검해야 합니다.'}`

  const keyTakeaways = [
    `총 운영비 대비 인건비 비중은 ${formatPercent(laborRatio)}입니다.`,
    `월 손익은 ${positiveProfit ? `${formatMoney(profit)} 흑자` : `${formatMoney(Math.abs(profit))} 적자`}입니다.`,
    unresolvedComplaints > 0
      ? `미해결 민원은 ${unresolvedComplaints}건입니다.`
      : '미해결 민원은 아직 없습니다.',
    `활성 시설 수는 ${activeFacilityCount}개입니다.`,
    automationReview,
  ]

  const coreRisks = []
  if (laborRatio >= 60) {
    coreRisks.push('인건비 비중이 높아 재무 부담으로 이어질 수 있습니다.')
  }
  if (!positiveProfit) {
    coreRisks.push('월 손익이 적자로 실무 재무 안정성에 부담을 줄 수 있습니다.')
  }
  if (unresolvedComplaints >= 5) {
    coreRisks.push('미해결 민원이 누적되어 서비스 신뢰도가 저하될 위험이 있습니다.')
  }
  if (repeatComplaints > 0) {
    coreRisks.push('동일 유형의 반복 민원이 발생하고 있어 운영 기준 재정비가 필요합니다.')
  }
  if (activeFacilityCount >= 4 && staffCount < 3) {
    coreRisks.push('시설 수 대비 인력 배치가 부족해 운영 효율이 떨어질 수 있습니다.')
  }
  if (coreRisks.length === 0) {
    coreRisks.push('현재 주요 리스크는 제한적입니다. 지속적인 운영 모니터링이 필요합니다.')
  }

  const priorityTasks = []
  if (laborRatio >= 50) {
    priorityTasks.push('인건비 중심으로 근무시간 재조정 및 인력 운영 효율화를 검토하십시오.')
  }
  if (!positiveProfit) {
    priorityTasks.push('수익 증대 및 비용 절감 방안을 우선 검토하십시오.')
  }
  if (unresolvedComplaints >= 3) {
    priorityTasks.push('미해결 민원 우선 처리 기준과 담당자 배치를 점검하십시오.')
  }
  if (!hasUnmannedHours) {
    priorityTasks.push('무인 운영 및 자동화 도입 가능성을 추가로 확인하십시오.')
  }
  if (priorityTasks.length < 3) {
    priorityTasks.push('운영 데이터를 주기적으로 점검해 개선 기회를 확인하십시오.')
  }

  const expectedBenefits = []
  if (laborRatio >= 50) {
    expectedBenefits.push('인건비 효율화로 운영 비용 부담 감소 가능성이 있습니다.')
  }
  if (unresolvedComplaints > 0) {
    expectedBenefits.push('민원 감소로 커뮤니티 서비스 만족도 개선 가능성이 있습니다.')
  }
  if (!positiveProfit) {
    expectedBenefits.push('수익 개선으로 운영 안정성 확보 가능성이 있습니다.')
  }
  if (expectedBenefits.length < 3) {
    expectedBenefits.push('운영 효율화로 관리 부담 완화 가능성이 있습니다.')
  }

  return {
    grade,
    metrics: {
      totalCost,
      totalRevenue,
      profit,
      laborRatio,
      unresolvedComplaints,
      repeatComplaints,
      activeFacilityCount,
      staffCount,
      totalUnits,
    },
    laborCostAnalysis,
    costAnalysis,
    revenueAnalysis,
    complaintAnalysis,
    complaintTypeAnalysis,
    repeatComplaintRisk,
    facilityStaffAnalysis,
    operationOptimization,
    improvementAdvice: improvementAdviceParts.join(' '),
    automationReview,
    coreRisks,
    priorityTasks,
    expectedBenefits,
    summary,
    keyTakeaways,
  }
}
