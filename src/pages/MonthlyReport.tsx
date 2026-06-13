import { useEffect, useRef, useState } from 'react'
import { CommunityData, MonthlyReportData } from '../types/CommunityData'
import Button from '../components/Button'
import Card from '../components/Card'
import AIResultPanel from '../components/AIResultPanel'
import { callAI } from '../utils/aiClient'
import { saveAiErrorResult } from '../utils/storage'
import { LaborCostSnapshot, snapshotEmpCount, snapshotMonthlyTotal } from '../utils/siteLaborSnapshots'
import { buildMetricsPromptBlock, computeMonthlyReportMetrics } from '../utils/monthlyReportMetrics'
import './Pages.css'

// ─── 저장본 데이터 연동 (참고자료) ─────────────────────────────────────────────
// 현장 인건비/입찰 산출표 저장본을 월간 리포트 초안에 "요약"으로만 반영한다.
// ⚠️ 저장본 raw JSON·직원 개인정보(직원명 등)는 프롬프트/본문에 넣지 않는다 (합계·인원 중심).
const SITE_SNAP_KEY = 'siteLaborCostSnapshots'
const BID_SNAP_KEY = 'bidCalculationSnapshots'

// 입찰 저장본은 EstimateCalculator에서 summary를 저장해두므로 읽기 전용 최소 타입으로 사용.
interface BidSnapshotLite {
  id: string
  title: string
  apartmentName: string
  baseMonth?: string
  bidDate?: string
  savedAt: string
  updatedAt?: string
  summary?: {
    bidAmount: number
    monthlyTrustTotal: number
    activeRoleCount: number
    totalDirectLabor: number
    totalIndirectLabor: number
    monthlyFee: number
    // 확장(선택, 기존 저장본 호환). 값이 있을 때만 참고자료에 표시.
    overallSubtotal?: number
    contractMonths?: number
    generalManagementFee?: number
    profit?: number
    vat?: number
  }
}

const loadSiteSnapshots = (): LaborCostSnapshot[] => {
  try {
    const raw = window.localStorage.getItem(SITE_SNAP_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as LaborCostSnapshot[]) : []
  } catch {
    return []
  }
}

const loadBidSnapshots = (): BidSnapshotLite[] => {
  try {
    const raw = window.localStorage.getItem(BID_SNAP_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as BidSnapshotLite[]) : []
  } catch {
    return []
  }
}

const formatCurrency = (v: number) => '₩' + Math.round(Number.isFinite(v) ? v : 0).toLocaleString('ko-KR')
const formatDate = (s?: string) => {
  if (!s) return '-'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('ko-KR')
}

// 현장 인건비 저장본 요약 (직원 개인정보 제외 — 인원수/합계/요율 중심)
const getSiteLaborSnapshotSummary = (snap: LaborCostSnapshot): string => {
  const count = snapshotEmpCount(snap.data)
  const total = snapshotMonthlyTotal(snap.data)
  const st = snap.data?.settings
  const lines = [
    '【현장 인건비 산출 참고자료】',
    `- 저장명: ${snap.title}`,
    `- 단지명: ${snap.apartmentName || '-'}`,
    `- 기준월: ${snap.baseMonth || '-'}`,
    `- 직원 수: ${count}명`,
    `- 월 총 예상 인건비: ${formatCurrency(total)}`,
    `- 저장일: ${formatDate(snap.savedAt)}${snap.updatedAt ? ` (수정 ${formatDate(snap.updatedAt)})` : ''}`,
  ]
  if (st) {
    lines.push(`- 적용 요율: 4대보험 ${st.insuranceRate}% / 퇴직 ${st.severanceRate}% / 연차 ${st.annualLeaveRate}% / 기타 ${st.otherIndirectRate}%`)
  }
  lines.push('본 자료는 현장 인건비 산출 저장본을 기반으로 한 참고자료입니다. (직원 개인정보 제외, 합계·인원수 중심)')
  return lines.join('\n')
}

