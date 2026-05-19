import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import './Pages.css'

const ComplaintInfo: React.FC = () => {
  const [complaints, setComplaints] = useState([
    { id: 1, category: '소음', status: '처리중', date: '2024-01-15', description: '심야 소음 민원' },
    { id: 2, category: '시설', status: '해결', date: '2024-01-10', description: '엘리베이터 고장' },
    { id: 3, category: '관리', status: '미처리', date: '2024-01-18', description: '청소 불만족' },
  ])

  const [newComplaint, setNewComplaint] = useState({
    category: '',
    status: '미처리',
    description: '',
  })

  const statusStats = {
    total: complaints.length,
    pending: complaints.filter(c => c.status === '미처리').length,
    processing: complaints.filter(c => c.status === '처리중').length,
    resolved: complaints.filter(c => c.status === '해결').length,
  }

  const handleAddComplaint = (e: React.FormEvent) => {
    e.preventDefault()
    if (newComplaint.category && newComplaint.description) {
      setComplaints(prev => [
        ...prev,
        {
          id: Math.max(...prev.map(c => c.id), 0) + 1,
          ...newComplaint,
          date: new Date().toISOString().split('T')[0],
        }
      ])
      setNewComplaint({ category: '', status: '미처리', description: '' })
      alert('민원이 기록되었습니다. (아직 로컬스토리지 미지원)')
    }
  }

  const getStatusBadgeClass = (status: string) => {
    return `status-${status === '해결' ? '해결' : status === '처리중' ? '처리중' : '미처리'}`
  }

  return (
    <div className="page">
      <PageHeader 
        title="📞 민원 정보"
        description="주민 민원을 접수하고 현황을 관리합니다."
      />

      {/* Status Summary */}
      <Card title="📊 민원 현황">
        <div className="stats-grid">
          <StatBox label="총 민원" value={statusStats.total} unit="건" icon="📋" />
          <StatBox label="미처리" value={statusStats.pending} unit="건" icon="⏳" />
          <StatBox label="처리중" value={statusStats.processing} unit="건" icon="⚙️" />
          <StatBox label="해결" value={statusStats.resolved} unit="건" icon="✅" />
        </div>
      </Card>

      {/* Complaint List */}
      <Card title="📝 민원 목록">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>분류</th>
                <th>내용</th>
                <th>상태</th>
                <th>접수일</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map(complaint => (
                <tr key={complaint.id}>
                  <td>{complaint.category}</td>
                  <td>{complaint.description}</td>
                  <td>
                    <span className={`status-badge ${getStatusBadgeClass(complaint.status)}`}>
                      {complaint.status}
                    </span>
                  </td>
                  <td>{complaint.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add New Complaint */}
      <Card title="➕ 민원 접수">
        <form onSubmit={handleAddComplaint}>
          <div className="form-row">
            <FormGroup label="민원 분류" required>
              <input
                type="text"
                value={newComplaint.category}
                onChange={(e) => setNewComplaint(prev => ({ ...prev, category: e.target.value }))}
                placeholder="예: 소음, 시설, 관리"
              />
            </FormGroup>
            <FormGroup label="상태" required>
              <select
                value={newComplaint.status}
                onChange={(e) => setNewComplaint(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="미처리">미처리</option>
                <option value="처리중">처리중</option>
                <option value="해결">해결</option>
              </select>
            </FormGroup>
          </div>

          <FormGroup label="민원 내용" required>
            <textarea
              value={newComplaint.description}
              onChange={(e) => setNewComplaint(prev => ({ ...prev, description: e.target.value }))}
              placeholder="민원 내용을 상세히 입력해주세요."
            />
          </FormGroup>

          <Button type="submit" variant="primary">
            ➕ 접수
          </Button>
        </form>
      </Card>
    </div>
  )
}

export default ComplaintInfo
