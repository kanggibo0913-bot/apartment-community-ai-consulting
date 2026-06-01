import { useEffect, useMemo, useState } from 'react'
import Card from './Card'
import Button from './Button'
import { buildCalendarSnapshot, fmtHours, fmtWon } from '../utils/siteLaborCalendarUtils'
import {
  DEDUCTION_LABELS,
  PayrollDeductions,
  PayrollExtra,
  PayrollPersistedState,
  buildPayrollDraftFromCalendar,
  emptyPayrollState,
  loadPayrollState,
  newExtra,
  savePayrollState,
} from '../utils/sitePayrollUtils'
import './SitePayrollPanel.css'

// 세전 급여 요약 + 급여명세서 초안 패널.
// ⚠️ 공식 급여명세서가 아니다. 자동 4대보험/소득세 계산 X. 사용자가 세무사가 확정한 공제액을 직접 입력.
// 캘린더 monthSummary가 있으면 그 값으로 세전 항목을 채우고, 없으면 0 + 안내 표시.
//
// Refresh trigger: SiteLaborCostPage에서 캘린더 데이터가 바뀐 직후 다시 읽고 싶을 때 props로 받는다.
// (Calendar는 별도 localStorage라 React state 변경이 자동 전파되지 않음 — refreshNonce가 변하면
//  re-read 한다)
interface SitePayrollPanelProps {
  refreshNonce?: number
}

const SitePayrollPanel: React.FC<SitePayrollPanelProps> = ({ refreshNonce = 0 }) => {
  const [state, setState] = useState<PayrollPersistedState>(() => loadPayrollState())
  // 캘린더 스냅샷은 캘린더 입력에 따라 매번 새로 읽는다. 캘린더 변경 후 refreshNonce 증감으로 강제 갱신.
  const [calRevision, setCalRevision] = useState(0)
  // 펼치기 토글
  const [openDraft, setOpenDraft] = useState(true)

  // localStorage 자동 저장.
  useEffect(() => {
    savePayrollState(state)
  }, [state])

  // 부모가 refresh 신호 보내면 calRevision 변경 → snapshot 재계산.
  useEffect(() => {
    setCalRevision((v) => v + 1)
  }, [refreshNonce])

  const calSnapshot = useMemo(() => buildCalendarSnapshot(), [calRevision])
  const draft = useMemo(
    () => buildPayrollDraftFromCalendar(calSnapshot, state),
    [calSnapshot, state],
  )

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

  const resetAll = () => {
    if (!window.confirm('기타수당과 공제액 입력값을 모두 초기화하시겠습니까?')) return
    setState(emptyPayrollState())
  }

  const noCal = draft.source === 'none'

  return (
    <Card title="세전 급여 요약 + 급여명세서 초안 (참고 계산)" className="payroll-card">
      <div className="payroll-info-box">
        본 화면은 <strong>공식 급여명세서가 아닙니다.</strong> 4대보험·소득세 자동 계산을 하지 않으며,
        세무사 또는 급여명세서 확정 금액을 사용자가 직접 입력하는 내부 검토용 초안입니다.
      </div>

      {/* 1. 세전 급여 요약 */}
      <section className="payroll-section">
        <div className="payroll-section-head">
          <h4>세전 급여 요약</h4>
          {noCal && <span className="payroll-source-tag">캘린더 데이터 없음</span>}
        </div>
        {noCal && (
          <p className="payroll-empty">
            월간 근무시간 달력에서 기준 월과 일자별 근무시간을 입력하면 이 영역이 자동으로 채워집니다.
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
