import { useEffect, useMemo, useState } from 'react'
import Card from './Card'
import Button from './Button'
import { buildCalendarSnapshot, fmtHours, fmtWon } from '../utils/siteLaborCalendarUtils'
import {
  AppliedPayrollSource,
  CalcResultSnapshot,
  DEDUCTION_LABELS,
  NON_TAXABLE_PRESETS,
  PAYROLL_STORAGE_KEY,
  PayrollDeductions,
  PayrollDraft,
  PayrollExtra,
  PayrollNonTaxableItem,
  PayrollPersistedState,
  PayrollSource,
  buildPayrollDraftFromCalcSnapshot,
  buildPayrollDraftFromCalendar,
  emptyAppliedPayrollSource,
  emptyPayrollState,
  loadPayrollState,
  newExtra,
  newNonTaxableItem,
} from '../utils/sitePayrollUtils'
import { loadProjectScoped, saveProjectScoped } from '../utils/projectScopedStorage'

const PAYROLL_BY_PROJECT_KEY = 'siteLaborPayrollDraftByProject'
// 급여요약 적용 기준 — 단지별 분리 저장. 전역 fallback key는 없는 신규 데이터이므로
// loadProjectScoped(globalKey)는 동일 name으로 두고 legacy 데이터는 없음 가정.
const PAYROLL_SOURCE_KEY = 'siteLaborPayrollSourcePref'
const PAYROLL_SOURCE_BY_PROJECT_KEY = 'siteLaborPayrollSourcePrefByProject'

// projectId 기반 PayrollPersistedState 로드 — byProject 없으면 전역 1회 fallback.
const loadPayrollStateScoped = (projectId: string | undefined): PayrollPersistedState => {
  const raw = loadProjectScoped<Partial<PayrollPersistedState> | null>(
    PAYROLL_STORAGE_KEY,
    PAYROLL_BY_PROJECT_KEY,
    projectId,
    null,
  )
  if (!raw) return loadPayrollState()
  // sitePayrollUtils의 emptyPayrollState 구조에 맞춰 안전 정규화.
  return {
    extras: Array.isArray(raw.extras) ? raw.extras : [],
    nonTaxableItems: Array.isArray(raw.nonTaxableItems) ? raw.nonTaxableItems : [],
    deductions: { ...emptyPayrollState().deductions, ...(raw.deductions || {}) },
    payDate: raw.payDate || '',
    note: raw.note || '',
  }
}
import './SitePayrollPanel.css'

// 세전 급여 요약 + 급여명세서 초안 패널.
// ⚠️ 공식 급여명세서가 아니다. 자동 4대보험/소득세 계산 X. 사용자가 세무사가 확정한 공제액을 직접 입력.
// 캘린더 monthSummary가 있으면 그 값으로 세전 항목을 채우고, 없으면 0 + 안내 표시.
//
// Refresh trigger: SiteLaborCostPage에서 캘린더 데이터가 바뀐 직후 다시 읽고 싶을 때 props로 받는다.
// (Calendar는 별도 localStorage라 React state 변경이 자동 전파되지 않음 — refreshNonce가 변하면
//  re-read 한다)
interface SitePayrollPanelProps {
  projectId?: string
  refreshNonce?: number
  // 직원별 계산결과 합계(SiteLaborCostPage.totals + employeeCount + baseMonth).
  // 부모에서 totals/employees가 변할 때마다 갱신해서 내려주면 calc 기준 미리보기에 즉시 반영.
  // 현재 적용 기준이 calc가 아니어도 prop은 항상 받는다(미리보기 + 적용 직전 스냅샷 캡처용).
  calcResultSnapshot?: CalcResultSnapshot | null
}

