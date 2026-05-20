import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import { ComplaintItem, ComplaintStatus, ComplaintType } from '../types/CommunityData'
import './Pages.css'

interface ComplaintInfoProps {
  complaints: ComplaintItem[]
  onChange: (items: ComplaintItem[]) => void
}

const defaultComplaint: Omit<ComplaintItem, 'id'> = {
  content: '',
  type: '시설 고장',
  status: '접수',
  date: new Date().toISOString().split('T')[0],
  action: '',
}

const ComplaintInfo: React.FC<ComplaintInfoProps> = ({ complaints, onChange }) => {
  const [newComplaint, setNewComplaint] = useState(defaultComplaint)

  const unresolved = complaints.filter(item => item.status !== '완료').length
  const statusStats = {
    total: complaints.length,
    pending: complaints.filter(item => item.status === '접수').length,
    processing: complaints.filter(item => item.status === '진행 중').length,
    completed: complaints.filter(item => item.status === '완료').length,
    repeat: complaints.filter(item => item.status === '반복 민원').length,
  }

  const recentComplaints = [...complaints]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)

  const handleAddComplaint = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComplaint.content.trim()) return

    onChange([
      ...complaints,
      {
        id: Math.max(0, ...complaints.map(item => item.id)) + 1,
        ...newComplaint,
        date: new Date().toISOString().split('T')[0],
      },
    ])
    setNewComplaint({ ...defaultComplaint, date: new Date().toISOString().split('T')[0] })
  }

  const handleDelete = (id: number) => {
    onChange(complaints.filter(item => item.id !== id))
  }

  return (
    <div className="page">
      <PageHeader
        title="민원 정보"
        description="민원 접수, 상태, 조치 내용을 기록하고 미해결 건수를 대시보드에 반영합니다."
      />

      <Card title="📊 민원 현황">
        <div className="stats-grid">
          <StatBox label="총 민원" value={statusStats.total} unit="건" icon="📋" />
          <StatBox label="미해결 민원" value={unresolved} unit="건" icon="⏳" />
          <StatBox label="진행 중" value={statusStats.processing} unit="건" icon="⚙️" />
          <StatBox label="완료" value={statusStats.completed} unit="건" icon="✅" />
        </div>
      </Card>

      <Card title="📝 최근 민원">
        {recentComplaints.length ? (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>접수일</th>
                  <th>민원유형</th>
                  <th>상태</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {recentComplaints.map(item => (
                  <tr key={item.id}>
                    <td data-label="접수일">{item.date}</td>
                    <td data-label="민원유형">{item.type}</td>
                    <td data-label="상태">{item.status}</td>
                    <td data-label="내용">{item.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="placeholder-content">민원 기록이 없습니다. 새 민원을 등록하면 최근 민원이 표시됩니다.</p>
        )}
      </Card>

      <Card title="➕ 민원 접수">
        <form onSubmit={handleAddComplaint}>
          <div className="form-row">
            <FormGroup label="민원 내용" required>
              <textarea
                value={newComplaint.content}
                onChange={(e) => setNewComplaint(prev => ({ ...prev, content: e.target.value }))}
                placeholder="민원 내용을 상세히 입력해주세요."
              />
            </FormGroup>
          </div>

          <div className="form-row">
            <FormGroup label="민원 유형" required>
              <select
                value={newComplaint.type}
                onChange={(e) => setNewComplaint(prev => ({ ...prev, type: e.target.value as ComplaintType }))}
              >
                <option value="시설 고장">시설 고장</option>
                <option value="청소 상태">청소 상태</option>
                <option value="운영시간">운영시간</option>
                <option value="직원 응대">직원 응대</option>
                <option value="프로그램 불만">프로그램 불만</option>
                <option value="요금 관련">요금 관련</option>
                <option value="기타">기타</option>
              </select>
            </FormGroup>
            <FormGroup label="처리 상태" required>
              <select
                value={newComplaint.status}
                onChange={(e) => setNewComplaint(prev => ({ ...prev, status: e.target.value as ComplaintStatus }))}
              >
                <option value="접수">접수</option>
                <option value="진행 중">진행 중</option>
                <option value="완료">완료</option>
                <option value="반복 민원">반복 민원</option>
              </select>
            </FormGroup>
          </div>

          <FormGroup label="조치 내용">
            <textarea
              value={newComplaint.action}
              onChange={(e) => setNewComplaint(prev => ({ ...prev, action: e.target.value }))}
              placeholder="조치 내용을 입력하세요."
            />
          </FormGroup>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button type="submit" variant="primary">접수</Button>
            <Button type="button" variant="secondary" onClick={() => setNewComplaint({ ...defaultComplaint, date: new Date().toISOString().split('T')[0] })}>초기화</Button>
          </div>
        </form>
      </Card>

      {complaints.length > 0 && (
        <Card title="민원 목록">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>접수일</th>
                  <th>유형</th>
                  <th>상태</th>
                  <th>내용</th>
                  <th>조치</th>
                  <th>삭제</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map(item => (
                  <tr key={item.id}>
                    <td data-label="접수일">{item.date}</td>
                    <td data-label="유형">{item.type}</td>
                    <td data-label="상태">{item.status}</td>
                    <td data-label="내용">{item.content}</td>
                    <td data-label="조치">{item.action || '없음'}</td>
                    <td data-label="삭제">
                      <Button type="button" variant="danger" onClick={() => handleDelete(item.id)}>
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

export default ComplaintInfo
