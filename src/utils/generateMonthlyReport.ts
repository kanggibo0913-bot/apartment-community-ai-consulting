import { CommunityData, MonthlyReport } from '../types/CommunityData'
import { analyzeCommunityData } from './analyzeCommunityData'
import { formatMoney, formatNumber } from './formatUtils'

const formatCount = (value: number, label: string) =>
  value > 0 ? formatNumber(value) : `${label} 정보가 입력되지 않아 추가 확인이 필요합니다.`

export const generateMonthlyReport = (data: CommunityData): MonthlyReport => {
  const analysis = analyzeCommunityData(data)
  const generatedAt = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const sectionList = [
    {
      title: '1. 단지 개요',
      body: [
        `단지명: ${data.apartmentInfo.name || '미입력'}`,
        `지역: ${data.apartmentInfo.region || '미입력'}`,
        `세대수: ${formatCount(data.apartmentInfo.totalUnits, '세대수')}`,
        `동 수: ${formatCount(data.apartmentInfo.buildingCount, '동 수')}`,
        `평일 운영시간: ${data.operationInfo.weekdayHours || '미입력'}`,
        `주말 운영시간: ${data.operationInfo.weekendHours || '미입력'}`,
        `휴무일: ${data.operationInfo.holidays || '미입력'}`,
      ],
    },
    {
      title: '2. 시설 운영 현황',
      body: [
        `활성 시설 수: ${formatNumber(data.facilityInfo.items.filter(item => item.enabled).length)}개`,
        `운영 중인 주요 시설: ${data.facilityInfo.items.filter(item => item.enabled).map(item => item.name).join(', ') || '정보 없음'}`,
      ],
    },
    {
      title: '3. 비용 및 수익 현황',
      body: [
        `월 운영비: ${formatMoney(analysis.metrics.totalCost)}`,
        `월 수익: ${formatMoney(analysis.metrics.totalRevenue)}`,
        `월 손익: ${formatMoney(analysis.metrics.profit)} (${analysis.metrics.profit >= 0 ? '흑자' : '적자'})`,
        `인건비 비중: ${analysis.metrics.laborRatio.toFixed(1)}%`,
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
      body: [
        analysis.metrics.laborRatio >= 60
          ? '인건비 비중이 높아 재무 리스크가 존재합니다.'
          : '인건비 비중은 관리 범위 내이나 지속적 점검이 필요합니다.',
        analysis.metrics.profit < 0
          ? '월 손익 적자로 인해 수익성 개선이 필요합니다.'
          : '월 손익은 양호하지만 추가 수익모델 검토가 바람직합니다.',
        analysis.metrics.unresolvedComplaints >= 3
          ? '미처리 민원 누적으로 입주민 만족도가 저하될 우려가 있습니다.'
          : '민원 처리 상태는 비교적 안정적입니다.',
      ],
    },
    {
      title: '7. 개선 과제',
      body: [
        '인건비 효율화와 에너지 비용 절감 방안을 우선 검토하십시오.',
        '민원 대응 체계 강화와 반복 민원 감소 방안을 마련하십시오.',
        '시설별 유지보수 계획을 재검토하여 운영 리스크를 낮추십시오.',
      ],
    },
    {
      title: '8. MIK 검수 필요 항목',
      body: [
        '재무 데이터의 정확성을 확인하십시오.',
        '인건비 비중과 월 손익 구조의 타당성을 검토하십시오.',
        '민원 처리 현황과 서비스 만족도 개선 방안을 점검하십시오.',
      ],
    },
  ]

  const fullText = sectionList.map(section => `${section.title}
${section.body.join('\n')}`).join('\n\n')

  return {
    generatedAt,
    fullText,
    sections: sectionList,
    reviewItems: sectionList[7].body,
  }
}
