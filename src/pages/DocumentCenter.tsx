import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import { DocumentCenterData, DocumentType } from '../types/CommunityData'
import { generateDocumentDraft } from '../utils/localDraftGenerators'
import { callAiFunction } from '../utils/aiClient'
import { saveAiResult, saveAiErrorResult } from '../utils/storage'
import './Pages.css'

interface DocumentCenterProps {
  data: DocumentCenterData
  onChange: (next: Partial<DocumentCenterData>) => void
  // 단지 식별자 — AI 결과에 첨부되어 AiResultHistoryPage에서 단지별로 분리 표시.
  projectId?: string
  projectName?: string
}

const documentTypes: DocumentType[] = ['공문', '안내문', '운영보고서', '정산요청서', '시설보수 요청서']

const DocumentCenter: React.FC<DocumentCenterProps> = ({ data, onChange, projectId, projectName }) => {
  const [copyMessage, setCopyMessage] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const handleChange = (name: keyof DocumentCenterData, value: string) => {
    onChange({ [name]: value } as Partial<DocumentCenterData>)
  }

  const handleGenerate = () => {
    const generated = generateDocumentDraft(data)
    onChange({ generatedDocument: generated })
  }

  const handleAiGenerate = async () => {
    setAiLoading(true)
    setAiError('')
    const response = await callAiFunction('document', data)
    if (response.success && response.result) {
      onChange({ generatedDocument: response.result })
      saveAiResult({ title: data.title?.trim() || `${data.documentType} 문서`, taskType: 'document', content: response.result, status: 'success', provider: 'netlify', sourcePage: 'document', ...(projectId ? { projectId } : {}), ...(projectName ? { projectName } : {}) })
    } else {
      const errMsg = response.error || 'AI 생성 중 오류가 발생했습니다.'
      setAiError(errMsg)
      // 오류 이력 저장 (본문/요청내용 원문은 저장하지 않고 문서 종류·제목만)
      saveAiErrorResult({
        title: `${data.title?.trim() || `${data.documentType} 문서`} 생성 오류`,
        taskType: 'document',
        error: errMsg,
        prompt: `문서 종류: ${data.documentType || '-'} / 제목: ${data.title || '-'}`,
        sourcePage: 'document',
        ...(projectId ? { projectId } : {}),
        ...(projectName ? { projectName } : {}),
      })
    }
    setAiLoading(false)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(data.generatedDocument || '')
    setCopyMessage('복사되었습니다.')
    setTimeout(() => setCopyMessage(''), 2000)
  }

  return (
    <div className="page">
      <PageHeader title="문서 생성 센터" description="공문, 안내문, 운영보고서 등 템플릿 기반 문서를 빠르게 생성합니다." />

      <Card title="문서 유형 및 기본 정보">
        <div className="form-row">
          <FormGroup label="문서 유형">
            <select value={data.documentType} onChange={(e) => handleChange('documentType', e.target.value)}>
              {documentTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="아파트명">
            <input type="text" value={data.apartmentName} onChange={(e) => handleChange('apartmentName', e.target.value)} />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="수신처">
            <input type="text" value={data.receiver} onChange={(e) => handleChange('receiver', e.target.value)} />
          </FormGroup>
          <FormGroup label="발신처">
            <input type="text" value={data.sender} onChange={(e) => handleChange('sender', e.target.value)} />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="제목">
            <input type="text" value={data.title} onChange={(e) => handleChange('title', e.target.value)} />
          </FormGroup>
          <FormGroup label="작성일">
            <input type="date" value={data.date} onChange={(e) => handleChange('date', e.target.value)} />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="담당자명">
            <input type="text" value={data.manager} onChange={(e) => handleChange('manager', e.target.value)} />
          </FormGroup>
          <FormGroup label="연락처">
            <input type="text" value={data.phone} onChange={(e) => handleChange('phone', e.target.value)} />
          </FormGroup>
        </div>
      </Card>

      <Card title="문서 내용 입력">
        <div className="form-row">
          <FormGroup label="주요 내용">
            <textarea value={data.mainContent} onChange={(e) => handleChange('mainContent', e.target.value)} rows={4} />
          </FormGroup>
          <FormGroup label="요청사항">
            <textarea value={data.requestContent} onChange={(e) => handleChange('requestContent', e.target.value)} rows={4} />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="첨부자료명">
            <input type="text" value={data.attachmentName} onChange={(e) => handleChange('attachmentName', e.target.value)} />
          </FormGroup>
          <FormGroup label="비고">
            <input type="text" value={data.memo} onChange={(e) => handleChange('memo', e.target.value)} />
          </FormGroup>
        </div>
      </Card>

      <Card title="문서 초안 결과">
        <div className="page-actions">
          <Button variant="primary" type="button" onClick={handleGenerate}>문서 초안 생성</Button>
          <Button variant="secondary" type="button" onClick={handleAiGenerate} disabled={aiLoading}>
            {aiLoading ? 'AI 생성 중...' : 'AI로 문서 고도화'}
          </Button>
          <Button variant="secondary" type="button" onClick={handleCopy}>복사</Button>
        </div>
        {aiError && <p className="dashboard-alert">{aiError}</p>}
        <textarea className="preview-box" readOnly value={data.generatedDocument} rows={18} />
        {copyMessage && <p className="dashboard-alert">{copyMessage}</p>}
      </Card>
    </div>
  )
}

export default DocumentCenter
