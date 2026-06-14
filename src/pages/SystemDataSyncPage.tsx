import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import Button from '../components/Button'
import { SYNC_GROUPS, SYNC_KEY_DEFS } from '../utils/syncKeys'
import { mergeSyncValue } from '../utils/cloudMerge'
import {
  decideAutoSync,
  computeSyncFingerprint,
  AUTO_SYNC_STATE_LABEL,
  type AutoSyncMetaFields,
  type AutoSyncState,
} from '../utils/autoSyncDecision'
import {
  runAutoSyncOnce,
  type AutoSyncRunDeps,
  type AutoSyncOutcome,
  type PushOutcome,
  type PullPayload,
  type ApplyMergeOutcome,
} from '../utils/autoSyncRunner'
import {
  getAccessCode,
  setAccessCode,
  clearAccessCode,
  maskAccessCode,
  buildAccessCodeHeaders,
} from '../utils/accessCode'
import './SystemDataSyncPage.css'

// HOMEBASE AI 클라우드 수동 동기화 페이지.
// 기존 localStorage 저장 구조는 그대로 유지하고, "클라우드에 저장" / "클라우드에서 불러오기"
// 두 가지 수동 버튼만 제공한다. 자동(주기적) 동기화는 의도적으로 미구현.
//
// 동작 요약:
//   - 저장: 화이트리스트 key를 localStorage에서 읽어 JSON으로 정규화한 뒤
//           POST /.netlify/functions/app-state 로 업서트.
//   - 불러오기(Phase B 병합): 병합 전 현재 로컬 데이터를 JSON 백업으로 자동 다운로드(되돌리기 안전망) →
//                GET /.netlify/functions/app-state 결과를 confirm 후, 로컬을 통째로 덮어쓰지 않고
//                key 종류별로 안전 병합(src/utils/cloudMerge.ts)한 뒤 localStorage에 적용하고 새로고침.
//                · 단지(communityAiProjects)/AI 이력: project.id·entry.id 단위 합집합, 더 최신 항목 우선
//                · 단지별(byProject) key: projectId 단위 병합
//                · 입찰 등 전역 key: 로컬 우선(로컬이 비었을 때만 클라우드로 채움)
//   - 상태: 페이지 진입 시 클라우드 updated_at을 조회해 로컬 시각과 비교 표시(수동 새로고침 가능).
//   - 마지막 저장/불러오기 시각은 별도 localStorage key(syncMeta)에 보존.
//
// ⚠️ 동기화 대상 key는 src/utils/syncKeys.ts 단일 출처에서 가져온다.
//    netlify/functions/app-state.ts(ALLOWED_KEYS)도 같은 모듈을 import하므로 드리프트가 없다.

// 평면화된 key 목록(라벨 포함) — 저장/불러오기·백업·상태 비교 로직에서 사용.
const SYNC_KEYS = SYNC_KEY_DEFS

const META_KEY = 'systemDataSyncMeta'

// Phase A 메타({lastSavedAt,lastLoadedAt}) + Phase D-0 자동 동기화 판정용 필드(AutoSyncMetaFields).
// 모든 필드 옵셔널이라 기존 저장된 메타와 하위호환된다.
interface SyncMeta extends AutoSyncMetaFields {
  lastSavedAt?: string // ISO
  lastLoadedAt?: string // ISO
}

// 자동 동기화 상태 → 배지 톤(기존 verdict 톤 클래스 재사용).
const autoStateTone = (state: AutoSyncState): 'ok' | 'warn' | 'info' | 'err' => {
  switch (state) {
    case 'idle':
      return 'ok'
    case 'needsManualMerge':
    case 'needsInitialSync':
      return 'warn'
    case 'error':
      return 'err'
    default:
      return 'info' // disabled / canPush / canPullMerge
  }
}

// 자동 동기화 1회 실행 결과(outcome) → 메시지 톤.
const autoOutcomeTone = (outcome: AutoSyncOutcome): 'ok' | 'err' | 'info' => {
  switch (outcome) {
    case 'pushed':
    case 'pulledMerged':
      return 'ok'
    case 'error':
      return 'err'
    default:
      return 'info' // idle / disabled / needsManualMerge / needsInitialSync
  }
}

