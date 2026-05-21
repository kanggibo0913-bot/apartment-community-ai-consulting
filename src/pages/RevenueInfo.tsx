import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import { RevenueInfoData, RevenueTargetInfo } from '../types/CommunityData'
import { formatMoney } from '../utils/formatUtils'
import './Pages.css'

interface RevenueInfoProps {
  data: RevenueInfoData
  revenueTarget: RevenueTargetInfo
  onChange: (next: Partial<RevenueInfoData>) => void
  onChangeRevenueTarget: (next: Partial<RevenueTargetInfo>) => void
  costTotal: number
}

const defaultRevenueData: RevenueInfoData = {
  usageFee: 0,
  ptFee: 0,
  gxFee: 0,
  golfLesson: 0,
  cafeSales: 0,
  rentalIncome: 0,
  otherIncome: 0,
}

const RevenueInfo: React.FC<RevenueInfoProps> = ({ data, revenueTarget, onChange, onChangeRevenueTarget, costTotal }) => {
  const membershipRevenue = revenueTarget.currentMembers * revenueTarget.avgMembershipPrice
  const totalExpectedRevenue = membershipRevenue + revenueTarget.ptForecast + revenueTarget.gxForecast + revenueTarget.otherServiceRevenue
  const currentMonthDiff = totalExpectedRevenue - revenueTarget.currentMonthTarget
  const nextMonthDiff = totalExpectedRevenue - revenueTarget.nextMonthTarget
  const totalRevenue = Object.values(data).reduce((sum, value) => sum + value, 0)
  const profit = totalRevenue - costTotal

  const getStatusLabel = (value: number) => (value >= 0 ? '초과' : '부족')
  const formatDiffLabel = (value: number) => `${formatMoney(Math.abs(value))} ${getStatusLabel(value)}`

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    onChange({ [name]: value === '' ? 0 : parseFloat(value) } as Partial<RevenueInfoData>)
  }

  const handleTargetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    onChangeRevenueTarget({ [name]: value === '' ? 0 : parseFloat(value) } as Partial<RevenueTargetInfo>)
  }

  const handleReset = () => {
    onChange(defaultRevenueData)
    onChangeRevenueTarget({
      currentMembers: 0,
      avgMembershipPrice: 0,
      ptForecast: 0,
      gxForecast: 0,
      otherServiceRevenue: 0,
      currentMonthTarget: 0,
      nextMonthTarget: 0,
    })
  }

  return (
    <div className="page">
      <PageHeader
        title="수익 정보"
        description="월별 수익 항목과 목표 대비 매출 예측을 입력하세요."
      />

      <Card title="📈 수익·목표 관리">
        <div className="form-row">
          <FormGroup label="현재 회원수">
            <input type="number" name="currentMembers" value={revenueTarget.currentMembers || ''} onChange={handleTargetChange} placeholder="예: 320" />
          </FormGroup>
          <FormGroup label="평균 회원권 단가 (원)">
            <input type="number" name="avgMembershipPrice" value={revenueTarget.avgMembershipPrice || ''} onChange={handleTargetChange} placeholder="예: 95000" />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="PT 예상 매출 (원)">
            <input type="number" name="ptForecast" value={revenueTarget.ptForecast || ''} onChange={handleTargetChange} placeholder="예: 6000000" />
          </FormGroup>
          <FormGroup label="GX 예상 매출 (원)">
            <input type="number" name="gxForecast" value={revenueTarget.gxForecast || ''} onChange={handleTargetChange} placeholder="예: 1200000" />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="기타 부가서비스 매출 (원)">
            <input type="number" name="otherServiceRevenue" value={revenueTarget.otherServiceRevenue || ''} onChange={handleTargetChange} placeholder="예: 800000" />
          </FormGroup>
          <FormGroup label="당월 목표 매출 (원)">
            <input type="number" name="currentMonthTarget" value={revenueTarget.currentMonthTarget || ''} onChange={handleTargetChange} placeholder="예: 16000000" />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="차월 목표 매출 (원)">
            <input type="number" name="nextMonthTarget" value={revenueTarget.nextMonthTarget || ''} onChange={handleTargetChange} placeholder="예: 17000000" />
          </FormGroup>
          <div />
        </div>

        <div className="stats-grid">
          <div className="result-card">
            <p className="result-label">회원권 예상 매출</p>
            <p className="result-value">{formatMoney(membershipRevenue)}</p>
          </div>
          <div className="result-card">
            <p className="result-label">총 예상 매출</p>
            <p className="result-value">{formatMoney(totalExpectedRevenue)}</p>
          </div>
          <div className={`result-card ${currentMonthDiff < 0 ? 'negative' : 'positive'}`}>
            <p className="result-label">당월 목표 대비</p>
            <p className="result-value">{formatDiffLabel(currentMonthDiff)}</p>
          </div>
          <div className={`result-card ${nextMonthDiff < 0 ? 'negative' : 'positive'}`}>
            <p className="result-label">차월 목표 대비</p>
            <p className="result-value">{formatDiffLabel(nextMonthDiff)}</p>
          </div>
        </div>
      </Card>

      <Card title="💹 수익 현황">
        <div className="stats-grid">
          <StatBox label="총 수익" value={formatMoney(totalRevenue)} icon="💰" />
          <StatBox label="월 손익" value={formatMoney(profit)} icon="📊" />
          <StatBox label="골프레슨" value={formatMoney(data.golfLesson)} icon="⛳" />
          <StatBox label="카페 매출" value={formatMoney(data.cafeSales)} icon="☕" />
        </div>
      </Card>

      <Card title="✏️ 수익 항목 입력">
        <form>
          <div className="form-row">
            <FormGroup label="이용료 수익 (원)">
              <input type="number" name="usageFee" value={data.usageFee || ''} onChange={handleChange} placeholder="예: 4500000" />
            </FormGroup>
            <FormGroup label="PT 수익 (원)">
              <input type="number" name="ptFee" value={data.ptFee || ''} onChange={handleChange} placeholder="예: 6000000" />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="GX 수익 (원)">
              <input type="number" name="gxFee" value={data.gxFee || ''} onChange={handleChange} placeholder="예: 1200000" />
            </FormGroup>
            <FormGroup label="골프레슨 수익 (원)">
              <input type="number" name="golfLesson" value={data.golfLesson || ''} onChange={handleChange} placeholder="예: 3500000" />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="카페 매출 (원)">
              <input type="number" name="cafeSales" value={data.cafeSales || ''} onChange={handleChange} placeholder="예: 2800000" />
            </FormGroup>
            <FormGroup label="대관 수익 (원)">
              <input type="number" name="rentalIncome" value={data.rentalIncome || ''} onChange={handleChange} placeholder="예: 0" />
            </FormGroup>
          </div>

          <FormGroup label="기타 수익 (원)">
            <input type="number" name="otherIncome" value={data.otherIncome || ''} onChange={handleChange} placeholder="예: 0" />
          </FormGroup>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button type="button" variant="primary" onClick={() => alert('입력값이 자동 저장됩니다.')}>저장</Button>
            <Button type="button" variant="secondary" onClick={handleReset}>초기화</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default RevenueInfo
