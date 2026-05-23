import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { AiResultEntry, deleteAiResult, loadAiResults } from '../utils/storage'
import { RESIDENT_SECTIONS, buildPublishedReport, buildShareUrl } from '../utils/publishedReport'
import './AiResultHistoryPage.css'

// taskType → 사용자용 한글 라벨 (현재 저장되는 taskType + 확장 대비)
const TASK_LABELS: Record<string, string> = {
  monthlyReport: '월간 리포트',
  bidNoticeAnalysis: '공고문 분석',
  document: '공문 작성',
  contractGenerate: '계약서 생성',
  contractReview: '계약서 검토',
  agendaPredict: '안건 예상',
}

const taskLabel = (t: string) => TASK_LABELS[t] || '기타'

const FILTERS: Array<{ key: string; label: string; match: (taskType: string) => boolean }> = [
  { key: 'all', label: '전체', match: () => true },
  { key: 'bidNoticeAnalysis', label: '공고문 분석', match: (t) => t === 'bidNoticeAnalysis' },
  { key: 'monthlyReport', label: '월간 리포트', match: (t) => t === 'monthlyReport' },
  { key: 'contract', label: '계약서', match: (t) => t === 'contractGenerate' || t === 'contractReview' },
  { key: 'document', label: '공문', match: (t) => t === 'document' },
  {
    key: 'etc',
    label: '기타',
    match: (t) => !['bidNoticeAnalysis', 'monthlyReport', 'contractGenerate', 'contractReview', 'document'].includes(t),
  },
]

const previewText = (content: string) =>
  content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .slice(0, 160)

