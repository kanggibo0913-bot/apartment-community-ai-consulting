import { useEffect, useRef, useState } from 'react'
import { WeeklyReportData, WeeklyReportOutputMode } from '../types/CommunityData'
import Button from '../components/Button'
import Card from '../components/Card'
import AIResultPanel from '../components/AIResultPanel'
import { callAI } from '../utils/aiClient'
import { saveAiErrorResult } from '../utils/storage'
import './Pages.css'

// 현재 ISO 주차("YYYY-Www")를 반환 (input[type=week]와 동일 포맷). 기본값 채우기용.
const getCurrentIsoWeek = (): string => {
  const d = new Date()
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (target.getUTCDay() + 6) % 7 // 월=0 ... 일=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3) // 해당 주 목요일로 이동
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3)
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

interface WeeklyReportProps {
  reportData: WeeklyReportData
  onChange: (next: Partial<WeeklyReportData>) => void
  // 단지 식별자 — AI 결과/오류 이력에 첨부되어 AiResultHistoryPage에서 단지별로 분리 표시.
  projectId?: string
  projectName?: string
}

const defaultWeeklyReportData: WeeklyReportData = {
  reportWeek: '',
  periodLabel: '',
  staffName: '',
  mainTasks: '',
  facilityInspection: '',
  complaintHandling: '',
  defectActions: '',
  suppliesInventory: '',
  specialNotes: '',
  nextWeekPlan: '',
  outputMode: 'office',
  generatedReport: '',
}

const OUTPUT_MODE_LABELS: Record<WeeklyReportOutputMode, string> = {
  office: '관리소 보고용',
  resident: '입주민 공개용',
}

