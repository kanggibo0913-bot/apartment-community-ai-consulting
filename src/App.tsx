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
import AIAnalysis from './pages/AIAnalysis'
import ReportDraft from './pages/ReportDraft'
import {
  ApartmentInfoData,
  CommunityData,
  ComplaintItem,
  CostInfoData,
  OperationInfoData,
  RevenueInfoData,
  FacilityDetail,
  OutputType,
} from './types/CommunityData'

type PageType = 'dashboard' | 'apartment' | 'facility' | 'operation' | 'cost' | 'revenue' | 'complaint' | 'analysis' | 'report'

const LOCAL_STORAGE_KEY = 'apartmentCommunityData'

const defaultFacilityItems: FacilityDetail[] = [
  { id: 1, name: '헬스장', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '' },
  { id: 2, name: '골프장', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '' },
  { id: 3, name: 'GX룸', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '' },
  { id: 4, name: '독서실', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '' },
  { id: 5, name: '사우나', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '' },
  { id: 6, name: '카페', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '' },
  { id: 7, name: '다목적실', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '' },
  { id: 8, name: '키즈룸', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '' },
  { id: 9, name: '기타 시설', enabled: false, operatingStatus: '미운영', paidType: '무료', peakHours: '', notes: '' },
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
  complaints: [
    { id: 1, content: '헬스장 기기 고장', type: '시설 고장', status: '접수', date: '2024-05-08', action: '' },
    { id: 2, content: '골프장 조명 불량', type: '시설 고장', status: '진행 중', date: '2024-05-09', action: '수리 요청 접수' },
    { id: 3, content: '독서실 청소 상태 불만', type: '청소 상태', status: '진행 중', date: '2024-05-10', action: '청소 강화 예정' },
    { id: 4, content: '운영시간 연장 요청', type: '운영시간', status: '접수', date: '2024-05-11', action: '' },
    { id: 5, content: '주말 프로그램 확대 요청', type: '프로그램 불만', status: '접수', date: '2024-05-12', action: '' },
    { id: 6, content: '운영시간 추가 요청', type: '운영시간', status: '반복 민원', date: '2024-05-13', action: '운영 시간 재검토 중' },
  ],
}

const isValidCommunityData = (value: unknown): value is CommunityData => {
  if (!value || typeof value !== 'object') return false
  const data = value as any
  const hasObject = (key: string) => data[key] && typeof data[key] === 'object'
  if (!hasObject('apartmentInfo') || !hasObject('facilityInfo') || !hasObject('operationInfo') || !hasObject('costInfo') || !hasObject('revenueInfo') || !Array.isArray(data.complaints)) {
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
  return data.complaints.every((item: any) => typeof item.id === 'number' && typeof item.content === 'string' && typeof item.type === 'string')
}

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard')
  const [appState, setAppState] = useState<CommunityData>(defaultCommunityData)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [selectedOutputType, setSelectedOutputType] = useState<OutputType>('운영 진단 보고서')

  const showStatusMessage = (message: string) => {
    setStatusMessage(message)
    setTimeout(() => setStatusMessage(''), 5000)
  }

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(LOCAL_STORAGE_KEY)
      if (!rawValue) return

      const parsed = JSON.parse(rawValue) as Partial<CommunityData>
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
        complaints: parsed.complaints ?? defaultCommunityData.complaints,
      })
    } catch (error) {
      console.warn('localStorage data load failed:', error)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appState))
  }, [appState])

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
      setAppState(parsed)
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
          />
        )
      case 'apartment':
        return <ApartmentInfo data={appState.apartmentInfo} onChange={updateApartmentInfo} />
      case 'facility':
        return <FacilityInfo facilityInfo={appState.facilityInfo} onChange={updateFacilityItems} />
      case 'operation':
        return <OperationInfo data={appState.operationInfo} onChange={updateOperationInfo} />
      case 'cost':
        return <CostInfo data={appState.costInfo} onChange={updateCostInfo} />
      case 'revenue':
        return <RevenueInfo data={appState.revenueInfo} onChange={updateRevenueInfo} costTotal={getCostTotal(appState.costInfo)} />
      case 'complaint':
        return <ComplaintInfo complaints={appState.complaints} onChange={updateComplaints} />
      case 'analysis':
        return <AIAnalysis data={appState} />
      case 'report':
        return <ReportDraft data={appState} defaultOutputType={selectedOutputType} />
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
          />
        )
    }
  }

  return (
    <div className="app-container">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="main-content">
        <div className="page-actions">
          <button className="btn btn-secondary" type="button" onClick={handleResetAll}>
            전체 데이터 초기화
          </button>
        </div>
        {renderPage()}
      </main>
    </div>
  )
}

export default App