const loadMeta = (): SyncMeta => {
  try {
    const raw = window.localStorage.getItem(META_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as SyncMeta
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveMeta = (m: SyncMeta) => {
  window.localStorage.setItem(META_KEY, JSON.stringify(m))
}

// localStorage 값을 JSON으로 정규화. parse 가능하면 객체/배열로, 아니면 string으로 보존.
// 빈 key는 null로 보낸다 (서버에서도 null 허용 — payload jsonb).
const readLocalAsJson = (key: string): unknown => {
  const raw = window.localStorage.getItem(key)
  if (raw == null) return null
  if (raw === '') return null
  try {
    return JSON.parse(raw)
  } catch {
    // JSON으로 파싱 불가능한 값(예: 단일 문자열)은 그대로 문자열 보존.
    return raw
  }
}

// 서버에서 받은 payload를 localStorage에 저장. null이면 항목 제거.
const writeLocalFromPayload = (key: string, payload: unknown) => {
  if (payload === null || payload === undefined) {
    window.localStorage.removeItem(key)
    return
  }
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload)
  window.localStorage.setItem(key, serialized)
}

const fmtKstIso = (iso: string | null | undefined): string => {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('ko-KR')
  } catch {
    return iso
  }
}

// communityAiProjects(주 데이터)의 project.updatedAt 최대값을 "로컬 데이터 최종 수정 시각"의
// 근사값으로 사용한다. localStorage는 key별 수정 시각을 따로 보관하지 않으므로, 가장 신뢰할 수 있는
// 신호인 단지별 updatedAt 중 최신값을 본다. (다른 key의 미세 변경은 반영되지 않는 근사임)
const computeLocalDataUpdatedAt = (): string | null => {
  try {
    const raw = window.localStorage.getItem('communityAiProjects')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { projects?: Array<{ updatedAt?: unknown }> }
    if (!parsed || !Array.isArray(parsed.projects)) return null
    let max = ''
    parsed.projects.forEach((p) => {
      if (typeof p?.updatedAt === 'string' && p.updatedAt > max) max = p.updatedAt
    })
    return max || null
  } catch {
    return null
  }
}

// 현재 동기화 대상 key들의 localStorage payload로 로컬 지문(fingerprint)을 만든다(자동 동기화 판정용).
// localStorage를 "감시"하지 않고, 호출 시점에 1회 읽어 순수 지문 함수(computeSyncFingerprint)에 넘긴다.
// "로컬 데이터가 마지막 동기화 이후 바뀌었는지" 비교에만 쓰인다.
const computeLocalFingerprint = (): string => {
  const payload: Record<string, unknown> = {}
  SYNC_KEYS.forEach(({ key }) => {
    payload[key] = readLocalAsJson(key)
  })
  return computeSyncFingerprint(payload)
}

// 현재 동기화 대상 key들의 localStorage 스냅샷을 JSON 파일로 내려받는다.
// 클라우드 불러오기로 로컬이 덮어써지기 전에 호출해 "되돌릴 수 있는" 백업을 남긴다.
// 반환: 생성된 파일명. 다운로드 준비에 실패하면 throw 하여 호출부가 덮어쓰기를 중단할 수 있게 한다.
const downloadLocalBackup = (): string => {
  const snapshot: Record<string, unknown> = {}
  SYNC_KEYS.forEach(({ key }) => {
    const raw = window.localStorage.getItem(key)
    if (raw !== null) snapshot[key] = readLocalAsJson(key)
  })
  const backup = {
    type: 'homebase-sync-local-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    keys: Object.keys(snapshot),
    data: snapshot,
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const fileName = `homebase-local-backup-${stamp}.json`
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  return fileName
}

// 클라우드/로컬 신선도 비교 상태.
interface CloudStatus {
  available: boolean // GET 성공(Supabase 설정/연결 OK) 여부
  message?: string // available=false일 때 사유
  cloudLatest: string | null // 동기화 대상 key의 서버 updated_at 최대값
  keyCount: number // 클라우드에 저장된 동기화 대상 key 수
  usedDefault?: boolean // 전환기 기본 작업공간으로 응답했는지(접근코드 유효 시 false) — Phase C-3
  fallbackAllowed?: boolean // 서버 정책상 전환기 fallback 허용 여부 — Phase C-3
  error?: string // available=false일 때 서버 error 코드(invalid_access_code | access_code_required 등)
}

type VerdictTone = 'ok' | 'warn' | 'info' | 'err'

const SystemDataSyncPage: React.FC = () => {
  const [meta, setMeta] = useState<SyncMeta>(loadMeta)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  // 자동 동기화 "1회 실행" 전용 진행/결과 상태(수동 저장/불러오기의 busy/msg와 분리).
  const [autoBusy, setAutoBusy] = useState(false)
  const [autoMsg, setAutoMsg] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null)
  // 사용자가 동기화 대상에서 일부 항목을 빼고 싶을 때 사용 (기본 전체 선택).
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    SYNC_KEYS.forEach(({ key }) => (init[key] = true))
    return init
  })
  // 워크스페이스 접근코드 (Phase C-1/C-2). 평문은 sessionStorage에만 보관(동기화 대상 아님).
  // accessCodeInput: 입력 중인 값. applied: 현재 적용된 값(마스킹해서만 표시).
  const [accessCodeInput, setAccessCodeInput] = useState('')
  const [appliedAccessCode, setAppliedAccessCode] = useState<string>(() => getAccessCode())

  useEffect(() => {
    if (!msg) return
    const t = window.setTimeout(() => setMsg(null), 6500)
    return () => window.clearTimeout(t)
  }, [msg])

  const selectedKeys = useMemo(
    () => SYNC_KEYS.filter(({ key }) => selected[key]).map(({ key }) => key),
    [selected],
  )

  const allSelected = SYNC_KEYS.every(({ key }) => selected[key])
  const noneSelected = selectedKeys.length === 0

  const toggle = (key: string) => setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  const setAll = (on: boolean) => {
    const next: Record<string, boolean> = {}
    SYNC_KEYS.forEach(({ key }) => (next[key] = on))
    setSelected(next)
  }

  // 클라우드 상태 조회 — GET만 수행하며 로컬 데이터를 절대 덮어쓰지 않는다(읽기 전용).
  // 계산된 CloudStatus를 반환도 한다 → 저장/불러오기 직후 기준선(lastCloudUpdatedAt) 기록에 재사용.
  const fetchCloudStatus = useCallback(async (): Promise<CloudStatus> => {
    setStatusBusy(true)
    try {
      const res = await fetch('/.netlify/functions/app-state', {
        method: 'GET',
        headers: { ...buildAccessCodeHeaders() },
      })
      const data = (await res.json()) as {
        ok: boolean
        items?: Record<string, unknown>
        updatedAt?: Record<string, string>
        message?: string
        usedDefault?: boolean
        fallbackAllowed?: boolean
        error?: string
      }
      if (!data.ok) {
        const s: CloudStatus = {
          available: false,
          message: data.message || '클라우드 상태를 확인할 수 없습니다.',
          cloudLatest: null,
          keyCount: 0,
          error: data.error,
          fallbackAllowed: data.fallbackAllowed,
        }
        setCloudStatus(s)
        return s
      }
      const updatedAtMap = data.updatedAt || {}
      let latest = ''
      let count = 0
      // 동기화 대상(화이트리스트) key만 집계한다.
      SYNC_KEYS.forEach(({ key }) => {
        const ts = updatedAtMap[key]
        if (typeof ts === 'string') {
          count += 1
          if (ts > latest) latest = ts
        }
      })
      const s: CloudStatus = {
        available: true,
        cloudLatest: latest || null,
        keyCount: count,
        usedDefault: data.usedDefault,
        fallbackAllowed: data.fallbackAllowed,
      }
      setCloudStatus(s)
      return s
    } catch (e) {
      const s: CloudStatus = {
        available: false,
        message: '클라우드 상태 확인 중 네트워크 오류: ' + (e instanceof Error ? e.message : String(e)),
        cloudLatest: null,
        keyCount: 0,
      }
      setCloudStatus(s)
      return s
    } finally {
      setStatusBusy(false)
    }
  }, [])

  // 페이지 진입 시 1회 클라우드 상태 조회(읽기 전용).
  useEffect(() => {
    void fetchCloudStatus()
  }, [fetchCloudStatus])

  // 로컬 vs 클라우드 신선도 판정. 사용자가 어느 쪽이 최신인지/충돌 가능성을 한눈에 보게 한다.
  const verdict = useMemo((): { tone: VerdictTone; text: string } | null => {
    if (!cloudStatus) return null
    if (!cloudStatus.available) {
      return { tone: 'err', text: cloudStatus.message || '클라우드 상태를 확인할 수 없습니다.' }
    }
    const cloud = cloudStatus.cloudLatest
    const lastSaved = meta.lastSavedAt || null
    const localChanged = computeLocalDataUpdatedAt()
    if (!cloud) {
      return { tone: 'info', text: '클라우드에 저장된 데이터가 없습니다. "클라우드에 저장"으로 첫 업로드를 진행하세요.' }
    }
    if (!lastSaved) {
      return {
        tone: 'warn',
        text: '이 브라우저에서 클라우드에 저장한 기록이 없습니다. "클라우드에서 불러오기"는 단지/AI 이력을 더 최신 항목 우선으로 병합하고 전역 항목은 로컬을 우선합니다 — 병합 직전 백업이 자동 생성됩니다.',
      }
    }
    const cloudNewer = cloud > lastSaved
    const localNewer = !!localChanged && localChanged > lastSaved
    if (cloudNewer && localNewer) {
      return {
        tone: 'warn',
        text: '⚠️ 양쪽 변경 감지: 이 브라우저의 마지막 저장 이후 로컬과 클라우드가 모두 변경되었습니다. 불러오면 단지/AI 이력은 항목별 더 최신 기준으로 병합되지만, 입찰 등 전역 항목은 로컬이 우선됩니다. 전역 항목까지 합치려면 먼저 "클라우드에 저장"하세요.',
      }
    }
    if (cloudNewer) {
      return {
        tone: 'info',
        text: '클라우드가 이 브라우저의 마지막 저장 이후 갱신되었습니다(다른 기기에서 저장했을 수 있음). 불러오면 단지/AI 이력의 더 최신 항목을 병합해 받습니다(전역 항목은 로컬 우선).',
      }
    }
    if (localNewer) {
      return { tone: 'info', text: '이 브라우저(로컬)가 클라우드보다 최신입니다. "클라우드에 저장"을 권장합니다.' }
    }
    return { tone: 'ok', text: '로컬과 클라우드가 마지막 동기화 기준으로 일치합니다.' }
  }, [cloudStatus, meta])

  const localDataUpdatedAt = useMemo(() => computeLocalDataUpdatedAt(), [cloudStatus, meta])

  // 현재 로컬 지문(자동 동기화 판정용). 렌더 시점 1회 계산(감시 아님).
  const localFingerprint = useMemo(() => computeLocalFingerprint(), [cloudStatus, meta])

  // 자동 동기화 "준비 상태" 판정(Phase D-0). 순수 엔진에 신호만 넘긴다 — 실제 push/pull은 하지 않는다.
  const autoSyncDecision = useMemo(
    () =>
      decideAutoSync({
        autoSyncEnabled: !!meta.autoSyncEnabled,
        baseline: {
          lastSyncedAt: meta.lastSyncedAt,
          lastCloudUpdatedAt: meta.lastCloudUpdatedAt,
          lastLocalFingerprint: meta.lastLocalFingerprint,
        },
        cloud: cloudStatus
          ? { available: cloudStatus.available, latestUpdatedAt: cloudStatus.cloudLatest }
          : null,
        currentLocalFingerprint: localFingerprint,
      }),
    [meta, cloudStatus, localFingerprint],
  )

  // 자동 동기화 토글 — 메타에만 저장한다. ON이어도 자동(주기적) 동기화는 하지 않는다.
  // 실제 동기화는 아래 "자동 동기화 1회 실행" 버튼을 눌렀을 때만 1회 일어난다(자동 트리거 없음).
  const toggleAutoSync = () => {
    const next = { ...meta, autoSyncEnabled: !meta.autoSyncEnabled }
    setMeta(next)
    saveMeta(next)
  }

  // 워크스페이스 접근코드 적용 — sessionStorage에 저장하고, 새 코드 기준으로 클라우드 상태를 다시 조회한다.
  // (코드가 틀리면 상태 조회가 403을 받아 위 상태 카드에 "접근코드가 올바르지 않습니다"가 표시된다.)
  const handleApplyAccessCode = () => {
    const code = accessCodeInput.trim()
    if (!code) {
      setMsg({ type: 'info', text: '워크스페이스 접근코드를 입력해주세요.' })
      return
    }
    setAccessCode(code)
    setAppliedAccessCode(getAccessCode())
    setAccessCodeInput('') // 입력칸에 평문을 남겨두지 않는다.
    setMsg({ type: 'ok', text: '워크스페이스 접근코드를 적용했습니다. 이제 저장/불러오기 요청에 이 코드가 사용됩니다.' })
    void fetchCloudStatus() // 새 코드(=새 workspace) 기준으로 상태 갱신.
  }

  // 접근코드 삭제 — 이후 요청은 전환기 기본 작업공간(fallback)으로 동작한다.
  const handleClearAccessCode = () => {
    clearAccessCode()
    setAppliedAccessCode('')
    setAccessCodeInput('')
    setMsg({
      type: 'info',
      text: '접근코드를 삭제했습니다. 전환기 기본 작업공간이 열려 있으면 그 작업공간으로 동작하고, 닫혀 있으면 접근이 거부됩니다(아래 상태 확인).',
    })
    void fetchCloudStatus()
  }

  // 자동 동기화 1회 실행(수동 버튼) — Phase D-1.
  // 버튼 클릭 시에만 실행되며, 자동 트리거(타이머/포커스/언로드/진입)는 일절 없다.
  // 실제 동작(저장/병합)은 실행 코어(autoSyncRunner)가 "실행 직전 신선 판정" 결과에 따라 결정한다.
  // 이 함수는 부수효과(fetch/localStorage/백업/새로고침)를 deps로 주입할 뿐, 판정/순서는 runner가 책임진다.
  const handleRunAutoSyncOnce = async () => {
    if (!meta.autoSyncEnabled) {
      setAutoMsg({ tone: 'info', text: '먼저 위의 "자동 동기화 사용" 토글을 켜야 실행할 수 있습니다.' })
      return
    }
    if (noneSelected) {
      setAutoMsg({ tone: 'info', text: '동기화할 항목을 1개 이상 선택해주세요.' })
      return
    }
    setAutoBusy(true)
    setAutoMsg(null)

    // 주입 의존성 — 기존 수동 동기화에서 검증된 fetch/localStorage/병합 로직을 그대로 재사용한다.
    const deps: AutoSyncRunDeps = {
      now: () => new Date().toISOString(),
      // 실행 직전 신선한 클라우드 상태(읽기 전용). fetchCloudStatus는 상태 카드도 함께 갱신한다.
      getCloudSignal: async () => {
        const s = await fetchCloudStatus()
        return { available: s.available, latestUpdatedAt: s.cloudLatest }
      },
      getLocalFingerprint: () => computeLocalFingerprint(),
      // canPush 저장(POST) 직전 사용자 확인. 취소하면 runner가 push를 호출하지 않는다.
      confirmPush: () =>
        window.confirm(
          '로컬 변경사항을 클라우드에 저장합니다. 다른 기기에서 저장한 최신 데이터가 있다면 충돌이 발생할 수 있습니다. 계속할까요?',
        ),
      // canPush: 선택된 key를 localStorage에서 읽어 클라우드에 업서트(POST).
      push: async (): Promise<PushOutcome> => {
        const items: Record<string, unknown> = {}
        selectedKeys.forEach((k) => {
          items[k] = readLocalAsJson(k)
        })
        const res = await fetch('/.netlify/functions/app-state', {
          method: 'POST',
          headers: { ...buildAccessCodeHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        })
        const data = (await res.json()) as { ok: boolean; saved?: number; message?: string }
        return { ok: !!data.ok, saved: data.saved ?? 0, message: data.message }
      },
      // canPullMerge 전: 병합 직전 로컬 백업(되돌리기 안전망). 실패 시 throw → runner가 중단 처리.
      backup: () => downloadLocalBackup(),
      // canPullMerge: 클라우드 payload + updated_at GET.
      pull: async (): Promise<PullPayload> => {
        const res = await fetch('/.netlify/functions/app-state', {
          method: 'GET',
          headers: { ...buildAccessCodeHeaders() },
        })
        const data = (await res.json()) as {
          ok: boolean
          items?: Record<string, unknown>
          updatedAt?: Record<string, string>
          message?: string
        }
        return {
          ok: !!data.ok,
          items: data.items || {},
          updatedAt: data.updatedAt || {},
          message: data.message,
        }
      },
      // canPullMerge: 통째 덮어쓰기 대신 key별 안전 병합(mergeSyncValue) 적용 후, 병합 후 지문/클라우드 최신값 회수.
      applyMerge: (pull): ApplyMergeOutcome => {
        let applied = 0
        selectedKeys.forEach((k) => {
          if (!(k in pull.items)) return
          const merged = mergeSyncValue(k, readLocalAsJson(k), pull.items[k])
          writeLocalFromPayload(k, merged)
          applied += 1
        })
        let cloudLatest = ''
        SYNC_KEYS.forEach(({ key }) => {
          const ts = pull.updatedAt[key]
          if (typeof ts === 'string' && ts > cloudLatest) cloudLatest = ts
        })
        return {
          applied,
          mergedFingerprint: computeLocalFingerprint(), // 병합 적용 후 로컬 상태 기준
          cloudLatest: cloudLatest || null,
        }
      },
    }

    try {
      const res = await runAutoSyncOnce(
        {
          autoSyncEnabled: !!meta.autoSyncEnabled,
          baseline: {
            lastSyncedAt: meta.lastSyncedAt,
            lastCloudUpdatedAt: meta.lastCloudUpdatedAt,
            lastLocalFingerprint: meta.lastLocalFingerprint,
          },
        },
        deps,
      )
      // runner가 돌려준 메타 변경분을 병합·영구화한다. 새로고침이 필요하면 반드시 저장 후에 한다.
      const nextMeta: SyncMeta = { ...meta, ...res.metaPatch }
      setMeta(nextMeta)
      saveMeta(nextMeta)
      setAutoMsg({ tone: autoOutcomeTone(res.outcome), text: res.message })
      if (res.shouldReload) {
        window.setTimeout(() => window.location.reload(), 1200)
      }
    } catch (e) {
      // runner는 throw하지 않도록 설계됐지만, deps 외부 예외까지 방어.
      setAutoMsg({
        tone: 'err',
        text: '자동 동기화 실행 중 오류: ' + (e instanceof Error ? e.message : String(e)),
      })
    } finally {
      setAutoBusy(false)
    }
  }

  const handleSave = async () => {
    if (noneSelected) {
      setMsg({ type: 'info', text: '동기화할 항목을 1개 이상 선택해주세요.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const items: Record<string, unknown> = {}
      selectedKeys.forEach((k) => {
        items[k] = readLocalAsJson(k)
      })
      const res = await fetch('/.netlify/functions/app-state', {
        method: 'POST',
        headers: { ...buildAccessCodeHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = (await res.json()) as {
        ok: boolean
        saved?: number
        savedKeys?: string[]
        skippedKeys?: string[]
        message?: string
      }
      if (data.ok) {
        const saved = data.saved ?? 0
        const skippedCount = data.skippedKeys?.length ?? 0
        // 저장된 항목이 있을 때만 기준선 갱신(0건이면 의미 있는 저장이 아니므로 유지).
        if (saved > 0) {
          const now = new Date().toISOString()
          const fp = computeLocalFingerprint()
          // 저장 직후 클라우드 최신값을 다시 조회(읽기 전용)해 기준선(lastCloudUpdatedAt)을 정확히 기록.
          const status = await fetchCloudStatus()
          const nextMeta: SyncMeta = {
            ...meta,
            lastSavedAt: now,
            // 자동 동기화 판정 기준선: 방금 로컬=클라우드가 성립했다고 본다.
            lastSyncedAt: now,
            lastLocalFingerprint: fp,
            lastCloudUpdatedAt: status.available ? status.cloudLatest || undefined : meta.lastCloudUpdatedAt,
          }
          setMeta(nextMeta)
          saveMeta(nextMeta)
        }
        if (saved === 0) {
          // 빈 항목만 선택된 경우 — 오류가 아니라 안내(info)로 표시.
          setMsg({
            type: 'info',
            text:
              '저장할 데이터가 없습니다. 먼저 입찰공고나 근무표 데이터를 입력한 뒤 저장하세요.',
          })
        } else if (skippedCount > 0) {
          setMsg({
            type: 'info',
            text: `${saved}개 항목을 클라우드에 저장했습니다. 빈 항목 ${skippedCount}개는 건너뛰었습니다.`,
          })
        } else {
          setMsg({
            type: 'ok',
            text: `${saved}개 항목을 클라우드에 저장했습니다.`,
          })
        }
      } else {
        setMsg({ type: 'err', text: data.message || '클라우드 저장에 실패했습니다.' })
      }
    } catch (e) {
      setMsg({
        type: 'err',
        text: '클라우드 저장 중 네트워크 오류: ' + (e instanceof Error ? e.message : String(e)),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleLoad = async () => {
    if (noneSelected) {
      setMsg({ type: 'info', text: '불러올 항목을 1개 이상 선택해주세요.' })
      return
    }
    const confirmed = window.confirm(
      '클라우드 데이터를 현재 브라우저 데이터와 병합합니다(통째 덮어쓰기 아님).\n' +
        '• 단지/AI 이력: 더 최신 항목 우선으로 안전 병합(양쪽에만 있는 항목은 모두 보존)\n' +
        '• 입찰 등 전역 항목: 현재 브라우저(로컬) 우선\n' +
        '병합 직전, 현재 데이터가 백업 파일(JSON)로 자동 다운로드됩니다.\n계속할까요?',
    )
    if (!confirmed) return

    // 되돌릴 수 있도록, 병합 적용 전에 현재 로컬 데이터를 백업 파일로 자동 저장한다.
    // 백업 준비에 실패하면 데이터 보호를 위해 불러오기를 중단한다(병합/적용 안 함).
    let backupFileName = ''
    try {
      backupFileName = downloadLocalBackup()
    } catch (e) {
      setMsg({
        type: 'err',
        text:
          '불러오기 전 로컬 백업 생성에 실패하여 작업을 중단했습니다(기존 데이터는 그대로 유지). ' +
          (e instanceof Error ? e.message : String(e)),
      })
      return
    }

    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/.netlify/functions/app-state', {
        method: 'GET',
        headers: { ...buildAccessCodeHeaders() },
      })
      const data = (await res.json()) as {
        ok: boolean
        items?: Record<string, unknown>
        updatedAt?: Record<string, string>
        message?: string
      }
      if (!data.ok) {
        setMsg({ type: 'err', text: data.message || '클라우드 불러오기에 실패했습니다.' })
        setBusy(false)
        return
      }
      const cloudItems = data.items || {}
      let applied = 0
      let mergeErrors = 0
      // 클라우드에 존재하는 key만 병합 대상. 클라우드에 없는 key는 로컬을 그대로 둔다(보존).
      selectedKeys.forEach((k) => {
        if (!(k in cloudItems)) return
        try {
          const localValue = readLocalAsJson(k)
          // 통째 덮어쓰기 대신 key 종류별 안전 병합. 어떤 입력이든 mergeSyncValue는 throw하지 않고
          // 실패 시 local을 반환하므로, 한 항목 때문에 전체 불러오기가 깨지지 않는다.
          const merged = mergeSyncValue(k, localValue, cloudItems[k])
          writeLocalFromPayload(k, merged)
          applied += 1
        } catch (e) {
          // 이론상 도달하지 않지만(merge 내부 방어), 만일을 대비해 해당 key만 건너뛰고 로컬 보존.
          mergeErrors += 1
          console.warn('[handleLoad] merge/write failed for key:', k, e)
        }
      })
      const now = new Date().toISOString()
      // 자동 동기화 판정 기준선 기록: 방금 병합으로 로컬이 클라우드를 흡수했으므로
      // 현재 클라우드 updated_at 최대값과 "병합 후" 로컬 지문을 기준선으로 잡는다.
      const uMap = data.updatedAt || {}
      let cloudLatest = ''
      SYNC_KEYS.forEach(({ key }) => {
        const ts = uMap[key]
        if (typeof ts === 'string' && ts > cloudLatest) cloudLatest = ts
      })
      const mergedFingerprint = computeLocalFingerprint() // 병합 적용 후 로컬 상태 기준
      const nextMeta: SyncMeta = {
        ...meta,
        lastLoadedAt: now,
        lastSyncedAt: now,
        lastLocalFingerprint: mergedFingerprint,
        lastCloudUpdatedAt: cloudLatest || meta.lastCloudUpdatedAt,
      }
      saveMeta(nextMeta) // reload 전에 영구화
      const errNote = mergeErrors > 0 ? ` (병합 실패 ${mergeErrors}건은 로컬 유지)` : ''
      setMsg({
        type: 'ok',
        text: `${applied}개 항목을 백업 후 병합했습니다.${errNote} (백업 파일: ${backupFileName}) 새로고침합니다.`,
      })
      // 모든 페이지가 새 localStorage 값으로 초기화되도록 강제 새로고침.
      window.setTimeout(() => window.location.reload(), 1000)
    } catch (e) {
      setMsg({
        type: 'err',
        text: '클라우드 불러오기 중 네트워크 오류: ' + (e instanceof Error ? e.message : String(e)),
      })
      setBusy(false)
    }
  }

  // 수동 로컬 백업 — 언제든 현재 데이터를 JSON으로 내려받는다.
  const handleManualBackup = () => {
    try {
      const fileName = downloadLocalBackup()
      setMsg({ type: 'ok', text: `현재 로컬 데이터를 백업 파일로 저장했습니다: ${fileName}` })
    } catch (e) {
      setMsg({
        type: 'err',
        text: '로컬 백업 생성에 실패했습니다: ' + (e instanceof Error ? e.message : String(e)),
      })
    }
  }

  // 백업 파일에서 복원 — 다운로드해 둔 백업 JSON으로 로컬 데이터를 되돌린다.
  // 동기화 화이트리스트 key만 적용해 임의 key 주입을 차단한다.
  const handleRestoreFromFile = async (file: File) => {
    const confirmed = window.confirm(
      '선택한 백업 파일의 데이터로 현재 브라우저 데이터를 덮어씁니다. 계속할까요?',
    )
    if (!confirmed) return
    setBusy(true)
    setMsg(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as { type?: string; data?: Record<string, unknown> }
      if (
        !parsed ||
        parsed.type !== 'homebase-sync-local-backup' ||
        !parsed.data ||
        typeof parsed.data !== 'object' ||
        Array.isArray(parsed.data)
      ) {
        setMsg({ type: 'err', text: '올바른 HOMEBASE 로컬 백업 파일이 아닙니다.' })
        setBusy(false)
        return
      }
      const restoreData = parsed.data
      let applied = 0
      // 화이트리스트 key만 복원.
      SYNC_KEYS.forEach(({ key }) => {
        if (key in restoreData) {
          writeLocalFromPayload(key, restoreData[key])
          applied += 1
        }
      })
      setMsg({ type: 'ok', text: `백업에서 ${applied}개 항목을 복원했습니다. 새로고침합니다.` })
      window.setTimeout(() => window.location.reload(), 1000)
    } catch (e) {
      setMsg({
        type: 'err',
        text: '백업 파일을 읽는 중 오류: ' + (e instanceof Error ? e.message : String(e)),
      })
      setBusy(false)
    }
  }

  return (
    <div className="page sys-sync-page">
      <PageHeader
        title="데이터 동기화 (수동)"
        description="현재 브라우저의 localStorage 데이터를 Supabase 클라우드에 수동으로 저장하거나, 다른 브라우저에서 불러올 수 있습니다."
      />

      <div className="sys-sync-info">
        ⓘ 자동 동기화는 하지 않습니다. 다른 브라우저에서 데이터를 보려면 한쪽에서 "클라우드에 저장" → 다른 쪽에서 "클라우드에서 불러오기" 순서로 진행하세요. <strong>불러오기는 통째로 덮어쓰지 않고, 단지·AI 이력을 더 최신 항목 우선으로 병합합니다(입찰 등 전역 항목은 로컬 우선). 병합 직전 자동 백업 파일이 다운로드됩니다.</strong>
      </div>

      {/* 워크스페이스 접근코드 (Phase C-1/C-2) — 외부인 차단용 접근 게이트 */}
      <Card title="워크스페이스 접근코드" className="sys-sync-card">
        <p className="sys-sync-note">
          이 코드는 <strong>워크스페이스 접근 게이트</strong>입니다 — 함수 주소만 아는 외부인이 클라우드 데이터를 읽거나 덮어쓰는 것을 막습니다. <strong>현장(단지)별 접근 제한이 아닙니다.</strong> 현장별 분리는 이후 단계(projectId 서버 필터링)에서 추가될 예정입니다. 코드는 이 탭에만(sessionStorage) 보관되며 동기화 대상이 아닙니다.
        </p>

        {appliedAccessCode ? (
          cloudStatus && !cloudStatus.available ? (
            // 코드는 적용됐지만 상태 조회가 실패 — 보통 코드 불일치(403) 또는 서버 오류.
            <p className="sys-sync-verdict sys-sync-verdict--err">
              <strong>접근코드 적용됨</strong> ({maskAccessCode(appliedAccessCode)}) — 다만 이 코드로 작업공간을 확인하지 못했습니다. 아래 "클라우드 / 로컬 상태"의 오류를 확인하거나 코드를 다시 입력하세요.
            </p>
          ) : (
            <p className="sys-sync-verdict sys-sync-verdict--ok">
              <strong>접근코드 기반 작업공간 사용 중</strong> ({maskAccessCode(appliedAccessCode)}) — 저장/불러오기 요청이 이 코드의 작업공간으로 전달됩니다.
            </p>
          )
        ) : cloudStatus && !cloudStatus.available && cloudStatus.error === 'access_code_required' ? (
          // 코드 미설정 + 서버에서 전환기 fallback이 닫힘 → 접근코드 필수(폐기 완료 상태).
          <p className="sys-sync-verdict sys-sync-verdict--err">
            <strong>접근코드 필수 · 전환기 기본 작업공간 비활성화됨</strong> — 이 서버는 더 이상 코드 없이 접근할 수 없습니다. 운영용 접근코드를 입력하세요.
          </p>
        ) : (
          // 코드 미설정 + 전환기 fallback 열림(usedDefault) → 동작은 하지만 폐기 예정 경고.
          <p className="sys-sync-verdict sys-sync-verdict--warn">
            <strong>접근코드 미설정 · 전환기 기본 작업공간 사용 중</strong> — 코드 없이도 기본 작업공간으로 동작하지만, 보안상 운영 workspace 전환 후 이 기본 작업공간은 <strong>비활성화될 예정</strong>입니다. 운영용 접근코드 적용을 권장합니다.
          </p>
        )}

        <div className="sys-sync-tool">
          <input
            type="password"
            className="sys-sync-code-input"
            placeholder="워크스페이스 접근코드 입력"
            autoComplete="off"
            value={accessCodeInput}
            onChange={(e) => setAccessCodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApplyAccessCode()
            }}
            disabled={busy}
          />
          <Button variant="primary" onClick={handleApplyAccessCode} disabled={busy || !accessCodeInput.trim()}>
            적용
          </Button>
          <Button variant="secondary" onClick={handleClearAccessCode} disabled={busy || !appliedAccessCode}>
            삭제
          </Button>
        </div>
        <p className="sys-sync-note">
          ※ 코드는 화면·로그에 평문으로 노출되지 않으며, 서버에서만 sha256 해시로 검증됩니다. 코드가 틀리면 위 "클라우드 / 로컬 상태"에 오류가 표시됩니다. 운영 작업공간 생성 방법은 <strong>SUPABASE_SETUP.md</strong>를 참고하세요.
        </p>
      </Card>

      {/* 클라우드/로컬 신선도 비교 */}
      <Card title="클라우드 / 로컬 상태" className="sys-sync-card">
        <div className="sys-sync-tool">
          <Button variant="secondary" onClick={() => void fetchCloudStatus()} disabled={statusBusy}>
            {statusBusy ? '확인 중...' : '상태 새로고침'}
          </Button>
        </div>
        <div className="sys-sync-meta">
          <div>
            <span>클라우드 최종 저장</span>
            <strong>{statusBusy && !cloudStatus ? '확인 중...' : fmtKstIso(cloudStatus?.cloudLatest)}</strong>
          </div>
          <div>
            <span>클라우드 저장 항목 수</span>
            <strong>{cloudStatus?.available ? `${cloudStatus.keyCount}건` : '-'}</strong>
          </div>
          <div>
            <span>이 브라우저 마지막 저장</span>
            <strong>{fmtKstIso(meta.lastSavedAt)}</strong>
          </div>
          <div>
            <span>이 브라우저 마지막 불러오기</span>
            <strong>{fmtKstIso(meta.lastLoadedAt)}</strong>
          </div>
          <div>
            <span>로컬 단지 데이터 최종 수정</span>
            <strong>{fmtKstIso(localDataUpdatedAt)}</strong>
          </div>
        </div>
        {verdict && (
          <p className={`sys-sync-verdict sys-sync-verdict--${verdict.tone}`}>{verdict.text}</p>
        )}
        <p className="sys-sync-note">
          ※ "로컬 단지 데이터 최종 수정"은 단지 정보의 <code>updatedAt</code> 기준 근사값입니다. 입찰공고·근무표 등 다른 항목의 변경은 포함되지 않을 수 있습니다.
        </p>
      </Card>

      {/* 자동 동기화 준비 상태 — Phase D-0: 상태 판정만 표시하고 실제 자동 동기화는 하지 않는다. */}
      <Card title="자동 동기화 준비 상태 (실험)" className="sys-sync-card">
        <label className="sys-sync-auto-toggle">
          <input
            type="checkbox"
            checked={!!meta.autoSyncEnabled}
            onChange={toggleAutoSync}
            disabled={busy}
          />
          <span>자동 동기화 사용 (기본 꺼짐)</span>
        </label>
        <p className={`sys-sync-verdict sys-sync-verdict--${autoStateTone(autoSyncDecision.state)}`}>
          <strong>{AUTO_SYNC_STATE_LABEL[autoSyncDecision.state]}</strong>
          <br />
          {autoSyncDecision.reason}
        </p>
        <div className="sys-sync-meta">
          <div>
            <span>로컬 변경</span>
            <strong>{autoSyncDecision.localChanged ? '있음' : '없음'}</strong>
          </div>
          <div>
            <span>클라우드 변경</span>
            <strong>{autoSyncDecision.cloudChanged ? '있음' : '없음'}</strong>
          </div>
          <div>
            <span>기준 동기화 시각</span>
            <strong>{fmtKstIso(meta.lastSyncedAt)}</strong>
          </div>
        </div>

        {/* Phase D-1: "1회 실행" 버튼 — 누를 때만 판정 결과에 따라 저장/병합. 자동 트리거 없음. */}
        <div className="sys-sync-actions">
          <Button
            variant="primary"
            onClick={handleRunAutoSyncOnce}
            disabled={busy || autoBusy || !meta.autoSyncEnabled || noneSelected}
          >
            {autoBusy ? '실행 중...' : '자동 동기화 1회 실행'}
          </Button>
          {!meta.autoSyncEnabled && (
            <span className="sys-sync-count">토글을 켜야 실행 가능</span>
          )}
        </div>
        <p className="sys-sync-note">
          ℹ️ 이 버튼은 <strong>현재 상태에 따라</strong> 동작이 달라집니다 — 로컬만 바뀌었으면 <strong>클라우드 저장(push)</strong>, 클라우드만 바뀌었으면 <strong>백업 후 병합 불러오기(pull)</strong>가 실행될 수 있습니다. <strong>클라우드 저장(push) 직전에는 확인 창이 한 번 더 뜹니다.</strong> 양쪽이 모두 바뀐 경우에는 자동 처리하지 않고 수동 병합을 안내합니다.
        </p>
        {autoMsg && (
          <p className={`sys-sync-msg sys-sync-msg--${autoMsg.tone}`}>{autoMsg.text}</p>
        )}

        <p className="sys-sync-note sys-sync-auto-note">
          ⚠️ 이 버튼은 <strong>누를 때만 1회</strong> 동작합니다. 켜 두기만 해도 저절로 저장/불러오기가 되는 자동(주기적) 동기화는 아직 없습니다. 실행하면 현재 상태에 따라 <strong>로컬만 바뀐 경우 클라우드 저장</strong>, <strong>클라우드만 바뀐 경우 백업 후 병합</strong>을 수행하고, <strong>양쪽 다 바뀐 경우</strong>에는 자동 처리하지 않고 수동 병합을 안내합니다. 기준 기록이 없으면 먼저 아래 수동 버튼으로 한 번 저장/불러오기 하세요.
        </p>
      </Card>

      <Card title="동기화 항목 선택" className="sys-sync-card">
        <div className="sys-sync-tool">
          <Button variant="secondary" onClick={() => setAll(true)} disabled={busy || allSelected}>
            전체 선택
          </Button>
          <Button variant="secondary" onClick={() => setAll(false)} disabled={busy || noneSelected}>
            전체 해제
          </Button>
          <span className="sys-sync-count">선택 {selectedKeys.length} / {SYNC_KEYS.length}건</span>
        </div>

        {/* 그룹별로 묶어 표시. 같은 그룹 안에서는 카드형 체크박스 그리드. */}
        <div className="sys-sync-groups">
          {SYNC_GROUPS.map((group) => (
            <section key={group.title} className="sys-sync-group">
              <h4 className="sys-sync-group-title">{group.title}</h4>
              <ul className="sys-sync-keys">
                {group.items.map(({ key, label }) => (
                  <li key={key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!selected[key]}
                        onChange={() => toggle(key)}
                        disabled={busy}
                      />
                      <span className="sys-sync-key-text">
                        <span className="sys-sync-key-label">{label}</span>
                        <span className="sys-sync-key-id">{key}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="sys-sync-note">
          ※ 동기화 대상은 위 화이트리스트로 제한됩니다. 임시 UI 상태(예: <code>systemDataSyncMeta</code>)나
          레거시 데이터(<code>apartmentCommunityData</code>)는 동기화되지 않습니다.
        </p>
      </Card>

      <Card title="동기화 액션" className="sys-sync-card">
        <div className="sys-sync-actions">
          <Button variant="primary" onClick={handleSave} disabled={busy || noneSelected}>
            {busy ? '저장 중...' : '클라우드에 저장'}
          </Button>
          <Button variant="primary" onClick={handleLoad} disabled={busy || noneSelected}>
            {busy ? '병합 중...' : '클라우드에서 불러오기 (백업 후 병합)'}
          </Button>
        </div>

        {/* 로컬 백업/복원 — 클라우드와 무관하게 동작하는 되돌리기 안전망 */}
        <div className="sys-sync-actions">
          <Button variant="secondary" onClick={handleManualBackup} disabled={busy}>
            지금 로컬 백업 내려받기
          </Button>
          <label className={`btn btn-secondary sys-sync-restore-label${busy ? ' is-disabled' : ''}`}>
            백업 파일에서 복원
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy}
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                // 같은 파일을 다시 선택해도 onChange가 발생하도록 값 초기화.
                e.target.value = ''
                if (file) void handleRestoreFromFile(file)
              }}
            />
          </label>
        </div>

        {msg && (
          <p className={`sys-sync-msg sys-sync-msg--${msg.type}`}>
            {msg.text}
          </p>
        )}
      </Card>

      <Card title="안내" className="sys-sync-card">
        <ul className="sys-sync-help">
          <li>이 기능은 사전에 Supabase 프로젝트 + Netlify 환경변수 설정이 필요합니다. <strong>SUPABASE_SETUP.md</strong>를 참고하세요.</li>
          <li>저장 대상 키는 기존 localStorage 키와 동일하며, 저장 후 즉시 다른 브라우저에서 불러올 수 있습니다.</li>
          <li><strong>불러오기는 통째 덮어쓰기가 아니라 안전 병합입니다.</strong> 단지(<code>communityAiProjects</code>)는 단지별로, AI 이력은 항목별로 합쳐지며 같은 항목은 <strong>더 최신(updatedAt) 쪽</strong>이 채택됩니다. 한쪽에만 있는 단지/항목은 보존됩니다. 병합 직전 자동 백업이 다운로드되고 "백업 파일에서 복원"으로 되돌릴 수 있습니다.</li>
          <li><strong>입찰공고·산출표 등 전역 항목은 단지 단위로 나눌 수 없어 로컬을 우선합니다</strong>(로컬이 비어있을 때만 클라우드 값으로 채움). 전역 항목을 다른 기기로 옮기려면, 비어있는 기기에서 불러오거나 한쪽에서 "클라우드에 저장" 후 사용하세요.</li>
          <li>같은 단지/항목을 양쪽에서 동시에 수정한 경우, <code>updatedAt</code>이 더 최신인 쪽이 채택되고 오래된 쪽 변경분은 백업 파일에만 남습니다.</li>
          <li>service role 키는 Netlify Function 내부에서만 사용되며, 브라우저에 절대 노출되지 않습니다.</li>
        </ul>
      </Card>
    </div>
  )
}

export default SystemDataSyncPage
