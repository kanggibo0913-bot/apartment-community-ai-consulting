import { CommunityData, ReportDraftOutput } from '../types/CommunityData'
import { analyzeCommunityData } from './analyzeCommunityData'
import { formatMoney, formatNumber } from './formatUtils'

const summarizeFacilities = (items: CommunityData['facilityInfo']['items']) => {
  const activeItems = items.filter(item => item.enabled)
  return activeItems.length > 0 ? activeItems.map(item => item.name).join(', ') : '운영 중인 시설 정보가 부족합니다.'
}

export const generateMikChecklist = (data: CommunityData): ReportDraftOutput => {
  const analysis = analyzeCommunityData(data)
  const generatedAt = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const facilitySummary = summarizeFacilities(data.facilityInfo.items)

  const sections = [
    {
      title: '1. MIK 내부 검토 개요',
      body: [
        '본 검수표는 MIK 내부 검수를 위한 핵심 리스크, 비용/수익, 민원 및 자동화 항목을 점검합니다.',
        `작성일: ${generatedAt}`,
      ],
    },
    {
      title: '2. 단지 및 시설 현황',
      body: [
        `단지명: ${data.apartmentInfo.name || '미입력'}`,
        `활성 시설 수: ${formatNumber(data.facilityInfo.items.filter(item => item.enabled).length)}개`,
        `운영 중인 주요 시설: ${facilitySummary}`,
      ],
    },
    {
      title: '3. 비용/수익 분석',
      body: [
        `총 운영비: ${formatMoney(analysis.metrics.totalCost)}`,
        `총 수익: ${formatMoney(analysis.metrics.totalRevenue)}`,
        `월 손익: ${formatMoney(analysis.metrics.profit)} (${analysis.metrics.profit >= 0 ? '흑자' : '적자'})`,
        `인건비 비중: ${analysis.metrics.laborRatio.toFixed(1)}%`,
      ],
    },
    {
      title: '4. 민원 및 서비스 리스크',
      body: [
        `총 민원 수: ${data.complaints.length}건`,
        `미처리 민원: ${analysis.metrics.unresolvedComplaints}건`,
        `반복 민원: ${analysis.metrics.repeatComplaints}건`,
      ],
    },
    {
      title: '5. 자동화 및 운영 검토',
      body: [
        `오픈 담당 필요: ${data.operationInfo.openStaffNeeded ? '예' : '아니오'}`,
        `마감 담당 필요: ${data.operationInfo.closeStaffNeeded ? '예' : '아니오'}`,
        `무인 운영 가능 시간: ${data.operationInfo.unmannedHours || '미입력'}`,
        analysis.automationReview,
      ],
    },
    {
      title: '6. 주요 검수 항목',
      body: [
        '재무 데이터의 정확성 및 입력 값 타당성 확인',
        '인건비 비중과 손익 구조의 적정성 검토',
        '민원 처리 체계와 반복 민원 원인 검토',
        '무인 운영 및 자동화 가능성 검토',
      ],
    },
    {
      title: '7. MIK 검수 요약',
      body: [
        '비용과 손익 구조의 적정성은 필수 검토 항목입니다.',
        '민원 대응 체계와 운영 인력 배치의 타당성을 확인하십시오.',
        '자동화 도입 계획은 운영 효율성 관점에서 재검토하십시오.',
      ],
    },
  ]

  const fullText = sections.map(section => `${section.title}\n${section.body.join('\n')}`).join('\n\n')

  return {
    generatedAt,
    fullText,
    sections,
    reviewItems: sections[5].body,
    needsInputNote: '',
  }
}
