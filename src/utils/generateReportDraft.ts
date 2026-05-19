import { CommunityData, ReportDraftOutput } from '../types/CommunityData'
import { analyzeCommunityData } from './analyzeCommunityData'
import { formatMoney, formatNumber } from './formatUtils'

export const generateReportDraft = (data: CommunityData): ReportDraftOutput => {
  const analysis = analyzeCommunityData(data)
  const generatedAt = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const activeFacilities = data.facilityInfo.items.filter(item => item.enabled)
  const facilitySummary = activeFacilities.length > 0
    ? activeFacilities.map(item => `- ${item.name}: ${item.operatingStatus}, ${item.paidType}, 주요 시간대 ${item.peakHours || '미입력'}`).join('\n')
    : '- 운영 중인 시설이 없습니다.'

  const missingItems: string[] = []
  if (!data.apartmentInfo.name) missingItems.push('단지명')
  if (!data.apartmentInfo.region) missingItems.push('지역')
  if (!data.operationInfo.weekdayHours) missingItems.push('평일 운영시간')
  if (!data.operationInfo.weekendHours) missingItems.push('주말 운영시간')
  if (!data.operationInfo.holidays) missingItems.push('휴무일')
  if (Object.values(data.costInfo).every(value => value === 0)) missingItems.push('비용 정보')
  if (Object.values(data.revenueInfo).every(value => value === 0)) missingItems.push('수익 정보')

  const needsInputNote = missingItems.length > 0
    ? `추가 입력 필요: ${missingItems.join(', ')}.`
    : ''

  const sectionList = [
    {
      title: '1. 단지 개요',
      body: [
        `단지명: ${data.apartmentInfo.name || '미입력'}`,
        `지역: ${data.apartmentInfo.region || '미입력'}`,
        `세대수: ${formatNumber(data.apartmentInfo.totalUnits || 0)}세대`,
        `동 수: ${formatNumber(data.apartmentInfo.buildingCount || 0)}동`,
        `준공연도: ${data.apartmentInfo.builtYear || '미입력'}`,
        `커뮤니티 면적: ${formatNumber(data.apartmentInfo.communityArea || 0)}㎡`,
        `관리사무소명: ${data.apartmentInfo.officeName || '미입력'}`,
      ],
    },
    {
      title: '2. 커뮤니티 시설 현황',
      body: [
        `활성 시설 수: ${analysis.metrics.activeFacilityCount}개`,
        facilitySummary,
      ],
    },
    {
      title: '3. 운영 현황',
      body: [
        `평일 운영시간: ${data.operationInfo.weekdayHours || '미입력'}`,
        `주말 운영시간: ${data.operationInfo.weekendHours || '미입력'}`,
        `휴무일: ${data.operationInfo.holidays || '미입력'}`,
        `현재 직원 수: ${data.operationInfo.staffCount || 0}명`,
        `오픈 담당 필요 여부: ${data.operationInfo.openStaffNeeded ? '예' : '아니오'}`,
        `마감 담당 필요 여부: ${data.operationInfo.closeStaffNeeded ? '예' : '아니오'}`,
        `무인 운영 가능 시간: ${data.operationInfo.unmannedHours || '미입력'}`,
      ],
    },
    {
      title: '4. 비용 및 수익 현황',
      body: [
        `총 운영비: ${formatMoney(analysis.metrics.totalCost)}`,
        `총 수익: ${formatMoney(analysis.metrics.totalRevenue)}`,
        `월 손익: ${formatMoney(analysis.metrics.profit)}`,
        `인건비 비중: ${analysis.metrics.laborRatio.toFixed(1)}%`,
      ],
    },
    {
      title: '5. 민원 현황',
      body: [
        `총 민원 수: ${data.complaints.length}건`,
        `미해결 민원 수: ${analysis.metrics.unresolvedComplaints}건`,
        `반복 민원 수: ${analysis.metrics.repeatComplaints}건`,
      ],
    },
    {
      title: '6. 주요 진단 결과',
      body: [
        `종합 진단 등급: ${analysis.grade}`,
        analysis.summary,
      ],
    },
    {
      title: '7. 개선 제안',
      body: [
        analysis.improvementAdvice,
        analysis.automationReview,
      ],
    },
    {
      title: '8. 입대의 보고용 요약',
      body: [
        analysis.summary,
        ...analysis.keyTakeaways.slice(0, 3),
      ],
    },
    {
      title: '9. MIK 검수 필요 항목',
      body: [
        analysis.metrics.laborRatio >= 60
          ? '- 인건비 비중이 높아 인력 배치 및 예산 검토가 필요합니다.'
          : '- 인건비 비중은 현재 적정 범위 내이나 지속 점검이 필요합니다.',
        analysis.metrics.profit < 0
          ? '- 월 손익 적자 구조로 비용 구조 및 수익 모델 재검토가 필요합니다.'
          : '- 수익 구조는 양호하나 추가 수익 창출 방안을 검토할 수 있습니다.',
        analysis.metrics.unresolvedComplaints >= 5
          ? '- 미해결 민원 다수가 존재하므로 민원 처리 체계를 강화해야 합니다.'
          : '- 민원 처리 현황을 주기적으로 모니터링하시기 바랍니다.',
      ],
    },
  ]

  const fullText = sectionList
    .map(section => `${section.title}\n${section.body.map(line => line).join('\n')}`)
    .join('\n\n')

  return {
    generatedAt,
    fullText,
    sections: sectionList,
    reviewItems: sectionList[8].body,
    needsInputNote,
  }
}
