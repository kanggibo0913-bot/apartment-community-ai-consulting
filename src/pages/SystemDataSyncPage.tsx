import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import Button from '../components/Button'
import { SYNC_GROUPS, SYNC_KEY_DEFS } from '../utils/syncKeys'
import './SystemDataSyncPage.css'

// HOMEBASE AI 클라우드 수동 동기화 페이지.
// 기존 localStorage 저장 구조는 그대로 유지하고, "클라우드에 저장" / "클라우드에서 불러오기"
// 두 가지 수동 버튼만 제공한다. 자동 동기화·자동 머지 로직은 의도적으로 미구현.
//
// 동작 요약:
//   - 저장: 화이트리스트 key를 localStorage에서 읽어 JSON으로 정규화한 뒤
//           POST /.netlify/functions/app-state 로 업서트.
//   - 불러오기: 덮어쓰기 전 현재 로컬 데이터를 JSON 백업으로 자동 다운로드(되돌리기 안전망) →
//                GET /.netlify/functions/app-state 호출 결과를 confirm 후
//                localStorage에 덮어쓰고 페이지 새로고침으로 모든 화면 재초기화.
//   - 상태: 페이지 진입 시 클라우드 updated_at을 조회해 로컬 시각과 비교 표시(수동 새로고침 가능).
//   - 마지막 저장/불러오기 시각은 별도 localStorage key(syncMeta)에 보존.
//
// ⚠️ 동기화 대상 key는 src/utils/syncKeys.ts 단일 출처에서 가져온다.
//    netlify/functions/app-state.ts(ALLOWED_KEYS)도 같은 모듈을 import하므로 드리프트가 없다.

// 평면화된 key 목록(라벨 포함) — 저장/불러오기·백업·상태 비교 로직에서 사용.
const SYNC_KEYS = SYNC_KEY_DEFS

const META_KEY = 'systemDataSyncMeta'

interface SyncMeta {
  lastSavedAt?: string // ISO
  lastLoadedAt?: string // ISO
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
}

type VerdictTone = 'ok' | 'warn' | 'info' | 'err'

