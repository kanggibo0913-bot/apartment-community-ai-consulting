export type FacilityName =
  | '헬스장'
  | '골프장'
  | 'GX룸'
  | '독서실'
  | '사우나'
  | '카페'
  | '다목적실'
  | '키즈룸'
  | '기타 시설'

export type FacilityOperatingStatus = '운영중' | '미운영'
export type FacilityPaidType = '유료' | '무료'

export interface FacilityDetail {
  id: number
  name: FacilityName
  enabled: boolean
  operatingStatus: FacilityOperatingStatus
  paidType: FacilityPaidType
  peakHours: string
  notes: string
}

export interface ApartmentInfoData {
  name: string
  region: string
  totalUnits: number
  buildingCount: number
  builtYear: number
  communityArea: number
  officeName: string
  remarks: string
}

export interface OperationInfoData {
  weekdayHours: string
  weekendHours: string
  holidays: string
  staffCount: number
  openStaffNeeded: boolean
  closeStaffNeeded: boolean
  unmannedHours: string
  currentIssues: string
}

export interface CostInfoData {
  salaries: number
  electricity: number
  water: number
  hvac: number
  supplies: number
  maintenance: number
  cleaning: number
  other: number
}

export interface RevenueInfoData {
  usageFee: number
  ptFee: number
  gxFee: number
  golfLesson: number
  cafeSales: number
  rentalIncome: number
  otherIncome: number
}

export type DiagnosisGrade = '양호' | '관리 필요' | '개선 필요' | '긴급 개선 필요'

export interface AnalysisMetrics {
  totalCost: number
  totalRevenue: number
  profit: number
  laborRatio: number
  unresolvedComplaints: number
  repeatComplaints: number
  activeFacilityCount: number
  staffCount: number
  totalUnits: number
}

export interface AnalysisResult {
  grade: DiagnosisGrade
  metrics: AnalysisMetrics
  laborCostAnalysis: string
  costAnalysis: string
  revenueAnalysis: string
  complaintAnalysis: string
  complaintTypeAnalysis: string
  repeatComplaintRisk: string
  facilityStaffAnalysis: string
  operationOptimization: string
  improvementAdvice: string
  automationReview: string
  coreRisks: string[]
  priorityTasks: string[]
  expectedBenefits: string[]
  summary: string
  keyTakeaways: string[]
}

export interface ReportSection {
  title: string
  body: string[]
}

export type OutputType =
  | '운영 진단 보고서'
  | '월간 운영 리포트'
  | '입대의 보고용 제안서'
  | 'PPT 초안'

export interface OutputSection {
  title: string
  body: string[]
}

export interface MonthlyReport {
  generatedAt: string
  fullText: string
  sections: OutputSection[]
  reviewItems: string[]
}

export interface ProposalDraft {
  generatedAt: string
  fullText: string
  sections: OutputSection[]
  reviewItems: string[]
}

export interface PptSlide {
  slideNumber: number
  title: string
  keyMessage: string
  bulletPoints: string[]
  visualSuggestion: string
  speakerNote: string
}

export interface PptOutline {
  generatedAt: string
  fullText: string
  slides: PptSlide[]
}

export interface ReportDraftOutput {
  generatedAt: string
  fullText: string
  sections: ReportSection[]
  reviewItems: string[]
  needsInputNote: string
}

export type ComplaintType =
  | '시설 고장'
  | '청소 상태'
  | '운영시간'
  | '직원 응대'
  | '프로그램 불만'
  | '요금 관련'
  | '기타'

export type ComplaintStatus = '접수' | '진행 중' | '완료' | '반복 민원'

export interface ComplaintItem {
  id: number
  content: string
  type: ComplaintType
  status: ComplaintStatus
  date: string
  action: string
}

export interface CommunityData {
  apartmentInfo: ApartmentInfoData
  facilityInfo: {
    items: FacilityDetail[]
  }
  operationInfo: OperationInfoData
  costInfo: CostInfoData
  revenueInfo: RevenueInfoData
  complaints: ComplaintItem[]
}
