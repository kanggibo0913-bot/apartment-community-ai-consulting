import { CommunityData, ReportDraftOutput } from '../types/CommunityData'
import { analyzeCommunityData } from './analyzeCommunityData'
import { formatMoney, formatNumber } from './formatUtils'

const summarizeFacilities = (items: CommunityData['facilityInfo']['items']) => {
  const activeItems = items.filter(item => item.enabled)
  if (activeItems.length === 0) return '활성 시설이 없습니다.'
  return activeItems.map(item => `${item.name}(${item.operatingStatus}, ${item.paidType})`).join(', ')
}

export const generateReportDraft = (data: CommunityData): ReportDraftOutput => {
  const analysis = analyzeCommunityData(data)
  const generatedAt = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const facilitySummary = summarizeFacilities(data.facilityInfo.items)
  const totalUnitsText = data.apartmentInfo.totalUnits > 0 ? `${formatNumber(data.apartmentInfo.totalUnits)}세대` : '미입력'
  const totalCostText = formatMoney(analysis.metrics.totalCost)
  const totalRevenueText = formatMoney(analysis.metrics.totalRevenue)
  const profitText = `${formatMoney(analysis.metrics.profit)} (${analysis.metrics.profit >= 0 ? '흑자' : '적자'})`
  const laborRatioText = `${analysis.metrics.laborRatio.toFixed(1)}%`

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
        `세대수: ${totalUnitsText}`,
        `동 수: ${data.apartmentInfo.buildingCount > 0 ? `${formatNumber(data.apartmentInfo.buildingCount)}동` : '미입력'}`,
        `준공연도: ${data.apartmentInfo.builtYear || '미입력'}`,
        `커뮤니티 면적: ${data.apartmentInfo.communityArea > 0 ? `${formatNumber(data.apartmentInfo.communityArea)}㎡` : '미입력'}`,
        `관리사무소명: ${data.apartmentInfo.officeName || '미입력'}`,
      ],
    },
    {
      title: '2. 시설 운영 현황',
      body: [
        `활성 시설 수: ${analysis.metrics.activeFacilityCount}개`,
        `운영 중인 주요 시설: ${facilitySummary}`,
      ],
    },
    {
      title: '3. 비용 및 수익 현황',
      body: [
        `월 운영비: ${totalCostText}`,
        `월 수익: ${totalRevenueText}`,
        `월 손익: ${profitText}`,
        `인건비 비중: ${laborRatioText}`,
      ],
    },
    {
      title: '4. 민원 현황',
      body: [
        `총 민원 수: ${data.complaints.length}건`,
        `미처리 민원 수: ${analysis.metrics.unresolvedComplaints}건`,
        `반복 민원 수: ${analysis.metrics.repeatComplaints}건`,
      ],
    },
    {
      title: '5. AI 진단 결과',
      body: [
        `진단 등급: ${analysis.grade}`,
        analysis.summary,
        analysis.automationReview,
      ],
    },
    {
      title: '6. 주요 리스크',
      body: analysis.coreRisks.length > 0 ? analysis.coreRisks : ['현재 주요 리스크는 제한적입니다.'],
    },
    {
      title: '7. 개선 제안',
      body: analysis.priorityTasks.length > 0 ? analysis.priorityTasks : ['운영 데이터를 주기적으로 점검하십시오.'],
    },
    {
      title: '8. MIK 검수 필요 항목',
      body: [
        analysis.metrics.laborRatio >= 60
          ? '인건비 비중이 높아 예산과 인력 배치를 재검토해야 합니다.'
          : '인건비 구조는 현재 비교적 안정적입니다.',
        analysis.metrics.profit < 0
          ? '월 손익 적자로 인해 비용 구조 및 수익 모델을 검토해야 합니다.'
          : '월 손익은 현재 안정적이나 지속적인 개선 여지가 있습니다.',
        analysis.metrics.unresolvedComplaints >= 5
          ? '미처리 민원이 5건 이상 발생하여 민원 대응 체계를 강화해야 합니다.'
          : '민원 처리 현황을 지속 점검하십시오.',
      ],
    },
  ]

  const fullText = sectionList
    .map(section => `${section.title}\n${section.body.join('\n')}`)
    .join('\n\n')

  return {
    generatedAt,
    fullText,
    sections: sectionList,
    reviewItems: sectionList[7].body,
    needsInputNote,
  }
}
