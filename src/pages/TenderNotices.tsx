import { FormEvent, useEffect, useMemo, useState } from 'react'
import { formatNumber } from '../utils/formatUtils'
import {
  TenderNotice,
  TenderNoticeParticipation,
  TenderNoticeRiskLevel,
  TenderNoticeStatus,
} from '../types/CommunityData'
import BidNoticeAIAnalysis from '../components/BidNoticeAIAnalysis'
import {
  BidAnalysisParsed,
  ParsedScheduleEvent,
  splitContractPeriod,
  toDateInput,
} from '../utils/parseBidAnalysis'
import './TenderNotices.css'

const STORAGE_KEY = 'tenderNotices'
const SCHEDULE_STORAGE_KEY = 'tenderScheduleEvents'

type ScheduleEventType =
  | 'siteBriefing'
  | 'bidDeadline'
  | 'pt'
  | 'opening'
  | 'contractStart'
  | 'contractEnd'
  | 'businessPresentation'
  | 'documentSubmission'
  | 'other'

// 공고 전체 등록과 별개로, 캘린더에만 표시되는 "일정만" 항목.
// 옵셔널 메타 필드는 기존 데이터와의 호환을 위해 모두 선택값으로 둔다.
interface ScheduleEvent {
  id: string
  date: string
  type: ScheduleEventType
  label: string
  complexName: string
  memo: string
  source: string
  // 캘린더/일정표 카드에 노출할 추가 메타데이터 (없으면 fallback 표시)
  households?: number
  calculatedStaffCount?: number
  content?: string
  managementOfficePhone?: string
  category?: string
  createdAt?: string
  // 일정표 보기를 위한 시간/장소 필드 (옵셔널, 기존 데이터 하위호환)
  time?: string
  endTime?: string
  location?: string
  // 산출인원 alias 호환 필드(옵셔널). 우선순위는 calculatedStaffCount → requiredStaffCount → staffCount → requiredPersonnel → staffingCount → staffCountText.
  // 모두 number 또는 string 허용해 기존 데이터/외부 입력을 깨지 않게 흡수한다.
  requiredStaffCount?: number | string
  staffCount?: number | string
  requiredPersonnel?: number | string
  staffingCount?: number | string
  staffCountText?: string
}

const scheduleBadgeByType: Record<ScheduleEventType, string> = {
  siteBriefing: 'schedule-site-visit',
  bidDeadline: 'schedule-deadline',
  pt: 'schedule-pt',
  opening: 'schedule-deadline',
  contractStart: 'schedule-contract-start',
  contractEnd: 'schedule-contract-end',
  businessPresentation: 'schedule-business-presentation',
  documentSubmission: 'schedule-document',
  other: 'schedule-other',
}

// 캘린더가 notices와 scheduleEvents를 함께 렌더링하기 위한 통합 이벤트 형태.
// 풍부한 카드를 그리기 위해 단지명/세대수/산출인원/내용/관리소 전화번호를 모두 옵셔널로 둔다.
type CalendarItem = {
  uid: string
  label: string
  badge: string
  title: string
  kind: 'notice' | 'schedule'
  notice?: TenderNotice
  memo?: string
  // 카드에 보조 정보로 노출 (있을 때만 표시)
  households?: number
  calculatedStaffCount?: number
  content?: string
  managementOfficePhone?: string
  // 일정표 보기용 시간 필드 (HH:MM 또는 빈 문자열)
  time?: string
  location?: string
  source?: string
  eventType?: ScheduleEventType
  // 산출인원 fallback 보조 필드. number/string 모두 허용해 외부/레거시 데이터 흡수.
  requiredStaffCount?: number | string
  staffCount?: number | string
  requiredPersonnel?: number | string
  staffingCount?: number | string
  staffCountText?: string
}

// 일정 항목 정렬을 위한 우선순위. 같은 시간(또는 시간 미정)일 때 적용.
const EVENT_PRIORITY: Record<ScheduleEventType, number> = {
  siteBriefing: 1,
  businessPresentation: 2,
  documentSubmission: 3,
  bidDeadline: 4,
  opening: 5,
  contractStart: 6,
  contractEnd: 7,
  pt: 2, // 레거시 pt(=사업설명회와 동일 우선순위)
  other: 9,
}

// 캘린더 필드 → ScheduleEventType 매핑 (notice 기반 항목의 eventType 추출용).
const FIELD_EVENT_TYPE: Record<string, ScheduleEventType> = {
  siteVisitDate: 'siteBriefing',
  deadlineDate: 'bidDeadline',
  ptDate: 'businessPresentation',
  contractStartDate: 'contractStart',
  contractEndDate: 'contractEnd',
}

// 입찰 스케줄러(일정표/월간 달력/AI 일정만 추가 후보)에 표시·등록 허용된 이벤트 타입.
// 계약 시작/종료(contractStart/contractEnd/contract)는 산출표·공고 상세에서만 사용하고
// 스케줄러에서는 일관되게 제외한다. 데이터 자체는 보존하고 UI 단계에서만 차단한다.
const SCHEDULER_ALLOWED_TYPES = new Set<ScheduleEventType>([
  'siteBriefing',
  'businessPresentation',
  'pt',
  'documentSubmission',
  'bidDeadline',
  'opening',
  'other',
])

// 다양한 표기를 정규화한 뒤 차단할 키워드 집합.
// (legacy 데이터의 type/label/category에 '계약'·'operation'·'운영' 등이 섞여 들어와도 차단)
const CONTRACT_BLOCK_REGEX = /(contract|operation|계약|운영(시작|종료))/i

// 캘린더 cell/agenda 표시 직전에 통과시키는 필터.
const isSchedulerVisible = (
  type: ScheduleEventType | undefined,
  label?: string,
  category?: string,
): boolean => {
  if (type && !SCHEDULER_ALLOWED_TYPES.has(type)) return false
  if (type === 'contractStart' || type === 'contractEnd') return false
  const probe = `${label || ''} ${category || ''}`
  if (CONTRACT_BLOCK_REGEX.test(probe)) return false
  return true
}

// 'YYYY-MM-DD'를 더해/빼고 다시 'YYYY-MM-DD'로 변환.
const addDays = (base: Date, days: number): Date => {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

// 산출인원 표시용 fallback. 여러 alias 필드를 순서대로 확인해 (숫자, 원문) 쌍을 반환한다.
// 우선순위: calculatedStaffCount → requiredStaffCount → staffCount → requiredPersonnel → staffingCount → staffCountText.
// 숫자(또는 "N명") → 숫자로 인식 / 그 외 문자열은 원문 보존.
type StaffCandidate = number | string | undefined | null
const pickStaffDisplay = (
  ...candidates: StaffCandidate[]
): { num: number | null; text: string } => {
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      return { num: v, text: '' }
    }
    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (!trimmed) continue
      const onlyNum = trimmed.match(/^(\d+)\s*명?$/)
      if (onlyNum) return { num: Number(onlyNum[1]), text: '' }
      return { num: null, text: trimmed }
    }
  }
  return { num: null, text: '' }
}

const getLocalDateString = (date: Date) => date.toLocaleDateString('sv')

const defaultForm: Omit<TenderNotice, 'id' | 'autoAnalysis' | 'generatedSummary'> = {
  siteName: '',
  region: '',
  totalUnits: 0,
  title: '',
  postedDate: getLocalDateString(new Date()),
  siteVisitDate: '',
  deadlineDate: '',
  ptDate: '',
  contractStartDate: '',
  contractEndDate: '',
  biddingMethod: '',
  awardMethod: '',
  eligibility: '',
  specialConditions: '',
  fullText: '',
  participationLikelihood: '보통',
  riskLevel: '보통',
  estimatedStaff: 0,
  estimatedMonthlyCost: 0,
  estimatedMonthlyRevenue: 0,
  reviewMemo: '',
  status: '검토중',
}

type AnalysisSchedule = {
  postedDate?: string
  siteVisitDate?: string
  siteVisitTime?: string
  siteVisitPlace?: string
  deadlineDate?: string
  deadlineTime?: string
  openingDate?: string
  openingTime?: string
  ptDate?: string
  ptTime?: string
}

type AnalysisParticipation = {
  eligibility?: string
  performanceRequirement?: boolean
  capitalRequirement?: string
  licenseRequirement?: string
  attendanceRequired?: boolean
  jointSupplyAllowed?: boolean
  subcontractLimit?: boolean
}

type AnalysisResult = {
  basicInfo: {
    siteName?: string
    title?: string
    region?: string
    totalUnits?: number
    biddingMethod?: string
    awardMethod?: string
    contractStartDate?: string
    contractEndDate?: string
  }
  schedule: AnalysisSchedule
  participation: AnalysisParticipation
  documents: string[]
  riskKeywords: string[]
  riskLevel: TenderNoticeRiskLevel
  mikReview: string
  missing: string[]
}

const normalizeText = (text: string) => text.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim()

const parseInteger = (raw: string) => {
  const digits = raw.replace(/[^0-9]/g, '')
  return digits ? Number(digits) : undefined
}

const canonicalDate = (raw: string): string | undefined => {
  const yearMatch = raw.match(/(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/)
  if (yearMatch) {
    const year = Number(yearMatch[1])
    const month = Number(yearMatch[2])
    const day = Number(yearMatch[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
    }
  }

  const shortMatch = raw.match(/(\d{1,2})\s*[.\-월]\s*(\d{1,2})\s*일?/) 
  if (shortMatch) {
    const currentYear = new Date().getFullYear()
    const month = Number(shortMatch[1])
    const day = Number(shortMatch[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${currentYear.toString()}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
    }
  }
  return undefined
}

const canonicalTime = (raw: string): string | undefined => {
  const ampmMatch = raw.match(/(오전|오후)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/)
  if (ampmMatch) {
    let hour = Number(ampmMatch[2])
    const minute = Number(ampmMatch[3] ?? '0')
    if (ampmMatch[1] === '오후' && hour < 12) hour += 12
    if (ampmMatch[1] === '오전' && hour === 12) hour = 0
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  }

  const colonMatch = raw.match(/(\d{1,2})[:：](\d{2})/)
  if (colonMatch) {
    const hour = Number(colonMatch[1])
    const minute = Number(colonMatch[2])
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    }
  }

  const hourMatch = raw.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/)
  if (hourMatch) {
    const hour = Number(hourMatch[1])
    const minute = Number(hourMatch[2] ?? '0')
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    }
  }

  return undefined
}

