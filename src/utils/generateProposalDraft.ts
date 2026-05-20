import { CommunityData, ProposalDraft } from '../types/CommunityData'
import { analyzeCommunityData } from './analyzeCommunityData'
import { formatMoney, formatNumber } from './formatUtils'

const summarizeFacilities = (items: CommunityData['facilityInfo']['items']) => {
  const activeItems = items.filter(item => item.enabled)
  return activeItems.length > 0 ? activeItems.map(item => item.name).join(', ') : '운영 중인 시설 정보가 부족합니다.'
}

export const generateProposalDraft = (data: CommunityData): ProposalDraft => {
  const analysis = analyzeCommunityData(data)
  const generatedAt = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const facilitySummary = summarizeFacilities(data.facilityInfo.items)
  const totalUnitsText = data.apartmentInfo.totalUnits > 0 ? `${formatNumber(data.apartmentInfo.totalUnits)}세대` : '세대수 정보 미입력'

  const sections = [
    {
      title: '1. 입대의 보고용 요약',
      body: [
        '본 문서는 입주자대표회의 제출용으로 커뮤니티 운영 현황, 비용·수익 진단, 민원 상황, 개선 제안을 간결하게 정리합니다.',
        `작성일: ${generatedAt}`,
      ],
    },
    {
      title: '2. 단지 및 운영 개요',
      body: [
        `단지명: ${data.apartmentInfo.name || '미입력'}`,
        `세대수: ${totalUnitsText}`,
        `지역: ${data.apartmentInfo.region || '미입력'}`,
        `주요 시설: ${facilitySummary}`,
        `운영시간: ${data.operationInfo.weekdayHours || '미입력'} / ${data.operationInfo.weekendHours || '미입력'}`,
      ],
    },
    {
      title: '3. 비용 및 수익 진단',
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
          ? '높은 인건비 비중으로 인한 재무 압박이 존재합니다.'
          : '인건비 비중은 비교적 안정적이나 추가 관리는 필요합니다.',
        analysis.metrics.profit < 0
          ? '월 손익 적자 상황으로 비용 절감 및 수익 증대 전략이 필요합니다.'
          : '수익 구조는 양호하나 지속적인 개선이 필요합니다.',
        analysis.metrics.unresolvedComplaints >= 3
          ? '미처리 민원 누적으로 서비스 만족도 저하 우려가 있습니다.'
          : '민원 상황은 비교적 안정적입니다.',
      ],
    },
    {
      title: '7. 개선 제안',
      body: [
        '운영 시간과 인력 배치를 재조정하여 관리 효율을 높입니다.',
        '무인 운영 가능 시간을 활용해 인력 부담을 완화합니다.',
        '시설별 유지보수 계획을 명확히 하여 리스크를 줄입니다.',
      ],
    },
    {
      title: '8. 실행 검토 요청 사항',
      body: [
        '인건비 비중과 월 손익 구조의 타당성을 우선 검토하십시오.',
        '민원 처리체계와 반복 민원 대응 계획을 확인하십시오.',
        '에너지 비용 절감 및 수익 개선 방안을 추가로 검토하십시오.',
      ],
    },
    {
      title: '9. MIK 검수 필요 항목',
      body: [
        '제안 내용의 사실 여부를 데이터 기반으로 검토하십시오.',
        '관리규약과 계약 조건을 확인하십시오.',
        '제안 실행 가능성을 추가로 평가하십시오.',
      ],
    },
  ]

  const fullText = sections.map(section => `${section.title}\n${section.body.join('\n')}`).join('\n\n')

  return {
    generatedAt,
    fullText,
    sections,
    reviewItems: sections[8].body,
  }
}
