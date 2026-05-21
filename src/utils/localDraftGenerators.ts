import {
  AgendaPredictorData,
  ContractGeneratorData,
  ContractReviewData,
  DocumentCenterData,
} from '../types/CommunityData'

export function generateDocumentDraft(data: DocumentCenterData): string {
  const header = `수신: ${data.receiver}\n발신: ${data.sender}\n제목: ${data.title}\n`
  const base = `\n1. 귀 단지의 무궁한 발전을 기원합니다.\n2. 당사는 ${data.apartmentName} 커뮤니티센터 운영과 관련하여 아래와 같이 보고/요청드립니다.\n\n가. 주요 내용\n- ${data.mainContent || '내용을 입력하세요.'}\n\n나. 요청사항\n- ${data.requestContent || '요청사항을 입력하세요.'}\n\n다. 첨부자료\n- ${data.attachmentName || '첨부자료를 입력하세요.'}\n\n위 사항을 검토하여 주시기 바랍니다.\n\n${data.date}\n${data.sender}\n담당자: ${data.manager}\n연락처: ${data.phone}`

  switch (data.documentType) {
    case '안내문':
      return `${header}\n${data.title} 안내드립니다.\n\n${data.mainContent}\n\n${data.requestContent}\n\n${data.attachmentName}\n\n${data.memo}\n\n${data.date}\n${data.sender}\n담당자: ${data.manager}\n연락처: ${data.phone}`
    case '운영보고서':
      return `${header}\n\n본 보고서는 ${data.apartmentName} 커뮤니티센터 운영 현황에 대한 내부 보고용 초안입니다.\n\n가. 주요 내용\n- ${data.mainContent}\n\n나. 향후 조치\n- ${data.requestContent}\n\n다. 첨부자료\n- ${data.attachmentName}\n\n비고\n- ${data.memo}\n\n${data.date}\n${data.sender}\n담당자: ${data.manager}\n연락처: ${data.phone}`
    case '정산요청서':
      return `${header}\n\n아래와 같이 정산을 요청드립니다.\n\n가. 주요 내용\n- ${data.mainContent}\n\n나. 요청사항\n- ${data.requestContent}\n\n다. 첨부자료\n- ${data.attachmentName}\n\n비고\n- ${data.memo}\n\n${data.date}\n${data.sender}\n담당자: ${data.manager}\n연락처: ${data.phone}`
    case '시설보수 요청서':
      return `${header}\n\n시설보수 관련 요청 사항을 아래와 같이 전달드립니다.\n\n가. 주요 내용\n- ${data.mainContent}\n\n나. 요청사항\n- ${data.requestContent}\n\n다. 첨부자료\n- ${data.attachmentName}\n\n비고\n- ${data.memo}\n\n${data.date}\n${data.sender}\n담당자: ${data.manager}\n연락처: ${data.phone}`
    case '공문':
    default:
      return `${header}${base}`
  }
}

export function generateContractDraft(data: ContractGeneratorData): string {
  const notice = '본 문서는 내부 검토용 초안입니다. 최종 계약 전 법률 검토가 필요합니다.\n\n'
  return `${notice}${data.contractTitle || data.contractType}\n\n제1조 목적\n본 계약은 ${data.partyA}와 ${data.partyB} 간의 ${data.contractType} 체결을 목적으로 합니다.\n\n제2조 계약기간\n계약기간은 ${data.startDate}부터 ${data.endDate}까지로 합니다.\n\n제3조 업무범위\n${data.workScope}\n\n제4조 계약금액 및 지급방법\n총 계약금액은 ${data.contractAmount}으로 하며, 지급 방식은 ${data.paymentMethod}으로 합니다.\n\n제5조 정산 및 세금계산서\n정산 방식은 ${data.settlementMethod}으로 하고, 관련 세금계산서는 관련 법령에 따라 발행합니다.\n\n제6조 자료제출 및 보고\n계약 당사자는 필요한 자료를 적시에 제출하고 정기적으로 보고합니다.\n\n제7조 책임범위\n당사자간 책임범위는 상호 협의에 따라 합리적으로 정합니다.\n\n제8조 계약해지\n계약해지 조건은 ${data.terminationCondition}으로 합니다.\n\n제9조 비밀유지\n당사자는 본 계약과 관련된 정보를 제3자에게 누설해서는 안 됩니다.\n\n제10조 특약사항\n${data.specialTerms}\n\n제11조 분쟁해결 및 관할법원\n본 계약과 관련한 분쟁은 ${data.jurisdiction}을 관할 법원으로 합니다.\n\n비고\n- ${data.memo}`
}

