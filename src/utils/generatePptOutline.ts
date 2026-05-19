import { CommunityData, PptOutline } from '../types/CommunityData'
import { analyzeCommunityData } from './analyzeCommunityData'
import { formatMoney, formatNumber } from './formatUtils'

export const generatePptOutline = (data: CommunityData): PptOutline => {
  const analysis = analyzeCommunityData(data)
  const generatedAt = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const enabledFacilities = data.facilityInfo.items.filter(item => item.enabled)
  const facilityNames = enabledFacilities.length > 0 ? enabledFacilities.map(item => item.name).join(', ') : '주요 시설 정보 미입력'

  const slides = [
    {
      slideNumber: 1,
      title: '표지',
      keyMessage: '아파트 커뮤니티 운영 진단 및 제안서 초안',
      bulletPoints: [
        `단지명: ${data.apartmentInfo.name || '미입력'}`,
        `작성일: ${generatedAt}`,
        'MIK 검수 전 초안',
      ],
      visualSuggestion: '단지 로고 또는 커뮤니티 시설 사진 배경',
      speakerNote: '본 자료는 초기 진단 초안으로, MIK 검수 후 최종 보고서로 정리될 예정입니다.',
    },
    {
      slideNumber: 2,
      title: '프로젝트 개요',
      keyMessage: '커뮤니티 운영 진단 목적과 주요 검토 항목을 명확히 전달합니다.',
      bulletPoints: [
        '커뮤니티 운영 효율성 및 비용 구조 검토',
        '현황 데이터 기반 운영 진단',
        '민원, 수익성, 인건비 중심 검토',
      ],
      visualSuggestion: '진단 프로세스 흐름도',
      speakerNote: '프로젝트 목표와 검토 범위를 간결하게 소개합니다.',
    },
    {
      slideNumber: 3,
      title: '단지 및 시설 현황',
      keyMessage: '단지 규모와 운영 시설 현황을 간결하게 전달합니다.',
      bulletPoints: [
        `세대수: ${data.apartmentInfo.totalUnits > 0 ? formatNumber(data.apartmentInfo.totalUnits) + '세대' : '미입력'}`,
        `주요 시설: ${facilityNames}`,
        `운영시간: ${data.operationInfo.weekdayHours || '미입력'} / ${data.operationInfo.weekendHours || '미입력'}`,
        `직원 수: ${data.operationInfo.staffCount > 0 ? formatNumber(data.operationInfo.staffCount) + '명' : '미입력'}`,
      ],
      visualSuggestion: '단지 현황 인포그래픽',
      speakerNote: '단지 현황을 빠르게 이해할 수 있도록 요약합니다.',
    },
    {
      slideNumber: 4,
      title: '비용 현황',
      keyMessage: '총 운영비와 주요 비용 항목을 집중 분석합니다.',
      bulletPoints: [
        `총 운영비: ${formatMoney(analysis.metrics.totalCost)}`,
        `인건비 비중: ${analysis.metrics.laborRatio.toFixed(1)}%`,
        '전기세, 냉난방비, 유지보수비 중심 검토',
        analysis.metrics.laborRatio >= 60 ? '인건비 비중 리스크 존재' : '인건비 비중 정상 범위',
      ],
      visualSuggestion: '비용 구성 비율 그래프',
      speakerNote: '비용 현황과 리스크 포인트를 명확히 합니다.',
    },
    {
      slideNumber: 5,
      title: '수익 현황',
      keyMessage: '수익 구조와 월 손익을 함께 검토합니다.',
      bulletPoints: [
        `총 수익: ${formatMoney(analysis.metrics.totalRevenue)}`,
        `월 손익: ${formatMoney(analysis.metrics.profit)}`,
        '주요 수익원: 이용료, PT, 카페 등',
        analysis.metrics.profit < 0 ? '수익성 개선 필요' : '수익 구조는 안정적이나 개선 여지 있음',
      ],
      visualSuggestion: '수익 항목 비교 차트',
      speakerNote: '수익 현황을 쉽게 파악할 수 있도록 풀이합니다.',
    },
    {
      slideNumber: 6,
      title: '민원 현황',
      keyMessage: '민원 유형과 처리 현황을 중심으로 분석합니다.',
      bulletPoints: [
        `민원 유형: ${data.complaints.length > 0 ? Array.from(new Set(data.complaints.map(item => item.type))).join(', ') : '미입력'}`,
        `미해결 민원: ${analysis.metrics.unresolvedComplaints}건`,
        `반복 민원: ${analysis.metrics.repeatComplaints}건`,
        '우선 조치 필요사항을 도출합니다.',
      ],
      visualSuggestion: '민원 유형 분포 차트',
      speakerNote: '민원 현황과 시급한 해결 과제를 설명합니다.',
    },
    {
      slideNumber: 7,
      title: 'AI 운영 진단 결과',
      keyMessage: `종합 진단 등급은 ${analysis.grade}입니다. 주요 리스크를 제시합니다.`,
      bulletPoints: [
        analysis.coreRisks[0] || '주요 리스크 정보 미입력',
        analysis.coreRisks[1] || '추가 리스크 정보 없음',
        analysis.keyTakeaways.slice(0, 2).join(', '),
      ],
      visualSuggestion: '진단 등급 및 리스크 요약 카드',
      speakerNote: 'AI 분석 결과를 중심으로 요약합니다.',
    },
    {
      slideNumber: 8,
      title: '운영 개선 제안',
      keyMessage: '운영 개선 방향을 구체적으로 제안합니다.',
      bulletPoints: [
        '운영시간 개선 및 인력 배치 최적화',
        '무인 운영 및 자동화 가능 구간 검토',
        '시설 유지보수 계획 명확화',
      ],
      visualSuggestion: '개선 제안 리스트',
      speakerNote: '실행 가능한 개선 방향을 제안합니다.',
    },
    {
      slideNumber: 9,
      title: '기대효과',
      keyMessage: '개선 후 기대효과를 명확하게 제시합니다.',
      bulletPoints: [
        '비용 절감 가능성',
        '운영 투명성 향상',
        '민원 대응 체계화',
        '입주민 만족도 개선 가능성',
      ],
      visualSuggestion: '기대효과 인포그래픽',
      speakerNote: '투자 대비 효과를 간결하게 설명합니다.',
    },
    {
      slideNumber: 10,
      title: '후속 검토 및 MIK 검수 항목',
      keyMessage: '검수 필요 항목과 후속 확인 사항을 제시합니다.',
      bulletPoints: [
        '입력 데이터 사실 여부 확인',
        '관리규약 확인',
        '계약 조건 확인',
        '실제 비용 절감 가능성 추가 검토',
        '최종 제안자료화 필요',
      ],
      visualSuggestion: '검수 체크리스트',
      speakerNote: '최종 검수와 후속 절차를 안내합니다.',
    },
  ]

  const fullText = slides
    .map(
      slide =>
        `슬라이드 ${slide.slideNumber}: ${slide.title}\n${slide.keyMessage}\n${slide.bulletPoints.join('\n')}\n시각화 제안: ${slide.visualSuggestion}\n메모: ${slide.speakerNote}`
    )
    .join('\n\n')

  return {
    generatedAt,
    fullText,
    slides,
  }
}
