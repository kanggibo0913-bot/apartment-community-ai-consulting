import { useEffect, useState } from 'react'
import { AiResultEntry, deleteAiResult, loadAiResults, saveAiResult } from '../utils/storage'
import './AIResultPanel.css'

interface AIResultPanelProps {
  title: string
  taskType: string
  loading?: boolean
  loadingText?: string
  error?: string
  result?: string
  downloadFileName?: string
  onClear?: () => void
  onLoadSaved?: (content: string) => void
  showHistory?: boolean
  // 통합 이력 메타데이터(옵셔널, 기존 사용처 미변경)
  sourcePage?: string
  // 현재 선택 단지(프로젝트) 식별자/이름 — saveAiResult에 메타로 첨부되어
  // AiResultHistoryPage에서 단지별 필터링에 사용된다. 입찰용 전역 페이지는
  // projectId를 전달하지 않아 모든 단지에서 보이게 한다(legacy 동일).
  projectId?: string
  projectName?: string
}

const AIResultPanel: React.FC<AIResultPanelProps> = ({
  title,
  taskType,
  loading = false,
  loadingText = 'AI가 분석 중입니다.',
  error = '',
  result = '',
  downloadFileName,
  onClear,
  onLoadSaved,
  showHistory = false,
  sourcePage,
  projectId,
  projectName,
}) => {
  const [statusMsg, setStatusMsg] = useState('')
  const [history, setHistory] = useState<AiResultEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  const refreshHistory = () => setHistory(loadAiResults().filter((e) => e.taskType === taskType))

  useEffect(() => {
    if (showHistory) refreshHistory()
  }, [showHistory, taskType])

  const flash = (msg: string) => {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(''), 2500)
  }

  const hasResult = !!result.trim()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result)
      flash('복사되었습니다.')
    } catch {
      flash('복사에 실패했습니다. 브라우저 권한을 확인하세요.')
    }
  }

  const handleSave = () => {
    if (!hasResult) return
    // 이 앱의 AI 호출은 모두 Netlify Function(/.netlify/functions/ai)을 통해 이루어지므로 provider='netlify'로 기록.
    saveAiResult({
      title,
      taskType,
      content: result,
      status: 'success',
      provider: 'netlify',
      ...(sourcePage ? { sourcePage } : {}),
      ...(projectId ? { projectId } : {}),
      ...(projectName ? { projectName } : {}),
    })
    refreshHistory()
    flash('저장되었습니다.')
  }

  const handleDownload = () => {
    if (!hasResult) return
    const name = downloadFileName || `${taskType}-${new Date().toISOString().slice(0, 10)}.txt`
    const blob = new Blob([result], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
    flash('다운로드를 시작했습니다.')
  }

  const handleDeleteSaved = (id: string) => {
    deleteAiResult(id)
    refreshHistory()
  }

  return (
    <div className="ai-result-panel">
      <div className="ai-result-header">
        <h3>{title}</h3>
        {statusMsg && <span className="ai-result-status">{statusMsg}</span>}
      </div>

      {loading && <div className="ai-result-loading">{loadingText}</div>}

      {!loading && error && (
        <div className="ai-result-error" role="alert">
          <strong>오류</strong>
          <div className="ai-result-error-body">{error}</div>
        </div>
      )}

      {!loading && !error && hasResult && (
        <>
          <div className="ai-result-actions">
            <button type="button" onClick={handleCopy}>복사</button>
            <button type="button" onClick={handleSave}>저장</button>
            <button type="button" onClick={handleDownload}>다운로드(.txt)</button>
            {onClear && (
              <button type="button" className="ai-result-clear" onClick={onClear}>
                초기화
              </button>
            )}
          </div>
          <div className="ai-result-body">{result}</div>
        </>
      )}

      {!loading && !error && !hasResult && (
        <p className="ai-result-empty">아직 생성된 결과가 없습니다.</p>
      )}

      {showHistory && (
        <div className="ai-result-history">
          <button
            type="button"
            className="ai-result-history-toggle"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            저장된 결과 {history.length > 0 ? `(${history.length})` : ''} {historyOpen ? '▲' : '▼'}
          </button>
          {historyOpen &&
            (history.length === 0 ? (
              <p className="ai-result-empty">저장된 결과가 없습니다.</p>
            ) : (
              <ul className="ai-result-history-list">
                {history.map((item) => (
                  <li key={item.id}>
                    <span className="ai-result-history-meta">
                      {new Date(item.createdAt).toLocaleString('ko-KR')}
                    </span>
                    <span className="ai-result-history-actions">
                      {onLoadSaved && (
                        <button type="button" onClick={() => onLoadSaved(item.content)}>
                          열기
                        </button>
                      )}
                      <button type="button" onClick={() => handleDeleteSaved(item.id)}>
                        삭제
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          <button
            type="button"
            className="ai-result-history-all"
            onClick={() => window.dispatchEvent(new Event('open-ai-history'))}
          >
            전체 AI 결과 이력 보기 →
          </button>
        </div>
      )}
    </div>
  )
}

export default AIResultPanel