export function generateContractReviewResult(data: ContractReviewData): string {
  const text = data.contractText || ''
  if (!text.trim()) {
    return '검토할 계약서 텍스트를 입력하거나 .txt 파일을 업로드해주세요.'
  }

  const normalized = text.toLowerCase()
  const requiredItems = [
    '계약기간',
    '계약금액',
    '지급방법',
    '정산',
    '세금계산서',
    '계약해지',
    '위약금',
    '손해배상',
    '책임범위',
    '비밀유지',
    '개인정보',
    '관할법원',
    '특약사항',
  ]
  const cautionWords = [
    '일방적으로',
    '즉시 해지',
    '전액 배상',
    '무조건',
    '포괄적으로',
    '모든 책임',
    '위약벌',
    '반환하지 않는다',
    '사전 동의 없이',
    '독점',
  ]

  const confirmed = requiredItems.filter((item) => normalized.includes(item.toLowerCase()))
  const missing = requiredItems.filter((item) => !normalized.includes(item.toLowerCase()))
  const cautionFound = cautionWords.filter((item) => normalized.includes(item.toLowerCase()))

  const confirmedText = confirmed.length > 0 ? confirmed.map((item) => `- ${item}`).join('\n') : '- 확인된 조항이 없습니다.'
  const missingText = missing.length > 0 ? missing.map((item) => `- ${item}`).join('\n') : '- 누락 가능성이 낮습니다.'
  const cautionText = cautionFound.length > 0 ? cautionFound.map((item) => `- ${item}`).join('\n') : '- 특별히 주의할 표현은 발견되지 않았습니다.'

  return `[계약서 기본 검토 결과]\n\n1. 확인된 조항\n${confirmedText}\n\n2. 누락 가능성이 있는 조항\n${missingText}\n\n3. 주의가 필요한 표현\n${cautionText}\n\n4. 검토 의견\n- 본 계약서는 계약기간/계약금액/정산/해지/손해배상 관련 조항을 중심으로 추가 검토가 필요합니다.\n- 특히 책임범위와 계약해지 조건이 일방에게 과도하게 불리하지 않은지 확인이 필요합니다.\n\n본 검토는 자동화된 1차 점검이며, 법률 자문을 대체하지 않습니다.`
}

export function predictAgenda(data: AgendaPredictorData): string {
  const lowerText = data.sourceText.toLowerCase()
  const issues: string[] = []

  const mappings: Array<{ keys: string[]; label: string; issue: string }> = [
    {
      keys: ['소음', '민원', '불편', '항의'],
      label: '이용질서 및 민원 대응',
      issue: '이용질서 및 민원 대응 안건',
    },
    {
      keys: ['고장', '파손', '누수', '수리', '보수'],
      label: '시설 보수 및 유지관리',
      issue: '시설 보수 및 유지관리 안건',
    },
    {
      keys: ['청소', '위생', '냄새', '곰팡이'],
      label: '위생관리 및 청소용역 개선',
      issue: '위생관리 및 청소용역 개선 안건',
    },
    {
      keys: ['요금', '비용', '인상', '무료', '유료'],
      label: '이용요금 및 운영비',
      issue: '이용요금 및 운영비 안건',
    },
    {
      keys: ['강사', '트레이너', '직원', '근무', '인력'],
      label: '운영인력 및 근무체계',
      issue: '운영인력 및 근무체계 안건',
    },
    {
      keys: ['예약', '대기', '이용시간', '혼잡'],
      label: '이용시간 및 예약제 개선',
      issue: '이용시간 및 예약제 개선 안건',
    },
    {
      keys: ['안전', '사고', '부상', '미끄럼'],
      label: '안전관리 및 보험 검토',
      issue: '안전관리 및 보험 검토 안건',
    },
    {
      keys: ['외부인', '출입', '보안'],
      label: '출입관리 및 보안 강화',
      issue: '출입관리 및 보안 강화 안건',
    },
  ]

  mappings.forEach((item) => {
    if (item.keys.some((key) => lowerText.includes(key))) {
      issues.push(item.issue)
    }
  })

  if (issues.length === 0) {
    issues.push('일반 운영 현황 점검 및 개선 방안 논의')
  }

  const facilityText = data.relatedFacility || '관련 시설' 
  const issueText = issues.join(', ')
  const summaryType = data.sourceType || '기타'

  return `[입대의 예상 안건 검토]\n\n아파트명: ${data.apartmentName}\n관련 시설: ${facilityText}\n자료 유형: ${summaryType}\n민원 빈도: ${data.complaintFrequency}\n긴급도: ${data.urgency}\n\n1. 예상 안건\n- 안건명: ${issueText}\n- 발생 배경: ${data.sourceText || '입력된 자료를 기반으로 한 운영 이슈 분석'}\n- 검토 필요 사항: ${facilityText} 운영 현황과 민원/시설 이슈를 중심으로 검토가 필요합니다.\n- 예상 쟁점: ${summaryType} 자료에서 드러난 문제점과 개선 요구 사항이 핵심입니다.\n- 대응 방향: 관련 시설 집중 점검, 이용 규정 재정비, 민원 대응 체계 강화가 필요합니다.\n\n2. 관리주체 사전 준비자료\n- 민원 접수 내역\n- 시설 점검 사진\n- 견적서\n- 운영 현황표\n- 이용자 수 자료\n- 관련 계약서\n- 게시판 공지문 초안\n\n3. 입대의 보고용 요약\n- 본 안건은 ${facilityText} 운영 과정에서 발생한 ${issues[0]}에 관한 사항으로, 민원 예방 및 운영 안정화를 위해 사전 검토가 필요합니다.`
}
