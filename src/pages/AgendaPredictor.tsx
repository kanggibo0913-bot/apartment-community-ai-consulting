import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import { AgendaPredictorData, SourceType, AgendaFacility } from '../types/CommunityData'
import { predictAgenda } from '../utils/localDraftGenerators'
import { callAiFunction } from '../utils/aiClient'
import { saveAiResult, saveAiErrorResult } from '../utils/storage'
import './Pages.css'

interface AgendaPredictorProps {
  data: AgendaPredictorData
  onChange: (next: Partial<AgendaPredictorData>) => void
  // 단지 식별자 — saveAiResult에 첨부되어 AiResultHistoryPage에서 단지별로 분리 표시된다.
  projectId?: string
  projectName?: string
}

const sourceTypes: SourceType[] = ['게시판 공지', '민원자료', '회의록', '운영일지', '기타']
const facilities: AgendaFacility[] = ['헬스장', '골프장', 'GX룸', '독서실', '게스트하우스', '카페', '사우나', '기타']
const urgencyLevels = ['낮음', '보통', '높음'] as const
const frequencyLevels = ['낮음', '보통', '높음'] as const

const AgendaPredictor: React.FC<AgendaPredictorProps> = ({ data, onChange, projectId, projectName }) => {
  const [copyMessage, setCopyMessage] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const handleChange = (name: keyof AgendaPredictorData, value: string) => {
    onChange({ [name]: value } as Partial<AgendaPredictorData>)
  }

  const handleGenerate = () => {
    const generated = predictAgenda(data)
    onChange({ generatedAgenda: generated })
  }

  const handleAiGenerate = async () => {
    setAiLoading(true)
    setAiError('')
    const response = await callAiFunction('agendaPredict', data)
    if (response.success && response.result) {
      onChange({ generatedAgenda: response.result })
      saveAiResult({ title: `${data.apartmentName?.trim() || '입대의'} 안건 예상`, taskType: 'agendaPredict', content: response.result, status: 'success', provider: 'netlify', sourcePage: 'agenda', ...(projectId ? { projectId } : {}), ...(projectName ? { projectName } : {}) })
    } else {
      const errMsg = response.error || 'AI 안건 예측 중 오류가 발생했습니다.'
      setAiError(errMsg)
      // 오류 이력 저장 (개인정보 보호: 원문 sourceText 전체는 저장하지 않고 단지명·시설·긴급도 요약만)
      saveAiErrorResult({
        title: `${data.apartmentName?.trim() || '입대의'} 안건 예상 오류`,
        taskType: 'agendaPredict',
        error: errMsg,
        prompt: `단지명: ${data.apartmentName || '-'} / 시설: ${data.relatedFacility || '-'} / 출처유형: ${data.sourceType || '-'} / 긴급도: ${data.urgency || '-'}`,
        sourcePage: 'agenda',
        ...(projectId ? { projectId } : {}),
        ...(projectName ? { projectName } : {}),
      })
    }
    setAiLoading(false)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(data.generatedAgenda || '')
    setCopyMessage('복사되었습니다.')
    setTimeout(() => setCopyMessage(''), 2000)
  }

  return (
    <div className="page">
      <PageHeader title="입대의 안건 예상 센터" description="자료를 입력하면 입대의회의에서 논의될 수 있는 안건을 예측합니다." />

      <Card title="입력 정보">
        <div className="form-row">
          <FormGroup label="아파트명">
            <input type="text" value={data.apartmentName} onChange={(e) => handleChange('apartmentName', e.target.value)} />
          </FormGroup>
          <FormGroup label="자료 유형">
            <select value={data.sourceType} onChange={(e) => handleChange('sourceType', e.target.value)}>
              {sourceTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </FormGroup>
        </div>

        <FormGroup label="자료 내용">
          <textarea value={data.sourceText} onChange={(e) => handleChange('sourceText', e.target.value)} rows={8} />
        </FormGroup>

        <div className="form-row">
          <FormGroup label="관련 시설">
            <select value={data.relatedFacility} onChange={(e) => handleChange('relatedFacility', e.target.value)}>
              {facilities.map((facility) => (
                <option key={facility} value={facility}>{facility}</option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="민원 빈도">
            <select value={data.complaintFrequency} onChange={(e) => handleChange('complaintFrequency', e.target.value)}>
              {frequencyLevels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="긴급도">
            <select value={data.urgency} onChange={(e) => handleChange('urgency', e.target.value)}>
              {urgencyLevels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </FormGroup>
        </div>
      </Card>

      <Card title="예상 안건 결과">
        <div className="page-actions">
          <Button variant="primary" type="button" onClick={handleGenerate}>안건 예상하기</Button>
          <Button variant="secondary" type="button" onClick={handleAiGenerate} disabled={aiLoading}>
            {aiLoading ? 'AI 예측 중...' : 'AI로 안건 예측'}
          </Button>
          <Button variant="secondary" type="button" onClick={handleCopy}>복사</Button>
        </div>
        {aiError && <p className="dashboard-alert">{aiError}</p>}
        <textarea className="preview-box" readOnly value={data.generatedAgenda} rows={18} />
        {copyMessage && <p className="dashboard-alert">{copyMessage}</p>}
      </Card>
    </div>
  )
}

export default AgendaPredictor
