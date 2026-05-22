import { useEffect, useState } from 'react'
import './App.css'
import Sidebar from './components/Sidebar'
import ProjectSelector from './components/ProjectSelector'
import ProjectForm from './components/ProjectForm'
import Dashboard from './pages/Dashboard'
import ApartmentInfo from './pages/ApartmentInfo'
import FacilityInfo from './pages/FacilityInfo'
import OperationInfo from './pages/OperationInfo'
import CostInfo from './pages/CostInfo'
import RevenueInfo from './pages/RevenueInfo'
import ComplaintInfo from './pages/ComplaintInfo'
import DocumentCenter from './pages/DocumentCenter'
import ContractGenerator from './pages/ContractGenerator'
import ContractReview from './pages/ContractReview'
import ContractManagement from './pages/ContractManagement'
import MonthlyReport from './pages/MonthlyReport'
import AgendaPredictor from './pages/AgendaPredictor'
import AIAnalysis from './pages/AIAnalysis'
import ReportDraft from './pages/ReportDraft'
import TenderNotices from './pages/TenderNotices'
import EstimateCalculator from './pages/EstimateCalculator'
import { loadProjects, saveProjects } from './utils/storage'
import {
  ApartmentInfoData,
  CommunityData,
  CommunityProject,
  ComplaintItem,
  CostInfoData,
  OperationInfoData,
  RevenueInfoData,
  FacilityDetail,
  OutputType,
  RevenueTargetInfo,
  LaborCostData,
  UtilityForecastData,
  DocumentCenterData,
  ContractGeneratorData,
  ContractReviewData,
  AgendaPredictorData,
  ContractItem,
  MonthlyReportData,
} from './types/CommunityData'

type PageType = 'dashboard' | 'apartment' | 'facility' | 'operation' | 'cost' | 'revenue' | 'complaint' | 'document' | 'contract' | 'review' | 'agenda' | 'analysis' | 'report' | 'tender' | 'estimate' | 'contract-manage' | 'monthly-report'

const defaultFacilityItems: FacilityDetail[] = [
  { id: 1, name: '헬스장', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '', roomCount: 0, perUseFee: 0, monthlyUsageCount: 0, reservationType: '', needsCleaningStaff: false },
  { id: 2, name: '골프장', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '', roomCount: 0, perUseFee: 0, monthlyUsageCount: 0, reservationType: '', needsCleaningStaff: false },
  { id: 3, name: 'GX룸', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '', roomCount: 0, perUseFee: 0, monthlyUsageCount: 0, reservationType: '', needsCleaningStaff: false },
  { id: 4, name: '독서실', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '', roomCount: 0, perUseFee: 0, monthlyUsageCount: 0, reservationType: '', needsCleaningStaff: false },
  { id: 5, name: '사우나', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '', roomCount: 0, perUseFee: 0, monthlyUsageCount: 0, reservationType: '', needsCleaningStaff: false },
  { id: 6, name: '카페', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '', roomCount: 0, perUseFee: 0, monthlyUsageCount: 0, reservationType: '', needsCleaningStaff: false },
  { id: 7, name: '다목적실', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '', roomCount: 0, perUseFee: 0, monthlyUsageCount: 0, reservationType: '', needsCleaningStaff: false },
  { id: 8, name: '키즈룸', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '', roomCount: 0, perUseFee: 0, monthlyUsageCount: 0, reservationType: '', needsCleaningStaff: false },
  { id: 9, name: '기타 시설', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '', roomCount: 0, perUseFee: 0, monthlyUsageCount: 0, reservationType: '', needsCleaningStaff: false },
  { id: 10, name: '게스트하우스', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '', roomCount: 0, perUseFee: 0, monthlyUsageCount: 0, reservationType: '', needsCleaningStaff: false },
]

