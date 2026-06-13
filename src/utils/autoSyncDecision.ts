// 자동 동기화 "판정 엔진" (Phase D-0) — 상태머신 + 로컬 지문(fingerprint).
//
// 목적:
//   자동 동기화를 실제로 켜기 전에, "지금 자동 push/pull을 해도 안전한지"를 먼저 순수 함수로 판정한다.
//   이 모듈은 어떤 네트워크 호출/타이머/localStorage 감시도 하지 않는다. 호출부가 모은 신호(값)를
//   넘기면 상태(state)만 돌려준다. 그래서 단위 테스트가 쉽고, 실제 자동화는 다음 단계에서 이 판정을
//   트리거로만 쓰면 된다.
//
// ⚠️ 순수성 원칙: window/DOM/fetch/localStorage 직접 접근 금지. Date.now()/Math.random() 등
//   비결정적 API 금지(지문이 흔들리면 안 됨). 시각/지문은 호출부가 만들어 넘긴다.

// ─── systemDataSyncMeta 확장 필드(Phase A 메타와 충돌하지 않게 모두 옵셔널) ───
// Phase A는 { lastSavedAt, lastLoadedAt }만 썼다. 자동 동기화 판정에 필요한 기준선/상태 필드를 추가한다.
export type AutoSyncStatus = 'success' | 'error'
export interface AutoSyncMetaFields {
  // 자동 동기화 토글(기본 OFF). 미정의/false면 판정은 항상 disabled.
  autoSyncEnabled?: boolean
  // 마지막으로 "로컬=클라우드"가 성립했다고 본 기준 시점(ISO). 수동 저장/불러오기 성공 시 기록.
  lastSyncedAt?: string
  // 그 기준 시점의 클라우드 updated_at 최대값(ISO). cloudChanged 판정의 기준선.
  lastCloudUpdatedAt?: string
  // 그 기준 시점의 로컬 데이터 지문. localChanged 판정의 기준선.
  lastLocalFingerprint?: string
  // 아래 3개는 추후 실제 자동 동기화 시도 로깅용(이번 범위에서는 설계만, 기록 안 함).
  lastAutoSyncAttemptAt?: string
  lastAutoSyncStatus?: AutoSyncStatus
  lastAutoSyncError?: string
}

