import { AppState, CommunityData, CommunityProject, EstimateSheet, TenderNotice } from '../types/CommunityData'

const LOCAL_STORAGE_KEY = 'apartmentCommunityData' // Legacy key
const PROJECTS_STORAGE_KEY = 'communityAiProjects'
const TENDER_STORAGE_KEYS = ['tenderNotices', 'bidNotices']
const ESTIMATE_STORAGE_KEY = 'estimateSheets'

// Load projects with migration support
export function loadProjects(): AppState | null {
  try {
    // Try new key first
    const rawValue = window.localStorage.getItem(PROJECTS_STORAGE_KEY)
    if (rawValue) {
      const parsed = JSON.parse(rawValue) as AppState
      if (parsed.projects && Array.isArray(parsed.projects) && parsed.activeProjectId) {
        return parsed
      }
    }

    // Migration: check for legacy key
    const legacyValue = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (legacyValue) {
      const legacyData = JSON.parse(legacyValue) as CommunityData
      const migratedState = migrateToProjects(legacyData)
      saveProjects(migratedState)
      return migratedState
    }

    return null
  } catch {
    return null
  }
}

// Migrate old single CommunityData to new projects structure
function migrateToProjects(legacyData: CommunityData): AppState {
  const now = new Date().toISOString()
  const projectName = legacyData.apartmentInfo.name || '기본 단지'
  const projectId = 'project-' + Date.now()

  const project: CommunityProject = {
    id: projectId,
    name: projectName,
    address: legacyData.apartmentInfo.region,
    householdCount: legacyData.apartmentInfo.totalUnits,
    managementCompany: legacyData.apartmentInfo.officeName,
    memo: legacyData.apartmentInfo.remarks,
    createdAt: now,
    updatedAt: now,
    data: legacyData,
  }

  return {
    projects: [project],
    activeProjectId: projectId,
  }
}

export function saveProjects(state: AppState): void {
  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(state))
}

export function clearProjects(): void {
  window.localStorage.removeItem(PROJECTS_STORAGE_KEY)
  window.localStorage.removeItem(LOCAL_STORAGE_KEY) // Also clear legacy
}

// Legacy functions (kept for backward compatibility in pages that might use them)
export function loadCommunityData(): CommunityData | null {
  const state = loadProjects()
  if (!state || !state.projects.length) return null
  const activeProject = state.projects.find(p => p.id === state.activeProjectId)
  return activeProject?.data ?? null
}

export function saveCommunityData(data: CommunityData): void {
  const state = loadProjects()
  if (!state || !state.projects.length) return
  const updatedProjects = state.projects.map(p =>
    p.id === state.activeProjectId ? { ...p, data, updatedAt: new Date().toISOString() } : p
  )
  saveProjects({ ...state, projects: updatedProjects })
}

export function clearCommunityData(): void {
  clearProjects()
}

export function loadTenderNotices(): TenderNotice[] {
  try {
    for (const key of TENDER_STORAGE_KEYS) {
      const rawValue = window.localStorage.getItem(key)
      if (!rawValue) continue
      const parsed = JSON.parse(rawValue)
      if (Array.isArray(parsed)) {
        return parsed as TenderNotice[]
      }
    }
  } catch {
    // Ignore invalid data
  }
  return []
}

export function loadEstimateSheets(): EstimateSheet[] {
  try {
    const rawValue = window.localStorage.getItem(ESTIMATE_STORAGE_KEY)
    if (!rawValue) return []
    const parsed = JSON.parse(rawValue)
    if (Array.isArray(parsed)) {
      return parsed as EstimateSheet[]
    }
  } catch {
    // Ignore invalid data
  }
  return []
}

export function saveEstimateSheets(sheets: EstimateSheet[]): void {
  window.localStorage.setItem(ESTIMATE_STORAGE_KEY, JSON.stringify(sheets))
}

export function clearEstimateSheets(): void {
  window.localStorage.removeItem(ESTIMATE_STORAGE_KEY)
}

// ===== AI 결과 저장 이력 =====
const AI_RESULTS_STORAGE_KEY = 'aiResultHistory'

export interface AiResultEntry {
  id: string
  title: string
  taskType: string
  createdAt: string
  content: string
  // ─── 메타데이터(모두 optional, 기존 데이터 하위 호환) ────────────────────────
  // 기존 aiResultHistory 항목(이 필드들이 없는 구버전)은 그대로 작동해야 한다.
  status?: 'success' | 'error'
  provider?: string
  prompt?: string
  error?: string
  sourcePage?: string
  meta?: Record<string, unknown>
  // 단지(프로젝트) 식별자 — 옵셔널, 하위호환. 미지정 시 'default' (legacy).
  // AiResultHistoryPage가 현재 단지에 해당하는 항목만 필터링해 표시한다.
  projectId?: string
  projectName?: string
}

