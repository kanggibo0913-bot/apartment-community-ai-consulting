// 현장 운영 데이터 단지별 분리 저장 헬퍼.
//
// 원칙:
//   - 기존 전역 key(예: 'maintenanceRecords')는 삭제하지 않고 그대로 둔다.
//   - 새 byProject key(예: 'maintenanceRecordsByProject')는 { [projectId]: T } 구조.
//   - 신규 저장은 항상 byProject key 안의 현재 projectId 슬롯에 쓴다.
//   - 최초 로드 시 byProject 슬롯이 비어 있고 전역 key에 데이터가 있으면
//     **현재 projectId에 1회 복사**(soft migration). 전역 key는 그대로 유지해
//     이후 다른 단지로 이동하면 빈 상태로 시작한다(legacy 1회 흡수 정책).
//     "1회"는 globalKey/byProjectKey 조합 기준 — 메타 키에 흡수 완료를 기록해
//     이후 어떤 단지가 처음 진입해도 legacy fallback이 다시 발동하지 않는다.
//   - projectId가 없으면 'default' 단지로 처리.
//
// 사용 예:
//   const initial = loadProjectScoped<MaintenanceRecord[]>(
//     'maintenanceRecords', 'maintenanceRecordsByProject', projectId, []
//   )
//   saveProjectScoped('maintenanceRecordsByProject', projectId, records)

export const DEFAULT_PROJECT_ID = 'default'

// legacy 전역 → byProject 1회 흡수 여부를 byProjectKey 단위로 기록하는 로컬 전용 메타.
// 단일 localStorage key에 { [byProjectKey]: true } 구조로 누적해 키 개수를 늘리지 않는다.
// 이 key는 SystemDataSyncPage(SYNC_GROUPS)와 netlify/functions/app-state.ts(ALLOWED_KEYS)
// 양쪽 화이트리스트에 의도적으로 등록하지 않아 Supabase 동기화 대상에서 자동 제외된다.
// 단지별 흡수 정책은 클라이언트 로컬 1회 마이그레이션 표식이므로 클라우드와 공유할 필요가 없다.
const LEGACY_MIGRATION_META_KEY = 'projectScopedLegacyMigration'

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

// ─── legacy fallback 1회 정책용 메타 헬퍼 ─────────────────────────────────────
// byProjectKey 단위로 fallback 수행 여부를 기록한다. 한 번 true가 되면
// 어떤 단지가 처음 진입해도 같은 byProjectKey에 대한 legacy fallback은 다시 일어나지 않는다.
const readMigrationMap = (): Record<string, boolean> => {
  const parsed = safeParse<Record<string, boolean>>(window.localStorage.getItem(LEGACY_MIGRATION_META_KEY))
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  return {}
}

const hasLegacyMigrated = (byProjectKey: string): boolean => !!readMigrationMap()[byProjectKey]

const markLegacyMigrated = (byProjectKey: string): void => {
  const map = readMigrationMap()
  map[byProjectKey] = true
  window.localStorage.setItem(LEGACY_MIGRATION_META_KEY, JSON.stringify(map))
}

// 1회 fallback 복사용 — 전역 key에 데이터가 있으면 현재 projectId 슬롯에 옮긴다.
// 단, 전역 key 자체는 삭제하지 않는다(이미 흡수 완료된 후에도 백업 및 진단용으로 보존).
//
// 정책:
//   1) byProject에 해당 projectId 슬롯이 이미 있으면 그대로 반환(메타 무관).
//   2) 슬롯이 없을 때만 legacy fallback을 시도하되, 해당 byProjectKey에 대해
//      이미 흡수가 끝났음(메타 true)이면 fallback 건너뛰고 빈 fallback 반환.
//   3) 메타가 비어 있고 legacy 전역 key에 실제 데이터가 있을 때만 흡수 + 메타 표시.
//      legacy가 비어 있으면 메타도 표시하지 않아, 이후 legacy가 채워질 경우
//      그때 처음 진입한 단지가 흡수할 수 있도록 일관성을 유지한다.
export function loadProjectScoped<T>(
  globalKey: string,
  byProjectKey: string,
  projectId: string | undefined,
  fallback: T,
): T {
  const id = normalizeProjectId(projectId)
  const map = readMap<T>(byProjectKey)
  // 1) 슬롯 우선
  if (id in map) return map[id]

  // 2) 이미 다른 단지가 legacy를 흡수했으면 fallback 차단 → 빈 fallback 반환
  if (hasLegacyMigrated(byProjectKey)) return fallback

  // 3) 첫 흡수 후보 — 전역 key에 데이터가 있을 때만 1회 복사
  const globalParsed = safeParse<T>(window.localStorage.getItem(globalKey))
  if (globalParsed !== null) {
    map[id] = globalParsed
    writeMap(byProjectKey, map)
    markLegacyMigrated(byProjectKey)
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
