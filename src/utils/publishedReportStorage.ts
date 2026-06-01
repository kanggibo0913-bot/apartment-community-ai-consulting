import { PublishedReport } from './publishedReport'
import { loadProjectScoped, saveProjectScoped } from './projectScopedStorage'

// 입주민 공개 보고서 발행 이력 저장소.
// 저장 데이터는 반드시 PublishedReport(위생처리됨) 기준 필드만 담는다.
// 원본 AI 본문, CommunityData 전체, 매출/수익/인건비/계약금액/개인정보/내부 메모는 절대 저장하지 않는다.
//
// ⚠️ 한계: 현재 공개 링크는 URL 해시(#/report/<encoded>)에 데이터가 들어있는 방식이라,
// 이미 공유·복사된 링크는 서버에서 차단할 수 없다. 따라서 아래 "공개 중지(disabled)"와
// "삭제"는 내부 관리용 표시일 뿐, 이미 배포된 URL 자체를 무효화하지는 못한다.
//
// 단지별 분리:
//   기존 전역 key 'publishedResidentReports'는 그대로 두고(legacy 보존),
//   새 byProject key 'publishedResidentReportsByProject'에 { [projectId]: StoredPublishedReport[] }로 저장한다.
//   모든 함수는 optional projectId를 받는다. 미지정시 'default' 슬롯에 저장된다.
const STORAGE_KEY = 'publishedResidentReports'
const STORAGE_KEY_BY_PROJECT = 'publishedResidentReportsByProject'

const loadAll = (projectId?: string): StoredPublishedReport[] => {
  const arr = loadProjectScoped<StoredPublishedReport[] | null>(
    STORAGE_KEY,
    STORAGE_KEY_BY_PROJECT,
    projectId,
    null,
  )
  return Array.isArray(arr) ? arr : []
}

const saveAll = (list: StoredPublishedReport[], projectId?: string) => {
  saveProjectScoped(STORAGE_KEY_BY_PROJECT, projectId, list)
}

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
  // 발행 출처(옵셔널, 하위호환). 예: 'residentNoticeReport' + 원본 보고서 id
  sourceType?: string
  sourceReportId?: string
  // 기존 공개본 갱신(재발행) 시각(옵셔널, 하위호환)
  republishedAt?: string
}

// 모든 함수는 optional projectId를 받아 단지별 슬롯을 조작한다.
// projectId 미지정 시 'default' 슬롯 (projectScopedStorage가 처리).
export function loadPublishedReports(projectId?: string): StoredPublishedReport[] {
  return loadAll(projectId)
}

// PublishedReport(위생처리됨)에서만 발행 이력 레코드를 구성한다.
export function savePublishedReport(
  report: PublishedReport,
  encodedUrl: string,
  meta?: { sourceType?: string; sourceReportId?: string },
  projectId?: string,
): StoredPublishedReport {
  const list = loadAll(projectId)
  // 동일 링크 중복 저장 방지
  const existing = list.find((r) => r.encodedUrl === encodedUrl)
  if (existing) return existing

  const fallbackTitle = `${report.apartmentName || '입주민 공개 보고서'}${report.reportMonth ? ` (${report.reportMonth})` : ''}`
  const record: StoredPublishedReport = {
    id: 'pub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    shareId: Math.random().toString(36).slice(2, 10),
    apartmentName: report.apartmentName,
    reportMonth: report.reportMonth,
    publishedAt: report.publishedAt,
    title: report.title?.trim() || fallbackTitle,
    sections: report.sections.map((s) => ({ title: s.title, body: s.body })),
    encodedUrl,
    status: 'published',
    ...(meta?.sourceType ? { sourceType: meta.sourceType } : {}),
    ...(meta?.sourceReportId ? { sourceReportId: meta.sourceReportId } : {}),
  }
  saveAll([record, ...list].slice(0, 200), projectId)
  return record
}

// 공개 중지/재개. ⚠️ 이미 공유된 URL 자체는 차단되지 않으며 내부 표시만 바뀐다.
export function updatePublishedReportStatus(id: string, status: PublishedStatus, projectId?: string): void {
  saveAll(loadAll(projectId).map((r) => (r.id === id ? { ...r, status } : r)), projectId)
}

// 발행 이력에서 제거. ⚠️ 삭제해도 이미 복사·공유된 URL 자체는 무효화되지 않는다.
export function deletePublishedReport(id: string, projectId?: string): void {
  saveAll(loadAll(projectId).filter((r) => r.id !== id), projectId)
}

// 출처 기준으로 기존 발행본 조회 (최신순)
export function findPublishedBySource(sourceType: string, sourceReportId: string, projectId?: string): StoredPublishedReport[] {
  return loadAll(projectId).filter((r) => r.sourceType === sourceType && r.sourceReportId === sourceReportId)
}

// 기존 발행본 갱신(재발행). id/shareId/publishedAt/source/status는 유지하고
// 공개 내용(섹션)·링크만 새로 반영하며 republishedAt을 기록한다.
export function updatePublishedReport(id: string, report: PublishedReport, encodedUrl: string, projectId?: string): StoredPublishedReport | null {
  const list = loadAll(projectId)
  let updated: StoredPublishedReport | null = null
  const next = list.map((r) => {
    if (r.id !== id) return r
    updated = {
      ...r,
      apartmentName: report.apartmentName,
      reportMonth: report.reportMonth,
      title: report.title?.trim() || r.title,
      sections: report.sections.map((s) => ({ title: s.title, body: s.body })),
      encodedUrl,
      republishedAt: new Date().toISOString(),
    }
    return updated
  })
  if (updated) saveAll(next, projectId)
  return updated
}