const defaultCommunityData: CommunityData = {
  apartmentInfo: {
    name: '',
    region: '',
    totalUnits: 0,
    buildingCount: 0,
    builtYear: 0,
    communityArea: 0,
    officeName: '',
    remarks: '',
  },
  facilityInfo: {
    items: defaultFacilityItems,
  },
  operationInfo: {
    weekdayHours: '',
    weekendHours: '',
    holidays: '',
    staffCount: 0,
    openStaffNeeded: false,
    closeStaffNeeded: false,
    unmannedHours: '',
    currentIssues: '',
  },
  costInfo: {
    salaries: 0,
    electricity: 0,
    water: 0,
    hvac: 0,
    supplies: 0,
    maintenance: 0,
    cleaning: 0,
    other: 0,
  },
  revenueInfo: {
    usageFee: 0,
    ptFee: 0,
    gxFee: 0,
    golfLesson: 0,
    cafeSales: 0,
    rentalIncome: 0,
    otherIncome: 0,
  },
  revenueTarget: {
    currentMembers: 0,
    avgMembershipPrice: 0,
    ptForecast: 0,
    gxForecast: 0,
    otherServiceRevenue: 0,
    currentMonthTarget: 0,
    nextMonthTarget: 0,
  },
  laborCost: {
    employees: [],
  },
  utilityForecast: {
    electricPrev2Month: 0,
    electricLastMonth: 0,
    waterPrev2Month: 0,
    waterLastMonth: 0,
    gasPrev2Month: 0,
    gasLastMonth: 0,
    season: '봄',
    intensity: '보통',
  },
  documentCenter: {
    documentType: '공문',
    apartmentName: '',
    receiver: '',
    sender: '',
    title: '',
    date: '',
    manager: '',
    phone: '',
    mainContent: '',
    requestContent: '',
    attachmentName: '',
    memo: '',
    generatedDocument: '',
  },
  contractGenerator: {
    contractType: '커뮤니티센터 위탁운영 계약서',
    contractTitle: '',
    partyA: '',
    partyB: '',
    startDate: '',
    endDate: '',
    contractAmount: '',
    paymentMethod: '',
    workScope: '',
    settlementMethod: '',
    terminationCondition: '',
    specialTerms: '',
    jurisdiction: '',
    memo: '',
    generatedContract: '',
  },
  contractReview: {
    contractText: '',
    uploadedFileName: '',
    reviewResult: '',
  },
  agendaPredictor: {
    apartmentName: '',
    sourceType: '게시판 공지',
    sourceText: '',
    relatedFacility: '헬스장',
    complaintFrequency: '보통',
    urgency: '보통',
    generatedAgenda: '',
  },
  complaints: [],
  contractManagement: {
    contracts: [],
  },
  monthlyReport: {
    reportMonth: '',
    summaryMemo: '',
    keyIssues: '',
    improvementPlan: '',
    memo: '',
    generatedReport: '',
  },
}

