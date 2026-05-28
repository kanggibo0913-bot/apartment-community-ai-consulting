import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import FormGroup from '../components/FormGroup'
import Button from '../components/Button'
import { ContractReviewData } from '../types/CommunityData'
import { generateContractReviewResult } from '../utils/localDraftGenerators'
import { callAiFunction } from '../utils/aiClient'
import { saveAiResult, saveAiErrorResult } from '../utils/storage'
import './Pages.css'

interface ContractReviewProps {
  data: ContractReviewData
  onChange: (next: Partial<ContractReviewData>) => void
}

const ContractReview: React.FC<ContractReviewProps> = ({ data, onChange }) => {
  const [note, setNote] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const handleTextChange = (value: string) => {
    onChange({ contractText: value })
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.name.endsWith('.txt')) {
      const text = await file.text()
      onChange({ contractText: text, uploadedFileName: file.name })
      setNote('텍스트 파일이 로드되었습니다. 계약서 내용을 확인해주세요.')
    } else {
      onChange({ uploadedFileName: file.name })
      setNote('PDF/HWP/DOCX는 텍스트 추출 후 붙여넣기가 필요합니다.')
    }
    event.target.value = ''
  }

  const handleReview = () => {
    const result = generateContractReviewResult(data)
    onChange({ reviewResult: result })
  }

  const handleAiReview = async () => {
    setAiLoading(true)
    setAiError('')
    const response = await callAiFunction('contractReview', {
      contractText: data.contractText,
      uploadedFileName: data.uploadedFileName,
    })
    if (response.success && response.result) {
      onChange({ reviewResult: response.result })
      saveAiResult({ title: `${data.uploadedFileName?.trim() || '계약서'} 검토 결과`, taskType: 'contractReview', content: response.result, status: 'success', provider: 'netlify', sourcePage: 'review' })
    } else {
      const errMsg = response.error || 'AI 검토 중 오류가 발생했습니다.'
      setAiError(errMsg)
      // 오류 이력 저장 (업로드 계약서 원문/금액은 절대 저장 금지 — 파일명·길이만 메타로)
      saveAiErrorResult({
        title: `${data.uploadedFileName?.trim() || '계약서'} 검토 오류`,
        taskType: 'contractReview',
        error: errMsg,
        prompt: `파일명: ${data.uploadedFileName || '-'} / 본문 길이: ${(data.contractText || '').length}자 (원문은 저장하지 않음)`,
        sourcePage: 'review',
      })
    }
    setAiLoading(false)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(data.reviewResult || '')
    setCopyMessage('복사되었습니다.')
    setTimeout(() => setCopyMessage(''), 2000)
  }

  return (
    <div className="page">
      <PageHeader title="계약서 검토 센터" description="계약서 텍스트를 붙여넣거나 .txt 파일을 업로드하여 1차 검토합니다." />

      <Card title="계약서 입력">
        <div className="form-row">
          <FormGroup label="계약서 텍스트">
            <textarea value={data.contractText} onChange={(e) => handleTextChange(e.target.value)} rows={10} />
          </FormGroup>
        </div>

        <div className="form-row">
          <FormGroup label="파일 업로드 (.txt 지원)">
            <input type="file" accept=".txt,.pdf,.hwp,.docx" onChange={handleFileChange} />
          </FormGroup>
          <div className="file-note">
            <p>업로드 파일: {data.uploadedFileName || '없음'}</p>
            <p>{note || 'PDF/HWP/DOCX는 텍스트 추출 후 붙여넣기해주세요.'}</p>
          </div>
        </div>
      </Card>

      <Card title="검토 결과">
        <div className="page-actions">
          <Button variant="primary" type="button" onClick={handleReview}>계약서 기본 검토</Button>
          <Button variant="secondary" type="button" onClick={handleAiReview} disabled={aiLoading}>
            {aiLoading ? 'AI 검토 중...' : 'AI로 계약서 검토'}
          </Button>
          <Button variant="secondary" type="button" onClick={handleCopy}>복사</Button>
        </div>
        {aiError && <p className="dashboard-alert">{aiError}</p>}
        <textarea className="preview-box" readOnly value={data.reviewResult} rows={18} />
        {copyMessage && <p className="dashboard-alert">{copyMessage}</p>}
      </Card>
    </div>
  )
}

export default ContractReview
