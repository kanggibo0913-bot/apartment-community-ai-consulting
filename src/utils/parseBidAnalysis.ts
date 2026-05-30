// 공고문 AI 분석 결과(JSON) 파싱 + 보조 유틸. 파싱 실패 시 null을 반환해 텍스트 폴백을 유도한다.

// 일정표 보기를 위한 일정 항목 정규형. AI가 동의어로 응답해도 같은 구조로 흡수한다.
// time/location/content/apartmentName/households/calculatedStaffCount/managementOfficePhone는 옵셔널.
export type ParsedScheduleEventType =
  | 'siteBriefing'
  | 'bidDeadline'
  | 'opening'
  | 'businessPresentation'
  | 'documentSubmission'
  | 'contract'
  | 'other'

export interface ParsedScheduleEvent {
  eventType: ParsedScheduleEventType
  eventTypeLabel: string
  date: string
  time: string
  location: string
  content: string
  apartmentName: string
  households: number | null
  calculatedStaffCount: number | null
  managementOfficePhone: string
}

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
  // 시간 포함된 일정 배열. AI 프롬프트의 scheduleEvents[]를 직접 흡수해 일정표 뷰에 반영.
  scheduleEvents: ParsedScheduleEvent[]
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

const asNumberOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const digits = v.replace(/[^0-9]/g, '')
    if (digits) return Number(digits)
  }
  return null
}

// 'siteBriefing'·'현설'·'현장설명회' 등 다양한 표기를 정규형으로 통일.
const normalizeScheduleEventType = (raw: unknown): ParsedScheduleEventType => {
  const t = asString(raw).toLowerCase().trim()
  if (!t) return 'other'
  if (/(site.?brief|sitevisit|현설|현장설명)/i.test(t)) return 'siteBriefing'
  if (/(biddeadline|deadline|마감)/i.test(t)) return 'bidDeadline'
  if (/(open|개찰)/i.test(t)) return 'opening'
  if (/(business.?present|pt|사업설명|제안설명|제안.?발표|프레젠|프리젠|기술제안)/i.test(t))
    return 'businessPresentation'
  if (/(document|서류|제출)/i.test(t)) return 'documentSubmission'
  if (/(contract|계약)/i.test(t)) return 'contract'
  return 'other'
}

const DEFAULT_SCHEDULE_LABEL: Record<ParsedScheduleEventType, string> = {
  siteBriefing: '현설',
  bidDeadline: '마감',
  opening: '개찰',
  businessPresentation: '사업설명회/PT',
  documentSubmission: '서류',
  contract: '계약',
  other: '기타',
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
    // scheduleEvents[]: AI가 시간 포함 일정을 제공한 경우만 채워진다. 비어있으면 빈 배열.
    // 추정치는 받지 않으므로 빈 값이면 그대로 비워 둔다.
    scheduleEvents: Array.isArray(o.scheduleEvents)
      ? (o.scheduleEvents as unknown[]).flatMap((rawItem): ParsedScheduleEvent[] => {
          if (typeof rawItem !== 'object' || rawItem === null) return []
          const it = rawItem as Record<string, unknown>
          const date = toDateInput(asString(it.date))
          if (!date) return [] // 날짜 없는 항목은 일정표에서 무의미
          const eventType = normalizeScheduleEventType(it.eventType ?? it.type)
          const labelRaw = asString(it.eventTypeLabel ?? it.label).trim()
          return [
            {
              eventType,
              eventTypeLabel: labelRaw || DEFAULT_SCHEDULE_LABEL[eventType],
              date,
              time: asString(it.time ?? it.startTime ?? '').trim(),
              location: asString(it.location ?? it.place ?? '').trim(),
              content: asString(it.content ?? it.memo ?? it.description ?? '').trim(),
              apartmentName: asString(it.apartmentName ?? it.complexName ?? '').trim(),
              households: asNumberOrNull(it.households ?? it.totalUnits),
              calculatedStaffCount: asNumberOrNull(it.calculatedStaffCount ?? it.staffCount),
              managementOfficePhone: asString(it.managementOfficePhone ?? it.officePhone ?? '').trim(),
            },
          ]
        })
      : [],
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
