import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import './Pages.css'

const FacilityInfo: React.FC = () => {
  const [facilities, setFacilities] = useState([
    { id: 1, name: '커뮤니티센터', area: 500, status: '운영중' },
    { id: 2, name: '체육관', area: 800, status: '운영중' },
    { id: 3, name: '도서관', area: 300, status: '폐쇄' },
  ])

  const [newFacility, setNewFacility] = useState({
    name: '',
    area: '',
    status: '운영중',
  })

  const handleAddFacility = (e: React.FormEvent) => {
    e.preventDefault()
    if (newFacility.name && newFacility.area) {
      setFacilities(prev => [
        ...prev,
        {
          id: Math.max(...prev.map(f => f.id), 0) + 1,
          ...newFacility,
          area: parseInt(newFacility.area),
        }
      ])
      setNewFacility({ name: '', area: '', status: '운영중' })
      alert('시설이 추가되었습니다. (아직 로컬스토리지 미지원)')
    }
  }

  return (
    <div className="page">
      <PageHeader 
        title="🏛️ 시설 정보"
        description="아파트 단지 내 시설의 정보를 관리합니다."
      />

      {/* Current Facilities */}
      <Card title="📍 등록된 시설">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>시설명</th>
                <th>면적 (㎡)</th>
                <th>운영상태</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map(facility => (
                <tr key={facility.id}>
                  <td>{facility.name}</td>
                  <td>{facility.area}</td>
                  <td>
                    <span className={`status-badge status-${facility.status}`}>
                      {facility.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add New Facility */}
      <Card title="➕ 시설 추가">
        <form onSubmit={handleAddFacility}>
          <div className="form-row">
            <FormGroup label="시설명" required>
              <input
                type="text"
                value={newFacility.name}
                onChange={(e) => setNewFacility(prev => ({ ...prev, name: e.target.value }))}
                placeholder="예: 피트니스센터"
              />
            </FormGroup>
            <FormGroup label="면적 (㎡)" required>
              <input
                type="number"
                value={newFacility.area}
                onChange={(e) => setNewFacility(prev => ({ ...prev, area: e.target.value }))}
                placeholder="예: 600"
              />
            </FormGroup>
            <FormGroup label="운영상태" required>
              <select
                value={newFacility.status}
                onChange={(e) => setNewFacility(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="운영중">운영중</option>
                <option value="폐쇄">폐쇄</option>
                <option value="유지보수">유지보수</option>
              </select>
            </FormGroup>
          </div>

          <Button type="submit" variant="primary">
            ➕ 추가
          </Button>
        </form>
      </Card>
    </div>
  )
}

export default FacilityInfo
