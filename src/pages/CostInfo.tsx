import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import { CostInfoData } from '../types/CommunityData'
import { formatMoney } from '../utils/formatUtils'
import './Pages.css'

interface CostInfoProps {
  data: CostInfoData
  onChange: (next: Partial<CostInfoData>) => void
}

const defaultCostData: CostInfoData = {
  salaries: 0,
  electricity: 0,
  water: 0,
  hvac: 0,
  supplies: 0,
  maintenance: 0,
  cleaning: 0,
  other: 0,
}

const CostInfo: React.FC<CostInfoProps> = ({ data, onChange }) => {
  const totalCost = Object.values(data).reduce((sum, value) => sum + value, 0)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    onChange({ [name]: value === '' ? 0 : parseFloat(value) } as Partial<CostInfoData>)
  }

  const handleReset = () => {
    onChange(defaultCostData)
  }

  return (
    <div className="page">
      <PageHeader
        title="비용 정보"
        description="월별 운영비를 상세히 입력하면 대시보드에 자동 집계됩니다."
      />

      <Card title="📊 월간 운영비 합계">
        <div className="stats-grid">
          <StatBox label="총 운영비" value={formatMoney(totalCost)} icon="💳" />
          <StatBox label="인건비" value={formatMoney(data.salaries)} icon="👤" />
          <StatBox label="전기세" value={formatMoney(data.electricity)} icon="🔌" />
          <StatBox label="수도세" value={formatMoney(data.water)} icon="🚰" />
        </div>
      </Card>

      <Card title="✏️ 비용 항목 입력">
        <form>
          <div className="form-row">
            <FormGroup label="인건비 (원)"> 
              <input type="number" name="salaries" value={data.salaries || ''} onChange={handleChange} placeholder="예: 9500000" />
            </FormGroup>
            <FormGroup label="전기세 (원)"> 
              <input type="number" name="electricity" value={data.electricity || ''} onChange={handleChange} placeholder="예: 2100000" />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="수도세 (원)"> 
              <input type="number" name="water" value={data.water || ''} onChange={handleChange} placeholder="예: 700000" />
            </FormGroup>
            <FormGroup label="냉난방비 (원)"> 
              <input type="number" name="hvac" value={data.hvac || ''} onChange={handleChange} placeholder="예: 1800000" />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="소모품비 (원)"> 
              <input type="number" name="supplies" value={data.supplies || ''} onChange={handleChange} placeholder="예: 500000" />
            </FormGroup>
            <FormGroup label="유지보수비 (원)"> 
              <input type="number" name="maintenance" value={data.maintenance || ''} onChange={handleChange} placeholder="예: 900000" />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="청소비 (원)"> 
              <input type="number" name="cleaning" value={data.cleaning || ''} onChange={handleChange} placeholder="예: 1200000" />
            </FormGroup>
            <FormGroup label="기타 비용 (원)"> 
              <input type="number" name="other" value={data.other || ''} onChange={handleChange} placeholder="예: 300000" />
            </FormGroup>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button type="button" variant="primary" onClick={() => alert('입력값이 자동 저장됩니다.')}>저장</Button>
            <Button type="button" variant="secondary" onClick={handleReset}>초기화</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default CostInfo
