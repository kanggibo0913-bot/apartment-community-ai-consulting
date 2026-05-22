import { useState } from 'react'
import Card from './Card'
import Button from './Button'
import AIResultPanel from './AIResultPanel'
import { callAI } from '../utils/aiClient'

interface BidForm {
  siteName: string
  noticeText: string
  siteVisitDate: string
  deadlineDate: string
  contractPeriod: string
  biddingMethod: string
  specialConditions: string
}

const emptyForm: BidForm = {
  siteName: '',
  noticeText: '',
  siteVisitDate: '',
  deadlineDate: '',
  contractPeriod: '',
  biddingMethod: '',
  specialConditions: '',
}

// 입찰 공고문 텍스트 붙여넣기 기반 AI 분석. TenderNotices 기존 로직과 독립적으로 동작한다.
const BidNoticeAIAnalysis: React.FC = () => {
  const [form, setForm] = useState<BidForm>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  const update = (key: keyof BidForm, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const analyze = async () => {
    if (!form.noticeText.trim()) {
      setError('분석할 공고문 내용을 입력(붙여넣기)해주세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await callAI('bidNoticeAnalysis', form)
      if (res.ok) {
        const text = (res.result || '').trim()
        if (!text) {
          setError('AI가 빈 응답을 반환했습니다. 잠시 후 다시 시도해주세요.')
        } else {
          setResult(text)
        }
      } else {
        setError(res.error || 'AI 응답 생성 중 알 수 없는 오류가 발생했습니다.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="AI 공고문 분석 (텍스트 붙여넣기)">
      <div className="form-row">
        <div className="form-group">
          <label>단지명</label>
          <input type="text" value={form.siteName} onChange={e => update('siteName', e.target.value)} />
        </div>
        <div className="form-group">
          <label>입찰방식</label>
          <input type="text" value={form.biddingMethod} onChange={e => update('biddingMethod', e.target.value)} placeholder="예: 적격심사제, 협상에 의한 계약" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>현장설명회 일정</label>
          <input type="text" value={form.siteVisitDate} onChange={e => update('siteVisitDate', e.target.value)} placeholder="예: 2026-06-01 14:00" />
        </div>
        <div className="form-group">
          <label>입찰마감일</label>
          <input type="text" value={form.deadlineDate} onChange={e => update('deadlineDate', e.target.value)} placeholder="예: 2026-06-10 18:00" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>계약기간</label>
          <input type="text" value={form.contractPeriod} onChange={e => update('contractPeriod', e.target.value)} placeholder="예: 2026-07-01 ~ 2027-06-30" />
        </div>
        <div className="form-group">
          <label>특이조건</label>
          <input type="text" value={form.specialConditions} onChange={e => update('specialConditions', e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label>공고문 내용 (붙여넣기)</label>
        <textarea
          value={form.noticeText}
          onChange={e => update('noticeText', e.target.value)}
          rows={8}
          placeholder="입찰 공고문 전문을 붙여넣으세요. AI가 요약·일정·서류·리스크·참여 판단(A~D)을 분석합니다."
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={analyze} disabled={loading}>
          {loading ? 'AI 분석 중...' : 'AI 공고문 분석'}
        </Button>
      </div>

      <AIResultPanel
        title="공고문 분석 결과"
        taskType="bidNoticeAnalysis"
        loading={loading}
        loadingText="AI가 공고문을 분석 중입니다."
        error={error}
        result={result}
        downloadFileName={`bid-notice-analysis-${new Date().toISOString().slice(0, 10)}.txt`}
        onClear={() => setResult('')}
        onLoadSaved={(content) => setResult(content)}
        showHistory
      />
    </Card>
  )
}

export default BidNoticeAIAnalysis
