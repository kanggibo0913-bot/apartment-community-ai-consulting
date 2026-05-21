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
  const operatingCount = facilityInfo.items.filter(item => item.operatingStatus === '운영중').length
  const paidCount = facilityInfo.items.filter(item => item.paidType === '유료').length
  const freeCount = facilityInfo.items.filter(item => item.paidType === '무료').length
  const sortedItems = [...facilityInfo.items].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.id - b.id)

  return (
    <div className="page">
      <PageHeader
        title="시설 정보"
        description="시설 가용 여부와 운영 조건을 입력하여 시설 운영 현황을 관리합니다."
      />

      <Card title="📍 시설 요약">
        <div className="stats-grid">
          <div className="stat-box" style={{ padding: 16, boxShadow: 'none', border: '1px solid #e9ecef' }}>
            <p className="stat-label">등록 시설 수</p>
            <p className="stat-value">{facilityInfo.items.length}</p>
          </div>
          <div className="stat-box" style={{ padding: 16, boxShadow: 'none', border: '1px solid #e9ecef' }}>
            <p className="stat-label">선택 시설 수</p>
            <p className="stat-value">{enabledCount}</p>
          </div>
          <div className="stat-box" style={{ padding: 16, boxShadow: 'none', border: '1px solid #e9ecef' }}>
            <p className="stat-label">운영 시설 수</p>
            <p className="stat-value">{operatingCount}</p>
          </div>
          <div className="stat-box" style={{ padding: 16, boxShadow: 'none', border: '1px solid #e9ecef' }}>
            <p className="stat-label">유료 시설 수</p>
            <p className="stat-value">{paidCount}</p>
          </div>
          <div className="stat-box" style={{ padding: 16, boxShadow: 'none', border: '1px solid #e9ecef' }}>
            <p className="stat-label">무료 시설 수</p>
            <p className="stat-value">{freeCount}</p>
          </div>
        </div>
      </Card>

      <Card title="✏️ 시설 선택 및 상세">
        <div className="facility-grid">
          {sortedItems.map(item => (
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

              {item.name === '게스트하우스' && (
                <>
                  <div className="form-row">
                    <FormGroup label="객실 수">
                      <input
                        type="number"
                        value={item.roomCount || ''}
                        onChange={(e) => handleItemChange(item.id, { roomCount: parseInt(e.target.value || '0', 10) })}
                        disabled={!item.enabled}
                      />
                    </FormGroup>
                    <FormGroup label="1회 이용요금 (원)">
                      <input
                        type="number"
                        value={item.perUseFee || ''}
                        onChange={(e) => handleItemChange(item.id, { perUseFee: parseInt(e.target.value || '0', 10) })}
                        disabled={!item.enabled}
                      />
                    </FormGroup>
                  </div>

                  <div className="form-row">
                    <FormGroup label="월 예상 이용 건수">
                      <input
                        type="number"
                        value={item.monthlyUsageCount || ''}
                        onChange={(e) => handleItemChange(item.id, { monthlyUsageCount: parseInt(e.target.value || '0', 10) })}
                        disabled={!item.enabled}
                      />
                    </FormGroup>
                    <FormGroup label="예약 방식">
                      <input
                        type="text"
                        value={item.reservationType}
                        onChange={(e) => handleItemChange(item.id, { reservationType: e.target.value })}
                        disabled={!item.enabled}
                      />
                    </FormGroup>
                  </div>

                  <div className="form-row">
                    <FormGroup label="청소/관리 인력 필요 여부">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={item.needsCleaningStaff}
                          onChange={(e) => handleItemChange(item.id, { needsCleaningStaff: e.target.checked })}
                          disabled={!item.enabled}
                        />
                        필요
                      </label>
                    </FormGroup>
                    <FormGroup label="게스트하우스 월 예상 수익">
                      <input
                        type="text"
                        value={item.enabled ? `${(item.perUseFee || 0) * (item.monthlyUsageCount || 0)}` : ''}
                        readOnly
                      />
                    </FormGroup>
                  </div>
                </>
              )}

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
