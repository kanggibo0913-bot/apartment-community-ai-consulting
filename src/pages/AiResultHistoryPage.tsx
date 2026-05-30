import { useMemo, useRef, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { AiResultEntry, deleteAiResult, loadAiResults } from '../utils/storage'
import { RESIDENT_SECTIONS, buildPublishedReport, buildShareUrl } from '../utils/publishedReport'
import {
  PublishedStatus,
  StoredPublishedReport,
  deletePublishedReport,
  loadPublishedReports,
  savePublishedReport,
  updatePublishedReportStatus,
} from '../utils/publishedReportStorage'
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

// 발행 이력 출처 라벨 (sourceType 없으면 하위호환으로 'AI 결과')
const SOURCE_LABELS: Record<string, string> = {
  residentNoticeReport: '입주민 안내 보고서',
  aiResult: 'AI 결과',
}
const sourceLabel = (t?: string) => (t ? SOURCE_LABELS[t] || '기타' : 'AI 결과')

// 발행 이력 출처 그룹: residentNoticeReport / aiResult(=없음 포함) / etc(그 외 레거시)
type SourceGroup = 'aiResult' | 'residentNoticeReport' | 'etc'
const sourceGroupOf = (sourceType?: string): SourceGroup => {
  if (sourceType === 'residentNoticeReport') return 'residentNoticeReport'
  if (!sourceType || sourceType === 'aiResult') return 'aiResult'
  return 'etc'
}

// 날짜 문자열 → 정렬용 timestamp. 없거나 잘못된 값은 0으로 방어 처리.
const dateVal = (s?: string): number => {
  if (!s) return 0
  const t = new Date(s).getTime()
  return Number.isNaN(t) ? 0 : t
}

const statusLabelOf = (status: PublishedStatus) => (status === 'published' ? '공개중' : '공개중지')

// 업무 구분 매핑: 입찰용 taskType, 그 외는 현장 운영
const BID_TASK_TYPES = ['bidNoticeAnalysis', 'document', 'contractGenerate', 'contractReview']
const workGroupOf = (taskType: string): 'bid' | 'ops' => (BID_TASK_TYPES.includes(taskType) ? 'bid' : 'ops')
const workGroupLabel = (taskType: string) => (workGroupOf(taskType) === 'bid' ? '입찰용' : '현장 운영')

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

// 메타데이터 안전 추출(구버전 데이터 호환 — status/provider 없으면 fallback).
const statusOf = (it: AiResultEntry): 'success' | 'error' => {
  if (it.status === 'error') return 'error'
  if (it.status === 'success') return 'success'
  return it.error ? 'error' : 'success'
}
const providerOf = (it: AiResultEntry): string => it.provider || 'unknown'
const statusLabel = (s: 'success' | 'error') => (s === 'success' ? '성공' : '오류')

const AiResultHistoryPage: React.FC = () => {
  const [items, setItems] = useState<AiResultEntry[]>(() => loadAiResults())
  const [workFilter, setWorkFilter] = useState<'all' | 'bid' | 'ops'>('all')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [aiSort, setAiSort] = useState<'latest' | 'oldest' | 'taskType'>('latest')
  const [aiStatusFilter, setAiStatusFilter] = useState<'all' | 'success' | 'error'>('all')
  const [aiProviderFilter, setAiProviderFilter] = useState<string>('all')
  const [selected, setSelected] = useState<AiResultEntry | null>(null)
  const [copyMsg, setCopyMsg] = useState('')

  // 입주민 공개용 발행 편집기 상태
  const [publishTarget, setPublishTarget] = useState<AiResultEntry | null>(null)
  const [pubApt, setPubApt] = useState('')
  const [pubMonth, setPubMonth] = useState('')
  const [pubSections, setPubSections] = useState<Record<string, string>>({})
  const [shareUrl, setShareUrl] = useState('')
  const [shareCopyMsg, setShareCopyMsg] = useState('')

  // 입주민 공개 보고서 발행 이력
  const [view, setView] = useState<'ai' | 'published'>('ai')
  const [published, setPublished] = useState<StoredPublishedReport[]>(() => loadPublishedReports())
  const [pubListMsg, setPubListMsg] = useState('')

  // 발행 이력 검색/필터/정렬
  const [pubQuery, setPubQuery] = useState('')
  const [pubStatusFilter, setPubStatusFilter] = useState<'all' | PublishedStatus>('all')
  const [pubSourceFilter, setPubSourceFilter] = useState<'all' | SourceGroup>('all')
  const [pubSort, setPubSort] = useState<'latest' | 'oldest' | 'updated' | 'apartment' | 'reportMonth'>('latest')

  const refresh = () => setItems(loadAiResults())
  const refreshPublished = () => setPublished(loadPublishedReports())

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
    const url = buildShareUrl(report)
    setShareUrl(url)
    setShareCopyMsg('')
    // 발행 이력에 저장 (위생처리된 PublishedReport 기준 데이터만)
    savePublishedReport(report, url, { sourceType: 'aiResult' })
    refreshPublished()
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
      .filter((it) => workFilter === 'all' || workGroupOf(it.taskType) === workFilter)
      .filter((it) => active.match(it.taskType))
      .filter((it) => aiStatusFilter === 'all' || statusOf(it) === aiStatusFilter)
      .filter((it) => aiProviderFilter === 'all' || providerOf(it) === aiProviderFilter)
      .filter((it) => {
        if (!q) return true
        const haystack = [
          it.title,
          it.content,
          taskLabel(it.taskType),
          providerOf(it),
          statusLabel(statusOf(it)),
          it.prompt || '',
          it.error || '',
          it.sourcePage || '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
      .slice()
      .sort((a, b) => {
        switch (aiSort) {
          case 'oldest':
            return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
          case 'taskType':
            return (taskLabel(a.taskType) || '').localeCompare(taskLabel(b.taskType) || '', 'ko')
          case 'latest':
          default:
            return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
        }
      })
  }, [items, filter, query, workFilter, aiSort, aiStatusFilter, aiProviderFilter])

  // provider 옵션은 데이터에서 동적 추출 (없으면 'unknown' fallback 포함)
  const providerOptions = useMemo(() => {
    const set = new Set<string>(items.map(providerOf))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [items])

  // 통합 화면 요약. 메타데이터 확장 후 성공/오류 카운트도 산출(구버전 데이터는 fallback으로 분류).
  const aiSummary = useMemo(() => {
    const total = items.length
    const distinctTaskTypes = new Set(items.map((it) => it.taskType)).size
    const latest = items.reduce<string>((acc, it) => (it.createdAt > acc ? it.createdAt : acc), '')
    const successCount = items.filter((it) => statusOf(it) === 'success').length
    const errorCount = items.filter((it) => statusOf(it) === 'error').length
    return { total, distinctTaskTypes, latest, successCount, errorCount }
  }, [items])

  // AI 이력 JSON 백업 (저장본 백업 패턴과 동일, backupType만 aiResultHistory)
  const backupAiResultsJson = () => {
    const payload = {
      backupVersion: 1,
      backupType: 'aiResultHistory',
      exportedAt: new Date().toISOString(),
      source: 'HOMEBASE AI',
      count: items.length,
      items,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-result-history-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setCopyMsg(`AI 이력 ${items.length}건을 JSON으로 백업했습니다.`)
    setTimeout(() => setCopyMsg(''), 2500)
  }

  // ─── AI 이력 JSON 가져오기 (병합) ────────────────────────────────────────────
  // - 기존 이력은 삭제하지 않고 뒤에 병합한다.
  // - 항목마다 새 id 부여(id 충돌 방지), createdAt 원본 유지, meta.imported=true 표시.
  // - status/provider 등은 정규화하며, content 없고 error도 없는 빈 항목은 제외한다.
  // - localStorage 100개 상한은 save 시점이 아니라 합쳐서 잘라 그대로 유지.
  const importInputRef = useRef<HTMLInputElement>(null)

  const importAiHistoryJson = (file: File) => {
    if (!window.confirm('선택한 AI 이력 백업 파일을 현재 이력 목록에 병합합니다. 기존 이력은 삭제되지 않습니다. 가져오시겠습니까?')) return
    const reader = new FileReader()
    reader.onload = () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(String(reader.result))
      } catch {
        setCopyMsg('JSON 파일을 읽을 수 없습니다.')
        setTimeout(() => setCopyMsg(''), 2500)
        return
      }
      const obj = parsed as { backupType?: string; items?: unknown }
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.items)) {
        setCopyMsg('올바른 AI 이력 백업 파일이 아닙니다.')
        setTimeout(() => setCopyMsg(''), 2500)
        return
      }
      if (obj.backupType !== 'aiResultHistory') {
        setCopyMsg('현재 페이지와 다른 종류의 백업 파일입니다.')
        setTimeout(() => setCopyMsg(''), 2500)
        return
      }
      const now = new Date().toISOString()
      const isStr = (v: unknown): v is string => typeof v === 'string'
      const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
      const normalized: AiResultEntry[] = (obj.items as unknown[])
        .filter((it): it is Record<string, unknown> => isObj(it))
        .map((it): AiResultEntry | null => {
          const title = isStr(it.title) ? it.title : ''
          const taskType = isStr(it.taskType) && it.taskType.trim() ? it.taskType : 'unknown'
          const content = isStr(it.content) ? it.content : ''
          const errorVal = isStr(it.error) ? it.error : ''
          // content와 error 모두 빈 항목은 의미 없는 데이터로 간주해 제외
          if (!title && !content && !errorVal) return null
          const inferredStatus: 'success' | 'error' =
            it.status === 'error' || it.status === 'success'
              ? it.status
              : errorVal
                ? 'error'
                : 'success'
          const provider = isStr(it.provider) && it.provider.trim() ? it.provider : 'unknown'
          const createdAt = isStr(it.createdAt) && it.createdAt ? it.createdAt : now
          const prompt = isStr(it.prompt) ? it.prompt : undefined
          const sourcePage = isStr(it.sourcePage) ? it.sourcePage : undefined
          const importedMeta: Record<string, unknown> = { ...(isObj(it.meta) ? it.meta : {}), imported: true, importedAt: now }
          return {
            id: 'ai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            title: title || '(제목 없음)',
            taskType,
            createdAt,
            content,
            status: inferredStatus,
            provider,
            ...(prompt ? { prompt } : {}),
            ...(errorVal ? { error: errorVal } : {}),
            ...(sourcePage ? { sourcePage } : {}),
            meta: importedMeta,
          }
        })
        .filter((it): it is AiResultEntry => it !== null)

      if (normalized.length === 0) {
        setCopyMsg('가져올 수 있는 AI 이력이 없습니다.')
        setTimeout(() => setCopyMsg(''), 2500)
        return
      }
      // ─── 중복 감지 및 스킵 ────────────────────────────────────────────────
      // 동일 항목 판단 기준: createdAt + title + content + taskType (id·meta 제외).
      // 같은 백업 파일 내부 중복도 제거하기 위해 통과한 key를 즉시 set에 add한다.
      const makeDuplicateKey = (entry: { createdAt?: string; title?: string; content?: string; taskType?: string }) =>
        [entry.createdAt || '', entry.title || '', entry.content || '', entry.taskType || ''].join('||')
      const existingKeys = new Set(items.map(makeDuplicateKey))
      const uniqueImportedItems = normalized.filter((entry) => {
        const key = makeDuplicateKey(entry)
        if (existingKeys.has(key)) return false
        existingKeys.add(key)
        return true
      })
      const skippedCount = normalized.length - uniqueImportedItems.length

      if (uniqueImportedItems.length === 0) {
        setCopyMsg(`새로 가져올 AI 이력이 없습니다. 중복 ${skippedCount}개는 건너뛰었습니다.`)
        setTimeout(() => setCopyMsg(''), 2500)
        return
      }
      // 기존 + 중복 제외 신규 병합, 최대 100건 유지(기존 save 정책과 동일).
      const nextItems = [...items, ...uniqueImportedItems].slice(0, 100)
      window.localStorage.setItem('aiResultHistory', JSON.stringify(nextItems))
      setItems(loadAiResults())
      setCopyMsg(
        skippedCount > 0
          ? `${uniqueImportedItems.length}개의 AI 이력을 가져왔습니다. 중복 ${skippedCount}개는 건너뛰었습니다.`
          : `${uniqueImportedItems.length}개의 AI 이력을 가져왔습니다.`,
      )
      setTimeout(() => setCopyMsg(''), 2500)
    }
    reader.onerror = () => {
      setCopyMsg('JSON 파일을 읽을 수 없습니다.')
      setTimeout(() => setCopyMsg(''), 2500)
    }
    reader.readAsText(file)
  }

  // 발행 이력: 검색 → 상태 필터 → 출처 필터 → 정렬 (모두 동시 적용)
  const filteredPublished = useMemo(() => {
    const q = pubQuery.trim().toLowerCase()
    const list = published.filter((p) => {
      if (pubStatusFilter !== 'all' && p.status !== pubStatusFilter) return false
      if (pubSourceFilter !== 'all' && sourceGroupOf(p.sourceType) !== pubSourceFilter) return false
      if (q) {
        const haystack = [
          p.apartmentName,
          p.reportMonth,
          p.title,
          sourceLabel(p.sourceType),
          statusLabelOf(p.status),
          (p.sections || []).map((s) => `${s.title} ${s.body}`).join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
    return list.slice().sort((a, b) => {
      switch (pubSort) {
        case 'oldest':
          return dateVal(a.publishedAt) - dateVal(b.publishedAt)
        case 'updated':
          return dateVal(b.republishedAt || b.publishedAt) - dateVal(a.republishedAt || a.publishedAt)
        case 'apartment':
          return (a.apartmentName || '').localeCompare(b.apartmentName || '', 'ko')
        case 'reportMonth':
          return (b.reportMonth || '').localeCompare(a.reportMonth || '', 'ko')
        case 'latest':
        default:
          return dateVal(b.publishedAt) - dateVal(a.publishedAt)
      }
    })
  }, [published, pubQuery, pubStatusFilter, pubSourceFilter, pubSort])

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

  const flashPubList = (msg: string) => {
    setPubListMsg(msg)
    setTimeout(() => setPubListMsg(''), 2500)
  }

  const copyPublishedLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      flashPubList('공개 링크가 복사되었습니다.')
    } catch {
      flashPubList('복사에 실패했습니다.')
    }
  }

  // 새 탭에서 공개 보고서 열기 (#/report/<encoded>)
  const openPublished = (url: string) => {
    window.open(url, '_blank', 'noopener')
  }

  // 공개 중지/재개 — 내부 표시만 변경(이미 공유된 URL은 차단되지 않음)
  const togglePublishedStatus = (id: string, current: PublishedStatus) => {
    updatePublishedReportStatus(id, current === 'published' ? 'disabled' : 'published')
    refreshPublished()
  }

  const handleDeletePublished = (id: string) => {
    if (!window.confirm('이 발행 이력을 삭제하시겠습니까? (이미 공유된 링크 자체는 무효화되지 않습니다)')) return
    deletePublishedReport(id)
    refreshPublished()
  }

  return (
    <div className="page ai-history-page">
      <PageHeader
        title="AI 결과 이력"
        description="공고문 분석, 월간 리포트, 계약서 검토, 공문 작성 등 AI가 생성한 결과를 한 곳에서 확인할 수 있습니다."
      />

      <div className="ai-history-tabs">
        <button
          type="button"
          className={`ai-history-tab ${view === 'ai' ? 'active' : ''}`}
          onClick={() => setView('ai')}
        >
          AI 결과 이력
        </button>
        <button
          type="button"
          className={`ai-history-tab ${view === 'published' ? 'active' : ''}`}
          onClick={() => {
            setView('published')
            refreshPublished()
          }}
        >
          입주민 공개 보고서 발행 이력
        </button>
      </div>

      {view === 'ai' && (
        <>
      <div className="ai-summary">
        <p className="ai-summary-help">
          AI 결과 이력은 이 브라우저에 최대 100건까지 저장됩니다. JSON 백업 파일을 내려받아 다른 PC나 브라우저에서 다시 가져올 수 있으며,
          가져오기 시 중복 이력은 자동으로 건너뜁니다. 가져온 이력은 기존 이력에 병합되며 기존 이력을 덮어쓰지 않습니다.
        </p>

        <div className="ai-summary-grid">
          <div className="ai-summary-item ai-summary-count">
            <span>현재 저장 이력</span>
            <strong>{aiSummary.total} / 100건</strong>
          </div>
          <div className="ai-summary-item">
            <span>주요 taskType</span>
            <strong>{aiSummary.distinctTaskTypes}종</strong>
          </div>
          <div className="ai-summary-item">
            <span>성공</span>
            <strong>{aiSummary.successCount}건</strong>
          </div>
          <div className="ai-summary-item">
            <span>오류</span>
            <strong>{aiSummary.errorCount}건</strong>
          </div>
          <div className="ai-summary-item">
            <span>최근 생성일</span>
            <strong>{aiSummary.latest ? new Date(aiSummary.latest).toLocaleString('ko-KR') : '-'}</strong>
          </div>
        </div>

        <div className="ai-summary-actions">
          <button type="button" className="ai-summary-backup" onClick={backupAiResultsJson}>AI 이력 JSON 백업</button>
          <button type="button" className="ai-summary-backup" onClick={() => importInputRef.current?.click()}>AI 이력 JSON 가져오기</button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importAiHistoryJson(f)
              e.target.value = ''
            }}
          />
          {copyMsg && <span className="ai-summary-msg">{copyMsg}</span>}
        </div>
      </div>

      <div className="ai-history-workfilters">
        {([
          { key: 'all', label: '전체' },
          { key: 'bid', label: '입찰용' },
          { key: 'ops', label: '현장 운영' },
        ] as const).map((w) => (
          <button
            key={w.key}
            type="button"
            className={`ai-history-workfilter ${workFilter === w.key ? 'active' : ''}`}
            onClick={() => setWorkFilter(w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>

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
        <select
          className="ai-history-sort"
          value={aiStatusFilter}
          onChange={(e) => setAiStatusFilter(e.target.value as typeof aiStatusFilter)}
          aria-label="상태 필터"
        >
          <option value="all">상태: 전체</option>
          <option value="success">성공</option>
          <option value="error">오류</option>
        </select>
        <select
          className="ai-history-sort"
          value={aiProviderFilter}
          onChange={(e) => setAiProviderFilter(e.target.value)}
          aria-label="provider 필터"
        >
          <option value="all">provider: 전체</option>
          {providerOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          className="ai-history-sort"
          value={aiSort}
          onChange={(e) => setAiSort(e.target.value as typeof aiSort)}
          aria-label="정렬"
        >
          <option value="latest">최신순</option>
          <option value="oldest">오래된순</option>
          <option value="taskType">taskType순</option>
        </select>
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
        <div className="ai-history-empty">
          {query.trim()
            ? '검색 조건에 맞는 AI 결과가 없습니다.'
            : workFilter === 'bid'
              ? '입찰용 AI 결과가 없습니다.'
              : workFilter === 'ops'
                ? '현장 운영 AI 결과가 없습니다.'
                : '조건에 맞는 AI 결과가 없습니다.'}
        </div>
      ) : (
        <div className="ai-history-list">
          {filtered.map((it) => {
            const st = statusOf(it)
            return (
            <div key={it.id} className="ai-history-card">
              <div className="ai-history-card-head">
                <span className="ai-history-tasktype">{taskLabel(it.taskType)}</span>
                <span className={`work-badge work-${workGroupOf(it.taskType)}`}>{workGroupLabel(it.taskType)}</span>
                <span className={`ai-history-status ai-history-status-${st}`}>{statusLabel(st)}</span>
                <span className="ai-history-provider">{providerOf(it)}</span>
              </div>
              <h4 className="ai-history-title">{it.title}</h4>
              <div className="ai-history-date">{new Date(it.createdAt).toLocaleString('ko-KR')}</div>
              <p className="ai-history-preview">{st === 'error' && it.error ? `오류: ${previewText(it.error)}` : previewText(it.content)}</p>
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
            )
          })}
        </div>
      )}
        </>
      )}

      {view === 'published' && (
        <>
          {pubListMsg && <p className="ai-history-copy-msg" style={{ marginBottom: '12px' }}>{pubListMsg}</p>}
          {published.length === 0 ? (
            <div className="ai-history-empty">
              아직 발행한 입주민 공개 보고서가 없습니다. "AI 결과 이력" 탭에서 "입주민 공개용 발행"으로 링크를 생성하면 이곳에 기록됩니다.
            </div>
          ) : (
            <>
              <div className="pub-tools">
                <input
                  type="search"
                  className="pub-tools-search"
                  placeholder="단지명, 제목, 보고월, 내용으로 검색"
                  value={pubQuery}
                  onChange={(e) => setPubQuery(e.target.value)}
                />
                <select
                  className="pub-tools-select"
                  value={pubStatusFilter}
                  onChange={(e) => setPubStatusFilter(e.target.value as 'all' | PublishedStatus)}
                  aria-label="상태 필터"
                >
                  <option value="all">상태: 전체</option>
                  <option value="published">공개중</option>
                  <option value="disabled">공개중지</option>
                </select>
                <select
                  className="pub-tools-select"
                  value={pubSourceFilter}
                  onChange={(e) => setPubSourceFilter(e.target.value as 'all' | SourceGroup)}
                  aria-label="출처 필터"
                >
                  <option value="all">출처: 전체</option>
                  <option value="aiResult">AI 결과</option>
                  <option value="residentNoticeReport">입주민 안내 보고서</option>
                  <option value="etc">기타</option>
                </select>
                <select
                  className="pub-tools-select"
                  value={pubSort}
                  onChange={(e) => setPubSort(e.target.value as typeof pubSort)}
                  aria-label="정렬"
                >
                  <option value="latest">최신 발행순</option>
                  <option value="oldest">오래된 발행순</option>
                  <option value="updated">최근 갱신순</option>
                  <option value="apartment">단지명순</option>
                  <option value="reportMonth">보고월순</option>
                </select>
                <span className="pub-tools-count">총 {published.length}건 / 표시 {filteredPublished.length}건</span>
              </div>

              {filteredPublished.length === 0 ? (
                <div className="ai-history-empty">
                  {pubQuery.trim()
                    ? '검색어에 해당하는 발행 이력이 없습니다.'
                    : pubStatusFilter === 'published'
                      ? '공개중인 보고서가 없습니다.'
                      : pubStatusFilter === 'disabled'
                        ? '공개중지된 보고서가 없습니다.'
                        : '조건에 맞는 공개 보고서가 없습니다.'}
                </div>
              ) : (
                <div className="ai-history-list">
                  {filteredPublished.map((p) => (
                <div key={p.id} className="ai-history-card">
                  <div className="ai-history-card-head">
                    <span className="ai-history-tasktype">입주민 공개</span>
                    <span className="pub-source">출처: {sourceLabel(p.sourceType)}</span>
                    {p.republishedAt && <span className="pub-updated">갱신됨</span>}
                    <span className={`pub-status pub-status-${p.status}`}>
                      {p.status === 'published' ? '공개중' : '공개중지'}
                    </span>
                  </div>
                  <h4 className="ai-history-title">{p.apartmentName || '입주민 공개 보고서'}</h4>
                  <div className="ai-history-date">
                    {p.reportMonth ? `보고월 ${p.reportMonth} · ` : ''}최초 발행 {new Date(p.publishedAt).toLocaleString('ko-KR')}
                  </div>
                  {p.republishedAt && (
                    <div className="ai-history-date">최근 갱신 {new Date(p.republishedAt).toLocaleString('ko-KR')}</div>
                  )}
                  <p className="ai-history-preview">{p.sections.map((s) => s.title).join(' · ') || '내용 없음'}</p>
                  <div className="ai-history-actions">
                    <button type="button" onClick={() => copyPublishedLink(p.encodedUrl)}>
                      링크 복사
                    </button>
                    <button type="button" onClick={() => openPublished(p.encodedUrl)}>
                      보기
                    </button>
                    <button type="button" onClick={() => openPublished(p.encodedUrl)}>
                      인쇄/PDF
                    </button>
                    <button type="button" onClick={() => togglePublishedStatus(p.id, p.status)}>
                      {p.status === 'published' ? '공개 중지' : '공개 재개'}
                    </button>
                    <button type="button" className="danger" onClick={() => handleDeletePublished(p.id)}>
                      삭제
                    </button>
                  </div>
                </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {selected && (
        <div className="ai-history-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="ai-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-history-modal-head">
              <div>
                <span className="ai-history-tasktype">{taskLabel(selected.taskType)}</span>
                <span className={`ai-history-status ai-history-status-${statusOf(selected)}`}>{statusLabel(statusOf(selected))}</span>
                <span className="ai-history-provider">{providerOf(selected)}</span>
                <h3>{selected.title}</h3>
                <div className="ai-history-date">{new Date(selected.createdAt).toLocaleString('ko-KR')}</div>
              </div>
              <button type="button" className="ai-history-modal-close" onClick={() => setSelected(null)} aria-label="닫기">
                ✕
              </button>
            </div>
            {(selected.sourcePage || selected.prompt || selected.error) && (
              <div className="ai-history-meta">
                {selected.sourcePage && <div><strong>출처 페이지:</strong> {selected.sourcePage}</div>}
                {selected.prompt && (
                  <details>
                    <summary><strong>요청/프롬프트</strong></summary>
                    <pre className="ai-history-prompt">{selected.prompt}</pre>
                  </details>
                )}
                {selected.error && (
                  <div className="ai-history-error-block">
                    <strong>오류 내용:</strong>
                    <pre className="ai-history-prompt">{selected.error}</pre>
                  </div>
                )}
              </div>
            )}
            <div className="ai-history-modal-body">
              {selected.content
                ? selected.content
                : statusOf(selected) === 'error'
                  ? '(결과 본문 없음 — 오류 이력)'
                  : ''}
            </div>
            <div className="ai-history-actions">
              <button type="button" onClick={() => handleCopy(selected.content || selected.error || '')}>
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
