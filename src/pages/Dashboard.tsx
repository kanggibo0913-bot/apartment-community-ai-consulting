import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import Card from '../components/Card'
import PageHeader from '../components/PageHeader'
import StatBox from '../components/StatBox'
import { CommunityData, OutputType } from '../types/CommunityData'
import { analyzeCommunityData } from '../utils/analyzeCommunityData'
import { formatMoney, formatPercent } from '../utils/formatUtils'
import './Pages.css'

interface DashboardProps {
  data: CommunityData
  onReset: () => void
  onLoadSampleData: () => void
  onExportData: () => void
  onImportData: (file: File) => Promise<{ success: boolean; message: string }>
  statusMessage: string
  navigateToOutput: (type: OutputType) => void
  navigateToPage: (page: 'document' | 'contract' | 'review' | 'agenda') => void
}

const Dashboard: React.FC<DashboardProps> = ({ data, onReset, onLoadSampleData, onExportData, onImportData, statusMessage, navigateToOutput, navigateToPage }) => {
  const [message, setMessage] = useState(statusMessage)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const analysis = analyzeCommunityData(data)
  const totalCost = analysis.metrics.totalCost
  const totalRevenue = analysis.metrics.totalRevenue
  const monthlyProfit = analysis.metrics.profit
  const laborRatio = analysis.metrics.laborRatio
  const unresolvedCount = analysis.metrics.unresolvedComplaints
  const repeatComplaints = analysis.metrics.repeatComplaints

  const costChart = [
    { label: '인건비', value: data.costInfo.salaries },
    { label: '전기세', value: data.costInfo.electricity },
    { label: '수도세', value: data.costInfo.water },
    { label: '냉난방비', value: data.costInfo.hvac },
    { label: '유지보수비', value: data.costInfo.maintenance },
    { label: '기타', value: data.costInfo.supplies + data.costInfo.cleaning + data.costInfo.other },
  ]

  const revenueChart = [
    { label: '이용료', value: data.revenueInfo.usageFee },
    { label: 'PT', value: data.revenueInfo.ptFee },
    { label: 'GX', value: data.revenueInfo.gxFee },
    { label: '골프레슨', value: data.revenueInfo.golfLesson },
    { label: '카페', value: data.revenueInfo.cafeSales },
    { label: '기타', value: data.revenueInfo.otherIncome },
  ]

  const totalCostChart = costChart.reduce((sum, item) => sum + item.value, 0)
  const totalRevenueChart = revenueChart.reduce((sum, item) => sum + item.value, 0)
  const profitStatus = monthlyProfit >= 0 ? '양호' : '개선 필요'
  const profitStatusClass = monthlyProfit >= 0 ? 'status-good' : 'status-warning'
  const laborWarning = laborRatio >= 60

  const complaintTypeCounts = data.complaints.reduce<Record<string, number>>((counts, item) => {
    counts[item.type] = (counts[item.type] || 0) + 1
    return counts
  }, {})

  const complaintTypeUnresolved = data.complaints
    .filter(item => item.status !== '완료')
    .reduce<Record<string, number>>((counts, item) => {
      counts[item.type] = (counts[item.type] || 0) + 1
      return counts
    }, {})

  const revenueTarget = data.revenueTarget
  const membershipRevenue = revenueTarget.currentMembers * revenueTarget.avgMembershipPrice
  const totalExpectedRevenue = membershipRevenue + revenueTarget.ptForecast + revenueTarget.gxForecast + revenueTarget.otherServiceRevenue
  const currentMonthDiff = totalExpectedRevenue - revenueTarget.currentMonthTarget
  const laborTotal = data.laborCost.employees.reduce((sum, employee) => {
    const basicSalary = employee.payType === '시급제' ? employee.hourlyWage * employee.monthlyHours : employee.monthlySalary
    const weeklyHoliday = employee.payType === '시급제' && employee.weeklyHolidayIncluded ? employee.hourlyWage * 8 * 4.345 : 0
    const indirectCost = basicSalary * (employee.indirectRate / 100)
    return sum + basicSalary + weeklyHoliday + indirectCost
  }, 0)
  const utilityForecast = data.utilityForecast
  const averageElectric = (utilityForecast.electricPrev2Month + utilityForecast.electricLastMonth) / 2
  const averageWater = (utilityForecast.waterPrev2Month + utilityForecast.waterLastMonth) / 2
  const averageGas = (utilityForecast.gasPrev2Month + utilityForecast.gasLastMonth) / 2
  const seasonAdjustments = {
    봄: { electricity: 0, water: 0, gas: 0 },
    여름: { electricity: 0.15, water: 0.05, gas: -0.1 },
    가을: { electricity: 0, water: 0, gas: 0 },
    겨울: { electricity: 0.05, water: 0, gas: 0.2 },
  }
  const intensityAdjustments = {
    낮음: -0.05,
    보통: 0,
    높음: 0.1,
  }
  const seasonAdj = seasonAdjustments[utilityForecast.season]
  const intensityAdj = intensityAdjustments[utilityForecast.intensity]
  const estimatedElectric = Math.round(averageElectric * (1 + seasonAdj.electricity) * (1 + intensityAdj))
  const estimatedWater = Math.round(averageWater * (1 + seasonAdj.water) * (1 + intensityAdj))
  const estimatedGas = Math.round(averageGas * (1 + seasonAdj.gas) * (1 + intensityAdj))
  const estimatedUtilityTotal = estimatedElectric + estimatedWater + estimatedGas
  const monthlyOperatingCost = totalCost
  const expectedOperatingProfit = totalExpectedRevenue - laborTotal - estimatedUtilityTotal - monthlyOperatingCost

  const actionNeeded = unresolvedCount >= 3 || repeatComplaints > 0 ? '예' : '아니오'

  useEffect(() => {
    setMessage(statusMessage)
  }, [statusMessage])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const result = await onImportData(file)
    setMessage(result.message)
    event.target.value = ''
  }

  return (
    <div className="page">
      <PageHeader
        title="대시보드"
        description="커뮤니티센터 운영 현황과 핵심 지표를 한눈에 확인하세요."
      />

      <Card title="데이터 관리">
        <div className="dashboard-control-group">
          <Button variant="secondary" onClick={onLoadSampleData}>샘플 단지 데이터 불러오기</Button>
          <Button variant="secondary" onClick={onExportData}>데이터 백업</Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>데이터 불러오기</Button>
          <Button variant="secondary" onClick={onReset}>전체 데이터 초기화</Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
        <p className="dashboard-note">JSON 업로드 시 기존 데이터가 덮어써집니다.</p>
        {message && <p className="dashboard-alert">{message}</p>}
      </Card>

      <Card title="출력물 바로가기">
        <div className="dashboard-control-group">
          <Button variant="secondary" onClick={() => navigateToOutput('운영 진단 보고서')}>운영 진단 보고서 보기</Button>
          <Button variant="secondary" onClick={() => navigateToOutput('월간 운영 리포트')}>월간 운영 리포트 보기</Button>
          <Button variant="secondary" onClick={() => navigateToOutput('입주자대표회의 보고용 요약')}>입주자대표회의 보고용 요약 보기</Button>
          <Button variant="secondary" onClick={() => navigateToOutput('MIK 내부 검토표')}>MIK 내부 검토표 보기</Button>
        </div>
      </Card>

      <Card title="문서 도구 바로가기">
        <div className="dashboard-control-group">
          <Button variant="secondary" onClick={() => navigateToPage('document')}>문서 생성</Button>
          <Button variant="secondary" onClick={() => navigateToPage('contract')}>계약서 생성</Button>
          <Button variant="secondary" onClick={() => navigateToPage('review')}>계약서 검토</Button>
          <Button variant="secondary" onClick={() => navigateToPage('agenda')}>입대의 안건 예상</Button>
        </div>
        <p className="dashboard-note">문서 생성과 계약 검토, 입대의 안건 예측 기능을 빠르게 이용할 수 있습니다.</p>
      </Card>

      <div className="stats-grid">
        <StatBox label="총 세대수" value={data.apartmentInfo.totalUnits || '-'} unit="세대" />
        <StatBox label="월간 운영비" value={formatMoney(totalCost)} />
        <StatBox label="월간 수익" value={formatMoney(totalRevenue)} />
        <StatBox label="월 손익" value={formatMoney(monthlyProfit)} />
        <StatBox label="인건비 비중" value={formatPercent(laborRatio)} />
        <StatBox label="미해결 민원" value={unresolvedCount} unit="건" />
      </div>

      <Card title="운영 예측 요약">
        <div className="stats-grid">
          <StatBox label="총 예상 매출" value={formatMoney(totalExpectedRevenue)} />
          <StatBox label="당월 목표 대비" value={formatMoney(currentMonthDiff)} />
          <StatBox label="전체 총 인건비" value={formatMoney(laborTotal)} />
          <StatBox label="예상 총 공과금" value={formatMoney(estimatedUtilityTotal)} />
          <StatBox label="예상 운영 손익" value={formatMoney(expectedOperatingProfit)} />
        </div>
      </Card>

      <Card title="수익・비용 상태">
        <div className="dashboard-summary-grid">
          <div>
            <p className="summary-label">월 손익 상태</p>
            <div className={`status-chip ${profitStatusClass}`}>{profitStatus}</div>
          </div>
          <div>
            <p className="summary-label">인건비 비중</p>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(laborRatio, 100)}%`, background: laborWarning ? '#dc3545' : '#0d6efd' }} />
            </div>
            <p className="progress-text">{formatPercent(laborRatio)} {laborWarning ? '(경고: 높음)' : ''}</p>
          </div>
          <div>
            <p className="summary-label">우선 조치 필요</p>
            <p>{actionNeeded}</p>
          </div>
        </div>
      </Card>

      <Card title="비용 구성 비율">
        <div className="bar-chart">
          {costChart.map(item => {
            const percent = totalCostChart > 0 ? (item.value / totalCostChart) * 100 : 0
            return (
              <div key={item.label} className="bar-item">
                <div className="bar-item-label">
                  <span>{item.label}</span>
                  <span>{formatMoney(item.value)}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${percent}%` }} />
                </div>
                <p className="bar-percent">{percent.toFixed(1)}%</p>
              </div>
            )
          })}
        </div>
      </Card>

      <Card title="수익 구성 비율">
        <div className="bar-chart">
          {revenueChart.map(item => {
            const percent = totalRevenueChart > 0 ? (item.value / totalRevenueChart) * 100 : 0
            return (
              <div key={item.label} className="bar-item">
                <div className="bar-item-label">
                  <span>{item.label}</span>
                  <span>{formatMoney(item.value)}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill bar-fill-revenue" style={{ width: `${percent}%` }} />
                </div>
                <p className="bar-percent">{percent.toFixed(1)}%</p>
              </div>
            )
          })}
        </div>
      </Card>

      <Card title="민원 유형별 요약">
        <div className="complaint-summary-grid">
          {Object.keys(complaintTypeCounts).length > 0 ? (
            Object.entries(complaintTypeCounts).map(([type, count]) => (
              <div key={type} className="complaint-summary-card">
                <p className="summary-label">{type}</p>
                <p className="summary-value">{count}건</p>
                <p className="summary-small">미해결 {complaintTypeUnresolved[type] || 0}건</p>
              </div>
            ))
          ) : (
            <p className="placeholder-content">등록된 민원이 없습니다.</p>
          )}
          <div className="complaint-summary-card wide">
            <p className="summary-label">반복 민원 여부</p>
            <p className="summary-value">{repeatComplaints > 0 ? '예' : '아니오'}</p>
            <p className="summary-small">{repeatComplaints > 0 ? '반복 민원 발생' : '반복 민원 없음'}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default Dashboard
