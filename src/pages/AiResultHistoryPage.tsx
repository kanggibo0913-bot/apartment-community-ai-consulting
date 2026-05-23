import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { AiResultEntry, deleteAiResult, loadAiResults } from '../utils/storage'
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

  const refresh = () => setItems(loadAiResults())

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
    </div>
  )
}

export default AiResultHistoryPage
