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
  | '게스트하우스'

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
  roomCount: number
  perUseFee: number
  monthlyUsageCount: number
  reservationType: string
  needsCleaningStaff: boolean
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

export interface RevenueTargetInfo {
  currentMembers: number
  avgMembershipPrice: number
  ptForecast: number
  gxForecast: number
  otherServiceRevenue: number
  currentMonthTarget: number
  nextMonthTarget: number
}

export type DocumentType = '공문' | '안내문' | '운영보고서' | '정산요청서' | '시설보수 요청서'

export interface DocumentCenterData {
  documentType: DocumentType
  apartmentName: string
  receiver: string
  sender: string
  title: string
  date: string
  manager: string
  phone: string
  mainContent: string
  requestContent: string
  attachmentName: string
  memo: string
  generatedDocument: string
}

export type ContractDocumentType =
  | '커뮤니티센터 위탁운영 계약서'
  | '헬스 트레이너 계약서'
  | '사업소득자 계약서'
  | '장비 납품 계약서'
  | '장비 렌탈 계약서'
  | '업무협약서'

export interface ContractGeneratorData {
  contractType: ContractDocumentType
  contractTitle: string
  partyA: string
  partyB: string
  startDate: string
  endDate: string
  contractAmount: string
  paymentMethod: string
  workScope: string
  settlementMethod: string
  terminationCondition: string
  specialTerms: string
  jurisdiction: string
  memo: string
  generatedContract: string
}

export interface ContractReviewData {
  contractText: string
  uploadedFileName: string
  reviewResult: string
}

export type SourceType = '게시판 공지' | '민원자료' | '회의록' | '운영일지' | '기타'
export type AgendaFacility = FacilityName | '기타'

export interface AgendaPredictorData {
  apartmentName: string
  sourceType: SourceType
  sourceText: string
  relatedFacility: AgendaFacility
  complaintFrequency: '낮음' | '보통' | '높음'
  urgency: '낮음' | '보통' | '높음'
  generatedAgenda: string
}

export type SeasonType = '봄' | '여름' | '가을' | '겨울'
export type HvacIntensity = '낮음' | '보통' | '높음'

export interface EmployeeData {
  id: number
  name: string
  payType: PayType
  hourlyWage: number
  monthlySalary: number
  monthlyHours: number
  monthlyWorkDays: number
  weeklyHolidayIncluded: boolean
  indirectRate: number
}

export interface LaborCostData {
  employees: EmployeeData[]
}