const extractLabeledSection = (text: string, labelPattern: string) => {
  const lines = text.split(/\n/) || []
  const labelRegex = new RegExp(labelPattern, 'i')
  const index = lines.findIndex((line) => labelRegex.test(line))
  if (index === -1) return ''
  return [lines[index], lines[index + 1] || ''].join(' ')
}

const extractField = (text: string, labelPattern: string, fallbackRegex?: RegExp): string | undefined => {
  const pattern = new RegExp(`${labelPattern}[:：\s]*([^\n\r]+)`, 'i')
  const match = text.match(pattern)
  if (match) {
    return match[1].trim()
  }
  if (fallbackRegex) {
    const fallback = text.match(fallbackRegex)
    if (fallback) return fallback[1].trim()
  }
  return undefined
}

const extractDateFromText = (text: string, labelPattern: string): string | undefined => {
  const section = extractLabeledSection(text, labelPattern)
  const dateFromSection = section && canonicalDate(section)
  if (dateFromSection) return dateFromSection
  const directPattern = new RegExp(`${labelPattern}[:：\s]*([\d년월\.\-\s]+일?)`, 'i')
  const match = text.match(directPattern)
  if (match) return canonicalDate(match[1])
  const fallback = text.match(/(\d{4}[.\-]\d{1,2}[.\-]\d{1,2}|\d{4}년\s*\d{1,2}월\s*\d{1,2}일|\d{1,2}월\s*\d{1,2}일)/)
  if (fallback) return canonicalDate(fallback[1])
  return undefined
}

const extractTimeFromText = (text: string, labelPattern: string): string | undefined => {
  const section = extractLabeledSection(text, labelPattern)
  const timeFromSection = section && canonicalTime(section)
  if (timeFromSection) return timeFromSection
  const directPattern = new RegExp(`${labelPattern}[:：\s]*([오전오후\d:\s시분]+)`, 'i')
  const match = text.match(directPattern)
  if (match) return canonicalTime(match[1])
  const fallback = text.match(/(오전\s*\d{1,2}시(?:\s*\d{1,2}분)?|오후\s*\d{1,2}시(?:\s*\d{1,2}분)?|\d{1,2}[:：]\d{2}|\d{1,2}시(?:\s*\d{1,2}분)?)/i)
  if (fallback) return canonicalTime(fallback[1])
  return undefined
}

const extractPlaceFromText = (text: string, labelPattern: string): string | undefined => {
  const section = extractLabeledSection(text, labelPattern)
  const match = section.match(/장소[:：\s]*([^\n\r]+)/i)
  if (match) return match[1].trim()
  return undefined
}

const extractNumberField = (text: string, labelPattern: string): number | undefined => {
  const found = extractField(text, labelPattern)
  if (!found) return undefined
  return parseInteger(found)
}

const extractDocuments = (text: string): string[] => {
  const docs = [
    { name: '사업자등록증', pattern: /사업자등록증/ },
    { name: '법인등기부등본', pattern: /법인등기부등본/ },
    { name: '법인인감증명서', pattern: /법인인감증명서/ },
    { name: '사용인감계', pattern: /사용인감계/ },
    { name: '국세/지방세 완납증명서', pattern: /국세.*완납|지방세.*완납/ },
    { name: '4대보험 완납증명서', pattern: /4대보험.*완납|국민연금.*완납|건강보험.*완납/ },
    { name: '실적증명서', pattern: /실적증명서/ },
    { name: '운영계획서', pattern: /운영계획서/ },
    { name: '산출내역서', pattern: /산출내역서/ },
    { name: '입찰서', pattern: /입찰서/ },
    { name: '입찰보증보험증권', pattern: /입찰보증보험|입찰보증/ },
    { name: '계약이행보증보험증권', pattern: /계약이행보증보험|계약이행보증/ },
  ]
  return docs.filter((doc) => doc.pattern.test(text)).map((doc) => doc.name)
}

const extractRisks = (text: string) => {
  const candidates: Array<{ label: string; regex: RegExp }> = [
    { label: '최저가', regex: /최저가/ },
    { label: '적격심사', regex: /적격심사/ },
    { label: '제한경쟁', regex: /제한경쟁/ },
    { label: '수의계약', regex: /수의계약/ },
    { label: '무상지원', regex: /무상|무상지원/ },
    { label: '기부', regex: /기부/ },
    { label: '투자', regex: /투자/ },
    { label: '시설개선', regex: /시설개선/ },
    { label: '장비지원', regex: /장비지원/ },
    { label: '보증보험', regex: /보증보험/ },
    { label: '계약이행보증', regex: /계약이행보증/ },
    { label: '현장설명회 불참 시 입찰 무효', regex: /현장설명회.*불참.*입찰|현장설명회.*참석.*필수|현설.*불참.*무효/i },
    { label: '입찰서와 산출내역서 금액 불일치 시 무효', regex: /입찰서.*산출내역서.*금액.*불일치.*무효/ },
    { label: '낙찰 후 포기 시 제재', regex: /낙찰.*포기.*제재|포기.*제재/ },
    { label: '관리주체 사전 승인', regex: /관리주체.*사전 승인/ },
    { label: '입주자대표회의 의결', regex: /입주자대표회의/ },
  ]
  return candidates.filter((candidate) => candidate.regex.test(text)).map((candidate) => candidate.label)
}

const computeRiskLevel = (text: string, schedule: AnalysisSchedule) => {
  const normalized = text.toLowerCase()
  const hasPrice = /최저가/.test(normalized)
  const hasFree = /(무상|기부|지원|투자|시설개선|장비지원)/.test(normalized)
  const hasMandatorySiteVisit = /현장설명회.*(필수|참석.*필수|참석하지.*(않|못)|미참석.*무효|현설.*필수)/i.test(text)
  const hasEligible = /적격심사/.test(normalized)
  const hasPerformance = /(실적|최근\s*3년|위탁운영)/.test(normalized)

  if (hasFree) return '높음'
  if (hasPrice && hasFree) return '높음'
  const imminent = schedule.siteVisitDate || schedule.deadlineDate
  if (hasMandatorySiteVisit && imminent) return '보통'
  if (hasEligible) return '보통'
  if (hasPerformance) return '보통'
  if (hasPrice) return '보통'
  return '낮음'
}

const buildAnalysisResult = (text: string): AnalysisResult => {
  const normalized = normalizeText(text)
  const basicInfo = {
    siteName: extractField(normalized, '단지명|단지', /([가-힣a-zA-Z0-9\s]+)\s*단지/),
    title: extractField(normalized, '공고명|제목', /([가-힣a-zA-Z0-9\s]+)\s*(공고|제목)/),
    region: extractField(normalized, '지역|소재지'),
    totalUnits: extractNumberField(normalized, '세대수|세대'),
    biddingMethod: extractField(normalized, '입찰방식|입찰방법'),
    awardMethod: extractField(normalized, '낙찰방식|낙찰방법'),
    contractStartDate: extractDateFromText(normalized, '계약 시작일|계약개시일|계약기간'),
    contractEndDate: extractDateFromText(normalized, '계약 종료일|계약종료일|계약기간'),
  }

  const schedule: AnalysisSchedule = {
    postedDate: extractDateFromText(normalized, '공고 게시일|공고일|게시일'),
    siteVisitDate: extractDateFromText(normalized, '현장설명회|현설'),
    siteVisitTime: extractTimeFromText(normalized, '현장설명회|현설'),
    siteVisitPlace: extractPlaceFromText(normalized, '현장설명회|현설|설명회 장소'),
    deadlineDate: extractDateFromText(normalized, '서류 제출 마감일|입찰 마감일|마감일|제출 마감일'),
    deadlineTime: extractTimeFromText(normalized, '서류 제출 마감일|입찰 마감일|마감일|제출 마감일'),
    openingDate: extractDateFromText(normalized, '개찰일|개찰'),
    openingTime: extractTimeFromText(normalized, '개찰일|개찰'),
    ptDate: extractDateFromText(normalized, 'PT 발표일|PT일|제안발표|제안 발표일'),
    ptTime: extractTimeFromText(normalized, 'PT 발표일|PT일|제안발표|제안 발표일'),
  }

  const participation: AnalysisParticipation = {
    eligibility: extractField(normalized, '참가자격|응찰자격|참가 조건'),
    performanceRequirement: /(실적|최근\s*3년|위탁운영)/.test(normalized),
    capitalRequirement: extractField(normalized, '자본금|자본금 요건'),
    licenseRequirement: extractField(normalized, '면허|등록'),
    attendanceRequired: /현장설명회.*(필수|참석.*필수|참석하지.*(않|못)|미참석.*무효|현설.*필수)/i.test(normalized),
    jointSupplyAllowed: /공동수급|공동수급체/.test(normalized),
    subcontractLimit: /하도급|하도급 제한|하도급 금지/.test(normalized),
  }

  const documents = extractDocuments(normalized)
  const riskKeywords = extractRisks(normalized)
  const riskLevel = computeRiskLevel(normalized, schedule)

  const issueLines: string[] = []
  if (participation.attendanceRequired) issueLines.push('현장설명회 참석 여부를 확인해야 합니다.')
  if (riskKeywords.includes('최저가')) issueLines.push('최저가 방식은 가격경쟁 리스크가 큽니다.')
  if (participation.performanceRequirement) issueLines.push('실적 요건이 있어 실적자료 준비가 필요합니다.')
  if (riskKeywords.some((keyword) => ['무상지원', '기부', '투자', '시설개선', '장비지원'].includes(keyword))) {
    issueLines.push('금품제공성 위험을 검토해야 합니다.')
  }

  const missing: string[] = []
  if (!basicInfo.siteName) missing.push('단지명')
  if (!basicInfo.title) missing.push('공고명')
  if (!basicInfo.region) missing.push('지역')
  if (!basicInfo.totalUnits) missing.push('세대수')
  if (!basicInfo.biddingMethod) missing.push('입찰방식')
  if (!basicInfo.awardMethod) missing.push('낙찰방식')
  if (!schedule.deadlineDate) missing.push('입찰 마감일')
  if (!schedule.siteVisitDate && /현장설명회|현설/.test(normalized)) missing.push('현장설명회 일정')
  if (!schedule.ptDate && /PT|제안발표|사업설명/.test(normalized)) missing.push('PT 일정')

  const riskPhrases: string[] = []
  if (riskKeywords.includes('최저가')) riskPhrases.push('최저가 입찰 방식이 예상됩니다.')
  if (riskKeywords.includes('적격심사')) riskPhrases.push('적격심사가 예상되어 제안서 및 실적자료 준비가 필요합니다.')
  if (riskKeywords.some((keyword) => ['무상지원', '기부', '투자', '시설개선', '장비지원'].includes(keyword))) {
    riskPhrases.push('무상지원/투자성 요소가 있어 금품제공성 리스크를 검토해야 합니다.')
  }
  if (riskKeywords.includes('계약이행보증')) riskPhrases.push('계약이행보증이 요구될 가능성이 있습니다.')
  if (participation.attendanceRequired) riskPhrases.push('현장설명회 참석이 필수로 보입니다.')
  if (riskPhrases.length === 0) riskPhrases.push('현재까지 명확한 위험 키워드는 제한적입니다.')

  const mikReview = [
    participation.attendanceRequired && '현장설명회 참석이 필수로 판단되므로 일정 확인 후 참석 가능 여부를 우선 검토해야 합니다.',
    riskKeywords.includes('적격심사') && '적격심사 방식으로 판단되며, 운영계획서와 실적자료 준비가 중요합니다.',
    riskKeywords.some((keyword) => ['무상지원', '기부', '투자', '시설개선', '장비지원'].includes(keyword)) &&
      '무상지원, 장비지원, 시설개선 등의 표현이 포함되어 있어 공동주택관리법 및 사업자 선정지침상 금품제공성 리스크 검토가 필요합니다.',
    riskKeywords.includes('최저가') && '최저가 방식으로 판단되는 경우 과도한 저가 투찰에 따른 운영손실 가능성을 검토해야 합니다.',
    riskKeywords.some((keyword) => ['입찰보증', '보증보험', '계약이행보증'].includes(keyword)) &&
      '제출서류 중 입찰보증보험 또는 계약이행보증보험이 요구되는 것으로 보이므로 발급 가능 여부를 확인해야 합니다.',
  ]
    .filter(Boolean)
    .map(String)
    .join(' ')

  return {
    basicInfo,
    schedule,
    participation,
    documents,
    riskKeywords,
    riskLevel,
    mikReview: mikReview || '추가 검토가 필요합니다.',
    missing,
  }
}