const AiResultHistoryPage: React.FC = () => {
  const [items, setItems] = useState<AiResultEntry[]>(() => loadAiResults())
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<AiResultEntry | null>(null)
  const [copyMsg, setCopyMsg] = useState('')

  // 입주민 공개용 발행 편집기 상태
  const [publishTarget, setPublishTarget] = useState<AiResultEntry | null>(null)
  const [pubApt, setPubApt] = useState('')
  const [pubMonth, setPubMonth] = useState('')
  const [pubSections, setPubSections] = useState<Record<string, string>>({})
  const [shareUrl, setShareUrl] = useState('')
  const [shareCopyMsg, setShareCopyMsg] = useState('')

  const refresh = () => setItems(loadAiResults())

  const openPublish = (entry: AiResultEntry) => {
    setPublishTarget(entry)
    setPubApt('')
    setPubMonth('')
    setPubSections({})
    setShareUrl('')
    setShareCopyMsg('')
  }

  const generateShare = () => {
    const report = buildPublishedReport({
      apartmentName: pubApt,
      reportMonth: pubMonth,
      sections: RESIDENT_SECTIONS.map((s) => ({ title: s.title, body: pubSections[s.key] || '' })),
    })
    setShareUrl(buildShareUrl(report))
    setShareCopyMsg('')
  }

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopyMsg('링크가 복사되었습니다.')
    } catch {
      setShareCopyMsg('복사에 실패했습니다.')
    }
    setTimeout(() => setShareCopyMsg(''), 2500)
  }

  const filtered = useMemo(() => {
    const active = FILTERS.find((f) => f.key === filter) || FILTERS[0]
    const q = query.trim().toLowerCase()
    return items
      .filter((it) => active.match(it.taskType))
      .filter(
        (it) =>
          !q ||
          it.title.toLowerCase().includes(q) ||
          it.content.toLowerCase().includes(q) ||
          taskLabel(it.taskType).toLowerCase().includes(q),
      )
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  }, [items, filter, query])

  const handleDelete = (id: string) => {
    if (!window.confirm('이 AI 결과 이력을 삭제하시겠습니까?')) return
    deleteAiResult(id)
    if (selected?.id === id) setSelected(null)
    refresh()
  }

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopyMsg('복사되었습니다.')
      setTimeout(() => setCopyMsg(''), 2000)
    } catch {
      setCopyMsg('복사에 실패했습니다.')
      setTimeout(() => setCopyMsg(''), 2000)
    }
  }

  return (
    <div className="page ai-history-page">
      <PageHeader
        title="AI 결과 이력"
        description="공고문 분석, 월간 리포트, 계약서 검토, 공문 작성 등 AI가 생성한 결과를 한 곳에서 확인할 수 있습니다."
      />

      <div className="ai-history-controls">
        <div className="ai-history-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`ai-history-filter ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="ai-history-search"
          placeholder="제목·내용 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <div className="ai-history-empty">
          아직 저장된 AI 결과가 없습니다. 공고문 분석, 월간 리포트 생성, AI 질문 등을 실행하면 이곳에 결과가 저장됩니다.
        </div>
      ) : filtered.length === 0 ? (
        <div className="ai-history-empty">조건에 맞는 결과가 없습니다.</div>
      ) : (
        <div className="ai-history-list">
          {filtered.map((it) => (
            <div key={it.id} className="ai-history-card">
              <div className="ai-history-card-head">
                <span className="ai-history-tasktype">{taskLabel(it.taskType)}</span>
                <span className="ai-history-status">완료</span>
              </div>
              <h4 className="ai-history-title">{it.title}</h4>
              <div className="ai-history-date">{new Date(it.createdAt).toLocaleString('ko-KR')}</div>
              <p className="ai-history-preview">{previewText(it.content)}</p>
              <div className="ai-history-actions">
                <button type="button" onClick={() => setSelected(it)}>
                  열기
                </button>
                <button type="button" onClick={() => openPublish(it)}>
                  입주민 공개용 발행
                </button>
                <button type="button" className="danger" onClick={() => handleDelete(it.id)}>
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="ai-history-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="ai-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-history-modal-head">
              <div>
                <span className="ai-history-tasktype">{taskLabel(selected.taskType)}</span>
                <h3>{selected.title}</h3>
                <div className="ai-history-date">{new Date(selected.createdAt).toLocaleString('ko-KR')}</div>
              </div>
              <button type="button" className="ai-history-modal-close" onClick={() => setSelected(null)} aria-label="닫기">
                ✕
              </button>
            </div>
            <div className="ai-history-modal-body">{selected.content}</div>
            <div className="ai-history-actions">
              <button type="button" onClick={() => handleCopy(selected.content)}>
                복사
              </button>
              <button type="button" className="danger" onClick={() => handleDelete(selected.id)}>
                삭제
              </button>
              {copyMsg && <span className="ai-history-copy-msg">{copyMsg}</span>}
            </div>
          </div>
        </div>
      )}

      {publishTarget && (
        <div className="ai-history-modal-backdrop" onClick={() => setPublishTarget(null)}>
          <div className="ai-history-modal publish-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-history-modal-head">
              <div>
                <span className="ai-history-tasktype">입주민 공개용 발행</span>
                <h3>{publishTarget.title}</h3>
              </div>
              <button
                type="button"
                className="ai-history-modal-close"
                onClick={() => setPublishTarget(null)}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <p className="publish-warn">
              아래 입력 내용만 입주민에게 공개됩니다. 매출·인건비·원가·계약금액·내부 메모·민원 개인정보 등 민감 정보는 입력하지 마세요.
            </p>

            <div className="publish-fields">
              <label>
                단지명
                <input type="text" value={pubApt} onChange={(e) => setPubApt(e.target.value)} placeholder="예: 래미안 커뮤니티" />
              </label>
              <label>
                보고 월 (선택)
                <input type="text" value={pubMonth} onChange={(e) => setPubMonth(e.target.value)} placeholder="예: 2026-05" />
              </label>
              {RESIDENT_SECTIONS.map((s) => (
                <label key={s.key}>
                  {s.title}
                  <textarea
                    rows={3}
                    value={pubSections[s.key] || ''}
                    onChange={(e) => setPubSections((prev) => ({ ...prev, [s.key]: e.target.value }))}
                    placeholder={s.placeholder}
                  />
                </label>
              ))}
            </div>

            <details className="publish-reference">
              <summary>내부 AI 결과 (참고용 · 공개되지 않음)</summary>
              <div className="publish-reference-body">{publishTarget.content}</div>
            </details>

            <div className="ai-history-actions">
              <button type="button" onClick={generateShare}>
                공개 링크 생성
              </button>
            </div>

            {shareUrl && (
              <div className="publish-share">
                <input type="text" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
                <button type="button" onClick={copyShareUrl}>
                  링크 복사
                </button>
                {shareCopyMsg && <span className="ai-history-copy-msg">{shareCopyMsg}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AiResultHistoryPage