const SystemDataSyncPage: React.FC = () => {
  const [meta, setMeta] = useState<SyncMeta>(loadMeta)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  // 사용자가 동기화 대상에서 일부 항목을 빼고 싶을 때 사용 (기본 전체 선택).
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    SYNC_KEYS.forEach(({ key }) => (init[key] = true))
    return init
  })

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
  const fetchCloudStatus = useCallback(async () => {
    setStatusBusy(true)
    try {
      const res = await fetch('/.netlify/functions/app-state', { method: 'GET' })
      const data = (await res.json()) as {
        ok: boolean
        items?: Record<string, unknown>
        updatedAt?: Record<string, string>
        message?: string
      }
      if (!data.ok) {
        setCloudStatus({
          available: false,
          message: data.message || '클라우드 상태를 확인할 수 없습니다.',
          cloudLatest: null,
          keyCount: 0,
        })
        return
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
      setCloudStatus({ available: true, cloudLatest: latest || null, keyCount: count })
    } catch (e) {
      setCloudStatus({
        available: false,
        message: '클라우드 상태 확인 중 네트워크 오류: ' + (e instanceof Error ? e.message : String(e)),
        cloudLatest: null,
        keyCount: 0,
      })
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
        text: '이 브라우저에서 클라우드에 저장한 기록이 없습니다. "클라우드에서 불러오기"는 현재 로컬 데이터를 덮어씁니다 — 불러오기 직전 백업이 자동 생성됩니다.',
      }
    }
    const cloudNewer = cloud > lastSaved
    const localNewer = !!localChanged && localChanged > lastSaved
    if (cloudNewer && localNewer) {
      return {
        tone: 'warn',
        text: '⚠️ 충돌 가능성: 이 브라우저의 마지막 저장 이후 로컬과 클라우드가 모두 변경되었습니다. 불러오면 로컬 변경분이 사라질 수 있으니, 먼저 "클라우드에 저장"하거나 백업을 받으세요.',
      }
    }
    if (cloudNewer) {
      return {
        tone: 'info',
        text: '클라우드가 이 브라우저의 마지막 저장 이후 갱신되었습니다(다른 기기에서 저장했을 수 있음). 불러오면 최신 데이터를 받지만, 로컬 미저장 변경은 덮어쓰입니다.',
      }
    }
    if (localNewer) {
      return { tone: 'info', text: '이 브라우저(로컬)가 클라우드보다 최신입니다. "클라우드에 저장"을 권장합니다.' }
    }
    return { tone: 'ok', text: '로컬과 클라우드가 마지막 동기화 기준으로 일치합니다.' }
  }, [cloudStatus, meta])

  const localDataUpdatedAt = useMemo(() => computeLocalDataUpdatedAt(), [cloudStatus, meta])

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
        headers: { 'Content-Type': 'application/json' },
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
        // 저장된 항목이 있을 때만 lastSavedAt 갱신(0건이면 의미 있는 저장이 아니므로 유지).
        if (saved > 0) {
          const now = new Date().toISOString()
          const nextMeta = { ...meta, lastSavedAt: now }
          setMeta(nextMeta)
          saveMeta(nextMeta)
          // 저장 후 클라우드 상태를 다시 조회해 비교 표시를 최신화.
          void fetchCloudStatus()
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
      '현재 브라우저의 데이터가 클라우드 데이터로 덮어써집니다.\n불러오기 직전, 현재 데이터가 백업 파일(JSON)로 자동 다운로드됩니다.\n계속할까요?',
    )
    if (!confirmed) return

    // 되돌릴 수 있도록, 덮어쓰기 전에 현재 로컬 데이터를 백업 파일로 자동 저장한다.
    // 백업 준비에 실패하면 데이터 보호를 위해 불러오기를 중단한다(덮어쓰기 안 함).
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
      const res = await fetch('/.netlify/functions/app-state', { method: 'GET' })
      const data = (await res.json()) as {
        ok: boolean
        items?: Record<string, unknown>
        message?: string
      }
      if (!data.ok) {
        setMsg({ type: 'err', text: data.message || '클라우드 불러오기에 실패했습니다.' })
        setBusy(false)
        return
      }
      const cloudItems = data.items || {}
      let applied = 0
      selectedKeys.forEach((k) => {
        if (k in cloudItems) {
          writeLocalFromPayload(k, cloudItems[k])
          applied += 1
        }
      })
      const now = new Date().toISOString()
      const nextMeta = { ...meta, lastLoadedAt: now }
      saveMeta(nextMeta) // reload 전에 영구화
      setMsg({
        type: 'ok',
        text: `${applied}개 항목을 클라우드에서 불러왔습니다. (백업 파일: ${backupFileName}) 새로고침합니다.`,
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
        ⓘ 자동 동기화는 하지 않습니다. 다른 브라우저에서 데이터를 보려면 한쪽에서 "클라우드에 저장" → 다른 쪽에서 "클라우드에서 불러오기" 순서로 진행하세요. <strong>불러오기는 현재 브라우저 데이터를 덮어쓰며, 덮어쓰기 직전 자동 백업 파일이 다운로드됩니다.</strong>
      </div>

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
            {busy ? '불러오는 중...' : '클라우드에서 불러오기'}
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
          <li><strong>불러오기는 현재 브라우저 데이터를 덮어씁니다.</strong> 덮어쓰기 직전 자동으로 백업 파일이 다운로드되며, "백업 파일에서 복원"으로 되돌릴 수 있습니다.</li>
          <li>현 단계에서는 충돌 자동 해결을 하지 않습니다. 양쪽에서 동시 수정 시 마지막 저장이 최종 값이 됩니다.</li>
          <li>service role 키는 Netlify Function 내부에서만 사용되며, 브라우저에 절대 노출되지 않습니다.</li>
        </ul>
      </Card>
    </div>
  )
}

export default SystemDataSyncPage
