import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import { ContractGeneratorData, ContractDocumentType } from '../types/CommunityData'
import { generateContractDraft } from '../utils/localDraftGenerators'
import { callAiFunction } from '../utils/aiClient'
import './Pages.css'

interface ContractGeneratorProps {
  data: ContractGeneratorData
  onChange: (next: Partial<ContractGeneratorData>) => void
}

const contractTypes: ContractDocumentType[] = [
  '커뮤니티센터 위탁운영 계약서',
  '헬스 트레이너 계약서',
  '사업소득자 계약서',
  '장비 납품 계약서',
  '장비 렌탈 계약서',
  '업무협약서',
]

const ContractGenerator: React.FC<ContractGeneratorProps> = ({ data, onChange }) => {
  const [copyMessage, setCopyMessage] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const handleChange = (name: keyof ContractGeneratorData, value: string) => {
    onChange({ [name]: value } as Partial<ContractGeneratorData>)
  }

  const handleGenerate = () => {
    const generated = generateContractDraft(data)
    onChange({ generatedContract: generated })
  }

  const handleAiGenerate = async () => {
    setAiLoading(true)
    setAiError('')
    const response = await callAiFunction('contractGenerate', data)
    if (response.success && response.result) {
      onChange({ generatedContract: response.result })
    } else {
      setAiError(response.error || 'AI 생성 중 오류가 발생했습니다.')
    }
    setAiLoading(false)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(data.generatedContract || '')
    setCopyMessage('복사되었습니다.')
    setTimeout(() => setCopyMessage(''), 2000)
  }

  return (
    <div className="page">
      <PageHeader title="계약서 생성 센터" description="계약서 유형 선택 후 기본 계약서 초안을 생성합니다." />

      <Card title="계약서 기본 정보">
        <div className="form-row">
          <FormGroup label="계약서 유형">
            <select value={data.contractType} onChange={(e) => handleChange('contractType', e.target.value)}>
              {contractTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="계약명">
            <input type="text" value={data.contractTitle} onChange={(e) => handleChange('contractTitle', e.target.value)} />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="갑 명칭">
            <input type="text" value={data.partyA} onChange={(e) => handleChange('partyA', e.target.value)} />
          </FormGroup>
          <FormGroup label="을 명칭">
            <input type="text" value={data.partyB} onChange={(e) => handleChange('partyB', e.target.value)} />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="계약 시작일">
            <input type="date" value={data.startDate} onChange={(e) => handleChange('startDate', e.target.value)} />
          </FormGroup>
          <FormGroup label="계약 종료일">
            <input type="date" value={data.endDate} onChange={(e) => handleChange('endDate', e.target.value)} />
          </FormGroup>
        </div>
      </Card>

      <Card title="계약서 상세 항목">
        <div className="form-row">
          <FormGroup label="계약금액">
            <input type="text" value={data.contractAmount} onChange={(e) => handleChange('contractAmount', e.target.value)} />
          </FormGroup>
          <FormGroup label="지급 방식">
            <input type="text" value={data.paymentMethod} onChange={(e) => handleChange('paymentMethod', e.target.value)} />
          </FormGroup>
        </div>

        <FormGroup label="업무 범위">
          <textarea value={data.workScope} onChange={(e) => handleChange('workScope', e.target.value)} rows={3} />
        </FormGroup>

        <div className="form-row">
          <FormGroup label="정산 방식">
            <input type="text" value={data.settlementMethod} onChange={(e) => handleChange('settlementMethod', e.target.value)} />
          </FormGroup>
          <FormGroup label="해지 조건">
            <input type="text" value={data.terminationCondition} onChange={(e) => handleChange('terminationCondition', e.target.value)} />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="특약사항">
            <textarea value={data.specialTerms} onChange={(e) => handleChange('specialTerms', e.target.value)} rows={3} />
          </FormGroup>
          <FormGroup label="관할법원">
            <input type="text" value={data.jurisdiction} onChange={(e) => handleChange('jurisdiction', e.target.value)} />
          </FormGroup>
        </div>
      </Card>

      <Card title="계약서 초안 결과">
        <div className="page-actions">
          <Button variant="primary" type="button" onClick={handleGenerate}>계약서 초안 생성</Button>
          <Button variant="secondary" type="button" onClick={handleAiGenerate} disabled={aiLoading}>
            {aiLoading ? 'AI 생성 중...' : 'AI로 계약서 고도화'}
          </Button>
          <Button variant="secondary" type="button" onClick={handleCopy}>복사</Button>
        </div>
        {aiError && <p className="dashboard-alert">{aiError}</p>}
        <textarea className="preview-box" readOnly value={data.generatedContract} rows={18} />
        {copyMessage && <p className="dashboard-alert">{copyMessage}</p>}
      </Card>
    </div>
  )
}

export default ContractGenerator
