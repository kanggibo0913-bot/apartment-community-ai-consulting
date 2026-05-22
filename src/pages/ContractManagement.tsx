import { useState } from 'react'
import { ContractItem, ContractType, ContractStatus } from '../types/CommunityData'
import Button from '../components/Button'
import Card from '../components/Card'
import './Pages.css'

interface ContractManagementProps {
  contracts: ContractItem[]
  onChange: (contracts: ContractItem[]) => void
}

const ContractManagement: React.FC<ContractManagementProps> = ({ contracts, onChange }) => {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<Partial<ContractItem>>({
    contractName: '',
    contractType: '기타',
    counterparty: '',
    startDate: '',
    endDate: '',
    renewalReviewDate: '',
    noticeDeadline: '',
    contractAmount: '',
    paymentMethod: '',
    status: '진행중',
    memo: '',
  })

  const contractTypes: ContractType[] = ['커뮤니티센터 위탁운영', '헬스 트레이너', '사업소득자', '장비 납품', '장비 렌탈', '업무협약', '기타']
  const statusOptions: ContractStatus[] = ['진행중', '갱신검토', '만료예정', '종료', '보류']

  const calculateDday = (dateString: string): number | null => {
    if (!dateString) return null
    const targetDate = new Date(dateString)
    const today = new Date()
    const diffTime = targetDate.getTime() - today.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const getDdayLabel = (dday: number | null, type: string): string => {
    if (dday === null) {
      if (type === 'end') return '종료일 미입력'
      if (type === 'review') return '검토일 미입력'
      return '통보기한 미입력'
    }
    if (dday < 0) return `${Math.abs(dday)}일 경과`
    return `D-${dday}`
  }

  const getContractStatus = (contract: ContractItem): ContractStatus => {
    const endDday = calculateDday(contract.endDate)
    if (contract.status === '종료' || contract.status === '보류') {
      return contract.status
    }
    if (endDday !== null && endDday <= 60 && endDday > 0) {
      return '만료예정'
    }
    const reviewDday = calculateDday(contract.renewalReviewDate)
    if (reviewDday !== null && reviewDday < 0 && contract.status === '진행중') {
      return '갱신검토'
    }
    return contract.status
  }

  const handleAddClick = () => {
    setEditingId(null)
    setFormData({
      contractName: '',
      contractType: '기타',
      counterparty: '',
      startDate: '',
      endDate: '',
      renewalReviewDate: '',
      noticeDeadline: '',
      contractAmount: '',
      paymentMethod: '',
      status: '진행중',
      memo: '',
    })
    setShowForm(true)
  }

  const handleEditClick = (contract: ContractItem) => {
    setEditingId(contract.id)
    setFormData(contract)
    setShowForm(true)
  }

  const handleDeleteClick = (id: number) => {
    if (confirm('이 계약을 삭제하시겠습니까?')) {
      onChange(contracts.filter(c => c.id !== id))
    }
  }

  const handleSave = () => {
    if (!formData.contractName?.trim()) {
      alert('계약명을 입력해주세요.')
      return
    }

    if (editingId !== null) {
      onChange(
        contracts.map(c =>
          c.id === editingId
            ? { ...c, ...formData, updatedAt: new Date().toISOString() }
            : c
        )
      )
    } else {
      const newContract: ContractItem = {
        id: Math.max(...contracts.map(c => c.id), 0) + 1,
        contractName: formData.contractName || '',
        contractType: (formData.contractType || '기타') as ContractType,
        counterparty: formData.counterparty || '',
        startDate: formData.startDate || '',
        endDate: formData.endDate || '',
        renewalReviewDate: formData.renewalReviewDate || '',
        noticeDeadline: formData.noticeDeadline || '',
        contractAmount: formData.contractAmount || '',
        paymentMethod: formData.paymentMethod || '',
        status: (formData.status || '진행중') as ContractStatus,
        memo: formData.memo || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      onChange([...contracts, newContract])
    }

    setShowForm(false)
  }

  const summaryStats = {
    total: contracts.length,
    expiringSoon: contracts.filter(c => {
      const dday = calculateDday(c.endDate)
      return dday !== null && dday <= 60 && dday > 0
    }).length,
    renewalNeeded: contracts.filter(c => {
      const reviewDday = calculateDday(c.renewalReviewDate)
      return reviewDday !== null && reviewDday < 0 && c.status === '진행중'
    }).length,
    expired: contracts.filter(c => c.status === '종료').length,
  }

  return (
    <div className="page">
      <Card>
        <div className="contract-summary">
          <div className="summary-stat">
            <div className="stat-value">{summaryStats.total}</div>
            <div className="stat-label">전체 계약 수</div>
          </div>
          <div className="summary-stat expiring">
            <div className="stat-value">{summaryStats.expiringSoon}</div>
            <div className="stat-label">60일 이내 만료예정</div>
          </div>
          <div className="summary-stat review">
            <div className="stat-value">{summaryStats.renewalNeeded}</div>
            <div className="stat-label">갱신검토 필요</div>
          </div>
          <div className="summary-stat expired">
            <div className="stat-value">{summaryStats.expired}</div>
            <div className="stat-label">종료 계약</div>
          </div>
        </div>
      </Card>

      <div className="page-actions" style={{ marginTop: '20px' }}>
        <Button onClick={handleAddClick} className="btn-primary">
          + 계약 추가
        </Button>
      </div>

      {showForm && (
        <Card>
          <h3 style={{ marginTop: 0 }}>{editingId !== null ? '계약 수정' : '새 계약 추가'}</h3>
          <form style={{ maxWidth: '600px' }}>
            <div className="form-group">
              <label>계약명 *</label>
              <input
                type="text"
                value={formData.contractName || ''}
                onChange={e => setFormData(prev => ({ ...prev, contractName: e.target.value }))}
                placeholder="예: 헬스장 운영 계약"
              />
            </div>

            <div className="form-group">
              <label>계약유형</label>
              <select
                value={formData.contractType || '기타'}
                onChange={e => setFormData(prev => ({ ...prev, contractType: e.target.value as ContractType }))}
              >
                {contractTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>상대방</label>
              <input
                type="text"
                value={formData.counterparty || ''}
                onChange={e => setFormData(prev => ({ ...prev, counterparty: e.target.value }))}
                placeholder="예: ABC 운영회사"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label>계약 시작일</label>
                <input
                  type="date"
                  value={formData.startDate || ''}
                  onChange={e => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>계약 종료일</label>
                <input
                  type="date"
                  value={formData.endDate || ''}
                  onChange={e => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label>갱신 검토일</label>
                <input
                  type="date"
                  value={formData.renewalReviewDate || ''}
                  onChange={e => setFormData(prev => ({ ...prev, renewalReviewDate: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>통보 기한</label>
                <input
                  type="date"
                  value={formData.noticeDeadline || ''}
                  onChange={e => setFormData(prev => ({ ...prev, noticeDeadline: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label>계약금액</label>
                <input
                  type="text"
                  value={formData.contractAmount || ''}
                  onChange={e => setFormData(prev => ({ ...prev, contractAmount: e.target.value }))}
                  placeholder="예: ₩10,000,000"
                />
              </div>
              <div className="form-group">
                <label>지급 방식</label>
                <input
                  type="text"
                  value={formData.paymentMethod || ''}
                  onChange={e => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                  placeholder="예: 월별 분할"
                />
              </div>
            </div>

            <div className="form-group">
              <label>상태</label>
              <select
                value={formData.status || '진행중'}
                onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as ContractStatus }))}
              >
                {statusOptions.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>비고</label>
              <textarea
                value={formData.memo || ''}
                onChange={e => setFormData(prev => ({ ...prev, memo: e.target.value }))}
                placeholder="추가 메모"
                rows={3}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button onClick={handleSave} className="btn-primary">
                {editingId !== null ? '수정' : '추가'}
              </Button>
              <Button onClick={() => setShowForm(false)} className="btn-secondary">
                취소
              </Button>
            </div>
          </form>
        </Card>
      )}

      {contracts.length === 0 ? (
        <Card>
          <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>등록된 계약이 없습니다.</p>
        </Card>
      ) : (
        <div className="contract-list">
          {contracts.map(contract => {
            const status = getContractStatus(contract)
            const endDday = calculateDday(contract.endDate)
            const reviewDday = calculateDday(contract.renewalReviewDate)
            const noticeDday = calculateDday(contract.noticeDeadline)

            return (
              <Card key={contract.id} className="contract-card">
                <div className="contract-header">
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: '0 0 8px 0' }}>{contract.contractName}</h4>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {contract.contractType} | {contract.counterparty}
                    </div>
                  </div>
                  <div className={`contract-status status-${status}`}>{status}</div>
                </div>

                <div className="contract-detail">
                  <div className="detail-row">
                    <span className="label">계약기간:</span>
                    <span>{contract.startDate} ~ {contract.endDate || '미입력'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">계약금액:</span>
                    <span>{contract.contractAmount || '미입력'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">지급방식:</span>
                    <span>{contract.paymentMethod || '미입력'}</span>
                  </div>
                  {contract.memo && (
                    <div className="detail-row">
                      <span className="label">비고:</span>
                      <span>{contract.memo}</span>
                    </div>
                  )}
                </div>

                <div className="contract-ddays">
                  <div className={`dday-item ${endDday !== null && endDday <= 60 ? 'critical' : ''}`}>
                    <span className="dday-label">만료</span>
                    <span className="dday-value">{getDdayLabel(endDday, 'end')}</span>
                  </div>
                  <div className={`dday-item ${reviewDday !== null && reviewDday < 0 ? 'critical' : ''}`}>
                    <span className="dday-label">검토</span>
                    <span className="dday-value">{getDdayLabel(reviewDday, 'review')}</span>
                  </div>
                  <div className="dday-item">
                    <span className="dday-label">통보</span>
                    <span className="dday-value">{getDdayLabel(noticeDday, 'notice')}</span>
                  </div>
                </div>

                <div className="contract-actions">
                  <Button onClick={() => handleEditClick(contract)} className="btn-secondary btn-sm">
                    수정
                  </Button>
                  <Button onClick={() => handleDeleteClick(contract.id)} className="btn-danger btn-sm">
                    삭제
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ContractManagement