const parseAutoAnalysis = (text: string) => {
  const normalized = text.toLowerCase()
  return {
    siteVisitRequired: /현장설명회|현설/.test(normalized),
    ptRequired: /pt|제안발표|사업설명/.test(normalized),
    priceRisk: /최저가/.test(normalized),
    qualitativePossible: /적격심사/.test(normalized),
    performanceRequirement: /실적|최근 3년|위탁운영/.test(normalized),
    guaranteeRequired: /보증보험|계약이행보증/.test(normalized),
    freeSupportRisk: /무상|기부|지원|투자/.test(normalized),
  }
}

const buildSummaryText = (
  form: Omit<TenderNotice, 'id' | 'autoAnalysis' | 'generatedSummary'>,
  auto: ReturnType<typeof parseAutoAnalysis>
) => {
  const participation = `MIK 참여 가능성은 ${form.participationLikelihood}으로 평가됩니다. ${
    form.participationLikelihood === '높음'
      ? '적극 검토가 권장되며 제출 역량을 우선 확보하십시오.'
      : form.participationLikelihood === '낮음'
      ? '신중한 검토가 필요하며 조건 충족 중요성을 확인하십시오.'
      : '기본적인 검토가 필요하며 세부 요구 조건을 점검하십시오.'
  }`

  const riskLines = []
  if (auto.priceRisk) riskLines.push('최저가 경쟁 리스크가 존재합니다.')
  if (auto.qualitativePossible) riskLines.push('적격심사 방식이 예상되어 운영계획서와 실적자료 준비가 중요합니다.')
  if (auto.performanceRequirement) riskLines.push('실적 요건이 있어 최근 수행실적 검증이 필요합니다.')
  if (auto.guaranteeRequired) riskLines.push('보증보험 또는 계약이행보증이 요구될 가능성이 있습니다.')
  if (auto.freeSupportRisk) riskLines.push('무상지원/투자성 조건이 포함된 경우 추가 리스크 검토가 필요합니다.')
  const risks = riskLines.length > 0 ? riskLines.join(' ') : '현재까지 확인된 주요 리스크는 제한적입니다.'

  const documentItems = ['운영계획서', '실적증빙']
  if (auto.guaranteeRequired) documentItems.push('보증보험 증빙')
  if (auto.performanceRequirement) documentItems.push('실적자료')
  const documents = `주요 준비 서류: ${documentItems.join(', ')}.`

  const scheduleItems = [
    form.postedDate ? `공고 게시일: ${form.postedDate}` : null,
    form.siteVisitDate ? `현장설명회: ${form.siteVisitDate}` : null,
    form.deadlineDate ? `입찰마감일: ${form.deadlineDate}` : null,
    form.ptDate ? `PT 발표일: ${form.ptDate}` : null,
    form.contractStartDate && form.contractEndDate
      ? `계약기간: ${form.contractStartDate} ~ ${form.contractEndDate}`
      : null,
  ].filter(Boolean)
  const schedule = scheduleItems.length > 0 ? scheduleItems.join(' / ') : '일정 정보가 충분하지 않습니다.'

  const mikOpinion = auto.freeSupportRisk
    ? '무상지원 또는 투자성 조건이 포함되어 있는 경우 공동주택관리법 및 사업자 선정지침상 리스크 검토가 필요합니다.'
    : '제안서 및 운영계획서 기반으로 제출 서류를 충실히 준비하는 것이 필요합니다.'

  return {
    participation,
    risks,
    documents,
    schedule,
    mikOpinion: `${mikOpinion} ${form.riskLevel === '높음' ? '리스크 등급이 높으므로 MIK 추가 검토가 필요합니다.' : ''}`.trim(),
  }
}

