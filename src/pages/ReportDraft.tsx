import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import './Pages.css'

const ReportDraft: React.FC = () => {
  const handleGenerateReport = () => {
    alert('보고서 생성 기능은 다음 단계에서 구현됩니다.')
  }

  const handleDownloadReport = () => {
    alert('보고서 다운로드 기능은 다음 단계에서 구현됩니다.')
  }

  const handleExportPDF = () => {
    alert('PDF 내보내기 기능은 다음 단계에서 구현됩니다.')
  }

  return (
    <div className="page">
      <PageHeader 
        title="📄 보고서 초안"
        description="수집된 데이터와 AI 분석 결과를 기반으로 보고서 초안을 생성합니다."
      />

      {/* Report Status */}
      <Card title="📊 보고서 현황">
        <div className="stats-grid">
          <StatBox label="보고서 상태" value="미생성" icon="📋" />
          <StatBox label="최종 수정" value="미지정" icon="🕐" />
          <StatBox label="버전" value="v0.1" icon="📌" />
          <StatBox label="페이지" value="0" unit="p" icon="📄" />
        </div>
      </Card>

      {/* Report Generation */}
      <Card title="🔄 보고서 생성">
        <div className="placeholder-content">
          <p style={{ marginBottom: '16px' }}>아래 버튼을 클릭하여 최신 데이터를 바탕으로 보고서 초안을 생성합니다.</p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button onClick={handleGenerateReport} variant="primary">
              🔄 보고서 생성
            </Button>
            <Button onClick={handleDownloadReport} variant="secondary">
              📥 다운로드
            </Button>
            <Button onClick={handleExportPDF} variant="secondary">
              📄 PDF 내보내기
            </Button>
          </div>
        </div>
      </Card>

      {/* Report Preview */}
      <Card title="👁️ 보고서 미리보기">
        <div className="placeholder-content">
          <p>📋 <strong>아파트 커뮤니티센터 운영 현황 보고서</strong></p>
          <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #e9ecef' }} />
          <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.6' }}>
            <p><strong>1. 단지 개요</strong></p>
            <p style={{ marginLeft: '12px' }}>- 아파트명: 미입력</p>
            <p style={{ marginLeft: '12px' }}>- 총 세대수: 미입력</p>
            <p style={{ marginLeft: '12px' }}>- 준공연도: 미입력</p>
            
            <p style={{ marginTop: '12px' }}><strong>2. 재정 현황</strong></p>
            <p style={{ marginLeft: '12px' }}>- 총 비용: 미집계</p>
            <p style={{ marginLeft: '12px' }}>- 총 수익: 미집계</p>
            <p style={{ marginLeft: '12px' }}>- 순이익: 미집계</p>
            
            <p style={{ marginTop: '12px' }}><strong>3. 주요 지표</strong></p>
            <p style={{ marginLeft: '12px' }}>- 민원 현황: 미집계</p>
            <p style={{ marginLeft: '12px' }}>- 시설 운영률: 미집계</p>
            <p style={{ marginLeft: '12px' }}>- 운영 효율성: 미평가</p>
            
            <p style={{ marginTop: '12px' }}><strong>4. AI 분석 요약</strong></p>
            <p style={{ marginLeft: '12px' }}>- 종합 평가: 준비 중</p>
            <p style={{ marginLeft: '12px' }}>- 주요 개선사항: 준비 중</p>
            <p style={{ marginLeft: '12px' }}>- 실행 계획: 준비 중</p>
          </div>
        </div>
      </Card>

      {/* Report Settings */}
      <Card title="⚙️ 보고서 설정">
        <div className="placeholder-content">
          <p>보고서 생성 옵션을 설정할 수 있습니다.</p>
          <ul style={{ marginTop: '12px', fontSize: '13px', color: '#666' }}>
            <li>보고서 형식 선택</li>
            <li>포함할 데이터 범위 설정</li>
            <li>사용자 정의 섹션 추가</li>
          </ul>
          <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '12px' }}>다음 단계에서 구현</p>
        </div>
      </Card>
    </div>
  )
}

export default ReportDraft
