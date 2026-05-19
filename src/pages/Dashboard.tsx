import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import StatBox from '../components/StatBox'
import './Pages.css'

const Dashboard: React.FC = () => {
  return (
    <div className="page">
      <PageHeader 
        title="📊 대시보드"
        description="아파트 커뮤니티센터 운영 현황을 한눈에 볼 수 있습니다."
      />

      {/* Stats Overview */}
      <div className="stats-grid">
        <StatBox label="총 세대수" value={150} unit="세대" icon="🏠" />
        <StatBox label="월간 운영비" value={2500} unit="만원" icon="💳" />
        <StatBox label="월간 수익" value={1800} unit="만원" icon="📊" />
        <StatBox label="미해결 민원" value={12} unit="건" icon="📌" />
      </div>

      {/* Dashboard Cards */}
      <Card title="🚨 최근 민원">
        <div className="placeholder-content">
          <p>최근 민원 데이터가 표시될 예정입니다.</p>
          <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px' }}>다음 단계에서 구현</p>
        </div>
      </Card>

      <Card title="📈 수익 추이">
        <div className="placeholder-content">
          <p>수익 그래프가 표시될 예정입니다.</p>
          <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px' }}>다음 단계에서 구현</p>
        </div>
      </Card>

      <Card title="⚙️ 운영 상태">
        <div className="placeholder-content">
          <p>운영 상태 정보가 표시될 예정입니다.</p>
          <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px' }}>다음 단계에서 구현</p>
        </div>
      </Card>
    </div>
  )
}

export default Dashboard