// 입찰 산출표 저장본 요약 (summary 중심 — 상세 행 제외)
// 확장 필드(overallSubtotal/contractMonths/일반관리비/이윤/부가세)는 값이 있을 때만 출력.
const getBidCalculationSnapshotSummary = (snap: BidSnapshotLite): string => {
  const s = snap.summary
  const lines = [
    '【입찰 산출표 참고자료】',
    `- 저장명: ${snap.title}`,
    `- 단지명: ${snap.apartmentName || '-'}`,
    `- 기준월/입찰일: ${snap.bidDate || snap.baseMonth || '-'}`,
    `- 입찰가액: ${formatCurrency(s?.bidAmount ?? 0)}`,
    `- 월간 위탁 총계: ${formatCurrency(s?.monthlyTrustTotal ?? 0)}`,
    `- 적용 인원 수: ${s?.activeRoleCount ?? 0}명`,
    `- 직접노무비 합계: ${formatCurrency(s?.totalDirectLabor ?? 0)}`,
    `- 간접노무비 합계: ${formatCurrency(s?.totalIndirectLabor ?? 0)}`,
    `- 월 위탁수수료: ${formatCurrency(s?.monthlyFee ?? 0)}`,
  ]
  if (s?.overallSubtotal !== undefined) lines.push(`- 총괄 소계(직접+간접): ${formatCurrency(s.overallSubtotal)}`)
  if (s?.contractMonths !== undefined) lines.push(`- 계약개월수: ${s.contractMonths}개월`)
  if (s?.generalManagementFee !== undefined) lines.push(`- 일반관리비: ${formatCurrency(s.generalManagementFee)}`)
  if (s?.profit !== undefined) lines.push(`- 이윤: ${formatCurrency(s.profit)}`)
  if (s?.vat !== undefined) lines.push(`- 부가세: ${formatCurrency(s.vat)}`)
  lines.push(`- 저장일: ${formatDate(snap.savedAt)}${snap.updatedAt ? ` (수정 ${formatDate(snap.updatedAt)})` : ''}`)
  lines.push('본 자료는 입찰 산출표 저장본을 기반으로 한 참고자료입니다. (요약 중심, 상세 행 제외)')
  return lines.join('\n')
}

const buildSnapshotReportContext = (site: LaborCostSnapshot | null, bid: BidSnapshotLite | null): string => {
  const parts: string[] = []
  if (site) parts.push(getSiteLaborSnapshotSummary(site))
  if (bid) parts.push(getBidCalculationSnapshotSummary(bid))
  return parts.join('\n\n')
}

interface MonthlyReportProps {
  data: CommunityData
  reportData: MonthlyReportData
  onChange: (next: Partial<MonthlyReportData>) => void
  // 단지 식별자 — AI 결과/오류 이력에 첨부되어 AiResultHistoryPage에서 단지별로 분리 표시.
  projectId?: string
  projectName?: string
}

const defaultMonthlyReportData: MonthlyReportData = {
  reportMonth: new Date().toISOString().slice(0, 7),
  summaryMemo: '',
  keyIssues: '',
  improvementPlan: '',
  memo: '',
  generatedReport: '',
}

