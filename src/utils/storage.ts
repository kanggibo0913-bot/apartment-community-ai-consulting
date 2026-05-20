import { CommunityData, EstimateSheet, TenderNotice } from '../types/CommunityData'

const LOCAL_STORAGE_KEY = 'apartmentCommunityData'
const TENDER_STORAGE_KEYS = ['tenderNotices', 'bidNotices']
const ESTIMATE_STORAGE_KEY = 'estimateSheets'

export function loadCommunityData(): CommunityData | null {
  try {
    const rawValue = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!rawValue) return null
    return JSON.parse(rawValue) as CommunityData
  } catch {
    return null
  }
}

export function saveCommunityData(data: CommunityData): void {
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data))
}

export function clearCommunityData(): void {
  window.localStorage.removeItem(LOCAL_STORAGE_KEY)
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