// AppliedPayrollSource 단지별 로드 — 미저장 시 기본 calendar(미적용 상태).
const loadAppliedSourceScoped = (projectId: string | undefined): AppliedPayrollSource => {
  const raw = loadProjectScoped<Partial<AppliedPayrollSource> | null>(
    PAYROLL_SOURCE_KEY,
    PAYROLL_SOURCE_BY_PROJECT_KEY,
    projectId,
    null,
  )
  if (!raw) return emptyAppliedPayrollSource()
  const source: PayrollSource = raw.source === 'calc' ? 'calc' : 'calendar'
  return {
    source,
    appliedAt: typeof raw.appliedAt === 'string' ? raw.appliedAt : '',
    ...(raw.calcSnapshot ? { calcSnapshot: raw.calcSnapshot } : {}),
  }
}

const SitePayrollPanel: React.FC<SitePayrollPanelProps> = ({ projectId, refreshNonce = 0, calcResultSnapshot }) => {
  const [state, setState] = useState<PayrollPersistedState>(() => loadPayrollStateScoped(projectId))
  // 캘린더 스냅샷은 캘린더 입력에 따라 매번 새로 읽는다. 캘린더 변경 후 refreshNonce 증감으로 강제 갱신.
  const [calRevision, setCalRevision] = useState(0)
  // 펼치기 토글
  const [openDraft, setOpenDraft] = useState(true)

  // 급여요약 적용 기준 상태 — 적용된 기준(applied) + 사용자가 라디오로 선택한 미적용 기준(pending).
  // 적용 전에는 applied가 기준이고, [적용] 버튼을 누르면 pending이 applied로 commit된다.
  const [applied, setApplied] = useState<AppliedPayrollSource>(() => loadAppliedSourceScoped(projectId))
  const [pendingSource, setPendingSource] = useState<PayrollSource>(() => loadAppliedSourceScoped(projectId).source)
  const [applyMsg, setApplyMsg] = useState('')

  // 단지 전환 시 새 단지의 payroll state로 reload.
  useEffect(() => {
    setState(loadPayrollStateScoped(projectId))
    const next = loadAppliedSourceScoped(projectId)
    setApplied(next)
    setPendingSource(next.source)
  }, [projectId])

  // ByProject 슬롯에 자동 저장. 전역 PAYROLL_STORAGE_KEY는 손대지 않음(legacy 보존).
  useEffect(() => {
    saveProjectScoped(PAYROLL_BY_PROJECT_KEY, projectId, state)
  }, [state, projectId])

  // 적용 기준(applied)도 단지별 자동 저장. 새로고침/단지 전환 후 유지.
  useEffect(() => {
    saveProjectScoped(PAYROLL_SOURCE_BY_PROJECT_KEY, projectId, applied)
  }, [applied, projectId])

  // 부모가 refresh 신호 보내면 calRevision 변경 → snapshot 재계산.
  useEffect(() => {
    setCalRevision((v) => v + 1)
  }, [refreshNonce])

  // 권장 기본값(적용 전 라디오 위치) — applied가 한 번도 commit되지 않은 상태에서만 적용.
  // 시급 우세 직원 구성 → 'calendar', 월급 우세 → 'calc', 혼합/없음 → 기존 'calendar' 유지.
  // applied.appliedAt이 비어 있을 때만(=한 번도 [적용] 안 누른 상태) 추정 default를 보여준다.
  useEffect(() => {
    if (applied.appliedAt) return
    const dp = calcResultSnapshot?.dominantPayType
    if (dp === '월급') setPendingSource('calc')
    else if (dp === '시급') setPendingSource('calendar')
    // 'mixed'/undefined는 기존 pendingSource 유지(사용자 선택 보존)
  }, [calcResultSnapshot?.dominantPayType, applied.appliedAt])

  const calSnapshot = useMemo(() => buildCalendarSnapshot(), [calRevision])

  // 적용된 기준에 따라 draft 분기.
  //   - 'calendar' → 캘린더 monthSummary 기반 (시급제 권장, 실시간 캘린더 입력 반영)
  //   - 'calc'     → 적용 시점 calcSnapshot 기반 (월급제 권장, 캘린더 변경 영향 없음)
  // calc인데 calcSnapshot이 비어 있으면(=한 번도 적용 안 됨) 빈 calc draft로 안내 표시.
  const draft: PayrollDraft = useMemo(() => {
    if (applied.source === 'calc') {
      return buildPayrollDraftFromCalcSnapshot(applied.calcSnapshot ?? null, state, {
        employeeName: calSnapshot?.base.employeeName,
        month: applied.calcSnapshot?.baseMonth || calSnapshot?.month,
      })
    }
    return buildPayrollDraftFromCalendar(calSnapshot, state)
  }, [applied, calSnapshot, state])

  const numVal = (v: string) => {
    if (v.trim() === '') return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const updateDeduction = (key: keyof PayrollDeductions, value: number) =>
    setState((prev) => ({ ...prev, deductions: { ...prev.deductions, [key]: value } }))

  const addExtra = () => setState((prev) => ({ ...prev, extras: [...prev.extras, newExtra()] }))
  const removeExtra = (id: string) =>
    setState((prev) => ({ ...prev, extras: prev.extras.filter((e) => e.id !== id) }))
  const updateExtra = (id: string, patch: Partial<PayrollExtra>) =>
    setState((prev) => ({
      ...prev,
      extras: prev.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))

  // 비과세 항목 핸들러 — nonTaxableItems가 옵셔널이라 빈 배열로 정규화한 뒤 조작.
  const addNonTaxable = (preset?: { label?: string; limitNote?: string }) =>
    setState((prev) => ({
      ...prev,
      nonTaxableItems: [...(prev.nonTaxableItems || []), newNonTaxableItem(preset)],
    }))
  const removeNonTaxable = (id: string) =>
    setState((prev) => ({
      ...prev,
      nonTaxableItems: (prev.nonTaxableItems || []).filter((e) => e.id !== id),
    }))
  const updateNonTaxable = (id: string, patch: Partial<PayrollNonTaxableItem>) =>
    setState((prev) => ({
      ...prev,
      nonTaxableItems: (prev.nonTaxableItems || []).map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    }))

  const resetAll = () => {
    if (!window.confirm('기타수당과 공제액 입력값을 모두 초기화하시겠습니까?')) return
    setState(emptyPayrollState())
  }

  // [선택 기준 적용] 클릭: pendingSource를 applied로 commit.
  //  - calc 선택 시에는 부모가 내려준 calcResultSnapshot을 적용 시점에 그대로 캡처해 저장한다.
  //    이렇게 해야 이후 캘린더에서 레슨수당/시간을 바꿔도 calc 기준 표시가 흔들리지 않는다.
  //  - calendar 선택 시에는 calcSnapshot을 비워 적용 후 실시간 캘린더 값이 반영되도록 한다.
  const handleApplySource = () => {
    const now = new Date().toISOString()
    if (pendingSource === 'calc') {
      if (!calcResultSnapshot) {
        setApplyMsg('직원별 계산결과가 비어 있습니다. 직원 입력을 먼저 추가해주세요.')
        setTimeout(() => setApplyMsg(''), 3000)
        return
      }
      setApplied({ source: 'calc', appliedAt: now, calcSnapshot: { ...calcResultSnapshot } })
      setApplyMsg('직원별 계산결과 기준으로 적용되었습니다.')
    } else {
      setApplied({ source: 'calendar', appliedAt: now })
      setApplyMsg('월별 달력 월간합계 기준으로 적용되었습니다.')
    }
    setTimeout(() => setApplyMsg(''), 3000)
  }

  const sourceLabel = (s: PayrollSource) => (s === 'calc' ? '직원별 계산결과' : '월별 달력 월간합계')
  const appliedAtLabel = applied.appliedAt
    ? new Date(applied.appliedAt).toLocaleString('ko-KR')
    : '미적용'

  // calc 기준인데 calcSnapshot 없음 → "직원별 계산결과 적용 필요" 안내 노출용
  const calcNotApplied = applied.source === 'calc' && !applied.calcSnapshot
  // 캘린더 기준이고 캘린더 데이터도 없음 → 기존 "캘린더 데이터 없음" 안내
  const noCal = draft.source === 'none'

  return (
    <Card title="세전 급여 요약 + 급여명세서 초안 (참고 계산)" className="payroll-card">
      <div className="payroll-info-box">
        본 화면은 <strong>공식 급여명세서가 아닙니다.</strong> 4대보험·소득세 자동 계산을 하지 않으며,
        세무사 또는 급여명세서 확정 금액을 사용자가 직접 입력하는 내부 검토용 초안입니다.
      </div>

      {/* 0. 급여요약 적용 기준 — 사용자가 두 데이터 소스 중 하나를 명시적으로 선택 + [적용] */}
      <section className="payroll-section payroll-source-section">
        <div className="payroll-section-head">
          <h4>급여요약 적용 기준</h4>
          <span className="payroll-source-applied">
            적용 기준: <strong>{sourceLabel(applied.source)}</strong>
            <span className="payroll-source-applied-time"> · 적용일시: {appliedAtLabel}</span>
          </span>
        </div>
        <p className="payroll-note">
          월급제 직원은 <strong>직원별 계산결과</strong> 기준을 사용할 수 있습니다. 시급제·알바 직원은 실제 근무일 기준의 <strong>월별 달력 월간합계</strong> 적용을 권장합니다.
          적용 후 세전급여요약은 선택한 기준으로 재산출되며, 달력에서 제외한 레슨수당·수당·조정값은 다시 나타나지 않습니다.
        </p>
        <div className="payroll-source-choices">
          <label className={`payroll-source-choice ${pendingSource === 'calc' ? 'on' : ''}`}>
            <input
              type="radio"
              name="payroll-source"
              value="calc"
              checked={pendingSource === 'calc'}
              onChange={() => setPendingSource('calc')}
            />
            <span className="payroll-source-choice-label">직원별 계산결과 적용</span>
            <span className="payroll-source-choice-sub">
              {calcResultSnapshot
                ? `${calcResultSnapshot.employeeCount}명 · 합계 ${fmtWon(calcResultSnapshot.basePay + calcResultSnapshot.holidayPay + calcResultSnapshot.nightPay)}원`
                : '직원 입력 없음'}
            </span>
          </label>
          <label className={`payroll-source-choice ${pendingSource === 'calendar' ? 'on' : ''}`}>
            <input
              type="radio"
              name="payroll-source"
              value="calendar"
              checked={pendingSource === 'calendar'}
              onChange={() => setPendingSource('calendar')}
            />
            <span className="payroll-source-choice-label">월별 달력 월간합계 적용</span>
            <span className="payroll-source-choice-sub">
              {calSnapshot
                ? `${calSnapshot.month} · 합계 ${fmtWon(calSnapshot.monthSummary.basePay + calSnapshot.monthSummary.totalHolidayPay + calSnapshot.monthSummary.totalNightPay + (calSnapshot.base.lessonAllowance || 0))}원`
                : '캘린더 데이터 없음'}
            </span>
          </label>
        </div>
        <div className="payroll-source-actions">
          <Button variant="primary" onClick={handleApplySource}>선택 기준 적용</Button>
          {applyMsg && <span className="payroll-source-msg">{applyMsg}</span>}
        </div>
      </section>

      {/* 1. 세전 급여 요약 */}
      <section className="payroll-section">
        <div className="payroll-section-head">
          <h4>세전 급여 요약</h4>
          <span className="payroll-source-tag payroll-source-tag--applied">
            기준: {sourceLabel(applied.source)}
          </span>
          {noCal && applied.source === 'calendar' && <span className="payroll-source-tag">캘린더 데이터 없음</span>}
          {calcNotApplied && <span className="payroll-source-tag">직원별 계산결과 적용 필요</span>}
        </div>
        {noCal && applied.source === 'calendar' && (
          <p className="payroll-empty">
            월간 근무시간 달력에서 기준 월과 일자별 근무시간을 입력하면 이 영역이 자동으로 채워집니다.
          </p>
        )}
        {calcNotApplied && (
          <p className="payroll-empty">
            "직원별 계산결과 적용"을 선택하고 [선택 기준 적용]을 눌러야 직원별 합계가 세전 급여 요약에 반영됩니다.
          </p>
        )}
        <div className="payroll-grid">
          <div><span>직원명</span><strong>{draft.employeeName || '-'}</strong></div>
          <div><span>기준 월</span><strong>{draft.month || '-'}</strong></div>
          <div><span>총 근로시간</span><strong>{fmtHours(draft.totalHours)}h</strong></div>
          <div><span>기본급</span><strong>{fmtWon(draft.gross.basePay)}원</strong></div>
          <div><span>주휴수당</span><strong>{fmtWon(draft.gross.holidayPay)}원</strong></div>
          <div><span>야간수당</span><strong>{fmtWon(draft.gross.nightPay)}원</strong></div>
          <div><span>레슨수당</span><strong>{fmtWon(draft.gross.lessonAllowance)}원</strong></div>
          <div><span>기타수당</span><strong>{fmtWon(draft.gross.extrasTotal)}원</strong></div>
          <div className="payroll-grand">
            <span>세전 총지급액</span>
            <strong>{fmtWon(draft.gross.grossTotal)}원</strong>
          </div>
          {/* 비과세 입력이 있을 때만 노출. 실지급액에서 차감하지 않는 표시용 참고 값. */}
          {(draft.nonTaxableTotal ?? 0) > 0 && (
            <>
              <div className="payroll-nontaxable">
                <span>비과세 합계</span>
                <strong>{fmtWon(draft.nonTaxableTotal || 0)}원</strong>
              </div>
              <div className="payroll-taxable-ref">
                <span>과세대상 급여 참고액</span>
                <strong>{fmtWon(draft.taxablePayReference || 0)}원</strong>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 2. 기타수당 입력 */}
      <section className="payroll-section">
        <div className="payroll-section-head">
          <h4>기타수당</h4>
          <Button variant="secondary" onClick={addExtra}>+ 기타수당 추가</Button>
        </div>
        {state.extras.length === 0 ? (
          <p className="payroll-empty">예: 식대, 교통비, 추가수당. 필요 시 1건 이상 추가하세요.</p>
        ) : (
          <table className="payroll-extras-table">
            <thead>
              <tr>
                <th>항목</th>
                <th>금액 (원)</th>
                <th>메모</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.extras.map((e) => (
                <tr key={e.id}>
                  <td>
                    <input
                      type="text"
                      value={e.name}
                      onChange={(ev) => updateExtra(e.id, { name: ev.target.value })}
                      placeholder="예: 식대"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={e.amount}
                      onChange={(ev) => updateExtra(e.id, { amount: numVal(ev.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={e.memo}
                      onChange={(ev) => updateExtra(e.id, { memo: ev.target.value })}
                      placeholder="내부 메모"
                    />
                  </td>
                  <td>
                    <Button variant="danger" onClick={() => removeExtra(e.id)}>삭제</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 2-bis. 비과세 항목 입력 (세무사 확인용 참고) */}
      <section className="payroll-section payroll-nontax-section">
        <div className="payroll-section-head">
          <h4>비과세 항목</h4>
          <div className="payroll-nontax-actions">
            {NON_TAXABLE_PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="secondary"
                onClick={() => addNonTaxable(p)}
              >
                + {p.label}
              </Button>
            ))}
            <Button variant="secondary" onClick={() => addNonTaxable()}>+ 빈 항목</Button>
          </div>
        </div>
        <p className="payroll-note">
          비과세 항목은 <strong>세무사 확인용 참고 입력</strong>입니다. 실제 비과세 적용 여부와 한도는 세무사 검토 후 확정하세요.
          비과세 합계는 표시용 참고 값이며, <strong>예상 실지급액에서 차감되지 않습니다.</strong>
        </p>
        {(state.nonTaxableItems || []).length === 0 ? (
          <p className="payroll-empty">
            예: 식대 / 자가운전보조금 / 출산·보육수당. 위 프리셋 버튼 또는 "빈 항목"으로 추가하세요.
          </p>
        ) : (
          <table className="payroll-extras-table">
            <thead>
              <tr>
                <th>항목명</th>
                <th>금액 (원)</th>
                <th>참고한도/비고</th>
                <th>메모</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(state.nonTaxableItems || []).map((e) => (
                <tr key={e.id}>
                  <td>
                    <input
                      type="text"
                      value={e.label}
                      onChange={(ev) => updateNonTaxable(e.id, { label: ev.target.value })}
                      placeholder="예: 식대"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={e.amount}
                      onChange={(ev) => updateNonTaxable(e.id, { amount: numVal(ev.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={e.limitNote || ''}
                      onChange={(ev) => updateNonTaxable(e.id, { limitNote: ev.target.value })}
                      placeholder="예: 세무사 확인 (월 한도 참고)"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={e.memo || ''}
                      onChange={(ev) => updateNonTaxable(e.id, { memo: ev.target.value })}
                      placeholder="내부 메모"
                    />
                  </td>
                  <td>
                    <Button variant="danger" onClick={() => removeNonTaxable(e.id)}>삭제</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="payroll-deductions-total payroll-nontax-total">
          <span>비과세 합계 (참고)</span>
          <strong>{fmtWon(draft.nonTaxableTotal || 0)}원</strong>
        </div>
        <div className="payroll-deductions-total payroll-taxable-ref-total">
          <span>과세대상 급여 참고액 (세전 - 비과세)</span>
          <strong>{fmtWon(draft.taxablePayReference || 0)}원</strong>
        </div>
      </section>

      {/* 3. 공제액 입력 */}
      <section className="payroll-section">
        <h4>공제액 입력</h4>
        <p className="payroll-note">
          공제액은 세무사 또는 급여명세서 확정 금액을 기준으로 입력하세요. 본 화면의 실지급액은 내부 검토용입니다.
        </p>
        <div className="payroll-grid">
          {(Object.keys(state.deductions) as (keyof PayrollDeductions)[]).map((key) => (
            <label key={key} className="payroll-input-label">
              {DEDUCTION_LABELS[key]}
              <input
                type="number"
                min="0"
                step="1"
                value={state.deductions[key]}
                onChange={(ev) => updateDeduction(key, numVal(ev.target.value))}
              />
            </label>
          ))}
        </div>
        <div className="payroll-deductions-total">
          <span>공제 합계</span>
          <strong>{fmtWon(draft.deductionsTotal)}원</strong>
        </div>
      </section>

      {/* 4. 예상 실지급액 */}
      <section className="payroll-section payroll-netpay-section">
        <h4>예상 실지급액 (참고)</h4>
        <div className="payroll-netpay-grid">
          <div>
            <span>세전 총지급액</span>
            <strong>{fmtWon(draft.gross.grossTotal)}원</strong>
          </div>
          <div>
            <span>공제 합계</span>
            <strong>{fmtWon(draft.deductionsTotal)}원</strong>
          </div>
          <div className="payroll-netpay-grand">
            <span>예상 실지급액</span>
            <strong>{fmtWon(draft.netPay)}원</strong>
          </div>
        </div>
      </section>

      {/* 5. 명세서 메타 + 5. 급여명세서 초안 (접기/펼치기) */}
      <section className="payroll-section">
        <div className="payroll-section-head">
          <h4>급여명세서 초안 (확정 명세서 아님)</h4>
          <Button variant="secondary" onClick={() => setOpenDraft((v) => !v)}>
            {openDraft ? '접기' : '펼치기'}
          </Button>
        </div>
        {openDraft && (
          <div className="payroll-draft">
            <div className="payroll-grid">
              <label className="payroll-input-label">
                예상 임금지급일
                <input
                  type="date"
                  value={state.payDate}
                  onChange={(ev) => setState((prev) => ({ ...prev, payDate: ev.target.value }))}
                />
              </label>
              <div><span>근로일수</span><strong>{draft.workDays}일</strong></div>
              <div><span>총 근로시간</span><strong>{fmtHours(draft.totalHours)}h</strong></div>
              <div><span>야간수당</span><strong>{fmtWon(draft.gross.nightPay)}원</strong></div>
            </div>

            <h5 className="payroll-subtitle">지급 항목</h5>
            <table className="payroll-doc-table">
              <tbody>
                <tr><th>기본급</th><td className="num">{fmtWon(draft.gross.basePay)}</td></tr>
                <tr><th>주휴수당</th><td className="num">{fmtWon(draft.gross.holidayPay)}</td></tr>
                <tr><th>야간수당</th><td className="num">{fmtWon(draft.gross.nightPay)}</td></tr>
                <tr><th>레슨수당</th><td className="num">{fmtWon(draft.gross.lessonAllowance)}</td></tr>
                {draft.extras.map((e) => (
                  <tr key={e.id}>
                    <th>{e.name || '기타수당'}</th>
                    <td className="num">{fmtWon(e.amount)}</td>
                  </tr>
                ))}
                <tr className="payroll-doc-total">
                  <th>지급 합계</th>
                  <td className="num">{fmtWon(draft.gross.grossTotal)}</td>
                </tr>
              </tbody>
            </table>

            {/* 비과세 항목 (입력이 있을 때만) — 표시용 참고 표 */}
            {(draft.nonTaxableItems || []).length > 0 && (
              <>
                <h5 className="payroll-subtitle">비과세 항목 (세무사 확인용 참고)</h5>
                <table className="payroll-doc-table payroll-doc-nontax">
                  <thead>
                    <tr><th>항목명</th><th>금액</th><th>참고한도/비고</th></tr>
                  </thead>
                  <tbody>
                    {(draft.nonTaxableItems || []).map((e) => (
                      <tr key={e.id}>
                        <th>{e.label || '비과세'}</th>
                        <td className="num">{fmtWon(e.amount)}</td>
                        <td>{e.limitNote || ''}{e.memo ? ` · ${e.memo}` : ''}</td>
                      </tr>
                    ))}
                    <tr className="payroll-doc-total">
                      <th>비과세 합계</th>
                      <td className="num">{fmtWon(draft.nonTaxableTotal || 0)}</td>
                      <td></td>
                    </tr>
                    <tr>
                      <th>과세대상 급여 참고액</th>
                      <td className="num">{fmtWon(draft.taxablePayReference || 0)}</td>
                      <td>세전 - 비과세 (표시용)</td>
                    </tr>
                  </tbody>
                </table>
                <p className="payroll-doc-disclaimer">
                  과세대상 급여 참고액은 비과세 입력액을 차감한 내부 검토용 금액입니다. 실제 과세/공제 계산은 세무사 확정값을 따르세요.
                </p>
              </>
            )}

            <h5 className="payroll-subtitle">공제 항목</h5>
            <table className="payroll-doc-table">
              <tbody>
                {(Object.keys(draft.deductions) as (keyof PayrollDeductions)[]).map((key) => (
                  <tr key={key}>
                    <th>{DEDUCTION_LABELS[key]}</th>
                    <td className="num">{fmtWon(draft.deductions[key])}</td>
                  </tr>
                ))}
                <tr className="payroll-doc-total">
                  <th>공제 합계</th>
                  <td className="num">{fmtWon(draft.deductionsTotal)}</td>
                </tr>
              </tbody>
            </table>

            <div className="payroll-doc-net">
              <span>예상 실지급액</span>
              <strong>{fmtWon(draft.netPay)}원</strong>
            </div>

            <label className="payroll-input-label payroll-note-input">
              비고
              <textarea
                rows={2}
                value={state.note}
                onChange={(ev) => setState((prev) => ({ ...prev, note: ev.target.value }))}
                placeholder="명세서 비고 — 예: 연차수당 별도 지급 예정 등"
              />
            </label>

            <p className="payroll-doc-disclaimer">
              본 초안은 내부 검토용입니다. 실제 지급 및 명세서 확정은 세무사/노무사 검토 후 진행하세요.
            </p>
          </div>
        )}
      </section>

      <div className="payroll-actions">
        <Button variant="danger" onClick={resetAll}>기타수당·공제 초기화</Button>
      </div>
    </Card>
  )
}

export default SitePayrollPanel