const TenderNotices = () => {
  const [notices, setNotices] = useState<TenderNotice[]>(() => {
    // localStorage 로드를 초기화 시점에 수행 → 마운트 시 빈 배열 저장으로 덮어쓰는 경합 방지
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as TenderNotice[]
        if (Array.isArray(parsed)) return parsed
      }
    } catch {
      // Ignore invalid data
    }
    return []
  })
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>(() => {
    try {
      const raw = window.localStorage.getItem(SCHEDULE_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as ScheduleEvent[]
        if (Array.isArray(parsed)) return parsed
      }
    } catch {
      // Ignore invalid data
    }
    return []
  })
  const [form, setForm] = useState(defaultForm)
  const [analysisText, setAnalysisText] = useState('')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [selectedNotice, setSelectedNotice] = useState<TenderNotice | null>(null)
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()))
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showRawText, setShowRawText] = useState(false)
  // 스케줄러 표시 모드 — 기본은 실무 친화적인 일정표(아젠다) 뷰.
  // 보기 모드: 2주 보드(기본) / 일정표 / 월간 달력. 데이터는 eventsByDate를 공유.
  const [schedulerView, setSchedulerView] = useState<'board' | 'agenda' | 'calendar'>('board')
  // 페이지 상위 탭: AI 공고문 분석(기본) / 입찰 스케줄러 / 공고 목록·관리.
  const [bidPageTab, setBidPageTab] = useState<'analysis' | 'scheduler' | 'list'>('analysis')
  // 일정표 기준 기간: 2주(14일) / 3주(21일, 기본) / 전체.
  const [agendaRange, setAgendaRange] = useState<'2w' | '3w' | 'all'>('3w')

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notices))
  }, [notices])

  useEffect(() => {
    window.localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(scheduleEvents))
  }, [scheduleEvents])

  const autoAnalysis = useMemo(() => parseAutoAnalysis(form.fullText), [form.fullText])
  const generatedSummary = useMemo(() => buildSummaryText(form, autoAnalysis), [form, autoAnalysis])

  const eventDefinitions = [
    { field: 'siteVisitDate' as const, label: '현장설명회', badge: 'schedule-site-visit' },
    { field: 'deadlineDate' as const, label: '입찰마감', badge: 'schedule-deadline' },
    { field: 'ptDate' as const, label: 'PT 발표', badge: 'schedule-pt' },
    { field: 'contractStartDate' as const, label: '계약시작', badge: 'schedule-contract-start' },
    { field: 'contractEndDate' as const, label: '계약종료', badge: 'schedule-contract-end' },
  ]

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {}
    notices.forEach((notice) => {
      eventDefinitions.forEach((eventDef) => {
        const value = notice[eventDef.field]
        if (!value) return
        const eventType = FIELD_EVENT_TYPE[eventDef.field]
        // 스케줄러 차단: 계약시작·계약종료 일정은 일정표·캘린더에 노출하지 않는다.
        if (!isSchedulerVisible(eventType, eventDef.label)) return
        map[value] = map[value] || []
        map[value].push({
          uid: `n-${notice.id}-${eventDef.field}`,
          label: eventDef.label,
          badge: eventDef.badge,
          title: notice.siteName,
          kind: 'notice',
          notice,
          // notice 기반 항목은 단지/세대수/산출인원/공고명을 자동 매핑한다.
          households: notice.totalUnits || undefined,
          calculatedStaffCount: notice.estimatedStaff || undefined,
          content: notice.title || undefined,
          // notice는 시간 필드를 별도로 보유하지 않으므로 빈 값 → 일정표에서 '시간 미정' fallback.
          time: '',
          source: '수동',
          eventType,
        })
      })
    })
    scheduleEvents.forEach((ev) => {
      if (!ev.date) return
      // 저장된 contractStart/contractEnd 일정 또는 '계약'·'operation' 라벨은 표시하지 않는다.
      if (!isSchedulerVisible(ev.type, ev.label, ev.category)) return
      map[ev.date] = map[ev.date] || []
      map[ev.date].push({
        uid: `s-${ev.id}`,
        label: ev.label,
        badge: scheduleBadgeByType[ev.type] || 'schedule-deadline',
        title: ev.complexName,
        kind: 'schedule',
        memo: ev.memo,
        households: ev.households,
        calculatedStaffCount: ev.calculatedStaffCount,
        // 산출인원 alias 폴백 필드를 CalendarItem으로 그대로 전달 → board 렌더에서 우선순위 적용.
        requiredStaffCount: ev.requiredStaffCount,
        staffCount: ev.staffCount,
        requiredPersonnel: ev.requiredPersonnel,
        staffingCount: ev.staffingCount,
        staffCountText: ev.staffCountText,
        content: ev.content,
        managementOfficePhone: ev.managementOfficePhone,
        time: ev.time || '',
        location: ev.location,
        source: ev.source,
        eventType: ev.type,
      })
    })
    return map
  }, [notices, scheduleEvents])

  // 일정표(아젠다) 뷰: 오늘 기준 2주/3주/전체 범위 안의 일정만 골라 날짜별 그룹·시간순 정렬.
  const todayKeyForAgenda = useMemo(() => getLocalDateString(new Date()), [])
  const agendaGroups = useMemo(() => {
    const days = agendaRange === '2w' ? 14 : agendaRange === '3w' ? 21 : null
    const today = new Date(`${todayKeyForAgenda}T00:00:00`)
    const limit = days != null ? getLocalDateString(addDays(today, days - 1)) : null

    // 날짜 → 그 날짜의 이벤트 리스트
    const groups: { date: string; items: CalendarItem[] }[] = []
    const dateKeys = Object.keys(eventsByDate)
      .filter((k) => k >= todayKeyForAgenda && (limit == null || k <= limit))
      .sort()
    dateKeys.forEach((date) => {
      const items = [...eventsByDate[date]].sort((a, b) => {
        // 시간이 있는 일정이 먼저, 같은 그룹 안에서는 시간 오름차순.
        const aHas = !!a.time
        const bHas = !!b.time
        if (aHas && !bHas) return -1
        if (!aHas && bHas) return 1
        if (aHas && bHas && a.time !== b.time) return (a.time || '').localeCompare(b.time || '')
        // 시간 동일/둘 다 없음 → 우선순위 비교
        const pa = a.eventType ? EVENT_PRIORITY[a.eventType] : 9
        const pb = b.eventType ? EVENT_PRIORITY[b.eventType] : 9
        if (pa !== pb) return pa - pb
        // 우선순위도 같으면 단지명 사전순.
        return (a.title || '').localeCompare(b.title || '')
      })
      groups.push({ date, items })
    })
    return groups
  }, [eventsByDate, agendaRange, todayKeyForAgenda])

  const agendaTotalCount = useMemo(
    () => agendaGroups.reduce((sum, g) => sum + g.items.length, 0),
    [agendaGroups],
  )

  const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']
  const formatWeekday = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00`)
    if (Number.isNaN(d.getTime())) return ''
    return `${WEEKDAY_KO[d.getDay()]}요일`
  }

  // 2주 보드 보기 데이터: 오늘 ~ 오늘+13일까지 14개 컬럼.
  // 컬럼별로 정렬된 이벤트 리스트를 담아 그대로 렌더한다.
  const boardColumns = useMemo(() => {
    const today = new Date(`${todayKeyForAgenda}T00:00:00`)
    const columns: { date: string; weekdayIndex: number; items: CalendarItem[] }[] = []
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i)
      const dateKey = getLocalDateString(d)
      const weekdayIndex = d.getDay()
      const items = eventsByDate[dateKey] || []
      // 동일 정렬 규칙: 시간 보유 일정 우선(오름차순) → 우선순위 → 단지명
      const sorted = [...items].sort((a, b) => {
        const aHas = !!a.time
        const bHas = !!b.time
        if (aHas && !bHas) return -1
        if (!aHas && bHas) return 1
        if (aHas && bHas && a.time !== b.time) return (a.time || '').localeCompare(b.time || '')
        const pa = a.eventType ? EVENT_PRIORITY[a.eventType] : 9
        const pb = b.eventType ? EVENT_PRIORITY[b.eventType] : 9
        if (pa !== pb) return pa - pb
        return (a.title || '').localeCompare(b.title || '')
      })
      columns.push({ date: dateKey, weekdayIndex, items: sorted })
    }
    return columns
  }, [eventsByDate, todayKeyForAgenda])

  const boardTotalCount = useMemo(
    () => boardColumns.reduce((sum, c) => sum + c.items.length, 0),
    [boardColumns],
  )

  // 2주 보드/일정표 공통: 이벤트 타입을 색상 카테고리로 매핑.
  // siteBriefing → 초록 / documentSubmission·bidDeadline → 파랑 / businessPresentation·pt → 빨강 / opening → 회색
  const colorClassByType = (t?: ScheduleEventType, label?: string): string => {
    if (!t) return 'bid-board-item--other'
    if (t === 'siteBriefing') return 'bid-board-item--briefing'
    if (t === 'documentSubmission' || t === 'bidDeadline') return 'bid-board-item--deadline'
    if (t === 'businessPresentation' || t === 'pt') return 'bid-board-item--pt'
    if (t === 'opening') return 'bid-board-item--opening'
    // other 안에 라벨 기반 추정 (예: 라벨이 'PT'·'사업설명회'면 빨강)
    const l = (label || '').toLowerCase()
    if (/(pt|사업설명회|제안설명회|발표)/i.test(l)) return 'bid-board-item--pt'
    if (/(현설|현장설명|개별방문|현장확인)/i.test(l)) return 'bid-board-item--briefing'
    if (/(마감|서류제출)/i.test(l)) return 'bid-board-item--deadline'
    if (/(개찰)/i.test(l)) return 'bid-board-item--opening'
    return 'bid-board-item--other'
  }

  // 2주 보드용 라벨 정리 (짧고 명확한 한국어 라벨로)
  const boardLabelByType = (t?: ScheduleEventType, fallback?: string): string => {
    switch (t) {
      case 'siteBriefing':
        return '현장설명회'
      case 'documentSubmission':
        return '서류제출 마감'
      case 'bidDeadline':
        return '입찰 마감'
      case 'businessPresentation':
        return 'PT'
      case 'pt':
        return 'PT'
      case 'opening':
        return '개찰'
      default:
        return fallback || '기타'
    }
  }

  const selectedEvents = eventsByDate[selectedDate] || []

  const currentMonthDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const startOffset = firstDay.getDay()
    const dayCount = new Date(year, month + 1, 0).getDate()
    const days: Array<Date | null> = []
    for (let i = 0; i < startOffset; i++) days.push(null)
    for (let day = 1; day <= dayCount; day++) days.push(new Date(year, month, day))
    const trailing = (7 - (days.length % 7)) % 7
    for (let i = 0; i < trailing; i++) days.push(null)
    return days
  }, [currentMonth])

  const todayKey = getLocalDateString(new Date())

  const nextEvent = (field: typeof eventDefinitions[number]['field']) => {
    const upcoming = notices
      .filter((notice) => notice[field] && notice[field] >= todayKey)
      .sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0))
    return upcoming[0] || null
  }

  const nextSiteVisit = nextEvent('siteVisitDate')
  const nextDeadline = nextEvent('deadlineDate')
  const nextPt = nextEvent('ptDate')

  const handleFormChange = (key: keyof typeof defaultForm, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleAnalyze = () => {
    if (!analysisText.trim()) {
      setAnalysisResult(null)
      return
    }
    setAnalysisResult(buildAnalysisResult(analysisText))
  }

  const handleResetAnalysis = () => {
    setAnalysisResult(null)
  }

  const handleApplyAnalysisToForm = () => {
    if (!analysisResult) return
    setForm((prev) => ({
      ...prev,
      siteName: analysisResult.basicInfo.siteName || prev.siteName,
      title: analysisResult.basicInfo.title || prev.title,
      region: analysisResult.basicInfo.region || prev.region,
      totalUnits: analysisResult.basicInfo.totalUnits ?? prev.totalUnits,
      biddingMethod: analysisResult.basicInfo.biddingMethod || prev.biddingMethod,
      awardMethod: analysisResult.basicInfo.awardMethod || prev.awardMethod,
      contractStartDate: analysisResult.basicInfo.contractStartDate || prev.contractStartDate,
      contractEndDate: analysisResult.basicInfo.contractEndDate || prev.contractEndDate,
      postedDate: analysisResult.schedule.postedDate || prev.postedDate,
      siteVisitDate: analysisResult.schedule.siteVisitDate || prev.siteVisitDate,
      deadlineDate: analysisResult.schedule.deadlineDate || prev.deadlineDate,
      ptDate: analysisResult.schedule.ptDate || prev.ptDate,
      eligibility: analysisResult.participation.eligibility || prev.eligibility,
      specialConditions: prev.specialConditions || '',
      fullText: analysisText || prev.fullText,
      participationLikelihood:
        analysisResult.riskLevel === '높음' ? '보통' : analysisResult.riskLevel === '보통' ? '보통' : '높음',
      riskLevel: analysisResult.riskLevel,
      reviewMemo: analysisResult.mikReview,
    }))
  }

  // AI 공고문 분석(JSON) 결과를 공고 등록 폼에 반영. overwrite=false면 빈 항목만 채운다.
  const handleApplyAiToForm = (parsed: BidAnalysisParsed, overwrite: boolean) => {
    const pick = (prev: string, ai: string) => (overwrite ? ai || prev : prev || ai)

    const svDate = toDateInput(parsed.siteBriefingDate)
    const dlDate = toDateInput(parsed.bidDeadline)
    const { start, end } = splitContractPeriod(parsed.contractPeriod)

    const dateNotes: string[] = []
    if (parsed.siteBriefingDate && !svDate) dateNotes.push(`현장설명회 날짜 확인 필요: ${parsed.siteBriefingDate}`)
    if (parsed.bidDeadline && !dlDate) dateNotes.push(`입찰마감 날짜 확인 필요: ${parsed.bidDeadline}`)
    if (parsed.contractPeriod && !start && !end) dateNotes.push(`계약기간 확인 필요: ${parsed.contractPeriod}`)

    const gradeMap: Record<string, { p: TenderNoticeParticipation; r: TenderNoticeRiskLevel }> = {
      A: { p: '높음', r: '낮음' },
      B: { p: '높음', r: '보통' },
      C: { p: '보통', r: '보통' },
      D: { p: '낮음', r: '높음' },
    }
    const g = gradeMap[parsed.participationGrade]

    const memoParts: string[] = []
    if (parsed.participationGrade) memoParts.push(`[참여등급 ${parsed.participationGrade}] ${parsed.participationReason}`.trim())
    if (parsed.recommendedAction) memoParts.push(`다음 조치: ${parsed.recommendedAction}`)
    if (parsed.risks.length) memoParts.push(`주요 리스크: ${parsed.risks.join(' / ')}`)
    memoParts.push(...dateNotes)
    const aiMemo = memoParts.filter(Boolean).join('\n')

    setForm((prev) => ({
      ...prev,
      siteName: pick(prev.siteName, parsed.complexName),
      region: pick(prev.region, parsed.region),
      biddingMethod: pick(prev.biddingMethod, parsed.bidMethod),
      siteVisitDate: pick(prev.siteVisitDate, svDate),
      deadlineDate: pick(prev.deadlineDate, dlDate),
      contractStartDate: pick(prev.contractStartDate, start),
      contractEndDate: pick(prev.contractEndDate, end),
      specialConditions: pick(prev.specialConditions, parsed.specialConditions.join(', ')),
      participationLikelihood: g ? g.p : prev.participationLikelihood,
      riskLevel: g ? g.r : prev.riskLevel,
      reviewMemo: pick(prev.reviewMemo, aiMemo),
    }))
  }

  // AI 분석 결과로 공고(TenderNotice) 1건을 등록한다. (버튼: "AI 분석 결과로 공고 등록")
  // 등록된 공고는 공고 목록과 캘린더 양쪽에 표시된다.
  const handleRegisterAiNotice = (parsed: BidAnalysisParsed): { added: number; duplicate: boolean } => {
    const sv = toDateInput(parsed.siteBriefingDate)
    const dl = toDateInput(parsed.bidDeadline)
    const { start, end } = splitContractPeriod(parsed.contractPeriod)
    const addedCount = [sv, dl, start, end].filter(Boolean).length
    if (addedCount === 0) return { added: 0, duplicate: false }

    const siteName = parsed.complexName || '(미입력 단지)'
    const signature = [siteName, sv, dl, start, end].join('|')
    const isDup = notices.some(
      (n) => [n.siteName, n.siteVisitDate, n.deadlineDate, n.contractStartDate, n.contractEndDate].join('|') === signature,
    )
    if (isDup) return { added: 0, duplicate: true }

    const gradeMap: Record<string, { p: TenderNoticeParticipation; r: TenderNoticeRiskLevel }> = {
      A: { p: '높음', r: '낮음' },
      B: { p: '높음', r: '보통' },
      C: { p: '보통', r: '보통' },
      D: { p: '낮음', r: '높음' },
    }
    const g = gradeMap[parsed.participationGrade]

    const dateNotes: string[] = []
    if (parsed.siteBriefingDate && !sv) dateNotes.push(`현장설명회 날짜 확인 필요: ${parsed.siteBriefingDate}`)
    if (parsed.bidDeadline && !dl) dateNotes.push(`입찰마감 날짜 확인 필요: ${parsed.bidDeadline}`)
    if (parsed.contractPeriod && !start && !end) dateNotes.push(`계약기간 확인 필요: ${parsed.contractPeriod}`)

    const formPortion = {
      ...defaultForm,
      siteName,
      region: parsed.region || defaultForm.region,
      title: `${siteName} 입찰 공고 (AI 분석)`,
      biddingMethod: parsed.bidMethod || defaultForm.biddingMethod,
      siteVisitDate: sv,
      deadlineDate: dl,
      contractStartDate: start,
      contractEndDate: end,
      specialConditions: parsed.specialConditions.join(', '),
      participationLikelihood: g ? g.p : defaultForm.participationLikelihood,
      riskLevel: g ? g.r : defaultForm.riskLevel,
      reviewMemo: [`[AI 분석] ${parsed.summary}`.trim(), ...dateNotes].filter(Boolean).join('\n'),
    }

    const notice: TenderNotice = {
      id: Date.now(),
      ...formPortion,
      autoAnalysis: parseAutoAnalysis(formPortion.fullText),
      generatedSummary: buildSummaryText(formPortion, parseAutoAnalysis(formPortion.fullText)),
    }
    setNotices((prev) => [notice, ...prev])
    const firstDate = sv || dl || start || end
    if (firstDate) {
      setSelectedDate(firstDate)
      setCurrentMonth(new Date(firstDate))
    }
    return { added: addedCount, duplicate: false }
  }

  // AI 분석의 주요 일정만 캘린더(scheduleEvents)에 추가한다. 공고는 등록하지 않는다.
  // (버튼: "주요 일정만 스케줄러에 추가") AI가 scheduleEvents[]를 반환했으면 그 시간 포함 일정을 우선 사용,
  // 없으면 기존 단일 키(siteBriefingDate/bidDeadline/businessPresentationDate) 후보를 fallback으로 사용한다.
  const handleAddAiScheduleEvents = (parsed: BidAnalysisParsed): { added: number; duplicate: boolean } => {
    const complexName = parsed.complexName || '(미입력 단지)'

    type Candidate = {
      type: ScheduleEventType
      label: string
      raw: string
      date: string
      time?: string
      location?: string
      content?: string
      households?: number
      calculatedStaffCount?: number
      // 산출인원이 혼합 문자열(예: "센터장 1명, 트레이너 2명")인 경우 원문 보존.
      staffCountText?: string
      managementOfficePhone?: string
      apartmentName?: string
    }

    const candidates: Candidate[] = []

    // 1) AI가 scheduleEvents[]를 반환했으면 그 항목들을 우선 사용. 각 항목은 파서가 이미 정규화한 상태.
    if (parsed.scheduleEvents.length > 0) {
      // 파서의 ParsedScheduleEventType → 내부 ScheduleEventType 매핑.
      // 'contract'는 스케줄러 표시 대상이 아니므로 매핑 후 필터에서 자동 제외된다.
      const mapType = (t: ParsedScheduleEvent['eventType']): ScheduleEventType => {
        if (t === 'contract') return 'contractStart'
        return t as ScheduleEventType
      }
      parsed.scheduleEvents.forEach((ev: ParsedScheduleEvent) => {
        const type: ScheduleEventType = mapType(ev.eventType)
        // AI가 계약 일정을 보내도 스케줄러에는 등록하지 않는다(공고 상세/계약기간에는 남음).
        if (!isSchedulerVisible(type, ev.eventTypeLabel)) return
        candidates.push({
          type,
          label: ev.eventTypeLabel || type,
          raw: `${ev.date}${ev.time ? ' ' + ev.time : ''}`,
          date: ev.date,
          time: ev.time || undefined,
          location: ev.location || undefined,
          content: ev.content || undefined,
          households: ev.households != null ? ev.households : undefined,
          calculatedStaffCount: ev.calculatedStaffCount != null ? ev.calculatedStaffCount : undefined,
          // staffCountText: parser가 혼합 문자열을 보존한 경우 그대로 등록 흐름까지 전달.
          staffCountText: ev.staffCountText || undefined,
          managementOfficePhone: ev.managementOfficePhone || undefined,
          apartmentName: ev.apartmentName || undefined,
        })
      })
    } else {
      // 2) Fallback: 단일 키만 채워진 구버전 응답 처리. 시간 필드가 있으면 함께 등록.
      const sv = toDateInput(parsed.siteBriefingDate)
      if (sv)
        candidates.push({
          type: 'siteBriefing',
          label: '현장설명회',
          raw: parsed.siteBriefingDate,
          date: sv,
          time: parsed.siteBriefingTime || undefined,
        })
      const dl = toDateInput(parsed.bidDeadline)
      if (dl)
        candidates.push({
          type: 'bidDeadline',
          label: '입찰마감',
          raw: parsed.bidDeadline,
          date: dl,
          time: parsed.bidDeadlineTime || undefined,
        })
      const op = toDateInput(parsed.openingDate)
      if (op)
        candidates.push({
          type: 'opening',
          label: '개찰',
          raw: parsed.openingDate,
          date: op,
          time: parsed.openingTime || undefined,
        })
      const ds = toDateInput(parsed.documentSubmissionDate)
      if (ds)
        candidates.push({
          type: 'documentSubmission',
          label: '서류제출',
          raw: parsed.documentSubmissionDate,
          date: ds,
          time: parsed.documentSubmissionTime || undefined,
        })
      const pt = toDateInput(parsed.ptDate)
      if (pt)
        candidates.push({
          type: 'pt',
          label: 'PT 발표',
          raw: parsed.ptDate,
          date: pt,
          time: parsed.ptTime || undefined,
        })
      const bp = toDateInput(parsed.businessPresentationDate)
      if (bp)
        candidates.push({
          type: 'businessPresentation',
          label: '사업설명회/PT',
          raw: parsed.businessPresentationDate,
          date: bp,
          time: parsed.businessPresentationTime || undefined,
          location: parsed.businessPresentationLocation || undefined,
        })
    }

    if (candidates.length === 0) return { added: 0, duplicate: false }

    let duplicate = false
    const toAdd: ScheduleEvent[] = []
    candidates.forEach((c) => {
      const apt = c.apartmentName || complexName
      const exists =
        scheduleEvents.some(
          (e) => e.complexName === apt && e.type === c.type && e.date === c.date && (e.time || '') === (c.time || ''),
        ) ||
        toAdd.some(
          (e) => e.complexName === apt && e.type === c.type && e.date === c.date && (e.time || '') === (c.time || ''),
        )
      if (exists) {
        duplicate = true
        return
      }
      // 시간·장소가 함께 추출되었으면 메모와 content에 포함한다.
      const extra: string[] = []
      if (c.time) extra.push(`시간 ${c.time}`)
      if (c.location) extra.push(`장소 ${c.location}`)
      const memoBase = `AI 분석에서 추가 (원문: ${c.raw})`
      const memo = extra.length > 0 ? `${memoBase} / ${extra.join(' / ')}` : memoBase
      toAdd.push({
        id: `${Date.now()}-${c.type}-${Math.random().toString(36).slice(2, 7)}`,
        date: c.date,
        type: c.type,
        label: c.label,
        complexName: apt,
        memo,
        source: 'AI 분석',
        // content: 우선 AI가 명시한 내용, 없으면 시간/장소 요약을 사용.
        content: c.content || (extra.length > 0 ? extra.join(' · ') : undefined),
        category: c.label,
        createdAt: new Date().toISOString(),
        time: c.time,
        location: c.location,
        households: c.households,
        calculatedStaffCount: c.calculatedStaffCount,
        // 산출인원이 혼합 문자열(예: "센터장 1명, 트레이너 2명")인 경우 ScheduleEvent에도 그대로 보존.
        staffCountText: c.staffCountText,
        // 우선순위: 후보(scheduleEvent) 전화번호 → parsed 단지 전체 전화번호 → 빈 문자열
        managementOfficePhone: c.managementOfficePhone || parsed.managementOfficePhone || '',
      })
    })

    if (toAdd.length === 0) return { added: 0, duplicate }
    setScheduleEvents((prev) => [...toAdd, ...prev])
    const firstDate = toAdd[0].date
    setSelectedDate(firstDate)
    setCurrentMonth(new Date(firstDate))
    return { added: toAdd.length, duplicate }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const notice: TenderNotice = {
      id: Date.now(),
      ...form,
      autoAnalysis: parseAutoAnalysis(form.fullText),
      generatedSummary: buildSummaryText(form, parseAutoAnalysis(form.fullText)),
    }
    setNotices((prev) => [notice, ...prev])
    setForm(defaultForm)
    setSelectedDate(notice.postedDate || todayKey)
  }

  const handleDelete = (id: number) => {
    setNotices((prev) => prev.filter((item) => item.id !== id))
    if (selectedNotice?.id === id) setSelectedNotice(null)
  }

  const statusClass = (status: TenderNoticeStatus) => {
    switch (status) {
      case '참여예정':
        return 'status-good'
      case '보류':
        return 'status-warning'
      case '미참여':
        return 'status-muted'
      case '완료':
        return 'status-complete'
      default:
        return 'status-neutral'
    }
  }

  return (
    <div className="page tender-page tender-page--tabbed">
      <div className="report-section-header report-section-header--compact">
        <div>
          <h2>입찰공고 관리</h2>
          <p className="report-disclaimer">공고 분석 · 스케줄러 · 공고 목록을 탭으로 분리해 관리합니다.</p>
        </div>
      </div>

      {/* 입찰공고 관리 상위 탭 (3종): AI 공고문 분석 / 입찰 스케줄러 / 공고 목록·관리 */}
      <div className="bid-page-tabs" role="tablist" aria-label="입찰공고 관리 탭">
        <button
          type="button"
          role="tab"
          aria-selected={bidPageTab === 'analysis'}
          className={`bid-page-tab${bidPageTab === 'analysis' ? ' is-active' : ''}`}
          onClick={() => setBidPageTab('analysis')}
        >
          AI 공고문 분석
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={bidPageTab === 'scheduler'}
          className={`bid-page-tab${bidPageTab === 'scheduler' ? ' is-active' : ''}`}
          onClick={() => setBidPageTab('scheduler')}
        >
          입찰 스케줄러
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={bidPageTab === 'list'}
          className={`bid-page-tab${bidPageTab === 'list' ? ' is-active' : ''}`}
          onClick={() => setBidPageTab('list')}
        >
          공고 목록·관리
        </button>
      </div>

      {bidPageTab === 'analysis' && (
      <BidNoticeAIAnalysis
        onApplyToForm={handleApplyAiToForm}
        onRegisterNotice={handleRegisterAiNotice}
        onAddScheduleEvents={handleAddAiScheduleEvents}
        onJumpToScheduler={() => setBidPageTab('scheduler')}
      />
      )}

      {bidPageTab === 'scheduler' && (
      <>
      <div className="tender-summary-grid">
        <div className="tender-summary-card">
          <p className="summary-label">등록 공고 수</p>
          <p className="summary-value">{formatNumber(notices.length)}건</p>
          <p className="summary-small">등록된 입찰공고를 전체 확인할 수 있습니다.</p>
        </div>
        <div className="tender-summary-card">
          <p className="summary-label">다음 현장설명회</p>
          <p className="summary-value">{nextSiteVisit ? `${nextSiteVisit.siteName} / ${nextSiteVisit.siteVisitDate}` : '없음'}</p>
          <p className="summary-small">오늘 이후 현장설명회 일정입니다.</p>
        </div>
        <div className="tender-summary-card">
          <p className="summary-label">다음 입찰마감</p>
          <p className="summary-value">{nextDeadline ? `${nextDeadline.siteName} / ${nextDeadline.deadlineDate}` : '없음'}</p>
          <p className="summary-small">오늘 이후 입찰마감 일정입니다.</p>
        </div>
        <div className="tender-summary-card">
          <p className="summary-label">다음 PT 발표</p>
          <p className="summary-value">{nextPt ? `${nextPt.siteName} / ${nextPt.ptDate}` : '없음'}</p>
          <p className="summary-small">오늘 이후 PT 발표 일정입니다.</p>
        </div>
      </div>

      <div className="tender-scheduler-card card">
        <div className="schedule-card-header">
          <div>
            <h3>입찰 스케줄러</h3>
            <p className="summary-small">
              {schedulerView === 'board'
                ? '오늘 기준 2주치 입찰 일정을 엑셀 양식처럼 보드형으로 확인합니다.'
                : schedulerView === 'agenda'
                ? '오늘 기준 다가오는 입찰 일정을 시간순으로 한눈에 확인합니다.'
                : '월간 달력에서 주요 공고 일정을 확인하고 날짜별 일정을 선택하세요.'}
            </p>
          </div>
          <div className="schedule-controls">
            {/* 3종 보기 탭. 기본값은 2주 보드 보기. 데이터는 동일한 eventsByDate를 공유. */}
            <div className="bid-scheduler-tabs" role="tablist" aria-label="스케줄러 보기 모드">
              <button
                type="button"
                role="tab"
                aria-selected={schedulerView === 'board'}
                className={`bid-scheduler-tab${schedulerView === 'board' ? ' is-active' : ''}`}
                onClick={() => setSchedulerView('board')}
              >
                2주 보드 보기
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={schedulerView === 'agenda'}
                className={`bid-scheduler-tab${schedulerView === 'agenda' ? ' is-active' : ''}`}
                onClick={() => setSchedulerView('agenda')}
              >
                일정표 보기
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={schedulerView === 'calendar'}
                className={`bid-scheduler-tab${schedulerView === 'calendar' ? ' is-active' : ''}`}
                onClick={() => setSchedulerView('calendar')}
              >
                월간 달력 보기
              </button>
            </div>
            {schedulerView === 'calendar' && (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
                  이전
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
                  다음
                </button>
              </>
            )}
          </div>
        </div>

        {schedulerView === 'board' ? (
          <div className="bid-board-view">
            <div className="bid-board-toolbar">
              <ul className="bid-board-legend" aria-label="색상 범례">
                <li><span className="legend-dot legend-briefing" /> 현설/개별방문 (초록)</li>
                <li><span className="legend-dot legend-deadline" /> 마감/서류제출 (파랑)</li>
                <li><span className="legend-dot legend-pt" /> PT/사업설명회 (빨강)</li>
                <li><span className="legend-dot legend-opening" /> 개찰 (회색)</li>
              </ul>
              <span className="bid-board-count">
                오늘부터 2주 · 총 {boardTotalCount}건
              </span>
            </div>
            <div className="bid-board-grid-wrap">
              {/* 1주차(오늘 ~ +6) · 2주차(+7 ~ +13)로 분리해 2줄로 누적. 달력 주차 기준이 아님. */}
              <div className="bid-board-weeks">
                {([
                  { label: '1주차', cols: boardColumns.slice(0, 7) },
                  { label: '2주차', cols: boardColumns.slice(7, 14) },
                ] as const).map((week) => {
                  const first = week.cols[0]?.date
                  const last = week.cols[week.cols.length - 1]?.date
                  const range = first && last ? `${first.replace(/-/g, '.')} ~ ${last.replace(/-/g, '.')}` : ''
                  return (
                    <section key={week.label} className="bid-board-week">
                      <h4 className="bid-board-week-title">
                        <span>{week.label}</span>
                        {range && <span className="bid-board-week-range">· {range}</span>}
                      </h4>
                      <div className="bid-board-week-grid">
                        {week.cols.map((col) => {
                          // 요일별 헤더 클래스: 토(파랑) / 일(빨강) / 평일(노랑)
                          const headerCls =
                            col.weekdayIndex === 0
                              ? 'bid-board-header bid-board-header--sun'
                              : col.weekdayIndex === 6
                              ? 'bid-board-header bid-board-header--sat'
                              : 'bid-board-header'
                          return (
                            <div key={col.date} className="bid-board-column">
                              <div className={headerCls}>
                                <div className="bid-board-header-date">
                                  {col.date.replace(/-/g, '.')}
                                </div>
                                <div className="bid-board-header-weekday">{formatWeekday(col.date)}</div>
                              </div>
                              <div className="bid-board-cell">
                                {col.items.length === 0 ? (
                                  <div className="bid-board-empty">·</div>
                                ) : (
                                  col.items.map((item) => {
                                    const colorCls = colorClassByType(item.eventType, item.label)
                                    const label = boardLabelByType(item.eventType, item.label)
                                    const timeText = item.time || '시간 미정'
                                    const householdsText = item.households
                                      ? `${formatNumber(item.households)}세대`
                                      : '세대수 확인 필요'
                                    // 산출인원 우선순위 fallback (calculatedStaffCount → requiredStaffCount → staffCount → requiredPersonnel → staffingCount → staffCountText)
                                    const staff = pickStaffDisplay(
                                      item.calculatedStaffCount,
                                      item.requiredStaffCount,
                                      item.staffCount,
                                      item.requiredPersonnel,
                                      item.staffingCount,
                                      item.staffCountText,
                                    )
                                    const staffText = staff.num
                                      ? `산출 ${staff.num}명`
                                      : staff.text
                                      ? staff.text
                                      : '산출인원 확인 필요'
                                    const phoneText = item.managementOfficePhone
                                      ? item.managementOfficePhone
                                      : '전화번호 확인 필요'
                                    return (
                                      <div key={item.uid} className={`bid-board-item ${colorCls}`}>
                                        <div className="bid-board-item-title">{item.title || '단지명 확인 필요'}</div>
                                        <div className="bid-board-item-meta">
                                          ({householdsText}) / {staffText}
                                        </div>
                                        <div className="bid-board-item-kind">
                                          {label} {timeText}
                                        </div>
                                        <div className="bid-board-item-phone">{phoneText}</div>
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            </div>
          </div>
        ) : schedulerView === 'agenda' ? (
          <>
            {/* 범위 토글 + 결과 카운트 */}
            <div className="agenda-toolbar">
              <div className="agenda-range-toggle" role="tablist" aria-label="일정표 범위">
                {(
                  [
                    { key: '2w' as const, label: '2주' },
                    { key: '3w' as const, label: '3주' },
                    { key: 'all' as const, label: '전체' },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    role="tab"
                    aria-selected={agendaRange === opt.key}
                    className={`btn btn-secondary${agendaRange === opt.key ? ' is-active' : ''}`}
                    onClick={() => setAgendaRange(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="agenda-count">
                {agendaRange === 'all' ? '전체' : agendaRange === '2w' ? '2주 내' : '3주 내'} 총{' '}
                {agendaTotalCount}건
              </span>
            </div>

            {agendaGroups.length === 0 ? (
              <p className="agenda-empty">
                {agendaRange === 'all'
                  ? '등록된 다가오는 일정이 없습니다. AI 분석 결과에서 "주요 일정만 스케줄러에 추가"를 사용하거나 공고를 등록해보세요.'
                  : `오늘 기준 ${agendaRange === '2w' ? '2주' : '3주'} 내 예정된 일정이 없습니다. 범위를 "전체"로 바꾸거나 일정을 추가해주세요.`}
              </p>
            ) : (
              <div className="agenda-list">
                {agendaGroups.map((group) => (
                  <section key={group.date} className="agenda-day">
                    <header className="agenda-day-header">
                      <span className="agenda-day-date">{group.date}</span>
                      <span className="agenda-day-weekday">{formatWeekday(group.date)}</span>
                      <span className="agenda-day-count">{group.items.length}건</span>
                    </header>
                    <div className="agenda-table-wrap">
                      <table className="agenda-table">
                        <thead>
                          <tr>
                            <th>일시</th>
                            <th>항목</th>
                            <th>단지명</th>
                            <th>세대수</th>
                            <th>산출인원</th>
                            <th>내용</th>
                            <th>관리소 전화번호</th>
                            <th>출처</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => {
                            // 일시 표시: YYYY.MM.DD HH:mm 또는 YYYY.MM.DD 시간 미정
                            const dotDate = group.date.replace(/-/g, '.')
                            const dateTimeLabel = item.time
                              ? `${dotDate} ${item.time}`
                              : `${dotDate} 시간 미정`
                            return (
                            <tr key={item.uid}>
                              <td className={item.time ? 'agenda-time' : 'agenda-time agenda-time-empty'}>
                                {dateTimeLabel}
                              </td>
                              <td>
                                <span className={`event-badge ${item.badge}`}>{item.label}</span>
                              </td>
                              <td className="agenda-name">{item.title || '(미입력 단지)'}</td>
                              <td className="agenda-num">
                                {item.households ? `${formatNumber(item.households)}세대` : '세대수 확인 필요'}
                              </td>
                              <td className="agenda-num">
                                {item.calculatedStaffCount ? `${item.calculatedStaffCount}명` : '산출인원 확인 필요'}
                              </td>
                              <td className="agenda-content">
                                {item.content ||
                                  (item.kind === 'notice' && item.notice ? item.notice.title : '') ||
                                  item.memo ||
                                  '-'}
                                {item.location && (
                                  <div className="agenda-sub">장소 {item.location}</div>
                                )}
                              </td>
                              <td className="agenda-phone">
                                {item.managementOfficePhone || '전화번호 확인 필요'}
                              </td>
                              <td>
                                <span
                                  className={`agenda-source-badge${
                                    item.source === 'AI 분석' ? ' agenda-source-ai' : ' agenda-source-manual'
                                  }`}
                                >
                                  {item.source === 'AI 분석' ? 'AI 일정' : '수동'}
                                </span>
                              </td>
                            </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
        <div className="schedule-month-title">
          {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
        </div>
        <div className="calendar-grid">
          {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => (
            <div key={weekday} className="calendar-weekday">
              {weekday}
            </div>
          ))}
          {currentMonthDays.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="calendar-cell empty" />
            }
            const dateKey = getLocalDateString(day)
            const events = eventsByDate[dateKey] || []
            const isToday = dateKey === todayKey
            const isSelected = dateKey === selectedDate
            return (
              <button
                key={dateKey}
                type="button"
                className={`calendar-cell ${isToday ? 'calendar-today' : ''} ${isSelected ? 'calendar-selected' : ''}`}
                onClick={() => setSelectedDate(dateKey)}
              >
                <div className="calendar-date-label">{day.getDate()}</div>
                <div className="calendar-event-list">
                  {events.slice(0, 3).map((item) => {
                    // 풍부한 카드: 단지명/세대수/산출인원/내용/관리소 전화번호 (없으면 행 자체를 생략)
                    const metaParts: string[] = []
                    if (item.households) metaParts.push(`${formatNumber(item.households)}세대`)
                    if (item.calculatedStaffCount) metaParts.push(`산출 ${item.calculatedStaffCount}명`)
                    // 카드 상단 시간 표시: 'HH:mm' 또는 '시간 미정'
                    const timeLabel = item.time || '시간 미정'
                    return (
                      <div key={item.uid} className={`calendar-event-card ${item.badge}`}>
                        <span className={`event-badge ${item.badge}`}>{item.label}</span>
                        <div className="calendar-event-card-body">
                          <div className="calendar-event-card-time">{timeLabel}</div>
                          <div className="calendar-event-card-title">{item.title || '(미입력 단지)'}</div>
                          {metaParts.length > 0 && (
                            <div className="calendar-event-card-meta">{metaParts.join(' · ')}</div>
                          )}
                          {item.content && (
                            <div className="calendar-event-card-content">{item.content}</div>
                          )}
                          {item.managementOfficePhone && (
                            <div className="calendar-event-card-phone">관리소 {item.managementOfficePhone}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {events.length > 3 && <span className="event-badge event-more">+{events.length - 3}개</span>}
                </div>
              </button>
            )
          })}
        </div>
        <div className="calendar-detail-card">
          <h4>{selectedDate} 일정 목록</h4>
          {selectedEvents.length > 0 ? (
            selectedEvents.map((item) => (
              <div key={item.uid} className="calendar-event-row">
                <span className={`event-badge ${item.badge}`}>{item.label}</span>
                <div>
                  <strong>{item.title}</strong>
                  {item.kind === 'notice' && item.notice ? ` | ${item.notice.title}` : ' | AI 일정'}
                  <div className="calendar-event-meta">
                    <span>일정: {selectedDate}</span>
                    {item.households ? <span>세대수: {formatNumber(item.households)}세대</span> : null}
                    {item.calculatedStaffCount ? <span>산출인원: {item.calculatedStaffCount}명</span> : null}
                    {item.managementOfficePhone ? <span>관리소: {item.managementOfficePhone}</span> : null}
                    {item.kind === 'notice' && item.notice ? (
                      <>
                        <span>참여 가능성: {item.notice.participationLikelihood}</span>
                        <span>리스크: {item.notice.riskLevel}</span>
                        <span>상태: {item.notice.status}</span>
                      </>
                    ) : (
                      <span>{item.memo || 'AI 분석에서 추가된 일정'}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="summary-small">선택한 날짜에 예정된 일정이 없습니다.</p>
          )}
        </div>
          </>
        )}
      </div>

      </>
      )}

      {bidPageTab === 'analysis' && (
      <div className="tender-analysis-card card">
        <div className="analysis-header">
          <div>
            <h3>공고문 자동분석 (텍스트 파서)</h3>
            <p className="summary-small">공고문 원문을 붙여넣고 분석 버튼을 누르면 주요 일정과 리스크를 추출합니다.</p>
          </div>
        </div>
        <div className="analysis-input-grid">
          <div className="analysis-input-group">
            <label>공고문 원문</label>
            <textarea
              value={analysisText}
              rows={10}
              onChange={(e) => setAnalysisText(e.target.value)}
              placeholder="입찰공고 원문을 붙여넣고 분석을 실행하세요."
            />
          </div>
          <div className="analysis-actions">
            <button type="button" className="btn btn-primary" onClick={handleAnalyze}>
              공고문 분석
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleResetAnalysis}>
              분석 결과 초기화
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleApplyAnalysisToForm} disabled={!analysisResult}>
              등록폼 자동 반영
            </button>
          </div>
        </div>
        {analysisResult && (
          <div className="analysis-result-grid">
            <div className="analysis-card card">
              <h4>주요 일정</h4>
              <ul className="analysis-list">
                <li>공고 게시일: {analysisResult.schedule.postedDate || '-'}</li>
                <li>현장설명회: {analysisResult.schedule.siteVisitDate || '-'} {analysisResult.schedule.siteVisitTime ?? ''}</li>
                <li>현설 장소: {analysisResult.schedule.siteVisitPlace || '-'}</li>
                <li>서류 제출 마감일: {analysisResult.schedule.deadlineDate || '-'} {analysisResult.schedule.deadlineTime ?? ''}</li>
                <li>입찰 마감일: {analysisResult.schedule.deadlineDate || '-'}</li>
                <li>개찰일: {analysisResult.schedule.openingDate || '-'} {analysisResult.schedule.openingTime ?? ''}</li>
                <li>PT 발표일: {analysisResult.schedule.ptDate || '-'} {analysisResult.schedule.ptTime ?? ''}</li>
              </ul>
            </div>
            <div className="analysis-card card">
              <h4>참가자격</h4>
              <p>{analysisResult.participation.eligibility || '추출된 참가자격 정보가 없습니다.'}</p>
              <ul className="analysis-list">
                {analysisResult.participation.performanceRequirement && <li>실적요건 있음</li>}
                {analysisResult.participation.capitalRequirement && <li>자본금 요건: {analysisResult.participation.capitalRequirement}</li>}
                {analysisResult.participation.licenseRequirement && <li>면허/등록 요건: {analysisResult.participation.licenseRequirement}</li>}
                {analysisResult.participation.attendanceRequired && <li>현장설명회 참석 필수</li>}
                {analysisResult.participation.jointSupplyAllowed && <li>공동수급 가능</li>}
                {analysisResult.participation.subcontractLimit && <li>하도급 제한</li>}
              </ul>
            </div>
            <div className="analysis-card card">
              <h4>제출서류</h4>
              {analysisResult.documents.length > 0 ? (
                <ul className="analysis-list">
                  {analysisResult.documents.map((doc) => (
                    <li key={doc}>{doc}</li>
                  ))}
                </ul>
              ) : (
                <p>공고문에서 제출서류 항목을 추가로 확인해야 합니다.</p>
              )}
            </div>
            <div className="analysis-card card">
              <h4>리스크 분석</h4>
              <p>리스크 등급: <strong>{analysisResult.riskLevel}</strong></p>
              {analysisResult.riskKeywords.length > 0 ? (
                <ul className="analysis-list">
                  {analysisResult.riskKeywords.map((keyword) => (
                    <li key={keyword}>{keyword}</li>
                  ))}
                </ul>
              ) : (
                <p>명확한 리스크 키워드가 포착되지 않았습니다.</p>
              )}
            </div>
            <div className="analysis-card card">
              <h4>MIK 참여 검토</h4>
              <p>{analysisResult.mikReview}</p>
            </div>
            <div className="analysis-card card">
              <h4>누락 확인 필요 항목</h4>
              {analysisResult.missing.length > 0 ? (
                <ul className="analysis-list">
                  {analysisResult.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>추가 누락 확인 항목이 없습니다.</p>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {bidPageTab === 'list' && (
      <>
      <div className="tender-main-grid">
        <form className="tender-form-card card" onSubmit={handleSubmit}>
          <h3>입찰공고 등록</h3>
          <div className="form-row">
            <div className="form-group">
              <label>단지명</label>
              <input value={form.siteName} onChange={(e) => handleFormChange('siteName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>지역</label>
              <input value={form.region} onChange={(e) => handleFormChange('region', e.target.value)} />
            </div>
            <div className="form-group">
              <label>세대수</label>
              <input type="number" min="0" value={form.totalUnits} onChange={(e) => handleFormChange('totalUnits', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>공고명</label>
              <input value={form.title} onChange={(e) => handleFormChange('title', e.target.value)} />
            </div>
            <div className="form-group">
              <label>공고 게시일</label>
              <input type="date" value={form.postedDate} onChange={(e) => handleFormChange('postedDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label>현장설명회 일자</label>
              <input type="date" value={form.siteVisitDate} onChange={(e) => handleFormChange('siteVisitDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label>입찰 마감일</label>
              <input type="date" value={form.deadlineDate} onChange={(e) => handleFormChange('deadlineDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label>PT 발표일</label>
              <input type="date" value={form.ptDate} onChange={(e) => handleFormChange('ptDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label>계약 시작일</label>
              <input type="date" value={form.contractStartDate} onChange={(e) => handleFormChange('contractStartDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label>계약 종료일</label>
              <input type="date" value={form.contractEndDate} onChange={(e) => handleFormChange('contractEndDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label>입찰방식</label>
              <input value={form.biddingMethod} onChange={(e) => handleFormChange('biddingMethod', e.target.value)} />
            </div>
            <div className="form-group">
              <label>낙찰방식</label>
              <input value={form.awardMethod} onChange={(e) => handleFormChange('awardMethod', e.target.value)} />
            </div>
            <div className="form-group">
              <label>참가자격</label>
              <input value={form.eligibility} onChange={(e) => handleFormChange('eligibility', e.target.value)} />
            </div>
            <div className="form-group">
              <label>특이조건</label>
              <input value={form.specialConditions} onChange={(e) => handleFormChange('specialConditions', e.target.value)} />
            </div>
            <div className="form-group">
              <label>MIK 참여 가능성</label>
              <select value={form.participationLikelihood} onChange={(e) => handleFormChange('participationLikelihood', e.target.value as TenderNoticeParticipation)}>
                <option value="높음">높음</option>
                <option value="보통">보통</option>
                <option value="낮음">낮음</option>
              </select>
            </div>
            <div className="form-group">
              <label>리스크 등급</label>
              <select value={form.riskLevel} onChange={(e) => handleFormChange('riskLevel', e.target.value as TenderNoticeRiskLevel)}>
                <option value="낮음">낮음</option>
                <option value="보통">보통</option>
                <option value="높음">높음</option>
              </select>
            </div>
            <div className="form-group">
              <label>예상 필요 인력</label>
              <input type="number" min="0" value={form.estimatedStaff} onChange={(e) => handleFormChange('estimatedStaff', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>예상 월 운영비</label>
              <input type="number" min="0" value={form.estimatedMonthlyCost} onChange={(e) => handleFormChange('estimatedMonthlyCost', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>예상 월 수익</label>
              <input type="number" min="0" value={form.estimatedMonthlyRevenue} onChange={(e) => handleFormChange('estimatedMonthlyRevenue', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>상태</label>
              <select value={form.status} onChange={(e) => handleFormChange('status', e.target.value as TenderNoticeStatus)}>
                <option value="검토중">검토중</option>
                <option value="참여예정">참여예정</option>
                <option value="보류">보류</option>
                <option value="미참여">미참여</option>
                <option value="완료">완료</option>
              </select>
            </div>
            <div className="form-group form-group-full">
              <label>공고문 원문</label>
              <textarea value={form.fullText} rows={8} onChange={(e) => handleFormChange('fullText', e.target.value)} />
            </div>
            <div className="form-group form-group-full">
              <label>검토 메모</label>
              <textarea value={form.reviewMemo} rows={4} onChange={(e) => handleFormChange('reviewMemo', e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">공고 등록</button>
          </div>
        </form>

        <div className="tender-review-cards">
          <div className="tender-review-card card">
            <h4>참여 가능성 판단</h4>
            <p>{generatedSummary.participation}</p>
          </div>
          <div className="tender-review-card card">
            <h4>주요 리스크</h4>
            <p>{generatedSummary.risks}</p>
          </div>
          <div className="tender-review-card card">
            <h4>준비 필요 서류</h4>
            <p>{generatedSummary.documents}</p>
          </div>
          <div className="tender-review-card card">
            <h4>예상 일정</h4>
            <p>{generatedSummary.schedule}</p>
          </div>
          <div className="tender-review-card card">
            <h4>MIK 검토 의견</h4>
            <p>{generatedSummary.mikOpinion}</p>
          </div>
          <div className="tender-review-card card">
            <h4>자동 분석 결과</h4>
            <ul className="review-list">
              <li>현장설명회 필요: {autoAnalysis.siteVisitRequired ? '예' : '아니오'}</li>
              <li>PT 필요: {autoAnalysis.ptRequired ? '예' : '아니오'}</li>
              <li>가격경쟁 리스크: {autoAnalysis.priceRisk ? '예' : '아니오'}</li>
              <li>정성평가 가능성: {autoAnalysis.qualitativePossible ? '예' : '아니오'}</li>
              <li>실적요건: {autoAnalysis.performanceRequirement ? '예' : '아니오'}</li>
              <li>보증보험 필요: {autoAnalysis.guaranteeRequired ? '예' : '아니오'}</li>
              <li>금품/무상지원 리스크: {autoAnalysis.freeSupportRisk ? '예' : '아니오'}</li>
            </ul>
          </div>
        </div>
      </div>

      {selectedNotice && (
        <div className="tender-detail-card card">
          <div className="detail-header">
            <div>
              <h3>공고 상세보기</h3>
              <p className="summary-small">선택한 공고의 주요 정보와 자동 분석 결과를 확인합니다.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setSelectedNotice(null)}>
              닫기
            </button>
          </div>
          <div className="detail-grid">
            <div>
              <strong>단지명</strong>
              <p>{selectedNotice.siteName || '-'}</p>
            </div>
            <div>
              <strong>공고명</strong>
              <p>{selectedNotice.title || '-'}</p>
            </div>
            <div>
              <strong>지역</strong>
              <p>{selectedNotice.region || '-'}</p>
            </div>
            <div>
              <strong>세대수</strong>
              <p>{selectedNotice.totalUnits ? formatNumber(selectedNotice.totalUnits) : '-'}</p>
            </div>
            <div>
              <strong>계약기간</strong>
              <p>{selectedNotice.contractStartDate && selectedNotice.contractEndDate ? `${selectedNotice.contractStartDate} ~ ${selectedNotice.contractEndDate}` : '-'}</p>
            </div>
            <div>
              <strong>입찰방식</strong>
              <p>{selectedNotice.biddingMethod || '-'}</p>
            </div>
            <div>
              <strong>낙찰방식</strong>
              <p>{selectedNotice.awardMethod || '-'}</p>
            </div>
            <div>
              <strong>참가자격</strong>
              <p>{selectedNotice.eligibility || '-'}</p>
            </div>
            <div>
              <strong>특이조건</strong>
              <p>{selectedNotice.specialConditions || '-'}</p>
            </div>
            <div>
              <strong>MIK 참여 가능성</strong>
              <p>{selectedNotice.participationLikelihood}</p>
            </div>
            <div>
              <strong>리스크 등급</strong>
              <p>{selectedNotice.riskLevel}</p>
            </div>
          </div>
          <div className="detail-schedule-list">
            <h4>주요 일정</h4>
            <ul>
              <li>공고 게시일: {selectedNotice.postedDate || '-'}</li>
              <li>현장설명회: {selectedNotice.siteVisitDate || '-'}</li>
              <li>입찰 마감일: {selectedNotice.deadlineDate || '-'}</li>
              <li>PT 발표일: {selectedNotice.ptDate || '-'}</li>
            </ul>
          </div>
          <div className="detail-fulltext">
            <div className="detail-fulltext-header">
              <strong>공고문 원문</strong>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowRawText((prev) => !prev)}>
                {showRawText ? '숨기기' : '펼치기'}
              </button>
            </div>
            {showRawText && <pre>{selectedNotice.fullText || '등록된 공고문 원문이 없습니다.'}</pre>}
          </div>
          <div>
            <strong>검토 메모</strong>
            <p>{selectedNotice.reviewMemo || '-'}</p>
          </div>
        </div>
      )}

      <div className="tender-list-card card">
        <h3>입찰공고 목록</h3>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>단지명</th>
                <th>지역</th>
                <th>세대수</th>
                <th>현장설명회</th>
                <th>입찰마감일</th>
                <th>PT일</th>
                <th>참여 가능성</th>
                <th>리스크</th>
                <th>상태</th>
                <th>상세</th>
                <th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((notice) => (
                <tr key={notice.id}>
                  <td data-label="단지명">{notice.siteName}</td>
                  <td data-label="지역">{notice.region}</td>
                  <td data-label="세대수">{formatNumber(notice.totalUnits)}</td>
                  <td data-label="현장설명회">{notice.siteVisitDate || '-'}</td>
                  <td data-label="입찰마감일">{notice.deadlineDate || '-'}</td>
                  <td data-label="PT일">{notice.ptDate || '-'}</td>
                  <td data-label="참여 가능성">{notice.participationLikelihood}</td>
                  <td data-label="리스크">{notice.riskLevel}</td>
                  <td data-label="상태">
                    <span className={`status-chip ${statusClass(notice.status)}`}>{notice.status}</span>
                  </td>
                  <td data-label="상세">
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => setSelectedNotice(notice)}>
                      상세보기
                    </button>
                  </td>
                  <td data-label="삭제">
                    <button type="button" className="btn btn-danger btn-small" onClick={() => handleDelete(notice.id)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {notices.length === 0 && (
                <tr>
                  <td colSpan={11} className="placeholder-content">
                    등록된 입찰공고가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  )
}

export default TenderNotices
