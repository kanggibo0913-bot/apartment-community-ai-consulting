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
  // 버튼1: 분석 결과를 공고 등록 폼에 반영
  onApplyToForm?: (parsed: BidAnalysisParsed, overwrite: boolean) => void
  // 버튼2: 분석 결과로 공고(TenderNotice) 1건 등록
  onRegisterNotice?: (parsed: BidAnalysisParsed) => { added: number; duplicate: boolean }
  // 버튼3: 주요 일정만 캘린더에 추가
  onAddScheduleEvents?: (parsed: BidAnalysisParsed) => { added: number; duplicate: boolean }
}

const BidNoticeAIAnalysis: React.FC<BidNoticeAIAnalysisProps> = ({
  onApplyToForm,
  onRegisterNotice,
  onAddScheduleEvents,
}) => {
  const [form, setForm] = useState<BidForm>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [checklist, setChecklist] = useState<Record<string, boolean>>(loadChecklist)
  const [applyMsg, setApplyMsg] = useState('')
  const [actionMsg, setActionMsg] = useState('')

  const parsed = useMemo(() => parseBidAnalysis(result), [result])

  // 버튼3(일정만 추가)에 표시할 마일스톤 후보.
  // 1순위: AI가 반환한 scheduleEvents[] (시간 포함). 2순위: 단일 키 fallback.
  // 계약 시작/종료는 스케줄러 대상이 아니므로 후보 표시 단계에서도 제외한다.
  const scheduleCandidates = useMemo(() => {
    if (!parsed) return [] as { label: string; value: string }[]
    const fmt = (raw: string) => {
      const d = toDateInput(raw)
      return d || (raw ? `날짜 확인 필요 (원문: ${raw})` : '')
    }
    const isContractLike = (ev: { eventType?: string; eventTypeLabel?: string }) => {
      const t = (ev.eventType || '').toLowerCase()
      const l = ev.eventTypeLabel || ''
      if (t === 'contract' || t === 'contractstart' || t === 'contractend') return true
      return /(계약|운영(시작|종료)|operation)/i.test(l)
    }
    if (parsed.scheduleEvents.length > 0) {
      return parsed.scheduleEvents
        .filter((ev) => !isContractLike(ev))
        .map((ev) => {
          const parts: string[] = []
          if (ev.time) parts.push(ev.time)
          if (ev.location) parts.push(ev.location)
          const valueBase = ev.date
          return {
            label: ev.eventTypeLabel || ev.eventType,
            value: parts.length > 0 ? `${valueBase} (${parts.join(' · ')})` : `${valueBase}${ev.time ? '' : ' · 시간 미정'}`,
          }
        })
    }
    const out: { label: string; value: string }[] = []
    if (parsed.siteBriefingDate) out.push({ label: '현장설명회', value: fmt(parsed.siteBriefingDate) })
    if (parsed.bidDeadline) out.push({ label: '입찰마감', value: fmt(parsed.bidDeadline) })
    if (parsed.businessPresentationDate) {
      const extras: string[] = []
      if (parsed.businessPresentationTime) extras.push(parsed.businessPresentationTime)
      if (parsed.businessPresentationLocation) extras.push(parsed.businessPresentationLocation)
      const base = fmt(parsed.businessPresentationDate)
      out.push({
        label: '사업설명회/PT',
        value: extras.length > 0 ? `${base} (${extras.join(' · ')})` : base,
      })
    }
    return out
  }, [parsed])

  const handleRegister = () => {
    if (!parsed || !onRegisterNotice) return
    const res = onRegisterNotice(parsed)
    if (res.duplicate) setActionMsg('이미 등록된 공고 또는 일정은 제외했습니다.')
    else if (res.added > 0) setActionMsg('AI 분석 결과로 공고가 등록되었습니다.')
    else setActionMsg('등록할 일정 정보가 없습니다. (날짜 확인 필요)')
    setTimeout(() => setActionMsg(''), 6000)
  }

  const handleAddScheduleOnly = () => {
    if (!parsed || !onAddScheduleEvents) return
    const res = onAddScheduleEvents(parsed)
    if (res.added > 0) {
      setActionMsg(res.duplicate ? '주요 일정이 스케줄러에 추가되었습니다. (중복 일정은 제외)' : '주요 일정이 스케줄러에 추가되었습니다.')
    } else if (res.duplicate) {
      setActionMsg('이미 등록된 공고 또는 일정은 제외했습니다.')
    } else {
      setActionMsg('추가 가능한 일정이 없습니다. (날짜 확인 필요)')
    }
    setTimeout(() => setActionMsg(''), 6000)
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
              <li>
                <span>사업설명회/PT</span>{' '}
                {parsed.businessPresentationDate
                  ? [
                      parsed.businessPresentationDate,
                      parsed.businessPresentationTime,
                      parsed.businessPresentationLocation,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : '공고문 확인 필요'}
              </li>
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

          <section className="bid-block bid-actions-section">
            <h5>분석 결과 활용</h5>

            {onApplyToForm && (
              <div className="bid-action-group">
                <p className="bid-action-desc">아래 공고 등록 폼에 분석 값을 채웁니다. (직접 검토 후 등록)</p>
                <div className="bid-apply-actions">
                  <Button variant="secondary" onClick={() => handleApply(false)}>분석 결과를 공고 정보에 반영 (빈 항목만)</Button>
                  <Button variant="secondary" onClick={() => handleApply(true)}>전체 덮어쓰기</Button>
                </div>
                {applyMsg && <p className="bid-apply-msg">{applyMsg}</p>}
              </div>
            )}

            {onRegisterNotice && (
              <div className="bid-action-group">
                <p className="bid-action-desc">분석 결과로 공고 1건을 바로 등록합니다. (공고 목록 + 스케줄러에 표시)</p>
                <div className="bid-apply-actions">
                  <Button variant="primary" onClick={handleRegister}>AI 분석 결과로 공고 등록</Button>
                </div>
              </div>
            )}

            {onAddScheduleEvents && (
              <div className="bid-action-group">
                <p className="bid-action-desc">공고 등록 없이 주요 일정만 캘린더에 추가합니다.</p>
                {scheduleCandidates.length > 0 && (
                  <ul className="bid-kv">
                    {scheduleCandidates.map((c, i) => (
                      <li key={i}><span>{c.label}</span> {c.value}</li>
                    ))}
                  </ul>
                )}
                <div className="bid-apply-actions">
                  <Button variant="primary" onClick={handleAddScheduleOnly}>주요 일정만 스케줄러에 추가</Button>
                </div>
              </div>
            )}

            {actionMsg && <p className="bid-apply-msg">{actionMsg}</p>}
          </section>
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
