import { useMemo } from 'react'
import { decodeReport } from '../utils/publishedReport'
import './PublicReportView.css'

interface PublicReportViewProps {
  encoded: string
}

const PublicReportView: React.FC<PublicReportViewProps> = ({ encoded }) => {
  const report = useMemo(() => decodeReport(encoded), [encoded])

  // 현재는 브라우저 기본 인쇄 기능(window.print)으로 PDF 저장/인쇄를 대응한다.
  // 추후 서버 저장 방식 또는 PDF 생성 라이브러리(jsPDF 등) 도입 시 실제 PDF 파일 생성으로 확장 가능.
  const handlePrint = () => window.print()

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
        <div className="public-report-actions no-print">
          <button type="button" onClick={handlePrint}>PDF 저장 / 인쇄</button>
        </div>
        <header className="public-report-head">
          <p className="public-report-kicker">입주민 안내 보고서</p>
          <h1>{report.title || report.apartmentName || '커뮤니티센터'}</h1>
          <div className="public-report-meta">
            {report.title && report.apartmentName && <span>{report.apartmentName}</span>}
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
          본 보고서는 입주민 안내를 목적으로 공개된 요약 자료입니다.
        </footer>
      </div>
    </div>
  )
}

export default PublicReportView
