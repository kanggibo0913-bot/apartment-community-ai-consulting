import { CommunityData, ProposalDraft } from '../types/CommunityData'
import { analyzeCommunityData } from './analyzeCommunityData'
import { formatMoney, formatNumber } from './formatUtils'

export const generateProposalDraft = (data: CommunityData): ProposalDraft => {
  const analysis = analyzeCommunityData(data)
  const generatedAt = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const totalUnits = data.apartmentInfo.totalUnits
  const hasUnits = totalUnits > 0
  const facilitySummary = data.facilityInfo.items
    .filter(item => item.enabled)
    .map(item => item.name)
    .join(', ') || '운영 중인 시설 정보가 부족합니다.'

  const sections = [
    {
      title: '1. 제안 개요',
      body: [
        '본 제안서는 커뮤니티 운영 효율화와 관리 투명성 강화를 위한 초안입니다.',
        '입대의 보고용으로 현재 운영 현황과 개선 방안을 간결하게 정리합니다.',
      ],
    },
    {
      title: '2. 현재 커뮤니티 운영 현황',
      body: [
        `단지명: ${data.apartmentInfo.name || '미입력'}`,
        `세대수: ${hasUnits ? formatNumber(totalUnits) + '세대' : '세대수 정보가 입력되지 않아 단지 규모 판단은 제한적입니다.'}`,
        `주요 시설: ${facilitySummary}`,
        `운영시간: ${data.operationInfo.weekdayHours || '미입력'} / ${data.operationInfo.weekendHours || '미입력'}`,
      ],
    },
    {
      title: '3. 주요 문제점',
      body: [
        analysis.metrics.laborRatio >= 60
          ? '인건비 비중이 높아 비용 효율성이 낮아질 가능성이 있습니다.'
          : '현재 인건비 수준은 관리 가능한 범위이나 추가 효율화 검토가 필요합니다.',
        analysis.metrics.profit < 0
          ? '월 손익이 적자여서 수익성 개선이 필요합니다.'
          : '수익 구조는 양호하나 추가 수익원 확보가 좋습니다.',
        data.complaints.length > 0
          ? '민원 유형과 반복 민원을 통해 입주민 만족도 이슈를 확인할 수 있습니다.'
          : '민원 데이터가 부족하여 만족도 분석은 제한적입니다.',
      ],
    },
    {
      title: '4. 운영비 및 인건비 진단',
      body: [
        `인건비: ${formatMoney(data.costInfo.salaries)} (전체 비용 대비 ${analysis.metrics.laborRatio.toFixed(1)}%)`,
        `전기세 및 냉난방비: ${formatMoney(data.costInfo.electricity + data.costInfo.hvac)}원`,
        '현 수준의 인건비 및 에너지 비용은 추가 절감 여지를 검토해야 합니다.',
      ],
    },
    {
      title: '5. 수익성 진단',
      body: [
        `총 수익: ${formatMoney(analysis.metrics.totalRevenue)}`,
        `월 손익: ${formatMoney(analysis.metrics.profit)}`,
        analysis.metrics.profit < 0
          ? '현재 수익 구조는 적자 상태로 개선 방안을 제안합니다.'
          : '현재 수익 구조는 안정적이나 추가 수익원 확보가 필요합니다.',
      ],
    },
    {
      title: '6. 민원 및 입주민 만족도 이슈',
      body: [
        `미해결 민원: ${analysis.metrics.unresolvedComplaints}건`,
        `반복 민원: ${analysis.metrics.repeatComplaints}건`,
        '민원 처리 속도와 이슈 해결 체계가 만족도 개선의 주요 요소입니다.',
      ],
    },
    {
      title: '7. 운영 개선 방향',
      body: [
        '운영시간과 인력 배치를 재조정하여 관리 효율을 높입니다.',
        '무인 운영 가능 구간을 활용해 운영 부담을 완화합니다.',
        '시설별 유지보수 계획을 명확히 하여 운영 리스크를 줄입니다.',
      ],
    },
    {
      title: '8. 비용 절감 제안',
      body: [
        '인건비 중심 운영 효율화를 검토하십시오.',
        '에너지 사용 패턴을 점검하여 전기 및 냉난방비 절감 방안을 마련하십시오.',
      ],
    },
    {
      title: '9. 수익 개선 제안',
      body: [
        '기존 수익원별 이용률을 분석하여 수익성을 높일 수 있는 프로그램을 검토하십시오.',
        '카페, PT, 골프레슨 등 유료 서비스의 운영 조건을 재검토하십시오.',
      ],
    },
    {
      title: '10. 무인 운영 및 자동화 검토',
      body: [
        data.operationInfo.unmannedHours
          ? `무인 운영 가능 시간: ${data.operationInfo.unmannedHours}`
          : '무인 운영 관련 정보가 부족하여 검토가 필요합니다.',
        '무인 운영 도입은 인력 부담 완화와 관리 투명성 향상에 기여할 수 있습니다.',
      ],
    },
    {
      title: '11. MIK 검수 의견',
      body: [
        '제안 내용의 사실 여부를 데이터 기반으로 검토하십시오.',
        '운영규약과 계약 조건을 확인하십시오.',
        '제안 실행 가능성을 추가로 확인하십시오.',
      ],
    },
    {
      title: '12. 기대효과',
      body: [
        '비용 절감 가능성과 운영 효율화 효과를 기대할 수 있습니다.',
        '관리 투명성 및 입주민 만족도 개선 여지가 있습니다.',
      ],
    },
    {
      title: '13. 후속 검토 필요사항',
      body: [
        '데이터 정확성 확인 및 운영 현황 추가 검증이 필요합니다.',
        '우선 순위 개선 과제를 선정하여 실행 계획을 수립하십시오.',
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
