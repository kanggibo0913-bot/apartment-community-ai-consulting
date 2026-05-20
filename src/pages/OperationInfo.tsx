import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import { OperationInfoData } from '../types/CommunityData'
import './Pages.css'

interface OperationInfoProps {
  data: OperationInfoData
  onChange: (next: Partial<OperationInfoData>) => void
}

const defaultOperationInfo: OperationInfoData = {
  weekdayHours: '',
  weekendHours: '',
  holidays: '',
  staffCount: 0,
  openStaffNeeded: false,
  closeStaffNeeded: false,
  unmannedHours: '',
  currentIssues: '',
}

const OperationInfo: React.FC<OperationInfoProps> = ({ data, onChange }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, checked } = e.target as HTMLInputElement
    if (name === 'staffCount') {
      onChange({ staffCount: value === '' ? 0 : parseInt(value, 10) })
      return
    }

    if (name === 'openStaffNeeded' || name === 'closeStaffNeeded') {
      onChange({ [name]: checked } as Partial<OperationInfoData>)
      return
    }

    onChange({ [name]: value } as Partial<OperationInfoData>)
  }

  const handleReset = () => {
    onChange(defaultOperationInfo)
  }

  return (
    <div className="page">
      <PageHeader
        title="운영 정보"
        description="커뮤니티센터 운영 조건을 상세히 기록하고 관리합니다."
      />

      <Card title="📊 운영 현황">
        <div className="stats-grid">
          <StatBox label="평일 운영시간" value={data.weekdayHours || '미입력'} icon="🕒" />
          <StatBox label="주말 운영시간" value={data.weekendHours || '미입력'} icon="🌤️" />
          <StatBox label="휴무일" value={data.holidays || '미입력'} icon="📅" />
          <StatBox label="직원 수" value={data.staffCount || '미입력'} unit="명" icon="👥" />
        </div>
      </Card>

      <Card title="✏️ 운영 정보 입력">
        <form>
          <div className="form-row">
            <FormGroup label="평일 운영시간" required>
              <input
                type="text"
                name="weekdayHours"
                value={data.weekdayHours}
                onChange={handleChange}
                placeholder="예: 09:00 ~ 18:00"
              />
            </FormGroup>
            <FormGroup label="주말 운영시간" required>
              <input
                type="text"
                name="weekendHours"
                value={data.weekendHours}
                onChange={handleChange}
                placeholder="예: 10:00 ~ 16:00"
              />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="휴무일" required>
              <input
                type="text"
                name="holidays"
                value={data.holidays}
                onChange={handleChange}
                placeholder="예: 매주 월요일"
              />
            </FormGroup>
            <FormGroup label="현재 직원 수" required>
              <input
                type="number"
                name="staffCount"
                value={data.staffCount || ''}
                onChange={handleChange}
                placeholder="예: 4"
              />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="오픈 담당 필요 여부" required>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  name="openStaffNeeded"
                  checked={data.openStaffNeeded}
                  onChange={handleChange}
                />
                필요
              </label>
            </FormGroup>
            <FormGroup label="마감 담당 필요 여부" required>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  name="closeStaffNeeded"
                  checked={data.closeStaffNeeded}
                  onChange={handleChange}
                />
                필요
              </label>
            </FormGroup>
          </div>

          <FormGroup label="무인 운영 가능 시간">
            <input
              type="text"
              name="unmannedHours"
              value={data.unmannedHours}
              onChange={handleChange}
              placeholder="예: 12:00 ~ 14:00"
            />
          </FormGroup>

          <FormGroup label="현재 운영상 문제점">
            <textarea
              name="currentIssues"
              value={data.currentIssues}
              onChange={handleChange}
              placeholder="운영 현장에서 확인된 문제점을 입력하세요."
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

export default OperationInfo
