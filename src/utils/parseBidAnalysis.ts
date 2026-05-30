// 공고문 AI 분석 결과(JSON) 파싱 + 보조 유틸. 파싱 실패 시 null을 반환해 텍스트 폴백을 유도한다.

export interface BidAnalysisParsed {
  summary: string
  complexName: string
  region: string
  bidMethod: string
  siteBriefingDate: string
  bidDeadline: string
  contractPeriod: string
  // 사업설명회/PT 발표 일정(공고문 내 명확한 날짜가 있을 때만 채워짐).
  // 동의어: 사업설명회/제안설명회/제안서 발표/PT 발표/프레젠테이션/업체 발표/기술제안 발표 등.
  businessPresentationDate: string
  businessPresentationTime: string
  businessPresentationLocation: string
  requiredDocuments: string[]
  specialConditions: string[]
  risks: string[]
  estimateNotes: string[]
  siteBriefingQuestions: string[]
  participationGrade: string
  participationReason: string
  recommendedAction: string
}

export type RiskCategory =
  | '일정 리스크'
  | '자격요건 리스크'
  | '산출금액 리스크'
  | '계약조건 리스크'
  | '인력운영 리스크'
  | '장비투자 리스크'
  | '법무/컴플라이언스 리스크'
  | '기타 리스크'

const asString = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

const asStringArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(asString).filter((s) => s.trim().length > 0)
  const s = asString(v).trim()
  return s ? [s] : []
}

// AI가 코드펜스나 부가 텍스트를 섞어 보내도 JSON 객체만 안전하게 추출한다.
export function parseBidAnalysis(text: string): BidAnalysisParsed | null {
  if (!text || !text.trim()) return null

  let candidate = text.trim()
  // ```json ... ``` 펜스 제거
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidate = fence[1].trim()

  // 첫 '{' ~ 마지막 '}' 구간만 시도
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  candidate = candidate.slice(start, end + 1)

  let raw: unknown
  try {
    raw = JSON.parse(candidate)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null

  const o = raw as Record<string, unknown>
  // 최소한 핵심 키 일부가 있어야 구조화로 인정
  const hasCore = ['summary', 'participationGrade', 'risks', 'requiredDocuments'].some((k) => k in o)
  if (!hasCore) return null

  const grade = asString(o.participationGrade).trim().toUpperCase()

  return {
    summary: asString(o.summary),
    complexName: asString(o.complexName),
    region: asString(o.region),
    bidMethod: asString(o.bidMethod),
    siteBriefingDate: asString(o.siteBriefingDate),
    bidDeadline: asString(o.bidDeadline),
    contractPeriod: asString(o.contractPeriod),
    // 사업설명회/PT 별칭 다중 수용 (AI가 어느 키로 응답해도 받기 위함).
    businessPresentationDate: asString(
      o.businessPresentationDate ?? o.ptPresentationDate ?? o.presentationDate ?? o.ptDate ?? '',
    ),
    businessPresentationTime: asString(
      o.businessPresentationTime ?? o.presentationTime ?? o.ptTime ?? '',
    ),
    businessPresentationLocation: asString(
      o.businessPresentationLocation ?? o.presentationLocation ?? o.ptLocation ?? '',
    ),
    requiredDocuments: asStringArray(o.requiredDocuments),
    specialConditions: asStringArray(o.specialConditions),
    risks: asStringArray(o.risks),
    estimateNotes: asStringArray(o.estimateNotes),
    siteBriefingQuestions: asStringArray(o.siteBriefingQuestions),
    participationGrade: /^[ABCD]$/.test(grade) ? grade : asString(o.participationGrade),
    participationReason: asString(o.participationReason),
    recommendedAction: asString(o.recommendedAction),
  }
}

export const GRADE_LABEL: Record<string, string> = {
  A: 'A · 적극 참여',
  B: 'B · 조건 확인 후 참여',
  C: 'C · 신중 검토',
  D: 'D · 참여 비추천',
}

// 리스크 문자열을 카테고리 + 간단 대응방안으로 분류한다.
export function categorizeRisk(risk: string): { category: RiskCategory; advice: string } {
  const t = risk.toLowerCase()
  const has = (...keys: string[]) => keys.some((k) => t.includes(k))

  if (has('일정', '마감', '현장설명회', '날짜', '기한', 'pt', '발표')) {
    return { category: '일정 리스크', advice: '주요 일정을 역산해 사전 준비 일정을 확보하세요.' }
  }
  if (has('자격', '실적', '면허', '등록', '자본', '요건', '평가')) {
    return { category: '자격요건 리스크', advice: '참가자격·실적요건 충족 여부를 사전 확인하세요.' }
  }
  if (has('금액', '단가', '예가', '적정', '저가', '산출', '예산', '낙찰')) {
    return { category: '산출금액 리스크', advice: '산출내역과 적정가를 정밀 검토하세요.' }
  }
  if (has('계약', '위약', '해지', '배상', '특약', '벌칙', '지체')) {
    return { category: '계약조건 리스크', advice: '계약 조항을 법무 검토하세요.' }
  }
  if (has('인력', '근무', '배치', '충원', '직원', '강사')) {
    return { category: '인력운영 리스크', advice: '인력 운영계획과 비용을 점검하세요.' }
  }
  if (has('장비', '투자', '설비', '리스', '기기', '기구')) {
    return { category: '장비투자 리스크', advice: '장비 투자비 회수 가능성을 검토하세요.' }
  }
  if (has('법', '규정', '컴플라이언스', '개인정보', '준법', '하도급')) {
    return { category: '법무/컴플라이언스 리스크', advice: '관련 법령·규정 준수 여부를 확인하세요.' }
  }
  return { category: '기타 리스크', advice: '추가 검토가 필요합니다.' }
}

// 자유 텍스트에서 yyyy-mm-dd 추출 (date input용). 실패 시 빈 문자열.
export function toDateInput(text: string): string {
  if (!text) return ''
  const m = text.match(/(\d{4})[-.\/년\s]+(\d{1,2})[-.\/월\s]+(\d{1,2})/)
  if (!m) return ''
  const [, y, mo, d] = m
  const pad = (n: string) => n.padStart(2, '0')
  return `${y}-${pad(mo)}-${pad(d)}`
}

// "A ~ B" 형태 계약기간을 시작/종료 date input으로 분리.
// 구분자는 ~, ∼, 공백으로 둘러싸인 -, 부터/까지만 사용(ISO 날짜의 하이픈은 보존).
export function splitContractPeriod(text: string): { start: string; end: string } {
  if (!text) return { start: '', end: '' }
  const parts = text
    .split(/\s*~\s*|\s*∼\s*|\s+-\s+|\s*부터\s*|\s*까지\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return { start: toDateInput(parts[0]), end: toDateInput(parts[1]) }
  }
  return { start: toDateInput(text), end: '' }
}
