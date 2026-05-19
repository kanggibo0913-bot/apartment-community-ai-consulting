import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import Button from '../components/Button'
import { CommunityData, OutputType, OutputSection, PptSlide } from '../types/CommunityData'
import { generateReportDraft } from '../utils/generateReportDraft'
import { generateMonthlyReport } from '../utils/generateMonthlyReport'
import { generateProposalDraft } from '../utils/generateProposalDraft'
import { generatePptOutline } from '../utils/generatePptOutline'
import './Pages.css'

interface ReportDraftProps {
  data: CommunityData
  defaultOutputType?: OutputType
}

const tabs: OutputType[] = [
  '운영 진단 보고서',
  '월간 운영 리포트',
  '입대의 보고용 제안서',
  'PPT 초안',
]

const ReportDraft: React.FC<ReportDraftProps> = ({ data, defaultOutputType = '운영 진단 보고서' }) => {
  const [activeTab, setActiveTab] = useState<OutputType>(defaultOutputType)
  const [copyStatus, setCopyStatus] = useState('')
  const [sectionCopyStatus, setSectionCopyStatus] = useState<Record<string, string>>({})
  const [slideCopyStatus, setSlideCopyStatus] = useState<Record<number, string>>({})
  const [printView, setPrintView] = useState(false)

  const reportDraft = generateReportDraft(data)
  const monthlyReport = generateMonthlyReport(data)
  const proposalDraft = generateProposalDraft(data)
  const pptOutline = generatePptOutline(data)

  useEffect(() => {
    setActiveTab(defaultOutputType)
  }, [defaultOutputType])

  const handleCopyFull = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('전체 텍스트가 복사되었습니다.')
      setTimeout(() => setCopyStatus(''), 3000)
    } catch {
      setCopyStatus('클립보드 복사에 실패했습니다. 브라우저 권한을 확인하세요.')
    }
  }

  const handleCopySection = async (section: OutputSection) => {
    try {
      await navigator.clipboard.writeText(section.body.join('\n'))
      setSectionCopyStatus(prev => ({ ...prev, [section.title]: '섹션 복사가 완료되었습니다.' }))
      setTimeout(() => setSectionCopyStatus(prev => ({ ...prev, [section.title]: '' })), 3000)
    } catch {
      setSectionCopyStatus(prev => ({ ...prev, [section.title]: '복사에 실패했습니다.' }))
      setTimeout(() => setSectionCopyStatus(prev => ({ ...prev, [section.title]: '' })), 3000)
    }
  }

  const handleCopySlide = async (slide: PptSlide) => {
    try {
      const slideText = [
        `${slide.slideNumber}. ${slide.title}`,
        slide.keyMessage,
        ...slide.bulletPoints,
        `시각화 제안: ${slide.visualSuggestion}`,
        `메모: ${slide.speakerNote}`,
      ].join('\n')
      await navigator.clipboard.writeText(slideText)
      setSlideCopyStatus(prev => ({ ...prev, [slide.slideNumber]: '슬라이드가 복사되었습니다.' }))
      setTimeout(() => setSlideCopyStatus(prev => ({ ...prev, [slide.slideNumber]: '' })), 3000)
    } catch {
      setSlideCopyStatus(prev => ({ ...prev, [slide.slideNumber]: '복사에 실패했습니다.' }))
      setTimeout(() => setSlideCopyStatus(prev => ({ ...prev, [slide.slideNumber]: '' })), 3000)
    }
  }

  const renderValueSection = (section: OutputSection) => (
    <Card key={section.title} title={section.title} className="report-section-card">
      <div className="report-section-header">
        <Button variant="secondary" type="button" onClick={() => handleCopySection(section)}>
          섹션 복사
        </Button>
        {sectionCopyStatus[section.title] && <span className="copy-status">{sectionCopyStatus[section.title]}</span>}
      </div>
      <div className="report-section-body">
        {section.body.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </Card>
  )

  const renderReportContent = () => (
    <>
      <Card title="보고서 생성 정보">
        <div className="report-meta">
          <span>생성일: {reportDraft.generatedAt}</span>
          <span>출력물: 운영 진단 보고서</span>
        </div>
      </Card>

      {reportDraft.needsInputNote && (
        <Card title="입력 상태">
          <p style={{ color: '#8a1c1c', margin: 0 }}>{reportDraft.needsInputNote}</p>
        </Card>
      )}

      <Card title="복사하기">
        <div className="report-action-row">
          <Button variant="primary" type="button" onClick={() => handleCopyFull(reportDraft.fullText)}>
            전체 복사
          </Button>
          {copyStatus && <span className="copy-status">{copyStatus}</span>}
        </div>
      </Card>

      {reportDraft.sections.map(section => renderValueSection(section))}

      <Card title="MIK 검수 필요 항목">
        <ul className="report-review-list">
          {reportDraft.reviewItems.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </Card>
    </>
  )

  const renderMonthlyReport = () => (
    <>
      <Card title="월간 운영 리포트 정보">
        <div className="report-meta">
          <span>생성일: {monthlyReport.generatedAt}</span>
          <span>출력물: 월간 운영 리포트</span>
        </div>
      </Card>
      <Card title="복사하기">
        <div className="report-action-row">
          <Button variant="primary" type="button" onClick={() => handleCopyFull(monthlyReport.fullText)}>
            전체 복사
          </Button>
          {copyStatus && <span className="copy-status">{copyStatus}</span>}
        </div>
      </Card>
      {monthlyReport.sections.map(section => renderValueSection(section))}
      <Card title="MIK 검수 필요 항목">
        <ul className="report-review-list">
          {monthlyReport.reviewItems.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </Card>
    </>
  )

  const renderProposalDraft = () => (
    <>
      <Card title="제안서 초안 정보">
        <div className="report-meta">
          <span>생성일: {proposalDraft.generatedAt}</span>
          <span>출력물: 입대의 보고용 제안서</span>
        </div>
      </Card>
      <Card title="복사하기">
        <div className="report-action-row">
          <Button variant="primary" type="button" onClick={() => handleCopyFull(proposalDraft.fullText)}>
            전체 복사
          </Button>
          {copyStatus && <span className="copy-status">{copyStatus}</span>}
        </div>
      </Card>
      {proposalDraft.sections.map(section => renderValueSection(section))}
      <Card title="MIK 검수 필요 항목">
        <ul className="report-review-list">
          {proposalDraft.reviewItems.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </Card>
    </>
  )

  const renderPptOutline = () => (
    <>
      <Card title="PPT 초안 정보">
        <div className="report-meta">
          <span>생성일: {pptOutline.generatedAt}</span>
          <span>출력물: PPT 초안</span>
        </div>
      </Card>
      <Card title="복사하기">
        <div className="report-action-row">
          <Button variant="primary" type="button" onClick={() => handleCopyFull(pptOutline.fullText)}>
            전체 복사
          </Button>
          {copyStatus && <span className="copy-status">{copyStatus}</span>}
        </div>
      </Card>
      {pptOutline.slides.map(slide => (
        <Card key={slide.slideNumber} title={`슬라이드 ${slide.slideNumber}: ${slide.title}`} className="report-section-card">
          <div className="report-section-header">
            <Button variant="secondary" type="button" onClick={() => handleCopySlide(slide)}>
              슬라이드 복사
            </Button>
            {slideCopyStatus[slide.slideNumber] && <span className="copy-status">{slideCopyStatus[slide.slideNumber]}</span>}
          </div>
          <div className="report-section-body">
            <p><strong>핵심 메시지:</strong> {slide.keyMessage}</p>
            <p><strong>시각화 제안:</strong> {slide.visualSuggestion}</p>
            <p><strong>발표 메모:</strong> {slide.speakerNote}</p>
            <ul>
              {slide.bulletPoints.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          </div>
        </Card>
      ))}
    </>
  )

  const renderContent = () => {
    switch (activeTab) {
      case '월간 운영 리포트':
        return renderMonthlyReport()
      case '입대의 보고용 제안서':
        return renderProposalDraft()
      case 'PPT 초안':
        return renderPptOutline()
      default:
        return renderReportContent()
    }
  }

  return (
    <div className={`page ${printView ? 'print-view' : ''}`}>
      <PageHeader
        title="출력물 초안"
        description="실무 활용이 가능한 출력물 초안을 다양한 형태로 생성하고 복사할 수 있습니다."
      />

      <Card title="출력물 선택">
        <div className="output-tabs">
          {tabs.map(tab => (
            <button
              key={tab}
              type="button"
              className={`tab-item ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="report-action-row">
          <Button variant="secondary" type="button" onClick={() => setPrintView(prev => !prev)}>
            {printView ? '일반 보기로 전환' : '출력용 보기로 전환'}
          </Button>
          <span className="copy-status">MIK 검수 전 초안입니다.</span>
        </div>
      </Card>

      {renderContent()}
    </div>
  )
}

export default ReportDraft
