// 클라우드 "불러오기" 시 로컬 데이터를 통째로 덮어쓰지 않고 안전하게 병합하는 순수 유틸.
//
// 배경(Phase B):
//   기존 "클라우드에서 불러오기"는 화이트리스트 key를 클라우드 값으로 무조건 덮어썼다.
//   communityAiProjects는 단지 전체가 하나의 blob이라, 다른 기기에서 일부만 작업한 뒤
//   불러오면 이쪽 기기에서 만든 단지/데이터가 통째로 사라질 수 있었다.
//   이 모듈은 key 종류별로 "더 최신 항목 우선" 병합을 수행해 로컬 손실을 막는다.
//
// 안전 원칙(이 모듈 전체에 일관 적용):
//   - 판단이 모호하면(타임스탬프 없음/동률/깨진 값) 항상 local을 보존한다. cloud는
//     "엄격히 더 최신"임이 증명될 때만 채택한다. → 로컬 데이터 손실을 구조적으로 차단.
//   - 한쪽에만 있는 항목(단지/슬롯/이력)은 절대 버리지 않고 합집합으로 보존한다.
//   - 어떤 입력이 와도(null/문자열/깨진 JSON) throw 하지 않는다. 호출부(불러오기)가 죽으면 안 된다.
//
// ⚠️ 이 모듈은 "순수"하게 유지한다(window/DOM/React/fetch 의존 금지). 그래야 단위 테스트가 쉽고,
//    호출부(SystemDataSyncPage)에서 부수효과 없이 값→값 변환으로만 쓸 수 있다.
//    (syncKeys.ts와 달리 이 모듈은 Netlify 함수가 import하지 않으므로 다른 src 모듈 import 자체는 허용되지만,
//     현재는 자체 완결로 두어 테스트 의존성을 최소화한다.)

// ─── 병합 대상 key 분류 ───────────────────────────────────────────────────────
// communityAiProjects: 단지 배열을 project.id 단위로 병합.
export const COMMUNITY_AI_PROJECTS_KEY = 'communityAiProjects'
// aiResultHistory: 평면 배열을 entry.id 단위로 병합(최대 100).
export const AI_RESULT_HISTORY_KEY = 'aiResultHistory'
// { [projectId]: value } 구조의 단지별 key — projectId 단위로 병합.
// (projectScopedStorage.PROJECT_SCOPED_KEY_MAP 중 aiResultHistoryByProject(미사용 잔재)를 제외한 8개.
//  cloudMerge.test.ts가 syncKeys의 'ByProject' key 집합과 정확히 일치하는지 검증해 드리프트를 막는다.)
export const BY_PROJECT_SYNC_KEYS: ReadonlySet<string> = new Set<string>([
  'siteLaborCalendarInputsByProject',
  'siteLaborCostDataByProject',
  'siteLaborCostSnapshotsByProject',
  'siteLaborPayrollDraftByProject',
  'siteLaborPayrollSourcePrefByProject',
  'maintenanceRecordsByProject',
  'residentNoticeReportsByProject',
  'publishedResidentReportsByProject',
])

// ─── 공통 헬퍼 ────────────────────────────────────────────────────────────────
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

// 비교용 타임스탬프 추출: updatedAt 우선, 없으면 createdAt. 비어있지 않은 문자열만 인정.
const pickTimestamp = (v: unknown): string | null => {
  if (!isPlainObject(v)) return null
  const u = v.updatedAt
  if (typeof u === 'string' && u) return u
  const c = v.createdAt
  if (typeof c === 'string' && c) return c
  return null
}

// 충돌 시 "더 최신"을 고른다. 둘 다 유효 타임스탬프이고 cloud가 "엄격히" 더 최신일 때만 cloud.
// 그 외(동률·한쪽만 있음·둘 다 없음)는 항상 local 우선 → 로컬 손실 차단.
// (ISO 8601 문자열은 사전순 비교 = 시간순 비교가 성립한다.)
const chooseNewer = <T>(local: T, cloud: T): T => {
  const lt = pickTimestamp(local)
  const ct = pickTimestamp(cloud)
  if (lt && ct && ct > lt) return cloud
  return local
}