const WeeklyReport: React.FC<WeeklyReportProps> = ({ reportData: reportDataProp, onChange, projectId, projectName }) => {
  const reportData = reportDataProp ?? defaultWeeklyReportData
  const currentWeek = getCurrentIsoWeek()
  const [aiLoading, setAiLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [aiError, setAiError] = useState('')

  // 비용 사고 방지: 현재 화면의 generatedReport가 "어느 보고 주차의 결과인지"를 추적한다(새 저장 구조 없이 메모리 ref만).
  // 같은 보고 주차로 다시 생성하면 호출 전 confirm을 띄워 중복 과금을 막는다.
  const generatedWeekRef = useRef<string>(
    (reportData.generatedReport || '').trim() ? (reportData.reportWeek || currentWeek) : '',
  )

  // generatedReport가 채워지는 모든 경로(AI 생성 성공 / 저장본 불러오기 / 새로고침 후 마운트)에서
  // 그 결과가 속한 보고 주차를 ref에 동기화한다(monthlyReport와 동일 패턴).
  // ⚠️ reportWeek는 의도적으로 deps에서 제외: 주차 "변경"만으로 ref를 끌어올리면 다른 주차 첫 생성 시 confirm이 잘못 뜬다.
  useEffect(() => {
    if ((reportData.generatedReport || '').trim()) {
      generatedWeekRef.current = reportData.reportWeek || currentWeek
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportData.generatedReport])

  // 보고 주차가 비어 있으면 현재 주차로 안전하게 초기화 (1회)
  useEffect(() => {
    if (!reportData.reportWeek) onChange({ reportWeek: currentWeek })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showMessage = (msg: string) => {
    setStatusMessage(msg)
    setTimeout(() => setStatusMessage(''), 5000)
  }

  const generateAiReport = async () => {
    const targetWeek = reportData.reportWeek || currentWeek

    // 비용 사고 방지: 같은 보고 주차의 리포트가 이미 생성돼 있으면 호출 전 한 번 확인한다.
    const hasExistingReport = (reportData.generatedReport || '').trim().length > 0
    if (hasExistingReport && generatedWeekRef.current === targetWeek) {
      const proceed = window.confirm('이미 생성된 주간 리포트가 있습니다. 다시 생성하면 AI 비용이 발생합니다. 계속할까요?')
      if (!proceed) return
    }

    setAiLoading(true)
    setAiError('')

    const payload = {
      reportWeek: targetWeek,
      periodLabel: reportData.periodLabel,
      staffName: reportData.staffName,
      mainTasks: reportData.mainTasks,
      facilityInspection: reportData.facilityInspection,
      complaintHandling: reportData.complaintHandling,
      defectActions: reportData.defectActions,
      suppliesInventory: reportData.suppliesInventory,
      specialNotes: reportData.specialNotes,
      nextWeekPlan: reportData.nextWeekPlan,
      outputMode: reportData.outputMode,
    }

    const promptSummary = `보고주차: ${targetWeek} / 출력모드: ${OUTPUT_MODE_LABELS[reportData.outputMode]} / 담당자: ${(reportData.staffName || '').slice(0, 40)}`

    try {
      const result = await callAI('weeklyReport', payload)
      if (result.ok) {
        const text = (result.result || '').trim()
        if (!text) {
          const errMsg = 'AI가 빈 응답을 반환했습니다. 잠시 후 다시 시도해주세요.'
          setAiError(errMsg)
          saveAiErrorResult({ title: `${targetWeek} 주간 리포트 오류`.trim(), taskType: 'weeklyReport', error: errMsg, prompt: promptSummary, sourcePage: 'weekly-report', ...(projectId ? { projectId } : {}), ...(projectName ? { projectName } : {}) })
        } else {
          // generatedReport가 바뀌면 위의 동기화 effect가 generatedWeekRef를 targetWeek로 갱신한다.
          onChange({ generatedReport: text })
          showMessage('AI 주간 리포트 생성이 완료되었습니다.')
        }
      } else {
        const errMsg = result.error || 'AI 응답 생성 중 알 수 없는 오류가 발생했습니다.'
        setAiError(errMsg)
        saveAiErrorResult({ title: `${targetWeek} 주간 리포트 오류`.trim(), taskType: 'weeklyReport', error: errMsg, prompt: promptSummary, sourcePage: 'weekly-report', ...(projectId ? { projectId } : {}), ...(projectName ? { projectName } : {}) })
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const errMsg = msg || 'AI 응답 생성 중 알 수 없는 오류가 발생했습니다.'
      setAiError(errMsg)
      saveAiErrorResult({ title: `${targetWeek} 주간 리포트 오류`.trim(), taskType: 'weeklyReport', error: errMsg, prompt: promptSummary, sourcePage: 'weekly-report', ...(projectId ? { projectId } : {}), ...(projectName ? { projectName } : {}) })
    } finally {
      setAiLoading(false)
    }
  }

  const isConfigError = /API 키|환경변수|OPENAI_API_KEY|OPENAI_MODEL/.test(aiError)

  return (
    <div className="page">
      <Card>
        <h3 style={{ marginTop: 0 }}>주간 운영 리포트 생성</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div className="form-group">
            <label>보고 주차</label>
            <input
              type="week"
              value={reportData.reportWeek || currentWeek}
              onChange={e => onChange({ reportWeek: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>기간 (선택)</label>
            <input
              type="text"
              value={reportData.periodLabel}
              onChange={e => onChange({ periodLabel: e.target.value })}
              placeholder="예: 2026-06-08 ~ 2026-06-14"
            />
          </div>
        </div>

        <div className="form-group">
          <label>근무자 / 담당자</label>
          <input
            type="text"
            value={reportData.staffName}
            onChange={e => onChange({ staffName: e.target.value })}
            placeholder="이번 주 근무자 또는 담당자명"
          />
        </div>

        <div className="form-group">
          <label>이번 주 주요 업무</label>
          <textarea
            value={reportData.mainTasks}
            onChange={e => onChange({ mainTasks: e.target.value })}
            placeholder="이번 주 수행한 주요 업무를 입력하세요."
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>시설 점검 내역</label>
          <textarea
            value={reportData.facilityInspection}
            onChange={e => onChange({ facilityInspection: e.target.value })}
            placeholder="점검한 시설과 상태를 입력하세요."
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>민원 대응 내역</label>
          <textarea
            value={reportData.complaintHandling}
            onChange={e => onChange({ complaintHandling: e.target.value })}
            placeholder="접수·처리한 민원 내용을 입력하세요."
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>하자 발견 및 조치 내역</label>
          <textarea
            value={reportData.defectActions}
            onChange={e => onChange({ defectActions: e.target.value })}
            placeholder="발견한 하자와 조치 사항을 입력하세요."
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>비품 보충 / 재고</label>
          <textarea
            value={reportData.suppliesInventory}
            onChange={e => onChange({ suppliesInventory: e.target.value })}
            placeholder="비품 보충, 재고 부족 등 관련 내용을 입력하세요."
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>특이사항</label>
          <textarea
            value={reportData.specialNotes}
            onChange={e => onChange({ specialNotes: e.target.value })}
            placeholder="그 밖의 특이사항을 입력하세요."
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>다음 주 예정 업무</label>
          <textarea
            value={reportData.nextWeekPlan}
            onChange={e => onChange({ nextWeekPlan: e.target.value })}
            placeholder="다음 주 예정된 업무를 입력하세요."
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>출력 모드</label>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 400 }}>
              <input
                type="radio"
                name="weekly-output-mode"
                checked={reportData.outputMode === 'office'}
                onChange={() => onChange({ outputMode: 'office' })}
              />
              관리소 보고용
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 400 }}>
              <input
                type="radio"
                name="weekly-output-mode"
                checked={reportData.outputMode === 'resident'}
                onChange={() => onChange({ outputMode: 'resident' })}
              />
              입주민 공개용
            </label>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#667085', lineHeight: 1.6 }}>
            입주민 공개용은 개인명·내부 책임 소재·민감한 비용 표현을 제외하고 안내체로 순화해 생성됩니다.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
          <Button onClick={generateAiReport} disabled={aiLoading} className="btn-primary">
            {aiLoading ? 'AI 생성 중...' : `AI 주간 리포트 생성 (${OUTPUT_MODE_LABELS[reportData.outputMode]})`}
          </Button>
        </div>

        {isConfigError && (
          <p style={{ marginTop: '10px', marginBottom: 0, fontSize: '12px', color: '#b54708' }}>
            AI 호출에 실패한 경우 Netlify 환경변수 <code>OPENAI_API_KEY</code>와 모델 설정을 확인해주세요.
          </p>
        )}

        {statusMessage && (
          <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#e7f3ff', color: '#0066cc', borderRadius: '4px', fontSize: '14px' }}>
            {statusMessage}
          </div>
        )}
      </Card>

      <AIResultPanel
        title="생성된 주간 리포트"
        taskType="weeklyReport"
        sourcePage="weekly-report"
        loading={aiLoading}
        loadingText="AI가 주간 운영 데이터를 정리 중입니다."
        error={aiError}
        result={reportData.generatedReport}
        downloadFileName={`weekly-report-${reportData.reportWeek || currentWeek}.txt`}
        onClear={() => onChange({ generatedReport: '' })}
        onLoadSaved={(content) => onChange({ generatedReport: content })}
        showHistory
        {...(projectId ? { projectId } : {})}
        {...(projectName ? { projectName } : {})}
      />
    </div>
  )
}

export default WeeklyReport
