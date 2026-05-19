import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import './Pages.css'

const ApartmentInfo: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    totalUnits: '',
    builtYear: '',
    commonArea: '',
    contactPerson: '',
    phone: '',
    email: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Apartment Info Submitted:', formData)
    alert('저장되었습니다. (아직 로컬스토리지 미지원)')
  }

  return (
    <div className="page">
      <PageHeader 
        title="🏢 단지 기본정보"
        description="아파트 단지의 기본 정보를 입력하고 관리합니다."
      />

      {/* Current Info */}
      <Card title="📋 현재 등록 정보">
        <div className="stats-grid">
          <StatBox label="아파트명" value={formData.name || '미입력'} icon="🏢" />
          <StatBox label="총 세대수" value={formData.totalUnits || '미입력'} icon="🏠" />
          <StatBox label="준공연도" value={formData.builtYear || '미입력'} icon="📅" />
          <StatBox label="공용면적" value={formData.commonArea || '미입력'} unit="㎡" icon="📐" />
        </div>
      </Card>

      {/* Input Form */}
      <Card title="✏️ 단지 정보 입력">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <FormGroup label="아파트명" required>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="예: 한강 아파트"
              />
            </FormGroup>
            <FormGroup label="위치" required>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="예: 서울시 강남구 테헤란로"
              />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="총 세대수" required>
              <input
                type="number"
                name="totalUnits"
                value={formData.totalUnits}
                onChange={handleChange}
                placeholder="예: 150"
              />
            </FormGroup>
            <FormGroup label="준공연도" required>
              <input
                type="number"
                name="builtYear"
                value={formData.builtYear}
                onChange={handleChange}
                placeholder="예: 2010"
              />
            </FormGroup>
          </div>

          <FormGroup label="공용면적 (㎡)" required>
            <input
              type="number"
              name="commonArea"
              value={formData.commonArea}
              onChange={handleChange}
              placeholder="예: 2500"
            />
          </FormGroup>

          <h3 style={{ marginTop: '24px', marginBottom: '16px', color: '#0d3b66' }}>담당자 정보</h3>

          <div className="form-row">
            <FormGroup label="담당자명" required>
              <input
                type="text"
                name="contactPerson"
                value={formData.contactPerson}
                onChange={handleChange}
                placeholder="예: 김관리"
              />
            </FormGroup>
            <FormGroup label="연락처" required>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="예: 02-1234-5678"
              />
            </FormGroup>
          </div>

          <FormGroup label="이메일">
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="예: manager@apartment.com"
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

export default ApartmentInfo
