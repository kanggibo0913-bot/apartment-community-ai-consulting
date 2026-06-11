import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import {
  EC_DAY_LABELS,
  EmploymentContractInput,
  LEGAL_NOTICE,
  SPECIAL_TERMS_PLACEHOLDER,
  countWorkDays,
  defaultContractInput,
  fmtKoreanDate,
  fmtMoney,
  fmtWorkDays,
} from '../utils/employmentContract'
import './EmploymentContractPage.css'

interface EmploymentContractPageProps {
  projectName?: string
}

// 시간 문자열 "HH:mm" → "HH시 mm분" (빈 값은 수기 칸)
const fmtTime = (s: string): string => {
  const m = (s || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return '     시      분'
  return Number(m[2]) === 0 ? `${Number(m[1])}시` : `${Number(m[1])}시 ${m[2]}분`
}

const EmploymentContractPage: React.FC<EmploymentContractPageProps> = ({ projectName }) => {
  // ⚠️ 저장 없음 — 입력값은 이 화면의 임시 state로만 존재한다.
  //    localStorage/sessionStorage/Supabase 등 어디에도 기록하지 않으며,
  //    새로고침/페이지 이탈 시 사라지는 것이 의도된 동작이다(개인정보 비보존 정책).
  const [input, setInput] = useState<EmploymentContractInput>(() => defaultContractInput())
  const [msg, setMsg] = useState('')

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2500)
  }

  const set = <K extends keyof EmploymentContractInput>(key: K, value: EmploymentContractInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }))

  const toggleDay = (key: keyof EmploymentContractInput['workDays']) =>
    setInput((prev) => ({ ...prev, workDays: { ...prev.workDays, [key]: !prev.workDays[key] } }))

  const numVal = (v: string): number => {
    if (v.trim() === '') return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const handleReset = () => {
    if (!window.confirm('입력값을 모두 초기화하시겠습니까? (저장되지 않는 화면이므로 복구할 수 없습니다)')) return
    setInput(defaultContractInput())
    flash('입력값이 초기화되었습니다.')
  }

  const handlePrint = () => {
    window.print()
  }

  // ─── 본문 치환 값 ───────────────────────────────────────────────────────────
  const v = useMemo(() => {
    const blank = (s: string, w = 8) => (s.trim() ? s : ' '.repeat(w))
    const siteFull = [input.siteAddress.trim(), input.siteName.trim() ? `(${input.siteName.trim()})` : '']
      .filter(Boolean)
      .join(' ')
    return {
      employer: input.employerName.trim() || '주식회사 엠아이케이',
      worker: blank(input.workerName, 6),
      siteFull: siteFull || '(현장 주소 미입력)',
      siteName: input.siteName.trim() || '(현장명 미입력)',
      brand: input.centerBrandName.trim(),
      startK: fmtKoreanDate(input.contractStart),
      endK: fmtKoreanDate(input.contractEnd),
      daysText: fmtWorkDays(input.workDays),
      dayCount: countWorkDays(input.workDays),
      weekdayTime: `${fmtTime(input.weekdayStart)}부터 ${fmtTime(input.weekdayEnd)}까지`,
      weekendTime: `${fmtTime(input.weekendStart)}부터 ${fmtTime(input.weekendEnd)}까지`,
      breakText: `${input.breakMinutes || 0}분`,
      duties: input.duties.trim() || '(담당 업무 미입력)',
      holidayRule: input.holidayRule.trim() || '매주 일요일 및 법정 공휴일 휴무',
      payday: input.payday.trim() || '익월(다음 달) 10일',
      payMethod: input.payMethod.trim() || '근로자 명의 예금통장에 입금한다.',
      dateK: fmtKoreanDate(input.contractDate),
    }
  }, [input])

  // 임금 1항 문구 — 시급제/월급제 전환 시에도 문장이 깨지지 않도록 통째로 생성.
  const wageClause = useMemo(() => {
    const incentive = input.incentiveUsed
      ? ` / 인센티브 : ${input.incentivePayday.trim() || '매달 말일'}까지 수업 수에 따른 수업료 (${input.incentiveRate.trim() || '비율 미입력'})`
      : ''
    if (input.payType === 'hourly') {
      const holiday = input.weeklyHolidayIncluded
        ? ' 주휴수당은 근로기준법에 따라 산정하여 지급한다.'
        : ' 주휴수당은 발생 요건 충족 시 관련 법령에 따른다.'
      return `시급 : ${fmtMoney(input.hourlyWage)}원 × 실 근로시간으로 산정하여 지급한다.${holiday}${incentive}`
    }
    const holiday = input.weeklyHolidayIncluded ? '(주휴수당 포함)' : '(주휴수당 별도 산정)'
    return `월급 : ${fmtMoney(input.monthlySalary)}원 ${holiday}${incentive}`
  }, [input])

  const taxClause = useMemo(() => {
    if (input.insuranceType === 'four') return '4대 보험 가입자 (관련 법률의 실비 발생 세금공제)'
    if (input.insuranceType === 'freelancer') return '프리랜서 (사업소득 3.3% 공제)'
    return input.taxNote.trim() || '(세금공제 방식 미입력)'
  }, [input])

  return (
    <div className="page ec-page">
      <div className="ec-screen-only">
        <PageHeader
          title="근로계약서 작성"
          description="현장별 근로계약서를 작성하고 A4 문서 형식으로 인쇄할 수 있습니다."
        />

        {/* 법적 책임 분리 + 비저장 안내 — 항상 노출 */}
        <div className="ec-legal-banner" role="alert">
          ⚠️ {LEGAL_NOTICE}
        </div>
        <div className="ec-nosave-banner" role="note">
          🔒 이 화면은 계약서 작성 보조 및 인쇄 전용이며 <strong>입력값은 저장되지 않습니다.</strong>{' '}
          새로고침하거나 다른 화면으로 이동하면 입력 내용이 사라집니다. 주민등록번호·주소·연락처 등
          근로자 개인정보는 입력받지 않으며, 인쇄 후 수기로 작성합니다.
        </div>

        <div className="ec-project-banner">
          <span>현재 현장(단지)</span>
          <strong>{projectName?.trim() || '(단지 미선택)'}</strong>
          <em>현장명·주소는 아래에 직접 입력합니다. (단지 데이터와 연동·저장되지 않음)</em>
        </div>

        <div className="ec-layout">
          {/* ─── 입력 폼 ─────────────────────────────────────────────── */}
          <div className="ec-form">
            <section className="ec-section">
              <h3>1. 현장 정보</h3>
              <label>현장명
                <input type="text" value={input.siteName} onChange={(e) => set('siteName', e.target.value)} placeholder="예: 다산 금강 펜테리움 리버테라스 1차 아파트커뮤니티" />
              </label>
              <label>현장 주소
                <input type="text" value={input.siteAddress} onChange={(e) => set('siteAddress', e.target.value)} placeholder="예: 경기도 남양주시 다산지금로145번길 15" />
              </label>
              <label>센터/브랜드명 (선택)
                <input type="text" value={input.centerBrandName} onChange={(e) => set('centerBrandName', e.target.value)} placeholder="예: HOMEBASE 커뮤니티센터" />
              </label>
              <label className="ec-check">
                <input type="checkbox" checked={input.linkClientContractPeriod} onChange={(e) => set('linkClientContractPeriod', e.target.checked)} />
                원청(위탁) 계약기간 연동 문구 사용 — “현장 위탁계약이 조기 종료/연장되면 본 계약기간도 변동될 수 있다”(제2조 3항)
              </label>
              <label>현장별 특이 문구 (선택, 제3조 하단 비고)
                <textarea rows={2} value={input.siteSpecialNote} onChange={(e) => set('siteSpecialNote', e.target.value)} placeholder="예: 시설 점검일에는 근무 장소가 관리사무소로 변경될 수 있다." />
              </label>
            </section>

            <section className="ec-section">
              <h3>2. 계약 기간 / 수습</h3>
              <div className="ec-row">
                <label>계약 시작일
                  <input type="date" value={input.contractStart} onChange={(e) => set('contractStart', e.target.value)} />
                </label>
                <label>계약 종료일
                  <input type="date" value={input.contractEnd} onChange={(e) => set('contractEnd', e.target.value)} />
                </label>
              </div>
              <div className="ec-row">
                <label className="ec-check">
                  <input type="checkbox" checked={input.probationUsed} onChange={(e) => set('probationUsed', e.target.checked)} />
                  수습기간 사용
                </label>
                <label>수습 개월 수
                  <input type="number" min={1} max={6} value={input.probationMonths} disabled={!input.probationUsed} onChange={(e) => set('probationMonths', numVal(e.target.value))} />
                </label>
              </div>
            </section>

            <section className="ec-section">
              <h3>3. 근무시간</h3>
              <div className="ec-days">
                <span>근무요일</span>
                {EC_DAY_LABELS.map((d) => (
                  <label key={d.key} className={`ec-day ${input.workDays[d.key] ? 'on' : ''}`}>
                    <input type="checkbox" checked={input.workDays[d.key]} onChange={() => toggleDay(d.key)} />
                    {d.label}
                  </label>
                ))}
              </div>
              <div className="ec-row">
                <label>평일 출근
                  <input type="time" value={input.weekdayStart} onChange={(e) => set('weekdayStart', e.target.value)} />
                </label>
                <label>평일 퇴근
                  <input type="time" value={input.weekdayEnd} onChange={(e) => set('weekdayEnd', e.target.value)} />
                </label>
              </div>
              <label className="ec-check">
                <input type="checkbox" checked={input.weekendUsed} onChange={(e) => set('weekendUsed', e.target.checked)} />
                주말(토/일) 근무시간 별도 표기
              </label>
              {input.weekendUsed && (
                <div className="ec-row">
                  <label>주말 출근
                    <input type="time" value={input.weekendStart} onChange={(e) => set('weekendStart', e.target.value)} />
                  </label>
                  <label>주말 퇴근
                    <input type="time" value={input.weekendEnd} onChange={(e) => set('weekendEnd', e.target.value)} />
                  </label>
                </div>
              )}
              <div className="ec-row">
                <label>휴게시간 (분 단위 입력)
                  <input type="number" min={0} step={5} value={input.breakMinutes} onChange={(e) => set('breakMinutes', numVal(e.target.value))} />
                </label>
                <label>휴일/공휴일 규칙
                  <input type="text" value={input.holidayRule} onChange={(e) => set('holidayRule', e.target.value)} placeholder="예: 매주 일요일 및 법정 공휴일 휴무" />
                </label>
              </div>
              <label>담당 업무 (제4조)
                <textarea rows={2} value={input.duties} onChange={(e) => set('duties', e.target.value)} />
              </label>
            </section>

            <section className="ec-section">
              <h3>4. 임금</h3>
              <div className="ec-row">
                <label className="ec-radio-group">
                  <span>급여 형태</span>
                  <span className="ec-radios">
                    <label><input type="radio" name="ec-paytype" checked={input.payType === 'monthly'} onChange={() => set('payType', 'monthly')} /> 월급제</label>
                    <label><input type="radio" name="ec-paytype" checked={input.payType === 'hourly'} onChange={() => set('payType', 'hourly')} /> 시급제</label>
                  </span>
                </label>
                {input.payType === 'hourly' ? (
                  <label>시급 (원)
                    <input type="number" min={0} value={input.hourlyWage} onChange={(e) => set('hourlyWage', numVal(e.target.value))} />
                  </label>
                ) : (
                  <label>월급 (원)
                    <input type="number" min={0} value={input.monthlySalary} onChange={(e) => set('monthlySalary', numVal(e.target.value))} />
                  </label>
                )}
              </div>
              <label className="ec-check">
                <input type="checkbox" checked={input.weeklyHolidayIncluded} onChange={(e) => set('weeklyHolidayIncluded', e.target.checked)} />
                주휴수당 반영 문구 {input.payType === 'monthly' ? '(월급에 포함 표기)' : '(법정 기준 지급 표기)'}
              </label>
              <div className="ec-row">
                <label>임금지급일
                  <input type="text" value={input.payday} onChange={(e) => set('payday', e.target.value)} placeholder="예: 익월(다음 달) 10일" />
                </label>
                <label>4대보험 / 세금
                  <select value={input.insuranceType} onChange={(e) => set('insuranceType', e.target.value as EmploymentContractInput['insuranceType'])}>
                    <option value="four">4대보험 가입</option>
                    <option value="freelancer">프리랜서 3.3% 공제</option>
                    <option value="custom">직접 입력</option>
                  </select>
                </label>
              </div>
              {input.insuranceType === 'custom' && (
                <label>세금공제 메모
                  <input type="text" value={input.taxNote} onChange={(e) => set('taxNote', e.target.value)} placeholder="예: 4대 보험 + 일부 항목 프리랜서 정산 병행" />
                </label>
              )}
              <label>지급방법
                <input type="text" value={input.payMethod} onChange={(e) => set('payMethod', e.target.value)} />
              </label>
            </section>

            <section className="ec-section">
              <h3>5. 인센티브 / 프리랜서 레슨</h3>
              <label className="ec-check">
                <input type="checkbox" checked={input.incentiveUsed} onChange={(e) => set('incentiveUsed', e.target.checked)} />
                인센티브 있음 (수업 수당 등)
              </label>
              {input.incentiveUsed && (
                <div className="ec-row">
                  <label>정산 비율
                    <input type="text" value={input.incentiveRate} onChange={(e) => set('incentiveRate', e.target.value)} placeholder="예: 50%" />
                  </label>
                  <label>정산일
                    <input type="text" value={input.incentivePayday} onChange={(e) => set('incentivePayday', e.target.value)} placeholder="예: 매달 말일" />
                  </label>
                </div>
              )}
              <label className="ec-check">
                <input type="checkbox" checked={input.personalLessonAllowed} onChange={(e) => set('personalLessonAllowed', e.target.checked)} />
                근무시간 외 프리랜서 개인레슨 허용 (제5조 비고)
              </label>
              {input.personalLessonAllowed && (
                <label>레슨 수익 분배율
                  <input type="text" value={input.lessonShare} onChange={(e) => set('lessonShare', e.target.value)} placeholder="예: 5:5" />
                </label>
              )}
              <label className="ec-check ec-legal-toggle">
                <input type="checkbox" checked={input.excludeLessonFromSeverance} onChange={(e) => set('excludeLessonFromSeverance', e.target.checked)} />
                개인레슨/프리랜서 수익을 퇴직금 산정에서 제외하는 문구 사용 (제10조 2항)
                <em className="ec-legal-tag">⚠️ 법률검토 필요</em>
              </label>
            </section>

            <section className="ec-section">
              <h3>6. 사업주 정보</h3>
              <label>사업체명
                <input type="text" value={input.employerName} onChange={(e) => set('employerName', e.target.value)} />
              </label>
              <label>주소
                <input type="text" value={input.employerAddress} onChange={(e) => set('employerAddress', e.target.value)} />
              </label>
              <div className="ec-row">
                <label>사업자번호
                  <input type="text" value={input.employerBizNo} onChange={(e) => set('employerBizNo', e.target.value)} />
                </label>
                <label>대표자명
                  <input type="text" value={input.employerCeo} onChange={(e) => set('employerCeo', e.target.value)} />
                </label>
              </div>
            </section>

            <section className="ec-section">
              <h3>7. 근로자 정보</h3>
              <label>근로자명 (선택 입력 — 저장되지 않음)
                <input type="text" value={input.workerName} onChange={(e) => set('workerName', e.target.value)} placeholder="비워 두면 계약서에 수기 작성 빈칸으로 출력" />
              </label>
              <p className="ec-privacy-note">
                주민등록번호·주소·연락처·계좌번호·서명은 개인정보 보호를 위해 앱에서 입력받지 않습니다.
                계약서에는 수기 작성용 빈칸으로 출력되며, 인쇄 후 직접 기재·서명합니다.
              </p>
            </section>

            <section className="ec-section">
              <h3>8. 법률검토 필요 조항 (선택 출력)</h3>
              <label className="ec-check ec-legal-toggle">
                <input type="checkbox" checked={input.clausePenalty10x} onChange={(e) => set('clausePenalty10x', e.target.checked)} />
                제13조 15호 — 회원과의 개인 금전거래 시 “추징금 10배 보상” 문구
                <em className="ec-legal-tag danger">⚠️ 법률 리스크 — 기본 비활성, 직접 켜야 출력됨</em>
              </label>
              <label className="ec-check ec-legal-toggle">
                <input type="checkbox" checked={input.clauseInclusiveWage} onChange={(e) => set('clauseInclusiveWage', e.target.checked)} />
                제7조 — 포괄임금제 동의 문구
                <em className="ec-legal-tag">⚠️ 법률검토 필요</em>
              </label>
              <label className="ec-check ec-legal-toggle">
                <input type="checkbox" checked={input.clauseAnnualLeaveInclusive} onChange={(e) => set('clauseAnnualLeaveInclusive', e.target.checked)} />
                제6조 3항 — 연차수당 포괄임금 산입 문구
                <em className="ec-legal-tag">⚠️ 법률검토 필요</em>
              </label>
            </section>

            <section className="ec-section">
              <h3>9. 특약사항 (제15조)</h3>
              <label>특약사항
                <textarea
                  rows={3}
                  value={input.specialTerms}
                  onChange={(e) => set('specialTerms', e.target.value)}
                  placeholder={SPECIAL_TERMS_PLACEHOLDER}
                />
              </label>
              <p className="ec-legal-small">⚠️ 특약사항은 법률검토 필요 — 입력이 없으면 “해당 없음.”으로 출력됩니다.</p>
            </section>

            <section className="ec-section">
              <h3>10. 작성일 / 인쇄</h3>
              <div className="ec-row">
                <label>계약서 작성일
                  <input type="date" value={input.contractDate} onChange={(e) => set('contractDate', e.target.value)} />
                </label>
              </div>
              <div className="ec-actions">
                <button type="button" className="ec-btn primary" onClick={handlePrint}>인쇄 / PDF 저장</button>
                <button type="button" className="ec-btn" onClick={handleReset}>입력 초기화</button>
                {msg && <span className="ec-msg">{msg}</span>}
              </div>
              <p className="ec-legal-small">
                입력값은 저장되지 않으므로 인쇄(또는 PDF 저장)를 마친 뒤 화면을 떠나세요. 인쇄 미리보기는 PC
                화면 기준 A4 문서형으로 표시됩니다. 모바일에서는 입력 후 PC에서 인쇄를 권장합니다.
              </p>
            </section>
          </div>

          {/* ─── A4 미리보기 ──────────────────────────────────────────── */}
          <div className="ec-preview-wrap">
            <div className="ec-preview-label">인쇄 미리보기 (A4)</div>
            {/* 미리보기와 인쇄가 같은 DOM을 사용 — 화면값과 출력값 불일치 방지 */}
            <ContractDocument input={input} v={v} wageClause={wageClause} taxClause={taxClause} />
          </div>
        </div>
      </div>

      {/* 인쇄 전용: ec-print-root만 보이게 CSS에서 처리 */}
      <div className="ec-print-only">
        <ContractDocument input={input} v={v} wageClause={wageClause} taxClause={taxClause} />
      </div>
    </div>
  )
}

