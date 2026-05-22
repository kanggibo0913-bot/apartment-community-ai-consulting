import { useMemo, useState } from 'react'
import Card from './Card'
import Button from './Button'
import AIResultPanel from './AIResultPanel'
import { callAI } from '../utils/aiClient'
import {
  BidAnalysisParsed,
  GRADE_LABEL,
  categorizeRisk,
  parseBidAnalysis,
  splitContractPeriod,
  toDateInput,
} from '../utils/parseBidAnalysis'
import './BidNoticeAIAnalysis.css'

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

const DEFAULT_DOCS = [
  '사업자등록증',
  '법인등기부등본',
  '법인인감증명서',
  '사용인감계',
  '국세 완납증명서',
  '지방세 완납증명서',
  '실적증명서',
  '운영계획서',
  '산출내역서',
  '입찰보증금 관련 서류',
]

const CHECKLIST_KEY = 'bidNoticeChecklist'

const loadChecklist = (): Record<string, boolean> => {
  try {
    return JSON.parse(window.localStorage.getItem(CHECKLIST_KEY) || '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

interface BidNoticeAIAnalysisProps {
  // 분석 결과(JSON 파싱 성공 시)를 외부(예: TenderNotices 폼)에 반영하는 콜백
  onApplyToForm?: (parsed: BidAnalysisParsed, overwrite: boolean) => void
  // 분석 결과의 주요 일정을 스케줄러에 추가하는 콜백. {added, duplicate} 반환
  onAddToSchedule?: (parsed: BidAnalysisParsed) => { added: number; duplicate: boolean }
}

const BidNoticeAIAnalysis: React.FC<BidNoticeAIAnalysisProps> = ({ onApplyToForm, onAddToSchedule }) => {
  const [form, setForm] = useState<BidForm>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [checklist, setChecklist] = useState<Record<string, boolean>>(loadChecklist)
  const [applyMsg, setApplyMsg] = useState('')
  const [scheduleMsg, setScheduleMsg] = useState('')

  const parsed = useMemo(() => parseBidAnalysis(result), [result])

  // 스케줄러에 추가할 일정 후보 (표시용)
  const scheduleCandidates = useMemo(() => {
    if (!parsed) return [] as { label: string; value: string }[]
    const fmt = (raw: string) => {
      const d = toDateInput(raw)
      return d || (raw ? `날짜 확인 필요 (원문: ${raw})` : '')
    }
    const out: { label: string; value: string }[] = []
    if (parsed.siteBriefingDate) out.push({ label: '현장설명회', value: fmt(parsed.siteBriefingDate) })
    if (parsed.bidDeadline) out.push({ label: '입찰마감', value: fmt(parsed.bidDeadline) })
    if (parsed.contractPeriod) {
      const { start, end } = splitContractPeriod(parsed.contractPeriod)
      if (start) out.push({ label: '계약시작', value: start })
      if (end) out.push({ label: '계약종료', value: end })
      if (!start && !end) out.push({ label: '계약기간', value: `날짜 확인 필요 (원문: ${parsed.contractPeriod})` })
    }
    return out
  }, [parsed])

  const handleAddSchedule = () => {
    if (!parsed || !onAddToSchedule) return
    const res = onAddToSchedule(parsed)
    if (res.duplicate) {
      setScheduleMsg('이미 추가된 일정입니다.')
    } else if (res.added > 0) {
      setScheduleMsg(`${res.added}건의 일정을 스케줄러에 추가했습니다.`)
    } else {
      setScheduleMsg('추가 가능한 일정이 없습니다. (날짜 확인 필요)')
    }
    setTimeout(() => setScheduleMsg(''), 6000)
  }

  const update = (key: keyof BidForm, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const analyze = async () => {
    if (!form.noticeText.trim()) {
      setError('분석할 공고문 내용을 입력(붙여넣기)해주세요.')
      return
    }
    setLoading(true)
    setError('')
    setApplyMsg('')
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

  const toggleDoc = (doc: string) => {
    setChecklist(prev => {
      const next = { ...prev, [doc]: !prev[doc] }
      window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next))
      return next
    })
  }

  const handleApply = (overwrite: boolean) => {
    if (!parsed || !onApplyToForm) return
    onApplyToForm(parsed, overwrite)
    setApplyMsg(
      overwrite
        ? '공고 등록 폼을 분석 결과로 덮어썼습니다. 폼에서 확인 후 "공고 등록"을 누르면 스케줄러에도 반영됩니다.'
        : '비어 있는 공고 정보 항목을 분석 결과로 채웠습니다. 폼에서 확인 후 "공고 등록"을 누르면 스케줄러에도 반영됩니다.',
    )
    setTimeout(() => setApplyMsg(''), 6000)
  }

  const docs = parsed && parsed.requiredDocuments.length > 0 ? parsed.requiredDocuments : DEFAULT_DOCS
  const gradeKey = parsed && /^[ABCD]$/.test(parsed.participationGrade) ? parsed.participationGrade : ''

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

      {/* 구조화 분석 카드 (JSON 파싱 성공 시) */}
      {parsed && (
        <div className="bid-structured">
          <div className="bid-structured-head">
            <h4>구조화 분석 결과</h4>
            {gradeKey && (
              <span className={`grade-badge grade-${gradeKey}`}>{GRADE_LABEL[gradeKey] || gradeKey}</span>
            )}
          </div>

          {parsed.summary && (
            <section className="bid-block">
              <h5>공고 요약</h5>
              <p>{parsed.summary}</p>
            </section>
          )}

          <section className="bid-block">
            <h5>주요 일정</h5>
            <ul className="bid-kv">
              <li><span>현장설명회</span> {parsed.siteBriefingDate || '공고문 확인 필요'}</li>
              <li><span>입찰마감</span> {parsed.bidDeadline || '공고문 확인 필요'}</li>
              <li><span>계약기간</span> {parsed.contractPeriod || '공고문 확인 필요'}</li>
            </ul>
          </section>

          <section className="bid-block">
            <h5>제출서류 체크리스트</h5>
            <ul className="bid-checklist">
              {docs.map(doc => (
                <li key={doc}>
                  <label>
                    <input type="checkbox" checked={!!checklist[doc]} onChange={() => toggleDoc(doc)} />
                    <span className={checklist[doc] ? 'checked' : ''}>{doc}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {parsed.risks.length > 0 && (
            <section className="bid-block">
              <h5>리스크</h5>
              <ul className="bid-risks">
                {parsed.risks.map((risk, i) => {
                  const { category, advice } = categorizeRisk(risk)
                  return (
                    <li key={i}>
                      <span className="risk-cat">{category}</span>
                      <span className="risk-text">{risk}</span>
                      <div className="risk-advice">대응: {advice}</div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {parsed.estimateNotes.length > 0 && (
            <section className="bid-block">
              <h5>산출표 작성 주의사항</h5>
              <ul className="bid-list">
                {parsed.estimateNotes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </section>
          )}

          {parsed.specialConditions.length > 0 && (
            <section className="bid-block">
              <h5>특이조건</h5>
              <ul className="bid-list">
                {parsed.specialConditions.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </section>
          )}

          {parsed.siteBriefingQuestions.length > 0 && (
            <section className="bid-block">
              <h5>현장설명회 질문 리스트</h5>
              <ul className="bid-list">
                {parsed.siteBriefingQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </section>
          )}

          {(parsed.participationReason || parsed.recommendedAction) && (
            <section className="bid-block">
              <h5>참여 판단 / 다음 조치</h5>
              {parsed.participationReason && <p><strong>판단 근거:</strong> {parsed.participationReason}</p>}
              {parsed.recommendedAction && <p><strong>다음 조치:</strong> {parsed.recommendedAction}</p>}
            </section>
          )}

          {onAddToSchedule && scheduleCandidates.length > 0 && (
            <section className="bid-block">
              <h5>스케줄러 추가 예정 일정</h5>
              <ul className="bid-kv">
                {scheduleCandidates.map((c, i) => (
                  <li key={i}><span>{c.label}</span> {c.value}</li>
                ))}
              </ul>
              <div className="bid-apply-actions">
                <Button variant="primary" onClick={handleAddSchedule}>주요 일정을 스케줄러에 추가</Button>
              </div>
              {scheduleMsg && <p className="bid-apply-msg">{scheduleMsg}</p>}
            </section>
          )}

          {onApplyToForm && (
            <div className="bid-apply-actions">
              <Button variant="primary" onClick={() => handleApply(false)}>분석 결과를 공고 정보에 반영 (빈 항목만)</Button>
              <Button variant="secondary" onClick={() => handleApply(true)}>전체 덮어쓰기</Button>
            </div>
          )}
          {applyMsg && <p className="bid-apply-msg">{applyMsg}</p>}
        </div>
      )}

      {/* 원문 AI 결과 (복사/저장/다운로드/이력) */}
      <AIResultPanel
        title="공고문 분석 결과 (원문)"
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
