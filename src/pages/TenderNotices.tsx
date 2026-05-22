import { FormEvent, useEffect, useMemo, useState } from 'react'
import { formatNumber } from '../utils/formatUtils'
import {
  TenderNotice,
  TenderNoticeParticipation,
  TenderNoticeRiskLevel,
  TenderNoticeStatus,
} from '../types/CommunityData'
import BidNoticeAIAnalysis from '../components/BidNoticeAIAnalysis'
import './TenderNotices.css'

const STORAGE_KEY = 'tenderNotices'

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
  const [notices, setNotices] = useState<TenderNotice[]>([])
  const [form, setForm] = useState(defaultForm)
  const [analysisText, setAnalysisText] = useState('')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [selectedNotice, setSelectedNotice] = useState<TenderNotice | null>(null)
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()))
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showRawText, setShowRawText] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as TenderNotice[]
      if (Array.isArray(parsed)) {
        setNotices(parsed)
      }
    } catch {
      // Ignore invalid data
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notices))
  }, [notices])

  const autoAnalysis = useMemo(() => parseAutoAnalysis(form.fullText), [form.fullText])
  const generatedSummary = useMemo(() => buildSummaryText(form, autoAnalysis), [form, autoAnalysis])

  const eventDefinitions = [
    { field: 'siteVisitDate' as const, label: '현설', badge: 'schedule-site-visit' },
    { field: 'deadlineDate' as const, label: '마감', badge: 'schedule-deadline' },
    { field: 'ptDate' as const, label: 'PT', badge: 'schedule-pt' },
    { field: 'contractStartDate' as const, label: '계약시작', badge: 'schedule-contract-start' },
    { field: 'contractEndDate' as const, label: '계약종료', badge: 'schedule-contract-end' },
  ]

  const eventsByDate = useMemo(() => {
    const map: Record<string, Array<{ notice: TenderNotice; field: typeof eventDefinitions[number]['field'] }>> = {}
    notices.forEach((notice) => {
      eventDefinitions.forEach((eventDef) => {
        const value = notice[eventDef.field]
        if (value) {
          map[value] = map[value] || []
          map[value].push({ notice, field: eventDef.field })
        }
      })
    })
    return map
  }, [notices])

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
    <div className="page tender-page">
      <div className="report-section-header">
        <div>
          <h2>입찰공고 관리</h2>
          <p className="report-disclaimer">입찰공고 등록, 달력 기반 스케줄러, 자동 분석 및 참여 검토 결과를 한 곳에서 관리합니다.</p>
        </div>
      </div>

      <BidNoticeAIAnalysis />

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
            <p className="summary-small">월간 달력에서 주요 공고 일정을 확인하고 날짜별 일정을 선택하세요.</p>
          </div>
          <div className="schedule-controls">
            <button type="button" className="btn btn-secondary" onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
              이전
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
              다음
            </button>
          </div>
        </div>
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
                  {events.slice(0, 3).map((item, index) => {
                    const eventDef = eventDefinitions.find((def) => def.field === item.field)
                    return (
                      <span key={`${dateKey}-${item.notice.id}-${index}`} className={`event-badge ${eventDef?.badge || ''}`}>
                        {eventDef?.label}: {item.notice.siteName}
                      </span>
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
            selectedEvents.map((item, index) => {
              const eventDef = eventDefinitions.find((def) => def.field === item.field)
              return (
                <div key={`${item.notice.id}-${item.field}-${index}`} className="calendar-event-row">
                  <span className={`event-badge ${eventDef?.badge || ''}`}>{eventDef?.label}</span>
                  <div>
                    <strong>{item.notice.siteName}</strong> | {item.notice.title}
                    <div className="calendar-event-meta">
                      <span>일정: {selectedDate}</span>
                      <span>참여 가능성: {item.notice.participationLikelihood}</span>
                      <span>리스크: {item.notice.riskLevel}</span>
                      <span>상태: {item.notice.status}</span>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <p className="summary-small">선택한 날짜에 예정된 일정이 없습니다.</p>
          )}
        </div>
      </div>

      <div className="tender-analysis-card card">
        <div className="analysis-header">
          <div>
            <h3>공고문 자동분석</h3>
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
    </div>
  )
}

export default TenderNotices
