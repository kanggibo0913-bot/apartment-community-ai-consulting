// 현장 운영 데이터 단지별 분리 저장 헬퍼.
//
// 원칙:
//   - 기존 전역 key(예: 'maintenanceRecords')는 삭제하지 않고 그대로 둔다.
//   - 새 byProject key(예: 'maintenanceRecordsByProject')는 { [projectId]: T } 구조.
//   - 신규 저장은 항상 byProject key 안의 현재 projectId 슬롯에 쓴다.
//   - 최초 로드 시 byProject 슬롯이 비어 있고 전역 key에 데이터가 있으면
//     **현재 projectId에 1회 복사**(soft migration). 전역 key는 그대로 유지해
//     여러 단지 사용자가 이후 다른 단지로 이동하면 빈 상태로 보이게 된다(의도).
//   - projectId가 없으면 'default' 단지로 처리.
//
// 사용 예:
//   const initial = loadProjectScoped<MaintenanceRecord[]>(
//     'maintenanceRecords', 'maintenanceRecordsByProject', projectId, []
//   )
//   saveProjectScoped('maintenanceRecordsByProject', projectId, records)

export const DEFAULT_PROJECT_ID = 'default'

const normalizeProjectId = (raw?: string): string => {
  const v = (raw || '').trim()
  return v || DEFAULT_PROJECT_ID
}

const safeParse = <T>(raw: string | null): T | null => {
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// byProject 객체 전체 읽기. 손상되어 있으면 빈 객체.
const readMap = <T>(byProjectKey: string): Record<string, T> => {
  const parsed = safeParse<Record<string, T>>(window.localStorage.getItem(byProjectKey))
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  return {}
}

const writeMap = <T>(byProjectKey: string, map: Record<string, T>): void => {
  window.localStorage.setItem(byProjectKey, JSON.stringify(map))
}

// 1회 fallback 복사용 — 전역 key에 데이터가 있으면 현재 projectId 슬롯에 옮긴다.
// 단, 전역 key 자체는 삭제하지 않는다(여러 단지 사용자의 데이터가 어느 단지 것인지
// 알 수 없으므로 현재 단지에만 매핑하고 원본은 보존).
export function loadProjectScoped<T>(
  globalKey: string,
  byProjectKey: string,
  projectId: string | undefined,
  fallback: T,
): T {
  const id = normalizeProjectId(projectId)
  const map = readMap<T>(byProjectKey)
  if (id in map) return map[id]

  // byProject에 슬롯이 없을 때만 전역 key fallback
  const globalParsed = safeParse<T>(window.localStorage.getItem(globalKey))
  if (globalParsed !== null) {
    map[id] = globalParsed
    writeMap(byProjectKey, map)
    return globalParsed
  }
  return fallback
}

// 신규/갱신 저장 — 항상 byProject key의 현재 projectId 슬롯에 쓴다.
// 전역 key는 건드리지 않는다(legacy 보존).
export function saveProjectScoped<T>(
  byProjectKey: string,
  projectId: string | undefined,
  value: T,
): void {
  const id = normalizeProjectId(projectId)
  const map = readMap<T>(byProjectKey)
  map[id] = value
  writeMap(byProjectKey, map)
}

// 현재 단지의 byProject 슬롯만 제거(테스트/관리용). 전역 key는 손대지 않음.
export function clearProjectScoped(byProjectKey: string, projectId: string | undefined): void {
  const id = normalizeProjectId(projectId)
  const map = readMap<unknown>(byProjectKey)
  if (id in map) {
    delete map[id]
    writeMap(byProjectKey, map as Record<string, unknown>)
  }
}

// ByProject 전체 key 목록 (Supabase 동기화/UI 진단용).
export const PROJECT_SCOPED_KEY_MAP = [
  { global: 'siteLaborCostData', byProject: 'siteLaborCostDataByProject', label: '현장 인건비 산출 입력값' },
  { global: 'siteLaborCostSnapshots', byProject: 'siteLaborCostSnapshotsByProject', label: '현장 인건비 저장본' },
  { global: 'siteLaborCalendarInputs', byProject: 'siteLaborCalendarInputsByProject', label: '현장 인건비 근무표' },
  { global: 'siteLaborPayrollDraft', byProject: 'siteLaborPayrollDraftByProject', label: '급여 초안 (기타수당/공제액)' },
  { global: 'maintenanceRecords', byProject: 'maintenanceRecordsByProject', label: '시설 보수 내역' },
  { global: 'residentNoticeReports', byProject: 'residentNoticeReportsByProject', label: '입주민 안내 보고서' },
  { global: 'publishedResidentReports', byProject: 'publishedResidentReportsByProject', label: '입주민 공개 발행본' },
  { global: 'aiResultHistory', byProject: 'aiResultHistoryByProject', label: 'AI 결과 이력' },
] as const

export type ProjectScopedKey = typeof PROJECT_SCOPED_KEY_MAP[number]['byProject']
