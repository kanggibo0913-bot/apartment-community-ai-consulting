import { useMemo } from 'react'
import { decodeReport } from '../utils/publishedReport'
import './PublicReportView.css'

interface PublicReportViewProps {
  encoded: string
}

const PublicReportView: React.FC<PublicReportViewProps> = ({ encoded }) => {
  const report = useMemo(() => decodeReport(encoded), [encoded])

  if (!report) {
    return (
      <div className="public-report-wrap">
        <div className="public-report-card public-report-error">
          <h1>보고서를 열 수 없습니다</h1>
          <p>링크가 올바르지 않거나 손상되었습니다. 보고서 발행자에게 링크를 다시 요청해 주세요.</p>
        </div>
      </div>
    )
  }

  const publishedAt = report.publishedAt ? new Date(report.publishedAt).toLocaleString('ko-KR') : ''

  return (
    <div className="public-report-wrap">
      <div className="public-report-card">
        <header className="public-report-head">
          <p className="public-report-kicker">입주민 안내 보고서</p>
          <h1>{report.apartmentName || '커뮤니티센터'}</h1>
          <div className="public-report-meta">
            {report.reportMonth && <span>보고 월: {report.reportMonth}</span>}
            {publishedAt && <span>발행일: {publishedAt}</span>}
          </div>
        </header>

        {report.sections.length === 0 ? (
          <p className="public-report-empty">표시할 안내 내용이 없습니다.</p>
        ) : (
          report.sections.map((section, idx) => (
            <section key={idx} className="public-report-section">
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))
        )}

        <footer className="public-report-footer">
          본 안내문은 입주민 공개용으로 발행되었습니다.
        </footer>
      </div>
    </div>
  )
}

export default PublicReportView
