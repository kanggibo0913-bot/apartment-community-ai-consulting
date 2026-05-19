import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import StatBox from '../components/StatBox'
import './Pages.css'

const AIAnalysis: React.FC = () => {
  return (
    <div className="page">
      <PageHeader 
        title="🤖 AI 분석 결과"
        description="입력된 데이터를 기반으로 AI가 분석한 결과를 확인합니다."
      />

      {/* Analysis Overview */}
      <Card title="📊 분석 현황">
        <div className="stats-grid">
          <StatBox label="분석 데이터" value="수집중" icon="📥" />
          <StatBox label="인건비 분석" value="미준비" icon="👥" />
          <StatBox label="운영비 분석" value="미준비" icon="⚙️" />
          <StatBox label="수익성 분석" value="미준비" icon="📈" />
        </div>
      </Card>

      {/* Cost Analysis */}
      <Card title="💰 비용 분석">
        <div className="placeholder-content">
          <p>비용 효율성 분석 결과</p>
          <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px' }}>다음 단계에서 구현</p>
          <ul style={{ marginTop: '12px', fontSize: '13px', color: '#666' }}>
            <li>인건비 비중 분석</li>
            <li>비용 추이 분석</li>
            <li>절감 방안 제안</li>
          </ul>
        </div>
      </Card>

      {/* Revenue Analysis */}
      <Card title="📈 수익 분석">
        <div className="placeholder-content">
          <p>수익성 분석 결과</p>
          <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px' }}>다음 단계에서 구현</p>
          <ul style={{ marginTop: '12px', fontSize: '13px', color: '#666' }}>
            <li>월간 수익 추이</li>
            <li>수익원별 구성</li>
            <li>성장 잠재력 평가</li>
          </ul>
        </div>
      </Card>

      {/* Complaint Analysis */}
      <Card title="📊 민원 분석">
        <div className="placeholder-content">
          <p>민원 현황 분석 결과</p>
          <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px' }}>다음 단계에서 구현</p>
          <ul style={{ marginTop: '12px', fontSize: '13px', color: '#666' }}>
            <li>주요 민원 분류</li>
            <li>처리 현황</li>
            <li>개선 권고사항</li>
          </ul>
        </div>
      </Card>

      {/* Recommendations */}
      <Card title="💡 종합 평가 및 권고">
        <div className="placeholder-content">
          <p>AI 종합 평가</p>
          <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px' }}>다음 단계에서 구현</p>
          <ul style={{ marginTop: '12px', fontSize: '13px', color: '#666' }}>
            <li>운영 효율성 평가</li>
            <li>주요 개선 사항</li>
            <li>실행 계획 제안</li>
          </ul>
        </div>
      </Card>
    </div>
  )
}

export default AIAnalysis
