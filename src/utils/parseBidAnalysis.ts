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
  siteBriefingTime: string
  bidDeadline: string
  bidDeadlineTime: string
  openingDate: string
  openingTime: string
  documentSubmissionDate: string
  documentSubmissionTime: string
  ptDate: string
  ptTime: string
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
  siteBriefing: '현장설명회',
  bidDeadline: '입찰마감',
  opening: '개찰',
  businessPresentation: '사업설명회/PT',
  documentSubmission: '서류제출',
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

  // 단일 필드의 시간 별칭 흡수. 날짜 문자열에 시간이 함께 들어 있어도 toTimeInput으로 추출.
  const rawSiteDate = asString(o.siteBriefingDate ?? o.siteVisitDate ?? '')
  const rawSiteTime =
    asString(
      o.siteBriefingTime ??
        o.siteVisitTime ??
        o.briefingTime ??
        o.fieldBriefingTime ??
        '',
    ) || rawSiteDate
  const rawDeadlineDate = asString(o.bidDeadline ?? o.bidDeadlineDate ?? o.deadlineDate ?? '')
  const rawDeadlineTime =
    asString(
      o.bidDeadlineTime ??
        o.deadlineTime ??
        o.bidCloseTime ??
        o.bidSubmissionDeadlineTime ??
        '',
    ) || rawDeadlineDate
  const rawOpeningDate = asString(o.openingDate ?? o.bidOpeningDate ?? '')
  const rawOpeningTime =
    asString(
      o.openingTime ??
        o.openingDateTime ??
        o.bidOpeningTime ??
        '',
    ) || rawOpeningDate
  const rawDocDate = asString(o.documentSubmissionDate ?? o.documentsDeadlineDate ?? '')
  const rawDocTime =
    asString(o.documentSubmissionTime ?? o.documentsDeadlineTime ?? '') || rawDocDate
  const rawPtDate = asString(o.ptDate ?? o.ptPresentationDate ?? '')
  const rawPtTime =
    asString(o.ptTime ?? o.ptPresentationTime ?? o.proposalPresentationTime ?? '') || rawPtDate

  return {
    summary: asString(o.summary),
    complexName: asString(o.complexName),
    region: asString(o.region),
    bidMethod: asString(o.bidMethod),
    siteBriefingDate: rawSiteDate,
    siteBriefingTime: toTimeInput(rawSiteTime),
    bidDeadline: rawDeadlineDate,
    bidDeadlineTime: toTimeInput(rawDeadlineTime),
    openingDate: rawOpeningDate,
    openingTime: toTimeInput(rawOpeningTime),
    documentSubmissionDate: rawDocDate,
    documentSubmissionTime: toTimeInput(rawDocTime),
    ptDate: rawPtDate,
    ptTime: toTimeInput(rawPtTime),
    contractPeriod: asString(o.contractPeriod),
    // 사업설명회/PT 별칭 다중 수용 (AI가 어느 키로 응답해도 받기 위함). 시간은 toTimeInput으로 정규화.
    businessPresentationDate: asString(
      o.businessPresentationDate ?? o.ptPresentationDate ?? o.presentationDate ?? o.ptDate ?? '',
    ),
    businessPresentationTime: toTimeInput(
      asString(
        o.businessPresentationTime ??
          o.presentationTime ??
          o.ptTime ??
          o.ptPresentationTime ??
          o.proposalPresentationTime ??
          '',
      ) ||
        asString(o.businessPresentationDate ?? o.ptPresentationDate ?? o.presentationDate ?? o.ptDate ?? ''),
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
          const rawDate = asString(it.date)
          const date = toDateInput(rawDate)
          if (!date) return [] // 날짜 없는 항목은 일정표에서 무의미
          const eventType = normalizeScheduleEventType(it.eventType ?? it.type)
          const labelRaw = asString(it.eventTypeLabel ?? it.label).trim()
          // 시간 결정 우선순위:
          //   1) it.time / startTime
          //   2) it.date 문자열에 시간이 함께 들어 있으면 추출
          //   3) it.content / memo / description 안의 시간 표현
          const rawTime = asString(it.time ?? it.startTime ?? '').trim()
          const extractedFromDate = toTimeInput(rawDate)
          const extractedFromContent = toTimeInput(asString(it.content ?? it.memo ?? it.description ?? ''))
          const time = toTimeInput(rawTime) || extractedFromDate || extractedFromContent
          return [
            {
              eventType,
              eventTypeLabel: labelRaw || DEFAULT_SCHEDULE_LABEL[eventType],
              date,
              time,
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

// 자유 텍스트에서 HH:mm(24시간) 추출. 실패 시 빈 문자열. 추정/임의 보정은 하지 않는다.
// 처리 형식:
//  - "14:00", "14：00", "1400", "17:00까지"
//  - "10시", "10시 30분"
//  - "오전 10시", "오전 10시 30분"
//  - "오후 2시", "오후 2시 30분", "오후 12시"(=12:00), "오전 12시"(=00:00)
//  - 날짜와 함께 섞인 문자열에서도 시간 토큰만 추출
export function toTimeInput(text: string): string {
  if (!text) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  const t = text.replace(/[：]/g, ':') // 전각 콜론 정규화

  // 1) 오전/오후 + N시 (+ M분)
  const am = t.match(/(오전|오후|AM|PM|am|pm)\s*(\d{1,2})\s*(?:시|:)?(?:\s*(\d{1,2})\s*분?)?/)
  if (am) {
    const meridiem = am[1]
    let hour = Number(am[2])
    const minute = am[3] ? Number(am[3]) : 0
    if (Number.isFinite(hour) && Number.isFinite(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute < 60) {
      const isPm = /오후|PM|pm/.test(meridiem)
      // "오전 12시" → 00:00, "오후 12시" → 12:00, 그 외 오후 hour+12
      if (isPm) {
        if (hour < 12) hour += 12
      } else {
        if (hour === 12) hour = 0
      }
      return `${pad(hour)}:${pad(minute)}`
    }
  }

  // 2) HH:mm (또는 H:mm) — 17:00, 9:30, 17:00까지
  const colon = t.match(/(?:^|[^\d])(\d{1,2}):(\d{2})(?!\d)/)
  if (colon) {
    const hour = Number(colon[1])
    const minute = Number(colon[2])
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      return `${pad(hour)}:${pad(minute)}`
    }
  }

  // 3) "14시 30분", "10시"
  const kor = t.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/)
  if (kor) {
    const hour = Number(kor[1])
    const minute = kor[2] ? Number(kor[2]) : 0
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      return `${pad(hour)}:${pad(minute)}`
    }
  }

  // 4자리 숫자형 HHmm 보조 매칭은 의도적으로 제외한다.
  // ("2026" 같은 연도 4자리가 20:26 등으로 잘못 인식되는 사례를 방지)

  return ''
}

// 날짜+시간이 한 문자열에 섞여 있을 때 분리해 반환.
// 입력 예: "2026-06-04 10:00", "2026.06.12. 17:00까지", "2026년 6월 16일 오후 2시"
export function splitDateTime(text: string): { date: string; time: string } {
  return { date: toDateInput(text), time: toTimeInput(text) }
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