const MonthlyReport: React.FC<MonthlyReportProps> = ({ data, reportData: reportDataProp, onChange, projectId, projectName }) => {
  const reportData = reportDataProp ?? defaultMonthlyReportData
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [aiError, setAiError] = useState('')

  // 비용 사고 방지: AI 리포트가 생성된 보고월을 추적한다(새 저장 구조 없이 메모리 ref만 사용).
  // 같은 보고월로 다시 'AI 고도화'를 누르면 호출 전 confirm을 띄워 중복 과금을 막는다.
  // 초기값: 이미 저장된 생성본이 있으면 현재 보고월을 그 생성본의 월로 간주한다(영속된 month+report 쌍).
  const generatedMonthRef = useRef<string>(
    (reportData.generatedReport || '').trim() ? (reportData.reportMonth || currentMonth) : '',
  )

  // 저장본 연동: 선택값은 MonthlyReportData에 영속(communityAiProjects key는 그대로, 필드만 optional 추가)
  const [siteSnapshots] = useState<LaborCostSnapshot[]>(loadSiteSnapshots)
  const [bidSnapshots] = useState<BidSnapshotLite[]>(loadBidSnapshots)
  const selectedSiteId = reportData.selectedSiteLaborSnapshotId ?? ''
  const selectedBidId = reportData.selectedBidCalculationSnapshotId ?? ''
  const selectedSite = siteSnapshots.find((s) => s.id === selectedSiteId) ?? null
  const selectedBid = bidSnapshots.find((s) => s.id === selectedBidId) ?? null
  const snapshotContext = buildSnapshotReportContext(selectedSite, selectedBid)

  // 저장된 선택 id가 더 이상 존재하지 않으면(타 페이지에서 삭제됨) 안전하게 정리.
  useEffect(() => {
    if (selectedSiteId && !siteSnapshots.some((s) => s.id === selectedSiteId)) {
      onChange({ selectedSiteLaborSnapshotId: '' })
    }
    if (selectedBidId && !bidSnapshots.some((s) => s.id === selectedBidId)) {
      onChange({ selectedBidCalculationSnapshotId: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 보고 월이 비어 있으면 현재 월로 안전하게 초기화 (reportMonth 누락 방어)
  useEffect(() => {
    if (!reportData.reportMonth) {
      onChange({ reportMonth: currentMonth })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showMessage = (msg: string) => {
    setStatusMessage(msg)
    setTimeout(() => setStatusMessage(''), 5000)
  }

  const generateLocalReport = () => {
    setIsGenerating(true)
    setAiError('')

    try {
      const contractCount = data.contractManagement.contracts.length
      const contractsExpiring = data.contractManagement.contracts.filter(c => {
        const endDate = new Date(c.endDate)
        const today = new Date()
        const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return daysLeft > 0 && daysLeft <= 60
      }).length
      const contractsRenewal = data.contractManagement.contracts.filter(c => {
        const reviewDate = new Date(c.renewalReviewDate)
        const today = new Date()
        return reviewDate < today && c.status === '진행중'
      }).length

      const complaintTotal = data.complaints.length
      const complaintByType = data.complaints.reduce<Record<string, number>>((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1
        return acc
      }, {})

      const facilityEnabled = data.facilityInfo.items.filter(f => f.enabled).length
      const totalCost = Object.values(data.costInfo).reduce((a, b) => a + b, 0)
      const membershipRevenue = data.revenueTarget.currentMembers * data.revenueTarget.avgMembershipPrice
      const totalRevenue = membershipRevenue + data.revenueTarget.ptForecast + data.revenueTarget.gxForecast + data.revenueTarget.otherServiceRevenue

      const report = `[월간 커뮤니티센터 운영 리포트]

1. 단지 개요
- 단지명: ${data.apartmentInfo.name || '(미입력)'}
- 세대수: ${data.apartmentInfo.totalUnits || 0}세대
- 관리회사: ${data.apartmentInfo.officeName || '(미입력)'}
- 운영 시설: ${facilityEnabled}개 시설

2. 월간 운영 요약
- 보고 월: ${reportData.reportMonth || '(미입력)'}
- 운영 요약: ${reportData.summaryMemo || '(미입력)'}

3. 수익 현황
- 총 예상 매출: ₩${totalRevenue.toLocaleString()}
- 당월 목표: ₩${(data.revenueTarget.currentMonthTarget || 0).toLocaleString()}
- 목표 대비 차이: ₩${(totalRevenue - (data.revenueTarget.currentMonthTarget || 0)).toLocaleString()}

4. 비용 현황
- 총 인건비: ₩${data.costInfo.salaries.toLocaleString()}
- 예상 공과금: ₩${(data.costInfo.electricity + data.costInfo.water + data.costInfo.hvac).toLocaleString()}
- 기존 월 운영비: ₩${totalCost.toLocaleString()}
- 예상 운영 손익: ₩${(totalRevenue - totalCost).toLocaleString()}

5. 민원 현황
- 총 민원 수: ${complaintTotal}건
- 주요 민원 유형: ${Object.entries(complaintByType)
        .map(([type, count]) => `${type}(${count}건)`)
        .join(', ') || '없음'}
- 처리 필요 사항: ${data.complaints.filter(c => c.status !== '완료').length}건 미처리

6. 계약 관리 현황
- 전체 계약 수: ${contractCount}건
- 만료 예정 계약: ${contractsExpiring}건
- 갱신 검토 필요: ${contractsRenewal}건

7. 주요 이슈
${reportData.keyIssues ? reportData.keyIssues : '(입력된 이슈 없음)'}

8. 개선 계획
${reportData.improvementPlan ? reportData.improvementPlan : '(입력된 계획 없음)'}

9. 입대의 보고용 요약
이번 달 커뮤니티센터는 ${data.apartmentInfo.name || '단지'}의 주요 시설 운영을 담당하여 관리사무소 및 입주자분들에게 서비스를 제공하였습니다.
전체적인 운영 현황은 양호하며, 월간 예상 손익은 ₩${(totalRevenue - totalCost).toLocaleString()}입니다.
주요 검토사항으로는 ${contractsExpiring > 0 ? `${contractsExpiring}건의 만료 예정 계약 갱신` : '특별한 사항 없음'}이 있습니다.
${snapshotContext ? `\n${snapshotContext}\n` : ''}
---
생성일시: ${new Date().toLocaleString('ko-KR')}`

      onChange({ generatedReport: report })
      showMessage('로컬 리포트가 생성되었습니다.')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setAiError('로컬 리포트 생성 실패: ' + msg)
    } finally {
      setIsGenerating(false)
    }
  }

  const generateAiReport = async () => {
    const targetMonth = reportData.reportMonth || currentMonth

    // 비용 사고 방지: 같은 보고월의 리포트가 이미 생성돼 있으면 호출 전 한 번 확인한다.
    // GPT-5.5 라우팅으로 호출당 비용이 있으므로 연타·중복 재생성을 막는다.
    const hasExistingReport = (reportData.generatedReport || '').trim().length > 0
    if (hasExistingReport && generatedMonthRef.current === targetMonth) {
      const proceed = window.confirm('이미 생성된 리포트가 있습니다. 다시 생성하면 AI 비용이 발생합니다. 계속할까요?')
      if (!proceed) return
    }

    setAiLoading(true)
    setAiError('')

    // AI 호출 전 운영 지표 사전 계산 — 세대당 매출/인당 인건비 등 진단 근거를 프롬프트에 함께 전달
    const metrics = computeMonthlyReportMetrics(data)

    const payload = {
      apartmentName: data.apartmentInfo.name,
      totalUnits: data.apartmentInfo.totalUnits,
      managementCompany: data.apartmentInfo.officeName,
      reportMonth: reportData.reportMonth || currentMonth,
      summaryMemo: reportData.summaryMemo,
      facilities: data.facilityInfo.items.filter(f => f.enabled).map(f => f.name),
      revenueData: {
        membershipRevenue: data.revenueTarget.currentMembers * data.revenueTarget.avgMembershipPrice,
        ptForecast: data.revenueTarget.ptForecast,
        gxForecast: data.revenueTarget.gxForecast,
        otherServiceRevenue: data.revenueTarget.otherServiceRevenue,
        monthlyTarget: data.revenueTarget.currentMonthTarget,
      },
      costData: {
        salaries: data.costInfo.salaries,
        electricity: data.costInfo.electricity,
        water: data.costInfo.water,
        hvac: data.costInfo.hvac,
        supplies: data.costInfo.supplies,
        maintenance: data.costInfo.maintenance,
        cleaning: data.costInfo.cleaning,
        other: data.costInfo.other,
      },
      staffCount: metrics.staffCount,
      laborCost: data.laborCost.employees.length,
      // 사전 계산 지표 + 판정 블록 — ai.ts의 monthlyReport 프롬프트가 이 블록을 진단 근거로 사용
      operationMetricsContext: buildMetricsPromptBlock(metrics),
      complaintCount: data.complaints.length,
      unresolvedComplaints: data.complaints.filter(c => c.status !== '완료').length,
      contractCount: data.contractManagement.contracts.length,
      expiringContracts: data.contractManagement.contracts.filter(c => {
        const endDate = new Date(c.endDate)
        const today = new Date()
        const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return daysLeft > 0 && daysLeft <= 60
      }).length,
      keyIssues: reportData.keyIssues,
      improvementPlan: reportData.improvementPlan,
      // 선택한 저장본 요약(합계·인원 중심, 직원 개인정보·raw JSON 제외). 미선택 시 필드 생략.
      ...(snapshotContext ? { snapshotReference: snapshotContext } : {}),
    }

    try {
      const result = await callAI('monthlyReport', payload)
      // 오류 이력 저장용 안전 프롬프트 요약 (snapshotReference·raw 데이터는 저장하지 않음)
      const promptSummary = `보고월: ${reportData.reportMonth || '-'} / 요약메모: ${(reportData.summaryMemo || '').slice(0, 120)} / 주요이슈: ${(reportData.keyIssues || '').slice(0, 120)}`
      if (result.ok) {
        const text = (result.result || '').trim()
        if (!text) {
          const errMsg = 'AI가 빈 응답을 반환했습니다. 잠시 후 다시 시도해주세요.'
          setAiError(errMsg)
          saveAiErrorResult({ title: `${reportData.reportMonth || ''} 월간 리포트 오류`.trim(), taskType: 'monthlyReport', error: errMsg, prompt: promptSummary, sourcePage: 'monthly-report', ...(projectId ? { projectId } : {}), ...(projectName ? { projectName } : {}) })
        } else {
          onChange({ generatedReport: text })
          generatedMonthRef.current = targetMonth // 이 보고월은 생성 완료 → 다음 동월 재생성 시 confirm
          showMessage('AI 리포트 생성이 완료되었습니다.')
        }
      } else {
        const errMsg = result.error || 'AI 응답 생성 중 알 수 없는 오류가 발생했습니다.'
        setAiError(errMsg)
        saveAiErrorResult({ title: `${reportData.reportMonth || ''} 월간 리포트 오류`.trim(), taskType: 'monthlyReport', error: errMsg, prompt: promptSummary, sourcePage: 'monthly-report', ...(projectId ? { projectId } : {}), ...(projectName ? { projectName } : {}) })
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const errMsg = msg || 'AI 응답 생성 중 알 수 없는 오류가 발생했습니다.'
      setAiError(errMsg)
      const promptSummary = `보고월: ${reportData.reportMonth || '-'} / 요약메모: ${(reportData.summaryMemo || '').slice(0, 120)} / 주요이슈: ${(reportData.keyIssues || '').slice(0, 120)}`
      saveAiErrorResult({ title: `${reportData.reportMonth || ''} 월간 리포트 오류`.trim(), taskType: 'monthlyReport', error: errMsg, prompt: promptSummary, sourcePage: 'monthly-report', ...(projectId ? { projectId } : {}), ...(projectName ? { projectName } : {}) })
    } finally {
      setAiLoading(false)
    }
  }

  const isConfigError = /API 키|환경변수|OPENAI_API_KEY|OPENAI_MODEL/.test(aiError)

  return (
    <div className="page">
      <Card>
        <h3 style={{ marginTop: 0 }}>월간 운영 리포트 생성</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div className="form-group">
            <label>보고 월</label>
            <input
              type="month"
              value={reportData.reportMonth || currentMonth}
              onChange={e => onChange({ reportMonth: e.target.value })}
            />
          </div>
          <div></div>
        </div>

        <div className="form-group">
          <label>운영 요약 메모</label>
          <textarea
            value={reportData.summaryMemo}
            onChange={e => onChange({ summaryMemo: e.target.value })}
            placeholder="이번 달 운영 현황을 간단히 입력해주세요."
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>주요 이슈</label>
          <textarea
            value={reportData.keyIssues}
            onChange={e => onChange({ keyIssues: e.target.value })}
            placeholder="발생한 주요 문제나 이슈를 입력해주세요."
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>개선 계획</label>
          <textarea
            value={reportData.improvementPlan}
            onChange={e => onChange({ improvementPlan: e.target.value })}
            placeholder="개선 방안 및 실행 계획을 입력해주세요."
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>기타 메모</label>
          <textarea
            value={reportData.memo}
            onChange={e => onChange({ memo: e.target.value })}
            placeholder="추가 메모사항이 있으면 입력해주세요."
            rows={2}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button onClick={generateLocalReport} disabled={isGenerating || aiLoading} className="btn-secondary">
            {isGenerating ? '생성 중...' : '로컬 리포트 생성'}
          </Button>
          <Button onClick={generateAiReport} disabled={aiLoading || isGenerating} className="btn-primary">
            {aiLoading ? 'AI 생성 중...' : 'AI 고도화'}
          </Button>
        </div>

        {isConfigError && (
          <p style={{ marginTop: '10px', marginBottom: 0, fontSize: '12px', color: '#b54708' }}>
            AI 호출에 실패한 경우 Netlify 환경변수 <code>OPENAI_API_KEY</code>와 <code>OPENAI_MODEL</code> 설정을 확인해주세요.
          </p>
        )}

        <details style={{ marginTop: '10px', fontSize: '12px', color: '#667085' }}>
          <summary style={{ cursor: 'pointer' }}>AI 설정 도움말</summary>
          <p style={{ margin: '6px 0 0', lineHeight: 1.6 }}>
            로컬 개발에서는 <code>npm run dev:netlify</code>로 실행하고 프로젝트 루트 <code>.env</code>에 <code>OPENAI_API_KEY</code>를 설정해야 AI 함수가 동작합니다. 배포 환경은 Netlify 대시보드(Site settings → Environment variables)에서 <code>OPENAI_API_KEY</code>·<code>OPENAI_MODEL</code>을 설정합니다.
          </p>
        </details>

        {statusMessage && (
          <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#e7f3ff', color: '#0066cc', borderRadius: '4px', fontSize: '14px' }}>
            {statusMessage}
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>저장본 데이터 연동</h3>
        <p style={{ marginTop: 0, fontSize: '13px', color: '#667085', lineHeight: 1.6 }}>
          현장 인건비 산출 또는 입찰 산출표 저장본을 선택하면, 월간 리포트 초안 생성 시 해당 데이터 요약이 함께 반영됩니다.
        </p>

        <div className="form-group">
          <label>현장 인건비 저장본</label>
          {siteSnapshots.length === 0 ? (
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#8a93a6' }}>
              현장 인건비 저장본이 없습니다. 현장 인건비 산출 화면에서 먼저 저장본을 생성하세요.
            </p>
          ) : (
            <select value={selectedSiteId} onChange={(e) => onChange({ selectedSiteLaborSnapshotId: e.target.value })}>
              <option value="">선택 안 함</option>
              {siteSnapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {`${s.baseMonth || '-'} ${s.apartmentName || '-'} - ${s.title} / 월 예상 인건비 ${formatCurrency(snapshotMonthlyTotal(s.data))}`}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="form-group">
          <label>입찰 산출표 저장본</label>
          {bidSnapshots.length === 0 ? (
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#8a93a6' }}>
              입찰 산출표 저장본이 없습니다. 입찰 산출표 작성 화면에서 먼저 저장본을 생성하세요.
            </p>
          ) : (
            <select value={selectedBidId} onChange={(e) => onChange({ selectedBidCalculationSnapshotId: e.target.value })}>
              <option value="">선택 안 함</option>
              {bidSnapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {`${s.bidDate || s.baseMonth || '-'} ${s.apartmentName || '-'} - ${s.title} / 입찰가액 ${formatCurrency(s.summary?.bidAmount ?? 0)}`}
                </option>
              ))}
            </select>
          )}
        </div>

        {(selectedSite || selectedBid) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginTop: '8px' }}>
            {selectedSite && (
              <div style={{ border: '1px solid #e3e8ef', borderRadius: '8px', padding: '12px', fontSize: '13px', lineHeight: 1.7, background: '#f8fafc' }}>
                <strong>현장 인건비 미리보기</strong>
                <div>저장명: {selectedSite.title}</div>
                <div>단지명: {selectedSite.apartmentName || '-'}</div>
                <div>기준월: {selectedSite.baseMonth || '-'}</div>
                <div>직원 수: {snapshotEmpCount(selectedSite.data)}명</div>
                <div>월 총 예상 인건비: {formatCurrency(snapshotMonthlyTotal(selectedSite.data))}</div>
                <div>저장일: {formatDate(selectedSite.savedAt)}</div>
                {selectedSite.updatedAt && <div>수정일: {formatDate(selectedSite.updatedAt)}</div>}
              </div>
            )}
            {selectedBid && (
              <div style={{ border: '1px solid #e3e8ef', borderRadius: '8px', padding: '12px', fontSize: '13px', lineHeight: 1.7, background: '#f8fafc' }}>
                <strong>입찰 산출표 미리보기</strong>
                <div>저장명: {selectedBid.title}</div>
                <div>단지명: {selectedBid.apartmentName || '-'}</div>
                <div>기준월/입찰일: {selectedBid.bidDate || selectedBid.baseMonth || '-'}</div>
                <div>입찰가액: {formatCurrency(selectedBid.summary?.bidAmount ?? 0)}</div>
                <div>월간 위탁 총계: {formatCurrency(selectedBid.summary?.monthlyTrustTotal ?? 0)}</div>
                <div>인원 수: {selectedBid.summary?.activeRoleCount ?? 0}명</div>
                <div>저장일: {formatDate(selectedBid.savedAt)}</div>
                {selectedBid.updatedAt && <div>수정일: {formatDate(selectedBid.updatedAt)}</div>}
              </div>
            )}
          </div>
        )}

        <p style={{ marginTop: '12px', marginBottom: 0, fontSize: '12px', color: '#667085', lineHeight: 1.6 }}>
          선택한 저장본은 월간 리포트 본문에 참고 데이터로 포함됩니다. 원본 저장본은 수정되지 않습니다.
        </p>
      </Card>

      <AIResultPanel
        title="생성된 월간 리포트"
        taskType="monthlyReport"
        sourcePage="monthly-report"
        loading={aiLoading}
        loadingText="AI가 월간 운영 데이터를 분석 중입니다."
        error={aiError}
        result={reportData.generatedReport}
        downloadFileName={`monthly-report-${reportData.reportMonth || currentMonth}.txt`}
        onClear={() => onChange({ generatedReport: '' })}
        onLoadSaved={(content) => onChange({ generatedReport: content })}
        showHistory
        {...(projectId ? { projectId } : {})}
        {...(projectName ? { projectName } : {})}
      />
    </div>
  )
}

export default MonthlyReport
