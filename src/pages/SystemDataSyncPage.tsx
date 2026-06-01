import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import Button from '../components/Button'
import './SystemDataSyncPage.css'

// HOMEBASE AI 클라우드 수동 동기화 페이지.
// 기존 localStorage 저장 구조는 그대로 유지하고, "클라우드에 저장" / "클라우드에서 불러오기"
// 두 가지 수동 버튼만 제공한다. 자동 동기화·자동 머지 로직은 의도적으로 미구현.
//
// 동작 요약:
//   - 저장: 화이트리스트 key를 localStorage에서 읽어 JSON으로 정규화한 뒤
//           POST /.netlify/functions/app-state 로 업서트.
//   - 불러오기: GET /.netlify/functions/app-state 호출 결과를 confirm 후
//                localStorage에 덮어쓰고 페이지 새로고침으로 모든 화면 재초기화.
//   - 마지막 저장/불러오기 시각은 별도 localStorage key(syncMeta)에 보존.

// 동기화 대상 — netlify/functions/app-state.ts의 ALLOWED_KEYS와 정확히 동기화 유지.
// 추가/변경 시 양쪽을 동시에 수정한다.
// 그룹화는 UI 표시에만 영향을 주고, 저장/불러오기 로직은 평면화된 key 목록을 사용한다.
const SYNC_GROUPS: { title: string; items: { key: string; label: string }[] }[] = [
  {
    title: '단지/커뮤니티 기본',
    items: [
      // 단지 기본정보·시설·운영·비용·수익·민원·계약·월간리포트 등 핵심 운영 데이터 전부가 이 안에 직렬화되어 들어 있다.
      { key: 'communityAiProjects', label: '단지/커뮤니티 프로젝트 전체' },
    ],
  },
  {
    title: '입찰공고 관리',
    items: [
      { key: 'tenderNotices', label: '입찰공고 목록' },
      { key: 'tenderScheduleEvents', label: '입찰 스케줄러 일정' },
      { key: 'bidNoticeChecklist', label: '공고문 제출서류 체크리스트' },
    ],
  },
  {
    title: '입찰 산출표',
    items: [
      { key: 'estimateSheets', label: '입찰 산출표 시트' },
      { key: 'bidCalculationSnapshots', label: '입찰 산출표 저장본' },
    ],
  },
  {
    title: '현장 인건비',
    items: [
      { key: 'siteLaborCalendarInputs', label: '현장 인건비 근무표' },
      { key: 'siteLaborCostData', label: '현장 인건비 산출 입력값' },
      { key: 'siteLaborCostSnapshots', label: '현장 인건비 저장본' },
      { key: 'siteLaborPayrollDraft', label: '급여 초안 (기타수당/공제액)' },
    ],
  },
  {
    title: '시설 보수 / 입주민 보고서',
    items: [
      { key: 'maintenanceRecords', label: '시설 보수 내역' },
      { key: 'residentNoticeReports', label: '입주민 안내 보고서' },
      { key: 'publishedResidentReports', label: '입주민 공개 발행본' },
    ],
  },
  {
    title: 'AI 결과 이력',
    items: [
      { key: 'aiResultHistory', label: 'AI 결과 이력' },
    ],
  },
]

// 평면화된 key 목록 (저장/불러오기 로직에서 사용).
const SYNC_KEYS: { key: string; label: string }[] = SYNC_GROUPS.flatMap((g) => g.items)

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

const fmtKstIso = (iso: string | undefined): string => {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('ko-KR')
  } catch {
    return iso
  }
}

const SystemDataSyncPage: React.FC = () => {
  const [meta, setMeta] = useState<SyncMeta>(loadMeta)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null)
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
      '현재 브라우저의 데이터가 클라우드 데이터로 덮어써집니다. 계속할까요?',
    )
    if (!confirmed) return
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
        text: `${applied}개 항목을 클라우드에서 불러왔습니다. 새로고침합니다.`,
      })
      // 모든 페이지가 새 localStorage 값으로 초기화되도록 강제 새로고침.
      window.setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      setMsg({
        type: 'err',
        text: '클라우드 불러오기 중 네트워크 오류: ' + (e instanceof Error ? e.message : String(e)),
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
        ⓘ 자동 동기화는 하지 않습니다. 다른 브라우저에서 데이터를 보려면 한쪽에서 "클라우드에 저장" → 다른 쪽에서 "클라우드에서 불러오기" 순서로 진행하세요. <strong>불러오기는 현재 브라우저 데이터를 덮어씁니다.</strong>
      </div>

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
        <div className="sys-sync-meta">
          <div>
            <span>마지막 저장</span>
            <strong>{fmtKstIso(meta.lastSavedAt)}</strong>
          </div>
          <div>
            <span>마지막 불러오기</span>
            <strong>{fmtKstIso(meta.lastLoadedAt)}</strong>
          </div>
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
          <li>현 단계에서는 충돌 자동 해결을 하지 않습니다. 양쪽에서 동시 수정 시 마지막 저장이 최종 값이 됩니다.</li>
          <li>service role 키는 Netlify Function 내부에서만 사용되며, 브라우저에 절대 노출되지 않습니다.</li>
        </ul>
      </Card>
    </div>
  )
}

export default SystemDataSyncPage
