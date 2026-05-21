import { useEffect, useState } from 'react'
import './App.css'
import Sidebar from './components/Sidebar'
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
import AgendaPredictor from './pages/AgendaPredictor'
import AIAnalysis from './pages/AIAnalysis'
import ReportDraft from './pages/ReportDraft'
import TenderNotices from './pages/TenderNotices'
import EstimateCalculator from './pages/EstimateCalculator'
import { loadCommunityData, saveCommunityData } from './utils/storage'
import {
  ApartmentInfoData,
  CommunityData,
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
} from './types/CommunityData'

type PageType = 'dashboard' | 'apartment' | 'facility' | 'operation' | 'cost' | 'revenue' | 'complaint' | 'document' | 'contract' | 'review' | 'agenda' | 'analysis' | 'report' | 'tender' | 'estimate'

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
}

const isValidCommunityData = (value: unknown): value is CommunityData => {
  if (!value || typeof value !== 'object') return false
  const data = value as any
  const hasObject = (key: string) => data[key] && typeof data[key] === 'object'
  if (!hasObject('apartmentInfo') || !hasObject('facilityInfo') || !hasObject('operationInfo') || !hasObject('costInfo') || !hasObject('revenueInfo') || !hasObject('revenueTarget') || !hasObject('laborCost') || !hasObject('utilityForecast') || !Array.isArray(data.complaints)) {
    return false
  }
  const apartment = data.apartmentInfo
  if (typeof apartment.name !== 'string' || typeof apartment.region !== 'string' || typeof apartment.totalUnits !== 'number') return false
  const operation = data.operationInfo
  if (typeof operation.weekdayHours !== 'string' || typeof operation.weekendHours !== 'string') return false
  const cost = data.costInfo
  if (typeof cost.salaries !== 'number' || typeof cost.electricity !== 'number') return false
  const revenue = data.revenueInfo
  if (typeof revenue.usageFee !== 'number' || typeof revenue.ptFee !== 'number') return false
  const facilityItems = data.facilityInfo.items
  if (!Array.isArray(facilityItems) || !facilityItems.every((item: any) => typeof item.id === 'number' && typeof item.name === 'string')) return false
  if (data.documentCenter && typeof data.documentCenter !== 'object') return false
  if (data.contractGenerator && typeof data.contractGenerator !== 'object') return false
  if (data.contractReview && typeof data.contractReview !== 'object') return false
  if (data.agendaPredictor && typeof data.agendaPredictor !== 'object') return false
  return data.complaints.every((item: any) => typeof item.id === 'number' && typeof item.content === 'string' && typeof item.type === 'string')
}

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard')
  const [appState, setAppState] = useState<CommunityData>(defaultCommunityData)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [selectedOutputType, setSelectedOutputType] = useState<OutputType>('운영 진단 보고서')
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  const showStatusMessage = (message: string) => {
    setStatusMessage(message)
    setTimeout(() => setStatusMessage(''), 5000)
  }

  const handleChangePage = (page: PageType) => {
    setCurrentPage(page)
    setIsMobileNavOpen(false)
  }

  useEffect(() => {
    const parsed = loadCommunityData()
    if (!parsed || typeof parsed !== 'object') return

    setAppState({
      apartmentInfo: {
        ...defaultCommunityData.apartmentInfo,
        ...parsed.apartmentInfo,
      },
      facilityInfo: {
        items: parsed.facilityInfo?.items ?? defaultFacilityItems,
      },
      operationInfo: {
        ...defaultCommunityData.operationInfo,
        ...parsed.operationInfo,
      },
      costInfo: {
        ...defaultCommunityData.costInfo,
        ...parsed.costInfo,
      },
      revenueInfo: {
        ...defaultCommunityData.revenueInfo,
        ...parsed.revenueInfo,
      },
      revenueTarget: {
        ...defaultCommunityData.revenueTarget,
        ...parsed.revenueTarget,
      },
      laborCost: {
        ...defaultCommunityData.laborCost,
        ...parsed.laborCost,
      },
      utilityForecast: {
        ...defaultCommunityData.utilityForecast,
        ...parsed.utilityForecast,
      },
      documentCenter: {
        ...defaultCommunityData.documentCenter,
        ...parsed.documentCenter,
      },
      contractGenerator: {
        ...defaultCommunityData.contractGenerator,
        ...parsed.contractGenerator,
      },
      contractReview: {
        ...defaultCommunityData.contractReview,
        ...parsed.contractReview,
      },
      agendaPredictor: {
        ...defaultCommunityData.agendaPredictor,
        ...parsed.agendaPredictor,
      },
      complaints: parsed.complaints ?? defaultCommunityData.complaints,
    })
  }, [])

  useEffect(() => {
    saveCommunityData(appState)
  }, [appState])

  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [currentPage])

  const updateApartmentInfo = (next: Partial<ApartmentInfoData>) => {
    setAppState(prev => ({
      ...prev,
      apartmentInfo: { ...prev.apartmentInfo, ...next },
    }))
  }

  const updateFacilityItems = (items: FacilityDetail[]) => {
    setAppState(prev => ({
      ...prev,
      facilityInfo: { ...prev.facilityInfo, items },
    }))
  }

  const updateOperationInfo = (next: Partial<OperationInfoData>) => {
    setAppState(prev => ({
      ...prev,
      operationInfo: { ...prev.operationInfo, ...next },
    }))
  }

  const updateCostInfo = (next: Partial<CostInfoData>) => {
    setAppState(prev => ({
      ...prev,
      costInfo: { ...prev.costInfo, ...next },
    }))
  }

  const updateRevenueInfo = (next: Partial<RevenueInfoData>) => {
    setAppState(prev => ({
      ...prev,
      revenueInfo: { ...prev.revenueInfo, ...next },
    }))
  }

  const updateRevenueTarget = (next: Partial<RevenueTargetInfo>) => {
    setAppState(prev => ({
      ...prev,
      revenueTarget: { ...prev.revenueTarget, ...next },
    }))
  }

  const updateLaborCost = (next: Partial<LaborCostData>) => {
    setAppState(prev => ({
      ...prev,
      laborCost: { ...prev.laborCost, ...next },
    }))
  }

  const updateDocumentCenter = (next: Partial<DocumentCenterData>) => {
    setAppState(prev => ({
      ...prev,
      documentCenter: { ...prev.documentCenter, ...next },
    }))
  }

  const updateContractGenerator = (next: Partial<ContractGeneratorData>) => {
    setAppState(prev => ({
      ...prev,
      contractGenerator: { ...prev.contractGenerator, ...next },
    }))
  }

  const updateContractReview = (next: Partial<ContractReviewData>) => {
    setAppState(prev => ({
      ...prev,
      contractReview: { ...prev.contractReview, ...next },
    }))
  }

  const updateAgendaPredictor = (next: Partial<AgendaPredictorData>) => {
    setAppState(prev => ({
      ...prev,
      agendaPredictor: { ...prev.agendaPredictor, ...next },
    }))
  }

  const updateUtilityForecast = (next: Partial<UtilityForecastData>) => {
    setAppState(prev => ({
      ...prev,
      utilityForecast: { ...prev.utilityForecast, ...next },
    }))
  }

  const updateComplaints = (complaints: ComplaintItem[]) => {
    setAppState(prev => ({
      ...prev,
      complaints,
    }))
  }

  const getCostTotal = (costInfo: CostInfoData) =>
    Object.values(costInfo).reduce((sum, value) => sum + value, 0)

  const handleResetAll = () => {
    setAppState(defaultCommunityData)
    showStatusMessage('전체 데이터가 초기화되었습니다.')
  }

  const handleLoadSampleData = () => {
    setAppState(sampleCommunityData)
    showStatusMessage('샘플 데이터가 로드되었습니다. 기존 데이터가 덮어써졌습니다.')
  }

  const handleExportData = () => {
    const fileName = `community-consulting-data-${new Date().toISOString().slice(0, 10)}.json`
    const blob = new Blob([JSON.stringify(appState, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showStatusMessage('현재 데이터가 JSON 파일로 다운로드되었습니다.')
  }

  const handleImportData = async (file: File): Promise<{success: boolean; message: string}> => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!isValidCommunityData(parsed)) {
        return { success: false, message: '올바른 CommunityData 형식이 아닙니다. JSON 구조를 확인해주세요.' }
      }
      setAppState({
        apartmentInfo: {
          ...defaultCommunityData.apartmentInfo,
          ...parsed.apartmentInfo,
        },
        facilityInfo: {
          items: parsed.facilityInfo?.items ?? defaultFacilityItems,
        },
        operationInfo: {
          ...defaultCommunityData.operationInfo,
          ...parsed.operationInfo,
        },
        costInfo: {
          ...defaultCommunityData.costInfo,
          ...parsed.costInfo,
        },
        revenueInfo: {
          ...defaultCommunityData.revenueInfo,
          ...parsed.revenueInfo,
        },
        revenueTarget: {
          ...defaultCommunityData.revenueTarget,
          ...parsed.revenueTarget,
        },
        laborCost: {
          ...defaultCommunityData.laborCost,
          ...parsed.laborCost,
        },
        utilityForecast: {
          ...defaultCommunityData.utilityForecast,
          ...parsed.utilityForecast,
        },
        documentCenter: {
          ...defaultCommunityData.documentCenter,
          ...parsed.documentCenter,
        },
        contractGenerator: {
          ...defaultCommunityData.contractGenerator,
          ...parsed.contractGenerator,
        },
        contractReview: {
          ...defaultCommunityData.contractReview,
          ...parsed.contractReview,
        },
        agendaPredictor: {
          ...defaultCommunityData.agendaPredictor,
          ...parsed.agendaPredictor,
        },
        complaints: parsed.complaints ?? defaultCommunityData.complaints,
      })
      return { success: true, message: 'JSON 데이터가 정상적으로 복원되었습니다. 기존 데이터가 덮어써졌습니다.' }
    } catch {
      return { success: false, message: 'JSON 파일을 읽는 중 오류가 발생했습니다. 파일 형식을 확인해주세요.' }
    }
  }

  const navigateToOutput = (outputType: OutputType) => {
    setSelectedOutputType(outputType)
    setCurrentPage('report')
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            data={appState}
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
        return <ApartmentInfo data={appState.apartmentInfo} onChange={updateApartmentInfo} />
      case 'facility':
        return <FacilityInfo facilityInfo={appState.facilityInfo} onChange={updateFacilityItems} />
      case 'operation':
        return <OperationInfo data={appState.operationInfo} onChange={updateOperationInfo} />
      case 'cost':
        return <CostInfo
          data={appState.costInfo}
          onChange={updateCostInfo}
          laborCost={appState.laborCost}
          onChangeLaborCost={updateLaborCost}
          utilityForecast={appState.utilityForecast}
          onChangeUtilityForecast={updateUtilityForecast}
        />
      case 'revenue':
        return <RevenueInfo
          data={appState.revenueInfo}
          onChange={updateRevenueInfo}
          costTotal={getCostTotal(appState.costInfo)}
          revenueTarget={appState.revenueTarget}
          onChangeRevenueTarget={updateRevenueTarget}
        />
      case 'complaint':
        return <ComplaintInfo complaints={appState.complaints} onChange={updateComplaints} />
      case 'document':
        return <DocumentCenter data={appState.documentCenter} onChange={updateDocumentCenter} />
      case 'contract':
        return <ContractGenerator data={appState.contractGenerator} onChange={updateContractGenerator} />
      case 'review':
        return <ContractReview data={appState.contractReview} onChange={updateContractReview} />
      case 'agenda':
        return <AgendaPredictor data={appState.agendaPredictor} onChange={updateAgendaPredictor} />
      case 'analysis':
        return <AIAnalysis data={appState} />
      case 'report':
        return <ReportDraft data={appState} defaultOutputType={selectedOutputType} />
      case 'tender':
        return <TenderNotices />
      case 'estimate':
        return <EstimateCalculator />
      default:
        return (
          <Dashboard
            data={appState}
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
            전체 초기화
          </button>
        </header>

        <main className="main-content">
          <div className="page-actions">
            <button className="btn btn-secondary" type="button" onClick={handleResetAll}>
              전체 데이터 초기화
            </button>
          </div>
          {renderPage()}
        </main>
      </div>
    </div>
  )
}

export default App
