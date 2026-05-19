import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import StatBox from '../components/StatBox'
import { CommunityData } from '../types/CommunityData'
import { analyzeCommunityData } from '../utils/analyzeCommunityData'
import { formatMoney, formatPercent } from '../utils/formatUtils'
import './Pages.css'

interface AIAnalysisProps {
  data: CommunityData
}

const AIAnalysis: React.FC<AIAnalysisProps> = ({ data }) => {
  const analysis = analyzeCommunityData(data)
  const {
    grade,
    metrics,
    laborCostAnalysis,
    costAnalysis,
    revenueAnalysis,
    complaintAnalysis,
    complaintTypeAnalysis,
    repeatComplaintRisk,
    facilityStaffAnalysis,
    operationOptimization,
    improvementAdvice,
    automationReview,
    coreRisks,
    priorityTasks,
    expectedBenefits,
    summary,
    keyTakeaways,
  } = analysis
  const gradeClass = `badge-${grade.replace(/\s+/g, '-')}`

  return (
    <div className="page">
      <PageHeader
        title="AI 분석 결과"
        description="입력된 커뮤니티 데이터를 기반으로 규칙 기반 진단과 개선 의견을 제공합니다."
      />

      <Card title="종합 진단 등급">
        <div className="analysis-grade">
          <p className="analysis-grade-label">현재 평가</p>
          <p className="analysis-grade-value">
            <span className={`diagnosis-badge ${gradeClass}`}>{grade}</span>
          </p>
          <p className="analysis-grade-summary">{summary}</p>
        </div>
      </Card>

      <Card title="핵심 지표">
        <div className="stats-grid">
          <StatBox label="총 운영비" value={formatMoney(metrics.totalCost)} icon="" />
          <StatBox label="총 수익" value={formatMoney(metrics.totalRevenue)} icon="" />
          <StatBox label="월 손익" value={formatMoney(metrics.profit)} icon="" />
          <StatBox label="인건비 비중" value={formatPercent(metrics.laborRatio)} icon="" />
          <StatBox label="미해결 민원" value={metrics.unresolvedComplaints} unit="건" icon="" />
          <StatBox label="활성 시설 수" value={metrics.activeFacilityCount} unit="개" icon="" />
        </div>
      </Card>

      <Card title="인건비 분석">
        <p>{laborCostAnalysis}</p>
      </Card>

      <Card title="비용 분석">
        <p>{costAnalysis}</p>
      </Card>

      <Card title="수익성 분석">
        <p>{revenueAnalysis}</p>
      </Card>

      <Card title="민원 분석">
        <p>{complaintAnalysis}</p>
        <p>{complaintTypeAnalysis}</p>
        <p>{repeatComplaintRisk}</p>
      </Card>

      <Card title="주요 리스크">
        <ul className="analysis-list">
          {coreRisks.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card title="우선 과제">
        <ul className="analysis-list">
          {priorityTasks.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card title="기대 효과">
        <ul className="analysis-list">
          {expectedBenefits.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card title="운영 개선 의견">
        <p>{operationOptimization}</p>
        <p>{facilityStaffAnalysis}</p>
        <p>{improvementAdvice}</p>
      </Card>

      <Card title="자동화 검토 의견">
        <p>{automationReview}</p>
      </Card>

      <Card title="입대의 보고용 요약">
        <div className="analysis-summary-list">
          {keyTakeaways.slice(0, 5).map((item, index) => (
            <p key={index}>• {item}</p>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default AIAnalysis
