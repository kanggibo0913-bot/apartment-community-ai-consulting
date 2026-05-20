import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import { ApartmentInfoData } from '../types/CommunityData'
import './Pages.css'

interface ApartmentInfoProps {
  data: ApartmentInfoData
  onChange: (next: Partial<ApartmentInfoData>) => void
}

const defaultApartmentInfo: ApartmentInfoData = {
  name: '',
  region: '',
  totalUnits: 0,
  buildingCount: 0,
  builtYear: 0,
  communityArea: 0,
  officeName: '',
  remarks: '',
}

const ApartmentInfo: React.FC<ApartmentInfoProps> = ({ data, onChange }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (['totalUnits', 'buildingCount', 'builtYear', 'communityArea'].includes(name)) {
      onChange({ [name]: value === '' ? 0 : parseInt(value, 10) } as Partial<ApartmentInfoData>)
      return
    }
    onChange({ [name]: value } as Partial<ApartmentInfoData>)
  }

  const handleReset = () => {
    onChange(defaultApartmentInfo)
  }

  return (
    <div className="page">
      <PageHeader
        title="단지 기본정보"
        description="단지 기본정보를 입력하면 대시보드 요약에 자동 반영됩니다."
      />

      <Card title="📋 현재 등록 정보">
        <div className="stats-grid">
          <StatBox label="아파트명" value={data.name || '미입력'} icon="🏢" />
          <StatBox label="총 세대수" value={data.totalUnits || '미입력'} unit="세대" icon="🏠" />
          <StatBox label="동 수" value={data.buildingCount || '미입력'} unit="동" icon="🏘️" />
          <StatBox label="준공연도" value={data.builtYear || '미입력'} icon="📅" />
          <StatBox label="커뮤니티 면적" value={data.communityArea || '미입력'} unit="㎡" icon="📐" />
          <StatBox label="관리사무소명" value={data.officeName || '미입력'} icon="🏢" />
        </div>
      </Card>

      <Card title="✏️ 단지 정보 입력">
        <form>
          <div className="form-row">
            <FormGroup label="단지명" required>
              <input
                type="text"
                name="name"
                value={data.name}
                onChange={handleChange}
                placeholder="예: 한강 아파트"
              />
            </FormGroup>
            <FormGroup label="지역" required>
              <input
                type="text"
                name="region"
                value={data.region}
                onChange={handleChange}
                placeholder="예: 서울시 강남구"
              />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="세대수" required>
              <input
                type="number"
                name="totalUnits"
                value={data.totalUnits || ''}
                onChange={handleChange}
                placeholder="예: 150"
              />
            </FormGroup>
            <FormGroup label="동 수" required>
              <input
                type="number"
                name="buildingCount"
                value={data.buildingCount || ''}
                onChange={handleChange}
                placeholder="예: 8"
              />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="준공연도" required>
              <input
                type="number"
                name="builtYear"
                value={data.builtYear || ''}
                onChange={handleChange}
                placeholder="예: 2014"
              />
            </FormGroup>
            <FormGroup label="커뮤니티 면적 (㎡)" required>
              <input
                type="number"
                name="communityArea"
                value={data.communityArea || ''}
                onChange={handleChange}
                placeholder="예: 2500"
              />
            </FormGroup>
          </div>

          <FormGroup label="관리사무소명" required>
            <input
              type="text"
              name="officeName"
              value={data.officeName}
              onChange={handleChange}
              placeholder="예: 한강 관리사무소"
            />
          </FormGroup>

          <FormGroup label="비고">
            <textarea
              name="remarks"
              value={data.remarks}
              onChange={handleChange}
              placeholder="추가로 필요한 단지 정보를 입력하세요."
            />
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

export default ApartmentInfo
