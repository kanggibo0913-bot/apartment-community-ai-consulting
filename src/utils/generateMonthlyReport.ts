import { CommunityData, MonthlyReport } from '../types/CommunityData'
import { analyzeCommunityData } from './analyzeCommunityData'
import { formatMoney, formatNumber } from './formatUtils'

const formatValue = (value: number, label: string) =>
  value > 0 ? `${formatMoney(value)}` : `${label} 정보가 부족하여 운영비 적정성 판단은 제한적입니다.`

const formatCount = (value: number, label: string) =>
  value > 0 ? `${formatNumber(value)}` : `${label} 정보가 입력되지 않아 추가 확인이 필요합니다.`

export const generateMonthlyReport = (data: CommunityData): MonthlyReport => {
  const analysis = analyzeCommunityData(data)
  const generatedAt = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const hasCost = Object.values(data.costInfo).some(value => value > 0)
  const hasRevenue = Object.values(data.revenueInfo).some(value => value > 0)
  const hasComplaints = data.complaints.length > 0
  const hasFacilities = data.facilityInfo.items.some(item => item.enabled)

  const sections = [
    {
      title: '1. 월간 운영 개요',
      body: [
        `단지명: ${data.apartmentInfo.name || '미입력'}`,
        `지역: ${data.apartmentInfo.region || '미입력'}`,
        `세대수: ${formatCount(data.apartmentInfo.totalUnits, '세대수')}`,
        `동 수: ${formatCount(data.apartmentInfo.buildingCount, '동 수')}`,
        `평일 운영시간: ${data.operationInfo.weekdayHours || '미입력'}`,
        `주말 운영시간: ${data.operationInfo.weekendHours || '미입력'}`,
        `무인 운영 가능 시간: ${data.operationInfo.unmannedHours || '미입력'}`,
      ],
    },
    {
      title: '2. 주요 운영 지표',
      body: [
        `총 운영비: ${hasCost ? formatMoney(analysis.metrics.totalCost) : '비용 정보가 부족하여 지표 산출이 제한적입니다.'}`,
        `총 수익: ${hasRevenue ? formatMoney(analysis.metrics.totalRevenue) : '수익 정보가 부족하여 지표 산출이 제한적입니다.'}`,
        `월 손익: ${hasCost || hasRevenue ? formatMoney(analysis.metrics.profit) : '주요 재무 지표 산출이 제한적입니다.'}`,
        `인건비 비중: ${analysis.metrics.laborRatio.toFixed(1)}%`,
        `미해결 민원: ${formatCount(analysis.metrics.unresolvedComplaints, '미해결 민원')}`,
      ],
    },
    {
      title: '3. 비용 현황',
      body: [
        `인건비: ${formatValue(data.costInfo.salaries, '인건비')}`,
        `전기세: ${formatValue(data.costInfo.electricity, '전기세')}`,
        `수도세: ${formatValue(data.costInfo.water, '수도세')}`,
        `냉난방비: ${formatValue(data.costInfo.hvac, '냉난방비')}`,
        `유지보수비 + 청소비 + 소모품비: ${formatValue(data.costInfo.maintenance + data.costInfo.cleaning + data.costInfo.supplies, '시설 운영비')}`,
      ],
    },
    {
      title: '4. 수익 현황',
      body: [
        `이용료: ${formatValue(data.revenueInfo.usageFee, '이용료')}`,
        `PT: ${formatValue(data.revenueInfo.ptFee, 'PT')}`,
        `GX: ${formatValue(data.revenueInfo.gxFee, 'GX')}`,
        `골프레슨: ${formatValue(data.revenueInfo.golfLesson, '골프레슨')}`,
        `카페 매출: ${formatValue(data.revenueInfo.cafeSales, '카페 매출')}`,
      ],
    },
    {
      title: '5. 월 손익 현황',
      body: [
        `${hasCost || hasRevenue ? `월 손익은 ${formatMoney(analysis.metrics.profit)}로 ${analysis.metrics.profit >= 0 ? '흑자' : '적자'}입니다.` : '월 손익 판단을 위한 재무 데이터가 제한적입니다.'}`,
        `${analysis.metrics.profit >= 0 ? '현재 수익 흐름은 유지 가능하지만 추가 개선 여지가 있습니다.' : '적자 구조가 확인되어 비용 감소 및 수익 증대 방안 검토가 필요합니다.'}`,
      ],
    },
    {
      title: '6. 민원 접수 및 처리 현황',
      body: [
        `총 민원 접수 수: ${formatCount(data.complaints.length, '민원 접수 수')}`,
        `미해결 민원 수: ${analysis.metrics.unresolvedComplaints}건`,
        `반복 민원 수: ${analysis.metrics.repeatComplaints}건`,
        hasComplaints
          ? '민원 데이터는 접수 유형과 상태를 기반으로 추가 확인이 필요합니다.'
          : '민원 데이터가 부족하여 민원 패턴 분석은 추가 확인이 필요합니다.',
      ],
    },
    {
      title: '7. 시설 운영 및 유지보수 현황',
      body: [
        hasFacilities
          ? `활성 시설 수는 ${formatNumber(data.facilityInfo.items.filter(item => item.enabled).length)}개입니다.`
          : '운영 중인 시설 데이터가 부족하여 시설 현황 판단은 제한적입니다.',
        `직원 수: ${formatCount(data.operationInfo.staffCount, '직원 수')}`,
        `휴무일: ${data.operationInfo.holidays || '미입력'}`,
      ],
    },
    {
      title: '8. 에너지/비용 절감 검토',
      body: [
        data.costInfo.electricity > 0
          ? `전기세가 ${formatMoney(data.costInfo.electricity)}로 확인되어 에너지 절감 방안 검토가 필요합니다.`
          : '전기세 정보가 부족하여 에너지 절감 판단은 제한적입니다.',
        data.costInfo.hvac > 0
          ? `냉난방비가 ${formatMoney(data.costInfo.hvac)}로 확인되어 효율 운영 검토가 필요합니다.`
          : '냉난방비 정보가 부족하여 냉난방 효율 판단은 제한적입니다.',
      ],
    },
    {
      title: '9. 주요 리스크',
      body: [
        analysis.metrics.laborRatio >= 60
          ? '인건비 비중이 높아 비용 구조 리스크가 존재합니다.'
          : '인건비 비중은 관리 범위 내이나 지속 점검이 필요합니다.',
        analysis.metrics.profit < 0
          ? '월 손익이 적자여서 재무 안정성 확보가 필요한 상황입니다.'
          : '월 손익은 양호하나 추가 수익 구조 개선 여지가 있습니다.',
        analysis.metrics.unresolvedComplaints >= 3
          ? '미해결 민원이 누적되어 서비스 신뢰도 저하 우려가 있습니다.'
          : '민원 처리 상황은 비교적 안정적입니다.',
      ],
    },
    {
      title: '10. 다음 달 개선 과제',
      body: [
        '인건비 비중과 에너지 비용 절감 방안을 우선 검토하십시오.',
        '민원 처리 프로세스를 점검하여 반복 민원 발생을 줄이십시오.',
        '시설별 운영 상태를 확인하고 유지보수 계획을 명확히 하십시오.',
      ],
    },
    {
      title: '11. MIK 검수 필요 항목',
      body: [
        '입력 데이터의 사실 여부를 확인하십시오.',
        '관리규약과 계약 조건을 검토하십시오.',
        '실제 비용 절감 가능성을 추가 확인하십시오.',
      ],
    },
  ]

  const fullText = sections.map(section => `${section.title}\n${section.body.join('\n')}`).join('\n\n')

  return {
    generatedAt,
    fullText,
    sections,
    reviewItems: sections[10].body,
  }
}