// "비어있음" 판정 — 전역 key의 local-우선 채우기에 사용.
const isEmptyish = (v: unknown): boolean => {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (isPlainObject(v)) return Object.keys(v).length === 0
  return false
}

// ─── communityAiProjects 병합 ────────────────────────────────────────────────
interface ProjectLike {
  id: string
  updatedAt?: string
  [k: string]: unknown
}
export interface MergedAppState {
  projects: ProjectLike[]
  activeProjectId: string
}

// 입력을 { projects, activeProjectId }로 방어적 정규화. 깨진 값은 빈 구조로.
const readAppState = (v: unknown): { projects: ProjectLike[]; activeProjectId: string } => {
  if (!isPlainObject(v)) return { projects: [], activeProjectId: '' }
  const rawProjects = Array.isArray(v.projects) ? v.projects : []
  const projects = rawProjects.filter(
    (p): p is ProjectLike => isPlainObject(p) && typeof p.id === 'string' && p.id !== '',
  )
  const activeProjectId = typeof v.activeProjectId === 'string' ? v.activeProjectId : ''
  return { projects, activeProjectId }
}

// 단지 배열을 project.id 단위로 병합한다.
//   - 같은 id가 양쪽에 있으면 updatedAt이 더 최신인 쪽의 project 객체를 통째로 채택
//     (data.openingChecklist.seedVersion 등 내부 메타가 그대로 보존됨 → 새로고침 시 seed migration 정상 동작).
//   - 한쪽에만 있는 단지는 보존(합집합).
//   - activeProjectId는 local 우선, 없거나 결과에 없으면 cloud → 첫 단지 → '' 순으로 안전 보정.
export const mergeCommunityAiProjects = (localRaw: unknown, cloudRaw: unknown): MergedAppState => {
  const local = readAppState(localRaw)
  const cloud = readAppState(cloudRaw)

  const byId = new Map<string, ProjectLike>()
  const order: string[] = [] // local 순서 보존 + cloud-only는 뒤에 append

  local.projects.forEach((p) => {
    const existing = byId.get(p.id)
    if (!existing) {
      order.push(p.id)
      byId.set(p.id, p)
    } else {
      // 로컬 내 동일 id 중복(비정상) — 더 최신 보존.
      byId.set(p.id, chooseNewer(existing, p))
    }
  })

  cloud.projects.forEach((p) => {
    const existing = byId.get(p.id)
    if (!existing) {
      order.push(p.id)
      byId.set(p.id, p) // cloud-only 단지 추가
    } else {
      byId.set(p.id, chooseNewer(existing, p)) // 충돌 → 더 최신(동률·판단불가 시 local)
    }
  })

  const projects = order.map((id) => byId.get(id)).filter((p): p is ProjectLike => !!p)

  const ids = new Set(projects.map((p) => p.id))
  let activeProjectId = ''
  if (local.activeProjectId && ids.has(local.activeProjectId)) {
    activeProjectId = local.activeProjectId
  } else if (cloud.activeProjectId && ids.has(cloud.activeProjectId)) {
    activeProjectId = cloud.activeProjectId
  } else if (projects.length > 0) {
    activeProjectId = projects[0].id
  }

  return { projects, activeProjectId }
}

// ─── { [projectId]: value } 단지별 key 병합 ──────────────────────────────────
// projectId 단위 병합 — Phase B 안전 정책(승인됨):
//   - cloud에만 있는 projectId 슬롯은 추가(보존).
//   - 양쪽에 같은 projectId가 있으면 "항상 local 우선"한다(덮어쓰기 안 함).
//     updatedAt/createdAt 기반 "최신 선택"은 하지 않는다 — 슬롯 값이 배열이거나 타임스탬프 없는
//     객체인 경우가 많아 신뢰할 수 없고, 로컬 손실을 막는 안전 우선이 이번 범위의 목적이다.
//   - 같은 projectId 슬롯 "내부"의 배열/객체를 item 단위로 deep merge 하지도 않는다.
export const mergeByProjectMap = (localRaw: unknown, cloudRaw: unknown): Record<string, unknown> => {
  const local = isPlainObject(localRaw) ? localRaw : {}
  const cloud = isPlainObject(cloudRaw) ? cloudRaw : {}
  const result: Record<string, unknown> = { ...local }
  Object.keys(cloud).forEach((pid) => {
    // 충돌(양쪽 동일 projectId) 시 local 유지 — cloud-only일 때만 추가.
    if (!(pid in result)) result[pid] = cloud[pid]
  })
  return result
}

