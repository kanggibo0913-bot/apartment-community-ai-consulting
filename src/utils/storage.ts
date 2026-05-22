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