const sampleCommunityData: CommunityData = {
  apartmentInfo: {
    name: '래미안 커뮤니티 시범단지',
    region: '서울특별시',
    totalUnits: 1200,
    buildingCount: 12,
    builtYear: 2022,
    communityArea: 850,
    officeName: '래미안 관리사무소',
    remarks: '시범 운영용 단지입니다.',
  },
  facilityInfo: {
    items: defaultFacilityItems.map(item => {
      const enabledNames = ['헬스장', '골프장', 'GX룸', '독서실', '카페']
      const enabled = enabledNames.includes(item.name)
      return {
        ...item,
        enabled,
        operatingStatus: enabled ? '운영중' : '미운영',
        paidType: enabled ? '유료' : '무료',
        peakHours: enabled ? (item.name === '카페' ? '09:00~21:00' : '06:00~22:00') : '',
        notes: enabled ? '샘플 운영 중' : '',
      }
    }),
  },
  operationInfo: {
    weekdayHours: '06:00~23:00',
    weekendHours: '08:00~22:00',
    holidays: '매월 둘째 주 월요일',
    staffCount: 3,
    openStaffNeeded: true,
    closeStaffNeeded: true,
    unmannedHours: '06:00~09:00, 21:00~23:00',
    currentIssues: '샘플 데이터 운영 현황입니다.',
  },
  costInfo: {
    salaries: 9500000,
    electricity: 2100000,
    water: 700000,
    hvac: 1800000,
    supplies: 500000,
    maintenance: 900000,
    cleaning: 1200000,
    other: 0,
  },
  revenueInfo: {
    usageFee: 4500000,
    ptFee: 6000000,
    gxFee: 1200000,
    golfLesson: 3500000,
    cafeSales: 2800000,
    rentalIncome: 0,
    otherIncome: 0,
  },
  revenueTarget: {
    currentMembers: 320,
    avgMembershipPrice: 95000,
    ptForecast: 6000000,
    gxForecast: 1200000,
    otherServiceRevenue: 800000,
    currentMonthTarget: 16000000,
    nextMonthTarget: 17000000,
  },
  laborCost: {
    employees: [
      { id: 1, name: '매니저', payType: '월급제', hourlyWage: 0, monthlySalary: 3200000, monthlyHours: 0, monthlyWorkDays: 22, weeklyHolidayIncluded: false, indirectRate: 15 },
      { id: 2, name: '강사', payType: '시급제', hourlyWage: 32000, monthlySalary: 0, monthlyHours: 160, monthlyWorkDays: 22, weeklyHolidayIncluded: true, indirectRate: 12 },
    ],
  },
  utilityForecast: {
    electricPrev2Month: 2100000,
    electricLastMonth: 2200000,
    waterPrev2Month: 700000,
    waterLastMonth: 720000,
    gasPrev2Month: 480000,
    gasLastMonth: 500000,
    season: '여름',
    intensity: '보통',
  },
  documentCenter: {
    documentType: '공문',
    apartmentName: '래미안 커뮤니티 시범단지',
    receiver: '관리사무소',
    sender: '커뮤니티팀',
    title: '커뮤니티센터 운영 관련 보고',
    date: '2024-05-21',
    manager: '홍길동',
    phone: '010-1234-5678',
    mainContent: '커뮤니티센터의 운영 현황과 향후 개선 방안을 보고드립니다.',
    requestContent: '관련 부서의 확인과 필요 시 추가 협의를 요청합니다.',
    attachmentName: '운영현황 보고서',
    memo: '내부 검토용 초안입니다.',
    generatedDocument: '',
  },
  contractGenerator: {
    contractType: '커뮤니티센터 위탁운영 계약서',
    contractTitle: '커뮤니티센터 위탁운영 계약서 초안',
    partyA: '래미안 관리사무소',
    partyB: 'ABC 운영사',
    startDate: '2024-06-01',
    endDate: '2025-05-31',
    contractAmount: '₩120,000,000',
    paymentMethod: '월별 분할 지급',
    workScope: '커뮤니티센터 운영 및 시설 관리',
    settlementMethod: '월별 정산 및 세금계산서 발행',
    terminationCondition: '상호 합의 또는 계약 위반 시',
    specialTerms: '운영 성과 평가에 따른 보너스 지급 검토',
    jurisdiction: '서울중앙지방법원',
    memo: '내부 검토용 초안입니다.',
    generatedContract: '',
  },
  contractReview: {
    contractText: '',
    uploadedFileName: '',
    reviewResult: '',
  },
  agendaPredictor: {
    apartmentName: '래미안 커뮤니티 시범단지',
    sourceType: '민원자료',
    sourceText: '헬스장 기기 고장과 청소 상태 불만이 자주 접수되고 있습니다.',
    relatedFacility: '헬스장',
    complaintFrequency: '높음',
    urgency: '보통',
    generatedAgenda: '',
  },
  complaints: [
    { id: 1, content: '헬스장 기기 고장', type: '시설 고장', status: '접수', date: '2024-05-08', action: '' },
    { id: 2, content: '골프장 조명 불량', type: '시설 고장', status: '진행 중', date: '2024-05-09', action: '수리 요청 접수' },
    { id: 3, content: '독서실 청소 상태 불만', type: '청소 상태', status: '진행 중', date: '2024-05-10', action: '청소 강화 예정' },
    { id: 4, content: '운영시간 연장 요청', type: '운영시간', status: '접수', date: '2024-05-11', action: '' },
    { id: 5, content: '주말 프로그램 확대 요청', type: '프로그램 불만', status: '접수', date: '2024-05-12', action: '' },
    { id: 6, content: '운영시간 추가 요청', type: '운영시간', status: '반복 민원', date: '2024-05-13', action: '운영 시간 재검토 중' },
  ],
  contractManagement: {
    contracts: [],
  },
  monthlyReport: {
    reportMonth: '',
    summaryMemo: '',
    keyIssues: '',
    improvementPlan: '',
    memo: '',
    generatedReport: '',
  },
}

const pageLabels: Record<PageType, string> = {
  dashboard: '대시보드',
  apartment: '단지 기본정보',
  facility: '시설 정보',
  operation: '운영 정보',
  cost: '비용 정보',
  revenue: '수익 정보',
  complaint: '민원 정보',
  document: '문서 생성 센터',
  contract: '계약서 생성 센터',
  review: '계약서 검토 센터',
  agenda: '입대의 안건 예상 센터',
  analysis: 'AI 분석 결과',
  report: '보고서 초안',
  tender: '입찰공고 관리',
  estimate: '산출표 자동 계산',
  'contract-manage': '계약 관리',
  'monthly-report': '월간 운영 리포트',
}

