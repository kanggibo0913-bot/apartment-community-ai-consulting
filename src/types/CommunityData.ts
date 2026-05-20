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

export type DiagnosisGrade = '양호' | '주의' | '위험'

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
  | '입주자대표회의 보고용 요약'
  | 'MIK 내부 검토표'

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

export type TenderNoticeStatus = '검토중' | '참여예정' | '보류' | '미참여' | '완료'
export type TenderNoticeRiskLevel = '낮음' | '보통' | '높음'
export type TenderNoticeParticipation = '높음' | '보통' | '낮음'

export interface TenderNotice {
  id: number
  siteName: string
  region: string
  totalUnits: number
  title: string
  postedDate: string
  siteVisitDate: string
  deadlineDate: string
  ptDate: string
  contractStartDate: string
  contractEndDate: string
  biddingMethod: string
  awardMethod: string
  eligibility: string
  specialConditions: string
  fullText: string
  participationLikelihood: TenderNoticeParticipation
  riskLevel: TenderNoticeRiskLevel
  estimatedStaff: number
  estimatedMonthlyCost: number
  estimatedMonthlyRevenue: number
  reviewMemo: string
  status: TenderNoticeStatus
  autoAnalysis: {
    siteVisitRequired: boolean
    ptRequired: boolean
    priceRisk: boolean
    qualitativePossible: boolean
    performanceRequirement: boolean
    guaranteeRequired: boolean
    freeSupportRisk: boolean
  }
  generatedSummary: {
    participation: string
    risks: string
    documents: string
    schedule: string
    mikOpinion: string
  }
}

export type PayType = '시급제' | '월급제'

export interface EstimateStaffRow {
  id: number
  role: string
  count: number
  workDaysPerMonth: number
  hoursPerDay: number
  payType: PayType
  hourlyWage: number
  monthlySalary: number
  nightHours: number
  overtimeHours: number
  weeklyHoliday: boolean
  note: string
}

export interface EstimateJobRole {
  id: number
  name: string
  active: boolean
  weekdayHoursText: string
  weekendHoursText: string
  weekdayDailyHours: number
  weekendDailyHours: number
  nightHours: number
  positionAllowance: number
}

export interface EstimateDirectCosts {
  consumables: number
  cleaningSupplies: number
  officeSupplies: number
  fitnessMaintenance: number
  golfMaintenance: number
  programBudget: number
  insurance: number
  training: number
  uniforms: number
  communication: number
  other: number
}

export interface EstimateSheet {
  id: number
  name: string
  createdAt: string
  selectedTenderId?: number
  selectedTenderTitle: string
  siteName: string
  region: string
  totalUnits: number
  title: string
  contractStartDate: string
  contractEndDate: string
  biddingMethod: string
  awardMethod: string
  participationLikelihood: TenderNoticeParticipation
  riskLevel: TenderNoticeRiskLevel
  estimateMonth: string
  biddingYear: number
  baseHourlyRate: number
  contractMonthsOverride: number
  feeRate: number
  healthInsuranceRate: number
  longTermCareRate: number
  pensionRate: number
  employmentInsuranceRate: number
  industrialAccidentRate: number
  roundingUnit: '백원' | '천원'
  weekendBasis: string
  monthlyStandardHours: number
  weeklyHolidayApplied: boolean
  nightAllowanceApplied: boolean
  overtimeAllowanceApplied: boolean
  insuranceRate: number
  retirementRate: number
  annualLeaveRate: number
  generalAdminRate: number
  profitRate: number
  vatRate: number
  staffRows: EstimateStaffRow[]
  directOperatingCosts: EstimateDirectCosts
  jobRoles: EstimateJobRole[]
  notes: string
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
