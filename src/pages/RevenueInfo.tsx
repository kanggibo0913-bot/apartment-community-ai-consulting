import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import { RevenueInfoData } from '../types/CommunityData'
import './Pages.css'

interface RevenueInfoProps {
  data: RevenueInfoData
  onChange: (next: Partial<RevenueInfoData>) => void
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

const RevenueInfo: React.FC<RevenueInfoProps> = ({ data, onChange, costTotal }) => {
  const totalRevenue = Object.values(data).reduce((sum, value) => sum + value, 0)
  const profit = totalRevenue - costTotal

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    onChange({ [name]: value === '' ? 0 : parseFloat(value) } as Partial<RevenueInfoData>)
  }

  const handleReset = () => {
    onChange(defaultRevenueData)
  }

  return (
    <div className="page">
      <PageHeader
        title="📈 수익 정보"
        description="월별 수익 항목을 입력하면 총 수익과 손익이 자동 계산됩니다."
      />

      <Card title="💹 수익 현황">
        <div className="stats-grid">
          <StatBox label="총 수익" value={totalRevenue} unit="만원" icon="💰" />
          <StatBox label="월 손익" value={profit} unit="만원" icon="📊" />
          <StatBox label="골프레슨" value={data.golfLesson} unit="만원" icon="⛳" />
          <StatBox label="카페 매출" value={data.cafeSales} unit="만원" icon="☕" />
        </div>
      </Card>

      <Card title="✏️ 수익 항목 입력">
        <form>
          <div className="form-row">
            <FormGroup label="이용료 수익 (만원)">
              <input type="number" name="usageFee" value={data.usageFee || ''} onChange={handleChange} placeholder="예: 650" />
            </FormGroup>
            <FormGroup label="PT 수익 (만원)">
              <input type="number" name="ptFee" value={data.ptFee || ''} onChange={handleChange} placeholder="예: 180" />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="GX 수익 (만원)">
              <input type="number" name="gxFee" value={data.gxFee || ''} onChange={handleChange} placeholder="예: 100" />
            </FormGroup>
            <FormGroup label="골프레슨 수익 (만원)">
              <input type="number" name="golfLesson" value={data.golfLesson || ''} onChange={handleChange} placeholder="예: 120" />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="카페 매출 (만원)">
              <input type="number" name="cafeSales" value={data.cafeSales || ''} onChange={handleChange} placeholder="예: 230" />
            </FormGroup>
            <FormGroup label="대관 수익 (만원)">
              <input type="number" name="rentalIncome" value={data.rentalIncome || ''} onChange={handleChange} placeholder="예: 140" />
            </FormGroup>
          </div>

          <FormGroup label="기타 수익 (만원)">
            <input type="number" name="otherIncome" value={data.otherIncome || ''} onChange={handleChange} placeholder="예: 50" />
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
