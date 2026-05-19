import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import { FacilityDetail } from '../types/CommunityData'
import './Pages.css'

interface FacilityInfoProps {
  facilityInfo: { items: FacilityDetail[] }
  onChange: (items: FacilityDetail[]) => void
}

const FacilityInfo: React.FC<FacilityInfoProps> = ({ facilityInfo, onChange }) => {
  const handleItemChange = (id: number, next: Partial<FacilityDetail>) => {
    const updated = facilityInfo.items.map(item =>
      item.id === id ? { ...item, ...next } : item
    )
    onChange(updated)
  }

  const enabledCount = facilityInfo.items.filter(item => item.enabled).length

  return (
    <div className="page">
      <PageHeader
        title="🏛️ 시설 정보"
        description="시설 가용 여부와 운영 조건을 입력하여 시설 운영 현황을 관리합니다."
      />

      <Card title="📍 시설 요약">
        <div className="stats-grid">
          <div className="stat-box" style={{ padding: 16, boxShadow: 'none', border: '1px solid #e9ecef' }}>
            <p className="stat-label">등록 시설 수</p>
            <p className="stat-value">{facilityInfo.items.length}</p>
          </div>
          <div className="stat-box" style={{ padding: 16, boxShadow: 'none', border: '1px solid #e9ecef' }}>
            <p className="stat-label">운영 중 시설</p>
            <p className="stat-value">{enabledCount}</p>
          </div>
        </div>
      </Card>

      <Card title="✏️ 시설 선택 및 상세">
        <div className="facility-grid">
          {facilityInfo.items.map(item => (
            <div key={item.id} className={`facility-card ${item.enabled ? 'facility-active' : ''}`}>
              <div className="facility-card-header">
                <label>
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) => handleItemChange(item.id, { enabled: e.target.checked, operatingStatus: e.target.checked ? '운영중' : '미운영' })}
                  />
                  <strong style={{ marginLeft: 8 }}>{item.name}</strong>
                </label>
              </div>

              <FormGroup label="운영 여부">
                <select
                  value={item.operatingStatus}
                  onChange={(e) => handleItemChange(item.id, { operatingStatus: e.target.value as FacilityDetail['operatingStatus'] })}
                  disabled={!item.enabled}
                >
                  <option value="운영중">운영중</option>
                  <option value="미운영">미운영</option>
                </select>
              </FormGroup>

              <FormGroup label="유료 / 무료">
                <select
                  value={item.paidType}
                  onChange={(e) => handleItemChange(item.id, { paidType: e.target.value as FacilityDetail['paidType'] })}
                  disabled={!item.enabled}
                >
                  <option value="유료">유료</option>
                  <option value="무료">무료</option>
                </select>
              </FormGroup>

              <FormGroup label="주요 이용 시간대">
                <input
                  type="text"
                  value={item.peakHours}
                  onChange={(e) => handleItemChange(item.id, { peakHours: e.target.value })}
                  placeholder="예: 오전 7시 - 9시"
                  disabled={!item.enabled}
                />
              </FormGroup>

              <FormGroup label="특이사항">
                <textarea
                  value={item.notes}
                  onChange={(e) => handleItemChange(item.id, { notes: e.target.value })}
                  placeholder="운영 관련 특이사항을 입력하세요."
                  disabled={!item.enabled}
                />
              </FormGroup>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" type="button" onClick={() => onChange(facilityInfo.items.map(item => ({ ...item, enabled: false })))}>
            전체 비활성화
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default FacilityInfo