export function loadAiResults(): AiResultEntry[] {
  try {
    const raw = window.localStorage.getItem(AI_RESULTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AiResultEntry[]) : []
  } catch {
    return []
  }
}

// prompt 등 사용자 입력은 길어질 수 있어 저장 전 안전한 길이로 자른다(개인정보 누출 방지·용량 보호).
const MAX_PROMPT_LEN = 2000
const safeString = (v: unknown, max = MAX_PROMPT_LEN): string | undefined => {
  if (v === undefined || v === null) return undefined
  const s = typeof v === 'string' ? v : String(v)
  if (!s.trim()) return undefined
  return s.length > max ? s.slice(0, max) + '…(잘림)' : s
}

export interface SaveAiResultInput {
  title: string
  taskType: string
  content: string
  // 모두 optional — 기존 호출부가 그대로 동작
  status?: 'success' | 'error'
  provider?: string
  prompt?: string
  error?: string
  sourcePage?: string
  meta?: Record<string, unknown>
  // 현재 선택 단지(프로젝트) 식별자/이름 (옵셔널, 하위호환).
  // 미지정 시 'default'로 저장되어 AiResultHistoryPage에서 default 단지 필터에만 노출.
  projectId?: string
  projectName?: string
}

export function saveAiResult(entry: SaveAiResultInput): AiResultEntry {
  // 상태가 명시되지 않은 경우 안전한 추론:
  // - error가 있으면 'error', content가 있으면 'success', 둘 다 없으면 'success'(기존 호환).
  const inferredStatus: 'success' | 'error' =
    entry.status ?? (entry.error ? 'error' : 'success')
  const full: AiResultEntry = {
    id: 'ai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    title: entry.title,
    taskType: entry.taskType,
    createdAt: new Date().toISOString(),
    content: entry.content,
    status: inferredStatus,
    ...(entry.provider ? { provider: entry.provider } : {}),
    ...(safeString(entry.prompt) ? { prompt: safeString(entry.prompt) } : {}),
    ...(safeString(entry.error, 1000) ? { error: safeString(entry.error, 1000) } : {}),
    ...(entry.sourcePage ? { sourcePage: entry.sourcePage } : {}),
    ...(entry.meta ? { meta: entry.meta } : {}),
    ...(entry.projectId ? { projectId: entry.projectId } : {}),
    ...(entry.projectName ? { projectName: entry.projectName } : {}),
  }
  const next = [full, ...loadAiResults()].slice(0, 100) // 최대 100개 보관
  window.localStorage.setItem(AI_RESULTS_STORAGE_KEY, JSON.stringify(next))
  return full
}

export function deleteAiResult(id: string): void {
  const list = loadAiResults().filter((e) => e.id !== id)
  window.localStorage.setItem(AI_RESULTS_STORAGE_KEY, JSON.stringify(list))
}

/**
 * AI 호출 실패 시 오류 이력을 안전하게 저장한다.
 * - 내부에서 try/catch로 감싸므로 호출부 UX를 절대 깨뜨리지 않는다(저장 실패 시 console.warn).
 * - content는 빈 문자열, status는 'error'로 고정. prompt/error는 safeString으로 길이 제한.
 * - 호출부는 prompt에 API Key/.env/원문 전체/저장본 raw JSON/직원 개인정보를 넣지 않도록 책임진다.
 */
export function saveAiErrorResult(input: {
  title: string
  taskType: string
  error: string
  prompt?: string
  sourcePage?: string
  provider?: string
  meta?: Record<string, unknown>
}): void {
  try {
    saveAiResult({
      title: input.title,
      taskType: input.taskType,
      content: '',
      status: 'error',
      provider: input.provider || 'netlify',
      ...(input.prompt ? { prompt: input.prompt } : {}),
      error: input.error,
      ...(input.sourcePage ? { sourcePage: input.sourcePage } : {}),
      ...(input.meta ? { meta: input.meta } : {}),
    })
  } catch (e) {
    // 이력 저장이 실패해도 AI 호출 UX는 유지한다. 콘솔 경고만 남긴다.
    console.warn('[saveAiErrorResult] failed to persist error history:', e)
  }
}