// ─── 계약서 본문 (원문 구조 유지 + 변수 치환) ──────────────────────────────────
interface DocProps {
  input: EmploymentContractInput
  v: {
    employer: string
    worker: string
    siteFull: string
    siteName: string
    brand: string
    startK: string
    endK: string
    daysText: string
    dayCount: number
    weekdayTime: string
    weekendTime: string
    breakText: string
    duties: string
    holidayRule: string
    payday: string
    payMethod: string
    dateK: string
  }
  wageClause: string
  taxClause: string
}

const ContractDocument: React.FC<DocProps> = ({ input, v, wageClause, taxClause }) => (
  <div className="ec-doc">
    <h1 className="ec-doc-title">{v.employer} 근로계약서</h1>

    <p className="ec-doc-intro">
      {v.employer} (이하 ‘갑’이라 함)와 {v.worker} (이하 ‘을’이라 함)은 신의성실의 원칙에 따라
      ‘갑’의 규정을 준수할 것을 서약하고 다음과 같이 근로계약을 체결한다.
    </p>

    <h2>제 1 조 (채용)</h2>
    <p>‘갑’은 ‘을’을 직원으로 채용하며, 근로계약에 따른 절차와 처리는 근로기준법 및 ‘갑’의 규정에 따른다.</p>

    <h2>제 2 조 (근로계약 기간)</h2>
    <ol>
      <li>근로계약 기간 : {v.startK}부터 {v.endK}까지로 한다.</li>
      <li>
        계약 기간이 만료되는 경우 본 계약은 자동으로 종료되며, 근로기준법 제26조에 따른 별도의 통지 없이
        당사자 간의 고용 관계는 해지된다. 단, 양 당사자의 합의로 근로계약을 연장할 수 있으며, 연장 시
        근로계약서를 갱신한다.
      </li>
      {input.linkClientContractPeriod && (
        <li>
          {v.siteFull}와(과) {v.employer}의 위탁운영 계약기간이 조기 종료 및 연장됨에 따라 본 근로계약
          기간 또한 조기 종료 및 연장될 수 있다.
        </li>
      )}
      {input.probationUsed && (
        <li>
          신규로 채용된 자에 대하여는 계약 기간 초일부터 {input.probationMonths}개월간을 수습(시용)
          기간으로 한다. (상세 제11조)
        </li>
      )}
    </ol>

    <h2>제 3 조 (근무 장소)</h2>
    <ol>
      <li>{v.siteFull}{v.brand ? ` — ${v.brand}` : ''}</li>
      <li>
        ‘갑’은 업무상 필요할 경우 위 ‘을’의 담당업무 및 근무 장소를 변경하거나 이동시킬 수 있고, ‘을’은
        이에 따르기로 합의하며, 합의에 이르지 못할 시 ‘을’의 원(願)에 의해 계약이 해지될 수 있다.
      </li>
      {input.siteSpecialNote.trim() && <li>(현장 비고) {input.siteSpecialNote.trim()}</li>}
    </ol>

    <h2>제 4 조 (업무의 내용)</h2>
    <p>{v.duties}</p>

    <h2>제 5 조 (소정근로시간)</h2>
    <ol>
      <li>
        ‘을’의 근로시간은 다음과 같다.
        <br />근로요일 : {v.daysText} (주 {v.dayCount}일)
        <br />평일 근로시간 : {v.weekdayTime}
        {input.weekendUsed && (
          <>
            <br />주말 근로시간 : {v.weekendTime}
          </>
        )}
        <br />휴게시간 : 1일 {v.breakText} (근로시간에서 제외)
      </li>
      <li>‘갑’은 업무상 필요한 시 위의 근로시간과 휴게시간을 변경할 수 있다.</li>
      <li>
        ‘갑’은 당사자가 합의한 소정 근로(제5조 1항)시간 외에 ‘갑’의 요청 없는 ‘을’의 연장·휴일근로는
        근로시간으로 보지 아니한다.
      </li>
    </ol>
    {input.personalLessonAllowed && (
      <div className="ec-doc-note">
        <p>※ 근무시간 외 프리랜서로 개인레슨을 할 수 있도록 허용하며, 레슨비는 {input.lessonShare.trim() || '협의'} 비율로 정산한다.</p>
        <p>※ 근무 외 프리랜서 활동은 자율이며, 별도의 계약서 없이 본 계약서의 내용으로 상호 합의한다.</p>
        <p>※ 정해진 근로시간 외 프리랜서 개인레슨 수업은 자율 근무로 한다.</p>
        <p>※ 근무시간 이외에 프리랜서로 진행한 자율 운동지도·교육은 본 계약서에 명시된 급여에 포함하지 않는다.</p>
        <p className="ec-doc-legal-mark">⚠️ 법률검토 필요 조항 — 프리랜서/위임 관계 구분은 노무사 확인 후 사용</p>
      </div>
    )}

    <h2>제 6 조 (근무일 / 휴일)</h2>
    <ol>
      <li>주 {v.dayCount}일 근무 ({v.daysText}) / {v.holidayRule}</li>
      <li>업무상 필요 때문에 사전 동의로 다른 근로일로 조정, 대체할 수 있다.</li>
      {input.clauseAnnualLeaveInclusive && (
        <li>
          ‘갑’은 ‘을’의 동의가 있는 경우에는 연차휴가에 갈음한 수당을 포괄임금에 산입할 수 있다.
          (단, 포괄임금에 포함된 경우라도 근로자의 휴가사용권은 제약되지 않으며, 휴가를 사용하는 경우에는
          사용 일수만큼 임금(연차수당)이 공제된다.)
          <span className="ec-doc-legal-mark"> ⚠️ 법률검토 필요</span>
        </li>
      )}
      <li>상기 휴일은 업무상 필요한 경우 사전에 직원에게 통지하고 다른 날로 대체할 수 있다.</li>
    </ol>

    <h2>제 7 조 (임금)</h2>
    <ol>
      <li>{wageClause}</li>
      <li>임금지급일 : {v.payday} (※ 매달 1일~말일까지의 급여 합산 금액을 지급일에 정산 입금한다.)</li>
      <li>지급방법 : {v.payMethod}</li>
      {input.clauseInclusiveWage && (
        <>
          <li>
            ‘을’은 업무의 특성상 포괄임금제 적용에 동의한다.
            <span className="ec-doc-legal-mark"> ⚠️ 법률검토 필요</span>
          </li>
          <li>
            임금의 총 금액에는 회사의 근로시간 중 법정 제 수당인 기본급여와 연장근로시간, 야간근로시간,
            기타에 대한 수당이 포괄적 임금형태로 모두 포함된 것으로 한다.
            <span className="ec-doc-legal-mark"> ⚠️ 법률검토 필요</span>
          </li>
        </>
      )}
      <li>
        상기 명세는 소정의 근로일수를 개근하였을 경우 지급되는 것으로 무단결근, 지각, 조퇴 등의 사유가
        발생하여 근무하지 않은 시간에 대하여는 일할 계산하여 공제한다.
      </li>
      <li>‘을’은 자신의 임금·연봉에 관한 사항을 타인에게 누설하여서는 안 된다.</li>
    </ol>

    <h2>제 8 조 (세금공제)</h2>
    <p>{taxClause}</p>

    <h2>제 9 조 (근로계약서 교부)</h2>
    <p>
      사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계없이 근로자에게
      교부한다. (근로기준법 제17조 이행)
    </p>

    <h2>제 10 조 (퇴직금)</h2>
    <ol>
      <li>‘갑’과 ‘을’은 퇴직금과 관련하여 근로자퇴직급여 보장법에 따르기로 한다.</li>
      <li>
        퇴직금 산정을 위한 ‘평균임금’은 제7조에 따른 임금 및 기타 근로관계로 인하여 지급된 금액만을
        포함하여 산정한다.
        {input.excludeLessonFromSeverance && (
          <>
            {' '}위임계약에 따라 지급된 수익금은 포함하지 않는다. (개인레슨 등 개인 영위 활동에서 발생한
            수익은 퇴직금 산정에 산입하지 않는다)
            <span className="ec-doc-legal-mark"> ⚠️ 법률검토 필요</span>
          </>
        )}
      </li>
    </ol>

    <h2>제 11 조 (수습 기간)</h2>
    {input.probationUsed ? (
      <ol>
        <li>
          신규로 채용 내정된 자에 대하여는 제2조 계약 기간 초일부터 {input.probationMonths}개월간을
          수습(시용) 기간으로 할 수 있다.
        </li>
        <li>
          수습 기간에 직원의 미숙련, 부적격한 업무수행, 업무윤리 미준수, 건강상태 등으로 인하여 당해
          직원이 채용에 부적합하거나 계속 근로가 부적절하다고 판단되는 경우 ‘갑’은 본 채용을 거부할 수
          있고, 회사는 직원의 실제 근무일 수에 대해서만 임금을 지급할 책임을 진다.
        </li>
      </ol>
    ) : (
      <p>수습(시용) 기간은 두지 않는다.</p>
    )}

    <h2>제 12 조 (손해배상)</h2>
    <p>
      ‘을’의 귀책 사유로 인해 재직 중 또는 퇴직 후 ‘갑’에게 손해가 발생한 경우에는 ‘을’은 즉시 그 손해를
      배상하여야 한다.
    </p>

    <h2>제 13 조 (해고 및 퇴직)</h2>
    <ol>
      <li>
        ‘을’의 귀책 사유 또는 ‘갑’의 경영상의 이유, 기타 부득이한 사유나 사정 때문에 근로관계를 지속할 수
        없는 사정이 발생한 경우에는 ‘갑’은 ‘을’에게 30일 전에 통보하고 계약을 중도 해지할 수 있다.
      </li>
      <li>
        ‘을’이 계약을 해지하고자 할 경우는 ‘갑’에게 1개월 전에 사직원을 제출하여야 하며, 후임자를
        채용·배정받은 후 인수인계를 통해 업무의 중단이 없도록 하여야 한다. 이를 위반하여 ‘갑’에게 손해가
        발생한 경우 ‘을’에게 손해배상을 청구할 수 있다.
      </li>
      <li>
        ‘을’이 다음 각호의 사유에 해당하면 근로계약 해지 및 해고할 수 있다.
        <ol className="ec-doc-sublist">
          <li>정당한 사유 없이 계속하여 3일 이상 결근한 자</li>
          <li>사업장 시설 무단 사용, 관리 재료, 회사 비품 등 ‘갑’의 금품 등을 횡령, 절취, 사취, 유용 기타 이와 유사한 행위를 한 자</li>
          <li>고의 및 과실 또는 업무 태만, 고객의 이의제기로 ‘갑’의 재산상 손해를 초래케 한 자</li>
          <li>정당한 사유 없이 ‘갑’의 업무상 명령에 불복하거나 월권행위를 한 자</li>
          <li>직원 간의 인화를 저해한 자</li>
          <li>사업과 관련하여 ‘갑’의 위신을 손상케 하는 행위를 한 자</li>
          <li>‘갑’의 내부정보 및 고객 정보를 ‘갑’의 허가 없이 내·외부로 유출한 자</li>
          <li>사업장 내에서 성희롱을 한 자</li>
          <li>‘갑’의 경영과 관련하여 사실을 왜곡 날조하여 유포한 자</li>
          <li>동료 직원의 징계 사실 등 비위행위를 은폐한 자</li>
          <li>중요한 업무를 조작 또는 허위 보고한 자</li>
          <li>무단으로 지각, 조퇴, 외출하는 자</li>
          <li>회원의 불쾌감을 조성하는 등 회원과의 관계악화로 업무수행의 어려움이 있는 자</li>
          <li>기타 위 각호에 준하는 비위 사실이 있는 자</li>
          {input.clausePenalty10x && (
            <li>
              회원과의 개인 금전거래 시 즉시 해고 및 급여지급 중단, 추징금 10배 보상
              <span className="ec-doc-legal-mark"> ⚠️ 법률검토 필요 조항 — 효력 다툼 가능성 높음</span>
            </li>
          )}
        </ol>
      </li>
    </ol>

    <h2>제 14 조 (기타)</h2>
    <p>
      본 계약서에 정하지 아니한 사항은 법령 또는 취업규칙에 따르며, 계약조건은 상호 합의하여 변경할 수
      있다.
    </p>

    <h2>제 15 조 (특약 사항)</h2>
    <p className="ec-doc-special">{input.specialTerms.trim() || '해당 없음.'}</p>

    <p className="ec-doc-closing">
      이상의 계약을 명확히 하기 위하여 본 계약서 2부를 작성, ‘갑’과 ‘을’이 각각 날인한 후 각 1부씩
      보관한다.
    </p>

    <p className="ec-doc-date">{v.dateK}</p>

    <div className="ec-doc-sign">
      <div className="ec-doc-sign-block">
        <div className="ec-doc-sign-head">(사업주)</div>
        <div>사 업 체 명 : {input.employerName || ' '}</div>
        <div>주&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;소 : {input.employerAddress || ' '}</div>
        <div>사업자 번호 : {input.employerBizNo || ' '}</div>
        <div>대&nbsp;&nbsp;표&nbsp;&nbsp;자 : {input.employerCeo || ' '} <span className="ec-doc-stamp">(직인)</span></div>
      </div>
      <div className="ec-doc-sign-block">
        <div className="ec-doc-sign-head">(근로자)</div>
        <div>주민등록번호 : <span className="ec-doc-blank" /></div>
        <div>주&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;소 : <span className="ec-doc-blank wide" /></div>
        <div>연&nbsp;&nbsp;락&nbsp;&nbsp;처 : <span className="ec-doc-blank" /></div>
        <div>계 좌 정 보 : <span className="ec-doc-blank wide" /></div>
        <div>성&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;명 : {input.workerName.trim() ? input.workerName : <span className="ec-doc-blank" />} <span className="ec-doc-stamp">(서명)</span></div>
      </div>
    </div>

    <p className="ec-doc-footer">{input.employerName || '주식회사 엠아이케이'}</p>
    <p className="ec-doc-disclaimer">※ 본 문서는 내부 작성 보조용 출력물로, 최종 사용 전 노무사/법률 검토가 필요합니다.</p>
  </div>
)

export default EmploymentContractPage
