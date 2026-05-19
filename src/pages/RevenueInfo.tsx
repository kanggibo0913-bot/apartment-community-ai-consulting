import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import './Pages.css'

const RevenueInfo: React.FC = () => {
  const [revenues, setRevenues] = useState([
    { id: 1, source: '시설 임대료', amount: 600, date: '2024-01' },
    { id: 2, source: '사용료', amount: 400, date: '2024-01' },
    { id: 3, source: '기타수입', amount: 100, date: '2024-01' },
  ])

  const [newRevenue, setNewRevenue] = useState({
    source: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  })

  const totalRevenue = revenues.reduce((sum, rev) => sum + rev.amount, 0)

  const handleAddRevenue = (e: React.FormEvent) => {
    e.preventDefault()
    if (newRevenue.source && newRevenue.amount) {
      setRevenues(prev => [
        ...prev,
        {
          id: Math.max(...prev.map(r => r.id), 0) + 1,
          ...newRevenue,
          amount: parseInt(newRevenue.amount),
        }
      ])
      setNewRevenue({ source: '', amount: '', date: new Date().toISOString().split('T')[0] })
      alert('수익이 기록되었습니다. (아직 로컬스토리지 미지원)')
    }
  }

  return (
    <div className="page">
      <PageHeader 
        title="📈 수익 정보"
        description="커뮤니티센터 운영을 통한 수익을 기록하고 관리합니다."
      />

      {/* Revenue Summary */}
      <Card title="💹 수익 현황">
        <div className="stats-grid">
          <StatBox label="총 수익" value={totalRevenue} unit="만원" icon="💰" />
          <StatBox label="시설임대료" value={600} unit="만원" icon="🏪" />
          <StatBox label="사용료" value={400} unit="만원" icon="🎫" />
          <StatBox label="기타수입" value={100} unit="만원" icon="📌" />
        </div>
      </Card>

      {/* Revenue History */}
      <Card title="📝 수익 기록">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>수익 원천</th>
                <th>금액 (만원)</th>
                <th>일자</th>
              </tr>
            </thead>
            <tbody>
              {revenues.map(revenue => (
                <tr key={revenue.id}>
                  <td>{revenue.source}</td>
                  <td>{revenue.amount}</td>
                  <td>{revenue.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add New Revenue */}
      <Card title="➕ 수익 기록">
        <form onSubmit={handleAddRevenue}>
          <div className="form-row">
            <FormGroup label="수익 원천" required>
              <input
                type="text"
                value={newRevenue.source}
                onChange={(e) => setNewRevenue(prev => ({ ...prev, source: e.target.value }))}
                placeholder="예: 프로그램 수강료"
              />
            </FormGroup>
            <FormGroup label="금액 (만원)" required>
              <input
                type="number"
                value={newRevenue.amount}
                onChange={(e) => setNewRevenue(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="예: 250"
              />
            </FormGroup>
            <FormGroup label="날짜" required>
              <input
                type="date"
                value={newRevenue.date}
                onChange={(e) => setNewRevenue(prev => ({ ...prev, date: e.target.value }))}
              />
            </FormGroup>
          </div>

          <Button type="submit" variant="primary">
            ➕ 기록
          </Button>
        </form>
      </Card>
    </div>
  )
}

export default RevenueInfo