// ─── 안정적(stable) 직렬화 + 지문 ────────────────────────────────────────────
// 객체 key를 재귀적으로 정렬해 직렬화한다. 배열은 순서를 보존한다(순서도 데이터의 일부).
// 같은 내용이면 key 입력 순서가 달라도 동일 문자열이 나오므로, 지문이 흔들리지 않는다.
export const stableStringify = (value: unknown): string => {
  if (value === undefined) return 'null' // JSON엔 undefined가 없음 — 안정성 위해 null로 고정
  if (value === null || typeof value !== 'object') {
    const s = JSON.stringify(value)
    return s === undefined ? 'null' : s
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

// cyrb53 — 결정적 비암호화 해시(충돌 적고 빠름). Date/random 미사용. 보안용 아님(변경 감지용).
const cyrb53 = (str: string, seed = 0): string => {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return hash.toString(16)
}

// SYNC_KEYS 대상 payload 맵({ [syncKey]: parsedValue })의 지문을 만든다.
// 호출부는 localStorage에서 각 동기화 key를 읽어 parse한 값을 맵으로 넘긴다(이 모듈은 localStorage 미접근).
// 길이를 함께 붙여 충돌 가능성을 한 단계 더 낮춘다.
export const computeSyncFingerprint = (payloadByKey: Record<string, unknown>): string => {
  const stable = stableStringify(payloadByKey ?? {})
  return stable.length.toString(36) + '-' + cyrb53(stable)
}

// ─── 자동 동기화 상태 판정 ────────────────────────────────────────────────────
export type AutoSyncState =
  | 'disabled' // 자동 동기화 꺼짐
  | 'idle' // local/cloud 모두 마지막 동기화 이후 변경 없음
  | 'canPush' // local만 변경 → 클라우드 저장 가능
  | 'canPullMerge' // cloud만 변경 → 불러오기(병합) 가능
  | 'needsManualMerge' // 둘 다 변경 → 수동 병합 필요
  | 'needsInitialSync' // 기준 메타 없음 → 첫 수동 동기화 필요
  | 'error' // cloud 상태 확인 실패 등

export interface CloudSignal {
  available: boolean // GET 성공(연결/설정 OK)
  latestUpdatedAt: string | null // 동기화 대상 key의 서버 updated_at 최대값
}

export interface AutoSyncInput {
  autoSyncEnabled: boolean
  baseline: {
    lastSyncedAt?: string
    lastCloudUpdatedAt?: string
    lastLocalFingerprint?: string
  }
  cloud: CloudSignal | null // null이면 아직 미조회/조회 실패
  currentLocalFingerprint: string
}

export interface AutoSyncDecision {
  state: AutoSyncState
  localChanged: boolean
  cloudChanged: boolean
  reason: string // 사람이 읽을 수 있는 사유(UI/로그용)
}

// 사용자 표시용 한글 라벨(UI에서 state→문구 매핑에 사용).
export const AUTO_SYNC_STATE_LABEL: Record<AutoSyncState, string> = {
  disabled: '자동 동기화 꺼짐',
  idle: '동기화됨 (변경 없음)',
  canPush: '로컬 변경 있음 → 저장(push) 가능',
  canPullMerge: '클라우드 변경 있음 → 불러오기(병합) 가능',
  needsManualMerge: '양쪽 변경 있음 → 수동 병합 필요',
  needsInitialSync: '수동 기준 동기화 필요 (먼저 저장 또는 불러오기)',
  error: '클라우드 상태 확인 실패',
}

const decision = (
  state: AutoSyncState,
  reason: string,
  localChanged = false,
  cloudChanged = false,
): AutoSyncDecision => ({ state, localChanged, cloudChanged, reason })

// 순수 판정. 어떤 입력이 와도 throw하지 않는다(깨진 입력 → error).
export const decideAutoSync = (input: AutoSyncInput): AutoSyncDecision => {
  try {
    if (!input || typeof input !== 'object') {
      return decision('error', '판정 입력이 올바르지 않습니다.')
    }
    // 1) 토글 OFF면 무조건 disabled(클라우드 조회 결과와 무관).
    if (!input.autoSyncEnabled) {
      return decision('disabled', '자동 동기화가 꺼져 있습니다.')
    }
    // 2) 클라우드 상태를 알 수 없으면 판정 불가 → error.
    const cloud = input.cloud
    if (!cloud || cloud.available !== true) {
      return decision('error', '클라우드 상태를 확인할 수 없습니다.')
    }
    // 3) 기준선(메타)이 없으면 자동 판정의 비교 대상이 없음 → 첫 수동 동기화 필요.
    const b = input.baseline || {}
    const hasBaseline =
      typeof b.lastSyncedAt === 'string' &&
      b.lastSyncedAt.length > 0 &&
      typeof b.lastLocalFingerprint === 'string' &&
      b.lastLocalFingerprint.length > 0
    if (!hasBaseline) {
      return decision('needsInitialSync', '기준 동기화 기록이 없어 먼저 수동 저장/불러오기가 필요합니다.')
    }
    // 4) 변경 여부 비교.
    const localChanged = (input.currentLocalFingerprint || '') !== b.lastLocalFingerprint
    const cloudChanged = (cloud.latestUpdatedAt || '') !== (b.lastCloudUpdatedAt || '')

    if (!localChanged && !cloudChanged) {
      return decision('idle', '로컬과 클라우드 모두 마지막 동기화 이후 변경이 없습니다.', false, false)
    }
    if (localChanged && !cloudChanged) {
      return decision('canPush', '로컬만 변경되었습니다 — 클라우드에 저장(push)할 수 있습니다.', true, false)
    }
    if (!localChanged && cloudChanged) {
      return decision('canPullMerge', '클라우드만 변경되었습니다 — 불러오기(병합)할 수 있습니다.', false, true)
    }
    return decision(
      'needsManualMerge',
      '로컬과 클라우드가 모두 변경되었습니다 — 수동 병합이 필요합니다.',
      true,
      true,
    )
  } catch {
    return decision('error', '판정 중 오류가 발생했습니다.')
  }
}