// ─── aiResultHistory 병합 ─────────────────────────────────────────────────────
interface AiEntryLike {
  id?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  [k: string]: unknown
}
export const AI_HISTORY_LIMIT = 100

// 평면 배열을 entry.id 단위로 합집합. 같은 id는 더 최신(updatedAt/createdAt) 채택.
// id 없는 비정상 항목은 dedup 없이 보존. createdAt 내림차순 정렬(최신 먼저, 기존 prepend 정책과 일치) 후 최대 100개.
export const mergeAiResultHistory = (localRaw: unknown, cloudRaw: unknown): AiEntryLike[] => {
  const localArr = asArray(localRaw).filter(isPlainObject) as AiEntryLike[]
  const cloudArr = asArray(cloudRaw).filter(isPlainObject) as AiEntryLike[]

  const byId = new Map<string, AiEntryLike>()
  const noId: AiEntryLike[] = []

  const ingest = (arr: AiEntryLike[]) => {
    arr.forEach((e) => {
      const id = typeof e.id === 'string' && e.id ? e.id : null
      if (!id) {
        noId.push(e)
        return
      }
      const existing = byId.get(id)
      byId.set(id, existing ? chooseNewer(existing, e) : e)
    })
  }
  ingest(localArr) // local 먼저 → 동률 시 local 보존
  ingest(cloudArr)

  const combined = [...byId.values(), ...noId]
  combined.sort((a, b) => {
    const ta = pickTimestamp(a) || ''
    const tb = pickTimestamp(b) || ''
    if (ta === tb) return 0
    return ta > tb ? -1 : 1 // 최신(큰 ISO 문자열) 먼저
  })
  return combined.slice(0, AI_HISTORY_LIMIT)
}

// ─── 전역 key(병합 불가) — local 우선 + 빈 값일 때만 cloud 채움 ───────────────
// 입찰/산출 등 전역 key는 단지 단위로 쪼갤 수 없어 안전한 병합이 불가능하다.
// Phase B에서는 "로컬 손실 방지"를 최우선으로, local이 비어있을 때만 cloud로 채운다(신규 기기 온보딩).
// 로컬에 실데이터가 있으면 cloud가 더 최신이어도 덮어쓰지 않는다(전역 동기화는 추후 단계로 미룸).
export const mergeGlobalLocalPriority = (localRaw: unknown, cloudRaw: unknown): unknown => {
  if (isEmptyish(localRaw) && !isEmptyish(cloudRaw)) return cloudRaw
  return localRaw
}

// ─── key별 병합 디스패치 ──────────────────────────────────────────────────────
// 호출부는 key/local값/cloud값을 넘기고, 병합된 값(localStorage에 다시 쓸 값)을 돌려받는다.
// 어떤 예외가 나도 local을 그대로 반환해 데이터 손실/크래시를 막는다.
export const mergeSyncValue = (key: string, localValue: unknown, cloudValue: unknown): unknown => {
  try {
    if (key === COMMUNITY_AI_PROJECTS_KEY) return mergeCommunityAiProjects(localValue, cloudValue)
    if (key === AI_RESULT_HISTORY_KEY) return mergeAiResultHistory(localValue, cloudValue)
    if (BY_PROJECT_SYNC_KEYS.has(key)) return mergeByProjectMap(localValue, cloudValue)
    return mergeGlobalLocalPriority(localValue, cloudValue)
  } catch {
    return localValue
  }
}
