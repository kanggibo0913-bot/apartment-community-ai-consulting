import { useState } from 'react'
import { CommunityData, MonthlyReportData } from '../types/CommunityData'
import Button from '../components/Button'
import Card from '../components/Card'
import { callAiFunction } from '../utils/aiClient'
import './Pages.css'

interface MonthlyReportProps {
  data: CommunityData
  reportData: MonthlyReportData
  onChange: (next: Partial<MonthlyReportData>) => void
}

const MonthlyReport: React.FC<MonthlyReportProps> = ({ data, reportData, onChange }) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  const showMessage = (msg: string) => {
    setStatusMessage(msg)
    setTimeout(() => setStatusMessage(''), 5000)
  }

  const generateLocalReport = () => {
    setIsGenerating(true)

    // Collect relevant data
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

---
생성일시: ${new Date().toLocaleString('ko-KR')}`

    onChange({
      generatedReport: report,
    })
    showMessage('로컬 리포트가 생성되었습니다.')
    setIsGenerating(false)
  }

  const generateAiReport = async () => {
    setAiLoading(true)

    const payload = {
      apartmentName: data.apartmentInfo.name,
      totalUnits: data.apartmentInfo.totalUnits,
      managementCompany: data.apartmentInfo.officeName,
      reportMonth: reportData.reportMonth,
      summaryMemo: reportData.summaryMemo,
      facilities: data.facilityInfo.items.filter(f => f.enabled).map(f => f.name),
      revenueData: {
        membershipRevenue: data.revenueTarget.currentMembers * data.revenueTarget.avgMembershipPrice,
        ptForecast: data.revenueTarget.ptForecast,
        gxForecast: data.revenueTarget.gxForecast,
        monthlyTarget: data.revenueTarget.currentMonthTarget,
      },
      costData: {
        salaries: data.costInfo.salaries,
        electricity: data.costInfo.electricity,
        water: data.costInfo.water,
        hvac: data.costInfo.hvac,
      },
      laborCost: data.laborCost.employees.length,
      complaintCount: data.complaints.length,
      unresolvedComplaints: data.complaints.filter(c => c.status !== '완료').length,
      contractCount: data.contractManagement.contracts.length,
      expringContracts: data.contractManagement.contracts.filter(c => {
        const endDate = new Date(c.endDate)
        const today = new Date()
        const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return daysLeft > 0 && daysLeft <= 60
      }).length,
      keyIssues: reportData.keyIssues,
      improvementPlan: reportData.improvementPlan,
    }

    try {
      const result = await callAiFunction('monthlyReport', payload)
      if (result.success) {
        onChange({
          generatedReport: '[AI 월간 운영 리포트]\n\n' + (result.result || ''),
        })
        showMessage('AI 리포트 생성이 완료되었습니다.')
      } else {
        showMessage('AI 생성 중 오류가 발생했습니다: ' + (result.error || '알 수 없는 오류'))
      }
    } catch (error) {
      showMessage('AI 생성 중 오류가 발생했습니다.')
    }

    setAiLoading(false)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(reportData.generatedReport)
    showMessage('클립보드에 복사되었습니다.')
  }

  return (
    <div className="page">
      <Card>
        <h3 style={{ marginTop: 0 }}>월간 운영 리포트 생성</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div className="form-group">
            <label>보고 월</label>
            <input
              type="month"
              value={reportData.reportMonth}
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
          <Button
            onClick={generateLocalReport}
            disabled={isGenerating}
            className="btn-secondary"
          >
            {isGenerating ? '생성 중...' : '로컬 리포트 생성'}
          </Button>
          <Button
            onClick={generateAiReport}
            disabled={aiLoading}
            className="btn-primary"
          >
            {aiLoading ? 'AI 생성 중...' : 'AI 고도화'}
          </Button>
        </div>

        {statusMessage && (
          <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#e7f3ff', color: '#0066cc', borderRadius: '4px', fontSize: '14px' }}>
            {statusMessage}
          </div>
        )}
      </Card>

      {reportData.generatedReport && (
        <Card className="monthly-report-preview">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>생성된 리포트</h3>
            <Button onClick={copyToClipboard} className="btn-secondary btn-sm">
              📋 복사
            </Button>
          </div>

          <div className="report-preview">
            {reportData.generatedReport.split('\n').map((line, idx) => (
              <div key={idx} style={{ whiteSpace: 'pre-wrap', marginBottom: '4px' }}>
                {line}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

export default MonthlyReport