export interface UtilityForecastData {
  electricPrev2Month: number
  electricLastMonth: number
  waterPrev2Month: number
  waterLastMonth: number
  gasPrev2Month: number
  gasLastMonth: number
  season: SeasonType
  intensity: HvacIntensity
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

// AI 공고문 분석 결과에서 추출한 정규화된 일정 1건.
// 공고 등록 시 TenderNotice.aiScheduleEvents에 그대로 보존되어
// 스케줄러가 time/phone/households/calculatedStaffCount를 시간 미정으로 잃지 않게 한다.
// parseBidAnalysis.ts의 ParsedScheduleEvent와 구조적으로 동일하다 (cross-import 회피 목적).
export interface TenderNoticeAiScheduleEvent {
  eventType:
    | 'siteBriefing'
    | 'bidDeadline'
    | 'opening'
    | 'businessPresentation'
    | 'documentSubmission'
    | 'contract'
    | 'other'
  eventTypeLabel: string
  date: string
  time: string
  location: string
  content: string
  apartmentName: string
  households: number | null
  calculatedStaffCount: number | null
  staffCountText: string
  managementOfficePhone: string
}

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
  // 관리사무소/담당자 연락처 (옵셔널, 기존 저장 데이터 하위호환)
  managementOfficePhone?: string
  // AI 공고문 분석에서 추출한 시간 포함 일정 배열 (옵셔널, 하위호환).
  // 공고 등록 시 BidAnalysisDraft.scheduleEvents를 그대로 보존해 스케줄러가
  // time/phone/households/calculatedStaffCount를 잃지 않도록 한다.
  // 비어있거나 미정의 시에는 기존처럼 notice 날짜 필드(date-only)를 fallback으로 사용한다.
  aiScheduleEvents?: TenderNoticeAiScheduleEvent[]
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

export type ContractType = '커뮤니티센터 위탁운영' | '헬스 트레이너' | '사업소득자' | '장비 납품' | '장비 렌탈' | '업무협약' | '기타'
export type ContractStatus = '진행중' | '갱신검토' | '만료예정' | '종료' | '보류'

export interface ContractItem {
  id: number
  contractName: string
  contractType: ContractType
  counterparty: string
  startDate: string
  endDate: string
  renewalReviewDate: string
  noticeDeadline: string
  contractAmount: string
  paymentMethod: string
  status: ContractStatus
  memo: string
  createdAt: string
  updatedAt: string
}

export interface ContractManagement {
  contracts: ContractItem[]
}

export interface MonthlyReportData {
  reportMonth: string
  summaryMemo: string
  keyIssues: string
  improvementPlan: string
  memo: string
  generatedReport: string
  // 저장본 연동 선택값(선택, 기존 데이터 호환). 페이지 상태 대신 영속화하여 새로고침 후에도 유지.
  selectedSiteLaborSnapshotId?: string
  selectedBidCalculationSnapshotId?: string
}

// 주간 운영 리포트 출력 모드 — 관리소 보고용(실무 상세) / 입주민 공개용(순화)
export type WeeklyReportOutputMode = 'office' | 'resident'

// 주간 운영 리포트 입력/결과. monthlyReport와 동일하게 단지별 communityAiProjects에 영속된다.
export interface WeeklyReportData {
  reportWeek: string // ISO 주차 식별자 (예: 2026-W24) — 중복 생성 confirm 기준 키
  periodLabel: string // 기간 표시 텍스트 (예: 2026-06-08 ~ 2026-06-14)
  staffName: string // 근무자/담당자
  mainTasks: string // 이번 주 주요 업무
  facilityInspection: string // 시설 점검 내역
  complaintHandling: string // 민원 대응 내역
  defectActions: string // 하자 발견 및 조치 내역
  suppliesInventory: string // 비품 보충/재고 관련
  specialNotes: string // 특이사항
  nextWeekPlan: string // 다음 주 예정 업무
  outputMode: WeeklyReportOutputMode // 출력 모드 선택
  generatedReport: string // 생성 결과
}

// ─── 오픈 체크리스트 ──────────────────────────────────────────────────────────
// 커뮤니티센터 오픈 준비 점검 항목. 단지별 CommunityData에 영속되어 기존 데이터
// 동기화(SystemDataSync) 경로를 그대로 타므로, 추후 클라우드 자동 동기화로 이전하기 쉽다.
export type ChecklistCategory = '계약/행정' | '시설 체크' | '하자보수' | '운영 시뮬레이션' | '비품'
export type ChecklistStatus = '미확인' | '진행중' | '완료' | '보류' | '문제발생'
export type ChecklistPriority = '낮음' | '보통' | '높음' | '필수'
export type SupplyPurchaseStatus = '미구매' | '구매예정' | '구매완료' | '입고완료' | '불필요'

export const CHECKLIST_CATEGORIES: ChecklistCategory[] = ['계약/행정', '시설 체크', '하자보수', '운영 시뮬레이션', '비품']
export const CHECKLIST_STATUSES: ChecklistStatus[] = ['미확인', '진행중', '완료', '보류', '문제발생']
export const CHECKLIST_PRIORITIES: ChecklistPriority[] = ['낮음', '보통', '높음', '필수']
export const SUPPLY_PURCHASE_STATUSES: SupplyPurchaseStatus[] = ['미구매', '구매예정', '구매완료', '입고완료', '불필요']

export interface OpeningChecklistItem {
  id: string
  category: ChecklistCategory
  title: string
  description: string // 설명 (메모와 별도로 항목 자체 설명)
  status: ChecklistStatus
  assignee: string // 담당자
  dueDate: string // 목표일 (YYYY-MM-DD 또는 '')
  completedAt: string // 완료 시각 (ISO 문자열 또는 '') — 상태가 '완료'가 될 때 자동 기록
  priority: ChecklistPriority
  memo: string
  // 비품 전용 필드 (category === '비품'일 때만 의미. 다른 카테고리는 undefined)
  quantityNeeded?: number
  quantityReady?: number
  unit?: string
  supplier?: string
  purchaseStatus?: SupplyPurchaseStatus
  // TODO(사진 업로드): 항목별 현장 사진 첨부 — 이번 범위 제외, 추후 추가
  // TODO(AI 요약): 체크리스트 진행 상황 AI 요약 — 이번 범위 제외, 추후 추가
}

export interface OpeningChecklistData {
  items: OpeningChecklistItem[]
  // TODO(클라우드 동기화): 추후 자동 동기화 시 updatedAt/revision 등 메타데이터 추가 위치
}

export interface CommunityData {
  apartmentInfo: ApartmentInfoData
  facilityInfo: {
    items: FacilityDetail[]
  }
  operationInfo: OperationInfoData
  costInfo: CostInfoData
  revenueInfo: RevenueInfoData
  revenueTarget: RevenueTargetInfo
  laborCost: LaborCostData
  utilityForecast: UtilityForecastData
  documentCenter: DocumentCenterData
  contractGenerator: ContractGeneratorData
  contractReview: ContractReviewData
  agendaPredictor: AgendaPredictorData
  complaints: ComplaintItem[]
  contractManagement: ContractManagement
  monthlyReport: MonthlyReportData
  weeklyReport: WeeklyReportData
  openingChecklist: OpeningChecklistData
}

export interface CommunityProject {
  id: string
  name: string
  address: string
  householdCount: number
  managementCompany: string
  memo: string
  createdAt: string
  updatedAt: string
  data: CommunityData
}

export interface AppState {
  projects: CommunityProject[]
  activeProjectId: string
}