function generateProjectId(): string {
  return 'project-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
}

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard')
  const [projects, setProjects] = useState<CommunityProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string>('')
  const [editingProject, setEditingProject] = useState<CommunityProject | undefined>()
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [selectedOutputType, setSelectedOutputType] = useState<OutputType>('운영 진단 보고서')
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  const activeProject = projects.find(p => p.id === activeProjectId)

  const showStatusMessage = (message: string) => {
    setStatusMessage(message)
    setTimeout(() => setStatusMessage(''), 5000)
  }

  const handleChangePage = (page: PageType) => {
    setCurrentPage(page)
    setIsMobileNavOpen(false)
  }

  // Initialize from localStorage with migration
  useEffect(() => {
    const state = loadProjects()
    if (state && state.projects.length > 0) {
      setProjects(state.projects)
      setActiveProjectId(state.activeProjectId)
    } else {
      // Create default empty project
      const projectId = generateProjectId()
      const now = new Date().toISOString()
      const newProject: CommunityProject = {
        id: projectId,
        name: '기본 단지',
        address: '',
        householdCount: 0,
        managementCompany: '',
        memo: '',
        createdAt: now,
        updatedAt: now,
        data: defaultCommunityData,
      }
      setProjects([newProject])
      setActiveProjectId(projectId)
    }
  }, [])

  // Save to localStorage whenever projects or activeProjectId changes
  useEffect(() => {
    if (projects.length > 0) {
      saveProjects({ projects, activeProjectId })
    }
  }, [projects, activeProjectId])

  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [currentPage])

  // Data update functions
  const updateActiveProjectData = (updater: (data: CommunityData) => CommunityData) => {
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, data: updater(p.data), updatedAt: new Date().toISOString() }
        : p
    ))
  }

  const updateApartmentInfo = (next: Partial<ApartmentInfoData>) => {
    updateActiveProjectData(data => ({
      ...data,
      apartmentInfo: { ...data.apartmentInfo, ...next },
    }))
  }

  const updateFacilityItems = (items: FacilityDetail[]) => {
    updateActiveProjectData(data => ({
      ...data,
      facilityInfo: { ...data.facilityInfo, items },
    }))
  }

  const updateOperationInfo = (next: Partial<OperationInfoData>) => {
    updateActiveProjectData(data => ({
      ...data,
      operationInfo: { ...data.operationInfo, ...next },
    }))
  }

  const updateCostInfo = (next: Partial<CostInfoData>) => {
    updateActiveProjectData(data => ({
      ...data,
      costInfo: { ...data.costInfo, ...next },
    }))
  }

  const updateRevenueInfo = (next: Partial<RevenueInfoData>) => {
    updateActiveProjectData(data => ({
      ...data,
      revenueInfo: { ...data.revenueInfo, ...next },
    }))
  }

  const updateRevenueTarget = (next: Partial<RevenueTargetInfo>) => {
    updateActiveProjectData(data => ({
      ...data,
      revenueTarget: { ...data.revenueTarget, ...next },
    }))
  }

  const updateLaborCost = (next: Partial<LaborCostData>) => {
    updateActiveProjectData(data => ({
      ...data,
      laborCost: { ...data.laborCost, ...next },
    }))
  }

  const updateDocumentCenter = (next: Partial<DocumentCenterData>) => {
    updateActiveProjectData(data => ({
      ...data,
      documentCenter: { ...data.documentCenter, ...next },
    }))
  }

  const updateContractGenerator = (next: Partial<ContractGeneratorData>) => {
    updateActiveProjectData(data => ({
      ...data,
      contractGenerator: { ...data.contractGenerator, ...next },
    }))
  }

  const updateContractReview = (next: Partial<ContractReviewData>) => {
    updateActiveProjectData(data => ({
      ...data,
      contractReview: { ...data.contractReview, ...next },
    }))
  }

  const updateAgendaPredictor = (next: Partial<AgendaPredictorData>) => {
    updateActiveProjectData(data => ({
      ...data,
      agendaPredictor: { ...data.agendaPredictor, ...next },
    }))
  }

  const updateUtilityForecast = (next: Partial<UtilityForecastData>) => {
    updateActiveProjectData(data => ({
      ...data,
      utilityForecast: { ...data.utilityForecast, ...next },
    }))
  }

  const updateComplaints = (complaints: ComplaintItem[]) => {
    updateActiveProjectData(data => ({
      ...data,
      complaints,
    }))
  }

  const updateContractManagement = (contracts: ContractItem[]) => {
    updateActiveProjectData(data => ({
      ...data,
      contractManagement: { contracts },
    }))
  }

  const updateMonthlyReport = (next: Partial<MonthlyReportData>) => {
    updateActiveProjectData(data => ({
      ...data,
      monthlyReport: { ...data.monthlyReport, ...next },
    }))
  }

  // Project management
  const handleAddProject = () => {
    setEditingProject(undefined)
    setShowProjectForm(true)
  }

  const handleEditProject = (project: CommunityProject) => {
    setEditingProject(project)
    setShowProjectForm(true)
  }

  const handleSaveProject = (projectData: any) => {
    if (editingProject) {
      // Update existing project
      setProjects(prev => prev.map(p => 
        p.id === editingProject.id
          ? { ...p, ...projectData, updatedAt: new Date().toISOString() }
          : p
      ))
      showStatusMessage(`"${projectData.name}" 단지가 수정되었습니다.`)
    } else {
      // Add new project
      const projectId = generateProjectId()
      const now = new Date().toISOString()
      const newProject: CommunityProject = {
        ...projectData,
        id: projectId,
        createdAt: now,
        updatedAt: now,
      }
      setProjects(prev => [...prev, newProject])
      setActiveProjectId(projectId)
      showStatusMessage(`"${projectData.name}" 단지가 추가되었습니다.`)
    }
  }

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId)
  }

  const handleDeleteProject = (projectId: string) => {
    const projectToDelete = projects.find(p => p.id === projectId)
    setProjects(prev => prev.filter(p => p.id !== projectId))
    
    // Select another project if the deleted one was active
    if (activeProjectId === projectId) {
      const remaining = projects.filter(p => p.id !== projectId)
      if (remaining.length > 0) {
        setActiveProjectId(remaining[0].id)
      }
    }
    showStatusMessage(`"${projectToDelete?.name}" 단지가 삭제되었습니다.`)
  }

  const handleBackupProjects = () => {
    const fileName = `community-ai-backup-${new Date().toISOString().slice(0, 10)}.json`
    const backupData = {
      projects,
      activeProjectId,
      exportDate: new Date().toISOString(),
      appVersion: '1.0.0',
    }
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showStatusMessage('전체 데이터 백업이 완료되었습니다.')
  }

  const handleRestoreProjects = async (file: File): Promise<{ success: boolean; message: string }> => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)

      if (!parsed.projects || !Array.isArray(parsed.projects)) {
        return { success: false, message: '올바른 백업 파일이 아닙니다. projects 배열이 없습니다.' }
      }

      setProjects(parsed.projects)
      setActiveProjectId(parsed.activeProjectId || parsed.projects[0]?.id)
      return { success: true, message: '데이터가 정상적으로 복원되었습니다.' }
    } catch (error) {
      return { success: false, message: 'JSON 파일을 읽는 중 오류가 발생했습니다.' }
    }
  }

  // Legacy handlers for backward compatibility
  const handleResetAll = () => {
    if (activeProject) {
      setProjects(prev => prev.map(p =>
        p.id === activeProjectId ? { ...p, data: defaultCommunityData, updatedAt: new Date().toISOString() } : p
      ))
      showStatusMessage('현재 단지 데이터가 초기화되었습니다.')
    }
  }

  const handleLoadSampleData = () => {
    if (activeProject) {
      setProjects(prev => prev.map(p =>
        p.id === activeProjectId ? { ...p, data: sampleCommunityData, updatedAt: new Date().toISOString() } : p
      ))
      showStatusMessage('샘플 데이터가 로드되었습니다. 기존 데이터가 덮어써졌습니다.')
    }
  }

  const handleExportData = () => {
    if (activeProject) {
      const fileName = `community-consulting-data-${new Date().toISOString().slice(0, 10)}.json`
      const blob = new Blob([JSON.stringify(activeProject.data, null, 2)], { type: 'application/json' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showStatusMessage('현재 단지 데이터가 JSON 파일로 다운로드되었습니다.')
    }
  }

  const handleImportData = async (file: File): Promise<{ success: boolean; message: string }> => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)

      // Simple validation
      if (!parsed.apartmentInfo || !parsed.complaints) {
        return { success: false, message: '올바른 CommunityData 형식이 아닙니다.' }
      }

      updateActiveProjectData(() => parsed)
      return { success: true, message: '데이터가 정상적으로 복원되었습니다.' }
    } catch {
      return { success: false, message: 'JSON 파일을 읽는 중 오류가 발생했습니다.' }
    }
  }

  const getCostTotal = (costInfo: CostInfoData) =>
    Object.values(costInfo).reduce((sum, value) => sum + value, 0)

  const navigateToOutput = (outputType: OutputType) => {
    setSelectedOutputType(outputType)
    setCurrentPage('report')
  }

  const renderPage = () => {
    if (!activeProject) {
      return <div className="error-message">단지를 선택해주세요.</div>
    }

    const data = activeProject.data

    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            data={data}
            onReset={handleResetAll}
            onLoadSampleData={handleLoadSampleData}
            onExportData={handleExportData}
            onImportData={handleImportData}
            statusMessage={statusMessage}
            navigateToOutput={navigateToOutput}
            navigateToPage={handleChangePage}
          />
        )
      case 'apartment':
        return <ApartmentInfo data={data.apartmentInfo} onChange={updateApartmentInfo} />
      case 'facility':
        return <FacilityInfo facilityInfo={data.facilityInfo} onChange={updateFacilityItems} />
      case 'operation':
        return <OperationInfo data={data.operationInfo} onChange={updateOperationInfo} />
      case 'cost':
        return <CostInfo
          data={data.costInfo}
          onChange={updateCostInfo}
          laborCost={data.laborCost}
          onChangeLaborCost={updateLaborCost}
          utilityForecast={data.utilityForecast}
          onChangeUtilityForecast={updateUtilityForecast}
        />
      case 'revenue':
        return <RevenueInfo
          data={data.revenueInfo}
          onChange={updateRevenueInfo}
          costTotal={getCostTotal(data.costInfo)}
          revenueTarget={data.revenueTarget}
          onChangeRevenueTarget={updateRevenueTarget}
        />
      case 'complaint':
        return <ComplaintInfo complaints={data.complaints} onChange={updateComplaints} />
      case 'document':
        return <DocumentCenter data={data.documentCenter} onChange={updateDocumentCenter} />
      case 'contract':
        return <ContractGenerator data={data.contractGenerator} onChange={updateContractGenerator} />
      case 'review':
        return <ContractReview data={data.contractReview} onChange={updateContractReview} />
      case 'agenda':
        return <AgendaPredictor data={data.agendaPredictor} onChange={updateAgendaPredictor} />
      case 'analysis':
        return <AIAnalysis data={data} />
      case 'report':
        return <ReportDraft data={data} defaultOutputType={selectedOutputType} />
      case 'tender':
        return <TenderNotices />
      case 'estimate':
        return <EstimateCalculator />
      case 'contract-manage':
        return (
          <>
            <h2>계약 만료 / 갱신 관리</h2>
            <ContractManagement
              contracts={data.contractManagement.contracts}
              onChange={updateContractManagement}
            />
          </>
        )
      case 'monthly-report':
        return (
          <>
            <h2>월간 운영 리포트</h2>
            <MonthlyReport
              data={data}
              reportData={data.monthlyReport}
              onChange={updateMonthlyReport}
            />
          </>
        )
      default:
        return (
          <Dashboard
            data={data}
            onReset={handleResetAll}
            onLoadSampleData={handleLoadSampleData}
            onExportData={handleExportData}
            onImportData={handleImportData}
            statusMessage={statusMessage}
            navigateToOutput={navigateToOutput}
            navigateToPage={handleChangePage}
          />
        )
    }
  }

  return (
    <div className={`app-container ${isMobileNavOpen ? 'nav-open' : ''}`}>
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={handleChangePage}
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
      />
      <div className="main-wrapper">
        <header className="mobile-topbar">
          <button className="mobile-menu-button" type="button" onClick={() => setIsMobileNavOpen((prev) => !prev)}>
            ☰
          </button>
          <div className="mobile-topbar-title">{pageLabels[currentPage]}</div>
          <button className="btn btn-secondary mobile-topbar-action" type="button" onClick={handleResetAll}>
            초기화
          </button>
        </header>

        <main className="main-content">
          <ProjectSelector
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={handleSelectProject}
            onAddProject={handleAddProject}
            onEditProject={handleEditProject}
            onDeleteProject={handleDeleteProject}
            onBackupProjects={handleBackupProjects}
            onRestoreProjects={handleRestoreProjects}
          />
          {renderPage()}
        </main>
      </div>

      <ProjectForm
        project={editingProject}
        isOpen={showProjectForm}
        onClose={() => {
          setShowProjectForm(false)
          setEditingProject(undefined)
        }}
        onSave={handleSaveProject}
      />
    </div>
  )
}

export default App
