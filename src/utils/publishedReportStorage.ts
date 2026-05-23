import { PublishedReport } from './publishedReport'

// 입주민 공개 보고서 발행 이력 저장소.
// 저장 데이터는 반드시 PublishedReport(위생처리됨) 기준 필드만 담는다.
// 원본 AI 본문, CommunityData 전체, 매출/수익/인건비/계약금액/개인정보/내부 메모는 절대 저장하지 않는다.
//
// ⚠️ 한계: 현재 공개 링크는 URL 해시(#/report/<encoded>)에 데이터가 들어있는 방식이라,
// 이미 공유·복사된 링크는 서버에서 차단할 수 없다. 따라서 아래 "공개 중지(disabled)"와
// "삭제"는 내부 관리용 표시일 뿐, 이미 배포된 URL 자체를 무효화하지는 못한다.
// 실사용 단계에서는 서버 저장(예: Netlify Blobs/DB) + 서버측 shareId 차단 방식으로 전환해야 한다.
const STORAGE_KEY = 'publishedResidentReports'

export type PublishedStatus = 'published' | 'disabled'

export interface StoredPublishedReport {
  id: string
  shareId: string
  apartmentName: string
  reportMonth: string
  publishedAt: string
  title: string
  sections: { title: string; body: string }[]
  encodedUrl: string
  status: PublishedStatus
}

export function loadPublishedReports(): StoredPublishedReport[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StoredPublishedReport[]) : []
  } catch {
    return []
  }
}

function persist(list: StoredPublishedReport[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

// PublishedReport(위생처리됨)에서만 발행 이력 레코드를 구성한다.
export function savePublishedReport(report: PublishedReport, encodedUrl: string): StoredPublishedReport {
  const list = loadPublishedReports()
  // 동일 링크 중복 저장 방지
  const existing = list.find((r) => r.encodedUrl === encodedUrl)
  if (existing) return existing

  const record: StoredPublishedReport = {
    id: 'pub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    shareId: Math.random().toString(36).slice(2, 10),
    apartmentName: report.apartmentName,
    reportMonth: report.reportMonth,
    publishedAt: report.publishedAt,
    title: `${report.apartmentName || '입주민 공개 보고서'}${report.reportMonth ? ` (${report.reportMonth})` : ''}`,
    sections: report.sections.map((s) => ({ title: s.title, body: s.body })),
    encodedUrl,
    status: 'published',
  }
  persist([record, ...list].slice(0, 200))
  return record
}

// 공개 중지/재개. ⚠️ 이미 공유된 URL 자체는 차단되지 않으며 내부 표시만 바뀐다.
export function updatePublishedReportStatus(id: string, status: PublishedStatus): void {
  persist(loadPublishedReports().map((r) => (r.id === id ? { ...r, status } : r)))
}

// 발행 이력에서 제거. ⚠️ 삭제해도 이미 복사·공유된 URL 자체는 무효화되지 않는다.
export function deletePublishedReport(id: string): void {
  persist(loadPublishedReports().filter((r) => r.id !== id))
}
