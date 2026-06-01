import { Handler } from '@netlify/functions'

// HOMEBASE AI 앱 state 수동 동기화 함수.
// 브라우저는 GET으로 클라우드 값을 받아 localStorage에 복원하고, POST로 현재
// localStorage 값을 클라우드에 업서트한다. 자동 동기화는 하지 않는다 — 수동 버튼만.
//
// 라우팅:
//   GET  /.netlify/functions/app-state
//     → { ok: true, items: { state_key: payload, ... }, updatedAt: { state_key: iso }, workspaceId }
//   POST /.netlify/functions/app-state
//     body: { items: Record<state_key, any> }
//     → { ok: true, saved: number, savedKeys: string[] }
//
// 응답 정책:
//   - HTTP status는 의도적으로 거의 항상 200으로 통일. ok 플래그로 분기 (브라우저 단순화).
//   - service role key는 응답·로그·에러 메시지에 절대 노출하지 않는다.
//   - Supabase 외부 응답 본문도 그대로 노출하지 않고 status 숫자만 사용한다.

// 1차 동기화 대상 — 기존 localStorage key와 동일 식별자.
// 화이트리스트로 두어 외부 입력이 임의 key를 만들지 못하게 차단한다.
const ALLOWED_KEYS = new Set<string>([
  'tenderNotices',
  'tenderScheduleEvents',
  'siteLaborCalendarInputs',
  'siteLaborCostData',
  'siteLaborCostSnapshots',
  'aiResultHistory',
  'publishedReports',
  'bidNoticeChecklist',
])

// 기본 작업공간 — schema.sql에서 시드한 행과 동일.
// 후속 단계에서 접근코드 기반 sha256 hash로 교체 예정.
const DEFAULT_WORKSPACE_CODE_HASH = 'default-placeholder-hash'

const handler: Handler = async (event) => {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return json(200, {
      ok: false,
      message: 'Supabase environment variables are not configured',
    })
  }

  let restOrigin: string
  try {
    const u = new URL(supabaseUrl)
    if (u.protocol !== 'https:') throw new Error('protocol')
    restOrigin = u.origin.replace(/\/$/, '')
  } catch {
    return json(200, { ok: false, message: 'Supabase URL format is invalid' })
  }

  const authHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  }

  // 1) 작업공간 ID 조회. 없으면 schema가 적용되지 않은 것으로 안내.
  const workspaceId = await fetchWorkspaceId(restOrigin, authHeaders).catch(() => null)
  if (!workspaceId) {
    return json(200, {
      ok: false,
      message:
        'Default workspace not found. supabase/schema.sql 을 먼저 실행했는지 확인해주세요.',
    })
  }

  if (event.httpMethod === 'GET') {
    return await handleGet(restOrigin, authHeaders, workspaceId)
  }
  if (event.httpMethod === 'POST') {
    return await handlePost(restOrigin, authHeaders, workspaceId, event.body)
  }
  return json(405, { ok: false, message: `Method ${event.httpMethod} not allowed` })
}

const handleGet = async (
  origin: string,
  headers: Record<string, string>,
  workspaceId: string,
) => {
  const url = `${origin}/rest/v1/homebase_app_state?workspace_id=eq.${workspaceId}&select=state_key,payload,version,updated_at`
  try {
    const res = await timedFetch(url, { headers })
    if (!res.ok) {
      return json(200, {
        ok: false,
        message: `Supabase GET failed (status ${res.status})`,
      })
    }
    const rows = (await res.json()) as Array<{
      state_key: string
      payload: unknown
      version: number
      updated_at: string
    }>
    // 화이트리스트 외 key는 무시. 같은 key가 여러 번 들어와도 마지막 값만 사용.
    const items: Record<string, unknown> = {}
    const updatedAt: Record<string, string> = {}
    rows.forEach((r) => {
      if (!ALLOWED_KEYS.has(r.state_key)) return
      items[r.state_key] = r.payload
      updatedAt[r.state_key] = r.updated_at
    })
    return json(200, { ok: true, items, updatedAt, workspaceId })
  } catch (e) {
    return json(200, {
      ok: false,
      message: errorMessage(e, 'Supabase GET error'),
    })
  }
}

const handlePost = async (
  origin: string,
  headers: Record<string, string>,
  workspaceId: string,
  bodyRaw: string | null | undefined,
) => {
  let parsed: { items?: Record<string, unknown> }
  try {
    parsed = JSON.parse(bodyRaw || '{}') as { items?: Record<string, unknown> }
  } catch {
    return json(400, { ok: false, message: 'Body must be valid JSON' })
  }
  const items = parsed.items
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    return json(400, {
      ok: false,
      message: 'Body must include items object: { items: { state_key: payload, ... } }',
    })
  }

  // 화이트리스트 통과한 key만 upsert 대상.
  const rows = Object.entries(items)
    .filter(([k]) => ALLOWED_KEYS.has(k))
    .map(([state_key, payload]) => ({
      workspace_id: workspaceId,
      state_key,
      payload: payload == null ? null : payload,
    }))

  if (rows.length === 0) {
    return json(200, { ok: true, saved: 0, savedKeys: [] })
  }

  // PostgREST upsert: on_conflict + Prefer: resolution=merge-duplicates.
  // unique(workspace_id, state_key) 제약을 사용하므로 같은 (workspace_id, state_key)는 update.
  const url = `${origin}/rest/v1/homebase_app_state?on_conflict=workspace_id,state_key`
  try {
    const res = await timedFetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    })
    if (!res.ok) {
      return json(200, {
        ok: false,
        message: `Supabase upsert failed (status ${res.status})`,
      })
    }
    return json(200, {
      ok: true,
      saved: rows.length,
      savedKeys: rows.map((r) => r.state_key),
    })
  } catch (e) {
    return json(200, {
      ok: false,
      message: errorMessage(e, 'Supabase upsert error'),
    })
  }
}

const fetchWorkspaceId = async (
  origin: string,
  headers: Record<string, string>,
): Promise<string | null> => {
  const url = `${origin}/rest/v1/homebase_workspaces?workspace_code_hash=eq.${encodeURIComponent(
    DEFAULT_WORKSPACE_CODE_HASH,
  )}&select=id&limit=1`
  const res = await timedFetch(url, { headers })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

// 8초 타임아웃 fetch 래퍼.
const timedFetch = async (
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> => {
  const { timeoutMs = 8000, ...rest } = init
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

const errorMessage = (e: unknown, fallback: string) => {
  if (e instanceof Error && e.name === 'AbortError') return 'Supabase request timed out'
  return fallback
}

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
})

export { handler }
