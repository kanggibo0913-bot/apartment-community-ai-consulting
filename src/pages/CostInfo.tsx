import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import StatBox from '../components/StatBox'
import './Pages.css'

const CostInfo: React.FC = () => {
  const [costs, setCosts] = useState([
    { id: 1, category: '인건비', amount: 800, date: '2024-01' },
    { id: 2, category: '유틸리티', amount: 500, date: '2024-01' },
    { id: 3, category: '시설유지', amount: 300, date: '2024-01' },
  ])

  const [newCost, setNewCost] = useState({
    category: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  })

  const totalCost = costs.reduce((sum, cost) => sum + cost.amount, 0)

  const handleAddCost = (e: React.FormEvent) => {
    e.preventDefault()
    if (newCost.category && newCost.amount) {
      setCosts(prev => [
        ...prev,
        {
          id: Math.max(...prev.map(c => c.id), 0) + 1,
          ...newCost,
          amount: parseInt(newCost.amount),
        }
      ])
      setNewCost({ category: '', amount: '', date: new Date().toISOString().split('T')[0] })
      alert('비용이 기록되었습니다. (아직 로컬스토리지 미지원)')
    }
  }

  return (
    <div className="page">
      <PageHeader 
        title="💰 비용 정보"
        description="운영 관련 비용을 기록하고 관리합니다."
      />

      {/* Cost Summary */}
      <Card title="📊 비용 현황">
        <div className="stats-grid">
          <StatBox label="총 비용" value={totalCost} unit="만원" icon="💳" />
          <StatBox label="인건비" value={800} unit="만원" icon="👤" />
          <StatBox label="운영비" value={500} unit="만원" icon="⚙️" />
          <StatBox label="시설유지비" value={300} unit="만원" icon="🔧" />
        </div>
      </Card>

      {/* Cost History */}
      <Card title="📝 비용 기록">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>분류</th>
                <th>금액 (만원)</th>
                <th>일자</th>
              </tr>
            </thead>
            <tbody>
              {costs.map(cost => (
                <tr key={cost.id}>
                  <td>{cost.category}</td>
                  <td>{cost.amount}</td>
                  <td>{cost.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add New Cost */}
      <Card title="➕ 비용 기록">
        <form onSubmit={handleAddCost}>
          <div className="form-row">
            <FormGroup label="분류" required>
              <input
                type="text"
                value={newCost.category}
                onChange={(e) => setNewCost(prev => ({ ...prev, category: e.target.value }))}
                placeholder="예: 전기료"
              />
            </FormGroup>
            <FormGroup label="금액 (만원)" required>
              <input
                type="number"
                value={newCost.amount}
                onChange={(e) => setNewCost(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="예: 150"
              />
            </FormGroup>
            <FormGroup label="날짜" required>
              <input
                type="date"
                value={newCost.date}
                onChange={(e) => setNewCost(prev => ({ ...prev, date: e.target.value }))}
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

export default CostInfo
