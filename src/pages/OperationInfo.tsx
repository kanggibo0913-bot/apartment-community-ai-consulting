import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import './Pages.css'

const OperationInfo: React.FC = () => {
  const [operationData, setOperationData] = useState({
    managementCompany: '',
    operationStaff: '',
    workingHours: '',
    maintenanceSchedule: '',
    emergencyContact: '',
    notes: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setOperationData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Operation Info Submitted:', operationData)
    alert('저장되었습니다. (아직 로컬스토리지 미지원)')
  }

  return (
    <div className="page">
      <PageHeader 
        title="⚙️ 운영 정보"
        description="아파트 커뮤니티센터의 운영 관련 정보를 관리합니다."
      />

      {/* Current Status */}
      <Card title="📊 운영 현황">
        <div className="stats-grid">
          <StatBox label="관리업체" value={operationData.managementCompany || '미입력'} icon="🏢" />
          <StatBox label="운영 직원" value={operationData.operationStaff || '미입력'} unit="명" icon="👥" />
          <StatBox label="운영시간" value={operationData.workingHours || '미입력'} icon="🕐" />
          <StatBox label="정기점검" value={operationData.maintenanceSchedule || '미입력'} icon="🔍" />
        </div>
      </Card>

      {/* Operation Form */}
      <Card title="✏️ 운영 정보 입력">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <FormGroup label="관리업체명" required>
              <input
                type="text"
                name="managementCompany"
                value={operationData.managementCompany}
                onChange={handleChange}
                placeholder="예: 한라종로관리(주)"
              />
            </FormGroup>
            <FormGroup label="운영 직원 수" required>
              <input
                type="number"
                name="operationStaff"
                value={operationData.operationStaff}
                onChange={handleChange}
                placeholder="예: 5"
              />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="운영시간" required>
              <input
                type="text"
                name="workingHours"
                value={operationData.workingHours}
                onChange={handleChange}
                placeholder="예: 09:00 ~ 18:00"
              />
            </FormGroup>
            <FormGroup label="정기점검 주기" required>
              <input
                type="text"
                name="maintenanceSchedule"
                value={operationData.maintenanceSchedule}
                onChange={handleChange}
                placeholder="예: 월 1회"
              />
            </FormGroup>
          </div>

          <FormGroup label="긴급연락처" required>
            <input
              type="tel"
              name="emergencyContact"
              value={operationData.emergencyContact}
              onChange={handleChange}
              placeholder="예: 02-1234-5678"
            />
          </FormGroup>

          <FormGroup label="특이사항">
            <textarea
              name="notes"
              value={operationData.notes}
              onChange={handleChange}
              placeholder="운영 관련 특이사항을 입력해주세요."
            />
          </FormGroup>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            <Button type="submit" variant="primary">
              💾 저장
            </Button>
            <Button variant="secondary" type="reset">
              🔄 초기화
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default OperationInfo
